"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, RefreshCw, MessageSquare, ExternalLink, Search, Bot, User } from "lucide-react"

/**
 * As conversas que o bot do Telegram está a ter, do lado de dentro.
 *
 * O bot responde sozinho no VPS e ninguém lia o que ele dizia. Isso não é um detalhe de conforto:
 * foi ao abrir uma destas conversas que se descobriu o bot a afirmar «675 trades com 63% e
 * +7.060€ documentados» a um lead — um número congelado a 30/06 e proibido desde 26/08. Um
 * vendedor que ninguém ouve diz o que lhe apetecer.
 */

interface Resumo {
  chatId: string
  quem: string
  etapa: string | null
  interesse: string | null
  origem: string | null
  mensagens: number
  ultimoDe: "bot" | "pessoa"
  ultimoTexto: string
  validado: boolean
  quando: string
}

interface Turno { role?: string; text?: string }

interface Detalhe {
  chat_id: string
  username: string | null
  first_name: string | null
  stage: string | null
  interesse: string | null
  source: string | null
  lang: string | null
  message_count: number | null
  history: Turno[] | null
  broker_uid: string | null
  coupon_code: string | null
  granted_at: string | null
  mtmauto_passo: string | null
  created_at: string
  updated_at: string
}

const ETAPA_ROTULO: Record<string, string> = {
  qualifying: "A qualificar",
  granted: "Validado",
  pending_proof: "À espera do comprovativo",
  new: "Nova",
}

function quando(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 3600) return `há ${Math.round(s / 60)} min`
  if (s < 86400) return `há ${Math.round(s / 3600)} h`
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short" })
}

export function ConversasBot() {
  const [lista, setLista] = useState<Resumo[]>([])
  const [aberta, setAberta] = useState<Detalhe | null>(null)
  const [aLer, setALer] = useState(true)
  const [aAbrir, setAAbrir] = useState(false)
  const [procura, setProcura] = useState("")
  const [bot, setBot] = useState("@MoreThanMoney_aibot")

  const buscar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch(`/api/admin/social/conversas?q=${encodeURIComponent(procura)}`, { cache: "no-store" })
      const j = await r.json()
      setLista(j.conversas ?? [])
      if (j.bot) setBot(j.bot)
    } catch {
      /* a aba continua utilizável; o refrescar volta a tentar */
    } finally {
      setALer(false)
    }
  }, [procura])

  useEffect(() => { buscar() }, [buscar])

  const abrir = async (chatId: string) => {
    setAAbrir(true)
    try {
      const r = await fetch(`/api/admin/social/conversas?chat=${encodeURIComponent(chatId)}`, { cache: "no-store" })
      const j = await r.json()
      if (j.conversa) setAberta(j.conversa)
    } finally {
      setAAbrir(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-neutral-100">
            <MessageSquare className="h-5 w-5" /> Conversas do bot
          </h2>
          <p className="mt-0.5 text-sm text-neutral-400">
            O que o <span className="font-mono text-neutral-300">{bot}</span> anda a dizer às
            pessoas, em privado. Só de leitura — responder é no Telegram.
          </p>
        </div>
        <button
          onClick={buscar}
          disabled={aLer}
          className="flex items-center gap-2 rounded-lg border border-neutral-700 px-3 py-2 text-sm text-neutral-200 transition hover:bg-neutral-800 disabled:opacity-50"
        >
          {aLer ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <input
          value={procura}
          onChange={(e) => setProcura(e.target.value)}
          placeholder="Procurar por nome, etapa ou pelo que foi dito…"
          className="w-full rounded-lg border border-neutral-700 bg-neutral-900 py-2 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-neutral-500"
        />
      </div>

      {aLer && !lista.length ? (
        <p className="flex items-center gap-2 py-10 text-sm text-neutral-400">
          <Loader2 className="h-4 w-4 animate-spin" /> A ler as conversas…
        </p>
      ) : !lista.length ? (
        <p className="py-10 text-center text-sm text-neutral-400">
          {procura ? "Nada que corresponda a essa procura." : "O bot ainda não teve conversas."}
        </p>
      ) : (
        <div className="grid gap-2">
          {lista.map((c) => (
            <button
              key={c.chatId}
              onClick={() => abrir(c.chatId)}
              className="rounded-lg border border-neutral-800 bg-neutral-900/60 p-3 text-left transition hover:border-neutral-600"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-neutral-100">{c.quem}</span>
                {c.etapa && (
                  <span className="rounded-full border border-neutral-700 px-2 py-0.5 text-[11px] text-neutral-300">
                    {ETAPA_ROTULO[c.etapa] ?? c.etapa}
                  </span>
                )}
                {c.validado && (
                  <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-400">
                    validado
                  </span>
                )}
                {c.interesse && (
                  <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-400">
                    {c.interesse}
                  </span>
                )}
                <span className="ml-auto text-[11px] text-neutral-500">
                  {c.mensagens} msg · {quando(c.quando)}
                </span>
              </div>
              {/* Quem falou por último diz se a bola está do nosso lado. */}
              <p className="mt-1.5 line-clamp-2 text-sm text-neutral-400">
                <span className={c.ultimoDe === "bot" ? "text-neutral-500" : "text-neutral-300"}>
                  {c.ultimoDe === "bot" ? "Bot: " : "Pessoa: "}
                </span>
                {c.ultimoTexto || "—"}
              </p>
            </button>
          ))}
        </div>
      )}

      {(aberta || aAbrir) && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
          onClick={() => setAberta(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-2xl border border-neutral-800 bg-neutral-950 sm:rounded-2xl"
          >
            {aAbrir && !aberta ? (
              <p className="flex items-center gap-2 p-6 text-sm text-neutral-400">
                <Loader2 className="h-4 w-4 animate-spin" /> A abrir…
              </p>
            ) : aberta ? (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-neutral-800 p-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-100">
                      {aberta.username ? `@${aberta.username}` : aberta.first_name || `#${aberta.chat_id}`}
                    </p>
                    <p className="mt-0.5 text-xs text-neutral-400">
                      {[
                        ETAPA_ROTULO[aberta.stage ?? ""] ?? aberta.stage,
                        aberta.interesse,
                        aberta.source && `via ${aberta.source}`,
                        aberta.lang,
                        aberta.broker_uid && `UID ${aberta.broker_uid}`,
                        aberta.coupon_code,
                      ].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <a
                      href={`https://t.me/${aberta.username ?? ""}`}
                      target="_blank"
                      rel="noreferrer"
                      className={`flex items-center gap-1 rounded-lg border border-neutral-700 px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 ${
                        aberta.username ? "" : "pointer-events-none opacity-40"
                      }`}
                    >
                      <ExternalLink className="h-3.5 w-3.5" /> Telegram
                    </a>
                    <button onClick={() => setAberta(null)} className="px-2 text-lg text-neutral-400">×</button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                  {(aberta.history ?? []).length === 0 && (
                    <p className="py-8 text-center text-sm text-neutral-500">Sem mensagens guardadas.</p>
                  )}
                  {(aberta.history ?? []).map((t, i) => {
                    const doBot = t.role === "assistant"
                    return (
                      <div key={i} className={`flex gap-2 ${doBot ? "" : "flex-row-reverse"}`}>
                        <span
                          className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full ${
                            doBot ? "bg-neutral-800 text-neutral-400" : "bg-amber-500/15 text-amber-400"
                          }`}
                        >
                          {doBot ? <Bot className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
                        </span>
                        <p
                          className={`max-w-[80%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${
                            doBot
                              ? "bg-neutral-900 text-neutral-200"
                              : "bg-amber-500/10 text-neutral-100"
                          }`}
                        >
                          {t.text}
                        </p>
                      </div>
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
