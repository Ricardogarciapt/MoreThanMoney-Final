"use client"

import { FileText, Link2, Lock, PlayCircle } from "lucide-react"
import type { MaterialDaSala } from "@/lib/lms/aulas"

/**
 * «MATERIAIS» de uma sala (211) — os guias em PDF, uma playlist a mais, um link.
 *
 * Mostrado onde a playlist da sala aparece (card de cursos do educador e app). O nível já vem
 * decidido pelo servidor: um material sem `url` é fechado e desenha-se com cadeado, sem link.
 * Abre sempre noutro separador, para quem está a ver a aula não a perder.
 */
export default function MateriaisDaSala({
  materiais,
  className = "",
}: {
  materiais?: MaterialDaSala[] | null
  className?: string
}) {
  if (!materiais?.length) return null
  return (
    <div className={className}>
      <p className="mb-1.5 text-[11px] uppercase tracking-wide text-gray-500">Materiais</p>
      <ul className="space-y-1">
        {materiais.map((m) => {
          const Icone = m.tipo === "pdf" ? FileText : m.tipo === "video" ? PlayCircle : Link2
          const conteudo = (
            <>
              <Icone className="h-4 w-4 shrink-0 text-[#D2A63C]" aria-hidden />
              <span className="min-w-0 flex-1 truncate">{m.titulo}</span>
              {!m.url && <Lock className="h-3 w-3 shrink-0 text-gray-500" aria-label="Bloqueado" />}
            </>
          )
          return (
            <li key={m.id}>
              {m.url ? (
                <a
                  href={m.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/60 px-2.5 py-2 text-xs text-zinc-200 transition-colors hover:border-[#D2A63C]/40"
                >
                  {conteudo}
                </a>
              ) : (
                <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/30 px-2.5 py-2 text-xs text-zinc-500">
                  {conteudo}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
