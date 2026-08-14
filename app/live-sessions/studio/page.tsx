import StudioModeSwitch from "@/components/live/studio-mode-switch"
import { LiveSessionsShell } from "@/components/live/live-sessions-shell"

export default function LiveSessionsStudioPage() {
  return (
    <LiveSessionsShell
      title="Studio do educador"
      showEducatorLink={false}
      subtitle="Só vês os teus canais e chaves RTMP/OBS. Gestão global (academias oficiais, educadores) em Admin → Educação / LMS."
    >
      <div className="mx-auto max-w-7xl">
        <StudioModeSwitch />
      </div>
    </LiveSessionsShell>
  )
}
