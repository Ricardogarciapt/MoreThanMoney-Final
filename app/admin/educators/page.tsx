import ProtectedPage from "@/components/protected-page"
import LiveSessionsManager from "@/components/admin/live-sessions-manager"

export default function AdminEducatorsPage() {
  return (
    <ProtectedPage requireAdmin redirectPath="/login?redirect=/admin/educators" loadingMessage="A validar acesso de administrador...">
      <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-[#D2A63C] mb-2">Admin • Educadores</h1>
          <p className="text-sm text-gray-300 mb-6">Criar educadores, gerir stream keys e acompanhar estado LIVE.</p>
          <LiveSessionsManager />
        </div>
      </main>
    </ProtectedPage>
  )
}

