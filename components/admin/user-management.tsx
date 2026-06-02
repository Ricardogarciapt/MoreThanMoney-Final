"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import {
  CheckCircle,
  UserPlus,
  Trash2,
  Search,
  RefreshCw,
  Loader2,
  Timer,
} from "lucide-react"
import type { UserManagement } from "@/lib/admin-types"
import {
  isSubscriptionCategory,
  subscriptionStatusLabel,
  MEMBER_SUBSCRIPTION_DAYS,
} from "@/lib/member-subscription"

function parseRoleValue(value: string): { user_type: string; member_category: string } {
  const [user_type, member_category] = value.split("-")
  return { user_type, member_category: member_category || "standard" }
}

function roleValueFromUserFixed(user: UserManagement): string {
  if (user.user_type === "inactive") return "inactive-standard"
  if (user.user_type === "admin") return "admin-standard"
  if (user.user_type === "vip") return "vip-standard"
  if (user.user_type === "guest" || user.user_type === "presentation") return "guest-standard"
  const cat = user.member_category || "standard"
  if (cat === "iq") return "member-iq"
  if (cat === "skool") return "member-skool"
  if (cat === "premium") return "member-premium"
  return "member-standard"
}

interface UserManagementProps {
  users?: UserManagement[]
  onApprove: (userId: string) => void
  onRefresh?: () => void
}

export default function UserManagementComponent({
  users: usersProp,
  onApprove,
  onRefresh,
}: UserManagementProps) {
  const { toast } = useToast()
  const [users, setUsers] = useState<UserManagement[]>(usersProp || [])
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [debouncedSearch, setDebouncedSearch] = useState("")
  const [filterUserType, setFilterUserType] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [filterSubscription, setFilterSubscription] = useState<string>("all")

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [togglingInactiveId, setTogglingInactiveId] = useState<string | null>(null)
  const [renewingId, setRenewingId] = useState<string | null>(null)

  const [newUser, setNewUser] = useState({
    email: "",
    username: "",
    full_name: "",
    password: "",
    phone: "",
    whatsapp: "",
    user_type: "member" as "admin" | "vip" | "guest" | "inactive" | "member",
    member_category: "standard" as "standard" | "iq" | "skool" | "premium",
  })

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350)
    return () => clearTimeout(t)
  }, [search])

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const { adminApiCall } = await import("@/lib/admin-helpers")
      const params = new URLSearchParams({ limit: "300" })
      if (debouncedSearch.length >= 2) params.set("q", debouncedSearch)
      if (filterUserType !== "all") params.set("user_type", filterUserType)
      if (filterCategory !== "all") params.set("member_category", filterCategory)
      if (filterStatus !== "all") params.set("status", filterStatus)
      if (filterSubscription !== "all") params.set("subscription", filterSubscription)

      const result = await adminApiCall<{
        data?: UserManagement[]
        count?: number
      }>(`/api/admin/users?${params.toString()}`, { useCache: false })

      if (result.success && result.data) {
        const payload = result.data as { data?: UserManagement[]; count?: number }
        const list = Array.isArray(payload) ? payload : payload.data
        setUsers(Array.isArray(list) ? list : [])
        setTotalCount(
          typeof payload === "object" && !Array.isArray(payload) && payload.count != null
            ? payload.count
            : list?.length || 0
        )
      } else {
        toast({
          title: "Erro ao carregar",
          description: result.error || "Tenta novamente.",
          variant: "destructive",
        })
      }
    } finally {
      setLoading(false)
    }
  }, [
    debouncedSearch,
    filterUserType,
    filterCategory,
    filterStatus,
    filterSubscription,
    toast,
  ])

  useEffect(() => {
    loadUsers()
  }, [loadUsers])

  useEffect(() => {
    if (usersProp?.length) setUsers(usersProp)
  }, [usersProp])

  const stats = useMemo(() => {
    return {
      total: users.length,
      pending: users.filter((u) => u.user_type === "pending").length,
      iqSkool: users.filter((u) => isSubscriptionCategory(u.member_category)).length,
      trial: users.filter((u) => u.user_type === "guest" || u.user_type === "presentation").length,
    }
  }, [users])

  const patchUser = async (
    userId: string,
    body: Record<string, unknown>
  ): Promise<boolean> => {
    const { adminApiCall } = await import("@/lib/admin-helpers")
    const result = await adminApiCall("/api/admin/users", {
      method: "PATCH",
      body: JSON.stringify({ userId, ...body }),
    })
    if (result.success) {
      await loadUsers()
      onRefresh?.()
      return true
    }
    toast({
      title: "Erro",
      description: result.error || "Tenta novamente.",
      variant: "destructive",
    })
    return false
  }

  const handleChangeRole = async (userId: string, roleValue: string) => {
    const { user_type, member_category } = parseRoleValue(roleValue)
    const ok = await patchUser(userId, { user_type, member_category })
    if (ok) {
      toast({ title: "Estado atualizado", description: `${user_type} / ${member_category}` })
    }
  }

  const handleToggleInactive = async (userId: string, makeInactive: boolean) => {
    setTogglingInactiveId(userId)
    const body = makeInactive
      ? { user_type: "inactive", is_active: false }
      : { user_type: "member", is_active: true }
    const ok = await patchUser(userId, body)
    if (ok) {
      toast({
        title: makeInactive ? "Conta inativa" : "Conta reativada",
        description: makeInactive
          ? "Sem acesso às áreas de membro."
          : "Repõe como Membro — ajusta IQ/Skool/VIP no menu se necessário.",
      })
    }
    setTogglingInactiveId(null)
  }

  const handleRenewSubscription = async (userId: string) => {
    setRenewingId(userId)
    const ok = await patchUser(userId, { renew_subscription: true })
    if (ok) {
      toast({
        title: "Subscrição renovada",
        description: `+${MEMBER_SUBSCRIPTION_DAYS} dias de acesso.`,
      })
    }
    setRenewingId(null)
  }

  const handleToggleAutoRenew = async (userId: string, enabled: boolean) => {
    const ok = await patchUser(userId, { subscription_auto_renew: enabled })
    if (ok) {
      toast({
        title: enabled ? "Auto-renovação ativa" : "Auto-renovação desligada",
      })
    }
  }

  const handleChangeOnboardingPlatform = async (
    userId: string,
    platform: "vxa" | "rfg" | null
  ) => {
    const ok = await patchUser(userId, { onboarding_platform: platform })
    if (ok) {
      toast({ title: "Plataforma IQ atualizada" })
    }
  }

  const handleAddUser = async () => {
    try {
      setIsSubmitting(true)
      if (!newUser.email || !newUser.username || !newUser.password || !newUser.full_name) {
        toast({
          title: "Campos obrigatórios",
          description: "Email, username, password e nome completo.",
          variant: "destructive",
        })
        return
      }
      const { adminApiCall } = await import("@/lib/admin-helpers")
      const result = await adminApiCall("/api/admin/create-user", {
        method: "POST",
        body: JSON.stringify(newUser),
      })
      if (result.success) {
        toast({ title: "Utilizador criado" })
        setIsAddDialogOpen(false)
        await loadUsers()
        onRefresh?.()
      } else {
        toast({
          title: "Erro",
          description: result.error,
          variant: "destructive",
        })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return
    try {
      setIsSubmitting(true)
      const response = await fetch(`/api/admin/delete-user`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUser }),
      })
      const result = await response.json()
      if (response.ok) {
        toast({ title: "Utilizador apagado" })
        setIsDeleteDialogOpen(false)
        setSelectedUser(null)
        await loadUsers()
        onRefresh?.()
      } else {
        toast({ title: "Erro", description: result.error, variant: "destructive" })
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const clearFilters = () => {
    setSearch("")
    setFilterUserType("all")
    setFilterCategory("all")
    setFilterStatus("all")
    setFilterSubscription("all")
  }

  return (
    <Card className="card-clean border-[#D2A63C]/20">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="text-mtm-primary">Utilizadores</CardTitle>
          <p className="text-sm text-gray-400 mt-1">
            {totalCount > users.length
              ? `${users.length} de ${totalCount} resultados`
              : `${users.length} utilizadores`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-gray-600"
            onClick={() => loadUsers()}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-green-600 hover:bg-green-700 text-white" size="sm">
                <UserPlus className="w-4 h-4 mr-2" />
                Novo
              </Button>
            </DialogTrigger>
            <DialogContent className="bg-gray-900 text-white border-mtm-primary max-w-2xl admin-dialog-content max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-mtm-primary">Criar utilizador</DialogTitle>
                <DialogDescription className="text-gray-400">
                  IQ/Skool recebem automaticamente {MEMBER_SUBSCRIPTION_DAYS} dias com
                  auto-renovação.
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label>Estado *</Label>
                  <Select
                    value={`${newUser.user_type}-${newUser.member_category}`}
                    onValueChange={(value) => {
                      const { user_type, member_category } = parseRoleValue(value)
                      setNewUser({
                        ...newUser,
                        user_type: user_type as typeof newUser.user_type,
                        member_category: member_category as typeof newUser.member_category,
                      })
                    }}
                  >
                    <SelectTrigger className="input-focus">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-mtm-primary">
                      <SelectItem value="admin-standard">👑 Admin</SelectItem>
                      <SelectItem value="vip-standard">⭐ VIP</SelectItem>
                      <SelectItem value="member-premium">💎 Membro Premium 65€ (30d auto)</SelectItem>
                      <SelectItem value="member-iq">🎓 Membro IQ (30d auto)</SelectItem>
                      <SelectItem value="member-skool">📚 Membro Skool (30d auto)</SelectItem>
                      <SelectItem value="member-standard">👤 Membro App 35€</SelectItem>
                      <SelectItem value="guest-standard">🆓 Free Trial (7d)</SelectItem>
                      <SelectItem value="inactive-standard">🚫 Inativo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Email *</Label>
                  <Input
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    className="input-focus"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Username *</Label>
                  <Input
                    value={newUser.username}
                    onChange={(e) => setNewUser({ ...newUser, username: e.target.value })}
                    className="input-focus"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Nome *</Label>
                  <Input
                    value={newUser.full_name}
                    onChange={(e) => setNewUser({ ...newUser, full_name: e.target.value })}
                    className="input-focus"
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label>Password *</Label>
                  <Input
                    type="password"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    className="input-focus"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddUser} disabled={isSubmitting} className="btn-mtm-primary">
                  {isSubmitting ? "A criar…" : "Criar"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-gray-600">
            Total lista: {stats.total}
          </Badge>
          <Badge variant="outline" className="border-amber-600/50 text-amber-300">
            Pendentes: {stats.pending}
          </Badge>
          <Badge variant="outline" className="border-purple-600/50 text-purple-300">
            IQ/Skool: {stats.iqSkool}
          </Badge>
          <Badge variant="outline" className="border-cyan-600/50 text-cyan-300">
            Trials: {stats.trial}
          </Badge>
        </div>

        <div className="grid gap-3 rounded-xl border border-gray-700/80 bg-gray-900/40 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <Input
              placeholder="Pesquisar email, nome ou username…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-focus pl-9"
            />
          </div>
          <Select value={filterUserType} onValueChange={setFilterUserType}>
            <SelectTrigger className="input-focus">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="vip">VIP</SelectItem>
              <SelectItem value="member">Membro</SelectItem>
              <SelectItem value="guest">Free Trial</SelectItem>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="inactive">Inativo</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCategory} onValueChange={setFilterCategory}>
            <SelectTrigger className="input-focus">
              <SelectValue placeholder="Categoria" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">Todas categorias</SelectItem>
              <SelectItem value="premium">Premium 65€</SelectItem>
              <SelectItem value="iq">IQ</SelectItem>
              <SelectItem value="skool">Skool</SelectItem>
              <SelectItem value="vip">VIP (cat.)</SelectItem>
              <SelectItem value="standard">App 35€</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="input-focus">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">Todos estados</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="inactive">Inativos</SelectItem>
              <SelectItem value="pending">Pendentes</SelectItem>
              <SelectItem value="subscription_iq_skool">Só IQ/Skool</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterSubscription} onValueChange={setFilterSubscription}>
            <SelectTrigger className="input-focus w-full sm:w-[220px]">
              <SelectValue placeholder="Subscrição" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">Subscrição: todas</SelectItem>
              <SelectItem value="expiring_soon">Expira em 7 dias</SelectItem>
              <SelectItem value="expired">Subscrição expirada</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>

        {loading && users.length === 0 ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-12 text-center text-gray-500">Nenhum utilizador encontrado.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead className="bg-gray-800/80 text-xs uppercase text-gray-400">
                <tr>
                  <th className="px-3 py-3">Utilizador</th>
                  <th className="px-3 py-3">Estado / Role</th>
                  <th className="px-3 py-3">Subscrição</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-800/40">
                    <td className="px-3 py-3 align-top">
                      <p className="font-medium text-white">
                        {user.full_name || user.username}
                      </p>
                      <p className="text-xs text-gray-400">{user.email}</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {user.xp && (
                          <Badge className="text-[10px] bg-[#D2A63C]/15 text-[#D2A63C]">
                            Nv {user.xp.level}
                          </Badge>
                        )}
                        {user.is_verified && (
                          <Badge className="text-[10px] bg-blue-600/20 text-blue-300">
                            Verificado
                          </Badge>
                        )}
                        {(user.user_type === "guest" || user.user_type === "presentation") &&
                          user.trial_expires_at && (
                            <Badge className="text-[10px] bg-orange-500/20 text-orange-300">
                              Trial:{" "}
                              {new Date(user.trial_expires_at).toLocaleDateString("pt-PT")}
                            </Badge>
                          )}
                      </div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <Select
                        value={roleValueFromUserFixed(user)}
                        onValueChange={(v) => handleChangeRole(user.id, v)}
                      >
                        <SelectTrigger className="h-9 w-full max-w-[200px] bg-gray-800 border-gray-600">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700">
                          <SelectItem value="inactive-standard">🚫 Inativo</SelectItem>
                          <SelectItem value="admin-standard">👑 Admin</SelectItem>
                          <SelectItem value="vip-standard">⭐ VIP</SelectItem>
                          <SelectItem value="member-premium">💎 Premium 65€</SelectItem>
                          <SelectItem value="member-iq">🎓 IQ</SelectItem>
                          <SelectItem value="member-skool">📚 Skool</SelectItem>
                          <SelectItem value="member-standard">👤 App 35€</SelectItem>
                          <SelectItem value="guest-standard">🆓 Free Trial</SelectItem>
                        </SelectContent>
                      </Select>
                      <div className="mt-2 flex items-center gap-2">
                        <Switch
                          id={`inactive-${user.id}`}
                          checked={user.user_type === "inactive"}
                          disabled={togglingInactiveId === user.id}
                          onCheckedChange={(c) => handleToggleInactive(user.id, c)}
                        />
                        <Label htmlFor={`inactive-${user.id}`} className="text-xs text-gray-400">
                          Inativo
                        </Label>
                      </div>
                      {user.member_category === "iq" && (
                        <Select
                          value={user.onboarding_platform || "default"}
                          onValueChange={(v) =>
                            handleChangeOnboardingPlatform(
                              user.id,
                              v === "default" ? null : (v as "vxa" | "rfg")
                            )
                          }
                        >
                          <SelectTrigger className="mt-2 h-8 text-xs bg-blue-900/30 border-blue-700/50">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-gray-900">
                            <SelectItem value="default">IQ — Padrão</SelectItem>
                            <SelectItem value="rfg">IQ — RFG</SelectItem>
                            <SelectItem value="vxa">IQ — VXA</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top">
                      {isSubscriptionCategory(user.member_category) ? (
                        <div className="space-y-2">
                          <div className="flex items-start gap-1.5 text-xs text-[#D2A63C]">
                            <Timer className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                            <span>{subscriptionStatusLabel(user)}</span>
                          </div>
                          {user.subscription_expires_at && (
                            <p className="text-[10px] text-gray-500">
                              Até:{" "}
                              {new Date(user.subscription_expires_at).toLocaleString("pt-PT", {
                                dateStyle: "short",
                                timeStyle: "short",
                              })}
                            </p>
                          )}
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={user.subscription_auto_renew !== false}
                              onCheckedChange={(c) =>
                                handleToggleAutoRenew(user.id, c)
                              }
                            />
                            <span className="text-[10px] text-gray-400">Auto 30d</span>
                          </div>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs border-[#D2A63C]/40"
                            disabled={renewingId === user.id}
                            onClick={() => handleRenewSubscription(user.id)}
                          >
                            {renewingId === user.id ? "…" : `+${MEMBER_SUBSCRIPTION_DAYS}d`}
                          </Button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 align-top text-right">
                      <div className="flex flex-col items-end gap-2">
                        {user.user_type === "pending" && (
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => onApprove(user.id)}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Aprovar
                          </Button>
                        )}
                        <Dialog
                          open={isDeleteDialogOpen && selectedUser === user.id}
                          onOpenChange={(open) => {
                            setIsDeleteDialogOpen(open)
                            if (open) setSelectedUser(user.id)
                            else setSelectedUser(null)
                          }}
                        >
                          <DialogTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-400 border-red-500/30"
                              onClick={() => setSelectedUser(user.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="bg-gray-900 border-red-500 text-white">
                            <DialogHeader>
                              <DialogTitle className="text-red-400">Apagar utilizador</DialogTitle>
                              <DialogDescription>
                                Irreversível. {user.email}
                              </DialogDescription>
                            </DialogHeader>
                            <DialogFooter>
                              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                                Cancelar
                              </Button>
                              <Button
                                className="bg-red-600"
                                disabled={isSubmitting}
                                onClick={handleDeleteUser}
                              >
                                Apagar
                              </Button>
                            </DialogFooter>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
