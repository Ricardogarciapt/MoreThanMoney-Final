"use client"

import { useAppStore } from '@mtm-auto/lib/store'
import { StatCard, Card, CardHeader, Badge, RiskBar, Button, Table } from '@mtm-auto/components/ui-primitives'

function EquityChart() {
  return (
    <div className="h-40 bg-[var(--mtm-bg3)] rounded-lg overflow-hidden relative">
      <svg width="100%" height="160" viewBox="0 0 600 160" preserveAspectRatio="none">
        <defs>
          <linearGradient id="cg1" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4fffb0" stopOpacity="0.25"/>
            <stop offset="100%" stopColor="#4fffb0" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <path d="M0,130 C30,118 60,108 90,90 C120,72 150,80 180,62 C210,44 240,52 270,38 C300,24 330,32 360,20 C390,8 420,14 450,10 C480,6 510,9 540,6 C570,3 585,4 600,2 L600,160 L0,160 Z" fill="url(#cg1)"/>
        <path d="M0,130 C30,118 60,108 90,90 C120,72 150,80 180,62 C210,44 240,52 270,38 C300,24 330,32 360,20 C390,8 420,14 450,10 C480,6 510,9 540,6 C570,3 585,4 600,2" stroke="#4fffb0" strokeWidth="2" fill="none"/>
      </svg>
    </div>
  )
}

export function DashboardPanel() {
  const { subscriptions, trades, setActivePanel } = useAppStore()
  const openTrades = trades.filter(t => t.status === 'open')
  
  const totalBalance = 18450
  const pnlToday = subscriptions.reduce((acc, s) => acc + s.pnlToday, 0)
  const pnlMonth = subscriptions.reduce((acc, s) => acc + s.pnlMonth, 0)
  
  return (
    <div>
      {/* Stats Row */}
      <div className="grid grid-cols-1 min-[420px]:grid-cols-2 xl:grid-cols-4 gap-3.5 mb-3.5">
        <StatCard 
          label="Saldo Total" 
          value={`$${totalBalance.toLocaleString()}`}
          subtitle={`+ $${pnlToday} hoje`}
          subtitleUp
        />
        <StatCard 
          label="Estrategias Ativas" 
          value={subscriptions.filter(s => s.status === 'active').length.toString()}
          subtitle={`de ${subscriptions.length} subscritas`}
          accent="blue"
        />
        <StatCard 
          label="P&L Este Mes" 
          value={<span className="text-[var(--mtm-green)]">+${pnlMonth}</span>}
          subtitle="+ 4.8%"
          subtitleUp
          accent="gold"
        />
        <StatCard 
          label="SafeGuard Diario" 
          value="-1.2%"
          subtitle="limite: 3% - reset 00:00"
        />
      </div>
      
      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-3.5">
        <Card>
          <CardHeader 
            title="Equity Curve - 30 Dias" 
            badge={<Badge variant="active" dot pulse>Live</Badge>}
          />
          <EquityChart />
        </Card>
        
        <Card>
          <CardHeader 
            title="Posicoes Abertas" 
            action={<Button variant="ghost" size="sm" onClick={() => setActivePanel('my-copies')}>Ver tudo</Button>}
          />
          <Table
            columns={[
              { key: 'strategyName', header: 'Estrategia', className: 'font-medium text-[var(--mtm-text)]' },
              { key: 'symbol', header: 'Par', className: 'font-mono' },
              { key: 'type', header: 'Tipo', render: (row) => <Badge variant={row.type === 'buy' ? 'buy' : 'sell'}>{row.type.toUpperCase()}</Badge> },
              { key: 'pnl', header: 'P&L', render: (row) => (
                <span className={`font-mono ${row.pnl >= 0 ? 'text-[var(--mtm-green)]' : 'text-[var(--mtm-red)]'}`}>
                  {row.pnl >= 0 ? '+' : ''}${row.pnl}
                </span>
              )}
            ]}
            data={openTrades}
          />
        </Card>
      </div>
      
      {/* Active Subscriptions */}
      <Card>
        <CardHeader 
          title="Minhas Subscricoes Ativas" 
          action={<Button size="sm" onClick={() => setActivePanel('marketplace')}>+ Nova Estrategia</Button>}
        />
        <Table
          columns={[
            { key: 'strategyName', header: 'Estrategia', className: 'font-medium text-[var(--mtm-text)]' },
            { key: 'slaveAccountLogin', header: 'Conta', render: (row) => <span className="font-mono">#{row.slaveAccountLogin} {row.platform}</span> },
            { key: 'riskSetting', header: 'Metodo', render: (row) => {
              const methods: Record<string, string> = {
                'balance_percent': '% Saldo',
                'equity_percent': '% Equity',
                'lot_multiplier': 'Mult. Lote',
                'fixed_lot': 'Lote Fixo'
              }
              return methods[row.riskSetting]
            }},
            { key: 'riskValue', header: 'Parametro', render: (row) => {
              if (row.riskSetting.includes('percent')) return <span className="font-mono">{row.riskValue}%</span>
              return <span className="font-mono">{row.riskValue}</span>
            }},
            { key: 'safeGuard', header: 'SafeGuard', render: (row) => <RiskBar current={row.currentDailyLoss} max={row.safeGuardDaily} /> },
            { key: 'pnlMonth', header: 'P&L Mes', render: (row) => (
              <span className={`font-mono ${row.pnlMonth >= 0 ? 'text-[var(--mtm-green)]' : 'text-[var(--mtm-red)]'}`}>
                {row.pnlMonth >= 0 ? '+' : ''}${row.pnlMonth}
              </span>
            )},
            { key: 'status', header: 'Estado', render: (row) => (
              <Badge variant={row.copierMode === 'on' ? 'active' : 'paused'} dot pulse={row.copierMode === 'on'}>
                {row.copierMode === 'on' ? 'Ativo' : 'Pausado'}
              </Badge>
            )},
            { key: 'actions', header: '', render: () => <Button variant="ghost" size="xs">Config</Button> }
          ]}
          data={subscriptions.filter(s => s.status === 'active')}
        />
      </Card>
    </div>
  )
}
