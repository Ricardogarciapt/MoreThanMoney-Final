"use client"

import { useMemo } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Shield, CheckCircle, XCircle } from "lucide-react"
import type { UserManagement } from "@/lib/admin-types"

interface MtmAutoManagementProps {
  users: UserManagement[]
  onRefresh: () => void
}

export default function MtmAutoManagement({ users, onRefresh }: MtmAutoManagementProps) {
  const { toast } = useToast()

  const mtmPending = useMemo(
    () => users.filter((u) => u.mtm_auto_requested && !u.mtm_auto_enabled),
    [users]
  )
  const mtmEnabled = useMemo(() => users.filter((u) => u.mtm_auto_enabled), [users])

  const updateMtmAutoUser = async (
    payload: Record<string, string | boolean>,
    successTitle: string,
    errorTitle: string,
    successDescription?: string
  ) => {
    try {
      const { adminApiCall } = await import("@/lib/admin-helpers")
      const result = await adminApiCall("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify(payload),
      })

      if (result.success) {
        onRefresh()
        toast({ title: successTitle, description: successDescription })
        return
      }

      toast({
        title: errorTitle,
        description: result.error || "Tenta novamente.",
        variant: "destructive",
      })
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Erro desconhecido."
      toast({
        title: errorTitle,
        description: message,
        variant: "destructive",
      })
    }
  }

  return (
    <Card className="card-clean">
      <CardHeader>
        <CardTitle className="text-mtm-primary flex items-center gap-2">
          <Shield className="h-5 w-5" />
          Gestão MTM Auto
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="rounded-xl border border-[#D2A63C]/25 bg-[#D2A63C]/5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[#D2A63C]">Pedidos de acesso</h3>
            <Badge className="bg-black/40 text-[#D2A63C] border-[#D2A63C]/40">
              Pendentes: {mtmPending.length}
            </Badge>
          </div>
          <div className="space-y-2">
            {mtmPending.length === 0 ? (
              <p className="text-xs text-gray-400">Sem pedidos pendentes de acesso ao MTM Auto.</p>
            ) : (
              mtmPending.map((u) => (
                <div
                  key={`mtm-pending-${u.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700/60 bg-gray-900/60 px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-white">{u.full_name || u.username}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      className="bg-green-600 hover:bg-green-700 text-white"
                      onClick={() =>
                        updateMtmAutoUser(
                          { userId: u.id, mtm_auto_enabled: true },
                          "Acesso MTM Auto aprovado",
                          "Erro no acesso MTM Auto",
                          "Utilizador pode aceder a cópias e estratégias."
                        )
                      }
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Aprovar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-gray-200 border-gray-600"
                      onClick={() =>
                        updateMtmAutoUser(
                          { userId: u.id, mtm_auto_requested: false },
                          "Pedido MTM Auto removido",
                          "Erro ao atualizar pedido"
                        )
                      }
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Recusar
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
          <h3 className="text-sm font-semibold text-blue-300 mb-3">Acessos ativos e admins</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {mtmEnabled.length === 0 ? (
              <p className="text-xs text-gray-500">Ainda não existem utilizadores com acesso ao MTM Auto.</p>
            ) : (
              mtmEnabled.map((u) => (
                <div
                  key={`mtm-enabled-${u.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-700/60 bg-gray-900/40 px-3 py-2"
                >
                  <div>
                    <p className="text-sm text-white">{u.full_name || u.username}</p>
                    <p className="text-xs text-gray-400">{u.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      className={
                        u.mtm_auto_admin
                          ? "bg-red-600/20 text-red-300 border-red-500/40"
                          : "bg-blue-600/20 text-blue-300 border-blue-500/40"
                      }
                    >
                      {u.mtm_auto_admin ? "Admin MTM Auto" : "Cliente MTM Auto"}
                    </Badge>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-gray-600 text-gray-200"
                      onClick={() =>
                        updateMtmAutoUser(
                          { userId: u.id, mtm_auto_admin: !u.mtm_auto_admin },
                          u.mtm_auto_admin ? "Admin MTM Auto removido" : "Promovido a Admin MTM Auto",
                          "Erro ao alterar Admin MTM Auto",
                          u.mtm_auto_admin
                            ? "Mantém acesso de cliente ao MTM Auto."
                            : "Agora pode gerir operações no MTM Auto."
                        )
                      }
                    >
                      <Shield className="w-4 h-4 mr-1" />
                      {u.mtm_auto_admin ? "Remover admin" : "Tornar admin"}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </CardContent>
    </Card>
  )
}
