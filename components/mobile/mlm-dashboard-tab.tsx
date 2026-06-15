'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { Copy, Check, Loader2, Network, TrendingUp, Users, Coins, AlertCircle, CreditCard, ExternalLink, CheckCircle2, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'

// ─── Types ────────────────────────────────────────────────────────────────────

interface MlmRank {
  id: number
  name: string
  color: string
  icon: string
  left_requirement: number
  right_requirement: number
  direct_requirement: number
  rank_bonus: number
  monthly_residual: number
}

interface MlmNode {
  id: string
  left_count: number
  right_count: number
  total_direct: number
  total_earned: number
  pending_commissions: number
  rank_id: number
}

interface MlmCommission {
  id: string
  type: string
  amount: number
  currency: string
  status: string
  source_plan: string | null
  from_username?: string | null
  created_at: string
}

interface DownlineItem {
  username: string | null
  full_name: string | null
  subscription_plan: string | null
  is_active: boolean
  rank_name: string
  joined_at: string
}

// ─── Stripe Connect Widget ────────────────────────────────────────────────────

function StripeConnectWidget() {
  const [status, setStatus] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [actioning, setActioning] = useState(false)

  const fetchStatus = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/affiliate/stripe-connect')
      if (res.ok) {
        const data = await res.json()
        setStatus(data.status || 'not_started')
      }
    } catch { /* ignore */ } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  const handleConnect = async () => {
    setActioning(true)
    try {
      const res = await fetch('/api/affiliate/stripe-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: status === 'not_started' ? 'create' : 'refresh' }),
      })
      const data = await res.json()
      if (data.onboarding_url) {
        window.location.href = data.onboarding_url
      }
    } catch { /* ignore */ } finally { setActioning(false) }
  }

  if (loading) return null

  if (status === 'complete') {
    return (
      <div className="bg-green-500/10 border border-green-500/30 rounded-2xl p-4 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
        <div>
          <p className="text-green-400 text-sm font-medium">Pagamentos automáticos ativos</p>
          <p className="text-gray-500 text-xs mt-0.5">As comissões são transferidas diretamente para a tua conta bancária após aprovação.</p>
        </div>
      </div>
    )
  }

  if (status === 'pending') {
    return (
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <Clock className="w-5 h-5 text-yellow-400 shrink-0" />
          <div>
            <p className="text-yellow-400 text-sm font-medium">Verificação em curso</p>
            <p className="text-gray-500 text-xs mt-0.5">O Stripe está a verificar os teus dados. Normalmente demora 1-2 dias.</p>
          </div>
        </div>
        <Button onClick={handleConnect} disabled={actioning} variant="outline" size="sm"
          className="w-full border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 text-xs">
          {actioning ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
          Continuar verificação
        </Button>
      </div>
    )
  }

  return (
    <div className="bg-gray-900 border border-[#D2A63C]/20 rounded-2xl p-4">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#D2A63C]/15 flex items-center justify-center shrink-0">
          <CreditCard className="w-5 h-5 text-[#D2A63C]" />
        </div>
        <div>
          <p className="text-white text-sm font-semibold">Receber comissões automaticamente</p>
          <p className="text-gray-400 text-xs mt-1">
            Liga a tua conta bancária via Stripe. Quando o admin aprovar as tuas comissões,
            o dinheiro é transferido direto para o teu banco, em segundos.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 mb-4">
        {[
          'Transferência SEPA automática',
          'Seguro e verificado pelo Stripe',
          'Sem taxas escondidas',
        ].map(f => (
          <div key={f} className="flex items-center gap-2 text-xs text-gray-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-[#D2A63C] shrink-0" />
            {f}
          </div>
        ))}
      </div>
      <Button
        onClick={handleConnect}
        disabled={actioning}
        className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black font-semibold text-sm"
      >
        {actioning
          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> A abrir Stripe...</>
          : <><ExternalLink className="w-4 h-4 mr-2" /> Ligar conta bancária</>}
      </Button>
    </div>
  )
}

// ─── Dashboard Data ────────────────────────────────────────────────────────────

interface DashboardData {
  mlm_enabled: boolean
  node: MlmNode | null
  rank: MlmRank | null
  next_rank: MlmRank | null
  referral_url: string
  recent_commissions: MlmCommission[]
  downline: DownlineItem[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  direct_referral: 'Referência Direta',
  rank_bonus: 'Bónus Rank',
  monthly_residual: 'Residual Mensal',
  rank_residual: 'Residual de Rank',
  free_pack: 'Pack Grátis',
}

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  pending:   { label: 'Pendente',  cls: 'bg-yellow-500/20 text-yellow-400' },
  approved:  { label: 'Aprovada',  cls: 'bg-blue-500/20 text-blue-400' },
  paid:      { label: 'Paga',      cls: 'bg-green-500/20 text-green-400' },
  cancelled: { label: 'Cancelada', cls: 'bg-red-500/20 text-red-400' },
}

function formatEur(v: number) {
  return `${(v ?? 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
  return (
    <div className="w-full bg-gray-800 rounded-full h-2">
      <div
        className="h-2 rounded-full transition-all"
        style={{ width: `${pct}%`, backgroundColor: color }}
      />
    </div>
  )
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MlmDashboardTab() {
  const { user } = useAuth()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  const fetchDashboard = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) {
        setError('Sessão expirada. Faz login novamente.')
        setLoading(false)
        return
      }

      const res = await fetch('/api/mlm/dashboard', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setError(err.error || 'Erro ao carregar dados MLM')
        setLoading(false)
        return
      }

      const json: DashboardData = await res.json()
      setData(json)
    } catch (err: any) {
      setError(err.message || 'Erro inesperado')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  const copyReferral = async () => {
    if (!data?.referral_url) return
    try {
      await navigator.clipboard.writeText(data.referral_url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const ta = document.createElement('textarea')
      ta.value = data.referral_url
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center py-16">
        <Loader2 className="w-7 h-7 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  // ── Error ─────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-500/15 border border-red-500/30 rounded-xl p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-400 text-sm font-medium">Erro ao carregar</p>
            <p className="text-red-400/70 text-xs mt-1">{error}</p>
          </div>
        </div>
        <Button onClick={fetchDashboard} variant="outline" size="sm" className="mt-3 border-gray-700 text-gray-300 w-full">
          Tentar novamente
        </Button>
      </div>
    )
  }

  // ── MLM Disabled ──────────────────────────────────────────────────────────
  if (!data?.mlm_enabled) {
    return (
      <div className="p-4 flex flex-col items-center justify-center py-16 text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#D2A63C]/15 ring-1 ring-[#D2A63C]/30 flex items-center justify-center mb-4">
          <Network className="w-7 h-7 text-[#D2A63C]" />
        </div>
        <h3 className="text-white font-bold text-lg mb-2">Sistema MLM</h3>
        <p className="text-gray-400 text-sm">
          O sistema MLM não está ativo de momento.
          <br />Quando estiver disponível, poderás convidar amigos e ganhar comissões.
        </p>
      </div>
    )
  }

  const { node, rank, next_rank, referral_url, recent_commissions, downline } = data

  // ── No node yet ───────────────────────────────────────────────────────────
  if (!node) {
    return (
      <div className="p-4 space-y-4">
        <div className="bg-gray-900 border border-[#D2A63C]/20 rounded-2xl p-5 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#D2A63C]/15 flex items-center justify-center mx-auto mb-3">
            <Network className="w-6 h-6 text-[#D2A63C]" />
          </div>
          <h3 className="text-white font-bold text-base mb-2">Começa a ganhar com afiliados</h3>
          <p className="text-gray-400 text-sm mb-4">
            Partilha o teu link de referência e ganha comissões em cada nova subscrição.
          </p>
          {referral_url && (
            <div className="bg-gray-800 rounded-xl p-3 flex items-center gap-2 text-left">
              <span className="text-gray-300 text-xs flex-1 truncate">{referral_url}</span>
              <button onClick={copyReferral} className="shrink-0 text-[#D2A63C] hover:text-[#BB8525] transition-colors">
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Full Dashboard ────────────────────────────────────────────────────────
  return (
    <div className="p-4 space-y-4 pb-8">
      {/* Rank Badge */}
      {rank && (
        <div
          className="rounded-2xl p-4 border-2"
          style={{ borderColor: rank.color, background: `${rank.color}12` }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
              style={{ backgroundColor: `${rank.color}25` }}
            >
              {rank.icon}
            </div>
            <div>
              <div className="text-gray-400 text-xs">Rank Atual</div>
              <div className="text-white font-bold text-lg" style={{ color: rank.color }}>
                {rank.name}
              </div>
            </div>
            {rank.monthly_residual > 0 && (
              <div className="ml-auto text-right">
                <div className="text-gray-500 text-xs">Residual</div>
                <div className="text-[#D2A63C] font-bold">{formatEur(rank.monthly_residual)}/mês</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Progress to next rank */}
      {next_rank && node && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-400 text-sm">Progresso para {next_rank.icon} {next_rank.name}</span>
          </div>
          {(next_rank.left_requirement > 0 || next_rank.right_requirement > 0) && (
            <>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Perna Esquerda</span>
                  <span className="text-white font-medium">{node.left_count ?? 0} / {next_rank.left_requirement}</span>
                </div>
                <ProgressBar value={node.left_count ?? 0} max={next_rank.left_requirement} color={next_rank.color} />
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Perna Direita</span>
                  <span className="text-white font-medium">{node.right_count ?? 0} / {next_rank.right_requirement}</span>
                </div>
                <ProgressBar value={node.right_count ?? 0} max={next_rank.right_requirement} color={next_rank.color} />
              </div>
            </>
          )}
          {next_rank.direct_requirement > 0 && (
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-gray-400">Referências Diretas</span>
                <span className="text-white font-medium">{node.total_direct ?? 0} / {next_rank.direct_requirement}</span>
              </div>
              <ProgressBar value={node.total_direct ?? 0} max={next_rank.direct_requirement} color={next_rank.color} />
            </div>
          )}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Referências Diretas', value: node?.total_direct ?? 0, icon: Users, color: '#3B82F6' },
          { label: 'Perna Esquerda',      value: node?.left_count ?? 0,   icon: TrendingUp, color: '#8B5CF6' },
          { label: 'Perna Direita',       value: node?.right_count ?? 0,  icon: TrendingUp, color: '#10B981' },
          { label: 'Total Ganho',         value: formatEur(node?.total_earned ?? 0), icon: Coins, color: '#D2A63C' },
        ].map((stat, i) => (
          <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <stat.icon className="w-3.5 h-3.5" style={{ color: stat.color }} />
              <span className="text-gray-500 text-xs">{stat.label}</span>
            </div>
            <div className="text-white font-bold">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Pending commissions */}
      {(node?.pending_commissions ?? 0) > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/25 rounded-xl p-3 flex items-center gap-3">
          <Coins className="w-5 h-5 text-yellow-400 shrink-0" />
          <div>
            <div className="text-yellow-400 text-sm font-semibold">{formatEur(node.pending_commissions)} pendente</div>
            <div className="text-yellow-400/60 text-xs">Em processamento pelo administrador</div>
          </div>
        </div>
      )}

      {/* Referral Link */}
      {referral_url && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <div className="text-gray-400 text-xs mb-2 font-medium">O teu link de referência</div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-gray-800 rounded-lg px-3 py-2 text-gray-300 text-xs truncate">
              {referral_url}
            </div>
            <button
              onClick={copyReferral}
              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition-all"
              style={{ background: copied ? '#10B98125' : '#D2A63C25', color: copied ? '#10B981' : '#D2A63C' }}
            >
              {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Recent Commissions */}
      {recent_commissions.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h4 className="text-white font-semibold text-sm mb-3">Comissões Recentes</h4>
          <div className="space-y-2">
            {recent_commissions.slice(0, 5).map(c => {
              const statusInfo = STATUS_LABELS[c.status] ?? { label: c.status, cls: 'bg-gray-500/20 text-gray-400' }
              return (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-gray-300 text-xs font-medium truncate">{TYPE_LABELS[c.type] ?? c.type}</div>
                    {c.from_username && (
                      <div className="text-gray-600 text-xs">de @{c.from_username}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 ml-2 shrink-0">
                    <span className="text-[#D2A63C] font-bold text-sm">{formatEur(c.amount)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.cls}`}>
                      {statusInfo.label}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Stripe Connect — receber pagamentos automáticos ─────────────────── */}
      <StripeConnectWidget />

      {/* Downline */}
      {downline.length > 0 && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <h4 className="text-white font-semibold text-sm mb-3">Referências Diretas ({downline.length})</h4>
          <div className="space-y-2">
            {downline.map((d, i) => (
              <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ background: '#D2A63C25', color: '#D2A63C' }}
                >
                  {(d.username ?? d.full_name ?? '?')[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white text-sm font-medium truncate">
                    {d.username ? `@${d.username}` : d.full_name ?? '—'}
                  </div>
                  <div className="text-gray-500 text-xs">{d.rank_name}</div>
                </div>
                <div className="shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${d.is_active ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {d.is_active ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
