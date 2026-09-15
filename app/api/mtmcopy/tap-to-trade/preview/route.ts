import { NextRequest, NextResponse } from "next/server"
import { ehMtmFundedLigacao } from "@/lib/mtmcopy/destino-execucao"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { entradaT2T } from '@/lib/mtmcopy/t2t-entry'
import { parseSignal } from "@/lib/mtmcopy/signal-parser"
import { t2tMode } from "@/lib/mtmcopy/t2t-source"
import { computeLotSize, riscoEfetivoPct, signalForRiskSizing } from "@/lib/mtmcopy/lot-sizing"
import { getAccountSnapshot } from "@/lib/mtmcopy/metaapi"
import { ehTradeLocker, sessaoDaLigacao } from "@/lib/tradelocker/ligacao"
import { pipSizeForSymbol } from "@/lib/mtmcopy/trade-outcome"

/**
 * PRÉ-VISUALIZAÇÃO de um sinal antes de o aceitar.
 *
 * É o que o modal mostra quando se toca na notificação: os parâmetros da trade e, por conta,
 * QUANTO se está mesmo a arriscar — lote calculado, valor em risco e a percentagem sobre a
 * equity daquela conta. Antes o cliente confirmava um sinal sem ver o tamanho da posição que
 * ia abrir; via só o texto do sinal e uma etiqueta genérica de risco.
 *
 * Só lê. Nunca coloca ordens.
 */
export const dynamic = "force-dynamic"
export const maxDuration = 30

const supabase = getSupabaseAdmin()

async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get("Authorization")
  if (!authHeader?.startsWith("Bearer ")) return null
  const accessToken = authHeader.replace("Bearer ", "")
  const { data: { user }, error } = await supabase.auth.getUser(accessToken)
  return error || !user ? null : user
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request)
  if (!user) return NextResponse.json({ error: "Autenticação necessária" }, { status: 401 })

  const chatMessageId = request.nextUrl.searchParams.get("chat_message_id")
  if (!chatMessageId) return NextResponse.json({ error: "chat_message_id obrigatório" }, { status: 400 })

  const { data: message } = await supabase
    .from("chat_messages")
    .select("id, channel_slug, content, created_at")
    .eq("id", chatMessageId)
    .maybeSingle()
  if (!message) return NextResponse.json({ error: "Mensagem não encontrada" }, { status: 404 })

  const parsed = parseSignal(message.content ?? "")
  const signal = parsed ? entradaT2T(parsed) : null
  if (!signal?.symbol || !signal.direction) {
    return NextResponse.json({ error: "Não foi possível interpretar este sinal" }, { status: 400 })
  }

  const mode = t2tMode(message.channel_slug, message.content)
  const distanciaPips =
    signal.entry != null && signal.sl != null && signal.entry > 0
      ? Math.abs(signal.entry - signal.sl) / pipSizeForSymbol(signal.symbol)
      : null

  const trade = {
    symbol: signal.symbol,
    direction: signal.direction,
    entry: signal.entry ?? null,
    sl: signal.sl ?? null,
    tps: signal.tp ?? [],
    stopPips: distanciaPips != null ? Math.round(distanciaPips * 10) / 10 : null,
    channel: message.channel_slug,
  }

  // Seguir não abre nada: não há lote nem risco para mostrar.
  if (mode === "follow") {
    return NextResponse.json({ mode, trade, accounts: [] })
  }

  const { data: conns } = await supabase
    .from("mtmcopy_connections")
    // "*" para incluir as colunas tl_* (TradeLocker, migração 069) sem partir antes de a aplicar.
    .select("*")
    .eq("user_id", user.id)

  /**
   * DIZER PORQUE É QUE A CONTA NÃO SERVE, em vez de a esconder.
   *
   * As contas inelegíveis eram simplesmente filtradas: o cliente abria o modal, via a lista de
   * contas VAZIA, sem uma palavra, carregava em aceitar e apanhava um erro opaco. Uma ligação em
   * pausa (o caso do Gonçalo, `is_active=false`) ou desligada ficava invisível — e a pessoa
   * concluía, com razão, que "o Tap to Trade não funciona".
   */
  // Ligações MTM Funded não passam por aqui (sem MetaApi/TradeLocker): abrem pelo motor simulado.
  const candidatas = (conns ?? []).filter(
    (c) => !ehMtmFundedLigacao(c) && (c.purpose === "tap_to_trade" || c.t2t_enabled === true),
  )
  const bloqueadas: Array<{ id: string; label: string; motivo: string; comoResolver: string }> = []
  const alvos = candidatas.filter((c) => {
    const label = c.account_label || (c.mt5_login_last4 ? `••${c.mt5_login_last4}` : c.id.slice(0, 6))
    if (!c.metaapi_account_id && !(ehTradeLocker(c) && c.tl_account_id)) {
      bloqueadas.push({ id: c.id, label, motivo: "A conta ainda não terminou a ligação ao MT5.", comoResolver: "Abre as definições da conta e conclui a ligação." })
      return false
    }
    if (c.mt5_status === "disconnected") {
      bloqueadas.push({ id: c.id, label, motivo: "A ligação ao MT5 caiu.", comoResolver: "Confirma a palavra-passe e o servidor nas definições da conta." })
      return false
    }
    if (c.is_active === false) {
      bloqueadas.push({ id: c.id, label, motivo: "A conta está em pausa.", comoResolver: "Ativa-a nas definições para voltar a aceitar sinais." })
      return false
    }
    return true
  })

  // Uma conta lenta não pode segurar o modal: o que não responder em 8s aparece sem números,
  // com a etiqueta de indisponível, em vez de deixar o cliente à espera.
  const accounts = await Promise.all(
    alvos.map(async (conn) => {
      const label = conn.account_label || (conn.mt5_login_last4 ? `••${conn.mt5_login_last4}` : conn.id.slice(0, 6))
      const sizing = { ...conn, lot_mode: conn.t2t_lot_mode ?? conn.lot_mode, lot_value: conn.t2t_lot_value ?? conn.lot_value }
      try {
        // TradeLocker: saldo/equity pelo /state da conta escolhida; MT5 pela MetaApi.
        const lerSnapshot = async () => {
          if (!ehTradeLocker(conn)) return getAccountSnapshot(conn.metaapi_account_id as string)
          const { sessao } = await sessaoDaLigacao(conn)
          if (!sessao) return null
          const e = await sessao.estado()
          return { balance: e.balance ?? undefined, equity: e.equity ?? undefined }
        }
        const snap = await Promise.race([
          lerSnapshot(),
          new Promise<null>((r) => setTimeout(() => r(null), 8000)),
        ])
        const equity = snap && typeof snap.equity === "number" ? snap.equity : null
        const balance = snap && typeof snap.balance === "number" ? snap.balance : equity
        const lot = computeLotSize(sizing, signalForRiskSizing(signal), balance)
        // Risco em dinheiro = distância ao stop (em pips) × valor do pip × lote. O valor do pip
        // depende do contrato de cada símbolo; usa-se a mesma referência do sizing por risco.
        const riscoPct =
          sizing.lot_mode === "risk_percent" ? Number(sizing.lot_value) || null : Number(conn.max_risk_percent) || null
        const riscoValor = equity != null && riscoPct != null ? Math.round(equity * (riscoPct / 100) * 100) / 100 : null
        /**
         * RISCO REAL DO LOTE, não o configurado.
         *
         * O `riskPct` é a percentagem que o cliente escolheu; com lote fixo — ou quando o piso de
         * 0,01 do broker sobe o lote — o que vai para o mercado arrisca outra coisa. A conta T2T
         * do Fábio, com 21,48 €, mandava 0,01 lotes de ouro: ~5 € por trade, 23% do saldo, com o
         * tecto dele em 1% e sem ninguém a dizer nada. Só a almofada das prop firms aplicava um
         * tecto, e mesmo essa só em modo percentagem.
         */
        const riscoReal =
          lot != null && balance != null
            ? riscoEfetivoPct(lot, signalForRiskSizing(signal), balance, null)
            : null
        const tecto = Number(conn.max_risk_percent) || null
        return {
          id: conn.id, label, equity, balance, lot,
          lotMode: sizing.lot_mode, riskPct: riscoPct, riskAmount: riscoValor,
          realRiskPct: riscoReal,
          overCap: riscoReal != null && tecto != null && riscoReal > tecto ? tecto : null,
          available: equity != null,
        }
      } catch {
        return { id: conn.id, label, equity: null, balance: null, lot: null, lotMode: sizing.lot_mode, riskPct: null, riskAmount: null, available: false }
      }
    }),
  )

  // Saldo a zero é a outra razão silenciosa: a conta aparecia na lista, o cliente aceitava e a
  // corretora respondia "not enough money" já depois do clique.
  for (const a of accounts) {
    if (a.available && (a.balance ?? 0) <= 0) {
      bloqueadas.push({
        id: a.id,
        label: a.label,
        motivo: "A conta está sem saldo.",
        comoResolver: "Deposita na corretora antes de aceitar sinais.",
      })
    }
  }

  return NextResponse.json({ mode, trade, accounts, blocked: bloqueadas })
}
