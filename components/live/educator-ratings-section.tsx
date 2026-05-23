"use client"

import { useState } from "react"
import EducatorLessonRating from "@/components/live/educator-lesson-rating"
import EducatorFeedbacksList from "@/components/live/educator-feedbacks-list"

type Props = {
  educatorId: string
  streamId?: string | null
  /** Canal público: formulário + lista. Studio: só lista. */
  showRatingForm?: boolean
  variant?: "channel" | "studio"
  /** Formulário dentro de sub-modal (sem título duplicado). */
  embeddedForm?: boolean
}

/** Secção completa: enviar avaliação (opcional) + lista de feedbacks públicos. */
export default function EducatorRatingsSection({
  educatorId,
  streamId = null,
  showRatingForm = true,
  variant = "channel",
}: Props) {
  const [refreshKey, setRefreshKey] = useState(0)

  return (
    <div className="space-y-6">
      {showRatingForm && (
        <EducatorLessonRating
          educatorId={educatorId}
          streamId={streamId}
          embedded={embeddedForm}
          onSubmitted={() => setRefreshKey((k) => k + 1)}
        />
      )}
      <EducatorFeedbacksList
        educatorId={educatorId}
        variant={variant}
        refreshKey={refreshKey}
      />
    </div>
  )
}
