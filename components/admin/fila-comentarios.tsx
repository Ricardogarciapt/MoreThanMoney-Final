"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ExternalLink, Loader2, RefreshCw, SkipForward, Sparkles } from "lucide-react"

/**
 * Modo «Fila» do radar: o agente Prospector (AG-PROSPECTOR) deixou os comentários prontos, o dono
 * só tem de colar e publicar. Objectivo: ~10 segundos por comentário.
 *
 *   «Próximo» → copia o comentário, abre o post num separador novo, marca «aberto».
 *   Ao voltar → «Publiquei» (fica o agente, a hora e o post) ou «Saltar».
 *
 * Publicar é sempre à mão, no Instagram. Este ecrã nunca publica: a Graph API não comenta em
 * posts de terceiros e automatizar o browser põe a conta em risco.
 */

interface Item {
  id: string
  media_id: string
  permalink: string | null
  hashtag: string | null
  comentario: string
  escrito_por: string
  estado: "pronto" | "aberto"
}

interface Contadores {
  prontos: number
  publicadosHoje: number
  preparadosHoje: number
  tecto: number
  taxaResposta: number | null
  taxaMede: boolean
}

const OURO = "#D2A63C"
const OURO_CLARO = "#E9C46A"

export function FilaComentarios({ onMudou }: { onMudou?: () => void }) {
  const [itens, setItens] = useState<Item[]>([])
  const [cont, setCont] = useState<Contadores | null>(null)
  const [aLer, setALer] = useState(true)
  const [aPreparar, setAPreparar] = useState(false)
  const [aGravar, setAGravar] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const botaoPubliquei = useRef<HTMLButtonElement>(null)

  const buscar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch("/api/admin/social/fila-comentarios", { cache: "no-store" })
      const j = await r.json()
      if (j.ok) {
        setItens(j.itens as Item[])
        setCont(j.contadores as Contadores)
      }
    } catch { /* fica como está */ }
    setALer(false)
  }, [])

  useEffect(() => { void buscar() }, [buscar])

  // O item em mão: o que ficou aberto, senão o primeiro pronto.
  const atual = itens.find((i) => i.estado === "aberto") ?? itens[0] ?? null
  const aberto = atual?.estado === "aberto"

  // Ao voltar ao separador, o «Publiquei» fica com o foco: Enter e passa ao seguinte.
  useEffect(() => {
    if (!aberto) return
    const aoVoltar = () => {
      if (document.visibilityState === "visible") botaoPubliquei.current?.focus()
    }
    document.addEventListener("visibilitychange", aoVoltar)
    return () => document.removeEventListener("visibilitychange", aoVoltar)
  }, [aberto])

  const acao = async (acao: string, id?: string) => {
    const r = await fetch("/api/admin/social/fila-comentarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao, id }),
    })
    return r.json().catch(() => ({ ok: false }))
  }

  const proximo = () => {
    if (!atual?.permalink) return
    // Tudo dentro do clique: o browser só deixa copiar e abrir separadores num gesto do utilizador.
    void navigator.clipboard.writeText(atual.comentario).catch(() => setAviso("Não deu para copiar — copia à mão."))
    window.open(atual.permalink, "_blank", "noopener,noreferrer")
    setItens((l) => l.map((i) => (i.id === atual.id ? { ...i, estado: "aberto" } : i)))
    setAviso(null)
    void acao("aberto", atual.id)
  }

  const fechar = async (tipo: "publiquei" | "saltar") => {
    if (!atual) return
    setAGravar(true)
    const j = await acao(tipo, atual.id)
    setAGravar(false)
    if (!j.ok) {
      setAviso(j.erro ?? "Não gravou — tenta outra vez.")
      return
    }
    setItens((l) => l.filter((i) => i.id !== atual.id))
    setCont((c) =>
      c
        ? {
            ...c,
            prontos: Math.max(0, c.prontos - 1),
            publicadosHoje: c.publicadosHoje + (tipo === "publiquei" ? 1 : 0),
          }
        : c,
    )
    onMudou?.()
  }

  return (
    <section
      aria-labelledby="fila-titulo"
      className="rounded-xl border p-4"
      style={{ borderColor: `${OURO}55`, background: "linear-gradient(180deg, #17140c 0%, #0f0f0f 100%)" }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="fila-titulo" className="flex items-center gap-2 text-sm font-semibold" style={{ color: OURO_CLARO }}>
            <Sparkles className="h-4 w-4" aria-hidden="true" /> Fila de comentários
          </h2>
          <p className="mt-0.5 max-w-xl text-[12px] leading-relaxed text-neutral-400">
            O Prospector (AG-PROSPECTOR) escreve-os sozinho, no máximo {cont?.tecto ?? 20} por dia. Tu colas e
            publicas no Instagram, à mão — isto nunca publica por ti.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              setAPreparar(true)
              const j = await acao("preparar")
              if (j.ok && j.preparados === 0) setAviso(j.jaHoje >= (cont?.tecto ?? 20) ? "Tecto de hoje atingido." : "Não há cartões bons por tratar agora.")
              await buscar()
              setAPreparar(false)
            }}
            disabled={aPreparar}
            className="min-h-[36px] cursor-pointer rounded-lg border border-neutral-700 px-3 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
          >
            {aPreparar ? "A escrever…" : "Preparar mais"}
          </button>
          <button
            onClick={() => void buscar()}
            disabled={aLer}
            aria-label="Actualizar a fila"
            className="flex min-h-[36px] min-w-[36px] cursor-pointer items-center justify-center rounded-lg border border-neutral-700 hover:bg-neutral-800"
          >
            {aLer ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* Contadores */}
      <dl className="mt-3 grid grid-cols-3 gap-2" aria-live="polite">
        <div className="rounded-lg bg-black/40 px-3 py-2">
          <dt className="text-[11px] text-neutral-400">Prontos</dt>
          <dd className="text-xl font-semibold tabular-nums" style={{ color: OURO_CLARO }}>{cont?.prontos ?? "—"}</dd>
        </div>
        <div className="rounded-lg bg-black/40 px-3 py-2">
          <dt className="text-[11px] text-neutral-400">Publicados hoje</dt>
          <dd className="text-xl font-semibold tabular-nums text-neutral-100">{cont?.publicadosHoje ?? "—"}</dd>
        </div>
        <div className="rounded-lg bg-black/40 px-3 py-2">
          <dt className="text-[11px] text-neutral-400">Taxa de resposta</dt>
          <dd
            className="text-[12px] leading-tight text-neutral-300"
            title="Para medir era preciso ligar o post comentado a uma DM ou comentário de volta. A API de hashtags não diz quem é o autor do post, por isso essa ligação ainda não existe."
          >
            {cont?.taxaMede && cont.taxaResposta !== null ? (
              <span className="text-xl font-semibold tabular-nums text-neutral-100">{cont.taxaResposta}%</span>
            ) : (
              <span className="mt-1 inline-block">ainda não se mede</span>
            )}
          </dd>
        </div>
      </dl>

      {/* O item em mão */}
      <div className="mt-3">
        {!aLer && !atual && (
          <p className="rounded-lg border border-dashed border-neutral-700 p-4 text-center text-sm text-neutral-400">
            Fila vazia. O Prospector volta a escrever na próxima passagem do radar, ou carrega em «Preparar mais».
          </p>
        )}

        {atual && (
          <div className="rounded-lg border border-neutral-800 bg-black/30 p-3">
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
              {atual.hashtag && <span className="rounded bg-neutral-800 px-1.5 py-0.5">#{atual.hashtag}</span>}
              <span>escrito por {atual.escrito_por}</span>
              {aberto && <span style={{ color: OURO_CLARO }}>· aberto, copiado</span>}
            </div>
            <p className="mt-2 text-[15px] leading-relaxed text-neutral-100">{atual.comentario}</p>

            {!aberto ? (
              <button
                onClick={proximo}
                disabled={!atual.permalink}
                className="mt-3 flex min-h-[52px] w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-base font-semibold text-black transition-colors duration-150 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
                style={{ background: OURO, outlineColor: OURO_CLARO }}
              >
                Próximo · copiar e abrir <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : (
              <div className="mt-3 grid grid-cols-[2fr_1fr] gap-2">
                <button
                  ref={botaoPubliquei}
                  onClick={() => void fechar("publiquei")}
                  disabled={aGravar}
                  className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl text-base font-semibold text-black hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40"
                  style={{ background: OURO, outlineColor: OURO_CLARO }}
                >
                  <Check className="h-5 w-5" aria-hidden="true" /> Publiquei
                </button>
                <button
                  onClick={() => void fechar("saltar")}
                  disabled={aGravar}
                  className="flex min-h-[52px] cursor-pointer items-center justify-center gap-2 rounded-xl border border-neutral-700 text-sm text-neutral-200 hover:bg-neutral-800 disabled:opacity-40"
                >
                  <SkipForward className="h-4 w-4" aria-hidden="true" /> Saltar
                </button>
                <button
                  onClick={proximo}
                  className="col-span-2 cursor-pointer text-[11px] text-neutral-400 underline-offset-2 hover:underline"
                >
                  Abrir de novo (e copiar outra vez)
                </button>
              </div>
            )}
          </div>
        )}

        {aviso && (
          <p role="status" className="mt-2 text-[12px]" style={{ color: OURO_CLARO }}>
            {aviso}
          </p>
        )}
      </div>
    </section>
  )
}
