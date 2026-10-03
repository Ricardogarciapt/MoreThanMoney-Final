"use client"

import Link from "next/link"
import ProtectedPage from "@/components/protected-page"
import AlertasMtm from "@/components/alertas-mtm"
import { Badge } from "@/components/ui/badge"
import { House, ChevronRight, Bell, Sparkles } from "lucide-react"

/**
 * Página dedicada de Alertas MTM.
 * Replica na totalidade a mecânica de alertas (o mesmo componente usado em
 * /scanner-access), agora com página própria acessível pela navbar Trading.
 */
export default function AlertasMtmPage() {
  return (
    <ProtectedPage
      redirectPath="/login?redirect=/alertas-mtm"
      loadingMessage="A verificar acesso aos Alertas MTM..."
    >
      <main className="min-h-screen bg-black text-white">
        {/* Breadcrumb */}
        <nav className="border-b border-[#D2A63C]/10 bg-black/50">
          <div className="container mx-auto px-4 py-2">
            <ol className="flex items-center space-x-2 text-sm">
              <li className="flex items-center">
                <Link href="/" className="flex items-center text-gray-400 hover:text-[#D2A63C]">
                  <House className="mr-1 h-3 w-3" />
                  <span className="sr-only">Início</span>
                </Link>
              </li>
              <li className="flex items-center">
                <ChevronRight className="mx-1 h-4 w-4 text-gray-500" />
                <Link href="/automation" className="text-gray-400 hover:text-[#D2A63C]">Trading</Link>
              </li>
              <li className="flex items-center">
                <ChevronRight className="mx-1 h-4 w-4 text-gray-500" />
                <span className="text-[#D2A63C]">Alertas MTM</span>
              </li>
            </ol>
          </div>
        </nav>

        {/* Header */}
        <div className="container mx-auto px-4 pt-8 pb-4">
          <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-bold md:text-4xl">
                <Bell className="h-8 w-8 text-[#D2A63C]" />
                <span className="bg-gradient-to-r from-[#F3F3E6] via-[#D2A63C] to-[#BB8525] bg-clip-text text-transparent">
                  Alertas MTM
                </span>
              </h1>
              <p className="mt-2 max-w-2xl text-sm text-gray-400 md:text-base">
                Sinais ao vivo dos scanners MTM — entradas, invalidações, saídas, confirmações e gestão de trade com IA, com gráfico e filtros por classe, timeframe, ativo e estratégia.
              </p>
            </div>
            <Badge className="border-[#D2A63C]/30 bg-[#D2A63C]/10 text-[#D2A63C]">
              <Sparkles className="mr-1 h-3 w-3" /> Sinais em tempo real
            </Badge>
          </div>
        </div>

        {/* Mecânica de alertas completa */}
        <div className="w-full px-2 md:px-4 pb-16">
          <div className="mx-auto max-w-[98%] rounded-lg border border-[#D2A63C]/30 bg-gradient-to-br from-[#BB8525]/10 to-black p-3 backdrop-blur-sm md:p-6">
            <AlertasMtm />
          </div>
        </div>
      </main>
    </ProtectedPage>
  )
}
