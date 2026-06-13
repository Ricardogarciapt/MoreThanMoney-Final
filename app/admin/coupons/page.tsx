"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Plus,
  Copy,
  Check,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Tag,
  RefreshCw,
  Shield,
  Ticket,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

// ─── Types ────────────────────────────────────────────────────────────────────

type CouponType = "discount_pct" | "free_months" | "free_subscription"
type PlanOverride = "app_member" | "premium" | "both" | null

interface Coupon {
  id: string
  code: string
  type: CouponType
  discount_value: number
  plan_override: PlanOverride
  max_uses: number | null
  used_count: number
  valid_from: string
  valid_until: string | null
  description: string | null
  is_active: boolean
  created_at: string
  stripe_coupon_id?: string | null
  stripe_promotion_code_id?: string | null
}

interface CouponFormData {
  code: string
  type: CouponType
  discount_value: string
  plan_override: string
  max_uses: string
  valid_from: string
  valid_until: string
  description: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  let result = ""
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function couponTypeLabel(type: CouponType): string {
  switch (type) {
    case "discount_pct":
      return "% Desconto"
    case "free_months":
      return "Meses Grátis"
    case "free_subscription":
      return "Subscrição Gratuita"
  }
}

function couponValueLabel(coupon: Coupon): string {
  switch (coupon.type) {
    case "discount_pct":
      return `${coupon.discount_value}%`
    case "free_months":
      return `${coupon.discount_value} ${coupon.discount_value === 1 ? "mês" : "meses"}`
    case "free_subscription":
      return "—"
  }
}

function planOverrideLabel(plan: PlanOverride): string {
  if (!plan) return "Qualquer plano"
  switch (plan) {
    case "app_member":
      return "App Member"
    case "premium":
      return "Premium"
    case "both":
      return "Ambos"
  }
}

const today = new Date().toISOString().slice(0, 10)

const defaultForm: CouponFormData = {
  code: "",
  type: "discount_pct",
  discount_value: "",
  plan_override: "any",
  max_uses: "",
  valid_from: today,
  valid_until: "",
  description: "",
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CouponsPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [mounted, setMounted] = useState(false)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  // Create modal
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CouponFormData>(defaultForm)
  const [creating, setCreating] = useState(false)

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || authLoading) return
    if (!user) {
      router.push("/login?redirect=/admin/coupons")
      return
    }
    if (!isAdmin) {
      router.push("/new-landing")
    }
  }, [mounted, authLoading, user, isAdmin, router])

  // ── Fetch coupons ──────────────────────────────────────────────────────────

  const fetchCoupons = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/admin/coupons")
      if (!res.ok) throw new Error("Erro ao carregar cupões")
      const data = await res.json()
      setCoupons(data.data || [])
    } catch (err) {
      toast({
        title: "Erro",
        description: "Não foi possível carregar os cupões",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (mounted && user && isAdmin) {
      fetchCoupons()
    }
  }, [mounted, user, isAdmin, fetchCoupons])

  // ── Stats ──────────────────────────────────────────────────────────────────

  const stats = {
    total: coupons.length,
    active: coupons.filter((c) => c.is_active).length,
    totalUses: coupons.reduce((sum, c) => sum + c.used_count, 0),
  }

  // ── Copy code ──────────────────────────────────────────────────────────────

  const handleCopy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopiedCode(code)
      setTimeout(() => setCopiedCode(null), 2000)
    } catch {
      toast({ title: "Erro ao copiar código", variant: "destructive" })
    }
  }

  // ── Toggle active ──────────────────────────────────────────────────────────

  const handleToggle = async (coupon: Coupon) => {
    setTogglingId(coupon.id)
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: coupon.id, is_active: !coupon.is_active }),
      })
      if (!res.ok) throw new Error()
      setCoupons((prev) =>
        prev.map((c) =>
          c.id === coupon.id ? { ...c, is_active: !c.is_active } : c
        )
      )
      toast({
        title: coupon.is_active ? "Cupão desactivado" : "Cupão activado",
        description: coupon.code,
      })
    } catch {
      toast({
        title: "Erro ao actualizar cupão",
        variant: "destructive",
      })
    } finally {
      setTogglingId(null)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch("/api/admin/coupons", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      })
      if (!res.ok) throw new Error()
      setCoupons((prev) => prev.filter((c) => c.id !== id))
      toast({ title: "Cupão eliminado" })
    } catch {
      toast({ title: "Erro ao eliminar cupão", variant: "destructive" })
    } finally {
      setDeletingId(null)
    }
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  const handleCreate = async () => {
    if (!form.code.trim()) {
      toast({ title: "O código é obrigatório", variant: "destructive" })
      return
    }
    if (form.type !== "free_subscription" && !form.discount_value) {
      toast({ title: "O valor do desconto é obrigatório", variant: "destructive" })
      return
    }

    setCreating(true)
    try {
      const payload = {
        code: form.code.trim().toUpperCase(),
        type: form.type,
        discount_value:
          form.type === "free_subscription" ? 0 : Number(form.discount_value),
        plan_override:
          form.plan_override === "any" ? null : form.plan_override,
        max_uses: form.max_uses ? Number(form.max_uses) : null,
        valid_from: form.valid_from
          ? new Date(form.valid_from).toISOString()
          : new Date().toISOString(),
        valid_until: form.valid_until
          ? new Date(form.valid_until).toISOString()
          : null,
        description: form.description || null,
      }

      const res = await fetch("/api/admin/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Erro ao criar cupão")

      setCoupons((prev) => [data.data, ...prev])
      setShowCreate(false)
      setForm(defaultForm)
      toast({ title: "Cupão criado", description: payload.code })
    } catch (err: any) {
      toast({
        title: "Erro ao criar cupão",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setCreating(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <div className="border-b border-[#D2A63C]/15 bg-gray-950 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-2 text-gray-400 hover:text-[#D2A63C] text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Admin
            </Link>
            <span className="text-gray-600">/</span>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-[#D2A63C]/15 p-1.5 ring-1 ring-[#D2A63C]/25">
                <Ticket className="h-4 w-4 text-[#D2A63C]" />
              </div>
              <span className="text-white font-semibold">Cupões</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchCoupons}
              className="text-gray-400 hover:text-white"
            >
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              onClick={() => {
                setForm(defaultForm)
                setShowCreate(true)
              }}
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525] font-medium"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Novo Cupão
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total criados", value: stats.total, icon: Tag },
            { label: "Activos", value: stats.active, icon: Shield },
            { label: "Utilizações totais", value: stats.totalUses, icon: Check },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3"
            >
              <div className="rounded-lg bg-[#D2A63C]/10 p-2.5 ring-1 ring-[#D2A63C]/20">
                <Icon className="w-5 h-5 text-[#D2A63C]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-800">
            <h2 className="text-sm font-semibold text-white">Todos os cupões</h2>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
            </div>
          ) : coupons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500 gap-3">
              <Ticket className="w-10 h-10 opacity-30" />
              <p className="text-sm">Ainda não existem cupões</p>
              <Button
                size="sm"
                onClick={() => setShowCreate(true)}
                className="bg-[#D2A63C] text-black hover:bg-[#BB8525] mt-2"
              >
                <Plus className="w-4 h-4 mr-1.5" />
                Criar primeiro cupão
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wider">
                    <th className="text-left px-5 py-3 font-medium">Código</th>
                    <th className="text-left px-4 py-3 font-medium">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium">Valor</th>
                    <th className="text-left px-4 py-3 font-medium">Plano</th>
                    <th className="text-left px-4 py-3 font-medium">Usos</th>
                    <th className="text-left px-4 py-3 font-medium">Válido até</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-right px-5 py-3 font-medium">Acções</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/60">
                  {coupons.map((coupon) => (
                    <tr
                      key={coupon.id}
                      className="hover:bg-gray-800/30 transition-colors"
                    >
                      {/* Code */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-semibold text-white tracking-widest">
                            {coupon.code}
                          </span>
                          <button
                            onClick={() => handleCopy(coupon.code)}
                            className="text-gray-600 hover:text-[#D2A63C] transition-colors"
                            title="Copiar código"
                          >
                            {copiedCode === coupon.code ? (
                              <Check className="w-3.5 h-3.5 text-green-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        {coupon.description && (
                          <div className="text-xs text-gray-600 mt-0.5 max-w-[200px] truncate">
                            {coupon.description}
                          </div>
                        )}
                        {coupon.stripe_promotion_code_id ? (
                          <Badge className="mt-1 text-[10px] bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                            Stripe sync
                          </Badge>
                        ) : (
                          <Badge className="mt-1 text-[10px] bg-gray-700 text-gray-400">
                            Sem Stripe
                          </Badge>
                        )}
                      </td>

                      {/* Type */}
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs border",
                            coupon.type === "discount_pct" &&
                              "border-blue-500/40 text-blue-400 bg-blue-500/10",
                            coupon.type === "free_months" &&
                              "border-purple-500/40 text-purple-400 bg-purple-500/10",
                            coupon.type === "free_subscription" &&
                              "border-[#D2A63C]/40 text-[#D2A63C] bg-[#D2A63C]/10"
                          )}
                        >
                          {couponTypeLabel(coupon.type)}
                        </Badge>
                      </td>

                      {/* Value */}
                      <td className="px-4 py-3.5 text-white font-medium">
                        {couponValueLabel(coupon)}
                      </td>

                      {/* Plan */}
                      <td className="px-4 py-3.5 text-gray-400 text-xs">
                        {planOverrideLabel(coupon.plan_override)}
                      </td>

                      {/* Uses */}
                      <td className="px-4 py-3.5">
                        <span className="text-white">{coupon.used_count}</span>
                        <span className="text-gray-600">
                          {coupon.max_uses !== null
                            ? ` / ${coupon.max_uses}`
                            : " / ∞"}
                        </span>
                      </td>

                      {/* Valid until */}
                      <td className="px-4 py-3.5 text-gray-400 text-xs">
                        {formatDate(coupon.valid_until)}
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs border",
                            coupon.is_active
                              ? "border-green-500/40 text-green-400 bg-green-500/10"
                              : "border-gray-600/40 text-gray-500 bg-gray-800/40"
                          )}
                        >
                          {coupon.is_active ? "Activo" : "Inactivo"}
                        </Badge>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {/* Toggle */}
                          <button
                            onClick={() => handleToggle(coupon)}
                            disabled={togglingId === coupon.id}
                            title={
                              coupon.is_active ? "Desactivar" : "Activar"
                            }
                            className="p-1.5 rounded-lg hover:bg-gray-700 transition-colors text-gray-400 hover:text-white disabled:opacity-50"
                          >
                            {togglingId === coupon.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : coupon.is_active ? (
                              <ToggleRight className="w-4 h-4 text-green-400" />
                            ) : (
                              <ToggleLeft className="w-4 h-4" />
                            )}
                          </button>

                          {/* Delete */}
                          <button
                            onClick={() => handleDelete(coupon.id)}
                            disabled={deletingId === coupon.id}
                            title="Eliminar"
                            className="p-1.5 rounded-lg hover:bg-red-500/15 transition-colors text-gray-500 hover:text-red-400 disabled:opacity-50"
                          >
                            {deletingId === coupon.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Create Modal ───────────────────────────────────────────────────── */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="bg-gray-900 border border-gray-700 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Ticket className="w-4 h-4 text-[#D2A63C]" />
              Novo Cupão
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Code */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Código *
              </label>
              <div className="flex gap-2">
                <Input
                  value={form.code}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      code: e.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="Ex: PROMO2026"
                  className="bg-gray-800 border-gray-700 text-white font-mono uppercase placeholder:text-gray-600 focus:border-[#D2A63C]/50"
                  maxLength={30}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((f) => ({ ...f, code: generateCode() }))
                  }
                  className="border-gray-700 text-gray-400 hover:text-white hover:border-[#D2A63C]/50 whitespace-nowrap"
                >
                  Gerar
                </Button>
              </div>
            </div>

            {/* Type */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Tipo *
              </label>
              <Select
                value={form.type}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    type: v as CouponType,
                    discount_value: v === "free_subscription" ? "0" : f.discount_value,
                  }))
                }
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white focus:border-[#D2A63C]/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="discount_pct" className="text-white hover:bg-gray-700">
                    % Desconto
                  </SelectItem>
                  <SelectItem value="free_months" className="text-white hover:bg-gray-700">
                    Meses Grátis
                  </SelectItem>
                  <SelectItem value="free_subscription" className="text-white hover:bg-gray-700">
                    Subscrição Gratuita
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Discount value */}
            {form.type !== "free_subscription" && (
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  {form.type === "discount_pct"
                    ? "Percentagem de desconto *"
                    : "Número de meses *"}
                </label>
                <Input
                  type="number"
                  min="1"
                  max={form.type === "discount_pct" ? "100" : "24"}
                  value={form.discount_value}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, discount_value: e.target.value }))
                  }
                  placeholder={
                    form.type === "discount_pct" ? "Ex: 20" : "Ex: 3"
                  }
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus:border-[#D2A63C]/50"
                />
              </div>
            )}

            {/* Plan override */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Aplica-se ao plano
              </label>
              <Select
                value={form.plan_override}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, plan_override: v }))
                }
              >
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white focus:border-[#D2A63C]/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="any" className="text-white hover:bg-gray-700">
                    Qualquer plano
                  </SelectItem>
                  <SelectItem value="app_member" className="text-white hover:bg-gray-700">
                    App Member
                  </SelectItem>
                  <SelectItem value="premium" className="text-white hover:bg-gray-700">
                    Premium
                  </SelectItem>
                  <SelectItem value="both" className="text-white hover:bg-gray-700">
                    Ambos
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max uses + validity row */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Usos máximos
                </label>
                <Input
                  type="number"
                  min="1"
                  value={form.max_uses}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, max_uses: e.target.value }))
                  }
                  placeholder="Ilimitado"
                  className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus:border-[#D2A63C]/50"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                  Válido desde *
                </label>
                <Input
                  type="date"
                  value={form.valid_from}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, valid_from: e.target.value }))
                  }
                  className="bg-gray-800 border-gray-700 text-white focus:border-[#D2A63C]/50"
                />
              </div>
            </div>

            {/* Valid until */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Válido até (opcional)
              </label>
              <Input
                type="date"
                value={form.valid_until}
                min={form.valid_from}
                onChange={(e) =>
                  setForm((f) => ({ ...f, valid_until: e.target.value }))
                }
                className="bg-gray-800 border-gray-700 text-white focus:border-[#D2A63C]/50"
              />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">
                Nota interna
              </label>
              <Input
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                placeholder="Ex: Campanha verão 2026"
                className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-600 focus:border-[#D2A63C]/50"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setShowCreate(false)}
              className="text-gray-400 hover:text-white"
              disabled={creating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreate}
              disabled={creating}
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525] font-medium"
            >
              {creating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  A criar...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-1.5" />
                  Criar cupão
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
