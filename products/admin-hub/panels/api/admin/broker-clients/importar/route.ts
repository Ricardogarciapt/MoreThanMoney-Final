import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-api-helpers'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { MIN_DEPOSIT } from '@/lib/telegram-broker-gate'
import {
  DIAS_AVISO_FRESCURA,
  DIAS_LIMITE_FRESCURA,
  analisarCsvCorretora,
  avaliarFrescura,
  fundirComGuardados,
  impactoNoAcesso,
  leadsSemCorrespondencia,
  type ClienteGuardado,
} from '@/lib/broker/dados-corretora'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Importar o export de IB da PU Prime — o caminho de 30 segundos.
 *
 * Porque é que isto é uma rota nova e não um retoque na `/ingest`: a `/ingest` recebe JSON já
 * tratado e exige o `CRON_SECRET`, ou seja, obriga a converter o CSV à mão antes de o poder
 * enviar. Foi por isso que só foi usada uma vez, a 2026-07-20, e que os dados ficaram 66 dias
 * parados. Aqui entra o ficheiro como a corretora o dá.
 *
 * O que esta rota NÃO faz, de propósito:
 *  - não apaga ninguém (um export parcial não pode revogar acessos);
 *  - não concede nem revoga acesso a ninguém, nem sequer aos que passam a cumprir a regra. Diz
 *    quem fica diferente e deixa a decisão a uma pessoa. O `/ingest` faz o auto-grant e continua
 *    a existir para isso; quem quiser esse comportamento chama-o explicitamente.
 *
 * Não existe API de depósitos/saldo na PU Prime (a API de IB dá UIDs e contas, não dinheiro), por
 * isso este caminho manual é o caminho. O que se pode fazer é torná-lo barato — e avisar quando
 * envelhece, que é o trabalho do cron `broker-dados-frescura`.
 *
 * POST body (JSON): { csv, source?, simular?, exigirDepositos? }
 * POST body (texto): o CSV em bruto, com `?source=...&simular=1`
 * POST multipart: campo `ficheiro`
 */

const LOTE = 500

async function autorizar(req: NextRequest): Promise<NextResponse | null> {
  const segredo = process.env.CRON_SECRET
  if (segredo && (req.headers.get('authorization') || '') === `Bearer ${segredo}`) return null
  return requireAdmin(req)
}

/** Estado atual: frescura, contagens e os leads cujo UID não casa. Alimenta o painel do admin. */
export async function GET(req: NextRequest) {
  const negado = await autorizar(req)
  if (negado) return negado
  const supabase = getSupabaseAdmin()

  const [{ data: recente }, { count: total }, { data: clientes }, { data: leads }] = await Promise.all([
    supabase.from('broker_clients').select('updated_at').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('broker_clients').select('uid', { count: 'exact', head: true }),
    supabase.from('broker_clients').select('uid, deposits_usd, balance_usd'),
    supabase.from('telegram_leads').select('chat_id, broker_uid, username, first_name, stage').not('broker_uid', 'is', null),
  ])

  const frescura = avaliarFrescura(recente?.updated_at ?? null)
  const lista = clientes ?? []
  const orfaos = leadsSemCorrespondencia(leads ?? [], lista.map((c) => String(c.uid)))

  return NextResponse.json({
    ok: true,
    frescura: { ...frescura, aviso: DIAS_AVISO_FRESCURA, limite: DIAS_LIMITE_FRESCURA, ultimo: recente?.updated_at ?? null },
    clientes: {
      total: total ?? 0,
      // Estas duas contagens são o diagnóstico em duas linhas: com os depósitos a zero, ninguém
      // pode passar o gate, por muitos clientes que a tabela tenha.
      comDeposito: lista.filter((c) => Number(c.deposits_usd ?? 0) > 0).length,
      cumpremORegra: lista.filter(
        (c) => Number(c.deposits_usd ?? 0) >= MIN_DEPOSIT && Number(c.balance_usd ?? 0) >= MIN_DEPOSIT,
      ).length,
    },
    minimo: MIN_DEPOSIT,
    leadsSemCorrespondencia: orfaos.map((o) => ({
      chat_id: o.chat_id,
      broker_uid: o.broker_uid,
      quem: o.username ? `@${String(o.username).replace(/^@/, '')}` : o.first_name || o.chat_id,
      stage: (o as { stage?: string }).stage ?? null,
      aviso: o.aviso,
    })),
  })
}

async function lerCsvDoPedido(req: NextRequest): Promise<{ csv: string; opcoes: Record<string, unknown> }> {
  const tipo = req.headers.get('content-type') || ''
  if (tipo.includes('application/json')) {
    const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
    return { csv: String(b.csv ?? ''), opcoes: b }
  }
  if (tipo.includes('multipart/form-data')) {
    const form = await req.formData()
    const f = form.get('ficheiro')
    const csv = typeof f === 'string' ? f : f ? await (f as File).text() : ''
    return {
      csv,
      opcoes: {
        source: form.get('source') ?? undefined,
        simular: form.get('simular') === '1' || form.get('simular') === 'true',
        exigirDepositos: form.get('exigirDepositos') !== '0',
      },
    }
  }
  const texto = await req.text()
  const q = req.nextUrl.searchParams
  return {
    csv: texto,
    opcoes: { source: q.get('source') ?? undefined, simular: q.get('simular') === '1', exigirDepositos: q.get('exigirDepositos') !== '0' },
  }
}

export async function POST(req: NextRequest) {
  const negado = await autorizar(req)
  if (negado) return negado

  const { csv, opcoes } = await lerCsvDoPedido(req)
  const simular = opcoes.simular === true || opcoes.simular === '1'
  const exigirDepositos = opcoes.exigirDepositos !== false && opcoes.exigirDepositos !== '0'

  const analise = analisarCsvCorretora(csv, { exigirDepositos })
  if (!analise.ok) {
    return NextResponse.json(
      { ok: false, error: analise.erro, cabecalhos: analise.cabecalhos, mapeamento: analise.mapeamento },
      { status: 422 },
    )
  }
  if (!analise.linhas.length) {
    return NextResponse.json({ ok: false, error: 'nenhuma linha válida no ficheiro', ignoradas: analise.ignoradas }, { status: 422 })
  }

  const supabase = getSupabaseAdmin()

  // O que já está guardado (só os UIDs do ficheiro; o resto não é preciso e não se toca nele).
  const uidsDoFicheiro = analise.linhas.map((l) => l.uid)
  const guardados: ClienteGuardado[] = []
  for (let i = 0; i < uidsDoFicheiro.length; i += LOTE) {
    const { data, error } = await supabase
      .from('broker_clients')
      .select('uid, first_name, last_name, email, deposits_usd, balance_usd')
      .in('uid', uidsDoFicheiro.slice(i, i + LOTE))
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    guardados.push(...((data ?? []) as ClienteGuardado[]))
  }

  const fusao = fundirComGuardados(analise.linhas, guardados)

  // O aviso antes de gravar: quem é que fica diferente por causa deste ficheiro. Do outro lado
  // destes nomes há pessoas com acesso a grupos pagos, por isso o número aparece ANTES da
  // escrita e a concessão/revogação continua a ser decisão de uma pessoa.
  const { data: leads } = await supabase
    .from('telegram_leads')
    .select('chat_id, broker_uid, username, first_name')
    .eq('stage', 'granted')
    .not('broker_uid', 'is', null)
  const impacto = impactoNoAcesso(leads ?? [], fusao.paraGravar, { revogacao: 300, validacao: MIN_DEPOSIT })

  const resumo = {
    ok: true,
    simulado: simular,
    separador: analise.separador,
    cabecalhos: analise.cabecalhos,
    mapeamento: analise.mapeamento,
    lidas: analise.linhas.length,
    novos: fusao.novos,
    alterados: fusao.alterados,
    iguais: fusao.iguais,
    ignoradas: analise.ignoradas,
    duplicados: analise.duplicados,
    // Ficam como estão. Está aqui para se ver que um export parcial não apaga nada.
    naoVeioNoFicheiro: fusao.ausentesDoFicheiro.length,
    exemplosAlterados: fusao.paraGravar
      .filter((l) => l.estado === 'alterado')
      .slice(0, 15)
      .map((l) => ({ uid: l.uid, alteracoes: l.alteracoes })),
    impacto,
    minimo: MIN_DEPOSIT,
  }

  if (simular) return NextResponse.json({ ...resumo, gravadas: 0 })

  // Grava-se TUDO o que veio no ficheiro, mesmo o que não mudou: o `updated_at` de cada linha é a
  // prova de frescura que o `broker-gate-renew` lê. Saltar as linhas iguais deixaria metade da
  // tabela a envelhecer e a cair em grace sem razão.
  const agora = new Date().toISOString()
  const fonte = String(opcoes.source ?? `puprime_import_${agora.slice(0, 10)}`)
  let gravadas = 0
  for (let i = 0; i < fusao.paraGravar.length; i += LOTE) {
    const lote = fusao.paraGravar.slice(i, i + LOTE).map((l) => ({
      uid: l.uid,
      first_name: l.first_name,
      last_name: l.last_name,
      email: l.email,
      deposits_usd: l.deposits_usd,
      balance_usd: l.balance_usd,
      source: fonte,
      updated_at: agora,
    }))
    const { error } = await supabase.from('broker_clients').upsert(lote, { onConflict: 'uid' })
    if (error) return NextResponse.json({ ...resumo, ok: false, error: error.message, gravadas }, { status: 500 })
    gravadas += lote.length
  }

  return NextResponse.json({ ...resumo, gravadas, source: fonte })
}
