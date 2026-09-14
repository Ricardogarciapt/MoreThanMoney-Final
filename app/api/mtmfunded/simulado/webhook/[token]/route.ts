import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { interpretarAlerta, candidatosDeTicker } from '@/lib/mtmfunded/simulado/ordens'
import {
  ErroOrdem, lerConta, exigirNegociavel, abrirPosicao, criarPendente, fecharTodasDoSimbolo, sincronizarAlvo,
} from '@/lib/mtmfunded/simulado/execucao'

export const dynamic = 'force-dynamic'

/**
 * TRADINGVIEW → CONTA SIMULADA.
 *
 * POST /api/mtmfunded/simulado/webhook/<token> — corpo JSON (ou texto com JSON) de um alerta.
 * Formatos em `interpretarAlerta` (lib/mtmfunded/simulado/ordens). Acções:
 *   buy/sell  → abre a mercado, ou pendente com tipo limit/stop + preco
 *   close     → fecha todas as posições desse símbolo
 *   position_size (estratégia) → leva a posição líquida ao alvo
 *
 * O token vale como password master: executa pelas MESMAS funções do WebTrader (margem, regras,
 * preço fresco), nunca por um atalho. Travões na própria linha do webhook, porque as instâncias
 * serverless não partilham memória: o mesmo corpo em 5 s é ignorado (o TradingView repete envios
 * quando demora a resposta) e mais de 30 pedidos por minuto dá 429 (um alerta em loop numa vela
 * de 1 s não pode inundar a conta).
 */

const DEDUP_MS = 5_000
const JANELA_MS = 60_000
const MAX_POR_JANELA = 30

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

export async function POST(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const db = getSupabaseAdmin()
  if (!token || token.length < 20) return NextResponse.json({ error: 'webhook inválido' }, { status: 404 })

  const { data: hook } = await db.from('funded_webhooks').select('*').eq('token_hash', sha256(token)).maybeSingle()
  if (!hook || !hook.ativo) return NextResponse.json({ error: 'webhook inválido ou desligado' }, { status: 404 })

  const texto = (await request.text().catch(() => '')).slice(0, 10_000)
  const hashCorpo = sha256(texto)
  const agora = Date.now()

  if (hook.ultimo_hash === hashCorpo && hook.ultimo_em && agora - new Date(hook.ultimo_em as string).getTime() < DEDUP_MS) {
    return NextResponse.json({ ok: true, ignorado: 'duplicado (mesmo alerta em menos de 5 s)' })
  }
  const inicio = hook.janela_inicio ? new Date(hook.janela_inicio as string).getTime() : 0
  const naJanela = agora - inicio < JANELA_MS
  const contagem = naJanela ? Number(hook.janela_contagem ?? 0) : 0
  if (contagem >= MAX_POR_JANELA) {
    return NextResponse.json({ error: `limite de ${MAX_POR_JANELA} alertas por minuto` }, { status: 429 })
  }
  // Reclama o pedido ANTES de executar, com guarda otimista na contagem: dois envios iguais em
  // simultâneo não passam os dois pela deduplicação.
  const { data: reclamado } = await db.from('funded_webhooks').update({
    ultimo_hash: hashCorpo, ultimo_em: new Date(agora).toISOString(),
    janela_inicio: naJanela ? hook.janela_inicio : new Date(agora).toISOString(),
    janela_contagem: contagem + 1,
  }).eq('id', hook.id).eq('janela_contagem', Number(hook.janela_contagem ?? 0)).select('id')
  if (!reclamado?.length) return NextResponse.json({ ok: true, ignorado: 'pedido concorrente — repete se necessário' }, { status: 409 })

  const registar = async (resultado: unknown, erro: string | null) => {
    await db.from('funded_webhooks').update({ ultimo_resultado: resultado as object, ultimo_erro: erro }).eq('id', hook.id)
  }

  try {
    const alerta = interpretarAlerta(texto)
    if (!alerta.ok) throw new ErroOrdem(400, alerta.erro)

    const conta = await lerConta(String(hook.account_id))
    if (!conta || conta.motor !== 'sim') throw new ErroOrdem(404, 'conta não encontrada')
    exigirNegociavel(conta, 'master')

    // O ticker do TradingView → o nosso símbolo: o primeiro candidato que existe no catálogo.
    const candidatos = candidatosDeTicker(alerta.ticker)
    const { data: existentes } = await db.from('funded_symbols').select('symbol').in('symbol', candidatos).eq('ativo', true)
    const conhecidos = new Set((existentes ?? []).map((s) => String(s.symbol)))
    const symbol = candidatos.find((c) => conhecidos.has(c))
    if (!symbol) throw new ErroOrdem(422, `símbolo «${alerta.ticker}» não existe no MTM Funded`)

    let resultado: unknown
    if (alerta.acao === 'close') resultado = await fecharTodasDoSimbolo(conta, symbol)
    else if (alerta.acao === 'sync') resultado = await sincronizarAlvo(conta, symbol, alerta.alvo ?? 0, { sl: alerta.sl, tp: alerta.tp, origem: 'manual', ideiaRef: 'tradingview' })
    else if (alerta.tipo !== 'market') {
      resultado = await criarPendente(conta, {
        symbol, direcao: alerta.acao, tipo: alerta.tipo, volume: alerta.volume ?? 0, preco: alerta.preco ?? 0,
        sl: alerta.sl, tp: alerta.tp, origem: 'manual', ideiaRef: 'tradingview',
      })
    } else {
      resultado = await abrirPosicao(conta, {
        symbol, direcao: alerta.acao, volume: alerta.volume ?? 0, sl: alerta.sl, tp: alerta.tp, origem: 'manual', ideiaRef: 'tradingview',
      })
    }
    const resumo = { acao: alerta.acao, symbol, em: new Date().toISOString() }
    await registar(resumo, null)
    return NextResponse.json({ ok: true, ...resumo, resultado })
  } catch (e) {
    const status = e instanceof ErroOrdem ? e.status : 500
    const mensagem = e instanceof ErroOrdem ? e.message : 'erro interno'
    if (!(e instanceof ErroOrdem)) console.error('[funded/webhook]', e)
    await registar({ corpo: texto.slice(0, 500), em: new Date().toISOString() }, mensagem)
    return NextResponse.json({ error: mensagem }, { status })
  }
}
