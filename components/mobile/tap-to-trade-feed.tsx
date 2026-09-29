"use client"

import { lerSinal } from "@/lib/sinais/formato-sinal"
import { ehSinalDePerpetuo, t2tMode } from "@/lib/mtmcopy/t2t-source"
import { mensagemCripto, useSemCripto } from "@/lib/ios-sem-cripto"
import { apareceNoT2T, recebeT2T } from "@/lib/mtmcopy/alvo-t2t"
import { pipSizeForSymbol, unitFor } from "@/lib/mtmcopy/trade-outcome"
import { precoLegivel, textoParaColar, type ParametrosSinal } from "@/lib/mtmcopy/t2t-copiar"
import { directionLabelFromText, resolveDirectionLabel } from "@/lib/mtmcopy/signal-direction"

import { useCallback, useEffect, useState, useRef, useMemo } from "react"
import { useSearchParams } from "next/navigation"
import { useT } from "@/components/i18n-provider"
import { supabase } from "@/lib/supabase"
import { TradeLockerBadge } from "@/components/tradelocker/tradelocker-connect-form"
import { MtmFundedBadge, SoLeituraBadge } from "@/components/ligar-mtmfunded/mtmfunded-connect-form"
import { ListaContas, LimitesPlano, useContasLigadas } from "@/components/contas/ligador-contas"
import CopiasEntreContas from "@/components/contas/copias-entre-contas"
import { isT2TEntrySignal, matchesT2TPrefs, t2tSourceKey, T2T_SOURCES, T2T_ASSET_CLASSES } from "@/lib/mtmcopy/t2t-source"
import { vereditoDaJanela, type CodigoDaJanela } from "@/lib/mtmcopy/t2t-janela-regra"
import { iniciaisDaFonte, ROTULOS_CANAIS_T2T } from "@/lib/mtmcopy/rotulos-canais"
import {
  TrendingUp,
  RefreshCw,
  Loader2,
  Settings,
  Zap,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  Wallet,
  Clock,
  Copy,
} from "lucide-react"
import MtmAutoMetricas from "@/components/mobile/mtm-auto-metricas"
import TapToCopyModal from "@/components/mobile/tap-to-copy-modal"
import MtmAutoPainel from "@/components/mobile/mtm-auto-painel"
import MtmAutoEstrategias from "@/components/mobile/mtm-auto-estrategias"
import MtmAutoHistorico from "@/components/mobile/mtm-auto-historico"

/**
 * Encerra mesmo a ideia (ao contrário de um BE ou de um TP1, que a deixam a correr).
 *
 * Fica como REDE, e só para isso: o desfecho de um sinal seguido pelo motor vem do servidor
 * (`outcome_label`). Esta leitura das mensagens de fecho serve os sinais que o motor não segue.
 */
const TERMINAL_RE = /(posi[çc][aã]o\s*fechada|fechad[ao]|sl\s*hit|stop\s*loss\s*hit|stop\s+(?:loss|protegido)\s*·|cancelad|encerrad|descartad|invalidad|alvo\s+final|close\s+all|hit\s*tp\s*[3-9])/i

/**
 * O que é um SINAL DE ENTRADA decide-se em `lib/mtmcopy/t2t-source` — `isT2TEntrySignal`.
 *
 * Havia aqui uma segunda regra, escrita à mão, com os seus próprios `FOLLOWUP_RE`, `PERF_RE`,
 * `DIR_RE` e um portão só para o Sensei. Enquanto as duas concordaram, ninguém reparou. A 21/09
 * a mestre do Sensei passou a escrever «Entrada executada» em vez de «Entrada activada», e o
 * portão daqui — que exigia a palavra «activada» — deixou de a reconhecer: SETE sinais do Sensei
 * em três semanas desapareceram deste separador, enquanto o motor os seguia, a conta-espelho os
 * abria e o /sinais da MTM Auto os mostrava. O cliente do site não teve como aceitar um único.
 *
 * A regra da `lib` é a que o `signal-tracker` usa para admitir sinais, e é por isso a que decide
 * o que existe. O portão do Sensei também não se perdeu: quem o aplica é o servidor, em
 * `/api/mtmcopy/tap-to-trade/providers` (`senseiSignalIds`, só as ideias ACTIVADAS), e é esse que
 * continua a filtrar mais abaixo. Uma regra, num sítio.
 */

/** "3m", "2h", "1d" — a idade do sinal, curta, como na MTM Auto. */
function idadeCurta(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  return `${Math.round(s / 86400)}d`
}

/**
 * Os NOMES dos canais vêm de `lib/mtmcopy/rotulos-canais` — a MESMA tabela do admin e do /sinais
 * da MTM Auto. Havia aqui uma cópia que chamava «Premium · Ouro» ao canal que o painel do admin
 * (e o chat) chamam «MTM Auto Premium»: quem ligava a fonte no painel não a reconhecia na app.
 */
const CHANNEL_LABEL = ROTULOS_CANAIS_T2T

/**
 * Direção lida do texto — PLANO B. Quem manda é a direção gravada pelo servidor
 * (`mtmcopy_signal_tracking.direction`, servida por `/api/mtmcopy/signal-directions`).
 * Ver `lib/mtmcopy/signal-direction`.
 */
function directionOf(content: string): "BUY" | "SELL" | "" {
  return directionLabelFromText(content)
}

/** Tempo máximo para um sinal estar ativo (5 minutos) — entradas A MERCADO. */
const T2T_MAX_AGE_MS = 5 * 60 * 1000
/** Setups PENDENTES (entrada por zona/limite ainda por tocar) ficam aceitáveis até 24h, enquanto
 *  não forem ativados/fechados por um follow-up. Pedido Ricardo 2026-08-18 (espelha o servidor). */
const T2T_PENDING_MAX_AGE_MS = 24 * 60 * 60 * 1000
/**
 * O sinal traz um NÍVEL de entrada (zona/limite)? Decide a validade: com nível é um setup
 * PENDENTE e vale 24h; sem nível é "a mercado" e morre em 5 minutos.
 *
 * A zona nem sempre vem etiquetada. A MTM Aurum Flow Cripto escreve-a a seco — «I'm buying ⏎
 * 4606-4602 ⏎ TP1 4609» (exemplo do tempo em que ainda publicava ouro) — e como aqui só se
 * procurava a PALAVRA «entrada/zona», todos os sinais dela caíam na janela dos 5 minutos e desapareciam do Tap to Trade antes de alguém lhes tocar.
 * Eram 239 mensagens em duas semanas contra 560 com nível reconhecido.
 *
 * E a etiqueta nem sempre encosta ao número: o Sensei escreve «Entrada activada: 4637.54», com
 * uma palavra pelo meio — com `\s*:?\s*` ficava de fora e os alertas dele expiravam em 5 minutos.
 */
function hasEntryLevel(content?: string | null): boolean {
  if (!content) return false
  if (/(entrada|entry|zona|zone)[^\n\d]{0,20}[0-9]+[.,]?[0-9]*/i.test(content)) return true
  // Zona sem etiqueta, em linha própria: «4606-4602» / «4642.50 - 4638».
  return /^\s*\d{2,7}(?:[.,]\d+)?\s*[-–—]\s*\d{2,7}(?:[.,]\d+)?\s*$/m.test(content)
}

/** Extrai o símbolo do sinal (para emparelhar com follow-ups TP/fecho). */
function symbolOf(content: string): string | null {
  const c = content.toUpperCase()
  const m =
    c.match(/\b(XAUUSD|XAGUSD|NAS100|US30|US500|GER40|UK100|JP225|SPX500|BTCUSD|ETHUSD|SOLUSD|XRPUSD)\b/) ||
    c.match(/\b[A-Z]{3}(USD|EUR|GBP|JPY|AUD|CAD|CHF|NZD)\b/) ||
    c.match(/\bXAU\b|\bGOLD\b/)
  return m ? m[0] : null
}

/**
 * Extrai os campos estruturados de um sinal (símbolo, direção, entrada, SL, TPs)
 * a partir do texto cru — que chega em formatos diferentes por fonte (Premium literal
 * do Telegram, "📡 PrimeVerse" (hoje só o MTM Auto Edge), master-poll "🟢 XAUUSD BUY"). Serve SÓ para o card
 * harmonizado do tab T2T; NÃO altera o texto guardado nem os chats.
 */
interface SignalFields {
  symbol: string | null
  direction: "BUY" | "SELL" | ""
  entry: string | null   // preço ou "Mercado"
  sl: string | null
  tps: string[]
}
function parseSignalFields(content: string): SignalFields {
  // Formato único (lib/sinais/formato-sinal): lê-se exacto, sem adivinhar.
  const unico = lerSinal(content)
  if (unico) {
    return {
      symbol: unico.simbolo,
      direction: unico.direcao === "buy" ? "BUY" : "SELL",
      entry: unico.zona
        ? `${unico.zonaPrimeiro ?? unico.zona[0]} – ${unico.zonaPrimeiro === unico.zona[0] ? unico.zona[1] : unico.zona[0]}`
        : unico.entrada != null ? String(unico.entrada) : "Mercado",
      sl: unico.sl != null ? String(unico.sl) : null,
      tps: unico.tps.map(String),
    }
  }
  const numRe = "(\\d+(?:[.,]\\d+)?)"
  const entryM = content.match(new RegExp(`(?:entrada|entry|entrar)\\s*[:=]?\\s*${numRe}`, "i"))
  const marketM = /(?:entrada|entry)\s*[:=]?\s*(mercado|market)/i.test(content)
  const slM = content.match(new RegExp(`(?:sl|stop\\s?loss|stoploss|s\\/l)\\s*[:=]?\\s*${numRe}`, "i"))
  const tps: string[] = []
  const seen = new Set<string>()
  for (const m of content.matchAll(new RegExp(`(?:tp\\s*\\d*|take\\s?profit\\s*\\d*|alvo\\s*\\d*|target\\s*\\d*)\\s*[:=]?\\s*${numRe}`, "gi"))) {
    const v = m[1]
    if (v && !seen.has(v)) { seen.add(v); tps.push(v) }
  }
  return {
    symbol: symbolOf(content),
    direction: directionOf(content),
    entry: entryM ? entryM[1] : marketM ? "Mercado" : null,
    sl: slM ? slM[1] : null,
    tps,
  }
}

/**
 * Os campos do cartão, prontos para o «Tap to copy».
 *
 * A entrada do cartão pode vir como zona («4388 – 4395»): copia-se o PRIMEIRO valor, que é o
 * primeiro a ser tocado — é o que o trader escreveu como entrada. E a direcção é a do servidor
 * (`dir`), não a que se adivinha do texto: o rodapé «…key to long term success» do Premium punha
 * «BUY» em cima de vendas, e copiado para uma ordem isso é a trade ao contrário.
 */
function parametrosParaCopiar(f: SignalFields, dir: string): ParametrosSinal {
  const primeiroNumero = (v: string | null): number | null => {
    const m = String(v ?? "").match(/-?\d+(?:[.,]\d+)?/)
    if (!m) return null
    const n = Number(m[0].replace(",", "."))
    return Number.isFinite(n) ? n : null
  }
  return {
    simbolo: f.symbol ?? "",
    direcao: dir || f.direction || null,
    entrada: primeiroNumero(f.entry),
    mercado: f.entry == null || /mercado|market/i.test(String(f.entry)),
    sl: primeiroNumero(f.sl),
    tps: f.tps.map(primeiroNumero),
  }
}

interface TapPreviewAccount {
  id: string
  label: string
  equity: number | null
  lot: number | null
  lotMode: string | null
  riskPct: number | null
  riskAmount: number | null
  /** Risco REAL do lote que vai ser enviado (o piso de 0,01 do broker pode subi-lo). */
  realRiskPct?: number | null
  /** Tecto configurado, quando o risco real o ultrapassa. */
  overCap?: number | null
  /** Esta conta já copia esta estratégia sozinha — aceitar à mão seria a mesma trade duas vezes. */
  jaCopia?: boolean
  available: boolean
}

interface TapPreview {
  mode: "execute" | "follow"
  trade: {
    symbol: string
    direction: "buy" | "sell"
    entry: number | null
    sl: number | null
    tps: number[]
    stopPips: number | null
    channel: string
  }
  accounts: TapPreviewAccount[]
  /** Contas simuladas MTM Funded onde a aceitação também abre (sem lote/risco: não há dinheiro). */
  simuladas?: Array<{ id: string; ref: string; label: string }>
  /** Contas que NÃO podem aceitar, com o motivo — ver a rota de preview. */
  blocked?: Array<{ id: string; label: string; motivo: string; comoResolver: string }>
  /** Há mais do que um destino possível → vale a pena perguntar onde abrir. */
  escolhaPossivel?: boolean
  /** O que a pessoa escolheu da última vez (`profile_data.t2t.contas`), já filtrado pelo que existe. */
  escolhidas?: string[]
}

/** Marca/desmarca uma conta na lista de «onde abrir» (mantém a ordem em que apareceram). */
function alternarConta(atual: string[] | null, ref: string): string[] {
  const lista = atual ?? []
  return lista.includes(ref) ? lista.filter((x) => x !== ref) : [...lista, ref]
}

/**
 * Uma linha da lista «onde abrir».
 *
 * Com UM destino só (`escolhivel = false`) é exactamente a linha de sempre: o que vai acontecer,
 * sem caixa nenhuma para tocar. Não se acrescenta um toque a quem não tem decisão para tomar.
 * Com dois ou mais, a linha inteira passa a ser o alvo do toque — uma caixa de 16px no telemóvel
 * é um convite a falhar.
 */
function ContaEscolhivel({
  escolhivel,
  marcada,
  alternar,
  children,
}: {
  escolhivel: boolean
  marcada: boolean
  alternar: () => void
  children: React.ReactNode
}) {
  if (!escolhivel) return <div className="flex items-baseline justify-between gap-3">{children}</div>
  return (
    <button
      type="button"
      onClick={alternar}
      aria-pressed={marcada}
      className={`flex w-full items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors active:scale-[0.99] ${marcada ? "bg-[#D2A63C]/10" : "opacity-50"}`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${marcada ? "border-[#D2A63C] bg-[#D2A63C] text-black" : "border-zinc-600 text-transparent"}`}
      >
        ✓
      </span>
      <span className="flex flex-1 items-baseline justify-between gap-3 min-w-0">{children}</span>
    </button>
  )
}

interface Sig {
  id: string
  channel_slug: string
  content: string
  created_at: string
  expired?: boolean
  reason?: string
  /** Desfecho gravado pelo servidor (pips e percentagem). Ver lib/mtmcopy/signal-outcomes. */
  outcome?: { label?: string; pips?: number; pct?: number | null } | null
  /** Desfecho já resolvido para leitura (etiqueta pronta). */
  desfecho?: string
}

interface Conn {
  id: string
  account_label?: string | null
  metaapi_account_id?: string | null
  mt5_login?: string | number | null
  mt5_server?: string | null
  mt5_platform?: string | null
  /** Conta TradeLocker (mt5_platform='tradelocker'): accountId escolhido na ligação. */
  tl_account_id?: string | null
  tl_env?: string | null
  /** Conta MTM Funded (mt5_platform='mtmfunded', 074): executa pelo motor simulado. */
  funded_account_id?: string | null
  funded_somente_leitura?: boolean | null
  mt5_status?: string | null
  last_error?: string | null
  lot_mode?: string | null
  lot_value?: number | null
  max_risk_percent?: number | null
  copy_sl?: boolean | null
  copy_tp?: boolean | null
  is_active?: boolean | null
  balance?: number | null
  broker_name?: string | null
  auto_trailing_stop?: boolean | null
  trailing_stop_points?: number | null
  exit_pct_tp1?: number | null
  exit_pct_tp2?: number | null
  exit_pct_tp3?: number | null
  t2t_sources?: string[] | null
  t2t_asset_classes?: string[] | null
  t2t_risk_level?: string | null
  t2t_enabled?: boolean | null
  /** 'tap_to_trade' = conta dedicada ao T2T (nasce ligada). */
  purpose?: string | null
}

/** Preset de risco → risco por trade (%). */
const RISK_PRESET: Record<string, number> = { low: 0.5, medium: 1, high: 2 }
const RISK_LABEL: Record<string, string> = { low: "Baixo", medium: "Médio", high: "Alto" }

/**
 * Desfecho de um sinal terminado, em pips e percentagem.
 *
 * Os pips vêm do que a FONTE anunciou ("HIT TP3 ✅ +200PIPS", "SL HIT −100PIPS") — é o número
 * que o cliente viu no chat, e reescrevê-lo com o nosso cálculo só criaria discórdia. A
 * percentagem é derivada desses pips com o tamanho de pip canónico e a entrada do setup, para
 * ser a mesma conta que o resto do sistema faz.
 */
function desfechoDoSinal(setup: Sig, fecho: Sig | undefined): string {
  const sym = symbolOf(setup.content)
  if (!fecho) return ""

  const perdeu = /\bsl\s*hit|stop\s*loss\s*hit|❌/i.test(fecho.content)
  const m = fecho.content.match(/([+\-−]?\s*\d+(?:[.,]\d+)?)\s*pips?/i)
  if (!m) return ""
  const bruto = Math.abs(Number(m[1].replace(/[\s−]/g, "").replace(",", ".")))
  if (!Number.isFinite(bruto) || bruto === 0) return ""
  const pips = perdeu ? -bruto : bruto

  const entrada = Number((setup.content.match(/(?:entrada|entry|zone)\D{0,12}(\d[\d.,]*)/i) ?? [])[1]?.replace(",", "."))
  const unidade = unitFor(sym)
  const sinal = pips >= 0 ? "+" : "−"
  const parte = `${sinal}${Math.abs(pips).toLocaleString("pt-PT")} ${unidade}`
  if (!Number.isFinite(entrada) || entrada <= 0) return parte
  const pct = (Math.abs(pips) * pipSizeForSymbol(sym)) / entrada * 100
  return `${parte} · ${sinal}${pct.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
}

/**
 * A JANELA DE ACEITAÇÃO já não se decide aqui.
 *
 * Havia `foraDaZona()` mais uma idade calculada à parte, e do outro lado do ecrã a rota que abre
 * a ordem decidia à sua maneira — com outras frases. Um botão que convida para uma trade que a
 * rota vai recusar é uma promessa que o produto não cumpre. Agora quem responde é o servidor, em
 * `/api/mtmcopy/signal-live`, com `vereditoDaJanela` de `lib/mtmcopy/t2t-janela-regra`: a mesma
 * resposta, com as mesmas palavras, que o /sinais da MTM Auto mostra do mesmo sinal.
 */

/** A etiqueta curta de cada recusa. O código vem da `lib`; a palavra é a deste catálogo. */
const ETIQUETA_DA_RECUSA: Record<CodigoDaJanela, string> = {
  closed: "t2t.reasonResolved",
  stop_hit: "t2t.stopHit",
  out_of_zone: "t2t.outOfZone",
  expired: "t2t.signalUnavailable",
}

/**
 * Porque é que este cartão não se aceita — ou `null` se ainda se aceita.
 *
 * Manda o veredito do servidor, que é o mesmo que a rota vai aplicar. O `s.expired` local fica
 * como REDE para os sinais que o motor não segue (os perpétuos que se SEGUEM em vez de abrir não
 * entram no acompanhamento): sem linha não há veredito, e aí vale a idade lida do texto.
 */
function vereditoDoCartao(
  s: { expired?: boolean },
  vivo?: { janela?: { aceitavel: boolean; code: CodigoDaJanela | null } },
): CodigoDaJanela | null {
  const j = vivo?.janela
  if (j) return j.aceitavel ? null : (j.code ?? "expired")
  return s.expired ? "expired" : null
}

/** Definições de risco/saídas de uma conta, no formato do editor de «Execução». */
function cfgDaConta(c: Conn) {
  return {
    lot_mode: (c.lot_mode === "fixed" ? "fixed" : "risk_percent") as "risk_percent" | "fixed",
    risk: typeof c.max_risk_percent === "number" ? c.max_risk_percent : 1,
    lot: typeof c.lot_value === "number" ? c.lot_value : 0.01,
    copy_sl: c.copy_sl !== false,
    copy_tp: c.copy_tp !== false,
    trailing: c.auto_trailing_stop === true,
    trailingPts: typeof c.trailing_stop_points === "number" ? c.trailing_stop_points : 100,
    tp1: typeof c.exit_pct_tp1 === "number" ? c.exit_pct_tp1 : 50,
    tp2: typeof c.exit_pct_tp2 === "number" ? c.exit_pct_tp2 : 30,
    tp3: typeof c.exit_pct_tp3 === "number" ? c.exit_pct_tp3 : 20,
  }
}

export default function TapToTradeFeed() {
  const t = useT()
  const searchParams = useSearchParams()
  const [items, setItems] = useState<Sig[]>([])
  const [loading, setLoading] = useState(true)
  const [limitMode, setLimitMode] = useState<"today" | "week">("today")
  const [historico, setHistorico] = useState<Array<Sig & { desfecho: string }>>([])
  /** Resultado FLUTUANTE por sinal, calculado pelo motor (não por cotações no cliente). */
  /**
   * Os quatro ecrãs da app MTM Auto, aqui dentro.
   *
   * O separador deixou de ser uma página só com uma lista e três acordeões e passou a ter a mesma
   * arrumação da MTM Auto: Sinais, Estratégias, Histórico e Conta. Quem usa as duas apps deixa de
   * ter de aprender duas arrumações para a mesma coisa.
   */
  const [ecra, setEcra] = useState<"sinais" | "estrategias" | "historico" | "conta">("sinais")
  /** Que cartões têm os alvos extra abertos. Um "+2" que não abre é uma pergunta sem resposta. */
  const [alvosAbertos, setAlvosAbertos] = useState<Record<string, boolean>>({})
  /** Fonte escolhida só para VER. Null = todas. Não mexe no que se recebe. */
  const [fonteVista, setFonteVista] = useState<string | null>(null)
  /**
   * O que o SERVIDOR sabe de cada sinal: os números ao vivo, o desfecho e o veredito da janela de
   * aceitação. Tudo já decidido lá — este ecrã desenha, não calcula.
   */
  const [aoVivo, setAoVivo] = useState<
    Record<
      string,
      {
        pips: number | null
        pct: number | null
        exits?: number
        entrou?: boolean
        slBatido?: boolean
        estado?: string
        desfecho?: string | null
        janela?: { aceitavel: boolean; motivo: string | null; code: CodigoDaJanela | null }
      }
    >
  >({})
  /**
   * A direção com que cada sinal foi mesmo colocado, vinda do servidor
   * (`mtmcopy_signal_tracking.direction`). É esta que manda no cartão: ler a direção do texto
   * punha «BUY» em cima de vendas do Premium, por causa do rodapé «…key to long term success».
   */
  const [dirServidor, setDirServidor] = useState<Record<string, string>>({})
  /** Lido dentro do `load` sem o tornar dependente do estado — o intervalo de 20s não se recria. */
  const limitModeRef = useRef<"today" | "week">("today")
  const [tap, setTap] = useState<{ sig: Sig; status: "confirm" | "loading" | "done" | "error"; message?: string } | null>(null)
  /** Perpétuos: modal TAP to Copy (parâmetros campo a campo) em vez de ordem. */
  const [copySig, setCopySig] = useState<Sig | null>(null)
  /**
   * Pré-visualização do sinal: parâmetros da trade e, por conta, o lote e o risco calculados
   * sobre a equity real. Antes o cliente confirmava sem ver o tamanho da posição que ia abrir.
   */
  const [preview, setPreview] = useState<TapPreview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  /**
   * ONDE ABRIR (2026-09-24). Antes, aceitar abria em TODAS as contas com o T2T ligado — com doze
   * contas isso deixou de ser conveniência e passou a ser uma surpresa cara. O leque continua
   * possível (dá para marcar duas das doze), mas passa a ser uma escolha.
   *
   * `null` enquanto a pré-visualização não chega. Com UMA só conta ninguém vê pergunta nenhuma.
   */
  const [ondeAbrir, setOndeAbrir] = useState<string[] | null>(null)
  /** As contas que não podem aceitar começam RECOLHIDAS — o motivo não pode ser o ecrã todo. */
  const [bloqueadasAbertas, setBloqueadasAbertas] = useState(false)
  const [providers, setProviders] = useState<{ label: string; strategy: string }[]>([])
  /** Os canais que o servidor diz estarem ATIVOS no Tap to Trade — é a lista que o filtro usa. */
  const [canaisAtivos, setCanaisAtivos] = useState<string[]>([])

  /**
   * O sinal que a notificação pediu para abrir.
   *
   * A push do Tap to Trade levava ao CHAT do canal — e a partir daí era preciso encontrar a
   * mensagem no meio das outras e carregar no botão. Quem toca numa notificação de sinal quer o
   * sinal, e o preço não espera por essa procura.
   *
   * Guarda-se numa ref e não em estado porque só serve UMA vez: depois de abrir, se ficasse no
   * estado voltaria a abrir sozinho a cada recarregamento da lista.
   */
  const sinalPedido = useRef<string | null>(null)
  const jaAbriu = useRef(false)
  useEffect(() => {
    /**
     * Aceita `sinal` e `signal`.
     *
     * O app nativo lê o parâmetro como `signal` (está assim no `routeNotification`) e eu escrevi
     * `sinal` no servidor. Um mesmo endereço tem de funcionar nas duas superfícies — dois nomes
     * para a mesma coisa é o tipo de detalhe que só se descobre quando alguém carrega numa
     * notificação e não acontece nada.
     */
    const q = new URLSearchParams(window.location.search)
    const p = q.get("sinal") ?? q.get("signal")
    if (p) sinalPedido.current = p
  }, [])
  const [noProviders, setNoProviders] = useState(false)
  // Sinais que este utilizador já aceitou: { chat_message_id: status }
  const [accepted, setAccepted] = useState<Record<string, string>>({})
  const [closingAll, setClosingAll] = useState(false)

  // Configuração da conta (estilo PrimeSync, dentro do próprio T2T)
  const [conn, setConn] = useState<Conn | null>(null)
  // Multi-conta: todas as contas T2T do user (fan-out). O user escolhe uma ou várias ligando o T2T
  // por conta. `conn` acima é a primária (para a config detalhada existente).
  const [t2tConns, setT2tConns] = useState<Conn[]>([])
  /**
   * TODAS as contas ligadas da pessoa — não só as que já estão no Tap to Trade.
   *
   * O painel «Contas no Tap to Trade» só mostrava as que já lá estavam, e por isso uma conta
   * ligada para cópia (MT5, MT4 ou TradeLocker) não tinha onde ser ligada ao T2T: ou já lá
   * estava, ou era invisível. É o cliente que decide qual das suas contas aceita sinais à mão.
   */
  const [todasConns, setTodasConns] = useState<Conn[]>([])
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [showConfig, setShowConfig] = useState(false)
  const [savingConn, setSavingConn] = useState(false)
  // "O que seguir": fontes + classes de ativo + nível de risco (prefs por-user na conta T2T)
  const [follow, setFollow] = useState<{ sources: string[]; assetClasses: string[]; risk: string | null }>({ sources: [], assetClasses: [], risk: null })
  const [savingFollow, setSavingFollow] = useState(false)
  const [followDirty, setFollowDirty] = useState(false)
  /** Confirmação (ou falha) do último Guardar. Some sozinha ao fim de 4s quando corre bem. */
  const [followMsg, setFollowMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [cfg, setCfg] = useState<{
    lot_mode: "risk_percent" | "fixed"
    risk: number
    lot: number
    copy_sl: boolean
    copy_tp: boolean
    trailing: boolean
    trailingPts: number
    tp1: number
    tp2: number
    tp3: number
  } | null>(null)

  const token = useCallback(async () => {
    const { getAccessToken } = await import("@/lib/auth-token")
    return getAccessToken()
  }, [])

  /** Ligador único de contas (lista + quota) — o mesmo da área de membro no site. */
  const ligador = useContasLigadas(token)
  /** Conta cujo risco/saídas se está a configurar em «Execução». */
  const contaCfgId = useRef<string | null>(null)
  const escolherContaCfg = (id: string) => {
    const c = t2tConns.find((x) => x.id === id)
    if (!c) return
    contaCfgId.current = id
    setConn(c)
    setCfg(cfgDaConta(c))
  }

  const loadConnection = useCallback(async () => {
    const tok = await token()
    if (!tok) return
    try {
      const r = await fetch("/api/mtmcopy/connection?purpose=tap_to_trade", { headers: { Authorization: `Bearer ${tok}` } })
      if (!r.ok) return
      const d = await r.json()
      // Contas T2T do user (fan-out). Se a API ainda não devolver a lista, cai para a conta única.
      const list: Conn[] = Array.isArray(d.t2t_connections) && d.t2t_connections.length
        ? d.t2t_connections
        // A MESMA regra do servidor: a conta dedicada (sem bandeira) também está no T2T, e a
        // desligada nela aparece para se poder voltar a ligar (lib/mtmcopy/alvo-t2t.ts).
        : (Array.isArray(d.connections) ? d.connections.filter((x: Conn) => apareceNoT2T(x)) : [])
      const c: Conn | null = d.connection ?? (d.connections?.[0] ?? null)
      const todas = list.length ? list : (c ? [c] : [])
      setT2tConns(todas)
      setTodasConns(Array.isArray(d.connections) && d.connections.length ? d.connections : todas)
      // A conta a configurar mantém-se entre recarregamentos (senão voltava sempre à primeira).
      const escolhida = todas.find((x) => x.id === contaCfgId.current) ?? c
      setConn(escolhida)
      if (escolhida) setCfg(cfgDaConta(escolhida))
      if (c) {
        setFollow({
          sources: Array.isArray(c.t2t_sources) ? c.t2t_sources : [],
          assetClasses: Array.isArray(c.t2t_asset_classes) ? c.t2t_asset_classes : [],
          risk: c.t2t_risk_level ?? null,
        })
      }
    } catch {
      /* ignore */
    }
  }, [token])

  const load = useCallback(async () => {
    setLoading(true)
    // "Esta semana" precisa da janela larga; "Hoje" fica-se pela curta — é o refrescar de 20s
    // que corre aqui, e 400 mensagens com conteúdo inteiro a cada 20 segundos pagam-se em egress.
    const janelaLarga = limitModeRef.current === "week"
    const tok = await token()
    let channels: string[] = []
    let senseiIds = new Set<string>()
    let senseiFilterOn = false
    if (tok) {
      try {
        const r = await fetch("/api/mtmcopy/tap-to-trade/providers", { headers: { Authorization: `Bearer ${tok}` } })
        if (r.ok) {
          const d = await r.json()
          setProviders(d.providers ?? [])
          channels = (d.channels ?? []) as string[]
          setCanaisAtivos(channels)
          if (Array.isArray(d.senseiSignalIds)) {
            senseiIds = new Set(d.senseiSignalIds as string[])
            senseiFilterOn = true
          }
        }
      } catch {
        /* ignore */
      }
    }
    setNoProviders(channels.length === 0)
    if (channels.length === 0) {
      setItems([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from("chat_messages")
      .select("id, channel_slug, content, created_at, outcome")
      .in("channel_slug", channels)
      .eq("is_deleted", false)
      // A janela larga (7 dias / 400 linhas) só se vai buscar quando o cliente PEDE histórico.
      // O refrescar automático de 20s fica com a janela curta — senão são 400 mensagens com
      // conteúdo inteiro a cada 20 segundos, por pessoa, e o egress do Supabase paga a fatura.
      .gte("created_at", new Date(Date.now() - (janelaLarga ? 7 * 86_400_000 : 36 * 3_600_000)).toISOString())
      .order("created_at", { ascending: false })
      .limit(janelaLarga ? 400 : 120)
    const all = (data ?? []) as Sig[]
    /**
     * Só os follow-ups TERMINAIS encerram uma ideia — um break-even ou um TP1 não encerram nada,
     * a trade continua a correr. E cada fecho encerra as entradas do canal que ainda estavam de
     * pé antes dele: o Premium publica o mesmo setup em várias zonas ("3.", "4.", "5. GOLD BUY
     * SETUP") e anuncia UM desfecho — sem isto ficavam todas eternamente como "expirado" e o
     * cliente nunca via quanto tinham rendido.
     */
    const terminais = all
      .filter((m) => TERMINAL_RE.test(m.content))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const entradasAsc = all
      .filter((m) => isT2TEntrySignal(m.channel_slug, m.content))
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
    const fechoDe = new Map<string, Sig | undefined>()
    for (const f of terminais) {
      const fSym = symbolOf(f.content)
      const fDir = directionOf(f.content)
      const atingidas = entradasAsc.filter((e) => {
        if (fechoDe.has(e.id)) return false
        if (e.channel_slug !== f.channel_slug) return false
        if (e.created_at >= f.created_at) return false
        const eSym = symbolOf(e.content)
        // Fecho sem par identificado refere-se ao setup do canal (é assim que se lê no chat);
        // com par identificado só encerra o mesmo par.
        if (fSym && eSym && fSym !== eSym) return false
        const eDir = directionOf(e.content)
        if (fDir && eDir && fDir !== eDir) return false
        return true
      })
      // O desfecho anunciado é UM só e pertence ao setup que estava vivo — o último publicado
      // antes do fecho. As zonas anteriores foram substituídas por ele: fecham na mesma, mas
      // SEM número. Repetir "+163 pips" em cinco cartões faria parecer cinco ganhos onde houve um.
      atingidas.forEach((e, i) => fechoDe.set(e.id, i === atingidas.length - 1 ? f : undefined))
    }
    const now = Date.now()
    const sigs = all
      .filter((m) => isT2TEntrySignal(m.channel_slug, m.content))
      // Sensei: só ideias activadas (abrem na conta provider = aparecem no chat)
      .filter((m) => m.channel_slug !== "sensei-scanner" || !senseiFilterOn || senseiIds.has(m.id))
      .map((m) => {
        const ageMs = now - new Date(m.created_at).getTime()
        // Setup pendente (nível de entrada por tocar) → janela alargada; a mercado → 5 min.
        const pendingSetup = hasEntryLevel(m.content)
        const ageExpired = ageMs > (pendingSetup ? T2T_PENDING_MAX_AGE_MS : T2T_MAX_AGE_MS)
        const resolved = fechoDe.has(m.id)
        return {
          ...m,
          expired: ageExpired || resolved,
          reason: resolved ? "resolved" : ageExpired ? "aged" : "",
        }
      })
    // Os TERMINADOS deixam de ser deitados fora: saem da lista de ideias aceitáveis (que é o
    // que "Últimos 5" mostra) e passam a formar o HISTÓRICO do dia e da semana, com o desfecho
    // em pips e percentagem ao lado do par.
    /**
     * Os sinais FICAM na lista, mesmo depois de expirarem.
     *
     * Antes desapareciam ao fim de cinco minutos, e o ecrã ficava vazio a meio da tarde sem
     * explicar porquê — quem estava a olhar não sabia se não tinha havido sinais, se o filtro
     * tinha cortado tudo, ou se a app tinha deixado de funcionar. Agora ficam, e o cartão diz o
     * que se passou: fora da zona, terminado com o resultado, ou indisponível.
     */
    setItems(sigs)

    // A direção certa de cada sinal — a do servidor, não a que se adivinha do texto.
    try {
      const ids = sigs.map((x) => x.id)
      if (ids.length) {
        const rd = await fetch(`/api/mtmcopy/signal-directions?ids=${ids.join(",")}`)
        if (rd.ok) setDirServidor(((await rd.json()) as { directions?: Record<string, string> }).directions ?? {})
      }
    } catch {
      /* sem direções do servidor — o cartão cai no texto */
    }

    // Assim que a lista chega, abre o sinal que a notificação pediu.
    if (sinalPedido.current && !jaAbriu.current) {
      const alvo = sigs.find((x) => x.id === sinalPedido.current)
      if (alvo) {
        jaAbriu.current = true
        setEcra("sinais")
        setTap({ sig: alvo, status: "confirm" })
        // Limpa o parâmetro do endereço: recarregar a página não deve reabrir o modal.
        const u = new URL(window.location.href)
        u.searchParams.delete("sinal")
        u.searchParams.delete("signal")
        window.history.replaceState({}, "", u.toString())
      }
    }
    /**
     * O que o servidor sabe de cada sinal — de TODOS, não só dos que a régua local achava vivos.
     *
     * Um sinal fechado precisa de veredito («Este sinal já fechou.») tanto como um a correr, e
     * era precisamente nos que a régua local dava por expirados que as duas apps divergiam: uma
     * perguntava ao servidor, a outra respondia sozinha.
     */
    try {
      const vivos = sigs.map((x) => x.id)
      if (vivos.length) {
        const rl = await fetch(`/api/mtmcopy/signal-live?ids=${vivos.join(",")}`)
        if (rl.ok) setAoVivo(((await rl.json()) as { live?: typeof aoVivo }).live ?? {})
      } else {
        setAoVivo({})
      }
    } catch {
      /* sem números ao vivo — o cartão continua a funcionar */
    }
    setHistorico(
      sigs
        .filter((x) => x.expired && x.reason === "resolved")
        // O desfecho VEM DA BASE DE DADOS (uma conta só, feita pelo servidor). O cálculo local
        // fica como rede para sinais ainda não processados.
        .map((x) => ({ ...x, desfecho: x.outcome?.label || desfechoDoSinal(x, fechoDe.get(x.id)) })),
    )
    // Quais destes sinais o utilizador já aceitou (persiste entre reloads)
    if (tok) {
      try {
        const ra = await fetch("/api/mtmcopy/tap-to-trade/accepted", { headers: { Authorization: `Bearer ${tok}` } })
        if (ra.ok) {
          const da = await ra.json()
          setAccepted(da.accepted ?? {})
        }
      } catch {
        /* ignore */
      }
    }
    setLoading(false)
  }, [token])

  useEffect(() => {
    load()
    loadConnection()
    // Sinais novos aparecem sozinhos: refresca a cada 20s e sempre que a app volta ao foco
    // (sem isto o tab só carregava ao montar → sinais publicados depois não surgiam).
    const iv = setInterval(load, 20000)
    const onVis = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") load()
    }
    if (typeof document !== "undefined") document.addEventListener("visibilitychange", onVis)
    return () => {
      clearInterval(iv)
      if (typeof document !== "undefined") document.removeEventListener("visibilitychange", onVis)
    }
  }, [load, loadConnection])

  // Vindo de /automation ("Ativar Tap to Trade") → abre logo a config/ligação da conta
  useEffect(() => {
    if (searchParams?.get("setup") === "1") { setEcra("conta"); setShowConfig(true) }
  }, [searchParams])

  // Deep-link: notificação T2T → abrir directamente a confirmação da trade (1× por sinal —
  // sem o guard, o efeito reabria o modal sempre que `items` recarregava depois de o fechar).
  const [deepLinkHandled, setDeepLinkHandled] = useState<string | null>(null)
  useEffect(() => {
    const sigId = searchParams?.get("signal") || searchParams?.get("msg")
    // O guard e por SINAL: um sinal diferente reabre; o mesmo nao reabre sozinho quando a
    // lista recarrega. Tocar outra vez na notificacao do mesmo sinal volta a trazer o URL e,
    // como o utilizador ja saiu do modal, faz sentido reabrir -- por isso limpa-se o guard
    // quando o modal e fechado (ver setTap(null) mais abaixo).
    if (!sigId || deepLinkHandled === sigId) return
    setDeepLinkHandled(sigId)
    const found = items.find((s) => s.id === sigId)
    if (found) {
      setTap({ sig: found, status: "confirm" })
      return
    }
    // não está na lista carregada → vai buscar a mensagem directamente
    let cancelled = false
    ;(async () => {
      const { data } = await supabase
        .from("chat_messages")
        .select("id, channel_slug, content, created_at")
        .eq("id", sigId)
        .maybeSingle()
      if (!cancelled && data) setTap({ sig: data as Sig, status: "confirm" })
    })()
    return () => {
      cancelled = true
    }
  }, [searchParams, items, deepLinkHandled])

  // Pré-visualização: corre quando o modal abre. Se falhar, o modal continua a funcionar com
  // o texto do sinal — nunca bloqueia a aceitação por causa de números que não chegaram.
  useEffect(() => {
    if (!tap || tap.status !== "confirm") { setPreview(null); setOndeAbrir(null); setBloqueadasAbertas(false); return }
    let cancelado = false
    setPreviewBusy(true)
    ;(async () => {
      try {
        const tok = await token()
        if (!tok) return
        const r = await fetch(`/api/mtmcopy/tap-to-trade/preview?chat_message_id=${encodeURIComponent(tap.sig.id)}`, {
          headers: { Authorization: `Bearer ${tok}` },
        })
        if (!r.ok) return
        const j = (await r.json()) as TapPreview
        if (cancelado) return
        setPreview(j)
        // Pré-marcar: a escolha da vez passada, se ainda fizer sentido; senão TODAS — que é o
        // comportamento de sempre para quem nunca escolheu, e nunca uma surpresa ao contrário
        // (ninguém fica sem abrir numa conta por não ter reparado numa caixa).
        const todas = [...j.accounts.map((a) => a.id), ...(j.simuladas ?? []).map((x) => x.ref)]
        setOndeAbrir(j.escolhidas?.length ? j.escolhidas.filter((ref) => todas.includes(ref)) : todas)
      } catch {
        /* fica sem números — o texto do sinal chega para decidir */
      } finally {
        if (!cancelado) setPreviewBusy(false)
      }
    })()
    return () => { cancelado = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tap?.sig.id, tap?.status])

  const filtered = items
    // "O que seguir" é a ÚNICA filtragem: fontes + classes de ativo que o user escolheu ([]=todas).
    .filter((s) => matchesT2TPrefs(s.channel_slug, s.content, { sources: follow.sources, assetClasses: follow.assetClasses }))
  // Passar a "Esta semana" muda a janela que se vai buscar → recarrega uma vez, e só então.
  useEffect(() => {
    const anterior = limitModeRef.current
    limitModeRef.current = limitMode
    if (anterior !== "week" && limitMode === "week") load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitMode])

  const inicioDoDia = new Date(); inicioDoDia.setHours(0, 0, 0, 0)
  const desde = limitMode === "today" ? inicioDoDia.getTime() : Date.now() - 7 * 86_400_000
  const naJanela = (x: { created_at: string }) => new Date(x.created_at).getTime() >= desde
  const historicoFiltrado = historico.filter((x) =>
    matchesT2TPrefs(x.channel_slug, x.content, { sources: follow.sources, assetClasses: follow.assetClasses }),
  )
  // "Últimos 5" = os cinco sinais MAIS RECENTES, seja qual for o estado deles. Antes só contava
  // os ainda aceitáveis, e como um setup expira em minutos o separador aparecia vazio a quem
  // vinha ver o que tinha saído.
  const semCriptoAqui = useSemCripto()
  const shown = filtered.filter(naJanela).filter((x) => !fonteVista || x.channel_slug === fonteVista)
    // App iOS: sem sinais de cripto nem «TAP to Copy» (Guideline 3.1.5 — lib/ios-sem-cripto.ts).
    .filter((x) => !semCriptoAqui || !mensagemCripto(x.channel_slug, x.content))
  const historicoVisivel = historicoFiltrado.filter(naJanela)

  const runTap = async () => {
    if (!tap) return
    const sig = tap.sig
    setTap({ sig, status: "loading" })
    try {
      const tok = await token()
      if (!tok) {
        setTap({ sig, status: "error", message: t("t2t.sessionUnavailableLogin") })
        return
      }
      const res = await fetch("/api/mtmcopy/tap-to-trade", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        // `contas` só segue quando houve mesmo uma escolha a fazer (mais do que um destino). Sem
        // ela, a rota faz o que sempre fez — abre em todas as contas elegíveis.
        body: JSON.stringify(
          preview?.escolhaPossivel && ondeAbrir ? { chat_message_id: sig.id, contas: ondeAbrir } : { chat_message_id: sig.id },
        ),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // Já aceite anteriormente (idempotência) → marca o cartão como aceite
        if (res.status === 409 || data.code === "already_accepted") {
          setAccepted((a) => ({ ...a, [sig.id]: "open" }))
          setTap({ sig, status: "error", message: data.error || t("t2t.alreadyAcceptedMsg") })
          return
        }
        setTap({ sig, status: "error", message: data.error || t("t2t.openTradeFailed") })
        return
      }
      setAccepted((a) => ({ ...a, [sig.id]: "open" }))
      // Contas pedidas que o SERVIDOR recusou (mestre da casa, em pausa, T2T desligado, de outra
      // pessoa). Saltá-las em silêncio parecia uma avaria — e esconder uma recusa é pior do que a
      // recusa. A lista no ecrã é conveniência; quem decide onde abre é sempre o servidor.
      const recusadas: string[] = Array.isArray(data.recusadas) ? data.recusadas : []
      setTap({
        sig,
        status: "done",
        message: `${data.message || t("t2t.tradeOpened")}${recusadas.length ? ` · ${recusadas.length} conta${recusadas.length === 1 ? "" : "s"} que escolheste já não podia receber este sinal.` : ""}`,
      })
    } catch (e) {
      setTap({ sig, status: "error", message: e instanceof Error ? e.message : t("t2t.unexpectedError") })
    }
  }

  const saveConfig = async () => {
    if (!conn || !cfg) return
    setSavingConn(true)
    try {
      const tok = await token()
      if (!tok) return
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${tok}` }
      // risco + SL/TP + proteção (trailing) + alocação de take profit
      await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers,
        body: JSON.stringify({
          connection_id: conn.id,
          lot_mode: cfg.lot_mode,
          max_risk_percent: cfg.risk,
          lot_value: cfg.lot,
          copy_sl: cfg.copy_sl,
          copy_tp: cfg.copy_tp,
          auto_trailing_stop: cfg.trailing,
          trailing_stop_points: cfg.trailingPts,
          exit_pct_tp1: cfg.tp1,
          exit_pct_tp2: cfg.tp2,
          exit_pct_tp3: cfg.tp3,
        }),
      })
      await loadConnection()
      setShowConfig(false)
    } finally {
      setSavingConn(false)
    }
  }

  // Atualiza LOCALMENTE as prefs "O que seguir" (marca por-guardar) — só persiste no botão Guardar.
  /**
   * As fontes que estão MESMO ligadas no Tap to Trade.
   *
   * Vem de `channels` (o que o servidor devolve como ativo), não de uma lista fixa: uma lista
   * fixa mostrava fontes desligadas, e deixar alguém marcar uma fonte que não existe é prometer
   * sinais que nunca vão chegar.
   */
  const fontesAtivas = useMemo(
    () =>
      [...new Set(canaisAtivos)]
        .map((slug) => ({ key: t2tSourceKey(slug, null) || slug, label: CHANNEL_LABEL[slug] ?? slug, slug }))
        .filter((f: { key: string; label: string; slug: string }, i: number, xs: { slug: string }[]) => xs.findIndex((y) => y.slug === f.slug) === i),
    [canaisAtivos],
  )

  /** Liga/desliga uma fonte. Vazio quer dizer TODAS — é o default e o mais útil. */
  const toggleFonte = (key: string) => {
    const todas = fontesAtivas.map((f: { key: string }) => f.key)
    const atuais = follow.sources.length === 0 ? todas : follow.sources
    const proximas = atuais.includes(key) ? atuais.filter((k: string) => k !== key) : [...atuais, key]
    // Marcar tudo é o mesmo que não filtrar nada — grava-se vazio, que é mais simples de ler.
    setFollowLocal({ ...follow, sources: proximas.length === todas.length ? [] : proximas })
  }

  const setFollowLocal = (next: { sources: string[]; assetClasses: string[]; risk: string | null }) => {
    setFollow(next)
    setFollowDirty(true)
    setFollowMsg(null)
  }
  /**
   * PERSISTE as prefs (botão Guardar). O risco também aplica o sizing por %.
   *
   * O resultado do pedido é VERIFICADO. Antes fazia-se `await fetch(...)` sem olhar para a
   * resposta: se a gravação falhasse — sessão expirada, rede, 500 — o botão passava na mesma a
   * "Guardado ✓" e o cliente ficava convencido de que tinha guardado filtros que nunca foram
   * gravados.
   */
  const persistFollow = async () => {
    if (!conn) return
    setSavingFollow(true)
    setFollowMsg(null)
    try {
      const tok = await token()
      if (!tok) {
        setFollowMsg({ tipo: "erro", texto: t("t2t.sessionExpired") })
        return
      }
      const body: Record<string, unknown> = {
        connection_id: conn.id,
        t2t_sources: follow.sources,
        t2t_asset_classes: follow.assetClasses,
        t2t_risk_level: follow.risk,
      }
      if (follow.risk && RISK_PRESET[follow.risk] != null) {
        body.lot_mode = "risk_percent"
        body.max_risk_percent = RISK_PRESET[follow.risk]
      }
      const res = await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setFollowMsg({ tipo: "erro", texto: j.error || `${t("t2t.saveFailed")} (${res.status})` })
        return
      }
      await loadConnection()
      setFollowDirty(false)
      const quantas = follow.sources.length + follow.assetClasses.length
      setFollowMsg({
        tipo: "ok",
        texto: quantas === 0 ? t("t2t.savedAllSources") : t("t2t.savedFilters"),
      })
      setTimeout(() => setFollowMsg((m) => (m?.tipo === "ok" ? null : m)), 4000)
    } catch (e) {
      setFollowMsg({ tipo: "erro", texto: e instanceof Error ? e.message : t("t2t.saveFailed") })
    } finally {
      setSavingFollow(false)
    }
  }
  const toggleFollow = (kind: "sources" | "assetClasses", key: string) => {
    const cur = follow[kind]
    const nextArr = cur.includes(key) ? cur.filter((x) => x !== key) : [...cur, key]
    setFollowLocal({ ...follow, [kind]: nextArr })
  }

  /**
   * Esta conta está no Tap to Trade? A MESMA função do servidor — importada, não copiada: a regra
   * estava aqui escrita à mão e o interruptor podia passar a mentir sobre o que ia acontecer.
   */
  const noT2T = (c: Conn) => recebeT2T(c)

  // Liga/desliga o T2T (fan-out) numa conta. Aceitar um sinal abre em TODAS as contas ligadas.
  const toggleAccountT2T = async (id: string, enabled: boolean) => {
    setTogglingId(id)
    try {
      const tok = await token()
      if (!tok) return
      await fetch("/api/mtmcopy/connection", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ connection_id: id, t2t_enabled: enabled }),
      })
      await loadConnection()
    } finally {
      setTogglingId(null)
    }
  }

  const emergencyStop = async () => {
    if (!window.confirm(t("t2t.confirmCloseAll"))) return
    setClosingAll(true)
    try {
      const tok = await token()
      if (!tok) return
      const res = await fetch("/api/mtmcopy/tap-to-trade/close-all", {
        method: "POST",
        headers: { Authorization: `Bearer ${tok}` },
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { window.alert(data.error || t("t2t.closePositionsFailed")); return }
      window.alert(`${t("t2t.closedResultPre")}${data.closed ?? 0}${t("t2t.closedResultMid")}${data.total ?? 0}${t("t2t.closedResultSuf")}`)
      await load()
    } catch (e) {
      window.alert(e instanceof Error ? e.message : t("t2t.unexpectedError"))
    } finally {
      setClosingAll(false)
    }
  }

  // Pronta a operar (conta MetaApi criada e ligada à corretora).
  const isReady = (!!conn?.metaapi_account_id || (conn?.mt5_platform === "tradelocker" && !!conn?.tl_account_id) || (conn?.mt5_platform === "mtmfunded" && !!conn?.funded_account_id && conn?.funded_somente_leitura !== true)) && conn?.mt5_status === "connected"
  const riskLabel = cfg
    ? cfg.lot_mode === "fixed"
      ? `${cfg.lot}${t("t2t.lotFixedSuffix")}`
      : `${cfg.risk}${t("t2t.riskPerTradeSuffix")}`
    : "—"

  return (
    /* O separador inteiro veste a MTM Auto: mesmo fundo, mesma superfície, mesmo dourado. Não é
       decoração — é a mesma conta e os mesmos sinais nas duas apps, e vê-los com duas caras
       diferentes fazia parecer que eram dois produtos que por acaso se parecem. */
    <div className="mtmauto px-3 pt-3 pb-24">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-black tracking-tight flex items-center gap-2">
          <Zap className="w-5 h-5 text-[#D2A63C]" /> MTM <span className="text-[#D2A63C]">Auto</span>
          <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-500">Tap to Trade</span>
        </h1>
        <button onClick={load} disabled={loading} className="p-2 rounded-lg border border-zinc-700 text-zinc-400" aria-label={t("t2t.refresh")}>
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </button>
      </div>
      <p className="text-xs text-zinc-400 mb-3">
        {t("t2t.introBefore")}<strong className="text-zinc-200">{t("t2t.yourAccount")}</strong>{t("t2t.introAfter")}
      </p>

      {/* Os quatro ecrãs da MTM Auto. A ordem é a de lá: primeiro o que há para fazer agora
          (Sinais), depois o que se segue, depois o que já aconteceu, e só no fim a conta. */}
      <div className="mb-3 flex gap-1 rounded-xl border border-zinc-800 bg-zinc-950/60 p-1">
        {([
          ["sinais", "Sinais"],
          ["estrategias", "Estratégias"],
          ["historico", "Histórico"],
          ["conta", "Conta"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setEcra(id)}
            className={`flex-1 rounded-lg py-1.5 text-[12.5px] font-semibold transition-colors ${
              ecra === id ? "bg-[#D2A63C] text-black" : "text-zinc-400"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {ecra === "estrategias" && (
        <MtmAutoEstrategias
          fontes={fontesAtivas.map((f: { key: string; label: string }) => ({
            ...f,
            // Sem escolha guardada, recebe-se TUDO — é o default e é o mais útil.
            ligada: follow.sources.length === 0 || follow.sources.includes(f.key),
          }))}
          onToggleFonte={toggleFonte}
          porGuardar={followDirty}
          aGuardarFontes={savingFollow}
          onGuardarFontes={persistFollow}
        />
      )}

      {/* ── CONTA ────────────────────────────────────────────────────────────────────────────
          Três secções, por esta ordem, para os sistemas novos encaixarem sem mexer no resto:
            1. Contas ligadas — o ligador único (MT5, MT4, TradeLocker, MTM Funded), o mesmo da
               área de membro no site (components/contas/ligador-contas.tsx).
            2. Execução — o que cada conta faz com as ideias: Tap to Trade por conta, risco,
               fontes (nas Estratégias) e as definições das contas MTM Auto.
            3. Limites e plano — quota de contas MetaTrader e o caminho do upgrade. */}
      {ecra === "conta" && (
        <div className="space-y-5">
          <MtmAutoMetricas />

          <section>
            <ListaContas estado={ligador} onMudou={loadConnection} />
          </section>

          <CopiasEntreContas estado={ligador} />

          <section className="space-y-3">
            <p className="etiqueta">Execução</p>

            {t2tConns.length === 0 ? (
              <p className="cartao p-3 text-[12px] text-zinc-400">{t("t2t.linkOnceHelp")}</p>
            ) : (
              <div className="cartao p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-white">Contas no Tap to Trade</span>
                  <span className="text-[10px] text-zinc-500">{todasConns.filter((c) => noT2T(c) && c.is_active !== false).length} de {todasConns.length} ativa(s)</span>
                </div>
                <p className="text-[10px] leading-snug text-zinc-500">Aceitar uma ideia abre em <strong className="text-zinc-300">todas</strong> as contas ligadas aqui, cada uma com o risco pelo seu próprio saldo.</p>
                {todasConns.map((c) => {
                  const on = noT2T(c)
                  const soLeitura = c.mt5_platform === "mtmfunded" && c.funded_somente_leitura === true
                  return (
                    <div key={c.id} className="flex items-center justify-between rounded-lg border border-zinc-800 bg-black/30 px-2.5 py-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[12px] font-semibold text-white truncate">
                          <Wallet className="w-3.5 h-3.5 text-[#D2A63C] shrink-0" /> {c.account_label || t("t2t.mt5Account")}
                          {c.mt5_platform === "tradelocker" && <TradeLockerBadge />}
                          {c.mt5_platform === "mtmfunded" && <MtmFundedBadge />}
                          {soLeitura && <SoLeituraBadge />}
                        </div>
                        <div className="text-[10px] text-zinc-500 truncate">
                          {c.mt5_login ?? (c.tl_account_id ? `#${c.tl_account_id}` : "—")} · {c.mt5_server || "—"}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={togglingId === c.id || soLeitura}
                        onClick={() => toggleAccountT2T(c.id, !on)}
                        aria-label={on ? t("t2t.disableT2TAccount") : t("t2t.enableT2TAccount")}
                        className={`relative ml-2 h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on && !soLeitura ? "bg-[#D2A63C]" : "bg-zinc-700"}`}
                      >
                        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${on && !soLeitura ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                    </div>
                  )
                })}
              </div>
            )}

            {conn && cfg && (
              <div className="cartao overflow-hidden">
                <button onClick={() => setShowConfig((v) => !v)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                  <Settings className="w-4 h-4 text-[#D2A63C]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold">Risco e saídas</p>
                    <p className="text-[11px] text-zinc-400 truncate">{conn.account_label || t("t2t.mt5Account")} · {riskLabel}</p>
                  </div>
                  {showConfig ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
                </button>
                {showConfig && (
                  <div className="px-3 pb-3 border-t border-zinc-800 pt-3 space-y-3">
                    {t2tConns.length > 1 && (
                      <label className="block">
                        <span className="text-[11px] text-zinc-500">Conta a configurar</span>
                        <select
                          value={conn.id}
                          onChange={(e) => escolherContaCfg(e.target.value)}
                          className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white"
                        >
                          {t2tConns.map((c) => (
                            <option key={c.id} value={c.id}>{c.account_label || t("t2t.mt5Account")} · {c.mt5_login ?? c.tl_account_id ?? "—"}</option>
                          ))}
                        </select>
                      </label>
                    )}

                    <div>
                      <p className="text-[11px] text-zinc-500 mb-1.5">{t("t2t.positionSize")}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => setCfg({ ...cfg, lot_mode: "risk_percent" })}
                          className={`rounded-xl border py-2 text-xs font-medium ${cfg.lot_mode === "risk_percent" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                        >
                          {t("t2t.riskPercentMode")}
                        </button>
                        <button
                          onClick={() => setCfg({ ...cfg, lot_mode: "fixed" })}
                          className={`rounded-xl border py-2 text-xs font-medium ${cfg.lot_mode === "fixed" ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"}`}
                        >
                          {t("t2t.fixedLot")}
                        </button>
                      </div>
                    </div>

                    {cfg.lot_mode === "risk_percent" ? (
                      <label className="block">
                        <span className="text-[11px] text-zinc-500">{t("t2t.riskPerTrade")}</span>
                        <input type="number" step="0.1" min="0.1" max="20" value={cfg.risk}
                          onChange={(e) => setCfg({ ...cfg, risk: parseFloat(e.target.value) || 0 })}
                          className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white" />
                      </label>
                    ) : (
                      <label className="block">
                        <span className="text-[11px] text-zinc-500">{t("t2t.fixedLot")}</span>
                        <input type="number" step="0.01" min="0.01" value={cfg.lot}
                          onChange={(e) => setCfg({ ...cfg, lot: parseFloat(e.target.value) || 0 })}
                          className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white" />
                      </label>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setCfg({ ...cfg, copy_sl: !cfg.copy_sl })}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cfg.copy_sl ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
                      >
                        <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5" /> {t("t2t.copySl")}</span>
                        <span className="font-bold">{cfg.copy_sl ? t("t2t.on") : t("t2t.off")}</span>
                      </button>
                      <button
                        onClick={() => setCfg({ ...cfg, copy_tp: !cfg.copy_tp })}
                        className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${cfg.copy_tp ? "border-emerald-500/40 text-emerald-400" : "border-zinc-700 text-zinc-500"}`}
                      >
                        <span className="flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" /> {t("t2t.copyTp")}</span>
                        <span className="font-bold">{cfg.copy_tp ? t("t2t.on") : t("t2t.off")}</span>
                      </button>
                    </div>

                    <div className="rounded-xl border border-zinc-800 p-2.5">
                      <button onClick={() => setCfg({ ...cfg, trailing: !cfg.trailing })} className="w-full flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1 text-zinc-300"><ShieldCheck className="w-3.5 h-3.5 text-[#D2A63C]" /> {t("t2t.trailingAuto")}</span>
                        <span className={`font-bold ${cfg.trailing ? "text-emerald-400" : "text-zinc-500"}`}>{cfg.trailing ? t("t2t.on") : t("t2t.off")}</span>
                      </button>
                      {cfg.trailing && (
                        <label className="block mt-2">
                          <span className="text-[11px] text-zinc-500">{t("t2t.trailingDistance")}</span>
                          <input type="number" step="10" min="10" value={cfg.trailingPts}
                            onChange={(e) => setCfg({ ...cfg, trailingPts: parseInt(e.target.value) || 0 })}
                            className="mt-1 w-full rounded-xl bg-zinc-950 border border-zinc-700 px-3 py-2 text-sm text-white" />
                        </label>
                      )}
                    </div>

                    <div className="rounded-xl border border-zinc-800 p-2.5">
                      <p className="text-[11px] text-zinc-500 mb-2">{t("t2t.tpAllocation")}</p>
                      {([["TP1", "tp1"], ["TP2", "tp2"], ["TP3", "tp3"]] as const).map(([label, key]) => (
                        <div key={key} className="flex items-center gap-2 mb-1.5">
                          <span className="text-xs text-zinc-400 w-9">{label}</span>
                          <input type="number" step="5" min="0" max="100" value={cfg[key]}
                            onChange={(e) => setCfg({ ...cfg, [key]: parseInt(e.target.value) || 0 })}
                            className="flex-1 rounded-lg bg-zinc-950 border border-zinc-700 px-2 py-1.5 text-sm text-white" />
                          <span className="text-xs text-zinc-500">%</span>
                        </div>
                      ))}
                      <div className={`text-[11px] mt-1 ${cfg.tp1 + cfg.tp2 + cfg.tp3 === 100 ? "text-emerald-400" : "text-amber-400"}`}>
                        {t("t2t.totalLabel")} {cfg.tp1 + cfg.tp2 + cfg.tp3}%{cfg.tp1 + cfg.tp2 + cfg.tp3 !== 100 ? t("t2t.mustSum100") : ""}
                      </div>
                    </div>

                    <button onClick={saveConfig} disabled={savingConn} className="w-full rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 disabled:opacity-60">
                      {savingConn ? t("t2t.saving") : t("t2t.saveConfig")}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Fontes e estratégias: vivem no ecrã Estratégias (interruptores). Aqui só o atalho. */}
            <button
              onClick={() => setEcra("estrategias")}
              className="cartao w-full flex items-center justify-between px-3 py-2.5 text-left text-[12.5px] text-zinc-300"
            >
              <span>Fontes e estratégias que recebes</span>
              <span className="text-[#D2A63C] font-semibold">Estratégias →</span>
            </button>

            {/* Definições das contas MTM Auto (risco, proteção, limites diários) — só se houver. */}
            {ligador.contas.some((c) => c.origem === "auto") && (
              <div>
                <p className="text-[11px] text-zinc-500 mb-1.5">Contas MTM Auto</p>
                <MtmAutoPainel apenas="definicoes" />
              </div>
            )}

            {t2tConns.length > 0 && (
              <div className="pt-1">
                <button
                  onClick={emergencyStop}
                  disabled={closingAll}
                  className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-rose-500/40 text-rose-400 font-semibold text-[13px] py-2.5 disabled:opacity-60"
                >
                  <ShieldCheck className="w-4 h-4" /> {closingAll ? t("t2t.closing") : t("t2t.emergencyStop")}
                </button>
                <p className="text-[10px] text-zinc-500 mt-1.5 text-center">{t("t2t.emergencyStopHelp")}</p>
              </div>
            )}
          </section>

          <section>
            <LimitesPlano estado={ligador} />
          </section>
        </div>
      )}

      {/* O «O que seguir» saiu daqui (27/08). Escolher fontes, ativos e risco por chips era uma
          segunda configuração ao lado da que já existe no MTM Auto — e duas telas a decidir a
          mesma coisa acabam sempre a discordar. O risco e as fontes definem-se nas Definições e
          nas Estratégias do MTM Auto, que é onde a conta vive. As preferências já gravadas
          continuam a valer na filtragem; o que desapareceu foi o segundo sítio para as mexer. */}

      {/* «Estratégias ativas» (automatizadas) removido: o Tap to Trade é MANUAL — segue os CHATS
          conforme o «O que seguir» (fontes + ativo + risco), não as estratégias de cópia auto. */}

      {(ecra === "sinais" || ecra === "historico") && (
      <>
      {/* FILTRO DE VISTA por fonte. É só para OLHAR: não mexe no que se recebe (isso são as
          Estratégias, com os interruptores verde/vermelho). Ter as duas coisas no mesmo sítio
          fazia com que esconder uma fonte da vista a desligasse também das notificações — que é
          o oposto do que quem filtra uma lista está a pedir. */}
      {fontesAtivas.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFonteVista(null)}
            className="rounded-full px-3 py-1.5 text-[11.5px] font-medium"
            style={
              fonteVista == null
                ? { border: "1px solid var(--destaque-borda)", background: "var(--destaque-suave)", color: "var(--destaque)" }
                : { border: "1px solid var(--borda)", color: "color-mix(in srgb, var(--texto) 55%, transparent)" }
            }
          >
            Todas
          </button>
          {fontesAtivas.map((f: { key: string; label: string; slug: string }) => (
            <button
              key={f.slug}
              onClick={() => setFonteVista((v) => (v === f.slug ? null : f.slug))}
              className="rounded-full px-3 py-1.5 text-[11.5px] font-medium"
              style={
                fonteVista === f.slug
                  ? { border: "1px solid var(--destaque-borda)", background: "var(--destaque-suave)", color: "var(--destaque)" }
                  : { border: "1px solid var(--borda)", color: "color-mix(in srgb, var(--texto) 55%, transparent)" }
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      )}

      {/* Alcance. "Todos" era uma lista sem fim de setups aceitáveis e sem histórico nenhum;
          passa a Hoje / Esta semana, que é como se olha para o dia de trading. */}
      <div className="flex items-center gap-1.5 mb-2">
        {([
          ["today", t("t2t.today")],
          ["week", t("t2t.thisWeek")],
        ] as const).map(([modo, rotulo]) => (
          <button
            key={modo}
            onClick={() => setLimitMode(modo)}
            className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-colors ${
              limitMode === modo ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]" : "border-zinc-700 text-zinc-400"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      {/* A escolha das fontes vive nas ESTRATÉGIAS, com interruptores verde/vermelho. Tê-la
          também aqui era o mesmo controlo em dois sítios — e dois sítios acabam por discordar. */}

      {/* Filtro por categoria removido: duplicava o «Ativo» do «O que seguir» (ouro/forex/cripto/
          índices). O feed já é filtrado pelas prefs em matchesT2TPrefs. */}

      {loading && items.length === 0 ? (
        <div className="flex justify-center py-16"><Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" /></div>
      ) : (ecra === "sinais" ? shown.length === 0 : historicoVisivel.length === 0) ? (
        /* O vazio é por ECRÃ. Antes exigia que as duas listas estivessem vazias, e por isso o
           ecrã dos Sinais sem sinais frescos não mostrava nada — nem cartões, nem explicação. */
        <div className="text-center py-16 text-zinc-500 text-sm">
          <TrendingUp className="w-10 h-10 mx-auto mb-3 text-zinc-700" />
          {noProviders
            ? t("t2t.noProviders")
            : t("t2t.noSignals")}
        </div>
      ) : (
        <div className="space-y-2.5">
          {ecra === "sinais" && shown.map((s) => {
            const f = parseSignalFields(s.content)
            // A direção do SERVIDOR manda; o texto é só o plano B.
            const dir = resolveDirectionLabel(dirServidor[s.id], s.content) || f.direction
            // Card harmonizado quando conseguimos ler símbolo + direção; senão cai no texto cru.
            const structured = Boolean(f.symbol && dir)
            return (
              /* O cartão é o da app MTM Auto, à letra: moldura em gradiente, iniciais da fonte,
                 direção e idade à esquerda, par e estado à direita, e a linha ENTRY / STOP / TP1
                 que se lê de relance antes de decidir. */
              <div key={s.id} className="moldura-brilho" style={{ opacity: vereditoDoCartao(s, aoVivo[s.id]) ? 0.62 : 1 }}>
              <div className="p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[12.5px] font-semibold"
                      style={{ background: "var(--destaque-suave)", color: "var(--destaque)" }}
                    >
                      {iniciaisDaFonte(CHANNEL_LABEL[s.channel_slug] ?? s.channel_slug)}
                    </span>
                    <div>
                      <p className="text-[14.5px] font-semibold leading-tight">
                        {CHANNEL_LABEL[s.channel_slug] ?? s.channel_slug}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[12px]">
                        {dir && (
                          <span className="font-semibold" style={{ color: dir === "BUY" ? "var(--sucesso)" : "var(--perigo)" }}>
                            {dir === "BUY" ? "↗ BUY" : "↘ SELL"}
                          </span>
                        )}
                        <span className="texto-mais-fraco">· {idadeCurta(s.created_at)}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[15.5px] font-bold tracking-wide">{f.symbol || "—"}</p>
                    <span
                      className="mt-0.5 inline-block rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide"
                      style={
                        accepted[s.id]
                          ? { background: "var(--sucesso-suave)", color: "var(--sucesso)" }
                          : vereditoDoCartao(s, aoVivo[s.id])
                            ? { background: "var(--perigo-suave)", color: "var(--perigo)" }
                            : { background: "var(--destaque-suave)", color: "var(--destaque)" }
                      }
                    >
                      {accepted[s.id] ? t("t2t.statusAccepted") : vereditoDoCartao(s, aoVivo[s.id]) ? t("t2t.expired") : t("t2t.statusActive")}
                    </span>
                  </div>
                </div>

                {structured ? (
                  <>
                    <div className="mt-2.5 flex gap-1.5">
                      <div className="nivel min-w-0">
                        <p className="etiqueta">{t("t2t.entry")}</p>
                        <p className="mt-0.5 text-[14.5px] font-semibold tabular-nums">{f.entry == null || f.entry === "Mercado" ? t("t2t.market") : Number.isFinite(Number(f.entry)) ? precoLegivel(f.entry, f.symbol || "") : f.entry}</p>
                      </div>
                      <div className="nivel min-w-0">
                        <p className="etiqueta">{t("t2t.stopLoss")}</p>
                        <p className="mt-0.5 text-[14.5px] font-semibold tabular-nums" style={{ color: "var(--perigo)" }}>
                          {precoLegivel(f.sl, f.symbol || "")}
                        </p>
                      </div>
                      <div className="nivel min-w-0">
                        <p className="etiqueta">TP1</p>
                        <p className="mt-0.5 text-[14.5px] font-semibold tabular-nums" style={{ color: "var(--sucesso)" }}>
                          {precoLegivel(f.tps[0], f.symbol || "")}
                        </p>
                      </div>
                      {f.tps.length > 1 && (
                        <button
                          onClick={() => setAlvosAbertos((m) => ({ ...m, [s.id]: !m[s.id] }))}
                          aria-expanded={Boolean(alvosAbertos[s.id])}
                          className="grid w-9 shrink-0 place-items-center rounded-xl text-[11.5px] font-semibold"
                          style={{ background: "var(--destaque-suave)", color: "var(--destaque)" }}
                        >
                          {alvosAbertos[s.id] ? "×" : `+${f.tps.length - 1}`}
                        </button>
                      )}
                    </div>

                    {alvosAbertos[s.id] && f.tps.length > 1 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {f.tps.slice(1).map((tp, i) => (
                          <div key={i} className="nivel">
                            <p className="etiqueta">TP{i + 2}</p>
                            <p className="mt-0.5 text-[14.5px] font-semibold tabular-nums" style={{ color: "var(--sucesso)" }}>{precoLegivel(tp, f.symbol || "")}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Ideia MTM → conta simulada MTM Funded. Só pré-preenche: a conta e a confirmação são do trader. */}
                    {f.symbol && dir && !vereditoDoCartao(s, aoVivo[s.id]) && (
                      <a
                        href={`/app-mobile?${new URLSearchParams({
                          tab: "funded", symbol: f.symbol, dir: dir === "BUY" ? "buy" : "sell",
                          ...(f.sl ? { sl: f.sl.replace(",", ".") } : {}),
                          ...(f.tps[0] ? { tp: f.tps[0].replace(",", ".") } : {}),
                          origem: "ideia_mtm", ref: String(s.id),
                        }).toString()}`}
                        className="mt-2 block text-center text-[11.5px] font-semibold"
                        style={{ color: "var(--destaque)" }}
                      >
                        Negociar na conta simulada (MTM Funded) →
                      </a>
                    )}

                    {/* O que a trade vale AGORA. Sem isto, o cartão de um sinal vivo não diz se
                        está a ganhar ou a perder — e é isso que decide se vale a pena entrar. */}
                    {aoVivo[s.id]?.pips != null && (
                      <div
                        className="mt-2 flex items-center justify-between rounded-xl px-3 py-2"
                        style={{ background: "color-mix(in srgb, var(--fundo) 60%, transparent)" }}
                      >
                        <span className="etiqueta">{t("t2t.fromEntry")}</span>
                        <span
                          className="text-[14.5px] font-bold tabular-nums"
                          style={{ color: (aoVivo[s.id]!.pips ?? 0) >= 0 ? "var(--sucesso)" : "var(--perigo)" }}
                        >
                          {(aoVivo[s.id]!.pips ?? 0) >= 0 ? "+" : ""}{aoVivo[s.id]!.pips} pips
                          {aoVivo[s.id]!.pct != null && (
                            <span className="ml-1.5 text-[12px] font-normal texto-mais-fraco">
                              {(aoVivo[s.id]!.pct ?? 0) >= 0 ? "+" : ""}{aoVivo[s.id]!.pct}%
                            </span>
                          )}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="mt-2 whitespace-pre-wrap break-words text-[13px] leading-snug line-clamp-5 texto-fraco">
                    {s.content}
                  </p>
                )}
                {accepted[s.id] ? (
                  <div className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500/15 text-emerald-400 font-semibold text-[12px] py-2.5">
                    <ShieldCheck className="w-4 h-4" />
                    {accepted[s.id] === "closed" ? t("t2t.acceptedClosed")
                      : accepted[s.id] === "error" ? t("t2t.acceptedError")
                      : t("t2t.alreadyAccepted")}
                  </div>
                ) : (aoVivo[s.id]?.desfecho ?? s.desfecho) ? (
                  /* Sinal terminado: o que interessa saber é quanto rendeu, não que expirou. O
                     número é o do servidor (`outcome_label`) — o MESMO que o cartão do /sinais da
                     MTM Auto mostra. Neste separador o desfecho nunca chegava a aparecer na lista
                     (só no bloco do histórico), e o mesmo sinal fechado dizia «+163 pips» numa app
                     e «Sinal indisponível» na outra. */
                  <div className={`mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl font-semibold text-[12px] py-2.5 ${
                    (aoVivo[s.id]?.desfecho ?? s.desfecho ?? "").startsWith("+") ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400"
                  }`}>
                    🏁 {t("t2t.reasonResolved")} · {aoVivo[s.id]?.desfecho ?? s.desfecho}
                  </div>
                ) : vereditoDoCartao(s, aoVivo[s.id]) ? (
                  /* NÃO se aceita — e o motivo é o do SERVIDOR, o mesmo que o /sinais da MTM Auto
                     mostra deste sinal e o mesmo que a rota responderia se o botão fosse tocado.
                     O código é partilhado (`lib/mtmcopy/t2t-janela-regra`); a frase curta é a
                     deste catálogo, para cada pessoa continuar a lê-la na sua língua. */
                  <div
                    className="mt-2.5 flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-xl py-2.5 text-[12px] font-semibold"
                    style={{ background: "color-mix(in srgb, var(--fundo) 60%, transparent)", color: "color-mix(in srgb, var(--texto) 45%, transparent)" }}
                  >
                    <Clock className="w-4 h-4" /> {t(ETIQUETA_DA_RECUSA[vereditoDoCartao(s, aoVivo[s.id])!])}
                  </div>
                ) : (
                  <button
                    onClick={() => setTap({ sig: s, status: "confirm" })}
                    className="mt-2.5 w-full flex items-center justify-center gap-1.5 rounded-xl bg-[#D2A63C] text-black font-bold text-[13px] py-2.5 active:scale-[0.98] transition-transform"
                  >
                    <Zap className="w-4 h-4" />
                    {/* QUEM DECIDE É `t2tMode` — a regra está em lib/mtmcopy/t2t-source e é a
                        mesma que a rota de aceitação aplica: os perpétuos que não existem nas
                        contas MT5 dos clientes marcam-se como SEGUIDOS (a gestão chega por
                        notificação, sem ordem aberta); a cripto que existe lá (BTC, ETH, SOL,
                        XRP…) abre ordem como qualquer outro sinal.
                        Antes o botão era decidido por `ehSinalDePerpetuo`, que diz «isto é
                        cripto/perpétuo» e não «isto executa»: por causa disso o BTCUSD — que a
                        regra manda EXECUTAR — abria o modal de copiar e nunca chegava a abrir
                        ordem nenhuma. O copiar não desapareceu: passou a botão próprio, em TODOS
                        os sinais, aqui em baixo. */}
                    {t2tMode(s.channel_slug, s.content) === "follow" ? t("t2t.followPosition") : "Tap to Trade"}
                  </button>
                )}

                {/* TAP TO COPY — em QUALQUER sinal, aceite ou não, cripto e perpétuos incluídos.
                    É para quem não quer executar connosco e quer replicar a trade à mão: os
                    parâmetros saem em texto que se cola no MT5, em vez de se transcreverem
                    preços do ecrã. Secundário de propósito: o primário continua a ser executar. */}
                {structured && textoParaColar(parametrosParaCopiar(f, dir)) !== "" && (
                  <button
                    onClick={() => setCopySig(s)}
                    className="mt-1.5 w-full flex items-center justify-center gap-1.5 rounded-xl border border-[#D2A63C]/40 text-[#D2A63C] font-semibold text-[12.5px] py-2 active:scale-[0.98] transition-transform"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Tap to copy
                  </button>
                )}
              </div>
              </div>
            )
          })}

          {/* HISTÓRICO — sinais já terminados na janela escolhida, com o desfecho ao lado do
              par. É o que faltava para o tab responder a "como correu o dia" sem sair da app. */}
          {/* Os anteriores aparecem TAMBÉM no ecrã dos Sinais. Um ecrã que só mostra os sinais
              aceitáveis fica vazio na maior parte do dia — e vazio não diz se não houve sinais,
              se o filtro cortou tudo, ou se a app está avariada. Com os anteriores por baixo, o
              ecrã responde sempre a "o que é que aconteceu hoje". */}
          {/* O histórico dos SINAIS do chat continua por baixo; por cima vai o das CONTAS, que é
              o que responde a "como é que correu" — e inclui MTM Auto, T2T e MTM Copy. */}
          {ecra === "historico" && <MtmAutoHistorico dias={limitMode === "today" ? 1 : 7} />}

          {ecra === "historico" && historicoVisivel.length > 0 && (
            <div className="mt-4">
              <p className="etiqueta mb-2">
                {limitMode === "today" ? t("t2t.finishedToday") : t("t2t.finishedWeek")} ({historicoVisivel.length})
              </p>
              <div className="flex flex-col gap-2">
                {historicoVisivel.map((h) => {
                  const ganhou = h.desfecho.startsWith("+")
                  // Também aqui manda a direção do servidor: o histórico mostrava «COMPRA» ao
                  // lado dos pips de vendas do Premium.
                  const hDir = resolveDirectionLabel(dirServidor[h.id], h.content)
                  return (
                    <div key={h.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 px-3 py-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[13px] font-semibold text-zinc-300 truncate">
                          {symbolOf(h.content) || h.channel_slug}
                          {hDir && (
                            <span className={`ml-1.5 text-[11px] font-bold ${hDir === "BUY" ? "text-emerald-400" : "text-rose-400"}`}>
                              {hDir === "BUY" ? "COMPRA" : "VENDA"}
                            </span>
                          )}
                        </span>
                        {h.desfecho ? (
                          <span className={`text-[12px] font-mono font-semibold tabular-nums flex-shrink-0 ${ganhou ? "text-emerald-400" : "text-rose-400"}`}>
                            {h.desfecho}
                          </span>
                        ) : (
                          <span className="text-[11px] text-zinc-600 flex-shrink-0">terminado</span>
                        )}
                      </div>
                      <p className="text-[10.5px] text-zinc-600 mt-1">
                        {new Date(h.created_at).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
      </>
      )}

      {/* Os parâmetros vão JÁ interpretados (os mesmos que o cartão mostra), e não o texto cru:
          o modal deixa de ter de adivinhar o formato de cada fonte — e copia o que se está a ver. */}
      {copySig && (
        <TapToCopyModal
          parametros={parametrosParaCopiar(
            parseSignalFields(copySig.content),
            resolveDirectionLabel(dirServidor[copySig.id], copySig.content),
          )}
          content={copySig.content || ""}
          titulo={
            ehSinalDePerpetuo(copySig.channel_slug, copySig.content)
              ? "Tap to copy · Cripto"
              : "Tap to copy"
          }
          aoFechar={() => setCopySig(null)}
        />
      )}

      {tap && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 p-4" onClick={() => tap.status !== "loading" && setTap(null)}>
          <div className="w-full max-w-sm rounded-2xl border border-[#D2A63C]/30 bg-zinc-950 p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-5 h-5 text-[#D2A63C]" />
              <h3 className="text-base font-bold">T2T · Tap to Trade</h3>
            </div>
            {tap.status === "confirm" && (
              <>
                {!isReady && (
                  <p className="text-xs text-amber-400 mb-2">{t("t2t.notLinkedWarning")}</p>
                )}
                {preview?.mode === "follow" ? (
                  <p className="text-sm text-zinc-300 mb-3">
                    Perpétuo: <strong className="text-white">seguir a posição</strong>. Não é aberta nenhuma
                    ordem na tua conta — a gestão da posição-mestre chega-te por notificação.
                  </p>
                ) : (
                  <p className="text-sm text-zinc-300 mb-3">
                    {t("t2t.confirmBefore")}<strong className="text-white">{t("t2t.yourAccount")}</strong>{t("t2t.confirmMiddle")}<strong className="text-white">{riskLabel}</strong>{t("t2t.confirmEnd")}
                  </p>
                )}

                {/* Parâmetros da trade — o que se está a aceitar, sem ter de ler o texto cru. */}
                {preview?.trade && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 mb-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[15px] font-bold text-white">{preview.trade.symbol}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 ${preview.trade.direction === "buy" ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"}`}>
                        {preview.trade.direction === "buy" ? t("t2t.buy") : t("t2t.sell")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] font-mono tabular-nums">
                      {preview.trade.entry != null && (
                        <div className="flex justify-between"><span className="text-zinc-500">{t("t2t.entry")}</span><span className="text-zinc-200">{precoLegivel(preview.trade.entry, preview.trade.symbol)}</span></div>
                      )}
                      {preview.trade.sl != null && (
                        <div className="flex justify-between"><span className="text-zinc-500">{t("t2t.stopShort")}</span><span className="text-rose-400">{precoLegivel(preview.trade.sl, preview.trade.symbol)}</span></div>
                      )}
                      {preview.trade.tps.slice(0, 3).map((tp, i) => (
                        <div key={i} className="flex justify-between"><span className="text-zinc-500">{t("t2t.target")} {i + 1}</span><span className="text-emerald-400">{precoLegivel(tp, preview.trade.symbol)}</span></div>
                      ))}
                      {preview.trade.stopPips != null && (
                        <div className="flex justify-between"><span className="text-zinc-500">{t("t2t.atStop")}</span><span className="text-zinc-400">{preview.trade.stopPips} pips</span></div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quanto se arrisca, por conta. É a pergunta que o cliente faz antes de tocar. */}
                {preview?.mode === "execute" && (preview.accounts.length > 0 || (preview.simuladas?.length ?? 0) > 0) && (
                  <div className="rounded-lg border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-3 mb-3">
                    {/* ONDE ABRIR. Com um destino só isto é o cartão de sempre (o que vai acontecer,
                        sem pergunta nenhuma). Com dois ou mais, cada linha passa a ser uma caixa —
                        o leque continua a caber (dá para marcar duas das doze), mas escolhido. */}
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <p className="text-[10px] uppercase tracking-wider text-[#D2A63C]">
                        {preview.escolhaPossivel ? "Onde queres abrir" : t("t2t.inYourAccounts")}
                      </p>
                      {preview.escolhaPossivel && ondeAbrir && (
                        <button
                          type="button"
                          onClick={() => {
                            const todas = [...preview.accounts.map((a) => a.id), ...(preview.simuladas ?? []).map((x) => x.ref)]
                            setOndeAbrir(ondeAbrir.length === todas.length ? [] : todas)
                          }}
                          className="text-[10px] font-semibold text-[#D2A63C] underline underline-offset-2 active:scale-95"
                        >
                          {ondeAbrir.length === preview.accounts.length + (preview.simuladas?.length ?? 0) ? "Nenhuma" : "Todas"}
                        </button>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      {preview.accounts.map((a) => (
                        <ContaEscolhivel
                          key={a.id}
                          escolhivel={Boolean(preview.escolhaPossivel)}
                          marcada={!preview.escolhaPossivel || !!ondeAbrir?.includes(a.id)}
                          alternar={() => setOndeAbrir((atual) => alternarConta(atual, a.id))}
                        >
                          <span className="text-[12px] text-zinc-300 truncate">
                            {a.label}
                            {a.jaCopia && <span className="ml-1.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-sky-300">já copia</span>}
                          </span>
                          {a.available ? (
                            <span className="text-[12px] font-mono tabular-nums text-right">
                              <span className="text-white font-semibold">{a.lot != null ? `${a.lot} lote${a.lot === 1 ? "" : "s"}` : "—"}</span>
                              {/* O risco REAL do lote manda: com lote fixo, ou quando o mínimo do
                                  broker sobe o lote, o que vai para o mercado não é a % escolhida. */}
                              {a.realRiskPct != null ? (
                                <span className={a.overCap != null ? "text-amber-400 font-semibold" : "text-zinc-500"}> · {a.realRiskPct}%</span>
                              ) : (
                                a.riskPct != null && <span className="text-zinc-500"> · {a.riskPct}%</span>
                              )}
                              {a.riskAmount != null && <span className="text-zinc-400"> ≈ {a.riskAmount}</span>}
                            </span>
                          ) : (
                            <span className="text-[11px] text-zinc-600">{t("t2t.accountNoAnswer")}</span>
                          )}
                        </ContaEscolhivel>
                      ))}
                      {/* As simuladas MTM Funded abriam sem nunca aparecerem aqui. Entram sem
                          números — são simuladas, não há dinheiro em risco para contar. */}
                      {(preview.simuladas ?? []).map((sc) => (
                        <ContaEscolhivel
                          key={sc.ref}
                          escolhivel={Boolean(preview.escolhaPossivel)}
                          marcada={!preview.escolhaPossivel || !!ondeAbrir?.includes(sc.ref)}
                          alternar={() => setOndeAbrir((atual) => alternarConta(atual, sc.ref))}
                        >
                          <span className="text-[12px] text-zinc-300 truncate">
                            {sc.label}
                            <span className="ml-1.5 rounded bg-zinc-500/15 px-1.5 py-0.5 text-[9.5px] font-semibold text-zinc-400">simulada</span>
                          </span>
                          <span className="text-[11px] text-zinc-500">sem risco real</span>
                        </ContaEscolhivel>
                      ))}
                    </div>
                    {preview.escolhaPossivel && ondeAbrir?.length === 0 && (
                      <p className="text-[10px] text-amber-400 mt-2">Escolhe pelo menos uma conta para abrir.</p>
                    )}
                    {preview.escolhaPossivel && (
                      <p className="text-[10px] text-zinc-500 mt-2">
                        A tua escolha fica guardada para a próxima — podes mudá-la aqui sempre que aceitares.
                        {(preview.escolhidas?.length ?? 0) > 0 && " Uma conta que ligues de novo aparece DESMARCADA: só recebe se a marcares."}
                      </p>
                    )}
                    {/* A conta já recebe este trade pela cópia automática: dizê-lo ANTES do clique.
                        O sistema não abre duas vezes (o T2T salta as contas onde o motor já
                        executou o mesmo trade), mas saltar em silêncio parece uma avaria. */}
                    {preview.accounts.some((a) => a.jaCopia) && (
                      <p className="text-[10px] text-sky-300 mt-2 leading-snug">
                        ℹ️ {preview.accounts.filter((a) => a.jaCopia).map((a) => a.label).join(", ")} já {preview.accounts.filter((a) => a.jaCopia).length === 1 ? "copia" : "copiam"} esta estratégia automaticamente — este sinal entra aí sozinho. Aceitar aqui não abre uma segunda posição nessa conta.
                      </p>
                    )}
                    {preview.accounts.some((a) => a.overCap != null) && (
                      <p className="text-[10px] text-amber-400 mt-2 leading-snug">
                        ⚠️ O lote mínimo da corretora arrisca mais do que o tecto que escolheste
                        {preview.accounts.filter((a) => a.overCap != null).map((a) => ` — ${a.label}: ${a.realRiskPct}% contra ${a.overCap}%`).join("")}. Com este saldo não há lote que respeite a percentagem.
                      </p>
                    )}
                    <p className="text-[10px] text-zinc-500 mt-2">{t("t2t.equityNote")}</p>
                  </div>
                )}
                {/* DIZER PORQUE É QUE NÃO DÁ — SEM SER O ECRÃ TODO.
                    Uma conta em pausa, desligada ou sem saldo era simplesmente omitida: o cliente
                    via a lista vazia, carregava em aceitar e apanhava um erro opaco. O motivo
                    passou a aparecer antes do clique — e passou a ser o ecrã: o dono abriu isto e
                    encontrou UMA conta escolhível debaixo de treze parágrafos vermelhos.
                    Agora recolhe-se atrás de uma linha discreta. Nada desaparece sem explicação,
                    mas a explicação deixa de tapar aquilo que se veio aqui fazer.
                    A excepção: sem NENHUMA conta escolhível, o motivo é a mensagem que interessa
                    — aí abre logo, porque não há mais nada para ver. */}
                {preview?.mode === "execute" && (preview.blocked?.length ?? 0) > 0 && (() => {
                  const n = preview.blocked!.length
                  const semAlternativa = preview.accounts.length === 0 && (preview.simuladas?.length ?? 0) === 0
                  const aberto = semAlternativa || bloqueadasAbertas
                  return (
                    <div className="mb-3">
                      {!semAlternativa && (
                        <button
                          type="button"
                          onClick={() => setBloqueadasAbertas((v) => !v)}
                          className="flex w-full items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/40 px-3 py-2 text-left active:scale-[0.99]"
                        >
                          <span className="text-[11px] text-zinc-400">
                            {n} {n === 1 ? "conta não pode" : "contas não podem"} aceitar
                          </span>
                          <span className={`text-[11px] text-zinc-500 transition-transform ${aberto ? "rotate-90" : ""}`}>›</span>
                        </button>
                      )}
                      {aberto && (
                        <div className={`rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 ${semAlternativa ? "" : "mt-2"}`}>
                          {semAlternativa && (
                            <p className="text-[10px] uppercase tracking-wider text-amber-400 mb-2">{t("t2t.noAccountCanAccept")}</p>
                          )}
                          <div className="flex flex-col gap-2">
                            {preview.blocked!.map((b) => (
                              <div key={`${b.id}-${b.motivo}`} className="text-[11px] leading-snug">
                                <span className="text-zinc-300 font-medium">{b.label}</span>
                                <span className="text-amber-300"> — {b.motivo}</span>
                                <span className="text-zinc-500"> {b.comoResolver}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
                {previewBusy && !preview && <p className="text-[11px] text-zinc-500 mb-3">{t("t2t.calculatingRisk")}</p>}

                <div className="rounded-lg bg-zinc-900 border border-zinc-800 p-3 text-xs text-zinc-400 max-h-24 overflow-y-auto whitespace-pre-wrap mb-4">{tap.sig.content}</div>
                <div className="flex gap-2">
                  <button onClick={() => setTap(null)} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95">{t("t2t.cancel")}</button>
                  <button
                    onClick={runTap}
                    disabled={Boolean(preview?.escolhaPossivel) && ondeAbrir?.length === 0}
                    className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95 disabled:opacity-40 disabled:active:scale-100"
                  >
                    {preview?.mode === "follow" ? t("t2t.followPositionBtn") : t("t2t.confirmOpen")}
                  </button>
                </div>
              </>
            )}
            {tap.status === "loading" && <p className="text-sm text-zinc-300 py-6 text-center">{t("t2t.openingTrade")}</p>}
            {tap.status === "done" && (
              <>
                <p className="text-sm text-emerald-400 py-4 text-center">✅ {tap.message}</p>
                {/* Depois de aceitar há sempre um sítio para onde ir: o chat da fonte, onde a
                    gestão desta trade vai aparecer em thread. Fechar o modal e ficar na lista
                    deixava o cliente sem saber onde seguir o desfecho. */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setTap(null)}
                    className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95"
                  >
                    {t("t2t.close")}
                  </button>
                  <button
                    onClick={() => {
                      const slug = tap.sig.channel_slug
                      setTap(null)
                      window.location.href = `/app-mobile?tab=chat&channel=${encodeURIComponent(slug)}&msg=${encodeURIComponent(tap.sig.id)}`
                    }}
                    className="flex-1 rounded-xl bg-[#D2A63C] py-2.5 text-sm font-bold text-black active:scale-95"
                  >
                    Ver no chat
                  </button>
                </div>
              </>
            )}
            {tap.status === "error" && (
              <>
                <p className="text-sm text-rose-400 py-4 text-center">⚠️ {tap.message}</p>
                <button onClick={() => setTap(null)} className="w-full rounded-xl border border-zinc-700 py-2.5 text-sm font-medium text-zinc-300 active:scale-95">{t("t2t.close")}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
