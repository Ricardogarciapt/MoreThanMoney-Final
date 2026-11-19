"use client"

/**
 * VOZ DO MENTOR (19/11/2026) — falar com o Mentor e ouvi-lo, sem custos.
 *
 *  · FALAR (voz → texto): grava com o MediaRecorder do próprio telemóvel/browser e envia para
 *    `/api/mentor/voz` (Groq Whisper grátis, detecta a língua). Funciona igual no browser, na PWA e
 *    dentro das apps nativas (WebView), onde a Web Speech API não existe. Se o MediaRecorder não
 *    existir mas a Web Speech API sim (alguns browsers), usa essa.
 *  · OUVIR (texto → voz): `speechSynthesis` do sistema — nativo, grátis, offline, vozes do próprio
 *    iOS/Android. Para português escolhe sempre uma voz de Portugal quando existe (não do Brasil).
 */
import { useCallback, useEffect, useRef, useState } from "react"

export type EstadoMicro = "parado" | "a-ouvir" | "a-transcrever"

const BCP47: Record<string, string> = {
  pt: "pt-PT", en: "en-GB", es: "es-ES", fr: "fr-FR", de: "de-DE", it: "it-IT", nl: "nl-NL", "zh-CN": "zh-CN",
  ja: "ja-JP", ar: "ar-SA", ru: "ru-RU", hi: "hi-IN", sr: "sr-RS", hr: "hr-HR", bs: "bs-BA", sq: "sq-AL",
  bg: "bg-BG", ro: "ro-RO", pl: "pl-PL", uk: "uk-UA", tr: "tr-TR",
}

/** O Whisper devolve a língua por extenso («portuguese»); passa-se ao código da app. */
const NOME_PARA_CODIGO: Record<string, string> = {
  portuguese: "pt", english: "en", spanish: "es", french: "fr", german: "de", italian: "it", dutch: "nl",
  chinese: "zh-CN", japanese: "ja", arabic: "ar", russian: "ru", hindi: "hi", serbian: "sr", croatian: "hr",
  bosnian: "bs", albanian: "sq", bulgarian: "bg", romanian: "ro", polish: "pl", ukrainian: "uk", turkish: "tr",
}

export function codigoDaLingua(l: string | null | undefined): string | null {
  if (!l) return null
  const x = l.toLowerCase().trim()
  return NOME_PARA_CODIGO[x] ?? (BCP47[x] ? x : BCP47[x.slice(0, 2)] ? x.slice(0, 2) : null)
}

/** Texto para ler em voz alta: sem markdown, links, emojis nem símbolos que a voz soletra. */
export function textoParaFalar(t: string): string {
  return t
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#>`~|]+/g, " ")
    .replace(/\p{Extended_Pictographic}|️|‍/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function escolherVoz(bcp: string): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null
  const vozes = window.speechSynthesis.getVoices()
  const norm = (s: string) => s.replace("_", "-").toLowerCase()
  const exatas = vozes.filter((v) => norm(v.lang) === bcp.toLowerCase())
  const prefixo = bcp.slice(0, 2).toLowerCase()
  // Português: só cai para pt-BR se o aparelho não tiver nenhuma voz de Portugal.
  const familia = vozes.filter((v) => norm(v.lang).startsWith(prefixo))
  const lista = exatas.length ? exatas : familia
  const boa = /premium|enhanced|neural|natural|siri|google/i
  return lista.find((v) => boa.test(v.name)) ?? lista[0] ?? null
}

/** Partes curtas: alguns motores (Chrome) cortam frases longas a meio. */
function partes(t: string): string[] {
  const frases = t.match(/[^.!?…]+[.!?…]*/g) ?? [t]
  const out: string[] = []
  let atual = ""
  for (const f of frases) {
    if ((atual + f).length > 220 && atual) {
      out.push(atual.trim())
      atual = ""
    }
    atual += f
  }
  if (atual.trim()) out.push(atual.trim())
  return out
}

export function useVozMentor(opcoes: { lang: string; aoTranscrever: (texto: string) => void; aoErro: (chave: string) => void }) {
  const { lang, aoTranscrever, aoErro } = opcoes
  const [estado, setEstado] = useState<EstadoMicro>("parado")
  const [aFalar, setAFalar] = useState<string | null>(null) // id da mensagem a ser lida
  const [linguaOuvida, setLinguaOuvida] = useState<string | null>(null)
  const [podeOuvir, setPodeOuvir] = useState(false)
  const [podeFalar, setPodeFalar] = useState(false)
  const gravador = useRef<MediaRecorder | null>(null)
  const pedacos = useRef<Blob[]>([])
  const fluxo = useRef<MediaStream | null>(null)
  const reconhecedor = useRef<{ stop(): void } | null>(null)
  const tectoRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    setPodeOuvir("speechSynthesis" in window)
    const temGravador = typeof MediaRecorder !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia)
    const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }
    setPodeFalar(temGravador || Boolean(w.SpeechRecognition || w.webkitSpeechRecognition))
    // As vozes chegam assíncronas em alguns sistemas; pedir uma vez acorda a lista.
    window.speechSynthesis?.getVoices()
    return () => {
      window.speechSynthesis?.cancel()
      fluxo.current?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  const libertarMicro = () => {
    if (tectoRef.current) clearTimeout(tectoRef.current)
    fluxo.current?.getTracks().forEach((t) => t.stop())
    fluxo.current = null
  }

  const enviarAudio = useCallback(
    async (blob: Blob) => {
      setEstado("a-transcrever")
      try {
        const fd = new FormData()
        const ext = blob.type.includes("mp4") || blob.type.includes("m4a") || blob.type.includes("aac") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm"
        fd.append("audio", blob, `voz.${ext}`)
        const r = await fetch("/api/mentor/voz", { method: "POST", body: fd })
        const j = (await r.json().catch(() => ({}))) as { texto?: string; lingua?: string; vazio?: boolean }
        if (r.ok && j.texto) {
          setLinguaOuvida(codigoDaLingua(j.lingua))
          aoTranscrever(j.texto)
        } else aoErro(j.vazio ? "amB.mentor.voz.vazio" : "amB.mentor.voz.falhou")
      } catch {
        aoErro("amB.mentor.voz.falhou")
      } finally {
        setEstado("parado")
      }
    },
    [aoTranscrever, aoErro]
  )

  /** Plano B: Web Speech API (só onde o MediaRecorder não existe). */
  const ouvirComWebSpeech = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: new () => any; webkitSpeechRecognition?: new () => any }
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) return aoErro("amB.mentor.voz.semMicro")
    const rec = new SR()
    rec.lang = BCP47[lang] ?? lang
    rec.interimResults = false
    rec.maxAlternatives = 1
    rec.onresult = (e: any) => {
      const texto = String(e.results?.[0]?.[0]?.transcript ?? "").trim()
      if (texto) aoTranscrever(texto)
      else aoErro("amB.mentor.voz.vazio")
    }
    rec.onerror = () => aoErro("amB.mentor.voz.semMicro")
    rec.onend = () => setEstado("parado")
    reconhecedor.current = rec
    setEstado("a-ouvir")
    rec.start()
  }, [lang, aoTranscrever, aoErro])

  const comecar = useCallback(async () => {
    window.speechSynthesis?.cancel()
    setAFalar(null)
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) return ouvirComWebSpeech()
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      fluxo.current = s
      const tipo = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm", "audio/ogg"].find((t) => MediaRecorder.isTypeSupported?.(t))
      const g = tipo ? new MediaRecorder(s, { mimeType: tipo }) : new MediaRecorder(s)
      pedacos.current = []
      g.ondataavailable = (e) => e.data.size && pedacos.current.push(e.data)
      g.onstop = () => {
        libertarMicro()
        const blob = new Blob(pedacos.current, { type: g.mimeType || tipo || "audio/webm" })
        if (blob.size < 1200) {
          setEstado("parado")
          return aoErro("amB.mentor.voz.vazio")
        }
        void enviarAudio(blob)
      }
      gravador.current = g
      g.start()
      setEstado("a-ouvir")
      // Tecto de 90 s: uma mensagem falada não precisa de mais, e protege a quota grátis.
      tectoRef.current = setTimeout(() => g.state === "recording" && g.stop(), 90_000)
    } catch {
      libertarMicro()
      setEstado("parado")
      aoErro("amB.mentor.voz.semMicro")
    }
  }, [ouvirComWebSpeech, enviarAudio, aoErro])

  const parar = useCallback(() => {
    if (gravador.current?.state === "recording") gravador.current.stop()
    else if (reconhecedor.current) reconhecedor.current.stop()
  }, [])

  const alternarMicro = useCallback(() => {
    if (estado === "a-ouvir") parar()
    else if (estado === "parado") void comecar()
  }, [estado, parar, comecar])

  const falar = useCallback(
    (id: string, texto: string) => {
      if (!("speechSynthesis" in window)) return
      const sint = window.speechSynthesis
      sint.cancel()
      if (aFalar === id) {
        setAFalar(null)
        return
      }
      const limpo = textoParaFalar(texto)
      if (!limpo) return
      const bcp = BCP47[linguaOuvida ?? lang] ?? BCP47[lang] ?? "pt-PT"
      const voz = escolherVoz(bcp)
      const lista = partes(limpo)
      setAFalar(id)
      lista.forEach((frase, i) => {
        const u = new SpeechSynthesisUtterance(frase)
        u.lang = voz?.lang ?? bcp
        if (voz) u.voice = voz
        u.rate = 1.02
        if (i === lista.length - 1) {
          u.onend = () => setAFalar((x) => (x === id ? null : x))
          u.onerror = () => setAFalar((x) => (x === id ? null : x))
        }
        sint.speak(u)
      })
    },
    [aFalar, lang, linguaOuvida]
  )

  const calar = useCallback(() => {
    window.speechSynthesis?.cancel()
    setAFalar(null)
  }, [])

  return { estado, alternarMicro, podeFalar, podeOuvir, falar, calar, aFalar }
}
