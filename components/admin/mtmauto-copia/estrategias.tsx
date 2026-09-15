"use client"

import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, Loader2 } from "lucide-react"
import { Aviso, BotaoRecarregar, Etiqueta, Tabela, pedirAdmin, quando, td, th, useDadosAdmin } from "./comum"

type Flag = "devia_copiar_nao_copia" | "copia_estrategia_morta" | "pausada_mas_copia" | "conta_auto_parada" | "sem_estrategia_cf"
const TEXTO_FLAG: Record<Flag, string> = {
  devia_copiar_nao_copia: "devia copiar e não copia",
  copia_estrategia_morta: "estratégia morta",
  pausada_mas_copia: "pausada mas a copiar",
  conta_auto_parada: "conta MTM Auto parada",
  sem_estrategia_cf: "sem estratégia CopyFactory",
}

interface Seguidor { plataforma: "copyfactory" | "mtmauto" | "mtmfunded"; ref: string; userId: string; conta: string; risco: string; estado: string; flags: Flag[]; reparavelSiteId?: string }
interface Linha { chave: string; nome: string; slug: string | null; strategyId: string | null; accountId: string | null; viva: boolean; seguidores: Seguidor[]; flags: Flag[] }

const NOME_PLAT = { copyfactory: "CopyFactory (MT4/MT5)", mtmauto: "MTM Auto", mtmfunded: "MTM Funded" }

/** Secção recolhível para os painéis de afinação que já existiam. */
export function Recolhivel({ titulo, descricao, children, aberto = false }: { titulo: string; descricao?: string; children: ReactNode; aberto?: boolean }) {
  const [a, setA] = useState(aberto)
  return (
    <section className="rounded-xl border border-zinc-800">
      <button type="button" onClick={() => setA(!a)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <span>
          <span className="block text-sm font-semibold text-zinc-200">{titulo}</span>
          {descricao && <span className="block text-[11px] text-zinc-500">{descricao}</span>}
        </span>
        <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${a ? "rotate-180" : ""}`} />
      </button>
      {a && <div className="border-t border-zinc-800 p-4">{children}</div>}
    </section>
  )
}

export default function EstrategiasCopia({ afinacoes }: { afinacoes?: ReactNode }) {
  const { dados, erro, aCarregar, recarregar } = useDadosAdmin<{ estrategias: Linha[]; emails: Record<string, string | null>; metaapiFalhou: boolean; lidaEm: string }>("/api/admin/mtmauto-copia/estrategias")
  const [aberta, setAberta] = useState<string | null>(null)
  const [soDivergencias, setSoDivergencias] = useState(false)
  const [seleccao, setSeleccao] = useState<Set<string>>(new Set())
  const [aSync, setASync] = useState(false)
  const [resultados, setResultados] = useState<{ id: string; ok: boolean; mensagem: string }[] | null>(null)

  const linhas = useMemo(() => (dados?.estrategias ?? []).filter((l) => !soDivergencias || l.flags.length), [dados, soDivergencias])
  const reparaveis = useMemo(() => [...new Set((dados?.estrategias ?? []).flatMap((l) => l.seguidores.map((s) => s.reparavelSiteId).filter(Boolean) as string[]))], [dados])

  const resync = async (ids: string[]) => {
    if (!ids.length) return
    if (!window.confirm(`Re-sincronizar ${ids.length} ligação(ões) na CopyFactory (activa → subscreve a config da BD; pausada → desubscreve). Cada uma é relida depois.`)) return
    setASync(true)
    const r = await pedirAdmin<{ resultados: { id: string; ok: boolean; mensagem: string }[] }>("/api/admin/mtmauto-copia/estrategias", { method: "POST", body: { ids } })
    setASync(false)
    setResultados(r.success ? r.data?.resultados ?? [] : [{ id: "—", ok: false, mensagem: r.error ?? "falhou" }])
    setSeleccao(new Set())
    void recarregar()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-zinc-400"><input type="checkbox" checked={soDivergencias} onChange={(e) => setSoDivergencias(e.target.checked)} /> só com divergências</label>
        <button type="button" disabled={aSync || !reparaveis.length} onClick={() => resync(reparaveis)} className="rounded-lg border border-[#D2A63C]/40 px-3 py-1.5 text-xs text-[#D2A63C] hover:bg-[#D2A63C]/10 disabled:opacity-40">
          {aSync ? <Loader2 className="inline h-3.5 w-3.5 animate-spin" /> : null} Re-sync de todas as divergentes ({reparaveis.length})
        </button>
        {seleccao.size > 0 && (
          <button type="button" disabled={aSync} onClick={() => resync([...seleccao])} className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 hover:bg-zinc-800">Re-sync seleccionadas ({seleccao.size})</button>
        )}
        <div className="ml-auto flex items-center gap-2">
          {dados && <span className="text-[11px] text-zinc-500">CopyFactory lida {quando(dados.lidaEm)}</span>}
          <BotaoRecarregar onClick={recarregar} aCarregar={aCarregar} />
        </div>
      </div>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {dados?.metaapiFalhou && <Aviso>A listagem da CopyFactory falhou — as divergências não são mostradas nesta leitura (evita falsos «estratégia morta»).</Aviso>}
      {resultados && (
        <Aviso tom={resultados.every((r) => r.ok) ? "info" : "aviso"}>
          {resultados.map((r) => <span key={r.id} className="block">{r.ok ? "✓" : "✗"} {r.id.slice(0, 8)} — {r.mensagem}</span>)}
        </Aviso>
      )}

      <div className="space-y-2">
        {linhas.map((l) => {
          const porPlat = l.seguidores.reduce<Record<string, number>>((a, s) => ({ ...a, [s.plataforma]: (a[s.plataforma] ?? 0) + 1 }), {})
          const abertaAgora = aberta === l.chave
          return (
            <div key={l.chave} className={`rounded-xl border ${l.flags.length ? "border-amber-500/30" : "border-zinc-800"}`}>
              <button type="button" onClick={() => setAberta(abertaAgora ? null : l.chave)} className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left">
                <span className="text-sm font-semibold text-zinc-100">{l.nome}</span>
                {l.strategyId && <Etiqueta tom={l.viva ? "ouro" : "grave"}>{l.strategyId}{l.viva ? "" : " · não existe"}</Etiqueta>}
                {l.slug && <Etiqueta>{l.slug}</Etiqueta>}
                <span className="text-[11px] text-zinc-500">{Object.entries(porPlat).map(([k, n]) => `${NOME_PLAT[k as keyof typeof NOME_PLAT]}: ${n}`).join(" · ") || "sem seguidores"}</span>
                <span className="ml-auto flex flex-wrap gap-1">{l.flags.map((f) => <Etiqueta key={f} tom="aviso">{TEXTO_FLAG[f]}</Etiqueta>)}</span>
                <ChevronDown className={`h-4 w-4 text-zinc-500 transition-transform ${abertaAgora ? "rotate-180" : ""}`} />
              </button>
              {abertaAgora && (
                <div className="border-t border-zinc-800 p-3">
                  <Tabela>
                    <thead><tr><th className={th}></th><th className={th}>Plataforma</th><th className={th}>Seguidor</th><th className={th}>Conta</th><th className={th}>Lote / risco</th><th className={th}>Estado</th><th className={th}>Divergências</th></tr></thead>
                    <tbody>
                      {l.seguidores.map((s) => (
                        <tr key={`${l.chave}:${s.ref}`}>
                          <td className={td}>
                            {s.reparavelSiteId && (
                              <input type="checkbox" checked={seleccao.has(s.reparavelSiteId)} onChange={(e) => {
                                const n = new Set(seleccao)
                                if (e.target.checked) n.add(s.reparavelSiteId!); else n.delete(s.reparavelSiteId!)
                                setSeleccao(n)
                              }} />
                            )}
                          </td>
                          <td className={td}><Etiqueta>{NOME_PLAT[s.plataforma]}</Etiqueta></td>
                          <td className={td}>{dados?.emails[s.userId] ?? s.userId.slice(0, 8)}</td>
                          <td className={td}>{s.conta}</td>
                          <td className={td}>{s.risco}</td>
                          <td className={td}><Etiqueta tom={s.estado.includes("paus") || s.estado.includes("inact") ? "aviso" : "ok"}>{s.estado}</Etiqueta></td>
                          <td className={td}>{s.flags.map((f) => <Etiqueta key={f} tom="grave">{TEXTO_FLAG[f]}</Etiqueta>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Tabela>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {afinacoes}
    </div>
  )
}
