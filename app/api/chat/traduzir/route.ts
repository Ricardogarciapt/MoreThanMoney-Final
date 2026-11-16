import { NextRequest, NextResponse } from "next/server"
import { getSupabaseAdmin } from "@/lib/supabase-admin-client"
import { normalizeLang } from "@/lib/i18n/config"
import { hashTexto, traduzirLote, MAX_CHARS, MAX_TEXTOS } from "@/lib/chat-traducao"

/**
 * POST /api/chat/traduzir — { idioma, textos: string[] } → { traducoes: (string|null)[] }
 *
 * `null` = já está no idioma de quem lê (ou não foi possível traduzir): o ecrã mostra o original.
 * Só para sessões válidas (Bearer), no máximo 25 textos de 2000 caracteres por pedido. Cache em
 * `chat_traducoes`: cada texto é traduzido uma vez por idioma.
 */
export const maxDuration = 30

export async function POST(request: NextRequest) {
  const supabase = getSupabaseAdmin()
  const token = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim()
  if (!token) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  const { data: auth, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !auth?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  let body: { idioma?: unknown; textos?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }
  const idioma = normalizeLang(typeof body.idioma === "string" ? body.idioma : "")
  const textos = Array.isArray(body.textos) ? body.textos : []
  if (textos.length === 0) return NextResponse.json({ traducoes: [] })
  if (textos.length > MAX_TEXTOS || textos.some((t) => typeof t !== "string" || t.length > MAX_CHARS)) {
    return NextResponse.json({ error: "too_large" }, { status: 413 })
  }
  const lista = textos as string[]
  const hashes = lista.map(hashTexto)

  const resultado: (string | null)[] = lista.map(() => null)
  const { data: emCache } = await supabase
    .from("chat_traducoes")
    .select("hash, traducao, mesmo_idioma")
    .eq("idioma", idioma)
    .in("hash", Array.from(new Set(hashes)))
  const cache = new Map((emCache ?? []).map((r) => [r.hash as string, r]))

  const porTraduzir: number[] = []
  hashes.forEach((h, i) => {
    const c = cache.get(h)
    if (c) resultado[i] = c.mesmo_idioma ? null : (c.traducao as string)
    else if (lista[i].trim()) porTraduzir.push(i)
  })

  if (porTraduzir.length) {
    const unicos = Array.from(new Set(porTraduzir.map((i) => lista[i])))
    const traduzidos = await traduzirLote(unicos, idioma)
    const linhas: { hash: string; idioma: string; traducao: string; mesmo_idioma: boolean }[] = []
    const porTexto = new Map<string, string | null>()
    unicos.forEach((texto, k) => {
      const tr = traduzidos[k]
      if (!tr) return
      const mesmo = tr.mesmoIdioma || tr.traducao.trim() === texto.trim()
      porTexto.set(texto, mesmo ? null : tr.traducao)
      linhas.push({ hash: hashTexto(texto), idioma, traducao: tr.traducao, mesmo_idioma: mesmo })
    })
    for (const i of porTraduzir) resultado[i] = porTexto.get(lista[i]) ?? null
    if (linhas.length) {
      const { error } = await supabase.from("chat_traducoes").upsert(linhas, { onConflict: "hash,idioma" })
      if (error) console.warn("[chat/traduzir] cache não gravada:", error.message)
    }
  }

  return NextResponse.json({ traducoes: resultado })
}
