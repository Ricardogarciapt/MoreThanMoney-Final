"use client"

import { useEffect, useRef } from "react"

/**
 * Cena CGI do showroom (Three.js, no browser, sem vídeo nem créditos de IA).
 *
 * Milhares de partículas douradas que se juntam em formas, em ciclo: uma esfera (a ideia), um
 * telemóvel (a app do negócio) e uma rede de nós (os agentes ligados). Brilho aditivo, rotação
 * lenta e paralaxe com o rato. Fica parada fora do ecrã e com o separador escondido; com movimento
 * reduzido mostra uma forma estática. Carrega o three só quando entra no ecrã.
 */
export function CenaCGI({ className = "", formas = ["esfera", "telemovel", "rede"] as Forma[], intensidade = 1 }: { className?: string; formas?: Forma[]; intensidade?: number }) {
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = raiz.current
    if (!el) return
    let parar = () => {}
    let vivo = true
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return
        obs.disconnect()
        import("three").then((THREE) => {
          if (vivo) parar = montar(THREE, el, formas, intensidade)
        })
      },
      { rootMargin: "200px" },
    )
    obs.observe(el)
    return () => {
      vivo = false
      obs.disconnect()
      parar()
    }
    // formas é constante por página
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={raiz} className={`pointer-events-none ${className}`} aria-hidden="true" />
}

export type Forma = "esfera" | "telemovel" | "rede" | "anel"

const N = 2600

function pontosDe(forma: Forma, n: number): Float32Array {
  const p = new Float32Array(n * 3)
  const r = Math.random
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, z = 0
    if (forma === "esfera") {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - u * u)
      const rad = 1.55 + (r() - 0.5) * 0.08
      x = s * Math.cos(a) * rad; y = u * rad; z = s * Math.sin(a) * rad
    } else if (forma === "telemovel") {
      // contorno arredondado + linhas do ecrã + botão
      const w = 1.05, h = 2.05, k = r()
      if (k < 0.55) {
        const per = 2 * (w + h), t = r() * per * 2
        const d = t % per
        if (d < w * 2) { x = -w + d; y = h } else if (d < w * 2 + h * 2) { x = w; y = h - (d - w * 2) } else if (d < w * 4 + h * 2) { x = w - (d - w * 2 - h * 2); y = -h } else { x = -w; y = -h + (d - w * 4 - h * 2) }
        x *= 0.98; y *= 0.98
      } else if (k < 0.9) {
        const linha = Math.floor(r() * 7)
        y = 1.5 - linha * 0.42; x = -0.8 + r() * (linha === 0 ? 1.6 : 0.6 + ((linha * 37) % 10) / 10)
        if (linha === 6) { x = -0.8 + r() * 1.6; y = -1.55 }
      } else {
        const a = r() * Math.PI * 2
        x = Math.cos(a) * 0.12; y = -1.85 + Math.sin(a) * 0.12
      }
      z = (r() - 0.5) * 0.12
    } else if (forma === "rede") {
      // 9 nós ligados: pontos nos nós e ao longo das arestas
      const nos = NOS
      if (r() < 0.45) {
        const a = nos[Math.floor(r() * nos.length)]
        const u = r() * 2 - 1, t = r() * Math.PI * 2, s = Math.sqrt(1 - u * u), rr = 0.16 * Math.cbrt(r())
        x = a[0] + s * Math.cos(t) * rr; y = a[1] + u * rr; z = a[2] + s * Math.sin(t) * rr
      } else {
        const [ia, ib] = ARESTAS[Math.floor(r() * ARESTAS.length)]
        const a = nos[ia], b = nos[ib], t = r()
        x = a[0] + (b[0] - a[0]) * t; y = a[1] + (b[1] - a[1]) * t; z = a[2] + (b[2] - a[2]) * t
      }
    } else {
      const a = r() * Math.PI * 2, rr = 1.7 + (r() - 0.5) * 0.35
      x = Math.cos(a) * rr; z = Math.sin(a) * rr; y = (r() - 0.5) * 0.18
    }
    p[i * 3] = x; p[i * 3 + 1] = y; p[i * 3 + 2] = z
  }
  return p
}

const NOS: [number, number, number][] = [
  [0, 0, 0], [1.4, 0.8, 0.3], [-1.3, 0.9, -0.2], [1.2, -1.0, -0.4], [-1.2, -1.1, 0.4],
  [0.2, 1.7, -0.5], [-0.1, -1.8, -0.3], [1.9, -0.1, 0.6], [-1.9, 0, -0.6],
]
const ARESTAS: [number, number][] = [[0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [2, 5], [3, 6], [4, 6], [1, 7], [3, 7], [2, 8], [4, 8], [5, 0], [6, 0]]

function texturaBrilho(THREE: typeof import("three")) {
  const c = document.createElement("canvas")
  c.width = c.height = 64
  const g = c.getContext("2d")!
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, "rgba(255,240,200,1)")
  grad.addColorStop(0.25, "rgba(233,196,106,0.85)")
  grad.addColorStop(0.6, "rgba(210,166,60,0.18)")
  grad.addColorStop(1, "rgba(210,166,60,0)")
  g.fillStyle = grad
  g.fillRect(0, 0, 64, 64)
  return new THREE.CanvasTexture(c)
}

function montar(THREE: typeof import("three"), el: HTMLDivElement, formas: Forma[], intensidade: number) {
  const reduzido = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: false, powerPreference: "low-power" })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setClearColor(0x000000, 0)
  el.appendChild(renderer.domElement)
  renderer.domElement.style.width = "100%"
  renderer.domElement.style.height = "100%"

  const cena = new THREE.Scene()
  const camara = new THREE.PerspectiveCamera(42, 1, 0.1, 50)
  camara.position.set(0, 0, 7)

  const alvos = formas.map((f) => pontosDe(f, N))
  const pos = new Float32Array(N * 3)
  // começam espalhadas: a primeira forma «condensa-se» à frente de quem chega
  for (let i = 0; i < N * 3; i++) pos[i] = (Math.random() - 0.5) * 12
  const geo = new THREE.BufferGeometry()
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
  const tamanhos = new Float32Array(N)
  for (let i = 0; i < N; i++) tamanhos[i] = 0.5 + Math.random() * 1.2
  geo.setAttribute("tam", new THREE.BufferAttribute(tamanhos, 1))

  const mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { tex: { value: texturaBrilho(THREE) }, escala: { value: 1 }, tempo: { value: 0 }, forca: { value: intensidade } },
    vertexShader: `
      attribute float tam; uniform float escala; uniform float tempo; varying float vBrilho;
      void main(){
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        float pisca = 0.75 + 0.25*sin(tempo*2.0 + position.x*5.0 + position.y*3.0);
        vBrilho = pisca;
        gl_PointSize = tam * escala * 26.0 / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D tex; uniform float forca; varying float vBrilho;
      void main(){ vec4 c = texture2D(tex, gl_PointCoord); gl_FragColor = vec4(c.rgb, c.a * vBrilho * 0.9 * forca); }`,
  })
  const nuvem = new THREE.Points(geo, mat)
  cena.add(nuvem)

  // anel de órbita fino (o «brilho de estúdio» por trás)
  const anelGeo = new THREE.RingGeometry(2.55, 2.57, 128)
  const anelMat = new THREE.MeshBasicMaterial({ color: 0xd2a63c, transparent: true, opacity: 0.18 * intensidade, side: THREE.DoubleSide })
  const anel = new THREE.Mesh(anelGeo, anelMat)
  anel.rotation.x = Math.PI / 2.4
  cena.add(anel)

  const redimensionar = () => {
    const w = el.clientWidth || 1, h = el.clientHeight || 1
    renderer.setSize(w, h, false)
    camara.aspect = w / h
    camara.updateProjectionMatrix()
    mat.uniforms.escala.value = renderer.getPixelRatio() * Math.min(1.4, h / 420)
  }
  redimensionar()
  const ro = new ResizeObserver(redimensionar)
  ro.observe(el)

  let rato = { x: 0, y: 0 }
  const mover = (e: PointerEvent) => {
    rato = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 }
  }
  window.addEventListener("pointermove", mover, { passive: true })

  if (reduzido) {
    pos.set(alvos[1 % alvos.length])
    geo.attributes.position.needsUpdate = true
    renderer.render(cena, camara)
    return () => {
      ro.disconnect()
      window.removeEventListener("pointermove", mover)
      renderer.dispose(); geo.dispose(); mat.dispose(); anelGeo.dispose(); anelMat.dispose()
      renderer.domElement.remove()
    }
  }

  const CICLO = 5200
  let raf = 0
  const t0 = performance.now()
  let visivel = true
  const io = new IntersectionObserver(([e]) => { visivel = e.isIntersecting })
  io.observe(el)

  const passo = (agora: number) => {
    raf = requestAnimationFrame(passo)
    if (!visivel || document.visibilityState !== "visible") return
    const t = Math.max(0, agora - t0) // o 1.º carimbo do rAF pode ser anterior a t0
    const k = Math.floor(t / CICLO) % alvos.length
    const alvo = alvos[k]
    const fase = (t % CICLO) / CICLO
    // ímã forte no início do ciclo, depois respira
    const atr = fase < 0.55 ? 0.045 : 0.02
    const a = pos
    for (let i = 0; i < N * 3; i++) a[i] += (alvo[i] - a[i]) * atr
    // pouco antes da troca, um «sopro» que solta as partículas
    if (fase > 0.9) for (let i = 0; i < N * 3; i += 3) { a[i] *= 1.004; a[i + 1] *= 1.004 }
    geo.attributes.position.needsUpdate = true
    mat.uniforms.tempo.value = t / 1000
    nuvem.rotation.y = t / 9000 + rato.x * 0.35
    nuvem.rotation.x = Math.sin(t / 7000) * 0.15 + rato.y * 0.2
    anel.rotation.z = t / 12000
    camara.position.x += (rato.x * 0.6 - camara.position.x) * 0.04
    camara.position.y += (-rato.y * 0.4 - camara.position.y) * 0.04
    camara.lookAt(0, 0, 0)
    renderer.render(cena, camara)
  }
  raf = requestAnimationFrame(passo)

  return () => {
    cancelAnimationFrame(raf)
    io.disconnect()
    ro.disconnect()
    window.removeEventListener("pointermove", mover)
    renderer.dispose(); geo.dispose(); mat.dispose(); anelGeo.dispose(); anelMat.dispose()
    ;(mat.uniforms.tex.value as { dispose: () => void }).dispose()
    renderer.domElement.remove()
  }
}
