"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"

/**
 * MTM Auto ↔ MTM Copy: quem está nos dois, e onde a mesma conta está ligada duas vezes.
 *
 * O aviso vermelho é a razão de isto existir. Um login MT5 ligado nos dois sistemas leva dois
 * dimensionamentos de risco independentes na mesma conta — a pessoa escolheu 1% e pode estar a
 * arriscar 2% sem nunca ter pedido isso a ninguém.
 */
type Pessoa = {
  userId: string
  email: string | null
  nome: string | null
  nivel: string
  auto: { login: string | null; rotulo: string | null; estado: string; copiaAtiva: boolean; demo: boolean }[]
  copy: { login: string | null; rotulo: string | null; metodo: string; ativo: boolean; proposito: string | null }[]
  repetidos: string[]
}

export default function MtmcopySinergia() {
  const [dados, setDados] = useState<{ pessoas: Pessoa[]; resumo: Record<string, number> } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)

  const carregar = useCallback(async () => {
    setALer(true)
    try {
      const r = await fetch("/api/admin/mtmcopy/sinergia", { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "erro")
      setDados(j)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "não foi possível ler")
    } finally {
      setALer(false)
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-zinc-500">
          As contas do MTM Auto e as ligações do MTM Copy, lado a lado, por pessoa.
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

      {dados && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { r: "Nos dois", v: dados.resumo.nosDois },
              { r: "Só MTM Auto", v: dados.resumo.soAuto },
              { r: "Só MTM Copy", v: dados.resumo.soCopy },
              { r: "Login repetido", v: dados.resumo.comLoginRepetido },
            ].map((c) => (
              <div key={c.r} className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <p className={`text-xl font-bold tabular-nums ${c.r === "Login repetido" && c.v > 0 ? "text-red-400" : "text-white"}`}>
                  {c.v}
                </p>
                <p className="text-[11px] text-zinc-500">{c.r}</p>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            {dados.pessoas.slice(0, 60).map((p) => (
              <div
                key={p.userId}
                className="rounded-lg border p-3"
                style={{ borderColor: p.repetidos.length ? "rgb(127,29,29)" : "rgb(39,39,42)" }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-white">{p.nome || p.email || p.userId.slice(0, 8)}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10.5px] text-zinc-400">{p.nivel}</span>
                  {p.repetidos.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-1.5 py-0.5 text-[10.5px] text-red-400">
                      <AlertTriangle className="h-3 w-3" /> mesmo login nos dois: {p.repetidos.join(", ")}
                    </span>
                  )}
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wider text-zinc-600">MTM Auto</p>
                    {p.auto.length ? (
                      p.auto.map((c, i) => (
                        <p key={i} className="text-[12px] text-zinc-300">
                          {c.rotulo || "conta"} · {c.login ?? "—"} · {c.estado}
                          {c.demo ? " · demo" : ""}
                          {c.copiaAtiva ? " · cópia ligada" : ""}
                        </p>
                      ))
                    ) : (
                      <p className="text-[12px] text-zinc-600">—</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[10.5px] uppercase tracking-wider text-zinc-600">MTM Copy</p>
                    {p.copy.length ? (
                      p.copy.map((c, i) => (
                        <p key={i} className="text-[12px] text-zinc-300">
                          {c.rotulo || "ligação"} · {c.login ?? "—"} · {c.metodo}
                          {c.ativo ? "" : " · parada"}
                          {c.proposito === "tap_to_trade" ? " · T2T" : ""}
                        </p>
                      ))
                    ) : (
                      <p className="text-[12px] text-zinc-600">—</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
