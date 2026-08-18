"use client"

import { useCallback, useEffect, useState } from "react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { GraduationCap, Plus, Trash2, ChevronUp, ChevronDown, Loader2 } from "lucide-react"

/**
 * CURSOS do educador — playlists próprias (não ligadas a uma sala), geridas pelo próprio no Studio.
 * Aparecem no dropdown "Cursos" do perfil/cartão, pela ordem definida aqui.
 * API: /api/live-sessions/educator-auth/playlists (GET/POST/PATCH/DELETE, cookie de educador).
 */
interface Course {
  id: string
  title: string
  url: string
  access_tier: string | null
  sort_order: number
  is_active: boolean
}

const TIERS: { v: string; label: string }[] = [
  { v: "all", label: "Todos" },
  { v: "app_member", label: "Membros+ (app €35 e acima)" },
  { v: "premium", label: "Premium" },
  { v: "vip", label: "VIP" },
]

export default function EducatorCoursesPanel() {
  const [items, setItems] = useState<Course[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState("")
  const [url, setUrl] = useState("")
  const [tier, setTier] = useState("all")
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/live-sessions/educator-auth/playlists", { credentials: "same-origin", cache: "no-store" })
      const j = await r.json()
      setItems(j?.playlists ?? [])
    } catch {
      /* silencioso */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const add = async () => {
    setErr(null)
    if (!title.trim() || !url.trim()) { setErr("Preenche o nome e o link."); return }
    setBusy(true)
    try {
      const r = await fetch("/api/live-sessions/educator-auth/playlists", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, url, access_tier: tier, sort_order: items.length }),
      })
      const j = await r.json()
      if (!r.ok) { setErr(j?.error || "Não foi possível adicionar."); return }
      setTitle(""); setUrl(""); setTier("all")
      await load()
    } finally {
      setBusy(false)
    }
  }

  const patch = async (id: string, payload: Record<string, unknown>) => {
    await fetch("/api/live-sessions/educator-auth/playlists", {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload }),
    })
    await load()
  }

  const remove = async (id: string) => {
    if (!confirm("Remover este curso do teu perfil?")) return
    await fetch("/api/live-sessions/educator-auth/playlists", {
      method: "DELETE",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  /** Troca a ordem com o vizinho (sobe/desce na sequência do dropdown). */
  const move = async (idx: number, dir: -1 | 1) => {
    const a = items[idx], b = items[idx + dir]
    if (!a || !b) return
    await patch(a.id, { sort_order: b.sort_order })
    await patch(b.id, { sort_order: a.sort_order })
  }

  return (
    <div className="rounded-xl border border-gray-800 bg-black/30 p-3">
      <div className="mb-2 flex items-center gap-2">
        <GraduationCap className="h-4 w-4 text-[#D2A63C]" />
        <p className="text-sm font-semibold text-gray-200">Cursos (playlists do teu perfil)</p>
      </div>
      <p className="mb-3 text-[11px] text-gray-500">
        Aparecem no dropdown “Cursos” do teu perfil, por esta ordem. São independentes das salas.
      </p>

      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /></div>
      ) : (
        <div className="space-y-2">
          {items.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-gray-800 bg-black/40 p-2">
              <div className="flex items-center gap-1.5">
                <Input
                  defaultValue={c.title}
                  className="h-8 border-gray-700 bg-black/50 text-xs"
                  onBlur={(e) => e.target.value.trim() !== c.title && patch(c.id, { title: e.target.value.trim() })}
                />
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                  className="rounded p-1 text-gray-500 hover:text-white disabled:opacity-30" aria-label="Subir">
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1}
                  className="rounded p-1 text-gray-500 hover:text-white disabled:opacity-30" aria-label="Descer">
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => remove(c.id)}
                  className="rounded p-1 text-gray-500 hover:text-red-400" aria-label="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-1.5 grid gap-1.5 sm:grid-cols-[1fr_auto]">
                <Input
                  defaultValue={c.url}
                  className="h-8 border-gray-700 bg-black/50 text-xs"
                  placeholder="https://youtube.com/playlist?list=…"
                  onBlur={(e) => e.target.value.trim() !== c.url && patch(c.id, { url: e.target.value.trim() })}
                />
                <select
                  defaultValue={c.access_tier || "all"}
                  onChange={(e) => patch(c.id, { access_tier: e.target.value })}
                  className="h-8 rounded-md border border-gray-700 bg-black/50 px-2 text-xs text-white"
                >
                  {TIERS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
                </select>
              </div>
            </div>
          ))}
          {!items.length && <p className="text-xs text-gray-600">Ainda não tens cursos. Adiciona o primeiro abaixo.</p>}
        </div>
      )}

      <div className="mt-3 space-y-1.5 border-t border-gray-800 pt-3">
        <Input value={title} onChange={(e) => setTitle(e.target.value)}
          placeholder="Nome do curso (ex: BootCamp Momentum)"
          className="h-8 border-gray-700 bg-black/50 text-xs" />
        <div className="grid gap-1.5 sm:grid-cols-[1fr_auto_auto]">
          <Input value={url} onChange={(e) => setUrl(e.target.value)}
            placeholder="https://youtube.com/playlist?list=…"
            className="h-8 border-gray-700 bg-black/50 text-xs" />
          <select value={tier} onChange={(e) => setTier(e.target.value)}
            className="h-8 rounded-md border border-gray-700 bg-black/50 px-2 text-xs text-white">
            {TIERS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
          <Button size="sm" onClick={add} disabled={busy} className="h-8 bg-[#D2A63C] text-black hover:bg-[#c0972f]">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="mr-1 h-4 w-4" />Adicionar</>}
          </Button>
        </div>
        {err && <p className="text-[11px] text-red-400">{err}</p>}
      </div>
    </div>
  )
}
