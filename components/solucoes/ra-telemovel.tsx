"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Camera, CameraOff, Download, Move3d, X } from "lucide-react"
import type { ModeloSector } from "@/lib/site-solucoes/showroom"
import { useT } from "@/components/solucoes/idioma"

/**
 * «Ver no meu espaço»: a app do negócio em 3D e em realidade aumentada, no browser.
 *
 * Pedido do Ricardo (21/11/2026): as renderizações «devem quase tratar-se de uma realidade
 * aumentada». Sem apps nem modelos descarregados: o telemóvel é desenhado em Three.js com o ecrã
 * pintado ao vivo (nome, cor e serviços que a pessoa escolheu), cartões holográficos à volta e
 * reflexos de estúdio.
 *
 *  · Modo 3D: arrasta para rodar, aperta (ou roda do rato) para aproximar.
 *  · Modo RA: abre a câmara traseira e usa o giroscópio para o telemóvel ficar «pousado» no teu
 *    espaço enquanto mexes o telefone (3 graus de liberdade). Sem giroscópio fica à frente.
 *  · Fotografar: junta a imagem da câmara com o 3D e partilha ou descarrega.
 *
 * Carrega o three só quando abre; pára tudo (câmara incluída) ao fechar.
 */

type T3 = typeof import("three")

export function RaTelemovel({ m, marca, principal, onFechar }: { m: ModeloSector; marca: string; principal: string; onFechar: () => void }) {
  const { t } = useT()
  const palco = useRef<HTMLDivElement>(null)
  const video = useRef<HTMLVideoElement>(null)
  const api = useRef<{ foto: () => HTMLCanvasElement | null; modoRA: (on: boolean, alpha?: number) => void } | null>(null)
  const [montado, setMontado] = useState(false)
  const [ra, setRa] = useState(false)
  const [erro, setErro] = useState("")
  const [foto, setFoto] = useState<string | null>(null)
  const fechar = useRef(onFechar)
  fechar.current = onFechar

  // textos do ecrã pintado (traduzidos uma vez)
  const textos = {
    marcar: t("Marcar"),
    titulo: t(m.destaque.titulo),
    itens: m.destaque.itens.map((i) => ({ a: t(i.a), b: i.b ? t(i.b) : "", c: i.c ? t(i.c) : "" })),
    servicos: m.servicos.map((s) => ({ s: t(s.s), p: t(s.p) })),
    slogan: t(m.slogan),
    servicosTitulo: t("Serviços"),
    cartoes: [t("Marcação confirmada"), t("Lembrete enviado"), t("Nova avaliação")],
  }
  const textosRef = useRef(textos)

  useEffect(() => {
    setMontado(true)
    const antes = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const esc = (e: KeyboardEvent) => e.key === "Escape" && fechar.current()
    window.addEventListener("keydown", esc)
    return () => {
      document.body.style.overflow = antes
      window.removeEventListener("keydown", esc)
    }
  }, [])

  useEffect(() => {
    if (!montado || !palco.current) return
    let parar = () => {}
    let vivo = true
    import("three").then(async (THREE) => {
      const { RoomEnvironment } = await import("three/examples/jsm/environments/RoomEnvironment.js")
      if (!vivo || !palco.current) return
      const r = montar(THREE, RoomEnvironment, palco.current, { m, marca, principal, textos: textosRef.current })
      api.current = r
      parar = r.parar
    })
    return () => {
      vivo = false
      parar()
      api.current = null
    }
  }, [montado, m, marca, principal])

  // câmara
  useEffect(() => {
    if (!ra) return
    let stream: MediaStream | null = null
    let cancelado = false
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        if (cancelado) return stream.getTracks().forEach((x) => x.stop())
        if (video.current) {
          video.current.srcObject = stream
          await video.current.play().catch(() => {})
        }
      } catch {
        setErro(t("Não conseguimos abrir a câmara. Dá autorização no browser ou continua em 3D."))
        setRa(false)
        api.current?.modoRA(false)
      }
    })()
    return () => {
      cancelado = true
      stream?.getTracks().forEach((x) => x.stop())
      if (video.current) video.current.srcObject = null
    }
    // t é estável por idioma
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ra])

  async function ligarRA() {
    setErro("")
    if (!navigator.mediaDevices?.getUserMedia) {
      setErro(t("Este browser não deixa usar a câmara. Experimenta no telemóvel, em Safari ou Chrome."))
      return
    }
    // iOS pede autorização para o giroscópio, e tem de ser dentro do toque
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent
    if (DOE?.requestPermission) {
      try {
        await DOE.requestPermission()
      } catch {
        /* segue sem giroscópio */
      }
    }
    api.current?.modoRA(true)
    setRa(true)
  }

  function desligarRA() {
    api.current?.modoRA(false)
    setRa(false)
  }

  function fotografar() {
    const c3 = api.current?.foto()
    if (!c3) return
    const v = video.current
    const W = c3.width
    const H = c3.height
    const c = document.createElement("canvas")
    c.width = W
    c.height = H
    const g = c.getContext("2d")!
    if (ra && v && v.videoWidth) {
      // object-cover
      const s = Math.max(W / v.videoWidth, H / v.videoHeight)
      const w = v.videoWidth * s
      const h = v.videoHeight * s
      g.drawImage(v, (W - w) / 2, (H - h) / 2, w, h)
    } else {
      const grad = g.createRadialGradient(W / 2, H * 0.45, 10, W / 2, H * 0.45, Math.max(W, H) * 0.7)
      grad.addColorStop(0, "#2a2210")
      grad.addColorStop(1, "#060608")
      g.fillStyle = grad
      g.fillRect(0, 0, W, H)
    }
    g.drawImage(c3, 0, 0)
    const k = W / 400
    g.fillStyle = "rgba(0,0,0,0.45)"
    g.fillRect(0, H - 34 * k, W, 34 * k)
    g.fillStyle = "#E9C46A"
    g.font = `600 ${13 * k}px system-ui, sans-serif`
    g.textBaseline = "middle"
    g.fillText(`${marca} · morethanmoney.pt/demos`, 14 * k, H - 17 * k)
    setFoto(c.toDataURL("image/jpeg", 0.9))
  }

  async function partilhar() {
    if (!foto) return
    try {
      const blob = await (await fetch(foto)).blob()
      const file = new File([blob], `${marca.replace(/\W+/g, "-").toLowerCase() || "app"}-ra.jpg`, { type: "image/jpeg" })
      const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean }
      if (nav.share && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: marca })
        return
      }
    } catch {
      /* cai para descarregar */
    }
    const a = document.createElement("a")
    a.href = foto
    a.download = `${marca.replace(/\W+/g, "-").toLowerCase() || "app"}-ra.jpg`
    a.click()
  }

  if (!montado) return null

  return createPortal(
    <div className="fixed inset-0 z-[200] select-none overflow-hidden bg-[#050507] text-white" role="dialog" aria-modal="true" aria-label={t("Ver no meu espaço")}>
      {/* fundo de estúdio (modo 3D) */}
      <div
        className={`absolute inset-0 transition-opacity duration-500 ${ra ? "opacity-0" : "opacity-100"}`}
        style={{ background: `radial-gradient(60% 50% at 50% 42%, ${principal}33 0%, transparent 60%), radial-gradient(80% 60% at 50% 100%, #D2A63C22 0%, transparent 60%), #050507` }}
        aria-hidden="true"
      />
      <video ref={video} playsInline muted className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${ra ? "opacity-100" : "opacity-0"}`} aria-hidden="true" />
      <div ref={palco} className="absolute inset-0 touch-none" />

      {/* barra de cima */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 bg-gradient-to-b from-black/70 to-transparent p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#D2A63C]">{ra ? t("Realidade aumentada") : t("Modelo 3D")}</p>
          <p className="text-lg font-bold">{marca}</p>
        </div>
        <button type="button" onClick={() => fechar.current()} aria-label={t("Fechar")} className="flex h-11 w-11 items-center justify-center rounded-full bg-black/50 backdrop-blur hover:bg-black/70">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* comandos */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-10">
        {erro && <p className="mx-auto mb-3 max-w-md rounded-xl bg-red-500/15 px-3 py-2 text-center text-sm text-red-200">{erro}</p>}
        <p className="mb-3 flex items-center justify-center gap-2 text-center text-xs text-zinc-300">
          <Move3d className="h-4 w-4 text-[#E9C46A]" aria-hidden="true" />
          {ra ? t("Mexe o telefone à volta: a app fica pousada no teu espaço.") : t("Arrasta para rodar · aperta para aproximar")}
        </p>
        <div className="mx-auto flex max-w-md flex-wrap items-center justify-center gap-2">
          {ra ? (
            <button type="button" onClick={desligarRA} className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-white/25 bg-black/40 px-5 text-sm font-semibold backdrop-blur">
              <CameraOff className="h-4 w-4" aria-hidden="true" /> {t("Sair da câmara")}
            </button>
          ) : (
            <button type="button" onClick={ligarRA} className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#D2A63C] px-6 text-sm font-semibold text-black shadow-lg shadow-[#D2A63C]/30 hover:bg-[#E9C46A]">
              <Camera className="h-4 w-4" aria-hidden="true" /> {t("Ver no meu espaço")}
            </button>
          )}
          <button type="button" onClick={fotografar} className="inline-flex min-h-[48px] items-center gap-2 rounded-full border border-[#D2A63C]/60 bg-black/40 px-5 text-sm font-semibold text-[#E9C46A] backdrop-blur">
            <span className="h-3 w-3 rounded-full border-2 border-current" aria-hidden="true" /> {t("Fotografar")}
          </button>
        </div>
        {marca === m.marca && <p className="mt-3 text-center text-[11px] text-zinc-500">{t("Negócio fictício, só para mostrar o modelo.")}</p>}
      </div>

      {foto && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/85 p-6 backdrop-blur">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto} alt={t("Fotografia da app no teu espaço")} className="max-h-[70vh] max-w-full rounded-2xl border border-white/15 shadow-2xl" />
          <div className="flex gap-2">
            <button type="button" onClick={partilhar} className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-[#D2A63C] px-6 text-sm font-semibold text-black">
              <Download className="h-4 w-4" aria-hidden="true" /> {t("Guardar ou partilhar")}
            </button>
            <button type="button" onClick={() => setFoto(null)} className="inline-flex min-h-[48px] items-center rounded-full border border-white/20 px-5 text-sm font-semibold">
              {t("Voltar")}
            </button>
          </div>
        </div>
      )}
    </div>,
    document.body,
  )
}

/* ───────────────────────── Three.js ───────────────────────── */

interface Dados {
  m: ModeloSector
  marca: string
  principal: string
  textos: {
    marcar: string
    titulo: string
    itens: { a: string; b: string; c: string }[]
    servicos: { s: string; p: string }[]
    slogan: string
    servicosTitulo: string
    cartoes: string[]
  }
}

function claro(hex: string): boolean {
  const h = hex.replace("#", "")
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 150
}

const FONTES = { serif: "Georgia, 'Times New Roman', serif", condensada: "'Arial Narrow', 'Roboto Condensed', Impact, sans-serif", sans: "system-ui, -apple-system, 'Segoe UI', sans-serif" }

function redondo(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath()
  g.moveTo(x + r, y)
  g.arcTo(x + w, y, x + w, y + h, r)
  g.arcTo(x + w, y + h, x, y + h, r)
  g.arcTo(x, y + h, x, y, r)
  g.arcTo(x, y, x + w, y, r)
  g.closePath()
}

function cortar(g: CanvasRenderingContext2D, s: string, max: number): string {
  if (g.measureText(s).width <= max) return s
  let x = s
  while (x.length > 1 && g.measureText(`${x}…`).width > max) x = x.slice(0, -1)
  return `${x}…`
}

/** Pinta o ecrã da app: o mesmo desenho do telemóvel do showroom, em 600×1300. */
function pintarEcra(d: Dados): HTMLCanvasElement {
  const W = 600
  const H = 1300
  const c = document.createElement("canvas")
  c.width = W
  c.height = H
  const g = c.getContext("2d")!
  const { m, marca, principal, textos } = d
  const fonte = FONTES[m.letra]
  const escuro = !claro(m.corFundo)
  const sobre = claro(principal) ? "#111" : "#fff"
  g.save()
  redondo(g, 0, 0, W, H, 70)
  g.clip()
  g.fillStyle = m.corFundo
  g.fillRect(0, 0, W, H)
  // cabeçalho
  const grad = g.createLinearGradient(0, 0, W, 420)
  grad.addColorStop(0, principal)
  grad.addColorStop(1, `${principal}cc`)
  g.fillStyle = grad
  g.fillRect(0, 0, W, 430)
  g.fillStyle = sobre
  g.globalAlpha = 0.85
  g.font = `600 26px ${FONTES.sans}`
  g.fillText("9:41", 56, 66)
  g.fillText("●●● ▮", W - 140, 66)
  g.globalAlpha = 1
  // logótipo redondo com inicial
  g.fillStyle = sobre
  g.globalAlpha = 0.18
  g.beginPath()
  g.arc(96, 190, 52, 0, Math.PI * 2)
  g.fill()
  g.globalAlpha = 1
  g.font = `800 54px ${fonte}`
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillText((marca.trim()[0] ?? "M").toUpperCase(), 96, 194)
  g.textAlign = "left"
  g.textBaseline = "alphabetic"
  g.font = `800 ${marca.length > 16 ? 50 : 62}px ${fonte}`
  g.fillText(cortar(g, marca, W - 100), 50, 320)
  g.globalAlpha = 0.85
  g.font = `400 28px ${FONTES.sans}`
  g.fillText(cortar(g, textos.slogan, W - 100), 50, 372)
  g.globalAlpha = 1

  // destaque
  const texto = m.corTexto
  const cartao = escuro ? "rgba(255,255,255,0.07)" : "#ffffff"
  const linha = escuro ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)"
  g.fillStyle = texto
  g.font = `700 32px ${fonte}`
  g.fillText(cortar(g, textos.titulo, W - 100), 50, 500)
  let y = 530
  const horas = textos.itens.every((i) => !i.b && !i.c)
  if (horas) {
    let x = 50
    for (const i of textos.itens.slice(0, 5)) {
      g.font = `700 28px ${FONTES.sans}`
      const w = g.measureText(i.a).width + 44
      if (x + w > W - 50) {
        x = 50
        y += 82
      }
      redondo(g, x, y, w, 64, 32)
      g.fillStyle = i === textos.itens[1] ? principal : cartao
      g.fill()
      g.strokeStyle = linha
      g.lineWidth = 2
      g.stroke()
      g.fillStyle = i === textos.itens[1] ? sobre : texto
      g.fillText(i.a, x + 22, y + 42)
      x += w + 14
    }
    y += 100
  } else {
    for (const i of textos.itens.slice(0, 3)) {
      redondo(g, 50, y, W - 100, 100, 24)
      g.fillStyle = cartao
      g.fill()
      g.strokeStyle = linha
      g.lineWidth = 2
      g.stroke()
      g.fillStyle = texto
      g.font = `700 30px ${FONTES.sans}`
      g.fillText(cortar(g, i.a, W - 300), 78, y + 46)
      if (i.b) {
        g.globalAlpha = 0.6
        g.font = `400 24px ${FONTES.sans}`
        g.fillText(cortar(g, i.b, W - 300), 78, y + 80)
        g.globalAlpha = 1
      }
      if (i.c) {
        g.font = `700 26px ${FONTES.sans}`
        const w = g.measureText(i.c).width
        g.fillStyle = principal
        g.fillText(i.c, W - 78 - w, y + 60)
      }
      y += 118
    }
    y += 10
  }

  // serviços
  g.fillStyle = texto
  g.font = `700 32px ${fonte}`
  g.fillText(textos.servicosTitulo, 50, y + 30)
  y += 56
  for (const s of textos.servicos.slice(0, 3)) {
    if (y + 84 > H - 210) break
    g.strokeStyle = linha
    g.lineWidth = 2
    g.beginPath()
    g.moveTo(50, y + 84)
    g.lineTo(W - 50, y + 84)
    g.stroke()
    g.fillStyle = texto
    g.font = `600 28px ${FONTES.sans}`
    g.fillText(cortar(g, s.s, W - 290), 50, y + 52)
    g.globalAlpha = 0.65
    g.font = `500 26px ${FONTES.sans}`
    const w = g.measureText(s.p).width
    g.fillText(s.p, W - 50 - w, y + 52)
    g.globalAlpha = 1
    y += 84
  }

  // botão
  redondo(g, 50, H - 190, W - 100, 104, 52)
  g.fillStyle = principal
  g.fill()
  g.fillStyle = sobre
  g.font = `800 36px ${FONTES.sans}`
  g.textAlign = "center"
  g.fillText(textos.marcar, W / 2, H - 125)
  g.textAlign = "left"
  // barra de casa
  g.fillStyle = texto
  g.globalAlpha = 0.35
  redondo(g, W / 2 - 90, H - 40, 180, 10, 5)
  g.fill()
  g.restore()
  return c
}

function pintarCartao(texto: string, icone: string): HTMLCanvasElement {
  const c = document.createElement("canvas")
  c.width = 640
  c.height = 150
  const g = c.getContext("2d")!
  redondo(g, 6, 6, 628, 138, 40)
  const grad = g.createLinearGradient(0, 0, 640, 150)
  grad.addColorStop(0, "rgba(20,18,12,0.92)")
  grad.addColorStop(1, "rgba(40,32,14,0.92)")
  g.fillStyle = grad
  g.fill()
  g.strokeStyle = "rgba(233,196,106,0.85)"
  g.lineWidth = 4
  g.stroke()
  g.beginPath()
  g.arc(78, 75, 40, 0, Math.PI * 2)
  g.fillStyle = "#D2A63C"
  g.fill()
  g.fillStyle = "#08090C"
  g.font = "800 44px system-ui, sans-serif"
  g.textAlign = "center"
  g.textBaseline = "middle"
  g.fillText(icone, 78, 78)
  g.textAlign = "left"
  g.fillStyle = "#F4F4F5"
  g.font = "700 42px system-ui, sans-serif"
  g.fillText(cortar(g, texto, 480), 140, 78)
  return c
}

function montar(
  THREE: T3,
  RoomEnvironment: new () => import("three").Scene,
  el: HTMLElement,
  d: Dados,
): { parar: () => void; foto: () => HTMLCanvasElement | null; modoRA: (on: boolean) => void } {
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.05
  el.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environment = env

  const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 50)
  camera.position.set(0, 0, 4.2)

  // grupo do produto (o que se roda, escala e pousa)
  const produto = new THREE.Group()
  scene.add(produto)
  const flutua = new THREE.Group()
  produto.add(flutua)

  // corpo do telemóvel
  const w = 0.78
  const h = 1.62
  const r = 0.12
  const forma = new THREE.Shape()
  forma.moveTo(-w / 2 + r, -h / 2)
  forma.lineTo(w / 2 - r, -h / 2)
  forma.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
  forma.lineTo(w / 2, h / 2 - r)
  forma.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
  forma.lineTo(-w / 2 + r, h / 2)
  forma.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
  forma.lineTo(-w / 2, -h / 2 + r)
  forma.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  const prof = 0.06
  const corpoGeo = new THREE.ExtrudeGeometry(forma, { depth: prof, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 6, curveSegments: 24 })
  corpoGeo.translate(0, 0, -prof / 2)
  const vidro = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0e, metalness: 0.2, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.05 })
  const aro = new THREE.MeshPhysicalMaterial({ color: 0xd2a63c, metalness: 1, roughness: 0.22, clearcoat: 0.6 })
  const corpo = new THREE.Mesh(corpoGeo, [vidro, aro])
  flutua.add(corpo)

  // ecrã pintado
  const ecraTex = new THREE.CanvasTexture(pintarEcra(d))
  ecraTex.colorSpace = THREE.SRGBColorSpace
  ecraTex.anisotropy = renderer.capabilities.getMaxAnisotropy()
  const ecra = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.05, h - 0.05), new THREE.MeshBasicMaterial({ map: ecraTex, transparent: true, toneMapped: false }))
  ecra.position.z = prof / 2 + 0.017
  flutua.add(ecra)
  // reflexo diagonal no vidro
  const brilhoC = document.createElement("canvas")
  brilhoC.width = 64
  brilhoC.height = 256
  const bg = brilhoC.getContext("2d")!
  const bgr = bg.createLinearGradient(0, 0, 64, 256)
  bgr.addColorStop(0.0, "rgba(255,255,255,0)")
  bgr.addColorStop(0.42, "rgba(255,255,255,0)")
  bgr.addColorStop(0.5, "rgba(255,255,255,0.16)")
  bgr.addColorStop(0.58, "rgba(255,255,255,0)")
  bg.fillStyle = bgr
  bg.fillRect(0, 0, 64, 256)
  const brilho = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.05, h - 0.05), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(brilhoC), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }))
  brilho.position.z = ecra.position.z + 0.002
  flutua.add(brilho)
  // câmara traseira
  const lente = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 32), aro)
  lente.rotation.x = Math.PI / 2
  lente.position.set(-w / 2 + 0.16, h / 2 - 0.16, -prof / 2 - 0.02)
  flutua.add(lente)

  // cartões holográficos
  const icones = ["✓", "🔔", "★"]
  const cartoes = d.textos.cartoes.map((x, i) => {
    const tex = new THREE.CanvasTexture(pintarCartao(x, icones[i] ?? "✓"))
    tex.colorSpace = THREE.SRGBColorSpace
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }))
    s.scale.set(0.78, 0.183, 1)
    produto.add(s)
    return s
  })

  // anel de partículas douradas e sombra
  const N = reduzido ? 300 : 900
  const pos = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const a = Math.random() * Math.PI * 2
    const rr = 0.75 + Math.random() * 0.35
    pos[i * 3] = Math.cos(a) * rr
    pos[i * 3 + 1] = -1.08 + (Math.random() - 0.5) * 0.05
    pos[i * 3 + 2] = Math.sin(a) * rr
  }
  const pg = new THREE.BufferGeometry()
  pg.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  const particulas = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xe9c46a, size: 0.018, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
  produto.add(particulas)

  const sc = document.createElement("canvas")
  sc.width = sc.height = 128
  const sg = sc.getContext("2d")!
  const sgr = sg.createRadialGradient(64, 64, 4, 64, 64, 64)
  sgr.addColorStop(0, "rgba(0,0,0,0.55)")
  sgr.addColorStop(1, "rgba(0,0,0,0)")
  sg.fillStyle = sgr
  sg.fillRect(0, 0, 128, 128)
  const sombra = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false }))
  sombra.rotation.x = -Math.PI / 2
  sombra.position.y = -1.1
  produto.add(sombra)

  const luz = new THREE.DirectionalLight(0xfff1d6, 1.2)
  luz.position.set(2, 3, 4)
  scene.add(luz, new THREE.AmbientLight(0xffffff, 0.25))

  // interação: rodar, aproximar
  let yaw = -0.35
  let pitch = 0.08
  let alvoYaw = yaw
  let alvoPitch = pitch
  let escala = 1
  let alvoEscala = 1
  let ultimoToque = 0
  const ponteiros = new Map<number, { x: number; y: number }>()
  let distInicial = 0
  let escalaInicial = 1
  const cv = renderer.domElement
  const down = (e: PointerEvent) => {
    cv.setPointerCapture(e.pointerId)
    ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()]
      distInicial = Math.hypot(a.x - b.x, a.y - b.y)
      escalaInicial = alvoEscala
    }
    const agora = performance.now()
    if (agora - ultimoToque < 300) {
      alvoYaw = -0.35
      alvoPitch = 0.08
      alvoEscala = 1
    }
    ultimoToque = agora
  }
  const move = (e: PointerEvent) => {
    const p = ponteiros.get(e.pointerId)
    if (!p) return
    if (ponteiros.size === 1) {
      alvoYaw += (e.clientX - p.x) * 0.008
      alvoPitch = Math.max(-0.6, Math.min(0.6, alvoPitch + (e.clientY - p.y) * 0.004))
    }
    p.x = e.clientX
    p.y = e.clientY
    if (ponteiros.size === 2) {
      const [a, b] = [...ponteiros.values()]
      alvoEscala = Math.max(0.5, Math.min(2.2, (escalaInicial * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(1, distInicial)))
    }
  }
  const up = (e: PointerEvent) => ponteiros.delete(e.pointerId)
  const roda = (e: WheelEvent) => {
    e.preventDefault()
    alvoEscala = Math.max(0.5, Math.min(2.2, alvoEscala * (e.deltaY > 0 ? 0.92 : 1.08)))
  }
  cv.addEventListener("pointerdown", down)
  cv.addEventListener("pointermove", move)
  cv.addEventListener("pointerup", up)
  cv.addEventListener("pointercancel", up)
  cv.addEventListener("wheel", roda, { passive: false })

  // modo RA: câmara orientada pelo giroscópio (3 graus de liberdade)
  let emRA = false
  let orientacao: { a: number; b: number; g: number } | null = null
  let alphaZero: number | null = null
  const onOri = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null || e.gamma == null) return
    orientacao = { a: e.alpha, b: e.beta, g: e.gamma }
  }
  const zee = new THREE.Vector3(0, 0, 1)
  const euler = new THREE.Euler()
  const q0 = new THREE.Quaternion()
  const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5))
  function orientarCamera() {
    if (!orientacao) return
    const grau = THREE.MathUtils.DEG2RAD
    if (alphaZero == null) alphaZero = orientacao.a
    const ang = (screen.orientation?.angle ?? 0) * grau
    euler.set(orientacao.b * grau, (orientacao.a - alphaZero) * grau, -orientacao.g * grau, "YXZ")
    camera.quaternion.setFromEuler(euler)
    camera.quaternion.multiply(q1)
    camera.quaternion.multiply(q0.setFromAxisAngle(zee, -ang))
  }
  function modoRA(on: boolean) {
    emRA = on
    alphaZero = null
    orientacao = null
    if (on) {
      window.addEventListener("deviceorientation", onOri)
      camera.fov = 62
      camera.position.set(0, 0, 0)
      // pousado à frente, um pouco abaixo dos olhos, como em cima de um balcão
      produto.position.set(0, -0.45, -2.6)
    } else {
      window.removeEventListener("deviceorientation", onOri)
      camera.fov = 38
      camera.position.set(0, 0, 4.2)
      camera.quaternion.identity()
      produto.position.set(0, estreito ? 0.12 : 0, 0)
    }
    camera.updateProjectionMatrix()
  }

  let estreito = false
  const ajustar = () => {
    const W = el.clientWidth
    const H = el.clientHeight
    renderer.setSize(W, H, false)
    cv.style.width = `${W}px`
    cv.style.height = `${H}px`
    camera.aspect = W / Math.max(1, H)
    // em ecrã estreito afasta um pouco para caber tudo
    estreito = W < H
    camera.zoom = estreito ? Math.max(0.72, W / H / 0.75) : 1
    cartoes.forEach((c) => c.scale.set(estreito ? 0.6 : 0.78, estreito ? 0.141 : 0.183, 1))
    if (!emRA) produto.position.y = estreito ? 0.12 : 0
    camera.updateProjectionMatrix()
  }
  ajustar()
  window.addEventListener("resize", ajustar)

  const relogio = new THREE.Clock()
  let raf = 0
  const tick = () => {
    raf = requestAnimationFrame(tick)
    const tt = relogio.getElapsedTime()
    if (!reduzido && ponteiros.size === 0 && !emRA) alvoYaw += 0.0025
    yaw += (alvoYaw - yaw) * 0.08
    pitch += (alvoPitch - pitch) * 0.08
    escala += (alvoEscala - escala) * 0.1
    produto.rotation.set(pitch, yaw, 0)
    produto.scale.setScalar(escala)
    flutua.position.y = reduzido ? 0 : Math.sin(tt * 1.2) * 0.04
    flutua.rotation.z = reduzido ? 0 : Math.sin(tt * 0.7) * 0.02
    cartoes.forEach((s, i) => {
      const a = tt * (reduzido ? 0 : 0.45) + (i * Math.PI * 2) / cartoes.length
      s.position.set(Math.cos(a) * (estreito ? 0.55 : 0.95), 0.55 - i * 0.48 + Math.sin(tt * 1.4 + i) * 0.03, Math.sin(a) * 0.55)
      ;(s.material as import("three").SpriteMaterial).opacity = 0.55 + 0.45 * Math.max(0, Math.sin(a) * 0.5 + 0.5)
    })
    particulas.rotation.y = tt * 0.15
    if (emRA) orientarCamera()
    renderer.render(scene, camera)
  }
  tick()

  return {
    parar: () => {
      cancelAnimationFrame(raf)
      window.removeEventListener("resize", ajustar)
      window.removeEventListener("deviceorientation", onOri)
      cv.removeEventListener("pointerdown", down)
      cv.removeEventListener("pointermove", move)
      cv.removeEventListener("pointerup", up)
      cv.removeEventListener("pointercancel", up)
      cv.removeEventListener("wheel", roda)
      scene.traverse((o) => {
        const mesh = o as import("three").Mesh
        mesh.geometry?.dispose?.()
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
        mats.forEach((mt) => {
          ;(mt as import("three").MeshBasicMaterial).map?.dispose()
          mt.dispose()
        })
      })
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      cv.remove()
    },
    foto: () => {
      renderer.render(scene, camera)
      return cv
    },
    modoRA,
  }
}
