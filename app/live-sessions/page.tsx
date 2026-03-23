import ProtectedPage from "@/components/protected-page"
import LiveSessionsHub from "@/components/live/live-sessions-hub"

export default function LiveSessionsPage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/live-sessions" loadingMessage="A validar acesso às live sessions...">
      <main className="min-h-screen bg-black text-white px-4 py-6 md:px-8">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl md:text-3xl font-bold text-[#D2A63C] mb-2">Live Sessions</h1>
          <p className="text-sm text-gray-300 mb-6">
            Academia LMS em direto: escolhe academia, escolhe educador e entra no canal com stream + chat.
          </p>
          <LiveSessionsHub />
        </div>
      </main>
    </ProtectedPage>
  )
}

