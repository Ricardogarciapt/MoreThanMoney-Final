"use client"

import { useState } from 'react'
import { useAppStore } from '@mtm-auto/lib/store'
import { Modal, Alert, Select, Range, Toggle, Button } from '@mtm-auto/components/ui-primitives'
import type { Strategy, RiskSettingType } from '@mtm-auto/lib/types'

interface Props {
  strategy: Strategy
  onClose: () => void
}

export function SubscribeModal({ strategy, onClose }: Props) {
  const { accounts, user, createSubscription } = useAppStore()
  const slaveAccounts = accounts.filter(a => a.role === 'slave')
  
  const [selectedAccount, setSelectedAccount] = useState(slaveAccounts[0]?.id || '')
  const [riskSetting, setRiskSetting] = useState<RiskSettingType>('balance_percent')
  const [riskValue, setRiskValue] = useState(strategy.minCopyPercent)
  const [safeGuardDaily, setSafeGuardDaily] = useState(strategy.minSafeGuard)
  const [safeGuardTotal, setSafeGuardTotal] = useState(10)
  const [safeGuardAction, setSafeGuardAction] = useState('pause')
  const [copyStops, setCopyStops] = useState(true)
  const [copyPendingOrders, setCopyPendingOrders] = useState(false)
  const [reverseMode, setReverseMode] = useState(false)
  
  const account = slaveAccounts.find(a => a.id === selectedAccount)
  
  const riskMethodOptions = [
    { value: 'balance_percent', label: `Percentagem do Saldo (min. ${strategy.minCopyPercent}%)` },
    { value: 'equity_percent', label: `Percentagem do Equity (min. ${strategy.minCopyPercent}%)` },
    { value: 'fixed_lot', label: `Lote Fixo (min. ${strategy.minLot})` },
    { value: 'lot_multiplier', label: 'Multiplicador de Lote' },
  ]
  
  const safeGuardActionOptions = [
    { value: 'pause', label: 'Pausar copia (manter posicoes abertas)' },
    { value: 'close_all', label: 'Fechar todas as posicoes e pausar' },
    { value: 'notify', label: 'Apenas notificar' },
  ]
  
  const accountOptions = slaveAccounts.map(a => ({
    value: a.id,
    label: `#${a.login} - ${a.server} - ${a.platform} ${a.environment.toUpperCase()} ($${a.balance.toLocaleString()})`
  }))
  
  if (accountOptions.length === 0) {
    accountOptions.push({ value: '', label: '+ Adicionar nova conta...' })
  }
  
  const getRiskConfig = () => {
    switch (riskSetting) {
      case 'balance_percent':
      case 'equity_percent':
        return { min: strategy.minCopyPercent, max: 50, step: 0.5, unit: '%', label: 'Percentagem por Operacao' }
      case 'fixed_lot':
        return { min: strategy.minLot, max: 10, step: 0.01, unit: '', label: 'Lote Fixo' }
      case 'lot_multiplier':
        return { min: 0.1, max: 5, step: 0.1, unit: 'x', label: 'Multiplicador de Lote' }
      default:
        return { min: 5, max: 50, step: 0.5, unit: '%', label: 'Parametro' }
    }
  }
  
  const riskConfig = getRiskConfig()
  
  const handleSubmit = () => {
    if (!account || !user) return
    
    createSubscription({
      userId: user.id,
      userName: user.name,
      strategyId: strategy.id,
      strategyName: strategy.name,
      slaveAccountId: account.id,
      slaveAccountLogin: account.login,
      broker: account.broker,
      server: account.server,
      platform: account.platform,
      riskSetting,
      riskValue,
      copierMode: 'on',
      copyStops,
      copyLimits: true,
      stopLimitMode: 'copy',
      safeGuardDaily,
      safeGuardTotal,
      safeGuardAction: safeGuardAction as 'pause' | 'close_all' | 'notify',
      disabledSymbols: [],
      copyPendingOrders,
      copyTrailingStop: true,
      reverseMode,
    })
    
    onClose()
  }
  
  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={`Configurar Copia - ${strategy.name}`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!account}>Enviar Pedido de Subscricao</Button>
        </>
      }
    >
      <Alert variant="info">
        Mestre recomenda: <strong>{strategy.minCopyPercent}% saldo min.</strong> - <strong>lote min. {strategy.minLot}</strong> - <strong>SafeGuard min. {strategy.minSafeGuard}%/dia</strong>. Nao pode definir valores abaixo destes limites.
      </Alert>
      
      <div className="grid grid-cols-2 gap-5">
        {/* Left Column - Copy Settings */}
        <div>
          <Select
            label="Conta Slave"
            value={selectedAccount}
            onChange={setSelectedAccount}
            options={accountOptions}
          />
          
          <Select
            label="Metodo de Copia"
            value={riskSetting}
            onChange={(v) => {
              setRiskSetting(v as RiskSettingType)
              const config = getRiskConfig()
              setRiskValue(config.min)
            }}
            options={riskMethodOptions}
          />
          
          <Range
            label={riskConfig.label}
            value={riskValue}
            onChange={setRiskValue}
            min={riskConfig.min}
            max={riskConfig.max}
            step={riskConfig.step}
            unit={riskConfig.unit}
          />
          
          <div className="mt-4">
            <Toggle 
              checked={copyStops} 
              onChange={setCopyStops}
              label="Copiar Stop Loss e Take Profit"
            />
            <Toggle 
              checked={copyPendingOrders} 
              onChange={setCopyPendingOrders}
              label="Copiar ordens pendentes"
            />
            <Toggle 
              checked={reverseMode} 
              onChange={setReverseMode}
              label="Modo reverso"
            />
          </div>
        </div>
        
        {/* Right Column - SafeGuard Settings */}
        <div>
          <Alert variant="warning" className="text-[11px] mb-3">
            Minimo obrigatorio: <strong>{strategy.minSafeGuard}%/dia</strong> (exigido pelo mestre)
          </Alert>
          
          <Range
            label="SafeGuard - Limite de Perda Diaria"
            value={safeGuardDaily}
            onChange={setSafeGuardDaily}
            min={strategy.minSafeGuard}
            max={10}
            step={0.5}
            unit="%"
            color="gold"
          />
          
          <Select
            label="Accao ao Atingir Limite"
            value={safeGuardAction}
            onChange={setSafeGuardAction}
            options={safeGuardActionOptions}
          />
          
          <Range
            label="Limite de Perda Total (%)"
            value={safeGuardTotal}
            onChange={setSafeGuardTotal}
            min={5}
            max={50}
            step={1}
            unit="%"
            color="red"
          />
          
          {/* Summary Card */}
          <div className="bg-[var(--mtm-bg3)] rounded-md p-3 mt-4 space-y-1.5">
            <div className="flex justify-between text-xs">
              <span className="text-[var(--mtm-text3)]">Estrategia:</span>
              <span className="font-semibold">{strategy.name}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--mtm-text3)]">Custo mensal:</span>
              <span className="font-mono font-bold text-[var(--mtm-gold)]">${strategy.priceMonthly}.00</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-[var(--mtm-text3)]">Ativacao:</span>
              <span className="text-[var(--mtm-cyan)]">Apos aprovacao do admin</span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
