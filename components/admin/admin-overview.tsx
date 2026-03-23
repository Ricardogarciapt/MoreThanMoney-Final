"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Users, UserCheck, UserPlus, FileText, Activity, Loader2 } from "lucide-react"
import type { AdminStats } from "@/lib/admin-types"

interface TrialStats {
  activeTrials?: number
  expiredTrials?: number
  totalGuests?: number
  totalTrials?: number
}

export default function AdminOverview({
  stats,
  trialStats,
  loading,
}: {
  stats: AdminStats | null
  trialStats: TrialStats | null
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-10 h-10 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  const cards = [
    {
      title: "Total utilizadores",
      value: stats?.total_users ?? 0,
      icon: Users,
      color: "text-[#D2A63C]",
      bg: "bg-[#D2A63C]/10",
      border: "border-[#D2A63C]/30",
    },
    {
      title: "Ativos",
      value: stats?.active_users ?? 0,
      icon: UserCheck,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
      border: "border-emerald-500/30",
    },
    {
      title: "Membros",
      value: stats?.total_members ?? 0,
      icon: UserPlus,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
      border: "border-blue-500/30",
    },
    {
      title: "Pendentes",
      value: stats?.pending_users ?? 0,
      icon: UserPlus,
      color: "text-amber-400",
      bg: "bg-amber-500/10",
      border: "border-amber-500/30",
    },
    {
      title: "Trials ativos",
      value: trialStats?.activeTrials ?? 0,
      icon: Activity,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
      border: "border-purple-500/30",
    },
    {
      title: "Conteúdo ativo",
      value: stats?.active_content ?? 0,
      icon: FileText,
      color: "text-cyan-400",
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/30",
    },
  ]

  const recentActivity = stats?.recent_activity ?? []

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Resumo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {cards.map((c) => {
            const Icon = c.icon
            return (
              <Card
                key={c.title}
                className={`bg-gray-900/80 border ${c.border} hover:shadow-lg transition-shadow`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className={`p-2 rounded-lg ${c.bg}`}>
                      <Icon className={`w-5 h-5 ${c.color}`} />
                    </div>
                    <span className={`text-2xl font-bold ${c.color}`}>{c.value}</span>
                  </div>
                  <p className="text-sm text-gray-400 mt-2">{c.title}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>

      <Card className="bg-gray-900/80 border-[#D2A63C]/20">
        <CardHeader>
          <CardTitle className="text-[#D2A63C] flex items-center gap-2 text-lg">
            <Activity className="w-5 h-5" />
            Atividade recente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentActivity.length === 0 ? (
            <p className="text-gray-500 text-sm py-4">Nenhuma atividade recente.</p>
          ) : (
            <ul className="space-y-3 max-h-80 overflow-y-auto">
              {recentActivity.map((log: { id: string; user_email: string; action: string; details: string; timestamp: string }) => (
                <li
                  key={log.id}
                  className="flex items-start gap-3 py-2 border-b border-gray-800/50 last:border-0"
                >
                  <Badge variant="outline" className="shrink-0 border-gray-600 text-gray-300 text-xs">
                    {log.action}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-white truncate">{log.details}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {log.user_email} · {new Date(log.timestamp).toLocaleString("pt-PT")}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
