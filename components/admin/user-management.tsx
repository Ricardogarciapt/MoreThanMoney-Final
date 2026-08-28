"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useToast } from "@/hooks/use-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
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
  Settings2,
  CreditCard,
  XCircle,
  Calendar,
  Plus,
  TrendingUp,
  Bot,
} from "lucide-react"
import type { UserManagement } from "@/lib/admin-types"
import {
  isSubscriptionCategory,
  subscriptionStatusLabel,
  subscriptionDaysRemaining,
  MEMBER_SUBSCRIPTION_DAYS,
} from "@/lib/member-subscription"
import {
  readUserAddons,
  SCANNER_ADDON_PLANS,
  scannerPlanLabel,
} from "@/lib/user-addons"

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function platformInfo(platform?: string | null): { emoji: string; label: string } {
  switch (platform) {
    case "app_store": return { emoji: "🍎", label: "App Store" }
    case "skool":     return { emoji: "🏫", label: "Skool" }
    case "stripe":    return { emoji: "💳", label: "Stripe" }
    case "web":       return { emoji: "🌐", label: "Web" }
    default:          return { emoji: "🔧", label: "Manual" }
  }
}

function planLabel(plan?: string | null, category?: string | null): string {
  if (plan === "premium" || category === "premium") return "💎 Premium 65€"
  if (category === "iq") return "🎓 IQ"
  if (category === "skool") return "📚 Skool"
  if (plan === "app_member" || category === "standard") return "👤 App 35€"
  return "—"
}

function expiryColorClass(days: number | null): string {
  if (days === null) return "text-[#D2A63C]"
  if (days === 0) return "text-red-500"
  if (days <= 7) return "text-orange-400"
  return "text-[#D2A63C]"
}

// ─── Props ───────────────────────────────────────────────────────────────────

/**
 * Estado da campanha de ativação (profile_data.activation). Sem isto, no painel de utilizadores
 * um membro à espera de pagar era indistinguível de um membro simplesmente inativado.
 */
function activationState(pd: unknown): { required: boolean; decision: string | null; newMember: boolean } {
  const o = pd && typeof pd === "object" ? (pd as Record<string, unknown>) : {}
  const a = o.activation
  if (!a || typeof a !== "object") return { required: false, decision: null, newMember: false }
  const x = a as Record<string, unknown>
  return {
    required: x.required === true,
    decision: typeof x.decision === "string" ? x.decision : null,
    newMember: x.new_member === true,
  }
}

interface UserManagementProps {
  users?: UserManagement[]
  onApprove: (userId: string) => void
  onRefresh?: () => void
  highlightUserId?: string | null
  initialSkoolPendingFilter?: boolean
  initialValidationPendingFilter?: boolean
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function UserManagementComponent({
  users: usersProp,
  onApprove,
  onRefresh,
  highlightUserId,
  initialSkoolPendingFilter,
  initialValidationPendingFilter,
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
  const [filterPlatform, setFilterPlatform] = useState<string>("all")

  // Dialogs
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [togglingInactiveId, setTogglingInactiveId] = useState<string | null>(null)
  const [renewingId, setRenewingId] = useState<string | null>(null)

  // Subscription management dialog
  const [subDialogUser, setSubDialogUser] = useState<UserManagement | null>(null)
  const [isSubDialogOpen, setIsSubDialogOpen] = useState(false)
  const [customExpiryDate, setCustomExpiryDate] = useState("")
  const [customAddDays, setCustomAddDays] = useState("30")
  const [planOverride, setPlanOverride] = useState("app_member")
  const [cycleOverride, setCycleOverride] = useState("monthly")
  const [savingExpiry, setSavingExpiry] = useState(false)
  const [savingPlan, setSavingPlan] = useState(false)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [markingSkoolId, setMarkingSkoolId] = useState<string | null>(null)
  const [approvingValidationId, setApprovingValidationId] = useState<string | null>(null)

  // Addons (scanners + MTMcopier)
  const [addonScannerPlan, setAddonScannerPlan] = useState<string>("none")
  const [addonScannerTv, setAddonScannerTv] = useState("")
  const [addonScannerExpiry, setAddonScannerExpiry] = useState("")
  const [addonMtmcopyActive, setAddonMtmcopyActive] = useState(false)
  const [addonMtmcopyExpiry, setAddonMtmcopyExpiry] = useState("")
  const [savingAddons, setSavingAddons] = useState(false)

  const [newUser, setNewUser] = useState({
    email: "",
    username: "",
    full_name: "",
    password: "",
    phone: "",
    whatsapp: "",
    user_type: "member" as "admin" | "vip" | "guest" | "inactive" | "member",
    member_category: "standard" as "standard" | "iq" | "skool" | "premium",
    subscription_billing_cycle: "monthly" as "monthly" | "annual",
  })

  // Debounce search
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
      if (filterSubscription === "skool_pending") {
        params.set("skool_pending", "true")
      } else if (filterSubscription === "access_validation_pending") {
        params.set("access_validation_pending", "true")
      } else if (filterSubscription !== "all") {
        params.set("subscription", filterSubscription)
      }
      if (filterPlatform !== "all") params.set("subscription_platform", filterPlatform)

      const result = await adminApiCall<{ data?: UserManagement[]; count?: number }>(
        `/api/admin/users?${params.toString()}`,
        { useCache: false }
      )

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
  }, [debouncedSearch, filterUserType, filterCategory, filterStatus, filterSubscription, filterPlatform, toast])

  useEffect(() => {
    if (initialSkoolPendingFilter) setFilterSubscription("skool_pending")
    if (initialValidationPendingFilter) setFilterSubscription("access_validation_pending")
  }, [initialSkoolPendingFilter, initialValidationPendingFilter])

  useEffect(() => { loadUsers() }, [loadUsers])
  useEffect(() => { if (usersProp?.length) setUsers(usersProp) }, [usersProp])

  useEffect(() => {
    if (!highlightUserId) return
    const timer = setTimeout(() => {
      document.getElementById(`admin-user-${highlightUserId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      })
    }, 400)
    return () => clearTimeout(timer)
  }, [highlightUserId, users])

  // ─── Stats ───────────────────────────────────────────────────────────────────

  const stats = useMemo(() => ({
    total: users.length,
    pending: users.filter((u) => u.user_type === "pending").length,
    premium: users.filter((u) => u.member_category === "premium").length,
    iq: users.filter((u) => u.member_category === "iq").length,
    skool: users.filter((u) => u.member_category === "skool").length,
    standard: users.filter((u) => u.member_category === "standard" && u.user_type === "member").length,
    appStore: users.filter((u) => u.subscription_platform === "app_store").length,
    trial: users.filter((u) => u.user_type === "guest" || u.user_type === "presentation").length,
    expiringSoon: users.filter((u) => {
      if (!isSubscriptionCategory(u.member_category)) return false
      const d = subscriptionDaysRemaining(u.subscription_expires_at)
      return d !== null && d <= 7
    }).length,
    skoolPending: users.filter((u) => u.skool_access_pending).length,
    aguardaPagamento: users.filter((u) => activationState(u.profile_data).required).length,
    validationPending: users.filter((u) => u.access_validation_pending).length,
  }), [users])

  // ─── Shared patch helper ──────────────────────────────────────────────────────

  const patchUser = async (userId: string, body: Record<string, unknown>): Promise<boolean> => {
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
    toast({ title: "Erro", description: result.error || "Tenta novamente.", variant: "destructive" })
    return false
  }

  // ─── Open subscription dialog ─────────────────────────────────────────────────

  const openSubDialog = (user: UserManagement) => {
    setSubDialogUser(user)
    setCustomExpiryDate(
      user.subscription_expires_at
        ? new Date(user.subscription_expires_at).toISOString().slice(0, 16)
        : ""
    )
    setPlanOverride(user.subscription_plan || "app_member")
    setCycleOverride(user.subscription_billing_cycle || "monthly")
    setCustomAddDays("30")

    const addons = readUserAddons(user.profile_data)
    setAddonScannerPlan(addons.scanner?.active ? addons.scanner.plan_id : "none")
    setAddonScannerTv(
      addons.scanner?.tradingview_username || user.tradingview_username || ""
    )
    setAddonScannerExpiry(
      addons.scanner?.expires_at
        ? new Date(addons.scanner.expires_at).toISOString().slice(0, 16)
        : ""
    )
    setAddonMtmcopyActive(
      user.mtmcopy_subscription_active === true || addons.mtmcopy?.active === true
    )
    setAddonMtmcopyExpiry(
      user.mtmcopy_subscription_expires_at || addons.mtmcopy?.expires_at
        ? new Date(
            user.mtmcopy_subscription_expires_at || addons.mtmcopy?.expires_at || ""
          ).toISOString().slice(0, 16)
        : ""
    )

    setIsSubDialogOpen(true)
  }

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleChangeRole = async (userId: string, roleValue: string) => {
    const { user_type, member_category } = parseRoleValue(roleValue)
    const ok = await patchUser(userId, { user_type, member_category })
    if (ok) toast({ title: "Estado atualizado", description: `${user_type} / ${member_category}` })
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
    if (ok) toast({ title: "Subscrição renovada", description: `+${MEMBER_SUBSCRIPTION_DAYS} dias de acesso.` })
    setRenewingId(null)
  }

  const handleToggleAutoRenew = async (userId: string, enabled: boolean) => {
    const ok = await patchUser(userId, { subscription_auto_renew: enabled })
    if (ok) toast({ title: enabled ? "Auto-renovação ativa" : "Auto-renovação desligada" })
  }

  const handleChangeOnboardingPlatform = async (userId: string, platform: "vxa" | "rfg" | null) => {
    const ok = await patchUser(userId, { onboarding_platform: platform })
    if (ok) toast({ title: "Plataforma IQ atualizada" })
  }

  const handleMarkSkoolGranted = async (userId: string) => {
    setMarkingSkoolId(userId)
    const ok = await patchUser(userId, { mark_skool_granted: true })
    if (ok) {
      toast({
        title: "Skool confirmado",
        description: "Acesso manual registado. Notificações marcadas como lidas.",
      })
    }
    setMarkingSkoolId(null)
  }

  const handleApproveValidation = async (userId: string) => {
    setApprovingValidationId(userId)
    const { adminApiCall } = await import("@/lib/admin-helpers")
    const result = await adminApiCall<{ success?: boolean; coupon_code?: string; message?: string }>(
      "/api/admin/access-migration/approve",
      { method: "POST", body: JSON.stringify({ user_id: userId, action: "approve" }) },
    )
    if (result.success) {
      toast({
        title: "Acesso validado",
        description: result.data?.message || "Membro pode voltar a fazer login.",
      })
      await loadUsers()
    } else {
      toast({ title: "Erro", description: result.error, variant: "destructive" })
    }
    setApprovingValidationId(null)
  }

  // Subscription dialog handlers
  const handleSetCustomExpiry = async () => {
    if (!subDialogUser || !customExpiryDate) return
    setSavingExpiry(true)
    const ok = await patchUser(subDialogUser.id, {
      subscription_expires_at_custom: new Date(customExpiryDate).toISOString(),
    })
    if (ok) {
      toast({ title: "Validade atualizada" })
      setSubDialogUser((prev) =>
        prev ? { ...prev, subscription_expires_at: new Date(customExpiryDate).toISOString() } : null
      )
    }
    setSavingExpiry(false)
  }

  const handleAddDays = async () => {
    if (!subDialogUser) return
    const days = parseInt(customAddDays, 10)
    if (isNaN(days) || days <= 0) return
    const ok = await patchUser(subDialogUser.id, { add_days: days })
    if (ok) toast({ title: `+${days} dias adicionados` })
  }

  const handleSetPlan = async () => {
    if (!subDialogUser) return
    setSavingPlan(true)
    const ok = await patchUser(subDialogUser.id, {
      subscription_plan: planOverride,
      subscription_billing_cycle: cycleOverride,
    })
    if (ok) toast({ title: "Plano atualizado" })
    setSavingPlan(false)
  }

  const handleSaveAddons = async () => {
    if (!subDialogUser) return
    setSavingAddons(true)
    const payload: Record<string, unknown> = {
      update_addons: {
        scanner_plan_id: addonScannerPlan === "none" ? null : addonScannerPlan,
        scanner_active: addonScannerPlan !== "none",
        scanner_tradingview_username: addonScannerTv.trim() || undefined,
        scanner_expires_at:
          addonScannerPlan !== "none" && addonScannerExpiry
            ? new Date(addonScannerExpiry).toISOString()
            : addonScannerPlan !== "none"
              ? null
              : undefined,
        mtmcopy_active: addonMtmcopyActive,
        mtmcopy_expires_at:
          addonMtmcopyActive && addonMtmcopyExpiry
            ? new Date(addonMtmcopyExpiry).toISOString()
            : undefined,
      },
    }
    const ok = await patchUser(subDialogUser.id, payload)
    if (ok) toast({ title: "Addons actualizados", description: "Scanners e MTMcopier sincronizados." })
    setSavingAddons(false)
  }

  const handleCancelSubscription = async (userId: string) => {
    setCancellingId(userId)
    const ok = await patchUser(userId, { cancel_subscription: true })
    if (ok) {
      toast({ title: "Subscrição cancelada", description: "Conta desativada.", variant: "destructive" })
      setIsSubDialogOpen(false)
    }
    setCancellingId(null)
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
        toast({ title: "Erro", description: result.error, variant: "destructive" })
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
    setFilterPlatform("all")
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

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

          {/* ── Criar utilizador ── */}
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
                  IQ/Skool/Premium recebem automaticamente {MEMBER_SUBSCRIPTION_DAYS} dias com auto-renovação.
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

                {/* Ciclo de faturação — só para planos com subscrição */}
                {["member-premium", "member-iq", "member-skool"].includes(
                  `${newUser.user_type}-${newUser.member_category}`
                ) && (
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Ciclo de faturação</Label>
                    <Select
                      value={newUser.subscription_billing_cycle}
                      onValueChange={(v) =>
                        setNewUser({ ...newUser, subscription_billing_cycle: v as "monthly" | "annual" })
                      }
                    >
                      <SelectTrigger className="input-focus">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="monthly">📅 Mensal (30 dias)</SelectItem>
                        <SelectItem value="annual">📆 Anual (365 dias)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

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

        {stats.skoolPending > 0 && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-100">
            <p className="font-semibold text-amber-300">
              🏫 {stats.skoolPending} membro(s) Premium Stripe aguardam acesso manual no Skool
            </p>
            <p className="mt-1 text-amber-100/80">
              Adiciona cada membro no Skool e clica em &quot;Skool OK&quot; na linha correspondente.
              Também recebes alerta nas notificações do site.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="mt-3 border-amber-500/50 text-amber-200 hover:bg-amber-500/20"
              onClick={() => setFilterSubscription("skool_pending")}
            >
              Ver pendentes Skool
            </Button>
          </div>
        )}

        {/* ── Stats ── */}
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant="outline" className="border-gray-600">
            Total: {stats.total}
          </Badge>
          {stats.aguardaPagamento > 0 && (
            <Badge variant="outline" className="border-amber-500/60 text-amber-300">
              🗝️ Aguarda pagamento: {stats.aguardaPagamento}
            </Badge>
          )}
          {stats.pending > 0 && (
            <Badge variant="outline" className="border-amber-600/50 text-amber-300">
              ⏳ Pendentes: {stats.pending}
            </Badge>
          )}
          {stats.premium > 0 && (
            <Badge variant="outline" className="border-[#D2A63C]/60 text-[#D2A63C]">
              💎 Premium: {stats.premium}
            </Badge>
          )}
          {stats.iq > 0 && (
            <Badge variant="outline" className="border-purple-600/50 text-purple-300">
              🎓 IQ: {stats.iq}
            </Badge>
          )}
          {stats.skool > 0 && (
            <Badge variant="outline" className="border-blue-600/50 text-blue-300">
              📚 Skool: {stats.skool}
            </Badge>
          )}
          {stats.standard > 0 && (
            <Badge variant="outline" className="border-gray-600/50 text-gray-300">
              👤 App 35€: {stats.standard}
            </Badge>
          )}
          {stats.appStore > 0 && (
            <Badge variant="outline" className="border-gray-700/50 text-gray-400">
              🍎 App Store: {stats.appStore}
            </Badge>
          )}
          {stats.trial > 0 && (
            <Badge variant="outline" className="border-cyan-600/50 text-cyan-300">
              🆓 Trials: {stats.trial}
            </Badge>
          )}
          {stats.expiringSoon > 0 && (
            <Badge variant="outline" className="border-orange-500/60 text-orange-300">
              ⚠️ A expirar ≤7d: {stats.expiringSoon}
            </Badge>
          )}
          {stats.skoolPending > 0 && (
            <Badge variant="outline" className="border-amber-500/60 text-amber-300">
              🏫 Skool pendente: {stats.skoolPending}
            </Badge>
          )}
        </div>

        {/* ── Filtros ── */}
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
              <SelectItem value="premium">💎 Premium 65€</SelectItem>
              <SelectItem value="iq">🎓 IQ</SelectItem>
              <SelectItem value="skool">📚 Skool</SelectItem>
              <SelectItem value="vip">⭐ VIP</SelectItem>
              <SelectItem value="standard">👤 App 35€</SelectItem>
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
              <SelectItem value="subscription_iq_skool">Só subscrição</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={filterSubscription} onValueChange={setFilterSubscription}>
            <SelectTrigger className="input-focus w-full sm:w-[200px]">
              <SelectValue placeholder="Subscrição" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">Subscrição: todas</SelectItem>
              <SelectItem value="skool_pending">🏫 Skool pendente (Stripe)</SelectItem>
              <SelectItem value="expiring_soon">⚠️ Expira em 7 dias</SelectItem>
              <SelectItem value="expired">❌ Expirada</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPlatform} onValueChange={setFilterPlatform}>
            <SelectTrigger className="input-focus w-full sm:w-[180px]">
              <SelectValue placeholder="Plataforma" />
            </SelectTrigger>
            <SelectContent className="bg-gray-900 border-gray-700">
              <SelectItem value="all">Plataforma: todas</SelectItem>
              <SelectItem value="app_store">🍎 App Store</SelectItem>
              <SelectItem value="skool">🏫 Skool</SelectItem>
              <SelectItem value="stripe">💳 Stripe</SelectItem>
              <SelectItem value="web">🌐 Web</SelectItem>
            </SelectContent>
          </Select>
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            Limpar filtros
          </Button>
        </div>

        {/* ── Tabela ── */}
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
                  <th className="px-3 py-3">UID Corretora</th>
                  <th className="px-3 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {users.map((user) => {
                  const daysLeft = subscriptionDaysRemaining(user.subscription_expires_at)
                  const hasSubData =
                    isSubscriptionCategory(user.member_category) ||
                    !!user.subscription_plan ||
                    !!user.subscription_expires_at
                  const pInfo = platformInfo(user.subscription_platform)

                  const isHighlighted = highlightUserId === user.id
                  const skoolPending = user.skool_access_pending === true
                  const validationPending = user.access_validation_pending === true

                  return (
                    <tr
                      key={user.id}
                      id={`admin-user-${user.id}`}
                      className={`hover:bg-gray-800/40 ${
                        isHighlighted || skoolPending || validationPending
                          ? "bg-amber-500/10 ring-1 ring-inset ring-amber-500/40"
                          : ""
                      }`}
                    >

                      {/* ── Utilizador ── */}
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
                          {activationState(user.profile_data).required && (
                            <Badge className="text-[10px] bg-amber-500/20 text-amber-300">
                              🗝️ Aguarda pagamento
                              {activationState(user.profile_data).newMember ? " · nova inscrição" : ""}
                            </Badge>
                          )}
                          {(user.user_type === "guest" || user.user_type === "presentation") &&
                            user.trial_expires_at && (
                              <Badge className="text-[10px] bg-orange-500/20 text-orange-300">
                                Trial:{" "}
                                {new Date(user.trial_expires_at).toLocaleDateString("pt-PT")}
                              </Badge>
                            )}
                          {user.coupon_code && (
                            <Badge className="text-[10px] bg-green-900/30 text-green-300">
                              🎟 {user.coupon_code}
                            </Badge>
                          )}
                          {skoolPending && (
                            <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              🏫 Skool pendente
                            </Badge>
                          )}
                          {validationPending && (
                            <Badge className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/40">
                              🔷 Validação de acesso pendente
                            </Badge>
                          )}
                          {user.access_validation_member_id && (
                            <Badge className="text-[10px] bg-gray-800 text-gray-300">
                              ID: {user.access_validation_member_id}
                            </Badge>
                          )}
                        </div>
                      </td>

                      {/* ── Estado / Role ── */}
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
                          <Label
                            htmlFor={`inactive-${user.id}`}
                            className="text-xs text-gray-400"
                          >
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

                      {/* ── Subscrição ── */}
                      <td className="px-3 py-3 align-top">
                        {hasSubData ? (
                          <div className="space-y-1.5 min-w-[160px]">
                            {/* Plataforma + Plano */}
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-gray-400">
                              <span>{pInfo.emoji} {pInfo.label}</span>
                              <span>·</span>
                              <span>{planLabel(user.subscription_plan, user.member_category)}</span>
                              {user.subscription_billing_cycle === "annual" && (
                                <span className="text-green-400 font-medium">· Anual</span>
                              )}
                            </div>

                            {/* Dias restantes / status */}
                            <div className={"flex items-start gap-1.5 text-xs " + expiryColorClass(daysLeft)}>
                              <Timer className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                              <span>
                                {subscriptionStatusLabel(user) ||
                                  (user.subscription_expires_at
                                    ? new Date(user.subscription_expires_at).toLocaleDateString("pt-PT")
                                    : "Acesso ativo")}
                              </span>
                            </div>

                            {/* Data de expiração */}
                            {user.subscription_expires_at && (
                              <p className="text-[10px] text-gray-500">
                                Até:{" "}
                                {new Date(user.subscription_expires_at).toLocaleDateString("pt-PT")}
                              </p>
                            )}

                            {/* Auto-renovação */}
                            <div className="flex items-center gap-2">
                              <Switch
                                checked={user.subscription_auto_renew !== false}
                                onCheckedChange={(c) => handleToggleAutoRenew(user.id, c)}
                              />
                              <span className="text-[10px] text-gray-400">Auto</span>
                            </div>

                            {/* Botões de acção rápida */}
                            <div className="flex gap-1">
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-[#D2A63C]/40 px-2"
                                disabled={renewingId === user.id}
                                onClick={() => handleRenewSubscription(user.id)}
                              >
                                {renewingId === user.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  `+${MEMBER_SUBSCRIPTION_DAYS}d`
                                )}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                                title="Gerir subscrição"
                                onClick={() => openSubDialog(user)}
                              >
                                <Settings2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600">—</span>
                        )}
                      </td>

                      {/* ── UID Corretora ── */}
                      <td className="px-3 py-3 align-top">
                        {user.broker_uid ? (
                          <div className="space-y-1">
                            <span className="font-mono text-xs bg-gray-800 text-green-300 px-2 py-1 rounded border border-green-500/20">
                              {user.broker_uid}
                            </span>
                            <p className="text-[10px] text-gray-500">VT Markets</p>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-600 italic">Não registado</span>
                        )}
                      </td>

                      {/* ── Ações ── */}
                      <td className="px-3 py-3 align-top text-right">
                        <div className="flex flex-col items-end gap-2">
                          {skoolPending && (
                            <Button
                              size="sm"
                              className="bg-amber-600 hover:bg-amber-700 text-white"
                              disabled={markingSkoolId === user.id}
                              onClick={() => handleMarkSkoolGranted(user.id)}
                            >
                              {markingSkoolId === user.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Skool OK
                                </>
                              )}
                            </Button>
                          )}
                          {validationPending && (
                            <div className="flex flex-col items-end gap-1">
                              {user.access_validation_proof_url && (
                                <a
                                  href={user.access_validation_proof_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-[10px] text-[#D2A63C] underline"
                                >
                                  Ver comprovativo
                                </a>
                              )}
                              <Button
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                                disabled={approvingValidationId === user.id}
                                onClick={() => handleApproveValidation(user.id)}
                              >
                                {approvingValidationId === user.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>
                                    <CheckCircle className="h-4 w-4 mr-1" />
                                    Aprovar acesso
                                  </>
                                )}
                              </Button>
                            </div>
                          )}
                          {user.user_type === "pending" && !validationPending && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => onApprove(user.id)}
                            >
                              <CheckCircle className="h-4 w-4 mr-1" />
                              Aprovar
                            </Button>
                          )}
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10"
                          >
                            <Link href={`/admin/mtmcopy?userId=${user.id}`} title="Gestão MTMcopier">
                              <Bot className="h-4 w-4 mr-1" />
                              MTMcopier
                            </Link>
                          </Button>
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
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Dialog de gestão de subscrição ── */}
        {subDialogUser && (
          <Dialog open={isSubDialogOpen} onOpenChange={setIsSubDialogOpen}>
            <DialogContent className="bg-gray-900 text-white border-[#D2A63C]/40 max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-[#D2A63C]">
                  <CreditCard className="h-5 w-5" />
                  Subscrição — {subDialogUser.full_name || subDialogUser.email}
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-5 py-2">

                {/* Estado actual */}
                <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 p-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-400">Plano</span>
                    <span className="font-medium">
                      {planLabel(subDialogUser.subscription_plan, subDialogUser.member_category)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Plataforma</span>
                    <span>
                      {platformInfo(subDialogUser.subscription_platform).emoji}{" "}
                      {platformInfo(subDialogUser.subscription_platform).label}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-400">Ciclo</span>
                    <span>
                      {subDialogUser.subscription_billing_cycle === "annual" ? "📆 Anual" : "📅 Mensal"}
                    </span>
                  </div>
                  {subDialogUser.subscription_renewal_count != null && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Renovações</span>
                      <span>{subDialogUser.subscription_renewal_count}×</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-400">Validade</span>
                    <span className={expiryColorClass(subscriptionDaysRemaining(subDialogUser.subscription_expires_at))}>
                      {subDialogUser.subscription_expires_at
                        ? new Date(subDialogUser.subscription_expires_at).toLocaleString("pt-PT", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "Sem data — ativo"}
                    </span>
                  </div>
                  {subDialogUser.coupon_code && (
                    <div className="flex justify-between">
                      <span className="text-gray-400">Cupão</span>
                      <span className="text-green-300">🎟 {subDialogUser.coupon_code}</span>
                    </div>
                  )}
                </div>

                <Separator className="border-gray-700" />

                {/* Definir data exacta */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Calendar className="h-4 w-4 text-[#D2A63C]" />
                    Definir data de validade exacta
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      type="datetime-local"
                      value={customExpiryDate}
                      onChange={(e) => setCustomExpiryDate(e.target.value)}
                      className="input-focus flex-1"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#D2A63C]/50 text-[#D2A63C] shrink-0"
                      disabled={!customExpiryDate || savingExpiry}
                      onClick={handleSetCustomExpiry}
                    >
                      {savingExpiry ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Guardar"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Adicionar dias */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Plus className="h-4 w-4 text-[#D2A63C]" />
                    Adicionar dias à validade actual
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    <Input
                      type="number"
                      min="1"
                      max="3650"
                      value={customAddDays}
                      onChange={(e) => setCustomAddDays(e.target.value)}
                      className="input-focus w-24 shrink-0"
                    />
                    <span className="text-sm text-gray-400 self-center shrink-0">dias</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#D2A63C]/50"
                      onClick={handleAddDays}
                    >
                      Adicionar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#D2A63C]/50 text-[#D2A63C]"
                      disabled={renewingId === subDialogUser.id}
                      onClick={() => handleRenewSubscription(subDialogUser.id)}
                    >
                      {renewingId === subDialogUser.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        `+${MEMBER_SUBSCRIPTION_DAYS}d padrão`
                      )}
                    </Button>
                  </div>
                </div>

                <Separator className="border-gray-700" />

                {/* Plano & Ciclo */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <TrendingUp className="h-4 w-4 text-[#D2A63C]" />
                    Plano & Ciclo de faturação
                  </Label>
                  <div className="flex gap-2 flex-wrap">
                    <Select value={planOverride} onValueChange={setPlanOverride}>
                      <SelectTrigger className="input-focus flex-1 min-w-[120px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="app_member">👤 App 35€</SelectItem>
                        <SelectItem value="premium">💎 Premium 65€</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={cycleOverride} onValueChange={setCycleOverride}>
                      <SelectTrigger className="input-focus flex-1 min-w-[100px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-900 border-gray-700">
                        <SelectItem value="monthly">📅 Mensal</SelectItem>
                        <SelectItem value="annual">📆 Anual</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-[#D2A63C]/50 shrink-0"
                      disabled={savingPlan}
                      onClick={handleSetPlan}
                    >
                      {savingPlan ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Aplicar"
                      )}
                    </Button>
                  </div>
                  <p className="text-[10px] text-gray-500">
                    Actualiza subscription_plan e subscription_billing_cycle. Não processa pagamento.
                  </p>
                </div>

                <Separator className="border-gray-700" />

                {/* Addons: Scanners + MTMcopier */}
                <div className="space-y-3">
                  <Label className="flex items-center gap-1.5 text-sm">
                    <Bot className="h-4 w-4 text-[#D2A63C]" />
                    Addons — Scanners & MTMcopier
                  </Label>

                  <div className="rounded-lg bg-gray-800/60 border border-gray-700/50 p-3 space-y-3">
                    <div className="space-y-2">
                      <p className="text-xs text-gray-400">Pack Scanner</p>
                      <Select value={addonScannerPlan} onValueChange={setAddonScannerPlan}>
                        <SelectTrigger className="input-focus">
                          <SelectValue placeholder="Sem scanner" />
                        </SelectTrigger>
                        <SelectContent className="bg-gray-900 border-gray-700">
                          <SelectItem value="none">— Sem scanner</SelectItem>
                          {SCANNER_ADDON_PLANS.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {addonScannerPlan !== "none" && (
                        <>
                          <Input
                            placeholder="Username TradingView"
                            value={addonScannerTv}
                            onChange={(e) => setAddonScannerTv(e.target.value)}
                            className="input-focus"
                          />
                          {!addonScannerPlan.includes("lifetime") && (
                            <Input
                              type="datetime-local"
                              value={addonScannerExpiry}
                              onChange={(e) => setAddonScannerExpiry(e.target.value)}
                              className="input-focus"
                            />
                          )}
                        </>
                      )}
                    </div>

                    <Separator className="border-gray-700" />

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-400">MTMcopier (+20€/mês)</p>
                        <Switch
                          checked={addonMtmcopyActive}
                          onCheckedChange={setAddonMtmcopyActive}
                        />
                      </div>
                      {addonMtmcopyActive && (
                        <Input
                          type="datetime-local"
                          value={addonMtmcopyExpiry}
                          onChange={(e) => setAddonMtmcopyExpiry(e.target.value)}
                          className="input-focus"
                        />
                      )}
                    </div>

                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-[#D2A63C]/50 text-[#D2A63C]"
                      disabled={savingAddons}
                      onClick={handleSaveAddons}
                    >
                      {savingAddons ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        "Guardar addons"
                      )}
                    </Button>
                  </div>

                  {subDialogUser.profile_data && (
                    <p className="text-[10px] text-gray-500">
                      Scanner actual:{" "}
                      {scannerPlanLabel(readUserAddons(subDialogUser.profile_data).scanner?.plan_id)}
                    </p>
                  )}
                </div>

                <Separator className="border-gray-700" />

                {/* Zona de risco */}
                <div className="space-y-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">Zona de risco</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full border-red-500/40 text-red-400 hover:bg-red-900/20"
                    disabled={cancellingId === subDialogUser.id}
                    onClick={() => handleCancelSubscription(subDialogUser.id)}
                  >
                    {cancellingId === subDialogUser.id ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <XCircle className="h-4 w-4 mr-2" />
                    )}
                    Cancelar subscrição e desativar conta
                  </Button>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsSubDialogOpen(false)}>
                  Fechar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

      </CardContent>
    </Card>
  )
}
