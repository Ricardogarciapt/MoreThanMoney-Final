"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

/**
 * As animações das páginas /sensei-ea e /sensei-scalp.
 *
 * Tudo em SVG + SMIL + CSS: o site não tem biblioteca de motion e duas páginas de venda não a
 * justificam. O SMIL corre sozinho em todos os browsers actuais e não pesa no thread principal.
 *
 * O que estes desenhos mostram é o COMPORTAMENTO do robô (onde entra, como gere, como reverte) —
 * nunca uma curva de lucro nem um número de desempenho. Os preços e as velas são ilustrativos.
 *
 * Os tempos de cada alvo saem do próprio traçado: mede-se o comprimento da linha do preço até
 * cada ponto e é isso que diz em que fracção do ciclo o alvo acende. Mudar o traçado mantém tudo
 * sincronizado sem acertar números à mão.
 */

export const OURO = "#D2A63C"
export const OURO_CLARO = "#E9C46A"
const VERDE = "#2FBF71"
const VERMELHO = "#E0525E"

type Pt = [number, number]

/** Fracção do comprimento total da polilinha em cada vértice (0 no primeiro, 1 no último). */
function fraccoes(pts: Pt[]): number[] {
  const acc = [0]
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1]
    const [x1, y1] = pts[i]
    acc.push(acc[i - 1] + Math.hypot(x1 - x0, y1 - y0))
  }
  const total = acc[acc.length - 1]
  return acc.map((v) => v / total)
}

const caminho = (pts: Pt[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ")
const f3 = (n: number) => n.toFixed(3)

/** Converte uma fracção do desenho do preço numa fracção do ciclo (o desenho ocupa `ocupa`). */
const noCiclo = (f: number, ocupa: number) => Math.min(0.999, f * ocupa)

/** Opacidade que acende em `t` e fica até ao reinício do ciclo. */
function acende(t: number, reinicio: number) {
  const a = Math.max(0.001, t - 0.004)
  return {
    values: "0;0;1;1;0;0",
    keyTimes: `0;${f3(a)};${f3(t + 0.01)};${f3(reinicio)};${f3(reinicio + 0.03)};1`,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Estilos partilhados (keyframes, revelação, inclinação 3D, respeito por reduced-motion)
// ─────────────────────────────────────────────────────────────────────────────

export function SenseiEstilos() {
  return (
    <style>{`
      .snx-r{opacity:0;transform:translate3d(0,26px,0);transition:opacity .8s cubic-bezier(.2,.7,.2,1),transform .8s cubic-bezier(.2,.7,.2,1)}
      .snx-r.on{opacity:1;transform:none}
      .snx-vela{transform-box:fill-box;transform-origin:50% 100%;animation:snx-vela .55s cubic-bezier(.2,.8,.2,1) both}
      @keyframes snx-vela{from{opacity:0;transform:scaleY(.2)}to{opacity:1;transform:none}}
      .snx-pulso{animation:snx-pulso 2.6s ease-in-out infinite}
      @keyframes snx-pulso{0%,100%{opacity:.10}50%{opacity:.26}}
      .snx-orb{animation:snx-orb 14s ease-in-out infinite alternate}
      @keyframes snx-orb{from{transform:translate3d(-6%,-4%,0) scale(1)}to{transform:translate3d(6%,5%,0) scale(1.15)}}
      .snx-grelha{background-image:linear-gradient(rgba(210,166,60,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(210,166,60,.07) 1px,transparent 1px);background-size:48px 48px;mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 75%);-webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 75%);animation:snx-grelha 18s linear infinite}
      @keyframes snx-grelha{to{background-position:0 48px,48px 0}}
      .snx-brilho{position:relative;overflow:hidden}
      .snx-brilho::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 35%,rgba(233,196,106,.28) 50%,transparent 65%);transform:translateX(-120%);animation:snx-brilho 4.5s ease-in-out infinite}
      @keyframes snx-brilho{0%,60%{transform:translateX(-120%)}100%{transform:translateX(120%)}}
      .snx-tilt{transition:transform .5s cubic-bezier(.2,.7,.2,1);transform-style:preserve-3d;will-change:transform}
      .snx-tick{opacity:.25;transition:opacity .35s,transform .35s}
      .snx-tick.on{opacity:1}
      .snx-flutua{animation:snx-flutua 6s ease-in-out infinite}
      @keyframes snx-flutua{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
      @media (prefers-reduced-motion: reduce){
        .snx-r{opacity:1;transform:none;transition:none}
        .snx-vela,.snx-pulso,.snx-orb,.snx-grelha,.snx-flutua,.snx-brilho::after{animation:none}
        .snx-tilt{transition:none;transform:none!important}
      }
    `}</style>
  )
}

/** Fundo do hero: grelha a deslizar e um brilho dourado que respira. */
export function FundoHero() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="snx-grelha absolute inset-0" />
      <div className="snx-orb absolute -top-1/3 left-1/2 h-[90%] w-[70%] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(210,166,60,0.22),transparent_65%)] blur-2xl" />
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-gray-950 to-transparent" />
    </div>
  )
}

/** Revela o conteúdo quando entra no ecrã. `atraso` em ms, para escalonar grelhas. */
export function Revelar({
  children,
  atraso = 0,
  className = "",
}: {
  children: ReactNode
  atraso?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setOn(true)
          io.disconnect()
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -6% 0px" },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <div ref={ref} className={`snx-r ${on ? "on" : ""} ${className}`} style={{ transitionDelay: `${atraso}ms` }}>
      {children}
    </div>
  )
}

/** Cartão que se inclina com o rato — dá profundidade aos ecrãs sem 3D a sério. */
export function Inclinar({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const mover = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      const x = (e.clientX - r.left) / r.width - 0.5
      const y = (e.clientY - r.top) / r.height - 0.5
      el.style.transform = `perspective(1100px) rotateX(${(-y * 7).toFixed(2)}deg) rotateY(${(x * 9).toFixed(2)}deg)`
    }
    const sair = () => (el.style.transform = "perspective(1100px) rotateX(4deg) rotateY(-6deg)")
    sair()
    el.addEventListener("pointermove", mover)
    el.addEventListener("pointerleave", sair)
    return () => {
      el.removeEventListener("pointermove", mover)
      el.removeEventListener("pointerleave", sair)
    }
  }, [])
  return (
    <div ref={ref} className={`snx-tilt ${className}`}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// MTM Sensei EA — entrada no order block, quatro saídas parciais e trailing
// ─────────────────────────────────────────────────────────────────────────────

/** [x, abertura, fecho, máximo, mínimo] — um pullback ao order block antes da perna de subida. */
const VELAS_EA: Array<[number, number, number, number, number]> = [
  [24, 196, 186, 180, 202], [38, 186, 191, 178, 198], [52, 191, 177, 171, 196],
  [66, 177, 180, 169, 188], [80, 180, 166, 160, 184], [94, 166, 156, 150, 170],
  [108, 156, 162, 151, 167], [122, 162, 152, 146, 166], [136, 152, 160, 148, 165],
  [150, 160, 170, 156, 176], [164, 170, 178, 166, 184], [178, 178, 172, 168, 186],
  [192, 172, 182, 168, 190], [206, 182, 176, 172, 192], [220, 176, 168, 164, 180],
  [234, 168, 160, 156, 172], [248, 160, 166, 156, 170], [262, 166, 154, 150, 169],
  [276, 154, 146, 140, 158], [290, 146, 150, 142, 154], [304, 150, 140, 134, 152],
  [318, 140, 132, 128, 144],
]

const Y_EA = { entrada: 132, sl: 188, tp1: 108, tp2: 86, tp3: 64, tp4: 42 }

/** O preço depois da entrada. Os vértices 2, 4, 6 e 8 são os toques nos quatro alvos. */
const PRECO_EA: Pt[] = [
  [332, 132], [356, 122], [376, 108], [394, 116], [418, 86], [436, 94],
  [462, 64], [480, 72], [512, 42], [530, 48], [560, 38],
]

export function GraficoEaAnimado({ className }: { className?: string }) {
  const CICLO = 12
  const OCUPA = 0.82 // fracção do ciclo em que o preço se desenha
  const REINICIO = 0.93
  const fr = fraccoes(PRECO_EA)
  const tTP = [2, 4, 6, 8].map((i) => noCiclo(fr[i], OCUPA))
  const d = caminho(PRECO_EA)
  const comp = 600 // pathLength normalizado

  // O stop sobe aos degraus: breakeven no TP1 e depois um nível atrás de cada alvo.
  const degraus = [Y_EA.sl, Y_EA.entrada, Y_EA.tp1, Y_EA.tp2, Y_EA.tp3]
  const valoresSL = [degraus[0], degraus[0], ...tTP.flatMap((_, i) => [degraus[i], degraus[i + 1]]), degraus[4], degraus[0], degraus[0]]
  const tempoSL = [0, 0.02, ...tTP.flatMap((t) => [t, t + 0.015]), REINICIO, REINICIO + 0.03, 1]

  return (
    <svg viewBox="0 0 640 260" className={className} role="img" aria-label="Animação: o MTM Sensei EA entra no order block, tira quatro parciais e sobe o stop em trailing">
      <defs>
        <linearGradient id="snx-ea-fundo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0F0F15" />
          <stop offset="1" stopColor="#08080B" />
        </linearGradient>
        <filter id="snx-ea-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="640" height="260" rx="12" fill="url(#snx-ea-fundo)" />
      {[40, 80, 120, 160, 200, 240].map((y) => (
        <line key={y} x1="14" y1={y} x2="626" y2={y} stroke="#1A1A22" />
      ))}

      {/* order block */}
      <rect className="snx-pulso" x="138" y="166" width="96" height="26" fill={OURO} />
      <text x="140" y="206" fill={OURO} fontSize="10" fontFamily="monospace" opacity="0.9">ORDER BLOCK</text>

      {/* velas — entram uma a uma */}
      {VELAS_EA.map(([x, o, c, hi, lo], i) => {
        const sobe = c < o
        const cor = sobe ? VERDE : VERMELHO
        return (
          <g key={i} className="snx-vela" style={{ animationDelay: `${i * 55}ms` }}>
            <line x1={x} y1={hi} x2={x} y2={lo} stroke={cor} strokeWidth="1" />
            <rect x={x - 3.5} y={Math.min(o, c)} width="7" height={Math.max(2, Math.abs(c - o))} fill={cor} rx="1" />
          </g>
        )
      })}

      {/* níveis */}
      {[
        { y: Y_EA.entrada, cor: OURO_CLARO, txt: "ENTRADA" },
        { y: Y_EA.tp1, cor: VERDE, txt: "TP1" },
        { y: Y_EA.tp2, cor: VERDE, txt: "TP2" },
        { y: Y_EA.tp3, cor: VERDE, txt: "TP3" },
        { y: Y_EA.tp4, cor: VERDE, txt: "TP4" },
      ].map(({ y, cor, txt }) => (
        <g key={txt}>
          <line x1="332" y1={y} x2="598" y2={y} stroke={cor} strokeDasharray="4 4" opacity="0.55" />
          <text x="628" y={y + 3.5} fill={cor} fontSize="10" fontFamily="monospace" textAnchor="end">{txt}</text>
        </g>
      ))}

      {/* stop: começa no SL e sobe aos degraus */}
      <g>
        <line x1="332" x2="598" y1={Y_EA.sl} y2={Y_EA.sl} stroke={VERMELHO} strokeWidth="1.4" strokeDasharray="6 3">
          <animate attributeName="y1" dur={`${CICLO}s`} repeatCount="indefinite" values={valoresSL.join(";")} keyTimes={tempoSL.map(f3).join(";")} />
          <animate attributeName="y2" dur={`${CICLO}s`} repeatCount="indefinite" values={valoresSL.join(";")} keyTimes={tempoSL.map(f3).join(";")} />
          <animate attributeName="stroke" dur={`${CICLO}s`} repeatCount="indefinite" values={`${VERMELHO};${VERMELHO};${OURO};${OURO};${VERMELHO};${VERMELHO}`} keyTimes={`0;${f3(tTP[0])};${f3(tTP[0] + 0.015)};${f3(REINICIO)};${f3(REINICIO + 0.03)};1`} />
        </line>
        <text x="596" y={Y_EA.sl + 13} fill={VERMELHO} fontSize="9.5" fontFamily="monospace" textAnchor="end">
          STOP · BE · TRAILING
          <animate attributeName="y" dur={`${CICLO}s`} repeatCount="indefinite" values={valoresSL.map((v) => v + 13).join(";")} keyTimes={tempoSL.map(f3).join(";")} />
          <animate attributeName="fill" dur={`${CICLO}s`} repeatCount="indefinite" values={`${VERMELHO};${VERMELHO};${OURO};${OURO};${VERMELHO};${VERMELHO}`} keyTimes={`0;${f3(tTP[0])};${f3(tTP[0] + 0.015)};${f3(REINICIO)};${f3(REINICIO + 0.03)};1`} />
        </text>
      </g>

      {/* sinal */}
      <g filter="url(#snx-ea-glow)">
        <path d="M326 214 l6 -12 l6 12 z" fill={OURO_CLARO} />
      </g>
      <text x="332" y="232" fill={OURO_CLARO} fontSize="10" fontFamily="monospace" textAnchor="middle">BUY · SCORE</text>

      {/* o preço desenha-se */}
      <path d={d} fill="none" stroke={OURO_CLARO} strokeWidth="2.2" strokeLinejoin="round" filter="url(#snx-ea-glow)" pathLength={comp} strokeDasharray={comp} strokeDashoffset={comp}>
        <animate attributeName="stroke-dashoffset" dur={`${CICLO}s`} repeatCount="indefinite" values={`${comp};0;0;${comp};${comp}`} keyTimes={`0;${f3(OCUPA)};${f3(REINICIO)};${f3(REINICIO + 0.03)};1`} />
      </path>

      {/* parciais */}
      {tTP.map((t, i) => {
        const [x, y] = PRECO_EA[[2, 4, 6, 8][i]]
        const a = acende(t, REINICIO)
        return (
          <g key={i} opacity="0">
            <animate attributeName="opacity" dur={`${CICLO}s`} repeatCount="indefinite" values={a.values} keyTimes={a.keyTimes} />
            <circle cx={x} cy={y} r="4" fill={VERDE} filter="url(#snx-ea-glow)" />
            <rect x={x - 34} y={y - 27} width="68" height="17" rx="8.5" fill="#0B0B0F" stroke={`${VERDE}aa`} />
            <text x={x} y={y - 15} fill={VERDE} fontSize="9.5" fontFamily="monospace" textAnchor="middle">{`PARCIAL ${i + 1}`}</text>
          </g>
        )
      })}
    </svg>
  )
}

/** Uma amostra das confirmações a acender em sequência, como no painel do EA. */
const CONFIRMACOES = [
  "Tendência HTF",
  "EMA 200 fechada",
  "Estrutura · BOS",
  "CHoCH",
  "Order block",
  "Sweep de liquidez",
  "POC / volume",
  "RSI",
  "ADX",
  "Fluxo de ordens",
  "Sessão",
  "Filtro de notícias",
]

export function ConfirmacoesAnimadas() {
  const ref = useRef<HTMLDivElement>(null)
  const [n, setN] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let timer: ReturnType<typeof setInterval> | undefined
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting || timer) return
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setN(CONFIRMACOES.length)
        return
      }
      timer = setInterval(() => {
        setN((v) => {
          if (v >= CONFIRMACOES.length + 6) return 0 // pausa no fim e recomeça
          return v + 1
        })
      }, 380)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      if (timer) clearInterval(timer)
    }
  }, [])
  const acesas = Math.min(n, CONFIRMACOES.length)
  const completo = acesas === CONFIRMACOES.length

  return (
    <div ref={ref} className="rounded-2xl border border-[#D2A63C]/25 bg-[#0B0B0F] p-5">
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="font-bold tracking-wider text-[#D2A63C]">CONFIRMAÇÕES</span>
        <span className="text-gray-500">a cada vela fechada</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#BB8525] to-[#E9C46A] transition-[width] duration-300"
          style={{ width: `${(acesas / CONFIRMACOES.length) * 100}%` }}
        />
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2.5">
        {CONFIRMACOES.map((c, i) => (
          <li key={c} className={`snx-tick flex items-center gap-2 font-mono text-[12px] text-gray-300 ${i < acesas ? "on" : ""}`}>
            <span className={`h-2 w-2 rounded-full ${i < acesas ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,.8)]" : "bg-gray-700"}`} />
            {c}
          </li>
        ))}
      </ul>
      <div
        className={`mt-5 rounded-lg border px-3 py-2 text-center font-mono text-xs font-bold tracking-wider transition-all duration-500 ${
          completo ? "border-[#D2A63C] bg-[#D2A63C]/15 text-[#E9C46A]" : "border-gray-800 text-gray-600"
        }`}
      >
        {completo ? "SETUP CONFIRMADO · ENTRADA" : "A LER O MERCADO…"}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sensei Scalp Edition — duas pendentes, breakeven, trailing e reversão
// ─────────────────────────────────────────────────────────────────────────────

const Y_SC = { buyStop: 112, sellStop: 196 }

/**
 * Vértice 2 cruza o buy stop (compra activa), 5 é o topo, 7 cruza o stop em trailing (reversão:
 * fecha a compra e abre a venda).
 */
const PRECO_SC: Pt[] = [
  [40, 154], [76, 140], [104, 112], [134, 98], [160, 104], [196, 70],
  [222, 76], [250, 94], [282, 120], [316, 112], [356, 150], [392, 142], [430, 176], [470, 168], [520, 196], [600, 204],
]

export function ScalpAnimado({ className }: { className?: string }) {
  const CICLO = 13
  const OCUPA = 0.86
  const REINICIO = 0.94
  const fr = fraccoes(PRECO_SC)
  const tCompra = noCiclo(fr[2], OCUPA)
  const tTopo = noCiclo(fr[5], OCUPA)
  const tRev = noCiclo(fr[7], OCUPA)
  const d = caminho(PRECO_SC)
  const comp = 800

  const yTrailTopo = 94 // o stop depois de o preço fazer o topo
  // Stop da compra: aparece no breakeven (112), sobe a seguir ao topo e é tocado na reversão.
  const slValores = [112, 112, 112, yTrailTopo, yTrailTopo, yTrailTopo, 112, 112]
  const slTempos = [0, tCompra, tCompra + 0.05, tTopo + 0.03, tRev, REINICIO, REINICIO + 0.03, 1]
  // A venda pendente vive logo abaixo do stop: sobe com ele.
  const svValores = [Y_SC.sellStop, Y_SC.sellStop, yTrailTopo + 8, yTrailTopo + 8, Y_SC.sellStop, Y_SC.sellStop]
  const svTempos = [0, tCompra + 0.01, tTopo + 0.03, REINICIO, REINICIO + 0.03, 1]

  const linhaSl = acende(tCompra + 0.01, tRev)
  const comprado = acende(tCompra, tRev)
  const vendido = acende(tRev, REINICIO)
  const fx = (t: number) => f3(t)

  return (
    <svg viewBox="0 0 640 260" className={className} role="img" aria-label="Animação: a Sensei Scalp Edition arma uma ordem de cada lado, segue com breakeven e trailing, e reverte quando o preço vira">
      <defs>
        <linearGradient id="snx-sc-fundo" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0F0F15" />
          <stop offset="1" stopColor="#08080B" />
        </linearGradient>
        <filter id="snx-sc-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width="640" height="260" rx="12" fill="url(#snx-sc-fundo)" />
      {[40, 80, 120, 160, 200, 240].map((y) => (
        <line key={y} x1="14" y1={y} x2="626" y2={y} stroke="#1A1A22" />
      ))}

      {/* buy stop: pendente até disparar, depois é a compra aberta */}
      <line x1="20" x2="600" y1={Y_SC.buyStop} y2={Y_SC.buyStop} stroke={OURO_CLARO} strokeDasharray="5 4" opacity="0.8">
        <animate attributeName="opacity" dur={`${CICLO}s`} repeatCount="indefinite" values="0.8;0.8;0.25;0.25;0.8;0.8" keyTimes={`0;${fx(tCompra)};${fx(tCompra + 0.02)};${fx(REINICIO)};${fx(REINICIO + 0.03)};1`} />
      </line>
      <text x="600" y={Y_SC.buyStop + 15} fill={OURO_CLARO} fontSize="10" fontFamily="monospace" textAnchor="end">BUY STOP</text>

      {/* sell stop: sobe atrás do stop da compra */}
      <line x1="20" x2="600" y1={Y_SC.sellStop} y2={Y_SC.sellStop} stroke={VERMELHO} strokeDasharray="5 4" opacity="0.8">
        <animate attributeName="y1" dur={`${CICLO}s`} repeatCount="indefinite" values={svValores.join(";")} keyTimes={svTempos.map(fx).join(";")} />
        <animate attributeName="y2" dur={`${CICLO}s`} repeatCount="indefinite" values={svValores.join(";")} keyTimes={svTempos.map(fx).join(";")} />
      </line>
      <text x="24" y={Y_SC.sellStop + 14} fill={VERMELHO} fontSize="10" fontFamily="monospace">
        SELL STOP
        <animate attributeName="y" dur={`${CICLO}s`} repeatCount="indefinite" values={svValores.map((v) => v + 14).join(";")} keyTimes={svTempos.map(fx).join(";")} />
      </text>

      {/* stop da compra: breakeven e trailing */}
      <g opacity="0">
        <animate attributeName="opacity" dur={`${CICLO}s`} repeatCount="indefinite" values={linhaSl.values} keyTimes={linhaSl.keyTimes} />
        <line x1="20" x2="600" y1="112" y2="112" stroke={OURO} strokeWidth="1.6">
          <animate attributeName="y1" dur={`${CICLO}s`} repeatCount="indefinite" values={slValores.join(";")} keyTimes={slTempos.map(fx).join(";")} />
          <animate attributeName="y2" dur={`${CICLO}s`} repeatCount="indefinite" values={slValores.join(";")} keyTimes={slTempos.map(fx).join(";")} />
        </line>
        <text x="600" y="107" fill={OURO} fontSize="10" fontFamily="monospace" textAnchor="end">
          STOP · BE → TRAILING
          <animate attributeName="y" dur={`${CICLO}s`} repeatCount="indefinite" values={slValores.map((v) => v - 5).join(";")} keyTimes={slTempos.map(fx).join(";")} />
        </text>
      </g>

      {/* o preço desenha-se */}
      <path d={d} fill="none" stroke="#F3F0E8" strokeWidth="2" strokeLinejoin="round" pathLength={comp} strokeDasharray={comp} strokeDashoffset={comp} filter="url(#snx-sc-glow)">
        <animate attributeName="stroke-dashoffset" dur={`${CICLO}s`} repeatCount="indefinite" values={`${comp};0;0;${comp};${comp}`} keyTimes={`0;${fx(OCUPA)};${fx(REINICIO)};${fx(REINICIO + 0.03)};1`} />
      </path>

      {/* etiquetas de estado */}
      <g opacity="0">
        <animate attributeName="opacity" dur={`${CICLO}s`} repeatCount="indefinite" values={comprado.values} keyTimes={comprado.keyTimes} />
        <circle cx={PRECO_SC[2][0]} cy={PRECO_SC[2][1]} r="4.5" fill={VERDE} filter="url(#snx-sc-glow)" />
        <rect x="56" y="70" width="112" height="19" rx="9.5" fill="#0B0B0F" stroke={`${VERDE}aa`} />
        <text x="112" y="83.5" fill={VERDE} fontSize="10" fontFamily="monospace" textAnchor="middle">COMPRA ACTIVA</text>
      </g>
      <g opacity="0">
        <animate attributeName="opacity" dur={`${CICLO}s`} repeatCount="indefinite" values={vendido.values} keyTimes={vendido.keyTimes} />
        <circle cx={PRECO_SC[7][0]} cy={PRECO_SC[7][1]} r="4.5" fill={OURO_CLARO} filter="url(#snx-sc-glow)" />
        <rect x="262" y="40" width="176" height="19" rx="9.5" fill="#0B0B0F" stroke={`${OURO}cc`} />
        <text x="350" y="53.5" fill={OURO_CLARO} fontSize="10" fontFamily="monospace" textAnchor="middle">REVERSÃO · FECHA E VENDE</text>
      </g>
    </svg>
  )
}

/** Faixa de factos do produto, com contagem ao entrar. Só especificações — nunca desempenho. */
export function FaixaFactos({ itens }: { itens: Array<{ valor: number | string; sufixo?: string; rotulo: string }> }) {
  const ref = useRef<HTMLDivElement>(null)
  const [p, setP] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let raf = 0
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setP(1)
      const t0 = performance.now()
      const passo = (t: number) => {
        const k = Math.min(1, (t - t0) / 1200)
        setP(1 - Math.pow(1 - k, 3))
        if (k < 1) raf = requestAnimationFrame(passo)
      }
      raf = requestAnimationFrame(passo)
    })
    io.observe(el)
    return () => {
      io.disconnect()
      cancelAnimationFrame(raf)
    }
  }, [])
  return (
    <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-px overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-[#D2A63C]/15">
      {itens.map((it) => (
        <div key={it.rotulo} className="bg-gray-950/95 px-5 py-6 text-center">
          <div className="text-3xl md:text-4xl font-bold tabular-nums text-[#E9C46A]">
            {typeof it.valor === "number" ? Math.round(it.valor * p) : it.valor}
            {it.sufixo && <span className="text-xl md:text-2xl text-[#D2A63C]">{it.sufixo}</span>}
          </div>
          <div className="mt-1.5 text-xs uppercase tracking-wider text-gray-500">{it.rotulo}</div>
        </div>
      ))}
    </div>
  )
}
