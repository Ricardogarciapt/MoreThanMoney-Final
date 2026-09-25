"use client"

import { useCallback, useEffect, useState } from "react"
import { Lock, SlidersHorizontal } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { Direcao } from "@/lib/mtmfunded/simulado/matematica"
import { type Gestao, gestaoDaLinha } from "@/lib/mtmfunded/simulado/avancadas"
import {
  type EstadoGestaoAuto, type PedidoGestao, type SimboloGestao, type ValoresGestao,
  distanciaTrailing, emPreco, estadoGestaoAuto, nivelBreakEven, pedidoAutoBe, pedidoAutoTrailing,
  pedidoTrailingJa, precoDoGatilho, previsaoTrailingJa, unidadeGestao, validarValores, valoresPorDefeito,
} from "@/lib/mtmfunded/simulado/gestao-auto"
import { px } from "./api"

/**
 * AUTO BE · AUTO TRAILING · TRAILING JÁ — os botões de gestão automática de uma posição.
 *
 * Contas MTM Funded (motor `sim`): cada botão envia a acção `gestao` (rota das ordens, dono
 * verificado) com a gestão INTEIRA da posição, mexendo só no seu bloco; quem executa é o motor do
 * VPS, a cada preço. A lógica está em lib/mtmfunded/simulado/gestao-auto.ts (testada).
 *
 * Contas da corretora (MT5/MT4/TradeLocker): os MESMOS botões, com o mesmo significado, gravados na
 * tabela `webtrader_gestao_auto` e executados no servidor (lib/webtrader/gestao-auto-servidor.ts) —
 * ver `GestaoAutoCorretora`. O browser nunca move um SL de dinheiro real: fechava-se o separador e a
 * gestão parava a meio. O ritmo é que difere (segundos com o WebTrader aberto, 1 min pela cron).
 *
 * Os valores (pips/pontos) são por SÍMBOLO, guardados neste dispositivo; sem nada guardado valem
 * os da classe do activo (ouro, forex, índices, cripto).
 */

const CHAVE_VALORES = "mtmfunded_gestao_auto_valores:v1"
const EVENTO = "mtmfunded-gestao-auto"

type Guardados = Record<string, ValoresGestao>

function lerGuardados(): Guardados {
  try { const v = JSON.parse(localStorage.getItem(CHAVE_VALORES) || "{}"); return v && typeof v === "object" ? v as Guardados : {} } catch { return {} }
}
function escreverGuardados(g: Guardados) {
  try { localStorage.setItem(CHAVE_VALORES, JSON.stringify(g)) } catch { /* modo privado: vale só nesta página */ }
  try { window.dispatchEvent(new Event(EVENTO)) } catch { /* ok */ }
}

/** Os valores dos botões para este símbolo: os guardados, ou os da classe (com o preço de agora). */
export function useValoresGestao(s: SimboloGestao | null | undefined, preco: number | null | undefined) {
  const [guardados, setGuardados] = useState<Guardados>({})
  useEffect(() => {
    const ler = () => setGuardados(lerGuardados())
    ler()
    window.addEventListener(EVENTO, ler)
    window.addEventListener("storage", ler)
    return () => { window.removeEventListener(EVENTO, ler); window.removeEventListener("storage", ler) }
  }, [])
  const symbol = s?.symbol ?? ""
  const proprio = symbol ? guardados[symbol] : undefined
  const valores = s ? (proprio && validarValores(proprio)) || valoresPorDefeito(s, preco) : null
  const guardar = useCallback((v: ValoresGestao) => { if (symbol) escreverGuardados({ ...lerGuardados(), [symbol]: v }) }, [symbol])
  const repor = useCallback(() => { if (!symbol) return; const g = lerGuardados(); delete g[symbol]; escreverGuardados(g) }, [symbol])
  return { valores, guardar, repor, personalizado: Boolean(proprio) }
}

type Correr = (descricao: string, accao: string, corpo: Record<string, unknown>, confirmar?: boolean, digitos?: number, manterEdicao?: boolean) => Promise<void>

const COR_BE = "#fbbf24"
const COR_BE_FEITO = "#34d399"
const COR_TRAIL = "#a78bfa"

function Chip({ ligado, cor, onClick, disabled, title, children, bloqueado }: {
  ligado: boolean; cor: string; onClick?: () => void; disabled?: boolean; title: string; children: React.ReactNode; bloqueado?: boolean
}) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} title={title} aria-label={title} aria-pressed={ligado}
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-1 text-[10.5px] font-semibold leading-none disabled:opacity-40 ${bloqueado ? "border-dashed" : ""}`}
      style={ligado ? { borderColor: cor, color: cor, background: `${cor}1f` } : { borderColor: "rgba(255,255,255,0.1)", color: "#a1a1aa" }}
    >
      {bloqueado && <Lock className="h-2.5 w-2.5" />}
      {ligado && !bloqueado && <span className="h-1.5 w-1.5 rounded-full" style={{ background: cor }} />}
      {children}
    </button>
  )
}

/**
 * Os três botões de uma posição MTM Funded + a roda dos valores.
 * `pos` é a linha de funded_positions (com as colunas da gestão).
 */
export function BotoesGestaoAuto({ pos, s, precoFecho, ocupado, correr, manterEdicao }: {
  pos: Record<string, any>; s: SimboloGestao & { pip_size: number }; precoFecho: number | null; ocupado: boolean; correr: Correr; manterEdicao?: boolean
}) {
  const g = gestaoDaLinha(pos)
  const direcao = pos.direcao as Direcao
  const entrada = Number(pos.preco_entrada)
  const sl = pos.sl == null ? null : Number(pos.sl)
  const est = estadoGestaoAuto(g, direcao, entrada, precoFecho)
  const { valores: v, guardar, repor, personalizado } = useValoresGestao(s, precoFecho ?? entrada)
  if (!v) return null
  const u = unidadeGestao(s)
  const d = s.digits
  const enviar = (descricao: string, pedido: PedidoGestao, confirmar = false) =>
    correr(descricao, "gestao", { positionId: pos.id, gestao: pedido }, confirmar, d, manterEdicao)

  const beLigado = est.be !== "off"
  const trLigado = est.trailingModo !== "off"
  const nivelBe = nivelBreakEven(direcao, entrada, emPreco(s, v.beOffset), d)
  const gatilhoBe = precoDoGatilho(direcao, entrada, emPreco(s, v.beGatilho), d)
  const dist = distanciaTrailing(s, v)
  const prev = precoFecho == null ? null : previsaoTrailingJa(direcao, precoFecho, sl, dist, d, s.pip_size)

  const tituloBe = est.be === "feito" ? "Break-even já aplicado" : beLigado
    ? `Auto BE ligado${g.be_gatilho ? ` — a ${px(precoDoGatilho(direcao, entrada, g.be_gatilho, d), d)} o SL passa para ${px(nivelBreakEven(direcao, entrada, g.be_offset, d), d)}` : " — no TP1"}. Toca para desligar.`
    : `Ligar Auto BE: a +${v.beGatilho} ${u.nome} (${px(gatilhoBe, d)}) o SL passa para ${px(nivelBe, d)} (+${v.beOffset} ${u.nome}).`
  const tituloTr = trLigado
    ? `Trailing ${est.trailing === "ativo" ? "a seguir" : "à espera"} — distância ${px(g.trailing_distancia, d)}${g.trailing_ativacao ? `, arranca a +${px(g.trailing_ativacao, d)} de preço` : ""}. Toca para desligar.`
    : `Ligar Auto Trailing: arranca a +${v.trailAtivacao} ${u.nome} e segue a ${v.trailDistancia} ${u.nome}.`
  const tituloJa = est.trailingModo === "ja" ? "O trailing já está a seguir o preço." : prev == null ? "Sem preço ao vivo." : prev.mexe
    ? `Ativar trailing já: o SL passa para ${px(prev.nivel, d)} e segue a ${v.trailDistancia} ${u.nome}.`
    : `Ativar trailing já a ${v.trailDistancia} ${u.nome}: o SL actual já está mais apertado — mexe quando o preço andar.`

  return (
    <div className="flex items-center gap-1">
      <Chip ligado={beLigado} cor={est.be === "feito" ? COR_BE_FEITO : COR_BE} disabled={ocupado || est.be === "feito"} title={tituloBe}
        onClick={() => void enviar(beLigado ? `Desligar Auto BE em ${pos.symbol}` : `Auto BE em ${pos.symbol}: a ${px(gatilhoBe, d)} o SL vai para ${px(nivelBe, d)}`, pedidoAutoBe(g, !beLigado, s, v))}>
        {est.be === "feito" ? "BE ✓" : "Auto BE"}
      </Chip>
      <Chip ligado={trLigado} cor={COR_TRAIL} disabled={ocupado} title={tituloTr}
        onClick={() => void enviar(trLigado ? `Desligar trailing em ${pos.symbol}` : `Auto trailing em ${pos.symbol}: arranca a +${v.trailAtivacao} ${u.nome}, segue a ${v.trailDistancia}`, pedidoAutoTrailing(g, !trLigado, s, v))}>
        Auto TS{est.trailingModo === "auto" && est.trailing === "a_espera" ? " ⏸" : ""}
      </Chip>
      <Chip ligado={est.trailingModo === "ja"} cor={COR_TRAIL} disabled={ocupado || est.trailingModo === "ja" || prev == null} title={tituloJa}
        onClick={() => prev && void enviar(
          prev.mexe ? `Ativar trailing em ${pos.symbol}: SL passa para ${px(prev.nivel, d)} e segue a ${v.trailDistancia} ${u.nome}` : `Ativar trailing em ${pos.symbol} a ${v.trailDistancia} ${u.nome} (o SL actual já está mais apertado)`,
          pedidoTrailingJa(g, s, v), true,
        )}>
        {est.trailingModo === "ja" ? "TS activo" : "TS já"}
      </Chip>
      <PopoverValores s={s} valores={v} personalizado={personalizado} repor={repor} disabled={ocupado}
        onGuardar={(novo) => {
          guardar(novo)
          // Já ligado nesta posição? Passa a usar os valores novos (o resto da gestão fica).
          let p: PedidoGestao | null = null
          if (est.be === "armado" && g.be_gatilho) p = pedidoAutoBe(g, true, s, novo)
          const g2 = p ? { ...g, be_gatilho: p.be_gatilho, be_offset: p.be_offset } : g
          if (est.trailingModo === "auto") p = pedidoAutoTrailing(g2, true, s, novo)
          else if (est.trailingModo === "ja") p = pedidoTrailingJa(g2, s, novo)
          if (p) void enviar(`Actualizar a gestão automática de ${pos.symbol}`, p)
        }} />
    </div>
  )
}

/** A roda dos valores: 4 números em pips/pontos, por símbolo. */
function PopoverValores({ s, valores, personalizado, repor, onGuardar, disabled, rodape }: {
  s: SimboloGestao; valores: ValoresGestao; personalizado: boolean; repor: () => void; onGuardar: (v: ValoresGestao) => void; disabled?: boolean; rodape?: React.ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const [txt, setTxt] = useState<Record<keyof ValoresGestao, string>>(() => textos(valores))
  const [erro, setErro] = useState<string | null>(null)
  useEffect(() => { if (aberto) { setTxt(textos(valores)); setErro(null) } }, [aberto]) // eslint-disable-line react-hooks/exhaustive-deps
  const u = unidadeGestao(s)
  const campo = "h-8 w-full rounded-md border border-white/10 bg-black px-2 font-mono text-[12px] text-white"
  const linha = (k: keyof ValoresGestao, rotulo: string) => (
    <label className="space-y-0.5">
      <span className="text-[10.5px] text-zinc-500">{rotulo}</span>
      <input inputMode="decimal" value={txt[k]} onChange={(e) => setTxt((x) => ({ ...x, [k]: e.target.value }))} className={campo} />
    </label>
  )
  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} aria-label="valores da gestão automática" title={`Valores do Auto BE / trailing (${u.nome})`}
          className="grid h-7 w-6 shrink-0 place-items-center rounded-md text-zinc-400 hover:bg-white/10 hover:text-white disabled:opacity-40">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="z-[960] w-64 border-white/10 bg-[#1E222D] p-2.5 text-[11.5px] text-white">
        <p className="mb-1.5 font-semibold">Gestão automática · {s.symbol} <span className="font-normal text-zinc-500">({u.nome})</span></p>
        <div className="grid grid-cols-2 gap-1.5">
          {linha("beGatilho", "BE a +")}
          {linha("beOffset", "Folga do BE")}
          {linha("trailAtivacao", "Trailing arranca a +")}
          {linha("trailDistancia", "Distância do trailing")}
        </div>
        {erro && <p className="mt-1 text-[10.5px] text-rose-300">{erro}</p>}
        {rodape}
        <div className="mt-2 flex items-center gap-1.5">
          <button type="button" onClick={() => { repor(); setAberto(false) }} disabled={!personalizado} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 disabled:opacity-40">Repor</button>
          <button type="button" className="ml-auto rounded-md bg-[#D2A63C] px-3 py-1 text-[11.5px] font-bold text-black"
            onClick={() => {
              const v = validarValores(txt)
              if (!v) return setErro("Números positivos, e a folga menor do que o BE.")
              onGuardar(v)
              setAberto(false)
            }}>Guardar</button>
        </div>
        <p className="mt-1.5 text-[10px] leading-snug text-zinc-500">Ficam para {s.symbol} neste dispositivo. Ativação 0 = o trailing segue desde já.</p>
      </PopoverContent>
    </Popover>
  )
}

function textos(v: ValoresGestao): Record<keyof ValoresGestao, string> {
  return { beGatilho: String(v.beGatilho), beOffset: String(v.beOffset), trailAtivacao: String(v.trailAtivacao), trailDistancia: String(v.trailDistancia) }
}

// ── contas da corretora (MT5/MT4/TradeLocker) ────────────────────────────────

/**
 * OS MESMOS BOTÕES NUMA CONTA DE CORRETORA — e agora a MEXER a sério na posição.
 *
 * O que estava aqui antes: três botões «bloqueados» e dois visto-de-preferência gravados no
 * localStorage (`webtrader_gestao_auto_real:<ref>`). Não havia ninguém a ler aquilo, por isso uma
 * posição da TradeLocker com «Auto BE» ligado ficava exactamente como estava — o defeito que isto
 * resolve. A preferência por conta desapareceu porque era uma promessa falsa: a gestão é POR POSIÇÃO,
 * como nas contas MTM Funded, e quem a executa é lib/webtrader/gestao-auto-servidor.ts.
 *
 * O ESTADO vem SEMPRE do servidor (a linha de `webtrader_gestao_auto` que a leitura de posições
 * traz), nunca do browser: um botão aceso tem de significar «o servidor está a gerir isto».
 */
export interface EstadoGestaoCorretora {
  position_id: string
  trailing_distancia: number | null
  trailing_ativacao: number | null
  be_gatilho: number | null
  be_offset: number | null
  be_feito: boolean
  sl_aplicado: number | null
  ultimo_erro: string | null
  so_com_separador: boolean
}

/** A linha do servidor → a mesma `Gestao` que os botões das contas MTM Funded usam. */
function gestaoDoEstado(e: EstadoGestaoCorretora | null | undefined): Gestao {
  return {
    trailing_distancia: e?.trailing_distancia ?? null,
    trailing_ativacao: e?.trailing_ativacao ?? null,
    be_gatilho: e?.be_gatilho ?? null,
    be_offset: e?.be_offset ?? 0,
    be_no_tp1: false,
    be_feito: e?.be_feito === true,
    tps: null,
    volume_inicial: null,
  }
}

export function GestaoAutoCorretora({ pos, digits, preco, estado, ocupado, onGuardar }: {
  pos: { id: string; symbol: string; direcao: Direcao; precoEntrada: number; sl: number | null }
  digits: number
  preco: number | null
  estado: EstadoGestaoCorretora | null
  ocupado?: boolean
  /** Envia a gestão INTEIRA desta posição para o servidor (acção `gestao-auto` da rota do WebTrader). */
  onGuardar: (descricao: string, pedido: PedidoGestao, confirmar: boolean) => Promise<unknown>
}) {
  const s: SimboloGestao = { symbol: pos.symbol, digits }
  const { valores: v, guardar, repor, personalizado } = useValoresGestao(s, preco ?? pos.precoEntrada)
  const [erro, setErro] = useState<string | null>(null)
  if (!v) return null
  const g = gestaoDoEstado(estado)
  const est = estadoGestaoAuto(g, pos.direcao, pos.precoEntrada, preco)
  const d = digits
  const u = unidadeGestao(s)
  const pip = Number(unidadeGestao(s).tamanho)
  const enviar = (descricao: string, pedido: PedidoGestao, confirmar = false) => {
    setErro(null)
    // «cancelado» é o trader a recusar a confirmação — não é um erro para mostrar em vermelho.
    return onGuardar(descricao, pedido, confirmar).catch((e: Error) => { if (e.message !== "cancelado") setErro(e.message) })
  }

  const beLigado = est.be !== "off"
  const trLigado = est.trailingModo !== "off"
  const nivelBe = nivelBreakEven(pos.direcao, pos.precoEntrada, emPreco(s, v.beOffset), d)
  const gatilhoBe = precoDoGatilho(pos.direcao, pos.precoEntrada, emPreco(s, v.beGatilho), d)
  const dist = distanciaTrailing({ ...s, pip_size: pip }, v)
  const prev = preco == null ? null : previsaoTrailingJa(pos.direcao, preco, pos.sl, dist, d, pip)

  // A honestidade do rótulo é metade da funcionalidade: o trader tem de saber a QUE RITMO isto corre.
  const ritmo = estado?.so_com_separador
    ? " Esta conta entrou por sessão do separador: só é gerida com o WebTrader aberto."
    : " Corre com o WebTrader aberto (segundos) e por cron quando ele está fechado (1 min)."
  const tituloBe = est.be === "feito" ? "Break-even já aplicado pelo servidor." : beLigado && g.be_gatilho != null
    ? `Auto BE ligado — a ${px(precoDoGatilho(pos.direcao, pos.precoEntrada, g.be_gatilho, d), d)} o SL passa para ${px(nivelBreakEven(pos.direcao, pos.precoEntrada, g.be_offset, d), d)}. Toca para desligar.`
    : `Ligar Auto BE: a +${v.beGatilho} ${u.nome} (${px(gatilhoBe, d)}) o SL passa para ${px(nivelBe, d)} (+${v.beOffset} ${u.nome}).${ritmo}`
  const tituloTr = trLigado
    ? `Trailing ${est.trailing === "ativo" ? "a seguir" : "à espera"} — distância ${px(g.trailing_distancia, d)}${g.trailing_ativacao ? `, arranca a +${px(g.trailing_ativacao, d)} de preço` : ""}. Toca para desligar.`
    : `Ligar Auto Trailing: arranca a +${v.trailAtivacao} ${u.nome} e segue a ${v.trailDistancia} ${u.nome}.${ritmo}`
  const tituloJa = est.trailingModo === "ja" ? "O trailing já está a seguir o preço." : prev == null ? "Sem preço ao vivo." : prev.mexe
    ? `Ativar trailing já: o SL passa para ${px(prev.nivel, d)} e segue a ${v.trailDistancia} ${u.nome}.`
    : `Ativar trailing já a ${v.trailDistancia} ${u.nome}: o SL actual já está mais apertado — mexe quando o preço andar.`

  return (
    <span className="inline-flex items-center gap-1">
      <Chip ligado={beLigado} cor={est.be === "feito" ? COR_BE_FEITO : COR_BE} disabled={ocupado || est.be === "feito"} title={tituloBe}
        onClick={() => void enviar(beLigado ? `Desligar Auto BE em ${pos.symbol}` : `Auto BE em ${pos.symbol}: a ${px(gatilhoBe, d)} o SL vai para ${px(nivelBe, d)}`, pedidoAutoBe(g, !beLigado, s, v), true)}>
        {est.be === "feito" ? "BE ✓" : "Auto BE"}
      </Chip>
      <Chip ligado={trLigado} cor={COR_TRAIL} disabled={ocupado} title={tituloTr}
        onClick={() => void enviar(trLigado ? `Desligar trailing em ${pos.symbol}` : `Auto trailing em ${pos.symbol}: arranca a +${v.trailAtivacao} ${u.nome}, segue a ${v.trailDistancia}`, pedidoAutoTrailing(g, !trLigado, s, v), true)}>
        Auto TS{est.trailingModo === "auto" && est.trailing === "a_espera" ? " ⏸" : ""}
      </Chip>
      <Chip ligado={est.trailingModo === "ja"} cor={COR_TRAIL} disabled={ocupado || est.trailingModo === "ja" || prev == null} title={tituloJa}
        onClick={() => prev && void enviar(`Ativar trailing em ${pos.symbol}: segue a ${v.trailDistancia} ${u.nome}`, pedidoTrailingJa(g, s, v), true)}>
        {est.trailingModo === "ja" ? "TS activo" : "TS já"}
      </Chip>
      <PopoverValores s={s} valores={v} personalizado={personalizado} repor={repor} disabled={ocupado}
        rodape={(erro || estado?.ultimo_erro) ? <p className="mt-1 text-[10.5px] text-rose-300">{erro ?? `A corretora recusou a última mudança de SL: ${estado?.ultimo_erro}`}</p> : undefined}
        onGuardar={(novo) => {
          guardar(novo)
          // Já ligado nesta posição? Passa a usar os valores novos (o outro bloco fica como estava).
          let p: PedidoGestao | null = null
          if (est.be === "armado" && g.be_gatilho) p = pedidoAutoBe(g, true, s, novo)
          const g2 = p ? { ...g, be_gatilho: p.be_gatilho, be_offset: p.be_offset } : g
          if (est.trailingModo === "auto") p = pedidoAutoTrailing(g2, true, s, novo)
          else if (est.trailingModo === "ja") p = pedidoTrailingJa(g2, s, novo)
          if (p) void enviar(`Actualizar a gestão automática de ${pos.symbol}`, p, true)
        }} />
    </span>
  )
}

/** Etiqueta TRAIL/BE com o estado (a seguir / à espera / feito) — para a linha da posição. */
export function tituloEtiqueta(est: EstadoGestaoAuto | null | undefined, tipo: "trail" | "be"): string {
  if (!est) return tipo === "trail" ? "Trailing stop" : "Break-even automático"
  if (tipo === "be") return est.be === "feito" ? "Break-even aplicado" : "Break-even armado — o motor move o SL ao atingir o gatilho"
  return est.trailing === "ativo" ? "Trailing a seguir o preço" : "Trailing à espera da ativação"
}

