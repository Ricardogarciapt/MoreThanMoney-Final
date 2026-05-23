"use client"

import { useCallback, useEffect, useState } from "react"
import { Star, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/hooks/use-toast"

type Props = {
  educatorId: string
  streamId?: string | null
  onSubmitted?: () => void
  /** Dentro de sub-modal: omite título do card (o modal já tem cabeçalho). */
  embedded?: boolean
}

export default function EducatorLessonRating({
  educatorId,
  streamId,
  onSubmitted,
  embedded = false,
}: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [stats, setStats] = useState<{ count: number; average: number | null }>({ count: 0, average: null })
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/live-sessions/educators/${educatorId}/ratings`, {
        credentials: "include",
      }).then((r) => r.json())

      if (res.success) {
        setStats(res.stats || { count: 0, average: null })
        if (res.mine) {
          setRating(Number(res.mine.rating) || 0)
          setComment(res.mine.comment || "")
        }
      }
    } finally {
      setLoading(false)
    }
  }, [educatorId])

  useEffect(() => {
    load()
  }, [load])

  const submit = async () => {
    if (rating < 1) {
      toast({ title: "Escolhe uma classificação", description: "De 1 a 5 estrelas.", variant: "destructive" })
      return
    }
    setSaving(true)
    try {
      const res = await fetch(`/api/live-sessions/educators/${educatorId}/ratings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          rating,
          comment,
          stream_id: streamId || undefined,
        }),
      }).then((r) => r.json())

      if (res.success) {
        toast({ title: "Obrigado!", description: "A tua avaliação foi guardada." })
        await load()
        onSubmitted?.()
      } else {
        toast({
          title: "Não foi possível guardar",
          description: res.error || "Tenta novamente.",
          variant: "destructive",
        })
      }
    } finally {
      setSaving(false)
    }
  }

  const display = hover || rating

  return (
    <Card className={embedded ? "border-0 bg-transparent shadow-none" : "border-[#D2A63C]/25 bg-gray-950/90"}>
      <CardHeader className={embedded ? "px-0 pb-2 pt-0" : "pb-2"}>
        {!embedded ? (
          <CardTitle className="text-lg text-[#D2A63C]">Feedback</CardTitle>
        ) : null}
        <p className="text-xs font-normal text-gray-500">
          Partilha feedback sobre este educador. A tua opinião ajuda a melhorar as próximas sessões.
        </p>
        {!loading && stats.count > 0 && stats.average != null && (
          <p className="text-sm text-gray-300 mt-1">
            Média: <span className="font-semibold text-[#D2A63C]">{stats.average}</span>/5 · {stats.count}{" "}
            {stats.count === 1 ? "avaliação" : "avaliações"}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className="p-1 transition hover:scale-110"
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  onClick={() => setRating(n)}
                  aria-label={`${n} estrelas`}
                >
                  <Star
                    className={`h-8 w-8 ${
                      n <= display ? "fill-[#D2A63C] text-[#D2A63C]" : "text-gray-600"
                    }`}
                  />
                </button>
              ))}
            </div>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Comentário opcional sobre a aula…"
              className="min-h-[88px] border-gray-700 bg-black/50 text-white"
              maxLength={2000}
            />
            <Button
              type="button"
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
              disabled={saving || rating < 1}
              onClick={submit}
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  A guardar…
                </>
              ) : (
                "Enviar avaliação"
              )}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
