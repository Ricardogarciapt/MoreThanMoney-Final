import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { lerInfoContaCache } from '@/lib/mtmcopy/metaapi-cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * O DESEMPENHO DE UMA CONTA — para o dono, e para o admin.
 *
 * Junta três coisas que vivem em sítios diferentes:
 *
 * · o HISTÓRICO de equity, que o ciclo de leitura guarda de hora a hora nas métricas. É o que
 *   permite mostrar a curva que levou a uma quebra, em vez de anunciar o resultado e pedir
 *   que se acredite.
 * · as POSIÇÕES ABERTAS e a MARGEM, lidas à MetaApi no momento. Estas não se guardam: uma
 *   posição de há uma hora não é informação, é ruído com aparência de informação.
 * · as REGRAS e as margens até cada limite, para a curva se ler contra alguma coisa.
 *
 * A conta é procurada PELO DONO — `.eq('user_id', …)` no mesmo select — excepto quando quem
 * pergunta é admin. Buscar primeiro e verificar depois é onde estas coisas costumam correr mal.
 *
 * Uma falha da MetaApi NÃO faz falhar a resposta: devolve-se o que está guardado e diz-se que
 * a parte ao vivo não respondeu. Um painel em branco por causa de um timeout faz a pessoa
 * pensar que perdeu a conta.
 */
export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  if (!auth) return NextResponse.json({ error: 'Sessão necessária' }, { status: 401 })

  const db = getSupabaseAdmin()
  const { data: userData, error } = await db.auth.getUser(auth)
  if (error || !userData?.user) return NextResponse.json({ error: 'Sessão inválida' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const contaId = String(body?.contaId ?? '').trim()
  if (!contaId) return NextResponse.json({ error: 'contaId em falta' }, { status: 400 })

  const { data: perfil } = await db
    .from('profiles')
    .select('user_type')
    .eq('id', userData.user.id)
    .maybeSingle()
  const admin = String(perfil?.user_type ?? '') === 'admin'

  let consulta = db
    .from('mtm_trading_accounts')
    .select(
      'id, user_id, tipo, mt5_login, servidor, saldo_inicial, estado, metricas, metricas_lidas_em, metaapi_account_id, quebrou_regra, quebrada_em, program_id',
    )
    .eq('id', contaId)
  if (!admin) consulta = consulta.eq('user_id', userData.user.id)

  const { data: conta } = await consulta.maybeSingle()
  // Conta inexistente e conta de outra pessoa dão a MESMA resposta: distingui-las deixava
  // adivinhar que ids existem.
  if (!conta) return NextResponse.json({ error: 'Conta não encontrada' }, { status: 404 })

  const metricas = (conta.metricas ?? {}) as Record<string, unknown>

  const { data: programa } = conta.program_id
    ? await db.from('mtm_funded_programs').select('nome, fases, regras').eq('id', conta.program_id).maybeSingle()
    : { data: null }

  // ── a parte ao vivo ───────────────────────────────────────────────────────
  let posicoes: Array<Record<string, unknown>> = []
  let aoVivo: Record<string, unknown> | null = null
  let avisoVivo: string | null = null

  const token = process.env.METAAPI_TOKEN
  /**
   * Conta MT5 em REPOUSO (undeploy por inactividade, lib/mtmfunded/leitura-mt5-servidor.ts): ler
   * uma conta undeployed estrangula o token inteiro. O dono voltou → pede-se o deploy e mostra-se
   * o guardado; o vigia de 10 min volta a lê-la assim que estiver ligada.
   */
  let emRepouso = false
  const vigia = ((metricas.vigia ?? {}) as { paradaPorNosEm?: string | null })
  if (admin && vigia.paradaPorNosEm) {
    emRepouso = true
    avisoVivo = 'Conta em repouso (undeploy por inactividade). Religa-se quando o dono abrir as métricas ou na varredura diária.'
  } else if (conta.metaapi_account_id && token && conta.estado === 'ativa' && !admin) {
    const { acordarContaDoDono } = await import('@/lib/mtmfunded/leitura-mt5-servidor')
    emRepouso = await acordarContaDoDono(db, conta as { id: string; metaapi_account_id: string | null; metricas: unknown })
    if (emRepouso) avisoVivo = 'A conta estava em repouso por inactividade e está a ser religada (2–5 min). Os números são da última leitura.'
  }
  if (!emRepouso && conta.metaapi_account_id && token && conta.estado === 'ativa') {
    const base = `https://mt-client-api-v1.london.agiliumtrade.ai/users/current/accounts/${conta.metaapi_account_id}`
    const cabecalhos = { 'auth-token': token }
    try {
      // A informação da conta vem da cache de 45 s (o ecrã refresca-se sozinho); as POSIÇÕES
      // continuam sempre ao vivo.
      const [info, abertas] = await Promise.all([
        lerInfoContaCache(String(conta.metaapi_account_id), { regiao: 'london', timeoutMs: 12_000 }),
        fetch(`${base}/positions`, { headers: cabecalhos, cache: 'no-store', signal: AbortSignal.timeout(12_000) }),
      ])

      if (info) {
        const d = info as Record<string, number>
        aoVivo = {
          equity: d.equity,
          saldo: d.balance,
          margemUsada: d.margin ?? null,
          margemLivre: d.freeMargin ?? null,
          nivelMargem: d.marginLevel ?? null,
          alavancagem: d.leverage ?? null,
        }
      }

      if (abertas.ok) {
        const lista = (await abertas.json()) as Array<Record<string, unknown>>
        posicoes = (Array.isArray(lista) ? lista : []).map((p) => ({
          id: p.id,
          simbolo: p.symbol,
          tipo: String(p.type ?? '').replace('POSITION_TYPE_', ''),
          volume: p.volume,
          abertura: p.openPrice,
          atual: p.currentPrice,
          lucro: p.profit,
          stop: p.stopLoss ?? null,
          alvo: p.takeProfit ?? null,
          abertaEm: p.time,
          comentario: p.comment ?? null,
        }))
      }
    } catch {
      // Timeout ou MetaApi em baixo. Devolve-se o guardado — um painel em branco por causa de
      // um timeout faz a pessoa pensar que perdeu a conta.
      avisoVivo = 'Não foi possível ler a conta agora. Os números são da última leitura.'
    }
  }

  return NextResponse.json({
    conta: {
      id: conta.id,
      login: conta.mt5_login,
      servidor: conta.servidor,
      tipo: conta.tipo,
      estado: conta.estado,
      saldoInicial: Number(conta.saldo_inicial ?? 0),
      quebrouRegra: conta.quebrou_regra ?? null,
      quebradaEm: conta.quebrada_em ?? null,
      programa: programa?.nome ?? null,
      fases: programa?.fases ?? null,
    },
    regras: (programa?.regras ?? {}) as Record<string, unknown>,
    metricas,
    historico: Array.isArray(metricas.historico) ? metricas.historico : [],
    lidoEm: conta.metricas_lidas_em ?? metricas.lidoEm ?? null,
    aoVivo,
    posicoes,
    avisoVivo,
  })
}
