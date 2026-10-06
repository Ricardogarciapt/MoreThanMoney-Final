"use client"

import { useCallback, useEffect, useMemo, useState } from "react"

/**
 * Painel «Prospeção B2B» — prospectos por estado, respostas, envios e o botão de excluir.
 * Excluir grava na exclusão GLOBAL (não se desfaz): a MTM não volta a escrever a esse endereço.
 */
type Prospecto = {
  id: string
  empresa: string
  site: string | null
  segmento: string
  pais: string
  email: string
  fonte_url: string
  pessoa_colectiva: boolean
  estado: string
  toques: number
  ultimo_toque_em: string | null
  respondeu_em: string | null
  nota: string | null
}
type Envio = { id: string; email: string; toque: number; assunto: string | null; decisao: string; motivo: string; enviado_em: string | null; erro: string | null; criado_em: string }
type Dados = {
  config: { ligado: boolean; tecto_dia: number; intervalo_seg: number; primeiro_lote: number }
  enviados: { hoje: number; sempre: number }
  porEstado: Record<string, number>
  porSegmento: Record<string, number>
  prospectos: Prospecto[]
  envios: Envio[]
}

const ESTADOS = ["novo", "contactado", "respondeu", "reuniao", "fechado", "excluido"] as const
const NOME: Record<string, string> = {
  novo: "Novos", contactado: "Contactados", respondeu: "Responderam", reuniao: "Reunião", fechado: "Fechados", excluido: "Excluídos",
  ib_afiliado: "IB / afiliado", comunidade: "Comunidade", criador: "Criador", escola: "Escola", prop_firm: "Prop firm",
}
const card = "rounded-xl border border-neutral-800 bg-neutral-900/60 p-4"
const btn = "rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40"

export function B2BProspeccaoPanel() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<string>("todos")
  const [ocupado, setOcupado] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/b2b", { cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "erro")
      setD(j)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : "erro a carregar")
    }
  }, [])

  useEffect(() => { carregar() }, [carregar])

  const acao = useCallback(async (corpo: Record<string, unknown>, chave: string) => {
    setOcupado(chave)
    try {
      const r = await fetch("/api/admin/b2b", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.error || "falhou")
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falhou")
    } finally {
      setOcupado(null)
    }
  }, [carregar])

  const lista = useMemo(() => (d?.prospectos ?? []).filter((p) => filtro === "todos" || p.estado === filtro), [d, filtro])

  return (
    <div className={card}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-[#E9C46A]">Prospeção B2B</h2>
          <p className="text-xs text-neutral-400">Email profissional de empresas · base legal «b2b_pessoa_colectiva» · quem sai entra na exclusão global</p>
        </div>
        {d && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-neutral-400">Hoje {d.enviados.hoje}/{d.config.tecto_dia}</span>
            <button
              className={`${btn} ${d.config.ligado ? "bg-emerald-700 hover:bg-emerald-600" : "bg-neutral-700 hover:bg-neutral-600"}`}
              disabled={ocupado === "cfg"}
              onClick={() => {
                if (d.config.ligado || confirm("Ligar o envio B2B automático? Sai no máximo o tecto do dia.")) acao({ action: "config", ligado: !d.config.ligado }, "cfg")
              }}
            >
              Envio {d.config.ligado ? "LIGADO" : "desligado"}
            </button>
          </div>
        )}
      </div>

      {erro && <p className="mb-2 text-sm text-red-400">{erro}</p>}
      {!d && !erro && <p className="text-sm text-neutral-400">A carregar…</p>}

      {d && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ESTADOS.map((e) => (
              <button
                key={e}
                onClick={() => setFiltro(filtro === e ? "todos" : e)}
                className={`rounded-lg border p-2 text-left ${filtro === e ? "border-[#D2A63C]" : "border-neutral-800"}`}
              >
                <div className="text-xl font-bold tabular-nums">{d.porEstado[e] ?? 0}</div>
                <div className="text-[11px] text-neutral-400">{NOME[e]}</div>
              </button>
            ))}
          </div>

          <div className="max-h-[420px] overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-neutral-900 text-neutral-400">
                <tr>
                  <th className="p-2">Empresa</th>
                  <th className="p-2">Segmento</th>
                  <th className="p-2">Email · origem</th>
                  <th className="p-2">Estado</th>
                  <th className="p-2">Toques</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {lista.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-800 align-top">
                    <td className="p-2">
                      <div className="font-semibold">{p.empresa}</div>
                      <div className="text-neutral-500">{p.pais}{p.pessoa_colectiva ? "" : " · pessoa colectiva por confirmar"}</div>
                    </td>
                    <td className="p-2">{NOME[p.segmento] ?? p.segmento}</td>
                    <td className="p-2 break-all">
                      <div>{p.email}</div>
                      <a className="text-[#D2A63C] underline" href={p.fonte_url} target="_blank" rel="noreferrer noopener">origem</a>
                    </td>
                    <td className="p-2">{NOME[p.estado] ?? p.estado}{p.nota ? <div className="text-neutral-500">{p.nota}</div> : null}</td>
                    <td className="p-2 tabular-nums">{p.toques}/3</td>
                    <td className="p-2">
                      {p.estado !== "excluido" && (
                        <div className="flex flex-wrap gap-1">
                          {!p.pessoa_colectiva && (
                            <button className={`${btn} bg-neutral-700 hover:bg-neutral-600`} disabled={!!ocupado} onClick={() => acao({ action: "confirmar_pc", id: p.id, valor: true }, p.id)}>
                              É empresa
                            </button>
                          )}
                          {p.estado === "contactado" && (
                            <button className={`${btn} bg-sky-800 hover:bg-sky-700`} disabled={!!ocupado} onClick={() => acao({ action: "estado", id: p.id, estado: "respondeu" }, p.id)}>
                              Respondeu
                            </button>
                          )}
                          {p.estado === "respondeu" && (
                            <button className={`${btn} bg-amber-800 hover:bg-amber-700`} disabled={!!ocupado} onClick={() => acao({ action: "estado", id: p.id, estado: "reuniao" }, p.id)}>
                              Reunião
                            </button>
                          )}
                          {p.estado === "reuniao" && (
                            <button className={`${btn} bg-emerald-800 hover:bg-emerald-700`} disabled={!!ocupado} onClick={() => acao({ action: "estado", id: p.id, estado: "fechado" }, p.id)}>
                              Fechado
                            </button>
                          )}
                          <button
                            className={`${btn} bg-red-900/70 hover:bg-red-800`}
                            disabled={!!ocupado}
                            onClick={() => { if (confirm(`Excluir ${p.email} para sempre? A MTM não volta a escrever-lhe.`)) acao({ action: "excluir", id: p.id }, p.id) }}
                          >
                            Excluir
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {!lista.length && (
                  <tr><td colSpan={6} className="p-3 text-neutral-500">Sem prospectos neste estado.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {d.envios.length > 0 && (
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-neutral-300">Últimos envios ({d.envios.length})</summary>
              <ul className="mt-2 space-y-1 text-xs text-neutral-400">
                {d.envios.map((e) => (
                  <li key={e.id}>
                    {new Date(e.criado_em).toLocaleString("pt-PT")} · {e.email} · toque {e.toque} · <b className={e.decisao === "sai" ? "text-emerald-400" : "text-amber-400"}>{e.decisao}</b> · {e.motivo}{e.erro ? ` · ${e.erro}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
