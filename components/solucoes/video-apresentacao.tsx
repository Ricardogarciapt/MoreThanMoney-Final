"use client"

import { useEffect, useRef, useState } from "react"
import { Volume2, VolumeX } from "lucide-react"

/**
 * O vídeo de apresentação do /solucoes. Arranca sem som (o browser não deixa autoplay com som); o botão dourado liga a narração desde o início. Só toca
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
      {som ? (
        <button
          type="button"
          onClick={alternarSom}
          className="absolute bottom-4 right-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/60 px-4 py-2 text-sm font-semibold text-white backdrop-blur transition hover:border-[#D2A63C]/60 active:scale-[0.97]"
        >
          <Volume2 className="h-4 w-4 text-[#E9C46A]" />
          Som ligado
        </button>
      ) : (
        <button
          type="button"
          onClick={alternarSom}
          aria-label="Ouvir o vídeo com som, desde o início"
          className="absolute bottom-4 right-4 inline-flex items-center gap-2.5 rounded-full bg-[#D2A63C] px-5 py-3 text-sm font-bold text-[#08090C] shadow-[0_10px_40px_-8px_rgba(210,166,60,0.8)] transition hover:bg-[#E9C46A] active:scale-[0.97] sm:bottom-6 sm:right-6 sm:px-6 sm:py-3.5 sm:text-base"
        >
          <span className="relative flex h-5 w-5 items-center justify-center">
            <span className="absolute inset-0 rounded-full bg-[#08090C]/20 motion-safe:animate-ping" />
            <VolumeX className="relative h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          Ouvir com som
        </button>
      )}
    </div>
  )
}
