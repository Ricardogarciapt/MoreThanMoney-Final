/**
 * RELATÓRIOS de vendas: por pack, por pessoa, por equipa, por mês — e o funil.
 *
 * Tudo se calcula sobre `vendas_vendas` (pagamentos confirmados) e `vendas_comissoes`, nunca sobre
 * o estado dos negócios: um pipeline cheio de 'ganho' não é receita. A única coisa que se lê do
 * pipeline é o FUNIL, que é a pergunta oposta — onde é que as pessoas se perdem.
 *
 * Tudo líquido de estornos, e com o estornado à vista ao lado. Um relatório que conta vendas
 * devolvidas como receita faz decidir contratações sobre dinheiro que voltou para o cliente.
 *
 * Agrega-se em memória de propósito: são centenas de linhas, não milhões, e uma vista SQL por cada
 * corte que o dono queira ver é uma migração por cada pergunta nova.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { PAPEIS_VENDAS, centimosEmEuros, type PapelVendas } from '@/lib/vendas/calculo'

const supabase = getSupabaseAdmin()

const COLUNA_DO_PAPEL: Record<PapelVendas, string> = {
  prospector: 'prospector_id',
  setter: 'setter_id',
  closer: 'closer_id',
  team_leader: 'team_leader_id',
  afiliado: 'afiliado_id',
}

type Balde = { vendas: number; valor_cents: number; estornado_cents: number }
const balde = (): Balde => ({ vendas: 0, valor_cents: 0, estornado_cents: 0 })

function somar(mapa: Map<string, Balde>, chave: string, valor: number, estornada: boolean) {
  const b = mapa.get(chave) ?? balde()
  if (estornada) b.estornado_cents += valor
  else {
    b.vendas += 1
    b.valor_cents += valor
  }
  mapa.set(chave, b)
}

function emLista(mapa: Map<string, Balde>) {
  return [...mapa.entries()]
    .map(([chave, b]) => ({ chave, ...b, valor: centimosEmEuros(b.valor_cents) }))
    .sort((a, b) => b.valor_cents - a.valor_cents)
}

export async function GET(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin) return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })

  const { searchParams } = new URL(request.url)
  // 90 dias por defeito: é o horizonte em que o dono decide (campanhas, contratações), e evita que
  // o primeiro carregamento arraste o histórico inteiro.
  const desde = searchParams.get('desde') ?? new Date(Date.now() - 90 * 86_400_000).toISOString()
  const ate = searchParams.get('ate') ?? new Date().toISOString()

  const [{ data: vendas, error: erroVendas }, { data: comissoes }, { data: negocios }] = await Promise.all([
    supabase
      .from('vendas_vendas')
      .select('id, negocio_id, pack, valor_cents, tipo, pago_em, estornada_em, fonte')
      .gte('pago_em', desde)
      .lte('pago_em', ate)
      .limit(5000),
    supabase
      .from('vendas_comissoes')
      .select('id, beneficiario_id, papel, valor_cents, estado, paga_em, estornada_em, criado_em, negocio_id')
      .gte('criado_em', desde)
      .lte('criado_em', ate)
      .limit(5000),
    supabase
      .from('vendas_negocios')
      .select('id, estado, criado_em, fechado_em, prospector_id, setter_id, closer_id, team_leader_id, afiliado_id')
      .limit(5000),
  ])

  if (erroVendas) return NextResponse.json({ error: erroVendas.message }, { status: 500 })

  const negocioPorId = new Map<string, Record<string, unknown>>()
  for (const n of negocios ?? []) negocioPorId.set(String((n as { id: string }).id), n as unknown as Record<string, unknown>)

  const porPack = new Map<string, Balde>()
  const porMes = new Map<string, Balde>()
  const porTipo = new Map<string, Balde>()
  const porFonte = new Map<string, Balde>()
  // Vendas atribuídas a cada pessoa, por papel — «quantas fechou o Pedro» é a pergunta de sempre.
  const porPessoaPapel = new Map<string, Balde>()
  const porEquipa = new Map<string, Balde>()

  let total = balde()
  let semEquipa = balde()

  for (const bruta of vendas ?? []) {
    const v = bruta as unknown as Record<string, unknown>
    const valor = Number(v.valor_cents) || 0
    const estornada = !!v.estornada_em
    const mes = String(v.pago_em).slice(0, 7)

    somar(porPack, String(v.pack ?? '(sem pack)'), valor, estornada)
    somar(porMes, mes, valor, estornada)
    somar(porTipo, String(v.tipo), valor, estornada)
    somar(porFonte, String(v.fonte), valor, estornada)
    if (estornada) total.estornado_cents += valor
    else {
      total.vendas += 1
      total.valor_cents += valor
    }

    const negocio = v.negocio_id ? negocioPorId.get(String(v.negocio_id)) : null
    if (!negocio) {
      if (estornada) semEquipa.estornado_cents += valor
      else {
        semEquipa.vendas += 1
        semEquipa.valor_cents += valor
      }
      continue
    }

    for (const papel of PAPEIS_VENDAS) {
      const pessoa = negocio[COLUNA_DO_PAPEL[papel]]
      if (typeof pessoa === 'string' && pessoa) somar(porPessoaPapel, `${papel}|${pessoa}`, valor, estornada)
    }
    const lider = negocio.team_leader_id
    somar(porEquipa, typeof lider === 'string' && lider ? lider : '(sem team leader)', valor, estornada)
  }

  // Comissões: o custo de vendas, por pessoa e por estado.
  const comissoesPorPessoa = new Map<string, { ganho_cents: number; pago_cents: number; por_pagar_cents: number; a_descontar_cents: number }>()
  let custoTotal = 0
  let porPagarTotal = 0
  for (const c of comissoes ?? []) {
    const pessoa = String(c.beneficiario_id)
    const valor = Number(c.valor_cents) || 0
    const estado = String(c.estado)
    const paga = !!c.paga_em || estado === 'paga'
    const estornada = !!c.estornada_em
    if (estado === 'cancelada' || (estornada && !paga)) continue

    const b = comissoesPorPessoa.get(pessoa) ?? { ganho_cents: 0, pago_cents: 0, por_pagar_cents: 0, a_descontar_cents: 0 }
    b.ganho_cents += valor
    if (paga) {
      b.pago_cents += valor
      if (estornada) b.a_descontar_cents += valor
    } else {
      b.por_pagar_cents += valor
      porPagarTotal += valor
    }
    custoTotal += valor
    comissoesPorPessoa.set(pessoa, b)
  }

  // O FUNIL, e a queda entre andares. A contagem por estado diz quantos estão em cada sítio; a
  // queda diz onde se perdem — e é a queda que decide o que a equipa faz a seguir.
  const ordem = ['lead', 'contactado', 'qualificado', 'marcado', 'apresentado', 'ganho'] as const
  const porEstado: Record<string, number> = { no_show: 0, perdido: 0 }
  for (const e of ordem) porEstado[e] = 0
  for (const n of negocios ?? []) {
    const estado = String((n as { estado: string }).estado)
    porEstado[estado] = (porEstado[estado] ?? 0) + 1
  }
  // Andar cumulativo: quem está em 'ganho' também passou por 'marcado'. Sem isto, um pipeline
  // saudável (tudo no fim) parecia um funil vazio no início.
  const cumulativo = ordem.map((_, i) => ordem.slice(i).reduce((t, e) => t + (porEstado[e] ?? 0), 0))
  const andares = ordem.map((nome, i) => ({
    nome,
    n: cumulativo[i],
    passou: i === 0 ? null : cumulativo[i - 1] > 0 ? Math.round((cumulativo[i] / cumulativo[i - 1]) * 100) : null,
  }))

  // Nomes, para o relatório se poder ler. Uma tabela de uuids não se lê.
  const pessoas = new Set<string>()
  for (const chave of porPessoaPapel.keys()) pessoas.add(chave.split('|')[1])
  for (const p of comissoesPorPessoa.keys()) pessoas.add(p)
  for (const chave of porEquipa.keys()) if (chave !== '(sem team leader)') pessoas.add(chave)
  const { data: perfis } = pessoas.size
    ? await supabase.from('profiles').select('id, username, full_name').in('id', [...pessoas])
    : { data: [] as Array<{ id: string; username: string | null; full_name: string | null }> }
  const nomes: Record<string, string> = {}
  for (const p of perfis ?? []) nomes[String(p.id)] = p.full_name || p.username || String(p.id).slice(0, 8)

  return NextResponse.json({
    periodo: { desde, ate },
    total: { ...total, valor: centimosEmEuros(total.valor_cents), estornado: centimosEmEuros(total.estornado_cents) },
    /** Vendas que entraram sem ninguém da equipa atribuído — as que o MLM binário paga. */
    semEquipa: { ...semEquipa, valor: centimosEmEuros(semEquipa.valor_cents) },
    custoDeVendas: {
      total_cents: custoTotal,
      total: centimosEmEuros(custoTotal),
      por_pagar_cents: porPagarTotal,
      por_pagar: centimosEmEuros(porPagarTotal),
      /** Quanto por cento da receita do período foi para comissões. A conta que decide se fecha. */
      pct_da_receita: total.valor_cents > 0 ? Math.round((custoTotal / total.valor_cents) * 1000) / 10 : null,
    },
    porPack: emLista(porPack),
    porMes: emLista(porMes).sort((a, b) => a.chave.localeCompare(b.chave)),
    porTipo: emLista(porTipo),
    porFonte: emLista(porFonte),
    porPessoa: [...porPessoaPapel.entries()]
      .map(([chave, b]) => {
        const [papel, pessoa] = chave.split('|')
        const com = comissoesPorPessoa.get(pessoa)
        return {
          pessoa,
          nome: nomes[pessoa] ?? pessoa.slice(0, 8),
          papel,
          vendas: b.vendas,
          valor_cents: b.valor_cents,
          valor: centimosEmEuros(b.valor_cents),
          estornado_cents: b.estornado_cents,
          comissoes: com
            ? {
                ...com,
                ganho: centimosEmEuros(com.ganho_cents),
                por_pagar: centimosEmEuros(com.por_pagar_cents),
                a_descontar: centimosEmEuros(com.a_descontar_cents),
              }
            : null,
        }
      })
      .sort((a, b) => b.valor_cents - a.valor_cents),
    porEquipa: emLista(porEquipa).map((e) => ({ ...e, nome: nomes[e.chave] ?? e.chave })),
    funil: { porEstado, andares },
  })
}
