import { NextRequest, NextResponse } from "next/server"
import { recebeT2T, t2tDesligadoNaConta } from "@/lib/mtmcopy/alvo-t2t"
import { ehMtmFundedLigacao } from "@/lib/mtmcopy/destino-execucao"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { entradaT2T } from '@/lib/mtmcopy/t2t-entry'
import { parseSignal } from "@/lib/mtmcopy/signal-parser"
import { t2tMode } from "@/lib/mtmcopy/t2t-source"
import { computeLotSize, riscoEfetivoPct, signalForRiskSizing } from "@/lib/mtmcopy/lot-sizing"
import { getAccountSnapshot } from "@/lib/mtmcopy/metaapi"
import { ehTradeLocker, sessaoDaLigacao } from "@/lib/tradelocker/ligacao"
import { pipSizeForSymbol } from "@/lib/mtmcopy/trade-outcome"
import { estrategiaDoSinalT2T } from "@/lib/mestres/t2t"
import { contasFundedLigadasParaT2T } from "@/lib/mtmfunded/simulado/ligar-conta"
import { escolhaGuardada, refSimulada } from "@/lib/mtmcopy/escolha-contas-t2t"
import { ehContaMestre } from "@/lib/webtrader/filtro-contas"

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
   * «ESTA CONTA JÁ COPIA ESTA ESTRATÉGIA SOZINHA.»
   *
   * Uma conta com a cópia automática ligada vai receber este mesmo trade pelo motor. Aceitar o
   * sinal à mão na MESMA conta abria a posição duas vezes — e quem carrega no botão não tem como
   * saber disso. O sistema já não deixa que aconteça (o T2T salta as contas onde o motor executou
   * o mesmo trade), mas saltar em silêncio parece uma avaria. Aqui diz-se ANTES de carregar.
   *
   * A fonte é a mesma que vai abrir: as rotas vivas do motor para a estratégia deste sinal.
   */
  const slugDoSinal = estrategiaDoSinalT2T(message.channel_slug, message.content)
  const jaCopiam = new Set<string>()
  if (slugDoSinal) {
    const { data: rotas } = await supabase
      .from("copia_rotas")
      .select("destino_ref")
      .eq("estrategia_slug", slugDoSinal)
      .eq("ativa", true)
      .eq("estado", "aprovada")
      .eq("tipo_rota", "estrategia")
    for (const r of rotas ?? []) {
      const ref = String(r.destino_ref ?? "")
      if (ref.startsWith("site:")) jaCopiam.add(ref.slice(5))
    }
  }

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
    (c) => !ehMtmFundedLigacao(c) && (recebeT2T(c) || t2tDesligadoNaConta(c)),
  )
  const bloqueadas: Array<{ id: string; label: string; motivo: string; comoResolver: string }> = []
  const alvos = candidatas.filter((c) => {
    const label = c.account_label || (c.mt5_login_last4 ? `••${c.mt5_login_last4}` : c.id.slice(0, 6))
    if (t2tDesligadoNaConta(c)) {
      bloqueadas.push({ id: c.id, label, motivo: "O Tap to Trade está desligado nesta conta.", comoResolver: "Liga-o na lista de contas do Tap to Trade ou em «As minhas contas»." })
      return false
    }
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
          jaCopia: jaCopiam.has(conn.id),
          lotMode: sizing.lot_mode, riskPct: riscoPct, riskAmount: riscoValor,
          realRiskPct: riscoReal,
          overCap: riscoReal != null && tecto != null && riscoReal > tecto ? tecto : null,
          available: equity != null,
        }
      } catch {
        return { id: conn.id, label, jaCopia: jaCopiam.has(conn.id), equity: null, balance: null, lot: null, lotMode: sizing.lot_mode, riskPct: null, riskAmount: null, available: false }
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

  /**
   * AS CONTAS SIMULADAS MTM FUNDED também são sítios onde a aceitação abre — e até agora não
   * apareciam aqui. Ficavam de fora da lista, abriam à mesma, e quem escolhesse «só nesta conta»
   * ficaria com posições num sítio que o modal nunca mostrou. Entram sem números: são contas
   * simuladas, não há dinheiro em risco para contar, e o sizing delas não muda por causa disto.
   */
  const simuladas: Array<{ id: string; ref: string; label: string }> = []
  try {
    const { data: marcadas } = await supabase
      .from("mtm_trading_accounts").select("id, mt5_login, tipo")
      .eq("user_id", user.id).eq("motor", "sim").eq("estado", "ativa").eq("aceita_t2t", true).limit(20)
    const ids = new Map<string, string | null>()
    // As mestres da casa (`tipo = 'provider'`) não são destino de ninguém — nem aparecem.
    for (const c of (marcadas ?? []).filter((c) => !ehContaMestre(c))) ids.set(String(c.id), (c as { mt5_login?: string | null }).mt5_login ?? null)
    const ligadas = await contasFundedLigadasParaT2T(user.id, (conns ?? []) as Array<Record<string, unknown>>).catch(() => [] as string[])
    if (ligadas.length) {
      const { data: extra } = await supabase
        .from("mtm_trading_accounts").select("id, mt5_login, tipo")
        .in("id", ligadas).eq("user_id", user.id).eq("motor", "sim").eq("estado", "ativa")
      for (const c of (extra ?? []).filter((c) => !ehContaMestre(c))) ids.set(String(c.id), (c as { mt5_login?: string | null }).mt5_login ?? null)
    }
    for (const [id, login] of ids) {
      simuladas.push({ id, ref: refSimulada(id), label: login ? `MTM Funded ${login}` : `MTM Funded ${id.slice(0, 6)}` })
    }
  } catch {
    /* sem a 070/074 aplicada não há simuladas — o T2T de sempre não muda */
  }

  /**
   * AS LIGAÇÕES MTM FUNDED COM O T2T DESLIGADO também têm direito a um motivo. Até 24/09 este
   * caminho nem sequer olhava para o interruptor (abria na mesma, onze de uma vez); agora que
   * olha, a conta deixa de abrir — e desaparecer sem explicação seria a mesma avaria aparente que
   * a lista de contas vazia era antes.
   */
  for (const c of conns ?? []) {
    if (!ehMtmFundedLigacao(c) || recebeT2T(c) || simuladas.some((s) => s.id === String(c.funded_account_id ?? ""))) continue
    bloqueadas.push({
      id: String(c.id),
      label: c.account_label || `MTM Funded ${String(c.id).slice(0, 6)}`,
      motivo: "O Tap to Trade está desligado nesta conta.",
      comoResolver: "Liga-o na lista de contas do Tap to Trade ou em «As minhas contas».",
    })
  }

  /**
   * A ESCOLHA DA VEZ PASSADA, para o modal já vir marcado (`profile_data.t2t.contas`). É só uma
   * sugestão: o que manda na aceitação é o que vier no pedido, e cada conta é validada do zero.
   */
  const { data: perfil } = await supabase.from("profiles").select("profile_data").eq("id", user.id).maybeSingle()
  const guardada = escolhaGuardada(perfil?.profile_data)
  // Uma preferência só vale para as contas que ainda existem e ainda servem.
  const disponiveis = new Set<string>([...accounts.map((a) => a.id), ...simuladas.map((s) => s.ref)])
  const escolhidas = guardada.filter((ref) => disponiveis.has(ref))

  return NextResponse.json({
    mode,
    trade,
    accounts,
    simuladas,
    blocked: bloqueadas,
    // Há decisão para tomar? Só com mais do que um destino possível. Com um só, o modal não
    // pergunta nada — não se acrescenta um toque a quem não tem escolha.
    escolhaPossivel: disponiveis.size > 1,
    escolhidas,
  })
}
