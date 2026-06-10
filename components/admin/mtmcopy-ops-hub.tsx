"use client"

import { Radio, Send, Users } from "lucide-react"
import MtmcopyTelegramSenders from "@/components/admin/mtmcopy-telegram-senders"
import MtmcopyProviderPipeline from "@/components/admin/mtmcopy-provider-pipeline"
import MtmcopyMetaApiPanel from "@/components/admin/mtmcopy-metaapi-panel"

export default function MtmcopyOpsHub({
  initialRouteId,
}: {
  initialRouteId?: string | null
}) {
  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <section className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-zinc-950/80">
        <div className="border-b border-emerald-500/20 px-6 py-4">
          <h2 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
            <Send className="w-5 h-5" />
            Senders
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Canais Telegram activos, rotas CopyFactory e configuração de execução nas contas provider
            (MTM Auto — Premium · Trade Ideas).
          </p>
        </div>
        <div className="p-6 space-y-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Radio className="w-4 h-4 text-zinc-500" />
              <h3 className="text-sm font-medium text-zinc-300">Grupos & canais Telegram</h3>
            </div>
            <MtmcopyTelegramSenders />
          </div>
          <div className="border-t border-zinc-800 pt-6">
            <MtmcopyProviderPipeline initialRouteId={initialRouteId} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-zinc-950/80">
        <div className="border-b border-[#D2A63C]/15 px-6 py-4">
          <h2 className="text-lg font-semibold text-[#D2A63C] flex items-center gap-2">
            <Users className="w-5 h-5" />
            Subscribers
          </h2>
          <p className="text-sm text-zinc-400 mt-1">
            Contas MetaAPI, estratégias CopyFactory, subscribers e provisioning — vista em tempo real.
          </p>
        </div>
        <div className="p-6">
          <MtmcopyMetaApiPanel />
        </div>
      </section>
    </div>
  )
}
