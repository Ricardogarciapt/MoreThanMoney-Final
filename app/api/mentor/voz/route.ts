/**
 * VOZ → TEXTO para o Mentor (19/11/2026). O membro fala, o áudio vem do telemóvel/browser e sai
 * daqui como texto — em qualquer língua (o Whisper detecta-a sozinho).
 *
 *  · Grátis: Groq Whisper. Roda entre modelos (turbo → large-v3) e entre chaves (`GROQ_API_KEY` +
 *    `GROQ_API_KEYS`), porque o tecto grátis é por modelo e por conta.
 *  · O áudio NÃO se guarda: passa, vira texto e desaparece (RGPD). Só a mensagem escrita entra na
 *    conversa, como se o membro a tivesse teclado.
 *  · Se nada responder, devolve 503 com `usarDitado: true` — o ecrã sugere o ditado do teclado do
 *    telemóvel, que é nativo e grátis.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"
import { chavesDe } from "@/lib/ia/prioridade"

export const runtime = "nodejs"
export const maxDuration = 60

const MAX_BYTES = 15 * 1024 * 1024 // ~2 min de áudio comprimido chegam e sobram
const MODELOS = [process.env.GROQ_WHISPER_MODEL?.trim(), "whisper-large-v3-turbo", "whisper-large-v3"].filter(
  (m, i, a): m is string => Boolean(m) && a.indexOf(m) === i
)
/** Vocabulário da casa: ajuda o Whisper a escrever bem os nomes que mais se dizem. */
const VOCABULARIO = "MoreThanMoney, MTM, Mentor, trading, PU Prime, GoldKiller, scanner, forex, XAUUSD, MTM Funded, Premium."

async function sessaoValida() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) => cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)),
    },
  })
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return Boolean(session)
}

export async function POST(request: NextRequest) {
  if (!(await sessaoValida())) return NextResponse.json({ error: "Não autenticado" }, { status: 401 })

  const chaves = chavesDe("GROQ")
  if (!chaves.length) return NextResponse.json({ error: "Voz indisponível.", usarDitado: true }, { status: 503 })

  let audio: File | null = null
  try {
    const f = (await request.formData()).get("audio")
    audio = f instanceof File ? f : null
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 })
  }
  if (!audio || audio.size === 0) return NextResponse.json({ error: "Não chegou áudio." }, { status: 400 })
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "Gravação demasiado longa." }, { status: 413 })

  const nome = audio.name || (audio.type.includes("mp4") || audio.type.includes("m4a") ? "voz.m4a" : "voz.webm")
  const bytes = await audio.arrayBuffer()

  for (const chave of chaves) {
    for (const modelo of MODELOS) {
      const envio = new FormData()
      envio.append("file", new Blob([bytes], { type: audio.type || "audio/webm" }), nome)
      envio.append("model", modelo)
      envio.append("response_format", "verbose_json")
      envio.append("temperature", "0")
      envio.append("prompt", VOCABULARIO)
      try {
        const r = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${chave}` },
          body: envio,
          signal: AbortSignal.timeout(30_000),
        })
        if (r.ok) {
          const j = (await r.json()) as { text?: string; language?: string }
          const texto = (j.text ?? "").trim()
          if (!texto) return NextResponse.json({ error: "Não se ouviu nada.", vazio: true }, { status: 422 })
          return NextResponse.json({ texto, lingua: j.language ?? null })
        }
        const corpo = (await r.text()).slice(0, 200)
        console.warn("[mentor/voz]", modelo, r.status, corpo)
        // 400 = áudio estragado/formato: trocar de modelo não cura.
        if (r.status === 400 && !/rate|quota|limit|model/i.test(corpo)) {
          return NextResponse.json({ error: "Não consegui ler esta gravação. Tenta outra vez." }, { status: 422 })
        }
        if (r.status === 401 || r.status === 403) break // chave má → próxima chave
      } catch (e) {
        console.warn("[mentor/voz]", modelo, e instanceof Error ? e.message : e)
      }
    }
  }
  return NextResponse.json({ error: "Voz indisponível neste momento.", usarDitado: true }, { status: 503 })
}
