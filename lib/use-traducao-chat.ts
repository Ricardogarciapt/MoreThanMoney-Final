"use client"

/**
 * `useTraducaoChat(texto)` — devolve a mensagem/publicação no idioma de quem lê.
 *
 * Os pedidos dos vários balões de um ecrã juntam-se num lote (150 ms, até 25 textos) para
 * `/api/chat/traduzir`; a resposta fica em memória durante a sessão. Português é a língua da casa:
 * para quem lê em PT não se pede nada (quase tudo já está em PT e cada pedido gasta IA).
 */
import { useEffect, useState } from "react"
import { useI18n } from "@/components/i18n-provider"

const MAX_LOTE = 25
const MAX_CHARS = 2000

type Pendente = { texto: string; resolver: (v: string | null) => void }

const cache = new Map<string, string | null>() // `${idioma}\u0000${texto}` → tradução (null = original)
const emCurso = new Map<string, Promise<string | null>>()
const filas = new Map<string, Pendente[]>()
const temporizadores = new Map<string, ReturnType<typeof setTimeout>>()

async function enviar(idioma: string, lote: Pendente[]) {
  let traducoes: (string | null)[] = []
  try {
    const { authHeaders } = await import("@/lib/auth-token")
    const r = await fetch("/api/chat/traduzir", {
      method: "POST",
      headers: await authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ idioma, textos: lote.map((p) => p.texto) }),
    })
    if (r.ok) traducoes = ((await r.json()) as { traducoes?: (string | null)[] }).traducoes ?? []
  } catch {
    /* sem rede: fica o original */
  }
  lote.forEach((p, i) => p.resolver(traducoes[i] ?? null))
}

function despachar(idioma: string) {
  temporizadores.delete(idioma)
  const fila = filas.get(idioma) ?? []
  filas.delete(idioma)
  for (let i = 0; i < fila.length; i += MAX_LOTE) void enviar(idioma, fila.slice(i, i + MAX_LOTE))
}

function pedir(idioma: string, texto: string): Promise<string | null> {
  const chave = `${idioma}\u0000${texto}`
  const existente = emCurso.get(chave)
  if (existente) return existente
  const p = new Promise<string | null>((resolver) => {
    const fila = filas.get(idioma) ?? []
    fila.push({ texto, resolver })
    filas.set(idioma, fila)
    if (!temporizadores.has(idioma)) temporizadores.set(idioma, setTimeout(() => despachar(idioma), 150))
  }).then((v) => {
    cache.set(chave, v)
    emCurso.delete(chave)
    return v
  })
  emCurso.set(chave, p)
  return p
}

/** Só vale a pena traduzir texto com letras (não só emojis, links ou números). */
function traduzivel(texto: string): boolean {
  const semLinks = texto.replace(/https?:\/\/\S+/g, "").replace(/[@#][\w.-]+/g, "")
  return /\p{L}{3,}/u.test(semLinks) && texto.length <= MAX_CHARS
}

export function useTraducaoChat(texto: string | null | undefined): {
  texto: string
  traduzido: boolean
  verOriginal: boolean
  alternar: () => void
} {
  const { lang } = useI18n()
  const original = texto ?? ""
  const activo = lang !== "pt" && traduzivel(original)
  const chave = `${lang}\u0000${original}`
  const [traducao, setTraducao] = useState<string | null>(() => (activo ? cache.get(chave) ?? null : null))
  const [verOriginal, setVerOriginal] = useState(false)

  useEffect(() => {
    if (!activo) {
      setTraducao(null)
      return
    }
    if (cache.has(chave)) {
      setTraducao(cache.get(chave) ?? null)
      return
    }
    let vivo = true
    void pedir(lang, original).then((v) => {
      if (vivo) setTraducao(v)
    })
    return () => {
      vivo = false
    }
  }, [activo, chave, lang, original])

  const traduzido = !!traducao && !verOriginal
  return {
    texto: traduzido ? (traducao as string) : original,
    traduzido: !!traducao,
    verOriginal,
    alternar: () => setVerOriginal((v) => !v),
  }
}
