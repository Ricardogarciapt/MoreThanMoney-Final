"use client"

import { useState } from 'react'
import { useAppStore } from '@mtm-auto/lib/store'
import { Card, Alert, Badge, Button, Table, Modal, Input, Select, Range, Toggle, SectionLabel } from '@mtm-auto/components/ui-primitives'

function CreateStrategyModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { groups, createStrategy, showToast } = useAppStore()
  const [name, setName] = useState('')
  const [groupId, setGroupId] = useState(groups[0]?.id || '')
  const [price, setPrice] = useState(149)
  const [minCapital, setMinCapital] = useState(1000)
  const [minLot, setMinLot] = useState(0.01)
  const [minCopyPercent, setMinCopyPercent] = useState(5)
  const [minSafeGuard, setMinSafeGuard] = useState(3)
  const [description, setDescription] = useState('')
  const [mt4Enabled, setMt4Enabled] = useState(true)
  const [mt5Enabled, setMt5Enabled] = useState(true)
  const [liveEnabled, setLiveEnabled] = useState(true)
  const [demoEnabled, setDemoEnabled] = useState(true)
  const [requireApproval, setRequireApproval] = useState(true)
  const [publicMarketplace, setPublicMarketplace] = useState(false)
  
  const handleSubmit = () => {
    const group = groups.find(g => g.id === groupId)
    createStrategy({
      name,
      description,
      icon: 'zap',
      groupId,
      groupName: group?.name || 'Unknown',
      masterAccountId: '',
      priceMonthly: price,
      minCapital,
      minLot,
      minCopyPercent,
      minSafeGuard,
      platforms: [...(mt4Enabled ? ['MT4' as const] : []), ...(mt5Enabled ? ['MT5' as const] : [])],
      environments: [...(liveEnabled ? ['live' as const] : []), ...(demoEnabled ? ['demo' as const] : [])],
      stats: { return90d: 0, winRate: 0, maxDrawdown: 0, profitFactor: 0, sharpe: 0, totalTrades: 0 },
      riskLevel: 'medium',
      status: 'config'
    })
    onClose()
    setName('')
    setDescription('')
  }
  
  const groupOptions = groups.map(g => ({ value: g.id, label: g.name }))
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Configurar Estrategia Mestre"
      size="xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary">Guardar Rascunho</Button>
          <Button onClick={handleSubmit} disabled={!name}>Publicar Estrategia</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-5">
        <div>
          <SectionLabel>Informacao Base</SectionLabel>
          <Input label="Nome" value={name} onChange={setName} placeholder="Ex: Alpha Scalper Pro" />
          
          <div className="grid grid-cols-2 gap-3">
            <Select label="Grupo" value={groupId} onChange={setGroupId} options={groupOptions} />
            <Input label="Preco Mensal (USD)" value={price.toString()} onChange={(v) => setPrice(parseInt(v) || 0)} type="number" />
          </div>
          
          <Input label="Capital Minimo para o Cliente (USD)" value={minCapital.toString()} onChange={(v) => setMinCapital(parseInt(v) || 0)} type="number" />
          <Input label="Link Myfxbook (opcional)" value="" onChange={() => {}} placeholder="https://www.myfxbook.com/members/..." />
          <Input label="Descricao Publica" value={description} onChange={setDescription} placeholder="Visivel para clientes no marketplace..." />
          
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div>
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">Plataformas Aceites</label>
              <Toggle checked={mt5Enabled} onChange={setMt5Enabled} label="MT5" />
              <Toggle checked={mt4Enabled} onChange={setMt4Enabled} label="MT4" />
            </div>
            <div>
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">Ambiente</label>
              <Toggle checked={liveEnabled} onChange={setLiveEnabled} label="Live" />
              <Toggle checked={demoEnabled} onChange={setDemoEnabled} label="Demo" />
            </div>
          </div>
        </div>
        
        <div>
          <SectionLabel>Parametros Minimos para Slaves</SectionLabel>
          <Select 
            label="Metodo de Copia Sugerido" 
            value="balance_percent"
            onChange={() => {}}
            options={[
              { value: 'balance_percent', label: 'Percentagem do Saldo' },
              { value: 'fixed_lot', label: 'Lote Fixo' },
              { value: 'lot_multiplier', label: 'Multiplicador de Lote' },
            ]}
          />
          
          <Input label="Lote Minimo Aceite" value={minLot.toString()} onChange={(v) => setMinLot(parseFloat(v) || 0.01)} type="number" />
          
          <Range
            label="% Minima de Copia Sugerida"
            value={minCopyPercent}
            onChange={setMinCopyPercent}
            min={1}
            max={50}
            step={1}
            unit="%"
          />
          
          <Range
            label="SafeGuard Minimo Obrigatorio (%/dia)"
            value={minSafeGuard}
            onChange={setMinSafeGuard}
            min={0.5}
            max={15}
            step={0.5}
            unit="%"
            color="gold"
          />
          
          <div className="mt-4">
            <Toggle checked={requireApproval} onChange={setRequireApproval} label="Requerer aprovacao manual de cada slave" />
            <Toggle checked={publicMarketplace} onChange={setPublicMarketplace} label="Mostrar no marketplace publico" />
          </div>
          
          <Alert variant="info" className="text-[11px] mt-4">
            A integracao de pagamento (API) sera configurada separadamente. O acesso a copia ativa apos aprovacao manual ate la.
          </Alert>
        </div>
      </div>
    </Modal>
  )
}

export function AdminStrategiesPanel() {
  const { strategies } = useAppStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  const incompleteStrategies = strategies.filter(s => s.status === 'config')
  
  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <div />
        <Button size="sm" onClick={() => setShowCreateModal(true)}>+ Nova Estrategia Mestre</Button>
      </div>
      
      {incompleteStrategies.length > 0 && (
        <Alert variant="warning">
          {incompleteStrategies.length} estrategia(s) com configuracao incompleta. Configure conta mestre e parametros antes de publicar.
        </Alert>
      )}
      
      <Card>
        <Table
          columns={[
            { key: 'name', header: 'Nome', className: 'font-medium text-[var(--mtm-text)]' },
            { key: 'groupName', header: 'Grupo' },
            { key: 'masterAccountId', header: 'Conta Mestre', render: (row) => row.masterAccountId ? <span className="font-mono">#{row.masterAccountId}</span> : <span className="text-[var(--mtm-text3)]">-</span> },
            { key: 'platforms', header: 'Plataforma', render: (row) => (
              <div className="flex gap-1">
                {row.platforms.map(p => <Badge key={p} variant={p === 'MT5' ? 'mt5' : 'mt4'}>{p}</Badge>)}
                {row.environments.map(e => <Badge key={e} variant={e === 'live' ? 'live' : 'demo'}>{e.toUpperCase()}</Badge>)}
              </div>
            )},
            { key: 'priceMonthly', header: 'Preco/Mes', render: (row) => <span className="text-[var(--mtm-gold)] font-mono">${row.priceMonthly}</span> },
            { key: 'minLot', header: 'Lote Min.', render: (row) => <span className="font-mono">{row.minLot}</span> },
            { key: 'minCopyPercent', header: '% Min. Copia', render: (row) => <span className="font-mono">{row.minCopyPercent}%</span> },
            { key: 'minCapital', header: 'Cap. Min.', render: (row) => <span className="font-mono">${row.minCapital.toLocaleString()}</span> },
            { key: 'minSafeGuard', header: 'SG Sugerido', render: (row) => <span className="font-mono text-[var(--mtm-gold)]">{row.minSafeGuard}%/dia</span> },
            { key: 'subscribers', header: 'Subscribers' },
            { key: 'status', header: 'Estado', render: (row) => (
              <Badge variant={row.status === 'active' ? 'active' : row.status === 'paused' ? 'paused' : 'pending'} dot={row.status === 'active'} pulse={row.status === 'active'}>
                {row.status === 'config' ? 'Config.' : row.status}
              </Badge>
            )},
            { key: 'actions', header: '', render: (row) => (
              row.status === 'config' 
                ? <Button size="xs" onClick={() => setShowCreateModal(true)}>Configurar</Button>
                : <Button variant="ghost" size="xs" onClick={() => setShowCreateModal(true)}>Config</Button>
            )}
          ]}
          data={strategies}
        />
      </Card>
      
      <CreateStrategyModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  )
}
