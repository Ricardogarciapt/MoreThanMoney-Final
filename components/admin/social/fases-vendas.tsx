"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw } from "lucide-react"

type Fase = { fase: string; nome: string; papel: string; total: number; novos7d: number; porFunil: Record<string, number> }
type Dados = {
  fases: Fase[]
  papeis: Array<{ papel: string; nome: string; total: number }>
  accao: Record<string, string>
  recrutas: number
  clientes: number
  perdidos: number
  ganhos7d: number
  entradas7d: number
  conversao: number | null
  importadosParados: number
  pedidosMeta7d: number
  envioPendentes: number
  executorLigado: boolean
}

const FUNIL: Record<string, string> = { educacao: "Educação", corretora: "Corretora", funded: "Funded", b2b: "B2B", sem: "Por classificar" }
const PAPEL_COR: Record<string, string> = {
  prospector: "text-sky-300",
  setter: "text-emerald-300",
  closer: "text-[#E9C46A]",
  onboarder: "text-violet-300",
  recrutador: "text-teal-300",
}

/**
 * As 7 fases do funil de vendas, com o papel que trabalha cada uma.
 * Prospeção → Qualificação → Convite → Apresentação → Edificação → Fecho → Onboarding (+ Recrutador).
 */
export function FasesVendas() {
  const [d, setD] = useState<Dados | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aLer, setALer] = useState(false)

  const ler = useCallback(async () => {
    setALer(true)
    setErro(null)
    try {
      const r = await fetch("/api/admin/social/fases", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.erro || j.error || `HTTP ${r.status}`)
      setD(j)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setALer(false)
    }
  }, [])

  useEffect(() => { ler() }, [ler])

  if (erro) return <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{erro}</p>
  if (!d) return <div className="flex items-center gap-2 text-sm text-zinc-500"><Loader2 className="h-4 w-4 animate-spin" /> A ler o funil…</div>

  const max = Math.max(1, ...d.fases.map((f) => f.total))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-zinc-100">Funil de vendas · 7 fases</h2>
          <p className="text-xs text-zinc-500">
            Motor {d.executorLigado ? "ligado" : "desligado"} (corre de 2 em 2 horas). Só sai mensagem a quem tem base legal.
          </p>
        </div>
        <button onClick={ler} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-zinc-300 hover:bg-white/5">
          <RefreshCw className={`h-3.5 w-3.5 ${aLer ? "animate-spin" : ""}`} /> Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Entradas 7 dias", d.entradas7d],
          ["Ganhos 7 dias", d.ganhos7d],
          ["Clientes", d.clientes],
          ["Conversão total", d.conversao === null ? "—" : `${d.conversao}%`],
          ["Leads Meta 7 dias", d.pedidosMeta7d],
          ["Envios por aprovar", d.envioPendentes],
          ["Recrutas (parceiros)", d.recrutas],
          ["Importados parados", d.importadosParados],
        ].map(([k, v]) => (
          <div key={String(k)} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[11px] text-zinc-500">{k}</p>
            <p className="text-xl font-semibold text-zinc-100">{v}</p>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        {d.fases.map((f, i) => (
          <div key={f.fase} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm font-medium text-zinc-100">
                <span className="mr-2 text-zinc-500">{i + 1}.</span>{f.nome}
                <span className={`ml-2 text-xs ${PAPEL_COR[f.papel] ?? "text-zinc-400"}`}>{d.papeis.find((p) => p.papel === f.papel)?.nome}</span>
              </p>
              <p className="text-sm text-zinc-300">
                <b>{f.total}</b>
                {f.novos7d > 0 && <span className="ml-2 text-xs text-emerald-400">+{f.novos7d} esta semana</span>}
              </p>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5">
              <div className="h-full rounded-full bg-gradient-to-r from-[#D2A63C] to-[#E9C46A]" style={{ width: `${(f.total / max) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-zinc-500">{d.accao[f.fase]}</p>
            {f.total > 0 && (
              <p className="mt-1 text-[11px] text-zinc-500">
                {Object.entries(f.porFunil).map(([k, n]) => `${FUNIL[k] ?? k} ${n}`).join(" · ")}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
        <p className="mb-2 text-sm font-medium text-zinc-100">Carga por papel</p>
        <div className="flex flex-wrap gap-3">
          {d.papeis.map((p) => (
            <span key={p.papel} className={`text-sm ${PAPEL_COR[p.papel] ?? ""}`}>{p.nome}: <b>{p.total}</b></span>
          ))}
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          O trabalho de cada papel aparece no back-office em <Link className="underline" href="/backoffice/pipeline/quadro">Pipeline</Link> e no «O meu dia».
          Os importados do WhatsApp ficam parados até decisão do Ricardo.
        </p>
      </div>
    </div>
  )
}
