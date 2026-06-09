/** Controlo de tempo em &lt;video&gt; com HLS (buffer seekable). */

export function getHlsSeekableEnd(video: HTMLVideoElement): number | null {
  try {
    if (video.seekable.length === 0) return null
    return video.seekable.end(video.seekable.length - 1)
  } catch {
    return null
  }
}

export function getHlsSeekableStart(video: HTMLVideoElement): number | null {
  try {
    if (video.seekable.length === 0) return null
    return video.seekable.start(0)
  } catch {
    return null
  }
}

/** Recuar ou avançar N segundos, limitado ao buffer disponível. */
export function seekHlsByDelta(video: HTMLVideoElement, deltaSec: number) {
  const start = getHlsSeekableStart(video)
  const end = getHlsSeekableEnd(video)
  if (start == null || end == null) return
  const nearLive = end - 0.35
  const t = video.currentTime + deltaSec
  video.currentTime = Math.max(start + 0.05, Math.min(t, nearLive))
}

/** Salta para a ponta do direto (dentro do que já está em buffer). */
export function seekHlsLiveEdge(video: HTMLVideoElement) {
  const end = getHlsSeekableEnd(video)
  if (end == null) return
  video.currentTime = Math.max(0, end - 0.2)
}
