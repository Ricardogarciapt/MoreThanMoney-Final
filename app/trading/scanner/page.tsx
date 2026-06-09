"use client"

import ProtectedPage from "@/components/protected-page"
import ScannerMobile from "@/components/mobile/scanner-mobile"

export default function TradingScannerPage() {
  return (
    <ProtectedPage redirectPath="/login?redirect=/trading/scanner" loadingMessage="A carregar o Scanner MTM...">
      <main className="min-h-screen bg-black text-white flex flex-col">
        <header className="border-b border-white/10 px-6 py-4 flex items-center justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-amber-400/80">
              MTM · Trading Desk
            </p>
            <h1 className="text-lg font-medium text-white">Scanner MTM</h1>
            <p className="text-xs text-zinc-400">
              Versão mobile adaptada para utilização em desktop.
            </p>
          </div>
        </header>
        <section className="flex-1 px-4 py-6 flex justify-center items-start overflow-auto">
          <div className="w-full max-w-md lg:max-w-[1200px] rounded-xl border border-white/10 bg-zinc-950 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.8)]">
            <ScannerMobile />
          </div>
        </section>
      </main>
    </ProtectedPage>
  )
}

