import QuizRunner from "@/components/avaliacoes/quiz-runner"

export const dynamic = "force-dynamic"

export default async function AvaliacaoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  return (
    <main className="min-h-screen bg-black text-white">
      <QuizRunner slug={slug} />
    </main>
  )
}
