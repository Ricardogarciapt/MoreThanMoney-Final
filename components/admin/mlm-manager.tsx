'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminApiCall } from '@/lib/admin-helpers'
import {
  Users, TrendingUp, Coins, CheckCircle2, Edit2, Trash2, Plus,
  RefreshCw, ChevronDown, Copy, Check, X, Loader2, Network,
  ToggleLeft, ToggleRight, Search, AlertCircle, ExternalLink, UserCog, Award, GitBranch
} from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import MlmBinaryTreeWidget from '@/components/admin/mlm-binary-tree-widget'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MlmSettings {
  id: number
  is_active: boolean
  direct_commission_pct: number
}

interface MlmRank {
  id: number
  name: string
  slug: string
  left_requirement: number
  right_requirement: number
  direct_requirement: number
  rank_bonus: number
  monthly_residual: number
  /** A escada VIVA, em percentagem do volume da perna menor (migração 130). */
  residual_pct?: number
  bonus_unico?: number
  free_pack_months: number
  color: string
  icon: string
  sort_order: number
}

interface MlmAffiliate {
  id: string
  user_id: string
  username: string
  email: string
  full_name: string
  subscription_plan: string | null
  subscription_platform?: string | null
  is_active: boolean
  subscription_status: string | null
  subscription_expires_at?: string | null
  mlm_sponsor_username?: string | null
  sponsor_username: string | null
  rank_name: string | null
  rank_color: string | null
  rank_icon: string | null
  rank_id?: number
  left_count: number
  right_count: number
  total_earned: number
  pending_commissions: number
  created_at: string
  member_category?: string | null
  stripe_customer_id?: string | null
  stripe_subscription_id?: string | null
  stripe_connect_account_id?: string | null
  stripe_connect_status?: string | null
  skool_access_pending?: boolean
  coupon_code?: string | null
  in_mlm_tree?: boolean
}

interface NetworkStats {
  total_in_tree: number
  referred_pending_tree: number
  stripe_active: number
  stripe_platform: number
  skool_pending: number
  pending_commissions_total: number
}

interface MlmCommission {
  id: string
  beneficiary_id: string
  beneficiary_username: string | null
  beneficiary_name: string | null
  from_username: string | null
  type: string
  amount: number
  currency: string
  source_plan: string | null
  source_amount_cents: number | null
  stripe_invoice_id: string | null
  stripe_transfer_id: string | null
  payout_status: string | null
  beneficiary_connect_id: string | null
  beneficiary_connect_status: string | null
  status: string
  approved_at: string | null
  paid_at: string | null
  created_at: string
}

const TYPE_LABELS: Record<string, string> = {
  direct_referral: 'Referência Direta',
  residual_pct: 'Residual (% da perna menor)',
  bonus_unico: 'Bónus único (€)',
  rank_bonus: 'Bónus antigo (€, só «casa»)',
  monthly_residual: 'Residual antigo (€/mês, só «casa»)',
  rank_residual: 'Residual de Rank',
  free_pack: 'Pack Grátis',
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  paid: 'bg-green-500/20 text-green-400 border-green-500/30',
  cancelled: 'bg-red-500/20 text-red-400 border-red-500/30',
}

function formatEur(v: number) {
  return `${(v ?? 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

// ─── Rank Modal ───────────────────────────────────────────────────────────────

function RankModal({
  rank,
  onClose,
  onSave,
}: {
  rank: Partial<MlmRank> | null
  onClose: () => void
  onSave: (data: Partial<MlmRank>) => Promise<void>
}) {
  const [form, setForm] = useState<Partial<MlmRank>>(rank ?? {
    name: '', slug: '', left_requirement: 0, right_requirement: 0,
    direct_requirement: 0, residual_pct: 0, bonus_unico: 0, rank_bonus: 0, monthly_residual: 0,
    free_pack_months: 0, color: '#D2A63C', icon: '⭐', sort_order: 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handle = (k: keyof MlmRank) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value
    setForm(prev => ({ ...prev, [k]: v }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await onSave(form)
      onClose()
    } catch (err: any) {
      setError(err.message || 'Erro ao guardar')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-700">
          <h3 className="text-white font-semibold text-lg">
            {form.id ? 'Editar Rank' : 'Novo Rank'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-4">
          {error && (
            <div className="bg-red-500/20 border border-red-500/40 rounded-lg p-3 text-red-400 text-sm flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-300 text-xs">Nome</Label>
              <Input value={form.name ?? ''} onChange={handle('name')} className="bg-gray-800 border-gray-700 text-white text-sm" required />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Slug</Label>
              <Input value={form.slug ?? ''} onChange={handle('slug')} className="bg-gray-800 border-gray-700 text-white text-sm" required />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Req. Perna Esq.</Label>
              <Input type="number" min="0" value={form.left_requirement ?? 0} onChange={handle('left_requirement')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Req. Perna Dir.</Label>
              <Input type="number" min="0" value={form.right_requirement ?? 0} onChange={handle('right_requirement')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Req. Diretas</Label>
              <Input type="number" min="0" value={form.direct_requirement ?? 0} onChange={handle('direct_requirement')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Bónus Rank (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.residual_pct ?? 0} onChange={handle('residual_pct')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">{TYPE_LABELS.bonus_unico}</Label>
              <Input type="number" min="0" step="0.01" value={form.bonus_unico ?? 0} onChange={handle('bonus_unico')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-400 text-xs">{TYPE_LABELS.rank_bonus}</Label>
              <Input type="number" min="0" step="0.01" value={form.rank_bonus ?? 0} onChange={handle('rank_bonus')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Residual Mensal (€)</Label>
              <Input type="number" min="0" step="0.01" value={form.monthly_residual ?? 0} onChange={handle('monthly_residual')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Meses Pack Grátis</Label>
              <Input type="number" min="0" value={form.free_pack_months ?? 0} onChange={handle('free_pack_months')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Ícone (emoji)</Label>
              <Input value={form.icon ?? '⭐'} onChange={handle('icon')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Cor (hex)</Label>
              <Input value={form.color ?? '#D2A63C'} onChange={handle('color')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
            <div>
              <Label className="text-gray-300 text-xs">Ordem</Label>
              <Input type="number" min="0" value={form.sort_order ?? 0} onChange={handle('sort_order')} className="bg-gray-800 border-gray-700 text-white text-sm" />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1 border-gray-700 text-gray-300">
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 bg-[#D2A63C] text-black hover:bg-[#BB8525] font-semibold">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Guardar
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MlmManager({
  activeSection: externalSection,
  setActiveSection: setExternalSection,
  onNavigateSection,
}: {
  activeSection?: string
  setActiveSection?: (s: string) => void
  onNavigateSection?: (s: string) => void
}) {
  const [internalSection, setInternalSection] = useState('dashboard')
  const activeSection = externalSection ?? internalSection
  const setActiveSection = setExternalSection ?? setInternalSection

  // Settings
  const [settings, setSettings] = useState<MlmSettings | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsCommission, setSettingsCommission] = useState('')

  // Ranks
  const [ranks, setRanks] = useState<MlmRank[]>([])
  const [rankModal, setRankModal] = useState<Partial<MlmRank> | null | false>(false)

  // Affiliates
  const [affiliates, setAffiliates] = useState<MlmAffiliate[]>([])
  const [networkStats, setNetworkStats] = useState<NetworkStats | null>(null)
  const [affiliateSearch, setAffiliateSearch] = useState('')
  const [affiliateView, setAffiliateView] = useState<'all' | 'tree' | 'referred'>('all')
  const [affiliateSubTab, setAffiliateSubTab] = useState<'lista' | 'arvore' | 'ranks'>('lista')
  const [rankFilter, setRankFilter] = useState<number | 'all' | 'none'>('all')
  const [markingSkoolId, setMarkingSkoolId] = useState<string | null>(null)

  // Commissions
  const [commissions, setCommissions] = useState<MlmCommission[]>([])
  const [commissionFilter, setCommissionFilter] = useState('all')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  // Loading states
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [loadingRanks, setLoadingRanks] = useState(false)
  const [loadingAffiliates, setLoadingAffiliates] = useState(false)
  const [loadingCommissions, setLoadingCommissions] = useState(false)
  const [error, setError] = useState('')
  const [syncingTree, setSyncingTree] = useState(false)

  // ── Fetch helpers ─────────────────────────────────────────────────────────

  const fetchSettings = useCallback(async () => {
    setLoadingSettings(true)
    try {
      const res = await adminApiCall<{ settings: MlmSettings }>('/api/admin/mlm/settings')
      if (res.data?.settings) {
        setSettings(res.data.settings)
        setSettingsCommission(String(res.data.settings.direct_commission_pct))
      }
    } catch { /* ignore */ } finally { setLoadingSettings(false) }
  }, [])

  const fetchRanks = useCallback(async () => {
    setLoadingRanks(true)
    try {
      const res = await adminApiCall<{ ranks: MlmRank[] }>('/api/admin/mlm/ranks')
      if (res.data?.ranks) setRanks(res.data.ranks)
    } catch { /* ignore */ } finally { setLoadingRanks(false) }
  }, [])

  const fetchAffiliates = useCallback(async () => {
    setLoadingAffiliates(true)
    try {
      const viewParam =
        affiliateView === 'tree' ? 'affiliates' : affiliateView === 'referred' ? 'referred' : ''
      const url = viewParam
        ? `/api/admin/mlm/affiliates?view=${viewParam}`
        : '/api/admin/mlm/affiliates'
      const res = await adminApiCall<{ affiliates: MlmAffiliate[]; stats?: NetworkStats }>(url)
      if (res.data?.affiliates) setAffiliates(res.data.affiliates)
      if (res.data?.stats) setNetworkStats(res.data.stats)
    } catch { /* ignore */ } finally { setLoadingAffiliates(false) }
  }, [affiliateView])

  const fetchCommissions = useCallback(async (status: string) => {
    setLoadingCommissions(true)
    try {
      const res = await adminApiCall<{ commissions: MlmCommission[] }>(`/api/admin/mlm/commissions?status=${status}`)
      if (res.data?.commissions) setCommissions(res.data.commissions)
    } catch { /* ignore */ } finally { setLoadingCommissions(false) }
  }, [])

  // Load data based on active section
  useEffect(() => {
    fetchSettings()
    if (activeSection === 'ranks' || activeSection === 'dashboard' || activeSection === 'affiliates') fetchRanks()
    if (activeSection === 'affiliates' || activeSection === 'dashboard') fetchAffiliates()
    if (activeSection === 'commissions' || activeSection === 'dashboard') fetchCommissions(commissionFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection])

  useEffect(() => {
    if (activeSection === 'commissions') fetchCommissions(commissionFilter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commissionFilter])

  useEffect(() => {
    if (activeSection === 'affiliates' || activeSection === 'dashboard') fetchAffiliates()
  }, [affiliateView, activeSection, fetchAffiliates])

  const handleMarkSkoolGranted = async (userId: string) => {
    setMarkingSkoolId(userId)
    try {
      const res = await adminApiCall('/api/admin/users', {
        method: 'PATCH',
        body: JSON.stringify({ userId, mark_skool_granted: true }),
      })
      if (res.success) await fetchAffiliates()
    } finally {
      setMarkingSkoolId(null)
    }
  }

  const platformLabel = (p?: string | null) => {
    switch (p) {
      case 'stripe': return { emoji: '💳', label: 'Stripe' }
      case 'skool': return { emoji: '🏫', label: 'Skool' }
      case 'app_store': return { emoji: '🍎', label: 'App Store' }
      case 'manual': return { emoji: '🔧', label: 'Manual' }
      default: return { emoji: '—', label: p || '—' }
    }
  }

  const toggleMlm = async () => {
    if (!settings) return
    setSavingSettings(true)
    try {
      const res = await adminApiCall<{ settings: MlmSettings }>('/api/admin/mlm/settings', {
        method: 'POST',
        body: JSON.stringify({ is_active: !settings.is_active }),
      })
      if (res.data?.settings) setSettings(res.data.settings)
    } finally { setSavingSettings(false) }
  }

  const saveCommissionPct = async () => {
    const pct = parseFloat(settingsCommission)
    if (isNaN(pct) || pct < 0 || pct > 100) { setError('Percentagem inválida (0-100)'); return }
    setSavingSettings(true)
    setError('')
    try {
      const res = await adminApiCall<{ settings: MlmSettings }>('/api/admin/mlm/settings', {
        method: 'POST',
        body: JSON.stringify({ direct_commission_pct: pct }),
      })
      if (res.data?.settings) setSettings(res.data.settings)
    } finally { setSavingSettings(false) }
  }

  const syncMlmTree = async () => {
    setSyncingTree(true)
    setError('')
    try {
      const res = await adminApiCall<{
        success: boolean
        scanned: number
        placed: number
        skipped: number
        errors: string[]
      }>('/api/admin/mlm/sync-tree', { method: 'POST', body: JSON.stringify({ limit: 500 }) })
      if (res.data) {
        const { placed, scanned, skipped } = res.data
        await fetchAffiliates()
        if (res.data.errors?.length) {
          setError(`Árvore: ${placed} colocados · ${scanned} analisados · ${skipped} ignorados · ${res.data.errors.length} erros`)
        }
      }
    } finally {
      setSyncingTree(false)
    }
  }

  const saveRank = async (data: Partial<MlmRank>) => {
    if (data.id) {
      await adminApiCall('/api/admin/mlm/ranks', { method: 'PUT', body: JSON.stringify(data) })
    } else {
      await adminApiCall('/api/admin/mlm/ranks', { method: 'POST', body: JSON.stringify(data) })
    }
    await fetchRanks()
  }

  const deleteRank = async (id: number) => {
    if (!confirm('Eliminar este rank?')) return
    await adminApiCall(`/api/admin/mlm/ranks?id=${id}`, { method: 'DELETE' })
    await fetchRanks()
  }

  const handleBulkAction = async (action: 'approve' | 'pay') => {
    if (selectedIds.size === 0) return
    const res = await adminApiCall<{
      success: boolean
      count: number
      transferred?: number
      manual?: number
      failed?: number
    }>('/api/admin/mlm/commissions', {
      method: 'POST',
      body: JSON.stringify({ action, ids: Array.from(selectedIds) }),
    })
    setSelectedIds(new Set())
    await fetchCommissions(commissionFilter)

    if (res.success && res.data) {
      const data = res.data as {
        transferred?: number
        manual?: number
        failed?: number
        auto_payout?: boolean
      }
      const { transferred = 0, manual = 0, failed = 0, auto_payout } = data
      if (action === 'pay' || auto_payout) {
        const parts = []
        if (transferred > 0) parts.push(`${transferred} via Stripe Connect`)
        if (manual > 0) parts.push(`${manual} marcadas manual`)
        if (failed > 0) parts.push(`${failed} falharam`)
        setError(failed > 0 ? `Atenção: ${parts.join(' · ')}` : '')
      }
    }
  }

  // ── Stats for dashboard ───────────────────────────────────────────────────
  const totalAffiliates = networkStats?.total_in_tree ?? affiliates.filter((a) => a.in_mlm_tree !== false).length
  const stripeActive = networkStats?.stripe_active ?? affiliates.filter(a => a.subscription_status === 'active' || a.subscription_status === 'trialing').length
  const skoolPendingCount = networkStats?.skool_pending ?? affiliates.filter((a) => a.skool_access_pending).length
  const referredPending = networkStats?.referred_pending_tree ?? affiliates.filter((a) => a.in_mlm_tree === false).length
  const pendingCommissionsTotal = commissions
    .filter(c => c.status === 'pending')
    .reduce((s, c) => s + c.amount, 0)
  const paidTotal = commissions
    .filter(c => c.status === 'paid')
    .reduce((s, c) => s + c.amount, 0)

  const filteredAffiliates = affiliates.filter(a =>
    !affiliateSearch ||
    a.username?.toLowerCase().includes(affiliateSearch.toLowerCase()) ||
    a.email?.toLowerCase().includes(affiliateSearch.toLowerCase()) ||
    a.full_name?.toLowerCase().includes(affiliateSearch.toLowerCase())
  )

  const treeMembers = affiliates.filter((a) => a.in_mlm_tree !== false)

  const rankFilteredMembers = treeMembers.filter((a) => {
    if (rankFilter === 'all') return true
    if (rankFilter === 'none') return !a.rank_id || a.rank_id === 0
    return a.rank_id === rankFilter
  }).filter((a) =>
    !affiliateSearch ||
    a.username?.toLowerCase().includes(affiliateSearch.toLowerCase()) ||
    a.email?.toLowerCase().includes(affiliateSearch.toLowerCase())
  )

  const rankCounts = ranks.map((r) => ({
    ...r,
    count: treeMembers.filter((a) => a.rank_id === r.id).length,
  }))
  const noRankCount = treeMembers.filter((a) => !a.rank_id || a.rank_id === 0).length

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-full bg-gray-950 text-white">
      {rankModal !== false && (
        <RankModal
          rank={rankModal}
          onClose={() => setRankModal(false)}
          onSave={saveRank}
        />
      )}

      {/* Top bar with MLM toggle */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h2 className="text-xl font-bold text-white">MLM / Afiliados</h2>
          <p className="text-gray-400 text-sm">Sistema de compensação binário MoreThanMoney</p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={syncMlmTree}
            disabled={syncingTree}
            className="border-gray-700 text-gray-300 hover:text-white"
          >
            {syncingTree ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Network className="w-3.5 h-3.5 mr-1" />}
            Sincronizar árvore
          </Button>
          <span className="text-sm text-gray-400">Sistema</span>
          <button
            onClick={toggleMlm}
            disabled={savingSettings || loadingSettings}
            className="relative inline-flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all"
            style={{
              borderColor: settings?.is_active ? '#D2A63C' : '#374151',
              background: settings?.is_active ? 'rgba(210,166,60,0.15)' : 'rgba(55,65,81,0.3)',
            }}
          >
            {savingSettings ? (
              <Loader2 className="w-4 h-4 animate-spin text-[#D2A63C]" />
            ) : settings?.is_active ? (
              <ToggleRight className="w-5 h-5 text-[#D2A63C]" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-gray-500" />
            )}
            <span className={`text-sm font-medium ${settings?.is_active ? 'text-[#D2A63C]' : 'text-gray-500'}`}>
              {settings?.is_active ? 'Ativo' : 'Inativo'}
            </span>
          </button>
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-500/20 border border-red-500/40 rounded-lg p-3 text-red-400 text-sm flex gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      <div className="p-6">
        {/* ── DASHBOARD ─────────────────────────────────────────────────────── */}
        {activeSection === 'dashboard' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Na Árvore MLM', value: totalAffiliates, icon: Users, color: '#3B82F6' },
                { label: 'Subs. Stripe Ativas', value: stripeActive, icon: CheckCircle2, color: '#10B981' },
                { label: 'Referidos (sem nó)', value: referredPending, icon: Network, color: '#8B5CF6' },
                { label: 'Comissões Pendentes', value: formatEur(networkStats?.pending_commissions_total ?? pendingCommissionsTotal), icon: Coins, color: '#F59E0B' },
              ].map((stat, i) => (
                <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-xs">{stat.label}</span>
                    <stat.icon className="w-4 h-4" style={{ color: stat.color }} />
                  </div>
                  <div className="text-2xl font-bold text-white">{stat.value}</div>
                </div>
              ))}
            </div>

            {skoolPendingCount > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-amber-200 text-sm">
                  🏫 <strong>{skoolPendingCount}</strong> membro(s) Premium Stripe aguardam acesso manual no Skool
                </p>
                <Link
                  href="/admin?tab=users&filter=skool_pending"
                  className="text-sm text-[#D2A63C] hover:underline flex items-center gap-1"
                >
                  Abrir gestão de utilizadores
                  <ExternalLink className="w-3.5 h-3.5" />
                </Link>
              </div>
            )}

            {/* Rank Distribution */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">Distribuição por Rank</h3>
              {loadingRanks || loadingAffiliates ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" /></div>
              ) : (
                <div className="space-y-2">
                  {ranks.map(rank => {
                    const count = affiliates.filter(a => a.rank_name === rank.name).length
                    const pct = totalAffiliates > 0 ? Math.round((count / totalAffiliates) * 100) : 0
                    return (
                      <div key={rank.id} className="flex items-center gap-3">
                        <span className="text-base">{rank.icon}</span>
                        <span className="text-gray-300 text-sm w-28 shrink-0">{rank.name}</span>
                        <div className="flex-1 bg-gray-800 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all"
                            style={{ width: `${pct}%`, backgroundColor: rank.color }}
                          />
                        </div>
                        <span className="text-gray-400 text-xs w-10 text-right">{count}</span>
                      </div>
                    )
                  })}
                  {ranks.length === 0 && <p className="text-gray-500 text-sm text-center py-4">Sem ranks configurados</p>}
                </div>
              )}
            </div>

            {/* Recent Commissions */}
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
              <h3 className="text-white font-semibold mb-4">Comissões Recentes</h3>
              {loadingCommissions ? (
                <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" /></div>
              ) : commissions.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-4">Sem comissões registadas</p>
              ) : (
                <div className="space-y-2">
                  {commissions.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                      <div>
                        <span className="text-white text-sm">{c.beneficiary_username ?? '—'}</span>
                        <span className="text-gray-500 text-xs ml-2">{TYPE_LABELS[c.type] ?? c.type}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[#D2A63C] font-semibold text-sm">{formatEur(c.amount)}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.status] ?? ''}`}>{c.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── PLANO DE COMPENSAÇÃO ──────────────────────────────────────────── */}
        {activeSection === 'ranks' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-white font-semibold text-lg">Plano de Compensação</h3>
              <Button
                onClick={() => setRankModal({})}
                size="sm"
                className="bg-[#D2A63C] text-black hover:bg-[#BB8525] font-semibold"
              >
                <Plus className="w-4 h-4 mr-1" /> Novo Rank
              </Button>
            </div>

            {loadingRanks ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" /></div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        {['', 'Nome', 'Req. Direta', 'Esq. / Dir.', 'Bónus Rank', 'Residual Mensal', 'Pack Grátis', ''].map((h, i) => (
                          <th key={i} className="px-4 py-3 text-left text-gray-400 text-xs font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {ranks.map(rank => (
                        <tr key={rank.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-4 py-3 text-center text-lg">{rank.icon}</td>
                          <td className="px-4 py-3">
                            <span className="font-medium text-white" style={{ color: rank.color }}>{rank.name}</span>
                          </td>
                          <td className="px-4 py-3 text-gray-400">{rank.direct_requirement > 0 ? rank.direct_requirement : '—'}</td>
                          <td className="px-4 py-3 text-gray-400">
                            {rank.left_requirement > 0 || rank.right_requirement > 0
                              ? `${rank.left_requirement} / ${rank.right_requirement}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-[#D2A63C]">
                            {(rank.residual_pct ?? 0) > 0 ? `${rank.residual_pct}%` : (rank.rank_bonus > 0 ? formatEur(rank.rank_bonus) : '—')}
                          </td>
                          <td className="px-4 py-3 text-green-400">
                            {(rank.bonus_unico ?? 0) > 0 ? formatEur(rank.bonus_unico ?? 0) : (rank.monthly_residual > 0 ? formatEur(rank.monthly_residual) : '—')}
                          </td>
                          <td className="px-4 py-3 text-purple-400">
                            {rank.free_pack_months > 0 ? `${rank.free_pack_months} mês/meses` : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => setRankModal(rank)}
                                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-[#D2A63C] transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => deleteRank(rank.id)}
                                className="p-1.5 rounded hover:bg-gray-700 text-gray-400 hover:text-red-400 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {ranks.length === 0 && (
                        <tr>
                          <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                            Sem ranks configurados. Clica em &ldquo;Novo Rank&rdquo; para adicionar.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── REDE DE AFILIADOS ─────────────────────────────────────────────── */}
        {activeSection === 'affiliates' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-white font-semibold text-lg">Rede de Afiliados</h3>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input
                  value={affiliateSearch}
                  onChange={e => setAffiliateSearch(e.target.value)}
                  placeholder="Pesquisar por username, email..."
                  className="bg-gray-800 border-gray-700 text-white pl-9 text-sm w-64"
                />
              </div>
              <Button onClick={fetchAffiliates} variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:text-white">
                <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
              </Button>
            </div>

            {/* Sub-tabs: Lista | Árvore | Ranks */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
                {([
                  { key: 'lista' as const, label: 'Lista', icon: Users },
                  { key: 'arvore' as const, label: 'Árvore Binária', icon: GitBranch },
                  { key: 'ranks' as const, label: 'Por Rank', icon: Award },
                ]).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setAffiliateSubTab(key)}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      affiliateSubTab === key
                        ? 'bg-[#D2A63C] text-black'
                        : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {affiliateSubTab !== 'arvore' && (
                <div className="flex flex-wrap items-center gap-2">
                  {(['all', 'tree', 'referred'] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setAffiliateView(v)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        affiliateView === v
                          ? 'border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]'
                          : 'border-gray-700 text-gray-400 hover:text-white'
                      }`}
                    >
                      {v === 'all' ? 'Todos' : v === 'tree' ? 'Árvore MLM' : 'Referidos Stripe'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* ── Tab: Árvore Binária ── */}
            {affiliateSubTab === 'arvore' && (
              <MlmBinaryTreeWidget
                compact
                onOpenEditor={() => onNavigateSection?.('tree') ?? setActiveSection('tree')}
              />
            )}

            {/* ── Tab: Por Rank ── */}
            {affiliateSubTab === 'ranks' && (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setRankFilter('all')}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      rankFilter === 'all'
                        ? 'border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]'
                        : 'border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    Todos ({treeMembers.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setRankFilter('none')}
                    className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                      rankFilter === 'none'
                        ? 'border-gray-500 bg-gray-500/15 text-gray-300'
                        : 'border-gray-700 text-gray-400 hover:text-white'
                    }`}
                  >
                    Sem rank ({noRankCount})
                  </button>
                  {rankCounts.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setRankFilter(r.id)}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        rankFilter === r.id
                          ? 'ring-1 ring-offset-1 ring-offset-gray-950'
                          : 'border-gray-700 text-gray-400 hover:text-white'
                      }`}
                      style={
                        rankFilter === r.id
                          ? { borderColor: r.color ?? '#D2A63C', backgroundColor: `${r.color ?? '#D2A63C'}22`, color: r.color ?? '#D2A63C' }
                          : undefined
                      }
                    >
                      {r.icon} {r.name} ({r.count})
                    </button>
                  ))}
                </div>

                {loadingAffiliates || loadingRanks ? (
                  <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" /></div>
                ) : (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-gray-800">
                            {['Utilizador', 'Rank', 'Rede L/R', 'Patrocinador', 'Plano', 'Ganhos', 'Ações'].map((h, i) => (
                              <th key={i} className="px-4 py-3 text-left text-gray-400 text-xs font-medium whitespace-nowrap">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rankFilteredMembers.map(aff => (
                            <tr key={aff.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                              <td className="px-4 py-3">
                                <p className="text-white font-medium text-sm">{aff.username ?? '—'}</p>
                                <p className="text-gray-500 text-xs">{aff.email ?? '—'}</p>
                              </td>
                              <td className="px-4 py-3">
                                {aff.rank_name ? (
                                  <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${aff.rank_color}25`, color: aff.rank_color ?? '#D2A63C' }}>
                                    {aff.rank_icon} {aff.rank_name}
                                  </span>
                                ) : <span className="text-gray-600 text-xs">Sem rank</span>}
                              </td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{aff.left_count ?? 0} / {aff.right_count ?? 0}</td>
                              <td className="px-4 py-3 text-gray-400 text-xs">{aff.sponsor_username ?? aff.mlm_sponsor_username ?? '—'}</td>
                              <td className="px-4 py-3">
                                {aff.subscription_plan ? (
                                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#D2A63C]/15 text-[#D2A63C] border border-[#D2A63C]/30 font-mono">
                                    {aff.subscription_plan}
                                  </span>
                                ) : <span className="text-gray-600 text-xs">—</span>}
                              </td>
                              <td className="px-4 py-3 text-[#D2A63C] font-medium text-sm">{formatEur(aff.total_earned ?? 0)}</td>
                              <td className="px-4 py-3">
                                <Link
                                  href={`/admin?tab=users&highlight=${aff.user_id}`}
                                  className="inline-flex items-center gap-1 text-xs text-[#D2A63C] hover:underline"
                                >
                                  <UserCog className="w-3.5 h-3.5" />
                                  Gerir
                                </Link>
                              </td>
                            </tr>
                          ))}
                          {rankFilteredMembers.length === 0 && (
                            <tr>
                              <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                                {affiliateSearch ? 'Nenhum membro encontrado para a pesquisa.' : 'Nenhum membro com este rank na árvore.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Tab: Lista ── */}
            {affiliateSubTab === 'lista' && (
              loadingAffiliates ? (
                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" /></div>
              ) : (
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          {['Utilizador', 'Patrocinador', 'Plataforma', 'Plano', 'Estado Sub.', 'Skool', 'Connect', 'Rank', 'Rede', 'Ganhos', 'Ações'].map((h, i) => (
                            <th key={i} className="px-4 py-3 text-left text-gray-400 text-xs font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredAffiliates.map(aff => {
                          const plat = platformLabel(aff.subscription_platform)
                          return (
                          <tr key={aff.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <p className="text-white font-medium text-sm">{aff.username ?? '—'}</p>
                              <p className="text-gray-500 text-xs">{aff.email ?? '—'}</p>
                              {aff.in_mlm_tree === false && (
                                <span className="text-[10px] text-purple-400">Referido — sem nó MLM</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">{aff.sponsor_username ?? aff.mlm_sponsor_username ?? '—'}</td>
                            <td className="px-4 py-3 text-xs text-gray-300">{plat.emoji} {plat.label}</td>
                            <td className="px-4 py-3">
                              {aff.subscription_plan ? (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-[#D2A63C]/15 text-[#D2A63C] border border-[#D2A63C]/30 font-mono">
                                  {aff.subscription_plan}
                                </span>
                              ) : <span className="text-gray-600 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const s = aff.subscription_status
                                if (!s) return <span className="text-gray-600 text-xs">—</span>
                                const cls = s === 'active' ? 'bg-green-500/20 text-green-400' :
                                            s === 'trialing' ? 'bg-blue-500/20 text-blue-400' :
                                            s === 'past_due' ? 'bg-orange-500/20 text-orange-400' :
                                            s === 'canceled' || s === 'cancelled' ? 'bg-red-500/20 text-red-400' :
                                            'bg-gray-500/20 text-gray-400'
                                return <span className={`text-xs px-2 py-0.5 rounded-full ${cls}`}>{s}</span>
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              {aff.skool_access_pending ? (
                                <div className="flex flex-col gap-1">
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">Pendente</span>
                                  <button
                                    type="button"
                                    disabled={markingSkoolId === aff.user_id}
                                    onClick={() => handleMarkSkoolGranted(aff.user_id)}
                                    className="text-[10px] text-green-400 hover:underline text-left"
                                  >
                                    {markingSkoolId === aff.user_id ? '…' : 'Marcar Skool OK'}
                                  </button>
                                </div>
                              ) : aff.member_category === 'premium' || aff.subscription_plan === 'premium' ? (
                                <span className="text-xs text-green-400">Premium</span>
                              ) : (
                                <span className="text-gray-600 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {(() => {
                                const cs = aff.stripe_connect_status
                                if (!cs || cs === 'not_started') return <span className="text-gray-600 text-xs">—</span>
                                if (cs === 'complete') return <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">✓ Ativo</span>
                                if (cs === 'pending') return <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Pendente</span>
                                return <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">{cs}</span>
                              })()}
                            </td>
                            <td className="px-4 py-3">
                              {aff.rank_name ? (
                                <span className="text-xs px-2 py-1 rounded-full" style={{ backgroundColor: `${aff.rank_color}25`, color: aff.rank_color ?? '#D2A63C' }}>
                                  {aff.rank_icon} {aff.rank_name}
                                </span>
                              ) : <span className="text-gray-600 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 text-gray-400 text-xs">
                              {aff.left_count ?? 0} / {aff.right_count ?? 0}
                            </td>
                            <td className="px-4 py-3 text-[#D2A63C] font-medium text-sm">{formatEur(aff.total_earned ?? 0)}</td>
                            <td className="px-4 py-3">
                              <Link
                                href={`/admin?tab=users&highlight=${aff.user_id}`}
                                className="inline-flex items-center gap-1 text-xs text-[#D2A63C] hover:underline"
                              >
                                <UserCog className="w-3.5 h-3.5" />
                                Gerir
                              </Link>
                            </td>
                          </tr>
                        )})}
                        {filteredAffiliates.length === 0 && (
                          <tr>
                            <td colSpan={11} className="px-4 py-12 text-center text-gray-500">
                              {affiliateSearch ? 'Nenhum afiliado encontrado para a pesquisa.' : 'Nenhum afiliado registado.'}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* ── COMISSÕES ─────────────────────────────────────────────────────── */}
        {activeSection === 'commissions' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h3 className="text-white font-semibold text-lg">Comissões</h3>
              <div className="flex gap-2">
                {selectedIds.size > 0 && (
                  <>
                    <Button onClick={() => handleBulkAction('approve')} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Aprovar ({selectedIds.size})
                    </Button>
                    <Button onClick={() => handleBulkAction('pay')} size="sm" className="bg-green-600 hover:bg-green-700 text-white font-medium">
                      <Coins className="w-3.5 h-3.5 mr-1" /> Marcar pago ({selectedIds.size})
                    </Button>
                  </>
                )}
                <Button onClick={() => fetchCommissions(commissionFilter)} variant="outline" size="sm" className="border-gray-700 text-gray-300">
                  <RefreshCw className="w-3.5 h-3.5 mr-1" /> Atualizar
                </Button>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
              {[
                { key: 'all', label: 'Todas' },
                { key: 'pending', label: 'Pendentes' },
                { key: 'approved', label: 'Aprovadas' },
                { key: 'paid', label: 'Pagas' },
              ].map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setCommissionFilter(tab.key); setSelectedIds(new Set()) }}
                  className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    commissionFilter === tab.key
                      ? 'bg-[#D2A63C] text-black'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {loadingCommissions ? (
              <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" /></div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="px-3 py-3 w-10">
                          <input
                            type="checkbox"
                            className="accent-[#D2A63C]"
                            checked={selectedIds.size === commissions.length && commissions.length > 0}
                            onChange={e => {
                              if (e.target.checked) {
                                setSelectedIds(new Set(commissions.map(c => c.id)))
                              } else {
                                setSelectedIds(new Set())
                              }
                            }}
                          />
                        </th>
                        {['Afiliado', 'Connect', 'De', 'Tipo', 'Venda', 'Comissão', 'Estado', 'Pagamento', 'Data'].map((h, i) => (
                          <th key={i} className="px-4 py-3 text-left text-gray-400 text-xs font-medium whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map(c => (
                        <tr key={c.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              className="accent-[#D2A63C]"
                              checked={selectedIds.has(c.id)}
                              onChange={e => {
                                const next = new Set(selectedIds)
                                if (e.target.checked) next.add(c.id)
                                else next.delete(c.id)
                                setSelectedIds(next)
                              }}
                            />
                          </td>
                          {/* Afiliado */}
                          <td className="px-4 py-3">
                            <p className="text-white text-sm font-medium">{c.beneficiary_username ?? '—'}</p>
                            <p className="text-gray-500 text-xs">{c.beneficiary_name ?? ''}</p>
                          </td>
                          {/* Stripe Connect */}
                          <td className="px-4 py-3">
                            {(() => {
                              const s = c.beneficiary_connect_status
                              if (!s || s === 'not_started') return (
                                <span className="text-xs text-gray-600">Sem conta</span>
                              )
                              if (s === 'complete') return (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-green-500/20 text-green-400">✓ Connect</span>
                              )
                              if (s === 'pending') return (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-500/20 text-yellow-400">Pendente</span>
                              )
                              return (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-400">{s}</span>
                              )
                            })()}
                          </td>
                          {/* De */}
                          <td className="px-4 py-3 text-gray-400 text-xs">{c.from_username ?? '—'}</td>
                          {/* Tipo */}
                          <td className="px-4 py-3 text-gray-300 text-xs">{TYPE_LABELS[c.type] ?? c.type}</td>
                          {/* Venda (valor original Stripe) */}
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {c.source_amount_cents
                              ? formatEur(c.source_amount_cents / 100)
                              : <span className="text-gray-600">—</span>}
                          </td>
                          {/* Comissão calculada */}
                          <td className="px-4 py-3 text-[#D2A63C] font-semibold text-sm">{formatEur(c.amount)}</td>
                          {/* Estado */}
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLORS[c.status] ?? ''}`}>
                              {c.status}
                            </span>
                          </td>
                          {/* Pagamento Stripe */}
                          <td className="px-4 py-3">
                            {c.stripe_transfer_id ? (
                              <span className="text-xs font-mono text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded">
                                tr_{c.stripe_transfer_id.slice(-8)}
                              </span>
                            ) : c.payout_status === 'manual' ? (
                              <span className="text-xs text-gray-500">Manual</span>
                            ) : c.payout_status === 'failed' ? (
                              <span className="text-xs text-red-400">Falhou</span>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </td>
                          {/* Data */}
                          <td className="px-4 py-3 text-gray-500 text-xs">
                            {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-PT') : '—'}
                          </td>
                        </tr>
                      ))}
                      {commissions.length === 0 && (
                        <tr>
                          <td colSpan={10} className="px-4 py-12 text-center text-gray-500">
                            Nenhuma comissão encontrada.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── DEFINIÇÕES ───────────────────────────────────────────────────── */}
        {activeSection === 'settings' && (
          <div className="max-w-md space-y-6">
            <h3 className="text-white font-semibold text-lg">Definições MLM</h3>

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
              <div>
                <Label className="text-gray-300 text-sm">Comissão de Referência Direta (%)</Label>
                <p className="text-gray-500 text-xs mt-1 mb-3">
                  Percentagem do valor da venda atribuída ao patrocinador direto.
                </p>
                <div className="flex gap-3">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={settingsCommission}
                    onChange={e => setSettingsCommission(e.target.value)}
                    className="bg-gray-800 border-gray-700 text-white"
                  />
                  <Button
                    onClick={saveCommissionPct}
                    disabled={savingSettings}
                    className="bg-[#D2A63C] text-black hover:bg-[#BB8525] font-semibold whitespace-nowrap"
                  >
                    {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
                  </Button>
                </div>
              </div>

              <div className="pt-4 border-t border-gray-800">
                <Label className="text-gray-300 text-sm">Estado do Sistema MLM</Label>
                <div className="flex items-center gap-3 mt-3">
                  <button
                    onClick={toggleMlm}
                    disabled={savingSettings}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border transition-all"
                    style={{
                      borderColor: settings?.is_active ? '#D2A63C' : '#374151',
                      background: settings?.is_active ? 'rgba(210,166,60,0.15)' : 'rgba(55,65,81,0.3)',
                    }}
                  >
                    {settings?.is_active ? (
                      <ToggleRight className="w-5 h-5 text-[#D2A63C]" />
                    ) : (
                      <ToggleLeft className="w-5 h-5 text-gray-500" />
                    )}
                    <span className={`font-medium ${settings?.is_active ? 'text-[#D2A63C]' : 'text-gray-500'}`}>
                      {settings?.is_active ? 'Sistema Ativo' : 'Sistema Inativo'}
                    </span>
                  </button>
                </div>
                <p className="text-gray-500 text-xs mt-2">
                  Quando inativo, as comissões não são atribuídas e os membros não veem o painel MLM.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
