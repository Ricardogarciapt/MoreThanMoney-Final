"use client"

import { useState } from "react"
import { FileText, Link2, PlayCircle, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import type { MaterialDaSala, TipoDeMaterial } from "@/lib/lms/aulas"

/**
 * Os MATERIAIS de uma sala no admin (211): lista, juntar e tirar. Pequeno de propósito — título,
 * link e tipo. Uma playlist a mais (uma sala só tem uma em `playlist_url`) entra aqui como `video`.
 */
export function MateriaisDaSalaAdmin({
  streamId,
  materiais,
  onChange,
}: {
  streamId: string
  materiais?: MaterialDaSala[] | null
  onChange: () => void
}) {
  const [titulo, setTitulo] = useState("")
  const [url, setUrl] = useState("")
  const [tipo, setTipo] = useState<TipoDeMaterial>("pdf")
  const [aGravar, setAGravar] = useState(false)

  const juntar = async () => {
    setAGravar(true)
    try {
      const res = await fetch("/api/admin/live-sessions/streams/materiais", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ streamId, titulo, url, tipo, ordem: materiais?.length ?? 0 }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(j.error || `Erro ao juntar o material (${res.status})`)
        return
      }
      setTitulo("")
      setUrl("")
      onChange()
    } finally {
      setAGravar(false)
    }
  }

  const tirar = async (id: string, nome: string) => {
    if (!window.confirm(`Tirar «${nome}» desta sala?`)) return
    const res = await fetch("/api/admin/live-sessions/streams/materiais", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ id }),
    })
    if (!res.ok) toast.error("Não foi possível tirar o material.")
    onChange()
  }

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">Materiais (PDF, vídeo, link)</p>
      {(materiais ?? []).map((m) => {
        const Icone = m.tipo === "pdf" ? FileText : m.tipo === "video" ? PlayCircle : Link2
        return (
          <div key={m.id} className="flex items-center gap-2 rounded border border-gray-800 bg-black/40 px-2 py-1.5 text-[11px]">
            <Icone className="h-3.5 w-3.5 shrink-0 text-[#D2A63C]" />
            <a href={m.url ?? "#"} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate text-gray-200 hover:text-[#D2A63C]">
              {m.titulo}
            </a>
            <button
              type="button"
              onClick={() => tirar(m.id, m.titulo)}
              className="shrink-0 rounded p-1 text-gray-500 hover:bg-gray-800 hover:text-red-400"
              aria-label={`Tirar ${m.titulo}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )
      })}
      <div className="grid gap-1.5 sm:grid-cols-[1fr_1.5fr_auto_auto]">
        <Input
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          className="border-gray-700 bg-black/50 text-[11px]"
          placeholder="Título (ex: Guia da estratégia)"
        />
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          className="border-gray-700 bg-black/50 font-mono text-[11px]"
          placeholder="https://…"
        />
        <select
          className="rounded border border-gray-700 bg-black/50 px-2 py-1.5 text-[11px] text-white"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as TipoDeMaterial)}
        >
          <option value="pdf">PDF</option>
          <option value="video">Vídeo / playlist</option>
          <option value="link">Link</option>
        </select>
        <Button
          type="button"
          size="sm"
          disabled={aGravar || !titulo.trim() || !url.trim()}
          onClick={juntar}
          className="bg-[#D2A63C] text-black hover:bg-[#E9C46A]"
        >
          Juntar
        </Button>
      </div>
    </div>
  )
}
