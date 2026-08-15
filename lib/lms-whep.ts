"use client"

import { useEffect, useRef, useState, type RefObject } from "react"

/**
 * Playback WHEP (WebRTC egress, tipo "chamada Zoom") para o player WEB — latência ~sub-segundo.
 * SÓ web. As apps nativas continuam em HLS (não sabem WebRTC). Se o WHEP não ligar em ~6s, o hook
 * desiste (`whepActive=false`) e o chamador volta ao HLS → nunca compromete a reprodução.
 * Captions/dobragem/DVR não dependem disto (leem o RTMP do SRS), por isso ficam intactos.
 */

function waitIceGathering(pc: RTCPeerConnection, timeoutMs = 1500): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve()
  return new Promise((resolve) => {
    const done = () => {
      pc.removeEventListener("icegatheringstatechange", check)
      resolve()
    }
    const check = () => {
      if (pc.iceGatheringState === "complete") done()
    }
    pc.addEventListener("icegatheringstatechange", check)
    setTimeout(done, timeoutMs) // não esperar para sempre — segue com o que tiver
  })
}

export function useLmsWhepVideo(
  videoRef: RefObject<HTMLVideoElement | null>,
  streamId: string | null | undefined,
  enabled: boolean,
): { whepActive: boolean } {
  const [whepActive, setWhepActive] = useState(false)
  const pcRef = useRef<RTCPeerConnection | null>(null)

  useEffect(() => {
    if (!enabled || !streamId) {
      setWhepActive(false)
      return
    }
    let cancelled = false
    let watchdog: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      cancelled = true
      if (watchdog) clearTimeout(watchdog)
      try {
        pcRef.current?.close()
      } catch {
        /* ignora */
      }
      pcRef.current = null
      const v = videoRef.current
      if (v && v.srcObject) {
        try {
          ;(v.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
        } catch {
          /* ignora */
        }
        v.srcObject = null
      }
    }

    ;(async () => {
      try {
        if (typeof RTCPeerConnection === "undefined") return
        const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] })
        pcRef.current = pc
        pc.addTransceiver("video", { direction: "recvonly" })
        pc.addTransceiver("audio", { direction: "recvonly" })

        const remote = new MediaStream()
        pc.ontrack = (e) => {
          remote.addTrack(e.track)
          const v = videoRef.current
          if (v) {
            v.srcObject = remote
            v.play().catch(() => {})
          }
        }
        pc.onconnectionstatechange = () => {
          if (cancelled) return
          const s = pc.connectionState
          if (s === "connected") setWhepActive(true)
          else if (s === "failed" || s === "disconnected" || s === "closed") setWhepActive(false)
        }

        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await waitIceGathering(pc)
        if (cancelled) return

        const res = await fetch(`/api/live-sessions/whep?streamId=${encodeURIComponent(streamId)}`, {
          method: "POST",
          headers: { "Content-Type": "application/sdp" },
          body: pc.localDescription?.sdp || offer.sdp || "",
          credentials: "same-origin",
          cache: "no-store",
        })
        if (!res.ok) throw new Error(`whep ${res.status}`)
        const answer = await res.text()
        if (cancelled || !answer.includes("v=0")) throw new Error("whep sem SDP")
        await pc.setRemoteDescription({ type: "answer", sdp: answer })

        // Watchdog: se não ligar em 6s, desiste → HLS assume.
        watchdog = setTimeout(() => {
          if (!cancelled && pc.connectionState !== "connected") {
            setWhepActive(false)
            try {
              pc.close()
            } catch {
              /* ignora */
            }
          }
        }, 6000)
      } catch {
        if (!cancelled) setWhepActive(false)
      }
    })()

    return cleanup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, enabled])

  return { whepActive }
}
