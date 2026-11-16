"use client"

import { useEffect, useRef, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"

/**
 * O vídeo de apresentação do /solucoes. Arranca sem som (todo o texto está no ecrã) e só toca
 * quando está à vista. Com movimento reduzido fica parado na capa até a pessoa carregar.
 */
export function VideoApresentacao() {
  const ref = useRef<HTMLVideoElement>(null)
  const [som, setSom] = useState(false)

  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) v.play().catch(() => {})
        else v.pause()
      },
      { threshold: 0.35 },
    )
    io.observe(v)
    return () => io.disconnect()
  }, [])

  function alternarSom() {
    const v = ref.current
    if (!v) return
    v.muted = !v.muted
    if (!v.muted) {
      v.currentTime = 0
      v.play().catch(() => {})
    }
    setSom(!v.muted)
  }

  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-black shadow-[0_40px_120px_-40px_rgba(210,166,60,0.45)]">
      <video
        ref={ref}
        className="aspect-video w-full"
        poster="/images/solucoes/solucoes-poster.jpg"
        muted
        loop
        playsInline
        preload="metadata"
        controls={false}
        aria-label="Vídeo de apresentação: como a IA muda a rotina de um negócio"
      >
        <source src="/videos/solucoes-web-720.mp4" type="video/mp4" media="(max-width: 767px)" />
        <source src="/videos/solucoes-web-1080.mp4" type="video/mp4" />
      </video>
      <button
        type="button"
        onClick={alternarSom}
        className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:border-[#D2A63C]/60 active:scale-[0.97]"
      >
        {som ? <Volume2 className="h-4 w-4 text-[#E9C46A]" /> : <VolumeX className="h-4 w-4" />}
        {som ? "Som ligado" : "Ver com som"}
      </button>
    </div>
  )
}
