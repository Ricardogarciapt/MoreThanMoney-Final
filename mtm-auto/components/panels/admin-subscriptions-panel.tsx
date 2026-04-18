"use client"

import { useState } from 'react'
import { useAppStore } from '@mtm-auto/lib/store'
import { Card, Alert, Badge, RiskBar, Button, Table, Tabs } from '@mtm-auto/components/ui-primitives'

export function AdminSubscriptionsPanel() {
  const { subscriptions, pendingSubscriptions, approveSubscription, rejectSubscription, pauseSubscription, resumeSubscription } = useAppStore()
  const [activeTab, setActiveTab] = useState('pending')
  
  const tabs = [
    { id: 'pending', label: 'Pendentes', badge: pendingSubscriptions.length.toString() },
    { id: 'active', label: 'Ativas' },
    { id: 'all', label: 'Todas' },
  ]
  
  return (
    <div>
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />
      
      {activeTab === 'pending' && (
        <div>
          <Alert variant="info">
            As subscricoes necessitam de aprovacao manual antes de serem ativadas. Verifique a conta e os parametros de risco.
          </Alert>
          
          <div className="space-y-2.5">
            {pendingSubscriptions.map(sub => (
              <div 
                key={sub.id}
                className="border border-[rgba(0,212,255,0.3)] rounded-lg p-4 bg-[var(--mtm-bg3)] flex items-center gap-4"
              >
                <div className="flex flex-col gap-1.5 min-w-10 items-center">
                  <Badge variant="pending">NOVO</Badge>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold mb-0.5">
                    {sub.userName} &rarr; <strong>{sub.strategyName}</strong>
                  </div>
                  <div className="text-[11px] text-[var(--mtm-text3)] font-mono">
                    Conta #{sub.slaveAccountLogin} - {sub.server} - {sub.platform} {sub.broker}
                  </div>
                  <div className="text-[11px] text-[var(--mtm-text3)] font-mono">
                    Metodo: {sub.riskValue}{sub.riskSetting.includes('percent') ? '% saldo' : ' lote'} - SafeGuard: {sub.safeGuardDaily}%/dia - SG Total: {sub.safeGuardTotal}%
                  </div>
                  <div className="text-[11px] text-[var(--mtm-text3)] font-mono">
                    Pedido: {new Date(sub.createdAt).toLocaleString('pt-PT')}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Button size="sm" onClick={() => approveSubscription(sub.id)}>Aprovar</Button>
                  <Button size="sm" variant="danger" onClick={() => rejectSubscription(sub.id)}>Rejeitar</Button>
                </div>
              </div>
            ))}
            {pendingSubscriptions.length === 0 && (
              <div className="text-center py-10 text-[var(--mtm-text3)]">Nenhuma subscricao pendente</div>
            )}
          </div>
        </div>
      )}
      
      {activeTab === 'active' && (
        <Card>
          <Table
            columns={[
              { key: 'userName', header: 'Cliente', className: 'font-medium text-[var(--mtm-text)]' },
              { key: 'strategyName', header: 'Estrategia' },
              { key: 'slaveAccountLogin', header: 'Conta Slave', render: (row) => <span className="font-mono">#{row.slaveAccountLogin}</span> },
              { key: 'server', header: 'Servidor', render: (row) => <span className="font-mono text-[11px]">{row.server}</span> },
              { key: 'riskSetting', header: 'Metodo', render: (row) => {
                const methods: Record<string, string> = {
                  'balance_percent': '% Saldo',
                  'equity_percent': '% Equity',
                  'lot_multiplier': 'Mult. Lote',
                  'fixed_lot': 'Lote Fixo'
                }
                return methods[row.riskSetting]
              }},
              { key: 'riskValue', header: 'Parametro', render: (row) => <span className="font-mono">{row.riskValue}{row.riskSetting.includes('percent') ? '%' : ''}</span> },
              { key: 'safeGuard', header: 'SafeGuard', render: (row) => <RiskBar current={row.currentDailyLoss} max={row.safeGuardDaily} /> },
              { key: 'pnlToday', header: 'P&L Hoje', render: (row) => (
                <span className={`font-mono ${row.pnlToday >= 0 ? 'text-[var(--mtm-green)]' : 'text-[var(--mtm-red)]'}`}>
                  {row.pnlToday >= 0 ? '+' : ''}${row.pnlToday}
                </span>
              )},
              { key: 'status', header: 'Estado', render: (row) => (
                <Badge variant={row.copierMode === 'on' ? 'active' : 'paused'} dot pulse={row.copierMode === 'on'}>
                  {row.copierMode === 'on' ? 'Ativo' : 'Pausado'}
                </Badge>
              )},
              { key: 'actions', header: 'Acoes', render: (row) => (
                <div className="flex gap-1">
                  <Button variant="ghost" size="xs">Config</Button>
                  {row.copierMode === 'on' ? (
                    <Button variant="danger" size="xs" onClick={() => pauseSubscription(row.id)}>Pausar</Button>
                  ) : (
                    <Button variant="primary" size="xs" onClick={() => resumeSubscription(row.id)}>Ativar</Button>
                  )}
                </div>
              )}
            ]}
            data={subscriptions.filter(s => s.status === 'active')}
          />
        </Card>
      )}
      
      {activeTab === 'all' && (
        <Card>
          <Table
            columns={[
              { key: 'userName', header: 'Cliente', className: 'font-medium text-[var(--mtm-text)]' },
              { key: 'strategyName', header: 'Estrategia' },
              { key: 'createdAt', header: 'Inicio', render: (row) => <span className="font-mono">{new Date(row.createdAt).toLocaleDateString('pt-PT')}</span> },
              { key: 'approvedAt', header: 'Ultimo Pagamento', render: (row) => row.approvedAt ? <span className="font-mono">{new Date(row.approvedAt).toLocaleDateString('pt-PT')}</span> : '-' },
              { key: 'nextPayment', header: 'Prox. Renovacao', render: () => <span className="font-mono">15/04/26</span> },
              { key: 'totalPaid', header: 'Total Pago', render: () => <span className="text-[var(--mtm-green)] font-mono">$447</span> },
              { key: 'status', header: 'Estado', render: (row) => <Badge variant={row.status === 'active' ? 'active' : row.status === 'pending' ? 'pending' : 'paused'}>{row.status === 'active' ? 'Ativa' : row.status === 'pending' ? 'Pendente' : 'Suspensa'}</Badge> }
            ]}
            data={[...subscriptions, ...pendingSubscriptions]}
          />
        </Card>
      )}
    </div>
  )
}
