/**
 * Helpers para Safari (e motores antigos): MediaQueryList, fullscreen e PiP.
 */

/** Safari < 14: MediaQueryList não suporta addEventListener("change"). */
export function subscribeMediaQueryChange(mql: MediaQueryList, handler: () => void): () => void {
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }
  mql.addListener(handler)
  return () => mql.removeListener(handler)
}

type FullscreenCapable = Element & {
  requestFullscreen?: () => Promise<void>
  webkitRequestFullscreen?: () => void
  msRequestFullscreen?: () => void
}

export async function requestElementFullscreen(el: Element | null | undefined): Promise<void> {
  if (!el) return
  const node = el as FullscreenCapable
  if (typeof node.requestFullscreen === "function") {
    await node.requestFullscreen()
    return
  }
  if (typeof node.webkitRequestFullscreen === "function") {
    node.webkitRequestFullscreen()
    return
  }
  if (typeof node.msRequestFullscreen === "function") {
    node.msRequestFullscreen()
  }
}

type DocFs = Document & {
  webkitFullscreenElement?: Element | null
  msFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  msExitFullscreen?: () => Promise<void> | void
}

export function getFullscreenElement(): Element | null {
  const d = document as DocFs
  return document.fullscreenElement ?? d.webkitFullscreenElement ?? d.msFullscreenElement ?? null
}

export async function exitDocumentFullscreen(): Promise<void> {
  const d = document as DocFs
  if (getFullscreenElement()) {
    if (typeof document.exitFullscreen === "function") {
      await document.exitFullscreen()
      return
    }
    if (typeof d.webkitExitFullscreen === "function") {
      await Promise.resolve(d.webkitExitFullscreen())
      return
    }
    if (typeof d.msExitFullscreen === "function") {
      await Promise.resolve(d.msExitFullscreen())
    }
  }
}

export function isPictureInPictureSupported(): boolean {
  if (typeof window === "undefined" || typeof document === "undefined") return false
  if (document.pictureInPictureEnabled === false) return false
  return typeof HTMLVideoElement !== "undefined" && "requestPictureInPicture" in HTMLVideoElement.prototype
}
