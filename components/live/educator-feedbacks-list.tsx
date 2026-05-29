"use client"

import { useCallback, useEffect, useState } from "react"
import { Loader2, MessageSquare, Star, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"

export type EducatorRatingRow = {
  id: string
  rating: number
  comment: string | null
  user_name: string | null
  created_at: string
  updated_at: string
  stream_id?: string | null
  stream?: { id: string; title: string } | null
}

type Stats = { count: number; average: number | null }

type Props = {
  educatorId: string
  /** Título da secção */
  title?: string
  /** Modo studio: mostra sala associada e tom mais operacional */
  variant?: "channel" | "studio"
  /** Recarregar quando mudar (ex.: após nova avaliação no mesmo ecrã) */
  refreshKey?: number
  className?: string
}

function StarsRow({ value, size = "sm" }: { value: number; size?: "sm" | "md" }) {
  const cls = size === "md" ? "h-5 w-5" : "h-4 w-4"
  return (
    <div className="flex items-center gap-0.5" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`${cls} ${n <= value ? "fill-[#D2A63C] text-[#D2A63C]" : "text-gray-600"}`}
        />
      ))}
    </div>
  )
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-PT", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  } catch {
    return iso
  }
}

export default function EducatorFeedbacksList({
  educatorId,
  title,
  variant = "channel",
  refreshKey = 0,
  className = "",
}: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [stats, setStats] = useState<Stats>({ count: 0, average: null })
  const [ratings, setRatings] = useState<EducatorRatingRow[]>([])

  const load = useCallback(async () => {
    if (!educatorId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/live-sessions/educators/${educatorId}/ratings`, {
        credentials: "include",
      }).then((r) => r.json())

      if (res.success) {
        setStats(res.stats || { count: 0, average: null })
        const raw = (res.ratings || []) as EducatorRatingRow[]
        setRatings(
          raw.map((row) => {
            const s = row.stream as EducatorRatingRow["stream"] | EducatorRatingRow["stream"][]
            const stream = Array.isArray(s) ? s[0] ?? null : s ?? null
            return { ...row, stream }
          })
        )
      }
    } finally {
      setLoading(false)
    }
  }, [educatorId])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  const deleteRating = async (ratingId: string) => {
    if (variant !== "studio") return
    if (!window.confirm("Apagar este feedback? Esta ação não pode ser desfeita.")) return
    setDeletingId(ratingId)
    try {
      const res = await fetch(`/api/live-sessions/educator-auth/ratings/${ratingId}`, {
        method: "DELETE",
        credentials: "include",
      }).then((r) => r.json())
      if (!res.success) {
        toast({
          title: "Não foi possível apagar",
          description: res.error || "Tenta novamente.",
          variant: "destructive",
        })
        return
      }
      toast({ title: "Feedback apagado" })
      await load()
    } catch {
      toast({
        title: "Erro",
        description: "Não foi possível apagar o feedback.",
        variant: "destructive",
      })
    } finally {
      setDeletingId(null)
    }
  }

  const heading =
    title ?? (variant === "studio" ? "Feedbacks dos membros" : "Feedbacks da comunidade")

  return (
    <Card className={`border-[#D2A63C]/25 bg-gray-950/90 ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg text-[#D2A63C]">
          <MessageSquare className="h-5 w-5 shrink-0" />
          {heading}
        </CardTitle>
        {variant === "studio" ? (
          <p className="text-xs font-normal text-gray-500">
            Avaliações e comentários deixados pelos membros nas tuas lives. Podes apagar entradas individuais.
          </p>
        ) : (
          <p className="text-xs font-normal text-gray-500">
            O que a comunidade diz sobre este educador.
          </p>
        )}
        {!loading && stats.count > 0 && stats.average != null && (
          <p className="mt-1 text-sm text-gray-300">
            Média: <span className="font-semibold text-[#D2A63C]">{stats.average}</span>/5 · {stats.count}{" "}
            {stats.count === 1 ? "avaliação" : "avaliações"}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
          </div>
        ) : ratings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-800 bg-black/30 px-4 py-6 text-center text-sm text-gray-500">
            {variant === "studio"
              ? "Ainda não recebeste feedbacks. Quando os membros avaliarem as tuas aulas, aparecem aqui."
              : "Ainda não há feedbacks públicos para este educador."}
          </p>
        ) : (
          <ul className="max-h-[min(50vh,420px)] space-y-3 overflow-y-auto pr-1">
            {ratings.map((row) => (
              <li
                key={row.id}
                className="rounded-lg border border-gray-800/90 bg-black/40 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">
                      {row.user_name?.trim() || "Membro"}
                    </p>
                    {variant === "studio" && row.stream?.title && (
                      <p className="mt-0.5 text-[11px] text-gray-500 truncate">
                        Sala: <span className="text-gray-400">{row.stream.title}</span>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <StarsRow value={Number(row.rating) || 0} />
                    {variant === "studio" && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-gray-500 hover:text-red-400"
                        disabled={deletingId === row.id}
                        aria-label="Apagar feedback"
                        onClick={() => deleteRating(row.id)}
                      >
                        {deletingId === row.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                {row.comment?.trim() ? (
                  <p className="mt-2 text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                    {row.comment.trim()}
                  </p>
                ) : (
                  <p className="mt-2 text-xs italic text-gray-600">Sem comentário escrito.</p>
                )}
                <p className="mt-2 text-[10px] text-gray-600">{formatWhen(row.updated_at || row.created_at)}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
