import ProtectedPage from "@/components/protected-page"
import LiveSessionsHub from "@/components/live/live-sessions-hub"

export default function LivePage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/live" loadingMessage="A validar acesso às transmissões...">
      <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-[#D2A63C] mb-2">Ao vivo agora</h1>
          <p className="text-sm text-gray-300 mb-6">Escolhe uma sessão ativa e entra no canal.</p>
          <LiveSessionsHub />
        </div>
      </main>
    </ProtectedPage>
  )
}

