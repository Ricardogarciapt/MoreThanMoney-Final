"use client"

import { useState } from 'react'
import { useAppStore } from '@mtm-auto/lib/store'
import { Card, CardHeader, Alert, Badge, RiskBar, Button, Table, SectionLabel, Modal, Select, Range, Toggle, Input } from '@mtm-auto/components/ui-primitives'
import type { CopySubscription, RiskSettingType } from '@mtm-auto/lib/types'

function CopyConfigModal({ subscription, onClose }: { subscription: CopySubscription | null; onClose: () => void }) {
  const { updateSubscription, showToast } = useAppStore()
  const [riskSetting, setRiskSetting] = useState<RiskSettingType>(subscription?.riskSetting || 'balance_percent')
  const [riskValue, setRiskValue] = useState(subscription?.riskValue || 5)
  const [safeGuardDaily, setSafeGuardDaily] = useState(subscription?.safeGuardDaily || 3)
  const [safeGuardTotal, setSafeGuardTotal] = useState(subscription?.safeGuardTotal || 10)
  const [copierMode, setCopierMode] = useState(subscription?.copierMode || 'on')
  const [copyStops, setCopyStops] = useState(subscription?.copyStops ?? true)
  const [copyPendingOrders, setCopyPendingOrders] = useState(subscription?.copyPendingOrders ?? false)
  const [reverseMode, setReverseMode] = useState(subscription?.reverseMode ?? false)
  const [disabledSymbols, setDisabledSymbols] = useState(subscription?.disabledSymbols?.join(', ') || '')
  
  if (!subscription) return null
  
  const handleSave = () => {
    updateSubscription(subscription.id, {
      riskSetting,
      riskValue,
      safeGuardDaily,
      safeGuardTotal,
      copierMode: copierMode as 'on' | 'manage_only' | 'off',
      copyStops,
      copyPendingOrders,
      reverseMode,
      disabledSymbols: disabledSymbols.split(',').map(s => s.trim()).filter(Boolean)
    })
    showToast('Configuracoes atualizadas! Alteracoes sujeitas a nova aprovacao.')
    onClose()
  }
  
  const riskMethodOptions = [
    { value: 'balance_percent', label: 'Percentagem do Saldo' },
    { value: 'equity_percent', label: 'Percentagem do Equity' },
    { value: 'fixed_lot', label: 'Lote Fixo' },
    { value: 'lot_multiplier', label: 'Multiplicador de Lote' },
  ]
  
  const copierModeOptions = [
    { value: 'on', label: 'Ativo - Copia novos trades' },
    { value: 'manage_only', label: 'Gerir existentes - Nao copia novos' },
    { value: 'off', label: 'Desligado - Ignora todos os trades' },
  ]
  
  return (
    <Modal
      isOpen={!!subscription}
      onClose={onClose}
      title={`Editar Copia - ${subscription.strategyName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar Alteracoes</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div>
          <Select
            label="Modo do Copiador"
            value={copierMode}
            onChange={setCopierMode}
            options={copierModeOptions}
          />
          
          <Select
            label="Metodo de Copia"
            value={riskSetting}
            onChange={(v) => setRiskSetting(v as RiskSettingType)}
            options={riskMethodOptions}
          />
          
          <Range
            label={riskSetting.includes('percent') ? 'Percentagem por Operacao' : riskSetting === 'fixed_lot' ? 'Lote Fixo' : 'Multiplicador'}
            value={riskValue}
            onChange={setRiskValue}
            min={riskSetting.includes('percent') ? 1 : 0.01}
            max={riskSetting.includes('percent') ? 50 : 10}
            step={riskSetting.includes('percent') ? 0.5 : 0.01}
            unit={riskSetting.includes('percent') ? '%' : riskSetting === 'lot_multiplier' ? 'x' : ''}
          />
          
          <div className="mt-4">
            <Toggle checked={copyStops} onChange={setCopyStops} label="Copiar Stop Loss e Take Profit" />
            <Toggle checked={copyPendingOrders} onChange={setCopyPendingOrders} label="Copiar ordens pendentes" />
            <Toggle checked={reverseMode} onChange={setReverseMode} label="Modo reverso" />
          </div>
        </div>
        
        <div>
          <Range
            label="SafeGuard Diario (%)"
            value={safeGuardDaily}
            onChange={setSafeGuardDaily}
            min={1}
            max={10}
            step={0.5}
            unit="%"
            color="gold"
          />
          
          <Range
            label="Limite Total (%)"
            value={safeGuardTotal}
            onChange={setSafeGuardTotal}
            min={5}
            max={50}
            step={1}
            unit="%"
            color="red"
          />
          
          <Input
            label="Simbolos Desativados"
            value={disabledSymbols}
            onChange={setDisabledSymbols}
            placeholder="Ex: USDTRY, USDZAR, EURTRY"
          />
          
          <Alert variant="warning" className="text-[11px] mt-3">
            Alteracoes ficam sujeitas a nova aprovacao do admin.
          </Alert>
        </div>
      </div>
    </Modal>
  )
}

export function MyCopiesPanel() {
  const { subscriptions, trades, setActivePanel } = useAppStore()
  const [editingSub, setEditingSub] = useState<CopySubscription | null>(null)
  
  const activeSubscriptions = subscriptions.filter(s => s.status === 'active')
  const closedTrades = trades.filter(t => t.status === 'closed')
  
  return (
    <div>
      <Alert variant="info" className="mb-3.5">
        As suas copias replicam em tempo real. O SafeGuard pausa automaticamente ao atingir o limite diario - reset as 00:00 UTC.
      </Alert>
      
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-3.5">
        <SectionLabel>Subscricoes Ativas</SectionLabel>
        <Button size="sm" className="w-full sm:w-auto shrink-0" onClick={() => setActivePanel('marketplace')}>
          + Nova Estrategia
        </Button>
      </div>
      
      <Card className="mb-3.5">
        <Table
          columns={[
            { key: 'strategyName', header: 'Estrategia', className: 'font-medium text-[var(--mtm-text)]' },
            { key: 'slaveAccountLogin', header: 'Conta Slave', className: 'font-mono' },
            { key: 'broker', header: 'Broker / Server', render: (row) => (
              <div>
                <Badge variant={row.platform === 'MT5' ? 'mt5' : 'mt4'} className="mr-1">{row.platform}</Badge>
                <span className="text-[11px]">{row.server}</span>
              </div>
            )},
            { key: 'riskSetting', header: 'Metodo', render: (row) => {
              const methods: Record<string, string> = {
                'balance_percent': '% Saldo',
                'equity_percent': '% Equity',
                'lot_multiplier': 'Mult. Lote',
                'fixed_lot': 'Lote Fixo'
              }
              return <Badge variant="pending">{methods[row.riskSetting]}</Badge>
            }},
            { key: 'riskValue', header: 'Parametro', render: (row) => (
              <span className="font-mono">
                {row.riskSetting.includes('percent') ? `${row.riskValue}%` : row.riskValue}
              </span>
            )},
            { key: 'safeGuard', header: 'SafeGuard Diario', render: (row) => <RiskBar current={row.currentDailyLoss} max={row.safeGuardDaily} /> },
            { key: 'pnlToday', header: 'P&L Hoje', render: (row) => (
              <span className={`font-mono ${row.pnlToday >= 0 ? 'text-[var(--mtm-green)]' : 'text-[var(--mtm-red)]'}`}>
                {row.pnlToday >= 0 ? '+' : ''}${row.pnlToday}
              </span>
            )},
            { key: 'status', header: 'Estado', render: (row) => (
              <Badge variant={row.copierMode === 'on' ? 'active' : row.copierMode === 'manage_only' ? 'paused' : 'rejected'} dot pulse={row.copierMode === 'on'}>
                {row.copierMode === 'on' ? 'Ativo' : row.copierMode === 'manage_only' ? 'Gerir' : 'Off'}
              </Badge>
            )},
            { key: 'actions', header: '', render: (row) => (
              <Button variant="ghost" size="xs" onClick={() => setEditingSub(row)}>Config</Button>
            )}
          ]}
          data={activeSubscriptions}
        />
      </Card>
      
      <SectionLabel>Historico de Trades Copiados</SectionLabel>
      <Card>
        <Table
          columns={[
            { key: 'closedAt', header: 'Data', render: (row) => (
              <span className="font-mono text-[var(--mtm-text3)]">
                {row.closedAt ? new Date(row.closedAt).toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }) : '-'}
              </span>
            )},
            { key: 'strategyName', header: 'Estrategia' },
            { key: 'symbol', header: 'Par', className: 'font-mono' },
            { key: 'type', header: 'Tipo', render: (row) => <Badge variant={row.type === 'buy' ? 'buy' : 'sell'}>{row.type.toUpperCase()}</Badge> },
            { key: 'lot', header: 'Lote', render: (row) => <span className="font-mono">{row.lot.toFixed(2)}</span> },
            { key: 'entryPrice', header: 'Entrada', render: (row) => <span className="font-mono">{row.entryPrice}</span> },
            { key: 'exitPrice', header: 'Saida', render: (row) => <span className="font-mono">{row.exitPrice || '-'}</span> },
            { key: 'pnl', header: 'P&L', render: (row) => (
              <span className={`font-mono ${row.pnl >= 0 ? 'text-[var(--mtm-green)]' : 'text-[var(--mtm-red)]'}`}>
                {row.pnl >= 0 ? '+' : ''}${row.pnl.toFixed(2)}
              </span>
            )}
          ]}
          data={closedTrades}
        />
      </Card>
      
      <CopyConfigModal subscription={editingSub} onClose={() => setEditingSub(null)} />
    </div>
  )
}
