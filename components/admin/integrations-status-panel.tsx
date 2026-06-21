"use client"

import { useState, useEffect, useCallback, type ReactNode } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Database,
  CreditCard,
  Users,
  Mail,
  Send,
  Globe,
  MessageCircle,
  RefreshCw,
  CheckCircle,
  XCircle,
  ExternalLink,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"

interface IntegrationStatus {
  id: string
  name: string
  category: string
  configured: boolean
  connected: boolean
  detail: string
  envKeys: string[]
  adminLink: string | null
}

const ICONS: Record<string, ReactNode> = {
  supabase: <Database className="w-5 h-5" />,
  stripe: <CreditCard className="w-5 h-5" />,
  mlm: <Users className="w-5 h-5" />,
  gmail: <Mail className="w-5 h-5" />,
  telegram: <Send className="w-5 h-5" />,
  vercel: <Globe className="w-5 h-5" />,
  chat_channels: <MessageCircle className="w-5 h-5" />,
}

export default function IntegrationsStatusPanel() {
  const [integrations, setIntegrations] = useState<IntegrationStatus[]>([])
  const [summary, setSummary] = useState<{ total: number; connected: number; configured: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/admin/system-status")
      const data = await res.json()
      if (data.success) {
        setIntegrations(data.integrations || [])
        setSummary(data.summary || null)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <RefreshCw className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <Card className="bg-gray-900/50 border-gray-700/50">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-white">{summary.total}</p>
              <p className="text-xs text-gray-400">Integrações</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-green-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-400">{summary.connected}</p>
              <p className="text-xs text-gray-400">Ligadas</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-amber-500/30">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-amber-400">{summary.configured}</p>
              <p className="text-xs text-gray-400">Configuradas</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-3">
        {integrations.map((item) => (
          <div
            key={item.id}
            className="flex items-start justify-between gap-4 rounded-lg border border-gray-700/50 bg-gray-800/40 p-4"
          >
            <div className="flex gap-3 flex-1 min-w-0">
              <div className="text-[#D2A63C] shrink-0 mt-0.5">{ICONS[item.id] ?? <Globe className="w-5 h-5" />}</div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h4 className="text-white font-medium">{item.name}</h4>
                  {item.connected ? (
                    <Badge className="bg-green-500/20 text-green-400 text-xs">
                      <CheckCircle className="w-3 h-3 mr-1" />
                      OK
                    </Badge>
                  ) : item.configured ? (
                    <Badge className="bg-amber-500/20 text-amber-400 text-xs">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Parcial
                    </Badge>
                  ) : (
                    <Badge className="bg-red-500/20 text-red-400 text-xs">
                      <XCircle className="w-3 h-3 mr-1" />
                      Em falta
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-gray-400">{item.detail}</p>
                {item.envKeys.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1 font-mono truncate">
                    {item.envKeys.join(" · ")}
                  </p>
                )}
              </div>
            </div>
            {item.adminLink && (
              <Link href={item.adminLink} target={item.adminLink.startsWith("http") ? "_blank" : undefined}>
                <Button size="sm" variant="outline" className="border-[#D2A63C]/40 shrink-0">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  Abrir
                </Button>
              </Link>
            )}
          </div>
        ))}
      </div>

      <Button variant="ghost" size="sm" onClick={load} className="text-gray-400">
        <RefreshCw className="w-4 h-4 mr-2" />
        Actualizar estado
      </Button>
    </div>
  )
}
