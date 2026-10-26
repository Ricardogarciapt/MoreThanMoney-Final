"use client"

import { useEffect, useRef } from "react"

/**
 * A cena 3D do cabeçalho do onboarding: os cinco passos como cinco peças de ouro presas a um
 * caminho que sobe em espiral. Cada passo feito acende-se; os que faltam ficam baços. Não é
 * decoração solta: é o mesmo progresso da barra, dito de outra maneira.
 *
 * Cuidados que não são de gosto:
 *  · O three.js só se carrega no browser e depois de a página estar pintada (import dinâmico), para
 *    não pesar no primeiro ecrã de quem chega pelo telemóvel.
 *  · Com `prefers-reduced-motion` desenha um fotograma parado e não anima.
 *  · Pára quando sai do ecrã ou quando o separador fica escondido, para não gastar bateria.
 *  · Se o WebGL falhar, não aparece nada e a página continua igual.
 */
export default function Caminho3D({ feitos, className = "" }: { feitos: number[]; className?: string }) {
  const caixa = useRef<HTMLDivElement>(null)
  const acender = useRef<(f: number[]) => void>(() => {})
  const feitosRef = useRef(feitos)
  feitosRef.current = feitos

  useEffect(() => {
    acender.current(feitos)
  }, [feitos])

  useEffect(() => {
    const el = caixa.current
    if (!el) return
    let parar = () => {}
    let vivo = true

    void (async () => {
      let THREE: typeof import("three")
      try {
        THREE = await import("three")
      } catch {
        return
      }
      if (!vivo || !el) return

      const quieto = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      let renderer: import("three").WebGLRenderer
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" })
      } catch {
        return
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      el.appendChild(renderer.domElement)
      renderer.domElement.style.width = "100%"
      renderer.domElement.style.height = "100%"

      const cena = new THREE.Scene()
      const camara = new THREE.PerspectiveCamera(38, 1, 0.1, 100)
      camara.position.set(0, 0.4, 9)

      cena.add(new THREE.AmbientLight(0xffffff, 0.35))
      const chave = new THREE.DirectionalLight(0xfff1cf, 2.2)
      chave.position.set(4, 6, 5)
      cena.add(chave)
      const contra = new THREE.PointLight(0xd2a63c, 30, 20)
      contra.position.set(-4, -2, -3)
      cena.add(contra)

      const grupo = new THREE.Group()
      cena.add(grupo)

      // O caminho: uma espiral que sobe, com os cinco passos espaçados por igual.
      const pontos: import("three").Vector3[] = []
      for (let i = 0; i <= 40; i++) {
        const t = i / 40
        const a = t * Math.PI * 2.2 - Math.PI * 0.6
        pontos.push(new THREE.Vector3(Math.cos(a) * 2.1, t * 4.4 - 2.2, Math.sin(a) * 2.1))
      }
      const curva = new THREE.CatmullRomCurve3(pontos)
      const tubo = new THREE.Mesh(
        new THREE.TubeGeometry(curva, 200, 0.045, 8, false),
        new THREE.MeshStandardMaterial({ color: 0xd2a63c, metalness: 0.9, roughness: 0.35, transparent: true, opacity: 0.55 }),
      )
      grupo.add(tubo)

      const ouro = new THREE.Color(0xd2a63c)
      const ouroClaro = new THREE.Color(0xe9c46a)
      const baco = new THREE.Color(0x5c4d2c)
      const pecas = [0.08, 0.29, 0.5, 0.71, 0.92].map((t, i) => {
        const geo = i === 2 ? new THREE.OctahedronGeometry(0.42, 0) : new THREE.IcosahedronGeometry(0.3, 0)
        const mat = new THREE.MeshStandardMaterial({
          color: baco.clone(),
          metalness: 1,
          roughness: 0.28,
          emissive: ouro.clone(),
          emissiveIntensity: 0,
          flatShading: true,
        })
        const m = new THREE.Mesh(geo, mat)
        m.position.copy(curva.getPointAt(t))
        const halo = new THREE.Mesh(
          new THREE.RingGeometry(0.48, 0.52, 48),
          new THREE.MeshBasicMaterial({ color: ouroClaro, transparent: true, opacity: 0, side: THREE.DoubleSide }),
        )
        m.add(halo)
        grupo.add(m)
        return { m, mat, halo, alvo: 0, luz: 0 }
      })

      // Pó de ouro à volta, para dar profundidade.
      const n = 260
      const pos = new Float32Array(n * 3)
      for (let i = 0; i < n; i++) {
        const r = 2.6 + Math.random() * 2.4
        const a = Math.random() * Math.PI * 2
        pos[i * 3] = Math.cos(a) * r
        pos[i * 3 + 1] = (Math.random() - 0.5) * 6
        pos[i * 3 + 2] = Math.sin(a) * r
      }
      const poGeo = new THREE.BufferGeometry()
      poGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3))
      const po = new THREE.Points(
        poGeo,
        new THREE.PointsMaterial({ color: 0xe9c46a, size: 0.035, transparent: true, opacity: 0.7, sizeAttenuation: true }),
      )
      cena.add(po)

      acender.current = (f) => {
        pecas.forEach((p, i) => (p.alvo = f.includes(i + 1) ? 1 : 0))
      }
      acender.current(feitosRef.current)

      const medir = () => {
        const w = el.clientWidth || 1
        const h = el.clientHeight || 1
        renderer.setSize(w, h, false)
        camara.aspect = w / h
        camara.updateProjectionMatrix()
      }
      medir()
      const ro = new ResizeObserver(medir)
      ro.observe(el)

      let rato = { x: 0, y: 0 }
      const mexer = (e: PointerEvent) => {
        rato = { x: e.clientX / window.innerWidth - 0.5, y: e.clientY / window.innerHeight - 0.5 }
      }
      window.addEventListener("pointermove", mexer, { passive: true })

      const relogio = new THREE.Clock()
      const desenhar = () => {
        const t = relogio.getElapsedTime()
        grupo.rotation.y = quieto ? 0.5 : t * 0.18
        grupo.rotation.x += (rato.y * 0.25 - grupo.rotation.x) * 0.05
        camara.position.x += (rato.x * 1.2 - camara.position.x) * 0.05
        camara.lookAt(0, 0, 0)
        po.rotation.y = quieto ? 0 : -t * 0.04
        pecas.forEach((p, i) => {
          p.luz += (p.alvo - p.luz) * (quieto ? 1 : 0.06)
          p.mat.color.copy(baco).lerp(ouro, p.luz)
          p.mat.emissiveIntensity = 0.05 + p.luz * 0.55
          p.m.rotation.x = quieto ? 0.4 : t * 0.6 + i
          p.m.rotation.y = quieto ? 0.4 : t * 0.4 + i
          const s = 1 + (quieto ? 0 : Math.sin(t * 2 + i) * 0.04)
          p.m.scale.setScalar(s)
          p.halo.lookAt(camara.position)
          ;(p.halo.material as import("three").MeshBasicMaterial).opacity = p.luz * (0.5 + Math.sin(t * 3 + i) * 0.2)
        })
        renderer.render(cena, camara)
      }

      let rodar = false
      let quadro = 0
      const ciclo = () => {
        if (!rodar) return
        desenhar()
        quadro = requestAnimationFrame(ciclo)
      }
      const ligar = (sim: boolean) => {
        if (quieto) {
          desenhar()
          return
        }
        if (sim && !rodar) {
          rodar = true
          ciclo()
        } else if (!sim) {
          rodar = false
          cancelAnimationFrame(quadro)
        }
      }
      let visivel = true
      const io = new IntersectionObserver(([e]) => {
        visivel = e.isIntersecting
        ligar(visivel && !document.hidden)
      })
      io.observe(el)
      const separador = () => ligar(visivel && !document.hidden)
      document.addEventListener("visibilitychange", separador)
      ligar(true)
      el.style.opacity = "1"

      parar = () => {
        rodar = false
        cancelAnimationFrame(quadro)
        io.disconnect()
        ro.disconnect()
        window.removeEventListener("pointermove", mexer)
        document.removeEventListener("visibilitychange", separador)
        cena.traverse((o) => {
          const m = o as import("three").Mesh
          m.geometry?.dispose()
          const mat = m.material as import("three").Material | undefined
          mat?.dispose()
        })
        renderer.dispose()
        renderer.domElement.remove()
      }
    })()

    return () => {
      vivo = false
      parar()
    }
  }, [])

  return (
    <div
      ref={caixa}
      aria-hidden="true"
      className={`pointer-events-none opacity-0 transition-opacity duration-1000 ${className}`}
    />
  )
}
