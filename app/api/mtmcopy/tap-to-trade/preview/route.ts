import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { parseSignal } from "@/lib/mtmcopy/signal-parser"
import { t2tMode } from "@/lib/mtmcopy/t2t-source"
import { computeLotSize, signalForRiskSizing } from "@/lib/mtmcopy/lot-sizing"
import { getAccountSnapshot } from "@/lib/mtmcopy/metaapi"
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

  const signal = parseSignal(message.content ?? "")
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
    .select(
      "id, account_label, mt5_login_last4, metaapi_account_id, lot_mode, lot_value, max_risk_percent, is_active, purpose, t2t_enabled, t2t_lot_mode, t2t_lot_value",
    )
    .eq("user_id", user.id)
    .neq("mt5_status", "disconnected")

  const alvos = (conns ?? [])
    .filter((c) => c.metaapi_account_id)
    .filter((c) => c.purpose === "tap_to_trade" || c.t2t_enabled === true)
    .filter((c) => c.is_active !== false)

  // Uma conta lenta não pode segurar o modal: o que não responder em 8s aparece sem números,
  // com a etiqueta de indisponível, em vez de deixar o cliente à espera.
  const accounts = await Promise.all(
    alvos.map(async (conn) => {
      const label = conn.account_label || (conn.mt5_login_last4 ? `••${conn.mt5_login_last4}` : conn.id.slice(0, 6))
      const sizing = { ...conn, lot_mode: conn.t2t_lot_mode ?? conn.lot_mode, lot_value: conn.t2t_lot_value ?? conn.lot_value }
      try {
        const snap = await Promise.race([
          getAccountSnapshot(conn.metaapi_account_id as string),
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
        return {
          id: conn.id, label, equity, balance, lot,
          lotMode: sizing.lot_mode, riskPct: riscoPct, riskAmount: riscoValor,
          available: equity != null,
        }
      } catch {
        return { id: conn.id, label, equity: null, balance: null, lot: null, lotMode: sizing.lot_mode, riskPct: null, riskAmount: null, available: false }
      }
    }),
  )

  return NextResponse.json({ mode, trade, accounts })
}
