"use client"

import { useAppStore } from '@mtm-auto/lib/store'
import { StatCard, Card, CardHeader, Badge, RiskBar, Button, Table } from '@mtm-auto/components/ui-primitives'

export function AdminDashboardPanel() {
  const { strategies, subscriptions, pendingSubscriptions, approveSubscription, rejectSubscription } = useAppStore()
  
  const totalRevenue = strategies.reduce((acc, s) => acc + (s.priceMonthly * s.subscribers), 0)
  const activeStrategies = strategies.filter(s => s.status === 'active').length
  const totalSubscribers = strategies.reduce((acc, s) => acc + s.subscribers, 0)
  const totalCapital = 248000 // simulated
  
  // SafeGuard alerts simulation
  const safeGuardAlerts = [
    { name: 'Pedro Lopes', strategy: 'Grid Bot Pro', current: 2.8, max: 3, status: 'warning' },
    { name: 'John Silva', strategy: 'Alpha Scalper', current: 1.2, max: 3, status: 'ok' },
    { name: 'Maria Costa', strategy: 'Trend Master', current: 0.5, max: 2, status: 'ok' },
  ]
  
  return (
    <div>
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3.5 mb-3.5">
        <StatCard 
          label="Receita Mensal" 
          value={<span className="text-[var(--mtm-gold)]">${totalRevenue.toLocaleString()}</span>}
          subtitle="+ 18% vs mes ant."
          subtitleUp
          accent="gold"
        />
        <StatCard 
          label="Estrategias Ativas" 
          value={activeStrategies.toString()}
          subtitle={`${strategies.length} total - ${totalSubscribers} slaves`}
        />
        <StatCard 
          label="Subscricoes Ativas" 
          value={subscriptions.length.toString()}
          subtitle={`${pendingSubscriptions.length} aguardam aprovacao`}
          accent="blue"
        />
        <StatCard 
          label="Capital Gerido" 
          value={<span className="text-[var(--mtm-green)]">$${(totalCapital / 1000).toFixed(0)}K</span>}
          subtitle="+ $12K este mes"
          subtitleUp
        />
      </div>
      
      {/* Middle Row */}
      <div className="grid grid-cols-2 gap-3.5 mb-3.5">
        {/* Pending Approvals */}
        <Card>
          <CardHeader 
            title="Aprovacoes Pendentes" 
            badge={<Badge variant="pending">{pendingSubscriptions.length}</Badge>}
          />
          <div className="space-y-2.5">
            {pendingSubscriptions.map(sub => (
              <div 
                key={sub.id}
                className="border border-[rgba(0,212,255,0.3)] rounded-lg p-3.5 bg-[var(--mtm-bg3)] flex items-center gap-3.5"
              >
                <Badge variant="pending">NOVO</Badge>
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-0.5">{sub.userName} &rarr; {sub.strategyName}</div>
                  <div className="text-[11px] text-[var(--mtm-text3)] font-mono">
                    Conta #{sub.slaveAccountLogin} - {sub.server} - {sub.riskValue}{sub.riskSetting.includes('percent') ? '%' : ''} - SG {sub.safeGuardDaily}%
                  </div>
                </div>
                <Button size="xs" onClick={() => approveSubscription(sub.id)}>Aprovar</Button>
                <Button size="xs" variant="danger" onClick={() => rejectSubscription(sub.id)}>X</Button>
              </div>
            ))}
            {pendingSubscriptions.length === 0 && (
              <div className="text-center py-8 text-[var(--mtm-text3)]">Nenhuma aprovacao pendente</div>
            )}
          </div>
        </Card>
        
        {/* SafeGuard Alerts */}
        <Card>
          <CardHeader title="Alertas SafeGuard" />
          <div className="space-y-2">
            {safeGuardAlerts.map((alert, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2.5 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg">
                <span 
                  className={`w-1.5 h-1.5 rounded-full ${alert.status === 'warning' ? 'bg-[var(--mtm-gold)]' : 'bg-[var(--mtm-green)]'}`}
                  style={{ 
                    boxShadow: `0 0 6px ${alert.status === 'warning' ? 'var(--mtm-gold)' : 'var(--mtm-green)'}`,
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}
                />
                <span className="flex-1 text-sm font-medium">{alert.name} - {alert.strategy}</span>
                <span className="text-[11px] text-[var(--mtm-text3)] font-mono">
                  -{alert.current}% / {alert.max}% {alert.status === 'warning' ? '! Proximo' : 'OK'}
                </span>
                <Badge variant={alert.status === 'warning' ? 'paused' : 'active'}>
                  {alert.status === 'warning' ? 'ATENCAO' : 'OK'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
      
      {/* Performance Table */}
      <Card>
        <CardHeader title="Performance por Estrategia - 30 Dias" />
        <Table
          columns={[
            { key: 'name', header: 'Estrategia', className: 'font-medium text-[var(--mtm-text)]' },
            { key: 'groupName', header: 'Grupo' },
            { key: 'return', header: 'Retorno', render: (row) => (
              <span className="text-[var(--mtm-green)] font-mono">+{row.stats.return90d}%</span>
            )},
            { key: 'winRate', header: 'Win Rate', render: (row) => <span className="font-mono">{row.stats.winRate}%</span> },
            { key: 'subscribers', header: 'Subscribers', render: (row) => row.subscribers },
            { key: 'revenue', header: 'Receita', render: (row) => (
              <span className="text-[var(--mtm-gold)] font-mono">${(row.priceMonthly * row.subscribers).toLocaleString()}</span>
            )},
            { key: 'status', header: 'Estado', render: (row) => (
              <Badge variant={row.status === 'active' ? 'active' : 'paused'} dot pulse={row.status === 'active'}>
                {row.status === 'active' ? 'Live' : 'Pausa'}
              </Badge>
            )}
          ]}
          data={strategies}
        />
      </Card>
    </div>
  )
}
