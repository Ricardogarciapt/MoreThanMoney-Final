"use client"

import type { RefObject } from "react"
import { useEffect, useRef } from "react"
import Hls from "hls.js"
import { buildHlsManifestCandidates } from "@/lib/lms-stream-ingest"

/**
 * Liga manifestos `.m3u8` ao elemento &lt;video&gt;: Safari (e similares) usam playback nativo;
 * Chrome, Firefox e a maioria dos Android usam hls.js.
 */
export function useLmsHlsVideo(videoRef: RefObject<HTMLVideoElement | null>, hlsUrl: string | undefined | null) {
  const hlsRef = useRef<Hls | null>(null)
  const triedFallbackRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    const video = videoRef.current
    const inputUrl = (hlsUrl || "").trim()
    triedFallbackRef.current.clear()

    const destroyHls = () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }

    const resetVideo = () => {
      destroyHls()
      if (video) {
        video.removeAttribute("src")
        video.load()
      }
    }

    const tryAutoplay = () => {
      if (!video) return
      const attempt = () => {
        void video.play().catch(() => {
          // Em alguns browsers o autoplay com áudio é bloqueado; tentamos com mute.
          const prevMuted = video.muted
          video.muted = true
          void video.play().catch(() => {
            video.muted = prevMuted
          })
        })
      }
      video.addEventListener("loadedmetadata", attempt)
      video.addEventListener("canplay", attempt)
      attempt()
      return () => {
        video.removeEventListener("loadedmetadata", attempt)
        video.removeEventListener("canplay", attempt)
      }
    }

    if (!video || !inputUrl) {
      resetVideo()
      return
    }

    // Se for URL MTM com /hls/, tentamos também variação com/sem /live.
    const mtmMatch = inputUrl.match(/\/hls\/([^/?#]+)\.m3u8(?:[?#].*)?$/i)
    const candidateUrls = mtmMatch
      ? buildHlsManifestCandidates(mtmMatch[1]).filter((u) => u !== inputUrl)
      : []

    let currentUrl = inputUrl
    const isM3u8 = /\.m3u8(\?|#|$)/i.test(currentUrl)

    if (!isM3u8) {
      destroyHls()
      video.src = currentUrl
      const cleanupAutoplay = tryAutoplay()
      return () => {
        cleanupAutoplay?.()
        resetVideo()
      }
    }

    // PRIORIDADE ao hls.js: o Chrome reporta canPlayType('application/x-mpegURL')='maybe'
    // mas NÃO toca HLS nativo — e só com hls.js conseguimos atrasar o vídeo na dobragem
    // (liveSyncDuration). Usamos nativo apenas quando o hls.js NÃO é suportado (Safari/iOS),
    // tratado no fallback video.src no fim.
    if (Hls.isSupported()) {
      destroyHls()
      const hls = new Hls({
        enableWorker: true,
        // Live: reduzir a latência (jogar mais perto do live edge) mantendo robustez.
        // LL-HLS off (o ingest pode não ter partes), mas apanhamos o edge mais cedo
        // e recuperamos de pequenos buracos sem parar.
        lowLatencyMode: false,
        liveDurationInfinity: true,
        liveSyncDurationCount: 3,          // NÃO baixar para 2: joga demasiado perto do edge → desfasa áudio/vídeo
        liveMaxLatencyDurationCount: 8,    // margem antes de recuperar (evita saltos que desincronizam)
        maxLiveSyncPlaybackRate: 1.1,      // acelera MUITO pouco p/ apanhar o edge — >1.1 desincroniza o áudio
        maxBufferLength: 20,               // era 15 — mais almofada contra stalls
        liveBackBufferLength: 20,          // back-buffer para poder recuar ~7s na dobragem
        backBufferLength: 20,              // idem (dobragem atrasa o vídeo ~7s p/ sincronizar a voz)
        maxBufferHole: 0.5,                // salta pequenos buracos em vez de parar
        highBufferWatchdogPeriod: 1,       // deteta stalls mais depressa
        nudgeMaxRetry: 8,                  // era 3 — recupera de stalls sem crashar
      })
      hlsRef.current = hls
      // Expor a instância ao LiveDubAudio para atrasar o vídeo (liveSyncDuration) só na dobragem.
      try { (video as any).__mtmHls = hls } catch {}
      const tryNextCandidate = () => {
        const next = candidateUrls.find((u) => !triedFallbackRef.current.has(u))
        if (!next) return false
        triedFallbackRef.current.add(next)
        currentUrl = next
        hls.loadSource(next)
        return true
      }

      const liveDebug =
        typeof window !== "undefined" && window.localStorage?.getItem("mtm_live_debug") === "1"

      // Em LIVE, erros fatais transitórios são comuns (restart/gap do stream). Recuperar
      // PRIMEIRO com o hls.js (startLoad/recoverMediaError) — só trocar de path após esgotar,
      // e NUNCA desistir: se não houver candidatos, volta ao canónico e recarrega.
      let recoverTries = 0
      hls.on(Hls.Events.FRAG_BUFFERED, () => { recoverTries = 0 })
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (liveDebug || process.env.NODE_ENV === "development") {
          console.warn("[MTM HLS]", data?.type, data?.details, data?.fatal ? "(fatal)" : "", { url: currentUrl })
        }
        if (!data?.fatal) return
        if (recoverTries < 8) {
          recoverTries++
          try {
            if (data.type === Hls.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError()
            else hls.startLoad() // NETWORK_ERROR e outros: re-tenta a fonte atual (o canónico funciona)
          } catch {}
          return
        }
        recoverTries = 0
        if (tryNextCandidate()) return // esgotou a recuperação → tenta outro path
        // sem mais candidatos → volta ao canónico e recarrega (não morre em live)
        currentUrl = inputUrl
        triedFallbackRef.current.clear()
        try { hls.loadSource(inputUrl); hls.startLoad() } catch {}
      })

      hls.loadSource(currentUrl)
      hls.attachMedia(video)
      const cleanupAutoplay = tryAutoplay()
      return () => {
        cleanupAutoplay?.()
        destroyHls()
        if (video) {
          video.removeAttribute("src")
          video.load()
        }
      }
    }

    video.src = currentUrl
    const cleanupAutoplay = tryAutoplay()
    return () => {
      cleanupAutoplay?.()
      resetVideo()
    }
  }, [hlsUrl, videoRef])
}
