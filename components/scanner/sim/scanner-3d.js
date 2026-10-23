// Cena 3D (Three.js) que desenha a simulação de um scanner vela a vela.
// Tudo depende só de (progresso, tempo): a landing anima-a em ciclo e o vídeo procura qualquer
// instante da timeline e obtém sempre o mesmo fotograma.
import * as THREE from 'three'

const DX = 0.16
const H = 9
const START = 0.2 // fração de velas já visíveis no início, para a cena nunca começar vazia

function pillTexture(text, color, { fg = '#0b0b0d', font = 600, size = 44, pad = 22, outline = false } = {}) {
  const c = document.createElement('canvas')
  const ctx = c.getContext('2d')
  ctx.font = `${font} ${size}px Inter, system-ui, sans-serif`
  const w = Math.ceil(ctx.measureText(text).width) + pad * 2
  const h = size + pad * 1.3
  c.width = w
  c.height = h
  ctx.font = `${font} ${size}px Inter, system-ui, sans-serif`
  ctx.beginPath()
  ctx.roundRect(2, 2, w - 4, h - 4, (h - 4) / 2)
  if (outline) {
    ctx.fillStyle = 'rgba(8,8,10,0.82)'
    ctx.fill()
    ctx.lineWidth = 3
    ctx.strokeStyle = color
    ctx.stroke()
    ctx.fillStyle = color
  } else {
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = fg
  }
  ctx.textBaseline = 'middle'
  ctx.fillText(text, pad, h / 2 + 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { tex, aspect: w / h }
}

function makeSprite(text, color, opts, height = 0.42) {
  const { tex, aspect } = pillTexture(text, color, opts)
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
  const s = new THREE.Sprite(mat)
  s.userData.base = new THREE.Vector3(height * aspect, height, 1)
  s.scale.copy(s.userData.base)
  return s
}

const easeOutBack = (x) => {
  const c1 = 1.70158, c3 = c1 + 1
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2)
}
const clamp01 = (x) => Math.max(0, Math.min(1, x))

/**
 * @param {{canvas: HTMLCanvasElement, sim: any, capture?: boolean, background?: string|null}} opts
 */
export function createScannerScene({ canvas, sim, capture = false, background = null }) {
  const N = sim.candles.length
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: !background, preserveDrawingBuffer: capture })
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  if (background) renderer.setClearColor(background, 1)

  const scene = new THREE.Scene()
  scene.fog = new THREE.Fog(background || '#08080a', 26, 70)
  const camera = new THREE.PerspectiveCamera(34, 16 / 9, 0.1, 200)

  scene.add(new THREE.AmbientLight('#ffffff', 0.75))
  const key = new THREE.DirectionalLight('#fff4dc', 1.5)
  key.position.set(-8, 14, 12)
  scene.add(key)
  const rim = new THREE.PointLight('#d2a63c', 40, 40)
  rim.position.set(10, 4, -6)
  scene.add(rim)

  // Escala de preço a partir das velas (os níveis podem sair um pouco por cima/baixo).
  let pmin = Infinity, pmax = -Infinity
  for (const b of sim.candles) { pmin = Math.min(pmin, b.l); pmax = Math.max(pmax, b.h) }
  const pad = (pmax - pmin) * 0.12
  pmin -= pad
  pmax += pad
  const X = (i) => (i - (N - 1) / 2) * DX
  const Y = (p) => ((p - pmin) / (pmax - pmin)) * H - H / 2

  const disposables = []
  const track = (o) => { disposables.push(o); return o }

  // Chão e grelha de preço por trás, para dar profundidade.
  const grid = new THREE.GridHelper(60, 60, '#5a4720', '#1b1a17')
  grid.position.y = -H / 2 - 0.9
  grid.material.transparent = true
  grid.material.opacity = 0.55
  scene.add(grid)
  const back = new THREE.Group()
  const backMat = track(new THREE.MeshBasicMaterial({ color: '#d2a63c', transparent: true, opacity: 0.07 }))
  const backGeo = track(new THREE.PlaneGeometry(N * DX + 2, 0.02))
  for (let k = 0; k <= 6; k++) {
    const m = new THREE.Mesh(backGeo, backMat)
    m.position.set(0, -H / 2 + (H / 6) * k, -0.6)
    back.add(m)
  }
  scene.add(back)

  // Velas: corpos e pavios em InstancedMesh, cor por instância.
  const boxGeo = track(new THREE.BoxGeometry(1, 1, 1))
  const candleMat = track(new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.15 }))
  const bodies = new THREE.InstancedMesh(boxGeo, candleMat, N)
  const wicks = new THREE.InstancedMesh(boxGeo, candleMat, N)
  const up = new THREE.Color('#22c58b'), dn = new THREE.Color('#ef4b5a')
  const m4 = new THREE.Matrix4()
  const candleData = sim.candles.map((b, i) => {
    const col = b.c >= b.o ? up : dn
    bodies.setColorAt(i, col)
    wicks.setColorAt(i, col)
    return { x: X(i), yo: Y(b.o), yc: Y(b.c), yh: Y(b.h), yl: Y(b.l) }
  })
  scene.add(bodies, wicks)
  function setCandle(i, f) {
    const d = candleData[i]
    const mid = (d.yo + d.yc) / 2
    const bh = Math.max(0.03, Math.abs(d.yc - d.yo)) * f
    m4.makeScale(DX * 0.68, bh, 0.16)
    m4.setPosition(d.x, mid, 0)
    bodies.setMatrixAt(i, m4)
    m4.makeScale(DX * 0.12, Math.max(0.02, (d.yh - d.yl) * f), 0.05)
    m4.setPosition(d.x, (d.yh + d.yl) / 2, 0)
    wicks.setMatrixAt(i, m4)
  }

  // Linhas como fitas (o WebGL não desenha linhas grossas); cada vela é um bloco de vértices.
  function ribbon(pts, width, step) {
    const per = step ? 12 : 6
    const pos = new Float32Array(N * per * 3)
    let o = 0
    const quad = (x1, y1, x2, y2) => {
      const dx = x2 - x1, dy = y2 - y1
      const len = Math.hypot(dx, dy) || 1
      const nx = (-dy / len) * width / 2, ny = (dx / len) * width / 2
      const v = [x1 + nx, y1 + ny, x1 - nx, y1 - ny, x2 + nx, y2 + ny, x2 + nx, y2 + ny, x1 - nx, y1 - ny, x2 - nx, y2 - ny]
      for (let k = 0; k < 6; k++) { pos[o++] = v[k * 2]; pos[o++] = v[k * 2 + 1]; pos[o++] = 0 }
    }
    for (let i = 0; i < N; i++) {
      const a = pts[i], b = pts[i + 1]
      if (a == null || b == null || i === N - 1) { o += per * 3; continue }
      if (step) {
        quad(X(i), Y(a), X(i + 1) + width / 2, Y(a))
        quad(X(i + 1), Y(a), X(i + 1), Y(b))
      } else quad(X(i), Y(a), X(i + 1), Y(b))
    }
    const g = track(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return { g, per }
  }
  const lines = sim.lines.map((l) => {
    const { g, per } = ribbon(l.pts, l.width, l.step)
    const mesh = new THREE.Mesh(g, track(new THREE.MeshBasicMaterial({ color: l.color, side: THREE.DoubleSide })))
    mesh.position.z = l.z
    scene.add(mesh)
    return { mesh, per }
  })

  // Áreas entre duas séries (ex.: banda Sensei).
  const areas = (sim.areas || []).map((a) => {
    const pos = new Float32Array(N * 18)
    let o = 0
    for (let i = 0; i < N - 1; i++) {
      const v = [X(i), Y(a.upper[i]), X(i), Y(a.lower[i]), X(i + 1), Y(a.upper[i + 1]), X(i + 1), Y(a.upper[i + 1]), X(i), Y(a.lower[i]), X(i + 1), Y(a.lower[i + 1])]
      for (let k = 0; k < 6; k++) { pos[o++] = v[k * 2]; pos[o++] = v[k * 2 + 1]; pos[o++] = 0 }
    }
    const g = track(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mesh = new THREE.Mesh(g, track(new THREE.MeshBasicMaterial({ color: a.color, transparent: true, opacity: a.opacity, side: THREE.DoubleSide, depthWrite: false })))
    mesh.position.z = a.z ?? 0
    scene.add(mesh)
    return mesh
  })

  // Zonas (caixas de sessão, níveis do Gold Killer, suporte/resistência): crescem para a direita.
  const plane = track(new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0))
  const zones = (sim.zones || []).map((z, k) => {
    const g = new THREE.Group()
    const mat = track(new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: z.opacity, side: THREE.DoubleSide, depthWrite: false }))
    const fill = new THREE.Mesh(plane, mat)
    g.add(fill)
    let edge = null
    if (z.edge != null) {
      edge = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: Math.min(1, z.opacity * 3.2) })))
      g.add(edge)
    }
    let label = null
    if (z.label && z.label.length > 1) {
      label = makeSprite(z.label, z.color, { outline: true, size: 34 }, 0.34)
      disposables.push(label.material, label.material.map)
      g.add(label)
    }
    g.position.z = -0.12 - (k % 5) * 0.015
    scene.add(g)
    return { z, g, fill, edge, label, mat }
  })

  // Segmentos horizontais tracejados (CHoCH).
  const segs = (sim.segments || []).map((s) => {
    const g = new THREE.Group()
    const mat = track(new THREE.MeshBasicMaterial({ color: s.color }))
    const len = X(s.i1) - X(s.i0)
    const n = Math.max(1, Math.floor(len / 0.22))
    for (let k = 0; k < n; k++) {
      const d = new THREE.Mesh(boxGeo, mat)
      d.scale.set(0.12, 0.035, 0.035)
      d.position.set(X(s.i0) + (k + 0.5) * (len / n), Y(s.price), 0.3)
      g.add(d)
    }
    const label = makeSprite(s.label, s.color, { outline: true, size: 32 }, 0.32)
    disposables.push(label.material, label.material.map)
    label.position.set((X(s.i0) + X(s.i1)) / 2, Y(s.price) + 0.32, 0.35)
    g.add(label)
    scene.add(g)
    return { s, g }
  })

  // Marcadores de sinal.
  const markers = (sim.markers || []).map((m) => {
    const sp = makeSprite(m.text, m.color, { fg: '#ffffff', size: m.small ? 38 : 44 }, m.small ? 0.42 : 0.56)
    disposables.push(sp.material, sp.material.map)
    const off = m.up ? -0.55 : 0.55
    sp.position.set(X(m.i), Y(m.price) + off, 0.45)
    scene.add(sp)
    return { m, sp }
  })

  // Grupos de níveis (Entrada/SL/TP): só o do último sinal fica visível, como no TradingView.
  const groups = (sim.groups || []).map((gr, gi) => {
    const g = new THREE.Group()
    const nextI = gi + 1 < sim.groups.length ? sim.groups[gi + 1].i0 : N - 1
    const entry = gr.items[0].price
    const tps = gr.items.filter((it) => it.label.startsWith('TP') || it.label.startsWith('Exit'))
    const sl = gr.items.find((it) => it.label.startsWith('SL') || it.label.startsWith('Stop'))
    const far = tps.length ? tps.reduce((a, b) => (Math.abs(b.price - entry) > Math.abs(a.price - entry) ? b : a)).price : entry
    const fills = []
    const addFill = (to, color) => {
      const mesh = new THREE.Mesh(plane, track(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })))
      mesh.userData = { bot: Math.min(entry, to), top: Math.max(entry, to) }
      mesh.position.z = 0.08
      g.add(mesh)
      fills.push(mesh)
    }
    addFill(far, '#22c58b')
    if (sl) addFill(sl.price, '#ef4b5a')
    const items = gr.items.map((it) => {
      const bar = new THREE.Mesh(boxGeo, track(new THREE.MeshBasicMaterial({ color: it.color })))
      const label = makeSprite(it.label, it.color, { fg: '#0b0b0d', size: 40 }, 0.44)
      disposables.push(label.material, label.material.map)
      g.add(bar, label)
      return { it, bar, label }
    })
    scene.add(g)
    return { gr, g, items, fills, end: nextI }
  })

  let width = 0, height = 0
  function resize(w, h) {
    width = w
    height = h
    renderer.setSize(w, h, false)
    camera.aspect = w / h
    camera.updateProjectionMatrix()
  }

  const curAt = (progress) => START * (N - 1) + clamp01(progress) * (N - 1) * (1 - START)

  /** Desenha o fotograma para `progress` (0–1) e `time` em segundos (só move a câmara). */
  function render(progress, time = 0) {
    const cur = curAt(progress)
    const ci = Math.floor(cur)
    const frac = cur - ci
    bodies.count = wicks.count = Math.min(N, ci + 1)
    for (let i = 0; i <= Math.min(N - 1, ci); i++) setCandle(i, i === ci ? 0.25 + 0.75 * frac : 1)
    bodies.instanceMatrix.needsUpdate = wicks.instanceMatrix.needsUpdate = true
    if (bodies.instanceColor) bodies.instanceColor.needsUpdate = wicks.instanceColor.needsUpdate = true

    for (const l of lines) l.mesh.geometry.setDrawRange(0, Math.max(0, ci) * l.per)
    for (const a of areas) a.geometry.setDrawRange(0, Math.max(0, ci) * 6)

    for (const z of zones) {
      const reveal = z.z.reveal ?? z.z.i0
      const on = cur >= reveal
      z.g.visible = on
      if (!on) continue
      const right = Math.min(z.z.i1, cur)
      const w = Math.max(0.02, X(right) - X(z.z.i0) + DX / 2)
      const fade = clamp01((cur - reveal) / 3)
      z.fill.position.set(X(z.z.i0) - DX / 2, Y(z.z.bot), 0)
      z.fill.scale.set(w, Math.max(0.02, Y(z.z.top) - Y(z.z.bot)), 1)
      z.mat.opacity = z.z.opacity * fade
      if (z.edge) {
        z.edge.scale.set(w, 0.035, 0.03)
        z.edge.position.set(X(z.z.i0) - DX / 2 + w / 2, Y(z.z.edge), 0.02)
      }
      if (z.label) {
        z.label.position.set(X(z.z.i0) + z.label.scale.x / 2 - DX / 2, Y(z.z.top) + 0.3, 0.1)
        z.label.material.opacity = fade
      }
    }

    for (const s of segs) {
      const on = cur >= s.s.i1
      s.g.visible = on
      if (on) s.g.scale.setScalar(1)
    }

    for (const mk of markers) {
      const age = cur - mk.m.i
      mk.sp.visible = age >= 0
      if (age >= 0) {
        const k = easeOutBack(clamp01(age / 1.6))
        mk.sp.scale.copy(mk.sp.userData.base).multiplyScalar(Math.max(0.01, k))
      }
    }

    let active = -1
    groups.forEach((g, k) => { if (cur >= g.gr.i0) active = k })
    groups.forEach((g, k) => {
      g.g.visible = k === active
      if (k !== active) return
      const left = X(g.gr.i0)
      const right = X(Math.min(N - 1, cur)) + 1.4
      const grow = clamp01((cur - g.gr.i0) / 2.5)
      const w = Math.max(0.05, (right - left) * grow)
      for (const f of g.fills) {
        f.position.set(left, Y(f.userData.bot), 0.06)
        f.scale.set(w, Math.max(0.01, Y(f.userData.top) - Y(f.userData.bot)), 1)
      }
      for (const it of g.items) {
        const from = it.it.from ?? g.gr.i0
        const vis = cur >= from && (it.it.to == null || cur < it.it.to)
        it.bar.visible = it.label.visible = vis
        if (!vis) continue
        const l2 = X(from)
        const ww = Math.max(0.05, (right - l2) * clamp01((cur - from) / 2.5))
        it.bar.scale.set(ww, 0.045, 0.04)
        it.bar.position.set(l2 + ww / 2, Y(it.it.price), 0.32)
        it.label.position.set(l2 + ww + it.label.scale.x / 2 + 0.08, Y(it.it.price), 0.36)
      }
    })

    // Câmara: órbita lenta, perto do preço e a acompanhar a vela atual.
    const narrow = width && width / height < 1.1
    const t = time
    const theta = -0.42 + 0.16 * Math.sin(t * 0.18) + progress * 0.22
    const phi = 0.16 + 0.04 * Math.sin(t * 0.13)
    const dist = (narrow ? 30 : 19.5) - progress * 1.5
    const last = sim.candles[Math.min(N - 1, ci)]
    const tx = X(cur) * 0.55 - 1.2
    const ty = Y(last.c) * 0.45
    const target = new THREE.Vector3(tx, ty, 0)
    camera.position.set(target.x + Math.sin(theta) * dist, target.y + Math.sin(phi) * dist + 0.4, Math.cos(theta) * dist)
    camera.lookAt(target)
    renderer.render(scene, camera)
    return cur
  }

  /** Legenda e painel no instante atual (para o HTML por cima da cena). */
  function frameInfo(progress) {
    const cur = curAt(progress)
    const ci = Math.min(N - 1, Math.floor(cur))
    let caption = null
    for (const c of sim.captions || []) if (c.i <= cur) caption = c.text
    const panel = sim.panel ? { title: sim.panel.title, rows: sim.panel.rows.map((r) => ({ label: r.label, value: r.states[ci] })) } : null
    return { cur, caption, panel }
  }

  function dispose() {
    for (const o of disposables) o.dispose?.()
    bodies.dispose()
    wicks.dispose()
    renderer.dispose()
  }

  return { render, resize, frameInfo, dispose }
}
