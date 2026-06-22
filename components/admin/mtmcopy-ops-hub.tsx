"use client"

import { useState } from "react"
import { GitBranch, Radio, Send, Users } from "lucide-react"
import MtmcopyTelegramSenders from "@/components/admin/mtmcopy-telegram-senders"
import MtmcopyProviderPipeline from "@/components/admin/mtmcopy-provider-pipeline"
import MtmcopyMetaApiPanel from "@/components/admin/mtmcopy-metaapi-panel"
import { cn } from "@/lib/utils"
import type { MtmcopyAdminTab } from "@/components/admin/mtmcopy-admin-shell"

type SenderSubTab = "telegram" | "routes"

export default function MtmcopyOpsHub({
  initialRouteId,
  panel = "all",
}: {
  initialRouteId?: string | null
  panel?: "senders" | "subscribers" | "all" | MtmcopyAdminTab
}) {
  const [senderTab, setSenderTab] = useState<SenderSubTab>(
    initialRouteId ? "routes" : "telegram",
  )

  const showSenders = panel === "all" || panel === "senders"
  const showSubscribers = panel === "all" || panel === "subscribers"

  const sendersBlock = (
    <section className="overflow-hidden rounded-2xl border border-emerald-500/25 bg-zinc-950/80 h-full">
      <div className="border-b border-emerald-500/20 px-5 sm:px-6 py-4">
        <h2 className="text-lg font-semibold text-emerald-400 flex items-center gap-2">
          <Send className="w-5 h-5" />
          Senders · Origem dos sinais
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Canais Telegram, webhook TradingView e rotas provider — Premium, Trade Ideas e Sensei.
        </p>
        <div className="flex gap-1 mt-4 p-1 rounded-lg bg-zinc-900/80 border border-zinc-800 w-fit">
          <button
            type="button"
            onClick={() => setSenderTab("telegram")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              senderTab === "telegram"
                ? "bg-emerald-500/15 text-emerald-300"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <Radio className="w-3.5 h-3.5" />
            Telegram &amp; chats
          </button>
          <button
            type="button"
            onClick={() => setSenderTab("routes")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
              senderTab === "routes"
                ? "bg-emerald-500/15 text-emerald-300"
                : "text-zinc-500 hover:text-zinc-300",
            )}
          >
            <GitBranch className="w-3.5 h-3.5" />
            Rotas provider
          </button>
        </div>
      </div>
      <div className="p-5 sm:p-6">
        {senderTab === "telegram" ? (
          <MtmcopyTelegramSenders />
        ) : (
          <MtmcopyProviderPipeline initialRouteId={initialRouteId} />
        )}
      </div>
    </section>
  )

  const subscribersBlock = (
    <section className="overflow-hidden rounded-2xl border border-[#D2A63C]/20 bg-zinc-950/80 h-full">
      <div className="border-b border-[#D2A63C]/15 px-5 sm:px-6 py-4">
        <h2 className="text-lg font-semibold text-[#D2A63C] flex items-center gap-2">
          <Users className="w-5 h-5" />
          Subscribers · CopyFactory
        </h2>
        <p className="text-sm text-zinc-400 mt-1">
          Contas MetaAPI, estratégias activas, subscribers e estado de sincronização em tempo real.
        </p>
      </div>
      <div className="p-5 sm:p-6">
        <MtmcopyMetaApiPanel />
      </div>
    </section>
  )

  if (showSenders && !showSubscribers) {
    return <div className="max-w-5xl">{sendersBlock}</div>
  }

  if (showSubscribers && !showSenders) {
    return subscribersBlock
  }

  return (
    <div className="grid xl:grid-cols-2 gap-6 items-start">
      {sendersBlock}
      {subscribersBlock}
    </div>
  )
}
