/**
 * Comportamento de scroll da landing (/new-landing): revelações, corrimão de capítulos,
 * parallax, poeira dourada, contadores, a sequência do telemóvel e o acordeão da FAQ.
 *
 * Vive fora do componente para o React ficar só com a estrutura. Recebe o nó raiz `.l2` e
 * devolve a função de limpeza — tudo o que regista, desliga.
 */
export function mountLandingEffects(root: HTMLElement): () => void {
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches
  const cleanups: Array<() => void> = []
  const $ = <T extends Element = Element>(s: string) => root.querySelector<T>(s)
  const $$ = <T extends Element = Element>(s: string) => Array.from(root.querySelectorAll<T>(s))

  /* revelação por scroll */
  const io = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("on")
          io.unobserve(e.target)
        }
      }),
    { threshold: 0.14, rootMargin: "0px 0px -6% 0px" },
  )
  $$(".r, .reveal").forEach((el) => io.observe(el))
  cleanups.push(() => io.disconnect())

  /* abertura */
  const open = $<HTMLElement>(".open2")
  requestAnimationFrame(() => open?.classList.add("go"))
  if (scrollY > innerHeight * 0.4) {
    // entrou por âncora: mostra a abertura já feita em vez de a animar fora do ecrã
    $$(".open2 .r").forEach((el) => {
      const e = el as HTMLElement
      e.style.transition = "none"
      e.classList.add("on")
      requestAnimationFrame(() => (e.style.transition = ""))
    })
  }

  /* barra de progresso + saída da abertura + parallax das cenas */
  const prog = $<HTMLElement>("#l2-prog")
  const heroWrap = $<HTMLElement>(".open2 .wrap")
  const px = $$<HTMLElement>(".px")
  let ticking = false
  const onScroll = () => {
    if (ticking) return
    ticking = true
    requestAnimationFrame(() => {
      const h = document.documentElement.scrollHeight - innerHeight
      if (prog) prog.style.width = (h > 0 ? (scrollY / h) * 100 : 0) + "%"
      if (!RM && heroWrap) {
        const p = Math.min(1, scrollY / innerHeight)
        heroWrap.style.transform = `translate3d(0,${(p * 70).toFixed(1)}px,0)`
        heroWrap.style.opacity = String(1 - p * 1.25)
      }
      if (!RM)
        px.forEach((el) => {
          const r = el.parentElement!.getBoundingClientRect()
          if (r.bottom < 0 || r.top > innerHeight) return
          el.style.transform = `translate3d(0,${((r.top + r.height / 2 - innerHeight / 2) * -0.09).toFixed(1)}px,0)`
        })
      ticking = false
    })
  }
  addEventListener("scroll", onScroll, { passive: true })
  onScroll()
  cleanups.push(() => removeEventListener("scroll", onScroll))

  /* corrimão de capítulos */
  const rail = $<HTMLElement>("#l2-rail")
  if (rail) {
    const links = Array.from(rail.children) as HTMLElement[]
    const rio = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return
          links.forEach((a) => a.classList.toggle("act", a.dataset.s === e.target.id))
        }),
      { rootMargin: "-45% 0px -45% 0px" },
    )
    links.forEach((a) => {
      const el = a.dataset.s ? root.querySelector(`#${a.dataset.s}`) : null
      if (el) rio.observe(el)
    })
    cleanups.push(() => rio.disconnect())
  }

  /* títulos palavra a palavra */
  if (!RM)
    $$<HTMLElement>(".head h2, .scene h2").forEach((el) => {
      if (el.querySelector(".ln") || el.dataset.split) return
      el.dataset.split = "1"
      const frag = document.createDocumentFragment()
      Array.from(el.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          ;(n.textContent || "").split(/(\s+)/).forEach((tk) => {
            if (!tk) return
            if (/^\s+$/.test(tk)) return void frag.appendChild(document.createTextNode(tk))
            const w = document.createElement("span")
            w.className = "w"
            const b = document.createElement("b")
            b.textContent = tk
            w.appendChild(b)
            frag.appendChild(w)
          })
        } else if (n.nodeName === "BR") frag.appendChild(n.cloneNode())
        else {
          const w = document.createElement("span")
          w.className = "w"
          const b = document.createElement("b")
          b.appendChild(n.cloneNode(true))
          w.appendChild(b)
          frag.appendChild(w)
        }
      })
      el.textContent = ""
      el.appendChild(frag)
      el.querySelectorAll<HTMLElement>(".w>b").forEach((b, i) => (b.style.transitionDelay = (i * 0.045).toFixed(3) + "s"))
    })

  /* brilho que segue o rato nos cartões */
  const glow = (c: HTMLElement) => (e: PointerEvent) => {
    const r = c.getBoundingClientRect()
    c.style.setProperty("--mx", e.clientX - r.left + "px")
    c.style.setProperty("--my", e.clientY - r.top + "px")
  }
  $$<HTMLElement>(".card").forEach((c) => {
    const fn = glow(c)
    c.addEventListener("pointermove", fn)
    cleanups.push(() => c.removeEventListener("pointermove", fn))
  })

  /* botões com atração magnética */
  if (!RM && !matchMedia("(pointer:coarse)").matches)
    $$<HTMLElement>(".open2 .btn, #l2-packs .btn").forEach((b) => {
      const mv = (e: PointerEvent) => {
        const r = b.getBoundingClientRect()
        b.style.transform = `translate(${((e.clientX - r.left - r.width / 2) * 0.18).toFixed(1)}px,${(
          (e.clientY - r.top - r.height / 2) * 0.28 - 2
        ).toFixed(1)}px)`
      }
      const lv = () => (b.style.transform = "")
      b.addEventListener("pointermove", mv)
      b.addEventListener("pointerleave", lv)
      cleanups.push(() => {
        b.removeEventListener("pointermove", mv)
        b.removeEventListener("pointerleave", lv)
      })
    })

  /* poeira dourada */
  const cv = $<HTMLCanvasElement>("#l2-amb")
  if (cv && !RM) {
    const cx = cv.getContext("2d")!
    let w = 0, h = 0, dots: Array<{ x: number; y: number; r: number; vx: number; vy: number; a: number }> = []
    const build = () => {
      w = cv.width = innerWidth
      h = cv.height = innerHeight
      dots = Array.from({ length: Math.round(Math.min(90, w / 16)) }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: Math.random() * 1.5 + 0.35,
        vx: (Math.random() - 0.5) * 0.13, vy: -Math.random() * 0.19 - 0.03,
        a: Math.random() * 0.45 + 0.08,
      }))
    }
    build()
    addEventListener("resize", build)
    let raf = 0
    const loop = () => {
      cx.clearRect(0, 0, w, h)
      for (const d of dots) {
        d.x += d.vx; d.y += d.vy
        if (d.y < -6) { d.y = h + 6; d.x = Math.random() * w }
        if (d.x < -6) d.x = w + 6
        if (d.x > w + 6) d.x = -6
        cx.beginPath(); cx.arc(d.x, d.y, d.r, 0, 6.283)
        cx.fillStyle = `rgba(210,166,60,${d.a})`; cx.fill()
      }
      raf = requestAnimationFrame(loop)
    }
    loop()
    cleanups.push(() => { cancelAnimationFrame(raf); removeEventListener("resize", build) })
  }

  /* contadores */
  const fmt = (n: number) => n.toLocaleString("pt-PT")
  const cio = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        const to = Number(el.dataset.to || 0)
        const suf = el.dataset.suf || ""
        const pre = el.dataset.pre || ""
        cio.unobserve(el)
        if (RM) { el.textContent = pre + fmt(to) + suf; return }
        const t0 = performance.now()
        const tick = (t: number) => {
          const p = Math.min(1, (t - t0) / 1600)
          el.textContent = pre + fmt(Math.round(to * (1 - Math.pow(1 - p, 3)))) + suf
          if (p < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      }),
    { threshold: 0.5 },
  )
  $$("[data-to]").forEach((el) => cio.observe(el))
  cleanups.push(() => cio.disconnect())

  /* barras e medidores das demos */
  const bio = new IntersectionObserver(
    (es) =>
      es.forEach((e) => {
        if (!e.isIntersecting) return
        ;(e.target as HTMLElement).style.width = (e.target as HTMLElement).dataset.w + "%"
        bio.unobserve(e.target)
      }),
    { threshold: 0.4 },
  )
  $$("[data-w]").forEach((b) => bio.observe(b))
  cleanups.push(() => bio.disconnect())

  /* a leitura do terminal escreve-se */
  const tline = $<HTMLElement>("#l2-tline")
  if (tline) {
    const TXT = tline.dataset.txt || ""
    if (RM) tline.textContent = TXT
    else {
      const tio = new IntersectionObserver(
        (es) =>
          es.forEach((e) => {
            if (!e.isIntersecting) return
            tio.unobserve(e.target)
            let i = 0
            const step = () => {
              i += 2
              tline.innerHTML = TXT.slice(0, i) + (i < TXT.length ? '<span class="cur"></span>' : "")
              if (i < TXT.length) setTimeout(step, 16)
            }
            step()
          }),
        { threshold: 0.45 },
      )
      tio.observe(tline)
      cleanups.push(() => tio.disconnect())
    }
  }

  /* sequência do telemóvel, sincronizada com os momentos do dia */
  const msgs = $$(".msg")
  const beats = $$<HTMLElement>(".beat")
  if (msgs.length && beats.length) {
    const dio = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (!e.isIntersecting) return
          const i = Number((e.target as HTMLElement).dataset.b)
          beats.forEach((b, j) => b.classList.toggle("on", j === i))
          msgs.forEach((m, j) => m.classList.toggle("on", j <= i))
        }),
      { threshold: 0.6, rootMargin: "-25% 0px -25% 0px" },
    )
    beats.forEach((b) => dio.observe(b))
    beats[0].classList.add("on")
    msgs[0].classList.add("on")
    cleanups.push(() => dio.disconnect())
  }

  /* acordeão da FAQ */
  $$<HTMLElement>(".fq").forEach((f) => {
    const b = f.querySelector("button")!
    const fn = () => {
      const abrir = !f.classList.contains("aberta")
      $$(".fq.aberta").forEach((o) => o.classList.remove("aberta"))
      if (abrir) f.classList.add("aberta")
    }
    b.addEventListener("click", fn)
    cleanups.push(() => b.removeEventListener("click", fn))
  })

  return () => cleanups.forEach((f) => f())
}
