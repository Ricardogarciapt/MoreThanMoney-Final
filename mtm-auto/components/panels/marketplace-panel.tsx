"use client"

import { useState } from 'react'
import { useAppStore } from '@mtm-auto/lib/store'
import { Select, Badge } from '@mtm-auto/components/ui-primitives'
import { StrategyDetailModal } from '@mtm-auto/components/modals/strategy-detail-modal'
import type { Strategy } from '@mtm-auto/lib/types'

function MiniChart({ color = '#4fffb0' }: { color?: string }) {
  const gradientId = `sg-${color.replace('#', '')}`
  return (
    <svg width="100%" height="36" viewBox="0 0 260 36" className="mb-2">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d="M0,30 C20,24 40,20 60,15 C80,10 100,13 120,8 C140,3 160,6 180,3 C200,0 220,2 240,1 L260,0 L260,36 L0,36Z" fill={`url(#${gradientId})`}/>
      <path d="M0,30 C20,24 40,20 60,15 C80,10 100,13 120,8 C140,3 160,6 180,3 C200,0 220,2 240,1 L260,0" stroke={color} strokeWidth="1.5" fill="none"/>
    </svg>
  )
}

function StrategyCard({ strategy, onClick }: { strategy: Strategy; onClick: () => void }) {
  const colors = {
    low: { bg: 'rgba(79,255,176,0.1)', color: 'var(--mtm-green)', chart: '#4fffb0' },
    medium: { bg: 'rgba(245,200,66,0.1)', color: 'var(--mtm-gold)', chart: '#f5c842' },
    high: { bg: 'rgba(255,77,109,0.1)', color: 'var(--mtm-red)', chart: '#ff4d6d' }
  }
  
  const riskColor = colors[strategy.riskLevel]
  const riskLabels = { low: 'Baixo', medium: 'Medio', high: 'Alto' }
  const riskPercent = { low: 30, medium: 55, high: 80 }
  
  const icons: Record<string, string> = {
    'zap': 'Z',
    'trending-up': 'T',
    'bot': 'B',
    'newspaper': 'N'
  }
  
  return (
    <div 
      className="bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-xl overflow-hidden cursor-pointer transition-all hover:border-[var(--mtm-green)] hover:-translate-y-0.5 hover:shadow-[0_8px_28px_rgba(0,0,0,0.4),0_0_30px_rgba(79,255,176,0.12)]"
      onClick={onClick}
    >
      <div className="p-4 border-b border-[var(--mtm-border)]">
        <div className="flex items-start gap-3 mb-2.5">
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: riskColor.bg }}
          >
            {icons[strategy.icon] || 'S'}
          </div>
          <div>
            <h3 className="font-bold text-[15px] mb-0.5">{strategy.name}</h3>
            <p className="text-[11px] text-[var(--mtm-text3)] leading-snug">{strategy.description}</p>
          </div>
        </div>
        
        <MiniChart color={riskColor.chart} />
        
        <div className="grid grid-cols-3 gap-1.5 mb-2">
          <div className="text-center bg-[var(--mtm-bg3)] rounded-md py-1.5 px-1">
            <div className="font-bold text-[15px] text-[var(--mtm-green)]">+{strategy.stats.return90d}%</div>
            <div className="text-[9px] text-[var(--mtm-text3)] font-mono mt-0.5">90d Retorno</div>
          </div>
          <div className="text-center bg-[var(--mtm-bg3)] rounded-md py-1.5 px-1">
            <div className="font-bold text-[15px]">{strategy.stats.winRate}%</div>
            <div className="text-[9px] text-[var(--mtm-text3)] font-mono mt-0.5">Win Rate</div>
          </div>
          <div className="text-center bg-[var(--mtm-bg3)] rounded-md py-1.5 px-1">
            <div className="font-bold text-[15px] text-[var(--mtm-red)]">-{strategy.stats.maxDrawdown}%</div>
            <div className="text-[9px] text-[var(--mtm-text3)] font-mono mt-0.5">Max DD</div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-[10px] text-[var(--mtm-text3)]">
          <span>Risco</span>
          <div className="flex-1 h-[3px] bg-[var(--mtm-bg4)] rounded-sm overflow-hidden">
            <div 
              className="h-full rounded-sm"
              style={{ width: `${riskPercent[strategy.riskLevel]}%`, backgroundColor: riskColor.color }}
            />
          </div>
          <span style={{ color: riskColor.color }}>{riskLabels[strategy.riskLevel]}</span>
        </div>
        
        <div className="text-[10px] text-[var(--mtm-text3)] font-mono mt-1.5">
          Capital minimo sugerido: ${strategy.minCapital.toLocaleString()}
        </div>
      </div>
      
      <div className="p-4 flex items-center justify-between">
        <div>
          <div className="font-bold text-xl text-[var(--mtm-gold)]">
            ${strategy.priceMonthly}<span className="text-[11px] text-[var(--mtm-text3)] font-normal">/mes</span>
          </div>
          <div className="text-[10px] text-[var(--mtm-text3)]">{strategy.subscribers} subscritores</div>
        </div>
        <div className="flex gap-1 flex-wrap">
          {strategy.platforms.map(p => (
            <Badge key={p} variant={p === 'MT5' ? 'mt5' : 'mt4'}>{p}</Badge>
          ))}
          {strategy.environments.map(e => (
            <Badge key={e} variant={e === 'live' ? 'live' : 'demo'}>{e.toUpperCase()}</Badge>
          ))}
        </div>
      </div>
    </div>
  )
}

export function MarketplacePanel() {
  const { strategies, groups } = useAppStore()
  const [selectedGroup, setSelectedGroup] = useState('all')
  const [selectedPlatform, setSelectedPlatform] = useState('all')
  const [selectedEnv, setSelectedEnv] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedStrategy, setSelectedStrategy] = useState<Strategy | null>(null)
  
  const filteredStrategies = strategies.filter(s => {
    if (selectedGroup !== 'all' && s.groupId !== selectedGroup) return false
    if (selectedPlatform !== 'all' && !s.platforms.includes(selectedPlatform as 'MT4' | 'MT5')) return false
    if (selectedEnv !== 'all' && !s.environments.includes(selectedEnv as 'live' | 'demo')) return false
    if (search && !s.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })
  
  const groupOptions = [
    { value: 'all', label: 'Todos os Grupos' },
    ...groups.map(g => ({ value: g.id, label: g.name }))
  ]
  
  return (
    <div>
      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-3.5">
        <div className="flex flex-col gap-2 min-[400px]:flex-row min-[400px]:flex-wrap min-[400px]:gap-2.5">
          <Select
            value={selectedGroup}
            onChange={setSelectedGroup}
            options={groupOptions}
            className="w-full min-[400px]:w-40 mb-0"
          />
          <Select
            value={selectedPlatform}
            onChange={setSelectedPlatform}
            options={[
              { value: 'all', label: 'MT4 + MT5' },
              { value: 'MT4', label: 'Apenas MT4' },
              { value: 'MT5', label: 'Apenas MT5' },
            ]}
            className="w-full min-[400px]:w-32 mb-0"
          />
          <Select
            value={selectedEnv}
            onChange={setSelectedEnv}
            options={[
              { value: 'all', label: 'Live + Demo' },
              { value: 'live', label: 'Apenas Live' },
              { value: 'demo', label: 'Apenas Demo' },
            ]}
            className="w-full min-[400px]:w-32 mb-0"
          />
        </div>
        
        <div className="relative w-full sm:w-56 shrink-0">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--mtm-text3)] text-sm pointer-events-none">
            Pesquisar...
          </span>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder=""
            className="w-full bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-md px-3 py-2 pl-24 text-xs text-[var(--mtm-text)] outline-none transition-all focus:border-[var(--mtm-green)]"
          />
        </div>
      </div>
      
      {/* Strategy Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
        {filteredStrategies.map(strategy => (
          <StrategyCard 
            key={strategy.id} 
            strategy={strategy}
            onClick={() => setSelectedStrategy(strategy)}
          />
        ))}
      </div>
      
      {/* Strategy Detail Modal */}
      <StrategyDetailModal
        strategy={selectedStrategy}
        onClose={() => setSelectedStrategy(null)}
      />
    </div>
  )
}
