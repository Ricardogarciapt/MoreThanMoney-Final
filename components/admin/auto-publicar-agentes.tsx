"use client"

import { useCallback, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

/**
 * O botão «Auto-publicar posts dos agentes» — o MESMO setting que o Dashboard neural do AIOS
 * (`site_settings.social_auto_publicar_agentes`, rota /api/admin/agentes/social).
 * Ligado: os posts do Social que passam a guarda da marca entram aprovados (máx. 2 posts + 1 história
 * por conta/dia). Desligado: pausa tudo — o que estava aprovado e ainda não saiu volta a rascunho.
 */
export function AutoPublicarAgentes() {
  const [cfg, setCfg] = useState<{ ligado: boolean; posts_dia_conta: number; historias_dia_conta: number } | null>(null)
  const [hoje, setHoje] = useState<{ posts: number; historias: number } | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const cab = async () => {
    const tok = (await supabase.auth.getSession()).data.session?.access_token
    return { "Content-Type": "application/json", ...(tok ? { Authorization: `Bearer ${tok}` } : {}) }
  }

  const ler = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/agentes/social", { headers: await cab(), cache: "no-store" })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || `HTTP ${r.status}`)
      setCfg(j.config)
      setHoje(j.hoje)
      setErro(null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    }
  }, [])

  useEffect(() => {
    ler()
  }, [ler])

  const mudar = async () => {
    if (!cfg) return
    setAGravar(true)
    try {
      const r = await fetch("/api/admin/agentes/social", { method: "PATCH", headers: await cab(), body: JSON.stringify({ ligado: !cfg.ligado }) })
      const j = await r.json()
      if (!j.ok) throw new Error(j.erro || `HTTP ${r.status}`)
      setCfg(j.config)
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
    } finally {
      setAGravar(false)
    }
  }

  const ligado = cfg?.ligado === true
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#D2A63C]/30 bg-neutral-900/60 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-neutral-100">Auto-publicar posts dos agentes</div>
        <div className="text-xs text-neutral-400">
          {cfg
            ? `Guarda da marca + tecto ${cfg.posts_dia_conta} posts e ${cfg.historias_dia_conta} história por conta/dia. Hoje: ${hoje?.posts ?? "?"} posts, ${hoje?.historias ?? "?"} histórias.`
            : erro
              ? `Não li o estado: ${erro}`
              : "A ler…"}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={ligado}
        aria-label="Auto-publicar posts dos agentes"
        disabled={!cfg || aGravar}
        onClick={mudar}
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${ligado ? "bg-[#D2A63C]" : "bg-neutral-700"} disabled:opacity-50`}
      >
        <span className={`absolute top-1 h-5 w-5 rounded-full bg-neutral-950 transition-all ${ligado ? "left-6" : "left-1"}`} />
      </button>
    </div>
  )
}
