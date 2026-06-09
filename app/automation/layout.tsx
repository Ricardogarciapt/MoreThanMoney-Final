import { AuthProvider } from "@/contexts/auth-context"
import Breadcrumbs from "@/components/breadcrumbs"

export default function AutomationLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthProvider>
      <Breadcrumbs />
      <main className="relative min-h-screen bg-black text-white">
        {children}
      </main>
    </AuthProvider>
  )
} 