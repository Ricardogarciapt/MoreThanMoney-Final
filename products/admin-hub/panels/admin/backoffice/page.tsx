'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/auth-context'
import MlmManager from '@/components/admin/mlm-manager'
import MlmTreeEditor from '@/components/admin/mlm-tree-editor'
import BackofficeEquipa from '@/components/admin/backoffice-equipa'
import {
  LayoutDashboard,
  Award,
  Network,
  GitBranch,
  Coins,
  Settings,
  ArrowLeft,
  Shield,
  Loader2,
  Users,
  UserCog,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const sidebarItems = [
  { id: 'dashboard',    label: 'Dashboard',             icon: LayoutDashboard },
  { id: 'tree',         label: 'Árvore Binária',        icon: GitBranch },
  { id: 'ranks',        label: 'Plano de Compensação',  icon: Award },
  { id: 'affiliates',   label: 'Rede de Afiliados',     icon: Network },
  { id: 'commissions',  label: 'Comissões',             icon: Coins },
  // A equipa de vendas fica ao LADO do MLM binário, não dentro dele: são dois sistemas de pagamento
  // distintos (papéis vs árvore) e a mesma pessoa pode ganhar pelos dois.
  { id: 'equipa',       label: 'Equipa & Acessos',      icon: UserCog },
  { id: 'settings',     label: 'Definições',            icon: Settings },
]

export default function BackofficePage() {
  const { user, isAdmin, isLoading } = useAuth()
  const router = useRouter()
  const [activeSection, setActiveSection] = useState('dashboard')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted || isLoading) return
    if (!user) {
      router.push('/login?redirect=/admin/backoffice')
      return
    }
    if (!isAdmin) {
      router.push('/new-landing')
    }
  }, [mounted, isLoading, user, isAdmin, router])

  if (!mounted || isLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!user || !isAdmin) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-950 flex">
      {/* Sidebar */}
      <aside className="w-60 shrink-0 flex flex-col bg-gray-950 border-r border-[#D2A63C]/15 fixed top-0 left-0 bottom-0 z-40">
        {/* Back to admin */}
        <div className="p-4 border-b border-[#D2A63C]/15">
          <Link
            href="/admin"
            className="flex items-center gap-2 text-gray-400 hover:text-[#D2A63C] text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Voltar ao Admin
          </Link>
        </div>

        {/* Title */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-[#D2A63C]/15">
          <div className="rounded-lg bg-[#D2A63C]/15 p-2 ring-1 ring-[#D2A63C]/25">
            <Network className="h-4 w-4 text-[#D2A63C]" />
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Backoffice MLM</div>
            <div className="text-gray-500 text-xs">Sistema de afiliados</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {sidebarItems.map(item => {
            const Icon = item.icon
            const isActive = activeSection === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left',
                  isActive
                    ? 'border-l-2 border-[#D2A63C] bg-[#D2A63C]/15 text-[#D2A63C]'
                    : 'border-l-2 border-transparent text-gray-400 hover:bg-gray-800/50 hover:text-white'
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {item.label}
              </button>
            )
          })}

          <div className="pt-3 mt-3 border-t border-[#D2A63C]/15 space-y-0.5">
            <p className="px-3 text-[10px] uppercase tracking-wider text-gray-600 mb-1">Integrações</p>
            <Link
              href="/admin?tab=users"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-white transition-colors"
            >
              <Users className="w-4 h-4 shrink-0" />
              Gestão Utilizadores
              <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
            </Link>
            <Link
              href="/admin?tab=users&filter=skool_pending"
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-gray-400 hover:bg-gray-800/50 hover:text-amber-300 transition-colors"
            >
              <span className="text-base leading-none">🏫</span>
              Skool pendente (Stripe)
              <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
            </Link>
          </div>
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-[#D2A63C]/15">
          <div className="flex items-center gap-2 text-gray-600 text-xs">
            <Shield className="w-3 h-3" />
            <span>Acesso admin</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-60 min-h-screen overflow-y-auto">
        {activeSection === 'equipa' ? (
          <BackofficeEquipa />
        ) : activeSection === 'tree' ? (
          <div className="p-6">
            <MlmTreeEditor />
          </div>
        ) : (
          <MlmManager
            activeSection={activeSection}
            setActiveSection={setActiveSection}
            onNavigateSection={setActiveSection}
          />
        )}
      </main>
    </div>
  )
}
