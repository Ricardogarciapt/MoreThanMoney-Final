"use client"

import { useEffect, useState } from "react"
import LiveStreamRoom from "@/components/live/live-stream-room"
import EducatorRatingsSection from "@/components/live/educator-ratings-section"
import AppDeAlunosCard from "@/components/live/app-de-alunos-card"

export default function LiveSessionChannelContent({ streamId }: { streamId: string }) {
  const [educatorId, setEducatorId] = useState<string | null>(null)
  // O canal inteiro, e não só o id do educador: a app de alunos vive em duas colunas do stream
  // (`app_alunos_url` e `app_alunos_produto_slug`) e não vale a pena pedir o mesmo duas vezes.
  const [canal, setCanal] = useState<{ app_alunos_url?: string | null; app_alunos_produto_slug?: string | null; title?: string | null } | null>(null)

  useEffect(() => {
    fetch(`/api/live-sessions/streams/${streamId}`, { credentials: "same-origin" })
      .then((r) => r.json())
      .then((res) => {
        const d = res?.data ?? null
        const id = d?.educator?.id
        if (id) setEducatorId(String(id))
        setCanal(d)
      })
      .catch(() => {
        setEducatorId(null)
        setCanal(null)
      })
  }, [streamId])

  return (
    <div className="space-y-6">
      <LiveStreamRoom streamId={streamId} />
      {/* Logo abaixo do leitor: é onde a pessoa está a olhar quando percebe que as aulas não
          estão aqui. Mais abaixo, debaixo das avaliações, já ninguém o via. */}
      <AppDeAlunosCard
        appUrl={canal?.app_alunos_url}
        produtoSlug={canal?.app_alunos_produto_slug}
        nomeDoCanal={canal?.title}
      />
      {educatorId && (
        <EducatorRatingsSection educatorId={educatorId} streamId={streamId} variant="channel" />
      )}
    </div>
  )
}
