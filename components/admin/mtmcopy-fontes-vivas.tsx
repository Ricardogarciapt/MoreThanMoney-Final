"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react"

/**
 * As fontes, como estão AGORA.
 *
 * O painel listava estratégias a partir do que o código declarava. Isso escondeu durante semanas
 * que metade das contas provider tinha sido apagada na MetaApi: a estratégia aparecia, o
 * interruptor ligava, e o sinal não chegava a lado nenhum. Aqui cada linha é uma pergunta feita
 * à MetaApi no momento em que o painel abre — se a conta não existe, diz-se que não existe.
 */
type Fonte = {
  id: string
  label: string
  estrategia: string | null
  contaId: string
  existe: boolean
  nome: string | null
  login: string | null
  servidor: string | null
  estado: string | null
  ligacao: string | null
  motor: boolean
  copiadores: number
  tapToTrade: boolean
  origem: string
}

type PrimeVerse = {
  modo: string
  traders: string[]
  contaId: string
  nome: string | null
  login: string | null
  servidor: string | null
  ligacao: string | null
  existe: boolean
  riscoPct: number
  lote: number
  bybit: boolean
}

export default function MtmcopyFontesVivas() {
  const [primeverse, setPrimeverse] = useState<PrimeVerse | null>(null)
  const [fontes, setFontes] = useState<Fonte[] | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)

  const carregar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch("/api/admin/mtmcopy/fontes-vivas", { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "erro")
      setFontes(j.fontes)
      setPrimeverse(j.primeverse ?? null)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível ler as fontes")
    } finally {
      setALer(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-zinc-500">
          Lido da MetaApi agora — conta, ligação, quem copia, e se o motor de preço corre nela.
        </p>
        <button
          onClick={carregar}
          disabled={aLer}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-700 px-2.5 py-1 text-xs text-zinc-300 disabled:opacity-40"
        >
          <RefreshCw className={`h-3 w-3 ${aLer ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {erro && <p className="rounded-lg border border-red-900 bg-red-950/40 p-3 text-sm text-red-300">{erro}</p>}

      {!fontes ? (
        <p className="py-6 text-center text-sm text-zinc-500">A ler…</p>
      ) : (
        <div className="space-y-2">
          {fontes.map((f) => {
            const viva = f.existe && f.ligacao === "CONNECTED"
            return (
              <div
                key={f.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border p-3"
                style={{ borderColor: viva ? "rgb(39,39,42)" : "rgb(127,29,29)" }}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  {viva ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
                  )}
                  {f.label}
                </span>

                <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                  {f.estrategia ?? "sem estratégia"}
                </span>

                <span className="text-[12px] text-zinc-400">
                  {f.existe
                    ? `${f.login ?? "—"} · ${f.servidor ?? "—"}`
                    : "conta NÃO existe na MetaApi (404)"}
                </span>

                {f.existe && (
                  <span className="text-[12px] text-zinc-500">
                    {f.estado ?? "?"} · {f.ligacao ?? "?"}
                  </span>
                )}

                <span className="text-[12px] text-zinc-400">{f.copiadores} a copiar</span>

                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] ${
                    f.motor ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                  }`}
                  title={f.motor ? "Parciais, break-even e trailing são geridos por nós" : "Gestão feita na própria fonte"}
                >
                  {f.motor ? "motor de preço" : "gerido na fonte"}
                </span>

                {f.tapToTrade && (
                  <span className="rounded bg-[#D2A63C]/10 px-1.5 py-0.5 text-[11px] text-[#D2A63C]">Tap to Trade</span>
                )}
                <span className="text-[11px] text-zinc-600">origem: {f.origem}</span>
              </div>
            )
          })}

          {/* O PrimeVerse chega por execução DIRETA, sem CopyFactory. Sem esta linha, a conta que
              o recebe parecia uma ligação partida — subscrita a uma estratégia que já não existe
              e sem nada que explicasse de onde lhe vinham as trades. */}
          {primeverse && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border border-zinc-800 p-3">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-white">
                {primeverse.ligacao === "CONNECTED" ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                )}
                PrimeVerse · traders de topo
              </span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 font-mono text-[11px] text-zinc-300">
                {primeverse.traders.join(" · ")}
              </span>
              <span className="text-[12px] text-zinc-400">
                {primeverse.nome ?? "conta"} · {primeverse.login ?? "—"} · {primeverse.servidor ?? "—"}
              </span>
              <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">execução direta</span>
              <span
                className={`rounded px-1.5 py-0.5 text-[11px] ${
                  primeverse.modo === "live" ? "bg-emerald-500/10 text-emerald-400" : "bg-zinc-800 text-zinc-500"
                }`}
              >
                {primeverse.modo}
              </span>
              <span className="text-[11px] text-zinc-600">
                {primeverse.riscoPct > 0 ? `${primeverse.riscoPct}% risco` : `lote fixo ${primeverse.lote}`}
                {primeverse.bybit ? " · BTC também na Bybit" : ""}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
