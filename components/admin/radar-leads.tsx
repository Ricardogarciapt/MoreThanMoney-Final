"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, ExternalLink, Radar } from "lucide-react"

/**
 * O radar: as conversas do nicho por onde vale a pena entrar hoje.
 *
 * Encontrar é automático; comentar é teu. Não é preguiça do sistema — a API do Instagram não
 * deixa comentar em posts de terceiros, e fazê-lo por fora (a conduzir a app como se fosse uma
 * pessoa) é o caminho mais rápido para a conta ser banida. O que desaparece aqui é a hora de
 * PROCURAR, que é onde ela se perdia.
 */

interface Prospeto {
  id: string
  hashtag: string
  permalink: string | null
  legenda: string
  gostos: number
  comentarios: number
  pontuacao: number
  porque: string
}

export function RadarLeads() {
  const [prospetos, setProspetos] = useState<Prospeto[]>([])
  const [quota, setQuota] = useState<{ gastas: number; limite: number } | null>(null)
  const [aLer, setALer] = useState(true)
  const [aCorrer, setACorrer] = useState(false)

  const buscar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch("/api/admin/social/radar", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) {
        setProspetos(j.prospetos as Prospeto[])
        setQuota(j.quota)
      }
    } catch { /* o painel fica como está */ }
    setALer(false)
  }, [])

  useEffect(() => { void buscar() }, [buscar])

  const marcar = async (id: string, estado: string) => {
    setProspetos((p) => p.filter((x) => x.id !== id))
    await fetch("/api/admin/social/radar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, estado }),
    }).catch(() => {})
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-neutral-100">
            <Radar className="h-4 w-4" /> Radar de leads
          </h2>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            Corre sozinho de meia em meia hora, das 9h às 17h. A IA escreve o comentário; colar e publicar
            é contigo — a Graph API não tem endpoint para comentar em posts de terceiros, e fazê-lo
            por fora (conduzir a app como uma pessoa) é o caminho mais curto para a conta ser banida.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {quota && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] ${
                quota.gastas >= quota.limite - 3 ? "bg-amber-950 text-amber-300" : "bg-neutral-100 text-neutral-400"
              }`}
              title="O Instagram só deixa procurar 30 hashtags diferentes em cada 7 dias"
            >
              {quota.gastas}/{quota.limite} hashtags esta semana
            </span>
          )}
          <button
            onClick={async () => {
              setACorrer(true)
              await fetch("/api/admin/social/radar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ correr: true }),
              }).catch(() => {})
              await buscar()
              setACorrer(false)
            }}
            disabled={aCorrer}
            className="rounded-lg border px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            {aCorrer ? "A procurar…" : "Procurar agora"}
          </button>
          <button onClick={() => void buscar()} disabled={aLer} className="rounded-lg border p-1.5 hover:bg-neutral-800">
            {aLer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {!aLer && !prospetos.length && (
        <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-400">
          Nada por ver. O radar volta a passar dentro de meia hora, ou carrega em "Procurar agora".
        </p>
      )}

      <div className="space-y-2">
        {prospetos.map((p) => (
          <div key={p.id} className="rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              {/* A pontuação primeiro: é a ordem por que a lista existe. */}
              <span
                className={`rounded px-1.5 py-0.5 font-bold ${
                  p.pontuacao >= 70 ? "bg-emerald-950 text-emerald-300" : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {p.pontuacao}
              </span>
              <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-neutral-400">#{p.hashtag}</span>
              <span className="text-neutral-400">{p.comentarios} comentários · {p.gostos} gostos</span>
              <span className="text-neutral-400">— {p.porque}</span>
            </div>

            <p className="mt-1.5 line-clamp-3 text-[12.5px] leading-snug text-neutral-200">{p.legenda}</p>

            {/* O comentário escrito. O trabalho nunca foi carregar em "publicar" — era olhar
                para o post e encontrar a frase que abre conversa sem parecer anúncio. */}
            {comentarios[p.id] && (
              <div className="mt-2 rounded-lg border border-emerald-900 bg-emerald-950/40 p-2">
                <p className="text-[12.5px] leading-snug text-emerald-100">{comentarios[p.id]}</p>
                <button
                  onClick={() => {
                    void navigator.clipboard.writeText(comentarios[p.id])
                    setCopiado(p.id)
                    setTimeout(() => setCopiado(null), 2000)
                  }}
                  className="mt-1.5 rounded border border-emerald-800 px-2 py-0.5 text-[11px] text-emerald-300 hover:bg-emerald-900/50"
                >
                  {copiado === p.id ? "copiado ✓" : "copiar"}
                </button>
              </div>
            )}

            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={async () => {
                  setAEscrever(p.id)
                  try {
                    const r = await fetch("/api/admin/social/radar", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: p.id, comentar: true }),
                    })
                    const j = await r.json()
                    if (j.ok) setComentarios((c) => ({ ...c, [p.id]: j.comentario }))
                  } catch { /* fica sem comentário; o post abre na mesma */ }
                  setAEscrever(null)
                }}
                disabled={aEscrever === p.id}
                className="inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-black hover:bg-amber-400 disabled:opacity-40"
              >
                {aEscrever === p.id ? "A escrever…" : comentarios[p.id] ? "Outro" : "Escrever comentário"}
              </button>
              {p.permalink && (
                <a
                  href={p.permalink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => {
                    if (comentarios[p.id]) void navigator.clipboard.writeText(comentarios[p.id])
                    void marcar(p.id, "usado")
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-neutral-700 px-3 py-1 text-xs font-semibold text-neutral-100 hover:bg-neutral-800"
                >
                  {comentarios[p.id] ? "Copiar e abrir" : "Abrir"} <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <button onClick={() => void marcar(p.id, "ignorado")} className="rounded-lg border border-neutral-800 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800">
                Não serve
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
