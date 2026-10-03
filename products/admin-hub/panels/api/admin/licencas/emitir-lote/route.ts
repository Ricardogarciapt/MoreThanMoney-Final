import { NextRequest, NextResponse } from 'next/server'
import { verifyAdminAccess, getSupabaseAdmin } from '@/lib/admin-api-helpers'
import { carregarDireitos } from '@/lib/entitlements'
import {
  PRODUTO_EA,
  emitirLicenca,
  temDireitoAIncluida,
} from '@/lib/licencas'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Emite a licença incluída para todos os membros que têm direito e ainda não a têm.
 *
 * Existe como rotina repetível, e não como script corrido uma vez, porque entram membros novos
 * todas as semanas: quem chega a Premium amanhã precisa da mesma licença, e alguém teria de se
 * lembrar de correr o script outra vez.
 *
 * O direito é decidido pelo `carregarDireitos()` de cada utilizador, um a um — não por uma
 * consulta SQL que imite a regra. A regra tem casos que o SQL não vê sem a repetir (o Fundador é
 * Premium com outro nome; a categoria não se apaga quando a subscrição acaba), e uma imitação
 * dava licenças a quem já não paga.
 *
 * `dryRun` vem LIGADO por defeito. Isto escreve na conta de dezenas de clientes; ver a lista
 * antes de a criar é barato, e desfazer depois não é.
 */

/** Quantos utilizadores se avaliam ao mesmo tempo. Acima disto começa a pesar na base de dados. */
const LOTE = 10

interface Resultado {
  userId: string
  email: string | null
  nome: string | null
  motivo: 'admin' | 'vip' | 'premium'
  chave?: string
  erro?: string
}

export async function POST(req: NextRequest) {
  const { isAdmin, error } = await verifyAdminAccess()
  if (!isAdmin) return NextResponse.json({ error: error || 'Sem permissões' }, { status: 403 })

  const body = (await req.json().catch(() => ({}))) as { dryRun?: unknown }
  const dryRun = body.dryRun !== false

  const db = getSupabaseAdmin()

  const { data: perfis, error: erroPerfis } = await db
    .from('profiles')
    .select('id, email, full_name')
    .order('created_at', { ascending: true })
  if (erroPerfis) return NextResponse.json({ error: erroPerfis.message }, { status: 500 })

  // Quem já tem uma licença activa deste produto — de QUALQUER plano, não só 'incluida'. Quem
  // comprou uma vitalícia não precisa de uma incluída por cima, e a segunda passaria à frente da
  // primeira no cartão da área de membro, que mostra a mais recente. Uma leitura só: perguntar
  // por utilizador seria uma consulta por pessoa para responder à mesma pergunta.
  const { data: existentes } = await db
    .from('licencas')
    .select('user_id')
    // SÓ do AllInOne, e de propósito: a emissão em lote existe porque essa EA está incluída em
    // Premium/VIP. A Scalp Edition não está incluída em plano nenhum — quem a quer, compra — e
    // por isso não há aqui nada para emitir a ninguém. Se um dia isso mudar, muda-se esta linha
    // E o `emitirLicenca` lá em baixo; mudar só uma delas emitia chaves do produto errado.
    .eq('produto', PRODUTO_EA)
    .eq('estado', 'ativa')
    .not('user_id', 'is', null)
  const jaTem = new Set((existentes ?? []).map((l) => l.user_id as string))

  const emitidas: Resultado[] = []
  const porEmitir: Resultado[] = []
  let semDireito = 0
  let jaTinham = 0

  const candidatos = (perfis ?? []).filter((p) => !jaTem.has(p.id))
  jaTinham = (perfis ?? []).length - candidatos.length

  for (let i = 0; i < candidatos.length; i += LOTE) {
    const fatia = candidatos.slice(i, i + LOTE)
    const direitos = await Promise.all(
      fatia.map((p) => carregarDireitos(p.id).catch(() => null)),
    )

    for (let j = 0; j < fatia.length; j++) {
      const p = fatia[j]
      const d = direitos[j]
      if (!d || !temDireitoAIncluida(d)) {
        semDireito++
        continue
      }

      const linha: Resultado = {
        userId: p.id,
        email: p.email ?? null,
        nome: p.full_name ?? null,
        motivo: d.admin ? 'admin' : d.vip ? 'vip' : 'premium',
      }

      if (dryRun) {
        porEmitir.push(linha)
        continue
      }

      try {
        // Sem `mt5Login`: em lote não há como saber a conta de cada um. Com uma conta permitida,
        // a validação prende a licença à primeira conta onde o EA arrancar — que é exactamente o
        // que o cliente quer, e poupa-lhe o passo de a ir escrever ao site.
        const lic = await emitirLicenca({
          userId: p.id,
          email: p.email ?? null,
          plano: 'incluida',
          origem: 'admin',
          contasPermitidas: 1,
          notas: `Emitida em lote (${linha.motivo})`,
        })
        emitidas.push({ ...linha, chave: lic.chave })
      } catch (e) {
        emitidas.push({ ...linha, erro: e instanceof Error ? e.message : 'erro' })
      }
    }
  }

  return NextResponse.json({
    dryRun,
    perfis: (perfis ?? []).length,
    jaTinham,
    semDireito,
    elegiveis: dryRun ? porEmitir.length : emitidas.length,
    lista: dryRun ? porEmitir : emitidas,
  })
}
