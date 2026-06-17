"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { Users, UserCheck, UserPlus, FileText, Activity, Loader2, AlertTriangle, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { AdminStats } from "@/lib/admin-types"
import { useToast } from "@/hooks/use-toast"

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
  const { toast } = useToast()
  const [forceLogoutLoading, setForceLogoutLoading] = useState(false)

  const runForceLogout = async (dryRun: boolean) => {
    setForceLogoutLoading(true)
    try {
      const { adminApiCall } = await import("@/lib/admin-helpers")
      const result = await adminApiCall<{
        success?: boolean
        message?: string
        would_affect?: number
        signed_out?: number
      }>("/api/admin/access-migration/force-logout", {
        method: "POST",
        body: JSON.stringify({ dry_run: dryRun }),
      })
      if (result.success) {
        toast({
          title: dryRun ? "Simulação concluída" : "Logout global executado",
          description:
            result.data?.message ||
            (dryRun
              ? `${result.data?.would_affect ?? 0} utilizadores seriam afectados`
              : `${result.data?.signed_out ?? 0} sessões terminadas`),
        })
      } else {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      }
    } finally {
      setForceLogoutLoading(false)
    }
  }

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

  const skoolPending = stats?.skool_pending_stripe ?? 0

  return (
    <div className="space-y-8">
      {skoolPending > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-400 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-200">
                  {skoolPending} subscrição(ões) Premium Stripe — Skool manual
                </h3>
                <p className="text-sm text-amber-100/80 mt-1">
                  Novos membros pagaram 65€ via Stripe. Adiciona o acesso no Skool e confirma em Utilizadores.
                </p>
              </div>
            </div>
            <Link href="/admin?tab=users&filter=skool_pending">
              <Button className="bg-amber-600 hover:bg-amber-700 text-white shrink-0">
                Abrir Utilizadores
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-red-500/30 bg-red-950/20 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <LogOut className="h-6 w-6 shrink-0 text-red-400 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-200">Migração de packs — logout global</h3>
              <p className="text-sm text-red-100/80 mt-1">
                Desloga todos os membros (excepto admin e educadores LMS) e obriga revalidação em
                /access-migration com Stripe, Skool ou IQONIC.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button
              variant="outline"
              className="border-red-500/40"
              disabled={forceLogoutLoading}
              onClick={() => void runForceLogout(true)}
            >
              Simular
            </Button>
            <Button
              className="bg-red-700 hover:bg-red-800 text-white"
              disabled={forceLogoutLoading}
              onClick={() => void runForceLogout(false)}
            >
              {forceLogoutLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Executar logout"}
            </Button>
          </div>
        </div>
      </div>

      <div>
        <h2 className="mb-4 text-lg font-semibold tracking-tight text-white">Resumo</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {cards.map((c) => {
            const Icon = c.icon
            return (
              <Card
                key={c.title}
                className={`border ${c.border} bg-gray-950/80 backdrop-blur-sm transition-shadow hover:shadow-lg`}
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

      <Card className="border-[#D2A63C]/20 bg-gray-950/80 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg tracking-tight text-[#D2A63C]">
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
