import EducatorStudio from "@/components/live/educator-studio"
import { LiveSessionsShell } from "@/components/live/live-sessions-shell"

export default function LiveSessionsStudioPage() {
  return (
    <LiveSessionsShell
      title="Studio do educador"
      showEducatorLink={false}
      subtitle="Transmite por OBS/RTMP ou direto do browser (botão “Studio no browser” em cada sala). Só vês os teus canais e chaves. Gestão global em Admin → Educação / LMS."
    >
      <div className="mx-auto max-w-7xl">
        <EducatorStudio />
      </div>
    </LiveSessionsShell>
  )
}
