import { NextRequest, NextResponse } from 'next/server'
import { userIdDoPedido } from '@/lib/sessao-do-pedido'
import { isIosAppRequest } from '@/lib/is-native-request'
import { autorizarMt5, resolverAdaptadorComDono } from '@/lib/webtrader/contas'
import { gestaoAutoAoLerPosicoes, guardarGestaoAuto } from '@/lib/webtrader/gestao-auto-servidor'
import { ligarContaMt5 } from '@/lib/webtrader/corretoras/mt5'
import { lerRefConta } from '@/lib/webtrader/corretoras/regras'
import { entrarMt5, entrarTradeLocker } from '@/lib/webtrader/entrar'
import { plataformaValida } from '@/lib/webtrader/corretoras/regras'
import { ErroCorretora, type PlataformaWT } from '@/lib/webtrader/corretoras/tipos'

export const dynamic = 'force-dynamic'
// Criar uma conta MetaApi nova espera o deploy + ligação à corretora (até ~2 min).
export const maxDuration = 120

/**
 * O WEBTRADER DAS TRÊS PLATAFORMAS — uma rota, um adaptador (lib/webtrader/corretoras).
 *
 *   GET  /api/webtrader/{mtmfunded|tradelocker|mt5}/{conta|posicoes|ordens|historico|simbolos|preco}?conta=<ref>[&q=][&symbol=][&dias=]
 *   POST /api/webtrader/{plataforma}/ordem      { conta, symbol, direcao, tipo, volume, preco?, sl?, tp? }
 *   POST /api/webtrader/{plataforma}/modificar  { conta, alvo: posicao|ordem, id, sl?, tp?, preco? }
 *   POST /api/webtrader/{plataforma}/fechar     { conta, positionId, volume? }
 *   POST /api/webtrader/{plataforma}/cancelar   { conta, orderId }
 *   POST /api/webtrader/{tradelocker|mt5}/gestao-auto { conta, positionId, digits, gestao } — Auto BE /
 *        trailing de uma posição de corretora (executado em lib/webtrader/gestao-auto-servidor.ts)
 *   POST /api/webtrader/mt5/ligar            { conta } — deploy EXPLÍCITO de uma conta desligada (botão «Ligar conta»)
 *   POST /api/webtrader/{tradelocker|mt5}/entrar  (login com credenciais; MTM Funded usa /api/mtmfunded/simulado/entrar)
 *
 * Em TODOS os pedidos: sessão MTM (ou sessão da conta MTM Funded) e verificação do dono no servidor.
 * Contas TradeLocker abertas por sessão do WebTrader mandam o token em `x-webtrader-tl`.
 * Erros: { error, code? } com o estado HTTP da corretora (402 = quota MetaApi → caminho do upgrade).
 */

type Params = { params: Promise<{ plataforma: string; acao: string }> }

function falhou(e: unknown) {
  if (e instanceof ErroCorretora) {
    return NextResponse.json({ error: e.message, code: e.codigo, ...(e.extra ?? {}) }, { status: e.status })
  }
  // Nunca o corpo do pedido nos logs (pode trazer a password).
  console.error('[webtrader]', e instanceof Error ? e.message : 'erro desconhecido')
  return NextResponse.json({ error: 'erro interno' }, { status: 500 })
}

async function plataformaDe(params: Params['params']): Promise<{ plataforma: PlataformaWT; acao: string }> {
  const { plataforma, acao } = await params
  const p = plataformaValida(plataforma)
  if (!p) throw new ErroCorretora(404, 'plataforma desconhecida')
  return { plataforma: p, acao }
}

export async function GET(request: NextRequest, { params }: Params) {
  try {
    const { plataforma, acao } = await plataformaDe(params)
    const sp = request.nextUrl.searchParams
    const { adaptador: a, userId } = await resolverAdaptadorComDono(request, plataforma, sp.get('conta'))
    let dados: unknown
    switch (acao) {
      case 'conta':
        dados = { conta: await a.conta(), plataforma: a.plataforma, real: a.real, podeNegociar: a.podeNegociar, capacidades: a.capacidades }
        break
      case 'posicoes': {
        // Posições e pendentes numa só ida: é o que o ecrã refresca.
        const [posicoes, ordens] = await Promise.all([a.posicoes(), a.ordens()])
        // A gestão automática (Auto BE / trailing) das contas de corretora corre AQUI, à conta destas
        // posições que já foram lidas: é o que lhe dá reacção a segundos enquanto o separador está
        // aberto. A cron de 1 min é a rede quando ele se fecha. Nunca falha a leitura por causa disto.
        const gestaoAuto = await gestaoAutoAoLerPosicoes(a, { userId, contaRef: String(sp.get('conta') ?? '') }, posicoes)
        dados = { posicoes, ordens, gestaoAuto }
        break
      }
      case 'ordens':
        dados = { ordens: await a.ordens() }
        break
      case 'historico':
        dados = { historico: await a.historico(Number(sp.get('dias') ?? 30) || 30) }
        break
      case 'simbolos':
        dados = { simbolos: await a.simbolos(sp.get('q') ?? '') }
        break
      case 'preco': {
        const symbol = String(sp.get('symbol') ?? '').toUpperCase()
        if (!/^[A-Z0-9._#+-]{2,24}$/.test(symbol)) throw new ErroCorretora(400, 'símbolo inválido')
        dados = { preco: await a.preco(symbol) }
        break
      }
      default:
        throw new ErroCorretora(404, 'acção desconhecida')
    }
    return NextResponse.json(dados, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    return falhou(e)
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { plataforma, acao } = await plataformaDe(params)
    const b = (await request.json().catch(() => ({}))) as Record<string, unknown>

    if (acao === 'entrar') {
      const userId = await userIdDoPedido(request)
      if (!userId) throw new ErroCorretora(401, 'Entra com a tua conta MTM para abrir contas reais no WebTrader.')
      if (plataforma === 'tradelocker') return NextResponse.json(await entrarTradeLocker(userId, b))
      if (plataforma === 'mt5') return NextResponse.json(await entrarMt5(userId, b, { compraPermitida: !isIosAppRequest(request) }))
      throw new ErroCorretora(400, 'Contas MTM Funded entram em /api/mtmfunded/simulado/entrar.')
    }

    if (acao === 'ligar') {
      // Só por clique do utilizador, com dono + quota verificados. Abrir a página nunca faz deploy.
      const ref = lerRefConta('mt5', b.conta)
      if (plataforma !== 'mt5' || !ref || ref.plataforma !== 'mt5') throw new ErroCorretora(400, 'conta inválida')
      const userId = await userIdDoPedido(request)
      if (!userId) throw new ErroCorretora(401, 'Sem sessão.')
      const { accountId, token } = await autorizarMt5(userId, ref.origem, ref.id)
      return NextResponse.json(await ligarContaMt5(accountId, token.token))
    }

    const { adaptador: a, userId: dono } = await resolverAdaptadorComDono(request, plataforma, b.conta)
    const numero = (v: unknown) => (v == null || v === '' ? null : Number(v))
    switch (acao) {
      case 'gestao-auto': {
        /**
         * Liga/desliga o Auto BE e o Auto Trailing de UMA posição de corretora — o que antes só ficava
         * no localStorage e nunca era executado por ninguém. Gravar aqui é o que autoriza o executor a
         * mexer no SL desta posição; sem isto, ele não toca em nada.
         *
         * As contas MTM Funded NÃO passam por aqui de propósito: a gestão delas já vive em
         * funded_positions e é o motor do VPS que a corre a cada tick (/api/mtmfunded/simulado/ordens,
         * acção `gestao`). Dois motores a mexer no mesmo SL era pior do que um motor a menos.
         */
        if (plataforma === 'mtmfunded') throw new ErroCorretora(400, 'A gestão das contas MTM Funded grava-se em /api/mtmfunded/simulado/ordens (acção gestao).')
        if (!dono) throw new ErroCorretora(401, 'Sem sessão.')
        if (!a.podeNegociar) throw new ErroCorretora(403, 'Esta conta está só em leitura no WebTrader.')
        const id = String(b.positionId ?? '')
        if (!id || id.length > 64) throw new ErroCorretora(400, 'posição inválida')
        const pedido = (b.gestao ?? {}) as Record<string, unknown>
        try {
          return NextResponse.json(await guardarGestaoAuto({
            userId: dono, contaRef: String(b.conta ?? ''), plataforma, positionId: id,
            pedido: { ...pedido, digits: b.digits }, adaptador: a,
          }))
        } catch (e) {
          const st = (e as { status?: number }).status
          throw st ? new ErroCorretora(st, (e as Error).message) : e
        }
      }
      case 'ordem':
        return NextResponse.json(await a.enviarOrdem({
          symbol: String(b.symbol ?? ''), direcao: b.direcao as 'buy' | 'sell', tipo: (b.tipo as 'mercado' | 'limit' | 'stop') ?? 'mercado',
          volume: Number(b.volume), preco: numero(b.preco), sl: numero(b.sl), tp: numero(b.tp),
        }))
      case 'modificar': {
        const id = String(b.id ?? '')
        if (!id || id.length > 64) throw new ErroCorretora(400, 'id inválido')
        if (b.alvo !== 'posicao' && b.alvo !== 'ordem') throw new ErroCorretora(400, 'alvo inválido')
        return NextResponse.json(await a.modificar({ alvo: b.alvo, id, sl: numero(b.sl), tp: numero(b.tp), preco: numero(b.preco) }))
      }
      case 'fechar': {
        const id = String(b.positionId ?? '')
        if (!id || id.length > 64) throw new ErroCorretora(400, 'posição inválida')
        const v = numero(b.volume)
        if (v != null && !(v > 0)) throw new ErroCorretora(400, 'volume inválido')
        return NextResponse.json(await a.fechar(id, v))
      }
      case 'cancelar': {
        const id = String(b.orderId ?? '')
        if (!id || id.length > 64) throw new ErroCorretora(400, 'ordem inválida')
        return NextResponse.json(await a.cancelar(id))
      }
      default:
        throw new ErroCorretora(404, 'acção desconhecida')
    }
  } catch (e) {
    return falhou(e)
  }
}
