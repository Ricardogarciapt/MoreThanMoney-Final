import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { ErroOrdem, autorizarConta } from '@/lib/mtmfunded/simulado/execucao'
import { veredictoDoTipo } from '@/lib/mtmfunded/simulado/travas-tipo'
import { verifyAdminAccess } from '@/lib/admin-api-helpers'

export const dynamic = 'force-dynamic'

/**
 * A REPOSIÇÃO DAS TRAVAS DE UMA CONTA — e a razão de o botão global não estar nas mãos do trader.
 *
 * GET  ?accountId=  → o veredicto actual + as reposições já feitas (o que o modal mostra).
 * POST { accountId, ambito: 'diaria' | 'global', motivo? }
 *
 * ═══ QUEM PODE REPOR O QUÊ, E PORQUÊ ════════════════════════════════════════════════════════
 *
 * `diaria` — o PRÓPRIO trader pode. A trava do dia existe para travar um dia mau, não para fechar a
 * conta: quem a repõe assume, por escrito e com o nome na linha, que quer continuar. E não fica sem
 * rede — abaixo dele continua a perda GLOBAL, que é a que protege o capital. Uma reposição diária não
 * consegue levar a conta além dos 6 %.
 *
 * `global` — só ADMIN. É a recomendação que o dono pediu com o argumento, e o argumento é este: os
 * 6 % são a linha de morte de uma conta financiada. Se quem está a ser medido pode mover a própria
 * linha, a linha deixa de existir — não há nada abaixo dela a apanhá-lo (ao contrário da diária, onde
 * os 6 % ainda apanham). E o que uma prop firm precisa de saber para decidir um pagamento é
 * exactamente «quem rebentou o quê e quantas vezes»: um número que o medido pode reescrever não
 * responde a essa pergunta. Por isso o modal mostra o botão, explica quem o pode carregar, e um
 * pedido de `global` sem admin leva 403 com esse texto — nunca um botão morto sem explicação.
 *
 * ═══ A REPOSIÇÃO NUNCA É SILENCIOSA ═════════════════════════════════════════════════════════
 *
 * Cada reposição grava uma linha em `funded_travas_resets` com quem, quando, a equity e o saldo do
 * momento, a base antes e depois e a perda que estava atingida. Sem a tabela (migração 156 por
 * aplicar) a rota RECUSA em vez de repor sem rasto: um contador reposto sem registo apaga a única
 * informação que a trava produziu.
 *
 * E não toca no `saldo_inicial`: a base da global é `travas_base_global`, uma coluna que só a trava
 * lê. Mover o saldo inicial fazia uma conta a −6 % aparecer a 0 % no cockpit, no admin e na prova.
 */

type Ambito = 'diaria' | 'global'

function falhou(e: unknown) {
  if (e instanceof ErroOrdem) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error('[funded/travas/reset]', e)
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

/** A tabela de auditoria existe? Sem ela não se repõe nada. */
function semAuditoria(erro: { code?: string; message?: string } | null): boolean {
  const t = `${erro?.code ?? ''} ${erro?.message ?? ''}`
  return /42P01|PGRST205|does not exist|schema cache/i.test(t)
}

export async function GET(request: NextRequest) {
  try {
    const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
    const { conta } = await autorizarConta(request, accountId)
    const veredicto = await veredictoDoTipo(conta as Parameters<typeof veredictoDoTipo>[0])
    const { data, error } = await getSupabaseAdmin()
      .from('funded_travas_resets')
      .select('id, ambito, papel, feito_por_email, em, equity_no_momento, base_antes, base_depois, perda_diaria_pct, perda_global_pct, motivo')
      .eq('account_id', accountId)
      .order('em', { ascending: false })
      .limit(50)
    return NextResponse.json({
      veredicto,
      // `auditoria: false` diz ao ecrã para marcar a reposição como NÃO disponível em vez de
      // oferecer um botão que gravaria nada.
      auditoria: !semAuditoria(error),
      reposicoes: data ?? [],
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return falhou(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>
    const accountId = String(b.accountId ?? '')
    const ambito = String(b.ambito ?? '') as Ambito
    if (ambito !== 'diaria' && ambito !== 'global') throw new ErroOrdem(400, 'âmbito inválido (diaria ou global)')

    const { conta, modo } = await autorizarConta(request, accountId)
    if (modo !== 'master') throw new ErroOrdem(403, 'sessão investor — só leitura')

    const admin = await verifyAdminAccess()
    if (ambito === 'global' && !admin.isAdmin) {
      throw new ErroOrdem(
        403,
        'a reposição do limite global (6 %) é de admin. Os 6 % são a linha de morte da conta: se quem ' +
        'está a ser medido pudesse mover a própria linha, deixava de haver linha — e uma prop firm ' +
        'precisa de saber quem rebentou o quê. Pede a reposição e ela fica registada com o nome de quem a fez.',
      )
    }

    const db = getSupabaseAdmin()
    const veredicto = await veredictoDoTipo(conta as Parameters<typeof veredictoDoTipo>[0])
    if (!veredicto.temTrava) throw new ErroOrdem(409, 'esta conta não tem travas deste tipo — não há nada para repor')

    const equity = Number(conta.sim_equity ?? conta.sim_saldo ?? 0)
    const saldo = Number(conta.sim_saldo ?? 0)
    if (!(equity > 0)) throw new ErroOrdem(409, 'sem equity conhecida não se repõe uma trava — tenta daqui a pouco')

    const baseAntes = ambito === 'diaria' ? veredicto.diaria?.base ?? null : veredicto.global?.base ?? null

    // A AUDITORIA PRIMEIRO. Se a linha não grava, a base não se move: uma conta reposta sem registo é
    // exactamente o que esta trava existe para impedir.
    const { error: erroAuditoria } = await db.from('funded_travas_resets').insert({
      account_id: accountId,
      ambito,
      feito_por: admin.userId ?? null,
      feito_por_email: admin.email ?? null,
      papel: admin.isAdmin ? 'admin' : 'dono',
      equity_no_momento: equity,
      saldo_no_momento: saldo,
      base_antes: baseAntes,
      base_depois: equity,
      perda_diaria_pct: veredicto.diaria?.usadoPct ?? null,
      perda_global_pct: veredicto.global?.usadoPct ?? null,
      motivo: b.motivo ? String(b.motivo).slice(0, 300) : null,
    })
    if (erroAuditoria) {
      if (semAuditoria(erroAuditoria)) {
        throw new ErroOrdem(503, 'a auditoria das reposições ainda não está ligada nesta base (migração 156) — e não se repõe uma trava sem registo de quem a repôs')
      }
      throw new ErroOrdem(500, 'não foi possível registar a reposição — a trava fica como está')
    }

    // Só agora se move a base. `diaria` → a âncora do dia passa a ser a equity de agora; `global` →
    // `travas_base_global`, nunca o `saldo_inicial`.
    const patch = ambito === 'diaria' ? { sim_ancora_dia: equity } : { travas_base_global: equity }
    const { error: erroPatch } = await db.from('mtm_trading_accounts').update(patch).eq('id', accountId)
    if (erroPatch) {
      throw new ErroOrdem(
        503,
        ambito === 'global'
          ? 'a coluna da base global ainda não existe nesta base (migração 156) — a reposição ficou registada mas não foi aplicada'
          : 'não foi possível repor a âncora do dia',
      )
    }

    const conta2 = await db.from('mtm_trading_accounts').select('*').eq('id', accountId).maybeSingle()
    return NextResponse.json({
      ok: true,
      ambito,
      baseDepois: equity,
      veredicto: await veredictoDoTipo((conta2.data ?? conta) as Parameters<typeof veredictoDoTipo>[0]),
    })
  } catch (e) {
    return falhou(e)
  }
}
