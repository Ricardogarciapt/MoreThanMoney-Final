"use client"

import { useMemo, useState } from "react"
import { Loader2, Zap } from "lucide-react"
import { Aviso, Etiqueta, pedirAdmin, quando } from "./comum"

interface Correcao {
  id: string; categoria: "orfa" | "estrategia_morta" | "sem_conta" | "duplicado" | "quota" | "consistencia"; gravidade: "grave" | "aviso" | "info"
  titulo: string; detalhe: string; userId: string | null; acao: { tipo: string }; segundaConfirmacao: boolean
}
interface Diff { correcoes: Correcao[]; avisos: string[]; resumo: Record<string, number>; lidaEm: string }

const CATEGORIA = { orfa: "Órfãs", estrategia_morta: "Estratégias mortas", sem_conta: "Ligações sem conta", duplicado: "Duplicados", quota: "Quota", consistencia: "Consistência" }

export default function SincronizacaoCopia() {
  const [diff, setDiff] = useState<Diff | null>(null)
  const [aLer, setALer] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [aAplicar, setAAplicar] = useState(false)
  const [resultado, setResultado] = useState<{ resultados: { id: string; ok: boolean; mensagem: string }[]; recusadas: { id: string; motivo: string }[] } | null>(null)
  const [legado, setLegado] = useState<string | null>(null)

  const prever = async () => {
    setALer(true); setErro(null); setResultado(null)
    const r = await pedirAdmin<Diff>("/api/admin/mtmauto-copia/sincronizacao")
    setALer(false)
    if (r.success && r.data) { setDiff(r.data); setSel(new Set()) } else setErro(r.error ?? "falhou")
  }

  const seleccionadas = useMemo(() => (diff?.correcoes ?? []).filter((c) => sel.has(c.id)), [diff, sel])
  const precisaSegunda = seleccionadas.some((c) => c.segundaConfirmacao)

  const aplicar = async () => {
    if (!seleccionadas.length) return
    if (!window.confirm(`Aplicar ${seleccionadas.length} correcção(ões)? O diff é recalculado no servidor antes de aplicar.`)) return
    let segundaConfirmacao: string | null = null
    if (precisaSegunda) {
      const txt = window.prompt(`${seleccionadas.filter((c) => c.segundaConfirmacao).length} correcção(ões) são IRREVERSÍVEIS (apagar contas na MetaApi / tirar subscrições a contas sem linha no site).\n\nEscreve APAGAR para confirmar.`)
      if (txt?.trim() !== "APAGAR") return
      segundaConfirmacao = "APAGAR"
    }
    setAAplicar(true)
    const r = await pedirAdmin<NonNullable<typeof resultado>>("/api/admin/mtmauto-copia/sincronizacao", { method: "POST", body: { ids: [...sel], segundaConfirmacao } })
    setAAplicar(false)
    if (r.success && r.data) setResultado(r.data); else setErro(r.error ?? "falhou")
  }

  const syncLegado = async () => {
    if (!window.confirm("Correr também o reparador CopyFactory de sempre (rotas provider + todas as ligações)? Demora e reescreve subscrições com a config da BD.")) return
    setLegado("a correr…")
    const r = await pedirAdmin<{ summary?: { total: number; ok: number; failed: number } }>("/api/admin/mtmcopy/sync-all", { method: "POST", body: { force: true } })
    setLegado(r.success ? `feito: ${r.data?.summary?.ok ?? "?"} ok · ${r.data?.summary?.failed ?? "?"} falharam de ${r.data?.summary?.total ?? "?"}` : r.error ?? "falhou")
  }

  const alternar = (id: string) => { const n = new Set(sel); if (n.has(id)) n.delete(id); else n.add(id); setSel(n) }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={prever} disabled={aLer} className="inline-flex items-center gap-1.5 rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
          {aLer ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />} Sincronizar tudo · pré-visualizar
        </button>
        {diff && <span className="text-[11px] text-zinc-500">lido {quando(diff.lidaEm)} · {diff.correcoes.length} propostas</span>}
        <button type="button" onClick={syncLegado} className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800">Reparador CopyFactory de sempre</button>
      </div>
      <p className="text-xs text-zinc-500">
        Compara site ↔ MetaApi ↔ CopyFactory ↔ MTM Auto ↔ TradeLocker ↔ MTM Funded ↔ rotas de cópia. Nada muda até escolheres e aplicares; cada escrita na MetaApi/CopyFactory é relida.
        Duplicados e quota são alertas (a regra é não tirar nada a quem já tem).
      </p>
      {legado && <Aviso tom="info">Reparador de sempre: {legado}</Aviso>}
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {diff?.avisos.map((a) => <Aviso key={a}>{a}</Aviso>)}

      {diff && (
        <>
          <div className="flex flex-wrap gap-2">
            {Object.entries(CATEGORIA).map(([k, n]) => <Etiqueta key={k} tom={(diff.resumo[k] ?? 0) > 0 ? "aviso" : "ok"}>{n}: {diff.resumo[k] ?? 0}</Etiqueta>)}
          </div>
          {diff.correcoes.length === 0 ? <Aviso tom="info">Tudo alinhado.</Aviso> : (
            <div className="space-y-1.5">
              {diff.correcoes.map((c) => {
                const aplicavel = c.acao.tipo !== "nenhuma"
                return (
                  <label key={c.id} className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${c.gravidade === "grave" ? "border-rose-500/30" : "border-zinc-800"} ${aplicavel ? "cursor-pointer" : ""}`}>
                    <input type="checkbox" className="mt-1" disabled={!aplicavel} checked={sel.has(c.id)} onChange={() => alternar(c.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm text-zinc-100">{c.titulo}</span>
                        <Etiqueta tom={c.gravidade === "grave" ? "grave" : "aviso"}>{CATEGORIA[c.categoria]}</Etiqueta>
                        {aplicavel ? <Etiqueta tom="info">{c.acao.tipo.replace(/_/g, " ")}</Etiqueta> : <Etiqueta>só alerta</Etiqueta>}
                        {c.segundaConfirmacao && <Etiqueta tom="grave">irreversível · 2.ª confirmação</Etiqueta>}
                      </span>
                      <span className="block text-xs text-zinc-400 break-words">{c.detalhe}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          )}
          <div className="sticky bottom-0 flex items-center gap-2 border-t border-zinc-800 bg-zinc-950/95 py-3">
            <button type="button" disabled={!sel.size || aAplicar} onClick={aplicar} className="rounded-lg bg-rose-500/90 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">
              {aAplicar ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null} Aplicar {sel.size} seleccionada(s)
            </button>
            {precisaSegunda && <span className="text-xs text-rose-300">inclui acções irreversíveis — vai pedir «APAGAR»</span>}
          </div>
        </>
      )}

      {resultado && (
        <Aviso tom={resultado.resultados.every((r) => r.ok) && !resultado.recusadas.length ? "info" : "aviso"}>
          {resultado.resultados.map((r) => <span key={r.id} className="block">{r.ok ? "✓" : "✗"} {r.id} — {r.mensagem}</span>)}
          {resultado.recusadas.map((r) => <span key={r.id} className="block">⊘ {r.id} — {r.motivo}</span>)}
          <button className="mt-1 underline" onClick={prever}>voltar a pré-visualizar</button>
        </Aviso>
      )}
    </div>
  )
}
