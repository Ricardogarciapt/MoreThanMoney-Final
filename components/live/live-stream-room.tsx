"use client"

import { authHeaders } from "@/lib/auth-token"
import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  Volume2,
  MessageCircle,
  MessageCircleOff,
  ArrowLeft,
  Maximize2,
  PictureInPicture2,
  X,
  Rewind,
  FastForward,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import LiveFinancialDisclaimer from "@/components/live/live-financial-disclaimer"
import EmojiChatPicker from "@/components/live/emoji-chat-picker"
import { enterLiveFullscreen, useIsSmartphone } from "@/lib/live-player-viewport"
import { useLmsHlsVideo } from "@/hooks/use-lms-hls-video"
import { useLmsWhepVideo } from "@/lib/lms-whep"
import { usePictureInPictureSupported } from "@/hooks/use-picture-in-picture-supported"
import { seekHlsByDelta } from "@/lib/live-hls-seek"
import { useLmsViewerHeartbeat } from "@/hooks/use-lms-viewer-heartbeat"
import EducatorLiveViewerBadge from "@/components/live/educator-live-viewer-badge"
import LiveCaptions from "@/components/mobile/live-captions"
import LiveDubAudio from "@/components/mobile/live-dub-audio"
import { notifyXpFromResponse } from "@/lib/xp-client"
import { handleLiveChatEnterKey } from "@/lib/live-chat"
import {
  classificarEnvio,
  cursorDaProximaSondagem,
  deveColarNoFundo,
  etiquetaDeAutor,
  juntarMensagens,
  podeLimparCaixa,
  type MensagemDoChat,
} from "@/lib/live-chat-sala"

interface Props {
  streamId: string
}

type Msg = MensagemDoChat

/**
 * Cadência do chat. Era 5 s, e era a MESMA sondagem que trazia o stream inteiro: cada mensagem
 * chegava até 5 s depois de ser escrita, o que numa sessão ao vivo chega para a conversa deixar
 * de fazer sentido. Agora o chat tem a sua própria sondagem, incremental (`?desde=`), e por isso
 * pode ser rápida sem custar nada: cada pedido traz só o que nasceu desde a última mensagem.
 */
const MS_SONDAGEM_CHAT_AO_VIVO = 1500
const MS_SONDAGEM_CHAT_OFFLINE = 8000
/** O stream (is_live, HLS) muda devagar — não precisa da cadência do chat. */
const MS_SONDAGEM_STREAM = 5000

/** Mensagem ainda a caminho: mostra-se logo, mas marcada, e nunca substitui o texto da caixa. */
type MsgPendente = { chaveLocal: string; message: string; estado: "a-enviar" | "falhou"; motivo?: string }

const horaCurta = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" })
}

export default function LiveStreamRoom({ streamId }: Props) {
  const [stream, setStream] = useState<any>(null)
  const [messages, setMessages] = useState<Msg[]>([])
  const [pendentes, setPendentes] = useState<MsgPendente[]>([])
  const [chatBloqueado, setChatBloqueado] = useState<string | null>(null)
  const [naoLidas, setNaoLidas] = useState(0)
  const [text, setText] = useState("")
  const [sending, setSending] = useState(false)
  const [clearing, setClearing] = useState(false)
  const caixaMensagensRef = useRef<HTMLDivElement | null>(null)
  const fundoRef = useRef<HTMLDivElement | null>(null)
  // Guardado em ref (e não em estado) porque é lido dentro da sondagem: em estado, o intervalo
  // ficaria preso ao valor do primeiro render e a sondagem repetia o histórico para sempre.
  const cursorRef = useRef<string | null>(null)
  const colarNoFundoRef = useRef(true)
  const [showChat, setShowChat] = useState(true)
  const [disclaimerOpen, setDisclaimerOpen] = useState(false)
  const prevIsLiveRef = useRef(false)
  const disclaimerTimerRef = useRef<number | null>(null)
  const [volume, setVolume] = useState(1)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  const playerWrapRef = useRef<HTMLDivElement | null>(null)
  const isSmartphone = useIsSmartphone()
  const pipSupported = usePictureInPictureSupported()

  const closeDisclaimer = () => {
    setDisclaimerOpen(false)
    if (disclaimerTimerRef.current) {
      window.clearTimeout(disclaimerTimerRef.current)
      disclaimerTimerRef.current = null
    }
  }

  const carregarStream = async () => {
    const res = await fetch(`/api/live-sessions/streams/${streamId}`, {
      credentials: "same-origin",
      headers: await authHeaders(),
    }).then((r) => r.json())
    setStream(res.data || null)
  }

  /**
   * Uma sondagem só do chat. `modo: "historico"` é a primeira (ou depois de limpar) e traz as
   * últimas mensagens — é o que quem chega aos 20 minutos tem de ver. `modo: "novas"` manda o
   * cursor e traz só o que nasceu depois.
   */
  const carregarChat = async (modo: "historico" | "novas") => {
    const cursor = modo === "novas" ? cursorRef.current : null
    const url = cursor
      ? `/api/live-sessions/streams/${streamId}/messages?desde=${encodeURIComponent(cursor)}`
      : `/api/live-sessions/streams/${streamId}/messages`

    let res: Response
    try {
      // A sessão viaja no token nas apps/webviews e no cookie no browser. Mandar só o cookie era
      // o caminho directo para o chat em branco de quem TEM sessão (ver messages-dm-blank-fix).
      res = await fetch(url, { credentials: "same-origin", headers: await authHeaders() })
    } catch {
      return // rede a oscilar: a próxima sondagem recupera, o ecrã não pisca
    }

    const corpo = await res.json().catch(() => null)

    if (res.status === 403) {
      // Nunca uma lista vazia: sem direito, DIZ-SE. Vazio lê-se como "ainda sem mensagens".
      setChatBloqueado(corpo?.error || "Não tens acesso ao chat desta sessão.")
      setMessages([])
      return
    }
    if (!res.ok || !corpo?.success) return

    setChatBloqueado(null)

    if (corpo.chatLimpo) {
      // Sessão Gratuita que terminou: o chat limpa-se de propósito. Reinicia-se o cursor, senão
      // a sondagem seguinte pedia "desde" uma mensagem que já não existe.
      cursorRef.current = null
      setMessages([])
      return
    }

    const novas = (corpo.data || []) as Msg[]
    if (modo === "historico") {
      cursorRef.current = cursorDaProximaSondagem(novas)
      setMessages(novas)
      return
    }
    if (novas.length === 0) return

    setMessages((atuais) => {
      const juntas = juntarMensagens(atuais, novas)
      cursorRef.current = cursorDaProximaSondagem(juntas)
      // Quem está a ler histórico não é arrastado para o fundo — leva um contador em vez disso.
      if (!colarNoFundoRef.current) setNaoLidas((n) => n + novas.length)
      return juntas
    })
  }

  useEffect(() => {
    prevIsLiveRef.current = false
    closeDisclaimer()
    cursorRef.current = null
    setPendentes([])
    setNaoLidas(0)
    colarNoFundoRef.current = true
    void carregarStream()
    void carregarChat("historico")
    const id = setInterval(carregarStream, MS_SONDAGEM_STREAM)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId])

  // Sondagem do chat, à parte e mais rápida quando há sessão a decorrer.
  useEffect(() => {
    if (!streamId || chatBloqueado) return
    const ms = stream?.is_live ? MS_SONDAGEM_CHAT_AO_VIVO : MS_SONDAGEM_CHAT_OFFLINE
    const id = setInterval(() => void carregarChat("novas"), ms)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamId, stream?.is_live, chatBloqueado])

  // Cola no fundo só se a pessoa já lá estava (ver deveColarNoFundo). O chat não fazia scroll
  // nenhum: entrava-se no TOPO das últimas 80 mensagens e as novas nasciam fora do ecrã.
  useEffect(() => {
    if (!colarNoFundoRef.current) return
    fundoRef.current?.scrollIntoView({ block: "end" })
    setNaoLidas(0)
  }, [messages, pendentes, showChat])

  const aoScrollDoChat = () => {
    const caixa = caixaMensagensRef.current
    if (!caixa) return
    const colar = deveColarNoFundo(caixa)
    colarNoFundoRef.current = colar
    if (colar) setNaoLidas(0)
  }

  const irParaOFundo = () => {
    colarNoFundoRef.current = true
    setNaoLidas(0)
    fundoRef.current?.scrollIntoView({ block: "end", behavior: "smooth" })
  }

  useEffect(() => {
    const el = videoRef.current
    if (el) el.volume = volume
    // volume is the only real dependency — removing stream fields avoids
    // spurious re-runs every 5s (stream is a new object on each poll)
  }, [volume])

  const canSend = useMemo(() => text.trim().length > 0, [text])
  const canClearChat = Boolean(stream?.viewer_can_clear_chat)

  // Stable HLS URL: persist the last known URL so transient null responses (API error, brief
  // is_live=false flip) never destroy the HLS player mid-stream.
  const stableHlsUrlRef = useRef("")
  const hlsUrl = useMemo(() => {
    const url = stream?.hls_manifest_url ? String(stream.hls_manifest_url) : ""
    if (url) stableHlsUrlRef.current = url   // lock in the URL once we have it
    return url
  }, [stream?.hls_manifest_url])
  // Use the last-known good URL if the current poll returned nothing (transient error/flip)
  const effectiveHlsUrl = useMemo(() => hlsUrl || stableHlsUrlRef.current, [hlsUrl])

  // Pass the effective URL to HLS.js so it never gets destroyed on a transient null
  const useHls = Boolean(effectiveHlsUrl)
  const isLive = Boolean(stream?.is_live)
  const { viewerCount } = useLmsViewerHeartbeat(streamId, Boolean(streamId && isLive))

  const iframePlaybackUrl = useMemo(() => {
    const raw = String(stream?.playback_url || "").trim()
    if (!raw) return ""
    try {
      const u = new URL(raw)
      u.searchParams.set("autoplay", "1")
      u.searchParams.set("mute", "1")
      return u.toString()
    } catch {
      return raw
    }
  }, [stream?.playback_url])

  // WHEP (WebRTC, tipo Zoom) PRIMEIRO — latência ~sub-segundo. Se ligar, assume o vídeo; se não
  // ligar em ~6s, `whepActive` fica false e o HLS toma conta (apps nativas nunca usam isto).
  const { whepActive } = useLmsWhepVideo(videoRef, streamId, isLive && useHls)
  useLmsHlsVideo(videoRef, useHls && !whepActive ? effectiveHlsUrl : null)

  useEffect(() => {
    const isLiveNow = Boolean(stream?.is_live)

    if (!isLiveNow) {
      prevIsLiveRef.current = false
      closeDisclaimer()
      return
    }

    // Mostra apenas quando transita para "live" (evita reset a cada refresh a cada 5s).
    if (isLiveNow && !prevIsLiveRef.current) {
      prevIsLiveRef.current = true
      setDisclaimerOpen(true)

      if (disclaimerTimerRef.current) window.clearTimeout(disclaimerTimerRef.current)
      disclaimerTimerRef.current = window.setTimeout(() => {
        setDisclaimerOpen(false)
        disclaimerTimerRef.current = null
      }, 3000)
    }
  }, [stream?.is_live])

  /**
   * ENVIAR SEM PERDER NADA.
   *
   * Antes: `fetch`, ignorar o estado da resposta, `setText("")`. Com a rede a oscilar ou com a
   * sessão caducada, o que a pessoa escreveu desaparecia da caixa e nunca chegava a ninguém —
   * sem erro, sem aviso, sem rasto. Agora:
   *   · a mensagem aparece logo, marcada como "a enviar" (a conversa não espera pela rede);
   *   · a caixa só se limpa quando o servidor confirma que GRAVOU (`podeLimparCaixa`);
   *   · se falhar, fica visível com o motivo e um "Tentar novamente" quando tentar faz sentido.
   */
  const enviarTexto = async (mensagem: string, chaveLocal: string) => {
    let status: number | null = null
    let corpo: any = null
    try {
      const res = await fetch(`/api/live-sessions/streams/${streamId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        credentials: "same-origin",
        body: JSON.stringify({ message: mensagem }),
      })
      status = res.status
      corpo = await res.json().catch(() => null)
    } catch {
      status = null // o pedido nem chegou a sair
    }

    const resultado = classificarEnvio({ status, corpo })

    if (resultado.saiu) {
      if (corpo?.xp) void notifyXpFromResponse(corpo.xp)
      // A linha gravada entra pela junção (nunca duplica com a que a sondagem vai trazer).
      if (corpo?.data) {
        colarNoFundoRef.current = true
        setMessages((atuais) => {
          const juntas = juntarMensagens(atuais, [corpo.data as Msg])
          cursorRef.current = cursorDaProximaSondagem(juntas)
          return juntas
        })
      }
      setPendentes((ps) => ps.filter((p) => p.chaveLocal !== chaveLocal))
      return resultado
    }

    setPendentes((ps) =>
      ps.map((p) =>
        p.chaveLocal === chaveLocal ? { ...p, estado: "falhou", motivo: resultado.motivo } : p
      )
    )
    return resultado
  }

  const send = async () => {
    if (!canSend) return
    const mensagem = text.trim()
    const chaveLocal = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    setSending(true)
    colarNoFundoRef.current = true
    setPendentes((ps) => [...ps, { chaveLocal, message: mensagem, estado: "a-enviar" }])
    try {
      const resultado = await enviarTexto(mensagem, chaveLocal)
      // A caixa só se limpa com a mensagem gravada. Se falhou, o texto fica onde a pessoa o
      // escreveu — pode corrigir, copiar ou carregar em "Tentar novamente".
      if (podeLimparCaixa(resultado)) setText("")
    } finally {
      setSending(false)
    }
  }

  const reenviar = async (p: MsgPendente) => {
    setPendentes((ps) =>
      ps.map((x) => (x.chaveLocal === p.chaveLocal ? { ...x, estado: "a-enviar", motivo: undefined } : x))
    )
    await enviarTexto(p.message, p.chaveLocal)
  }

  const descartarPendente = (chaveLocal: string) => {
    setPendentes((ps) => ps.filter((p) => p.chaveLocal !== chaveLocal))
  }

  const clearChat = async () => {
    if (!canClearChat) return
    const ok = window.confirm("Apagar todas as mensagens deste chat?")
    if (!ok) return
    setClearing(true)
    try {
      const res = await fetch(`/api/live-sessions/streams/${streamId}/messages`, {
        method: "DELETE",
        credentials: "same-origin",
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        window.alert(j.error || "Não foi possível limpar o chat.")
      }
      // Cursor a zero: depois de limpar, a sondagem tem de voltar a pedir o histórico (que agora
      // está vazio) e não "o que nasceu depois" de uma mensagem que já não existe.
      cursorRef.current = null
      await carregarChat("historico")
    } finally {
      setClearing(false)
    }
  }

  const appendEmoji = (emoji: string) => {
    setText((prev) => `${prev}${emoji}`)
  }

  const openFullscreen = async () => {
    await enterLiveFullscreen({
      video: effectiveHlsUrl ? videoRef.current : null,
      iframe: iframePlaybackUrl ? iframeRef.current : null,
      fallbackContainer: playerWrapRef.current,
    })
  }

  const openPiP = async () => {
    const video = videoRef.current
    if (!video) return
    try {
      // PiP é suportado apenas com elemento <video> (não iframe)
      await video.requestPictureInPicture()
    } catch (error) {
      console.warn("[live-stream-room] PiP indisponível:", error)
    }
  }

  const seekHlsSeconds = (delta: number) => {
    const video = videoRef.current
    if (!video) return
    seekHlsByDelta(video, delta)
  }

  return (
    <div className="space-y-4">
      <Link
        href="/live-sessions"
        className="inline-flex items-center text-sm text-gray-400 transition hover:text-[#D2A63C]"
      >
        <ArrowLeft className="mr-2 h-4 w-4 shrink-0" />
        Voltar ao lobby
      </Link>
      <div className={`grid gap-4 ${showChat ? "lg:grid-cols-3" : "lg:grid-cols-1"}`}>
      <Card className={`border border-[#D2A63C]/20 bg-gray-950/90 ${showChat ? "lg:col-span-2" : ""}`}>
        <CardHeader className="space-y-2">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-[#D2A63C]">{stream?.title || "Canal ao vivo"}</CardTitle>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xs text-gray-400">
                  {stream?.educator?.display_name || "Educador"} • {stream?.academy?.name || "Academia"} •{" "}
                  {stream?.is_live ? "ONLINE" : "OFFLINE"}
                </p>
                {isLive && <EducatorLiveViewerBadge isLive count={viewerCount} />}
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-gray-600 text-gray-200 shrink-0"
              onClick={() => setShowChat((v) => !v)}
            >
              {showChat ? (
                <>
                  <MessageCircleOff className="mr-2 h-4 w-4" />
                  Esconder chat
                </>
              ) : (
                <>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Mostrar chat
                </>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            ref={playerWrapRef}
            className="relative [&:fullscreen]:fixed [&:fullscreen]:inset-0 [&:fullscreen]:z-[2147483646] [&:fullscreen]:flex [&:fullscreen]:h-[100dvh] [&:fullscreen]:w-screen [&:fullscreen]:items-stretch [&:fullscreen]:justify-stretch [&:fullscreen]:bg-black [&:fullscreen]:rounded-none [&:fullscreen>iframe]:!h-full [&:fullscreen>iframe]:!w-full [&:fullscreen>iframe]:min-h-0 [&:fullscreen>iframe]:flex-1 [&:fullscreen>iframe]:rounded-none [&:fullscreen>iframe]:border-0 [&:fullscreen>video]:!h-full [&:fullscreen>video]:!w-full [&:fullscreen>video]:!max-h-none [&:fullscreen>video]:flex-1 [&:fullscreen>video]:rounded-none [&:fullscreen>video]:border-0"
          >
            {disclaimerOpen && (
              <div className="absolute left-3 top-3 z-50 w-full max-w-[360px]">
                <div className="relative">
                  <button
                    type="button"
                    onClick={closeDisclaimer}
                    className="absolute -top-2 -right-2 z-10 rounded-full border border-gray-700 bg-black/70 p-1 text-gray-200 hover:bg-black/90"
                    aria-label="Fechar aviso"
                  >
                    <X className="h-4 w-4" />
                  </button>
                  <LiveFinancialDisclaimer />
                </div>
              </div>
            )}
            {/*
              SINGLE video branch keyed on effectiveHlsUrl.
              Previously there were TWO <video> branches (isLive&&hlsUrl vs just hlsUrl).
              React treats them as DIFFERENT nodes in the tree — toggling isLive would
              unmount one and mount the other, restarting the HLS player every time
              is_live flickered. A single branch keeps the same DOM node alive.
            */}
            {effectiveHlsUrl ? (
              <video
                key={effectiveHlsUrl}
                ref={videoRef}
                className="h-[420px] w-full rounded-lg border border-gray-700 bg-black object-contain [&:fullscreen]:h-full [&:fullscreen]:w-full [&:fullscreen]:object-contain"
                controls
                autoPlay
                playsInline
              />
            ) : iframePlaybackUrl ? (
              <iframe
                ref={iframeRef}
                src={iframePlaybackUrl}
                title={stream?.title || "Live stream"}
                className="h-[420px] w-full rounded-lg border border-gray-700 bg-black [&:fullscreen]:aspect-auto [&:fullscreen]:h-full [&:fullscreen]:min-h-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              <div className="h-[420px] rounded-lg border border-gray-700 bg-black flex items-center justify-center px-6 text-center text-gray-400">
                {(stream as { reproducao_bloqueada?: boolean } | null)?.reproducao_bloqueada
                  ? "🔒 Esta sala é de um nível de acesso acima do teu (ou precisa de sessão iniciada). Faz upgrade para assistir."
                  : "Nenhum playback definido. Configura playback no admin ou HLS no servidor de stream."}
              </div>
            )}
            {/* Legendas ao vivo + seletor de idioma (só HLS) */}
            {effectiveHlsUrl && streamId && (
              <LiveCaptions
                streamId={streamId}
                sourceLanguage={
                  ((stream as any)?.caption_source_language as string) ||
                  ((stream as any)?.educator?.language as string) ||
                  "pt"
                }
              />
            )}
          </div>

          {(iframePlaybackUrl || effectiveHlsUrl) && (
            <div className="flex flex-wrap items-center gap-2">
              {effectiveHlsUrl && streamId && (
                <LiveDubAudio streamId={streamId} videoRef={videoRef} />
              )}
              <Button type="button" variant="outline" size="sm" className="border-gray-700 text-gray-200" onClick={openFullscreen}>
                <Maximize2 className="mr-2 h-4 w-4" />
                Ecrã inteiro
              </Button>
              {effectiveHlsUrl && isSmartphone && pipSupported && (
                <Button type="button" variant="outline" size="sm" className="border-gray-700 text-gray-200" onClick={openPiP}>
                  <PictureInPicture2 className="mr-2 h-4 w-4" />
                  PiP
                </Button>
              )}
            </div>
          )}

          {/* Controlo de tempo HLS + volume */}
          {effectiveHlsUrl && (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-200"
                  onClick={() => seekHlsSeconds(-10)}
                  title="Recuar 10 segundos"
                >
                  <Rewind className="mr-1.5 h-4 w-4" />
                  −10s
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-200"
                  onClick={() => seekHlsSeconds(10)}
                  title="Avançar 10 segundos (até à ponta do buffer)"
                >
                  <FastForward className="mr-1.5 h-4 w-4" />
                  +10s
                </Button>
              </div>
              <div
                className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${
                  isLive ? "border-[#D2A63C]/25 bg-black/40" : "border-gray-800 bg-black/30"
                }`}
              >
                <Volume2 className={`h-4 w-4 shrink-0 ${isLive ? "text-[#D2A63C]" : "text-gray-400"}`} />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-2 flex-1 accent-[#D2A63C]"
                  aria-label="Volume do streaming"
                />
                <span className="w-10 text-right text-xs text-gray-400">{Math.round(volume * 100)}%</span>
              </div>
            </div>
          )}

          {/* Embed (YouTube, etc.): volume só nos controlos do player — durante a live */}
          {isLive && iframePlaybackUrl && (
            <div className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900/60 px-3 py-2 text-xs text-gray-400">
              <Volume2 className="h-4 w-4 shrink-0 text-gray-500" />
              <span>
                <strong className="text-gray-300">Volume:</strong> usa os controlos do vídeo embebido (player do YouTube / live).
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {showChat && (
        <Card className="border border-[#D2A63C]/20 bg-gray-950/90">
          <CardHeader>
            <div className="flex items-start justify-between gap-2">
              <CardTitle className="text-white text-base">Chat da sessão</CardTitle>
              {canClearChat && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-red-900/60 text-red-300 shrink-0"
                  disabled={clearing}
                  onClick={clearChat}
                >
                  {clearing ? "…" : "Limpar chat"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {chatBloqueado ? (
              <div className="rounded-md border border-[#D2A63C]/25 bg-black/40 p-4 text-center text-xs text-gray-300">
                🔒 {chatBloqueado}
              </div>
            ) : (
              <div className="relative">
                <div
                  ref={caixaMensagensRef}
                  onScroll={aoScrollDoChat}
                  className="h-[min(40vh,320px)] sm:h-[320px] overflow-y-auto rounded-md border border-gray-700 bg-black/30 p-2 space-y-2"
                >
                  {messages.map((msg) => {
                    const etiqueta = etiquetaDeAutor(msg.sender_type, msg.sender_tier)
                    const ehEducador = String(msg.sender_type).toLowerCase() === "educator"
                    return (
                      <div
                        key={msg.id}
                        className={`rounded px-2 py-1.5 text-xs ${
                          ehEducador ? "border-l-2 border-[#D2A63C] bg-[#D2A63C]/[0.07]" : ""
                        }`}
                      >
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span
                            className={ehEducador ? "font-semibold text-[#D2A63C]" : "font-medium text-gray-100"}
                          >
                            {msg.sender_name}
                          </span>
                          {etiqueta && (
                            <span
                              className="rounded-full border px-1.5 py-[1px] text-[10px] leading-none"
                              style={{ color: etiqueta.cor, borderColor: `${etiqueta.cor}55` }}
                            >
                              {etiqueta.texto}
                            </span>
                          )}
                          <span className="ml-auto text-[10px] tabular-nums text-gray-500">
                            {horaCurta(msg.created_at)}
                          </span>
                        </div>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-gray-200">{msg.message}</p>
                      </div>
                    )
                  })}

                  {/* As que ainda não estão gravadas: visíveis, marcadas, nunca confundidas com as outras. */}
                  {pendentes.map((p) => (
                    <div
                      key={p.chaveLocal}
                      className={`rounded border-l-2 px-2 py-1.5 text-xs ${
                        p.estado === "falhou"
                          ? "border-red-500/70 bg-red-950/25"
                          : "border-gray-600 bg-gray-900/40"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words text-gray-300">{p.message}</p>
                      {p.estado === "a-enviar" ? (
                        <p className="mt-0.5 text-[10px] text-gray-500">a enviar…</p>
                      ) : (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <span className="text-[10px] text-red-300">{p.motivo || "Não foi enviada."}</span>
                          <button
                            type="button"
                            onClick={() => void reenviar(p)}
                            className="rounded border border-[#D2A63C]/50 px-1.5 py-[1px] text-[10px] text-[#D2A63C] hover:bg-[#D2A63C]/10"
                          >
                            Tentar novamente
                          </button>
                          <button
                            type="button"
                            onClick={() => descartarPendente(p.chaveLocal)}
                            className="text-[10px] text-gray-500 underline hover:text-gray-300"
                          >
                            Descartar
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {messages.length === 0 && pendentes.length === 0 && (
                    <p className="text-gray-500 text-xs">Ainda sem mensagens.</p>
                  )}
                  {/* Âncora do scroll automático. */}
                  <div ref={fundoRef} />
                </div>

                {naoLidas > 0 && (
                  <button
                    type="button"
                    onClick={irParaOFundo}
                    className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full border border-[#D2A63C]/50 bg-black/85 px-3 py-1 text-[11px] text-[#E9C46A] shadow-lg hover:bg-black"
                  >
                    {naoLidas} {naoLidas === 1 ? "nova mensagem" : "novas mensagens"} ↓
                  </button>
                )}
              </div>
            )}

            {!chatBloqueado && (
              <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <textarea
                  className="min-h-[88px] w-full flex-1 rounded border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white"
                  rows={3}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => handleLiveChatEnterKey(e, send, { disabled: !canSend || sending })}
                  /* O texto dizia "(Enter para enviar)" e o Enter NÃO envia — só Cmd/Ctrl+Enter
                     (ver lib/live-chat.ts). O atalho é partilhado com os painéis do educador, por
                     isso corrige-se o que se promete, não o comportamento de todos. */
                  placeholder="Mensagem no chat da live… (Cmd/Ctrl+Enter para enviar)"
                />
                <div className="flex flex-row gap-2 sm:flex-col sm:justify-end sm:w-[100px] shrink-0">
                  <EmojiChatPicker
                    onPick={appendEmoji}
                    className="h-11 flex-1 border-gray-600 text-gray-200 sm:flex-none sm:h-11 sm:w-full"
                  />
                  <Button
                    disabled={!canSend || sending}
                    onClick={send}
                    className="h-11 flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525] sm:h-11 sm:w-full"
                  >
                    {sending ? "A enviar…" : "Enviar"}
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
      </div>
    </div>
  )
}
