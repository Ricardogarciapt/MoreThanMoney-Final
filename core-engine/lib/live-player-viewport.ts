"use client"

import { useEffect, useState } from "react"
import { requestElementFullscreen, subscribeMediaQueryChange } from "@/lib/browser-compat"

/** Smartphone: retrato (≤768px) ou paisagem típica de telemóvel (larga mas baixa). PiP só nestes casos. */
export function useIsSmartphone(): boolean {
  const [yes, setYes] = useState(false)
  useEffect(() => {
    const portrait = window.matchMedia("(max-width: 768px)")
    const phoneLandscape = window.matchMedia("(max-width: 932px) and (max-height: 500px)")
    const onChange = () => setYes(portrait.matches || phoneLandscape.matches)
    onChange()
    const unsub1 = subscribeMediaQueryChange(portrait, onChange)
    const unsub2 = subscribeMediaQueryChange(phoneLandscape, onChange)
    return () => {
      unsub1()
      unsub2()
    }
  }, [])
  return yes
}

type FullscreenTarget = {
  video: HTMLVideoElement | null
  iframe: HTMLIFrameElement | null
  /** Último recurso: envolve o player com estilos que preenchem o ecrã em modo fullscreen */
  fallbackContainer: HTMLElement | null
}

async function tryLockLandscapeOrientation(): Promise<void> {
  try {
    const o = (screen as any)?.orientation
    if (o?.lock) await o.lock("landscape")
  } catch {
    // iOS/Safari e alguns browsers ignoram lock sem gesture forte; seguimos sem falhar fullscreen.
  }
}

function setupOrientationUnlockOnExit(): void {
  const handler = () => {
    if (document.fullscreenElement) return
    document.removeEventListener("fullscreenchange", handler)
    try {
      const o = (screen as any)?.orientation
      if (o?.unlock) o.unlock()
    } catch {
      // sem suporte -> ignorar
    }
  }
  document.addEventListener("fullscreenchange", handler)
}

/**
 * Ecrã inteiro real: prioriza o <video> (HLS) ou o <iframe> (embed), não só a caixa pequena.
 * iOS Safari: webkitEnterFullscreen no vídeo abre o player nativo em ecrã inteiro.
 * Não exigir video.src: com hls.js o src pode estar vazio e o playback veio de MSE.
 */
export async function enterLiveFullscreen({
  video,
  iframe,
  fallbackContainer,
}: FullscreenTarget): Promise<boolean> {
  if (video) {
    try {
      const v = video as HTMLVideoElement & { webkitEnterFullscreen?: () => void }
      if (typeof v.webkitEnterFullscreen === "function") {
        v.webkitEnterFullscreen()
        return true
      }
      await requestElementFullscreen(video)
      setupOrientationUnlockOnExit()
      await tryLockLandscapeOrientation()
      return true
    } catch (e) {
      console.warn("[live] fullscreen (vídeo):", e)
    }
  }

  if (iframe) {
    try {
      await requestElementFullscreen(iframe)
      setupOrientationUnlockOnExit()
      await tryLockLandscapeOrientation()
      return true
    } catch (e) {
      console.warn("[live] fullscreen (iframe):", e)
    }
  }

  if (fallbackContainer) {
    try {
      await requestElementFullscreen(fallbackContainer)
      setupOrientationUnlockOnExit()
      await tryLockLandscapeOrientation()
      return true
    } catch (e) {
      console.warn("[live] fullscreen (container):", e)
    }
  }
  return false
}
