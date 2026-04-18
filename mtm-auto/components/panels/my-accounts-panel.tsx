"use client"

import { useState } from 'react'
import { useAppStore } from '@mtm-auto/lib/store'
import { Card, Badge, Button, Table, Modal, Select, Input } from '@mtm-auto/components/ui-primitives'
import { getAllServers } from '@mtm-auto/lib/brokers'

function AddAccountModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { user, addAccount } = useAppStore()
  const [platform, setPlatform] = useState<'MT4' | 'MT5'>('MT5')
  const [environment, setEnvironment] = useState<'live' | 'demo'>('live')
  const [server, setServer] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<'slave' | 'master'>('slave')
  
  const servers = getAllServers().filter(s => s.platform === platform)
  
  const handleSubmit = () => {
    if (!login || !server || !user) return
    
    const selectedServer = servers.find(s => s.value === server)
    const brokerName = selectedServer?.label.split(' - ')[0] || 'Unknown'
    
    addAccount({
      login,
      broker: brokerName,
      server,
      platform,
      environment,
      balance: environment === 'demo' ? 10000 : 0,
      equity: environment === 'demo' ? 10000 : 0,
      role,
      status: 'connected',
      userId: user.id
    })
    
    onClose()
    setLogin('')
    setPassword('')
    setServer('')
  }
  
  const platformOptions = [
    { value: 'MT5', label: 'MetaTrader 5' },
    { value: 'MT4', label: 'MetaTrader 4' },
  ]
  
  const environmentOptions = [
    { value: 'live', label: 'Live (Real)' },
    { value: 'demo', label: 'Demo' },
  ]
  
  const roleOptions = [
    { value: 'slave', label: 'Slave (copia as estrategias)' },
    { value: 'master', label: 'Mestre (e copiada pelos slaves)' },
  ]
  
  const serverOptions = servers.map(s => ({ value: s.value, label: s.label }))
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Adicionar Conta MT4 / MT5"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="secondary">Testar Ligacao</Button>
          <Button onClick={handleSubmit} disabled={!login || !server}>Adicionar Conta</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Select
          label="Plataforma"
          value={platform}
          onChange={(v) => {
            setPlatform(v as 'MT4' | 'MT5')
            setServer('')
          }}
          options={platformOptions}
        />
        <Select
          label="Ambiente"
          value={environment}
          onChange={(v) => setEnvironment(v as 'live' | 'demo')}
          options={environmentOptions}
        />
      </div>
      
      <Select
        label="Broker / Servidor"
        value={server}
        onChange={setServer}
        options={serverOptions.length > 0 ? serverOptions : [{ value: '', label: 'Selecione uma plataforma primeiro' }]}
      />
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Input
          label="Login (Numero da Conta)"
          value={login}
          onChange={setLogin}
          placeholder="Ex: 123456"
        />
        <Input
          label="Password"
          value={password}
          onChange={setPassword}
          type="password"
          placeholder="Investor ou Master"
        />
      </div>
      
      <Select
        label="Papel desta Conta"
        value={role}
        onChange={(v) => setRole(v as 'slave' | 'master')}
        options={roleOptions}
      />
      
      <div className="bg-[rgba(0,212,255,0.06)] border border-[rgba(0,212,255,0.2)] text-[var(--mtm-cyan)] p-3 rounded-lg text-xs flex items-start gap-2 leading-relaxed">
        Use a <strong>Investor Password</strong> para contas slave. Master Password apenas para contas mestre.
      </div>
    </Modal>
  )
}

export function MyAccountsPanel() {
  const { accounts } = useAppStore()
  const [showAddModal, setShowAddModal] = useState(false)
  
  return (
    <div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end mb-3.5">
        <Button size="sm" className="w-full sm:w-auto" onClick={() => setShowAddModal(true)}>
          + Adicionar Conta MT
        </Button>
      </div>
      
      <Card>
        <Table
          columns={[
            { key: 'login', header: 'Login', render: (row) => <span className="font-mono font-medium text-[var(--mtm-text)]">{row.login}</span> },
            { key: 'server', header: 'Broker / Servidor', render: (row) => `${row.broker} - ${row.server}` },
            { key: 'platform', header: 'Plataforma', render: (row) => <Badge variant={row.platform === 'MT5' ? 'mt5' : 'mt4'}>{row.platform}</Badge> },
            { key: 'environment', header: 'Ambiente', render: (row) => <Badge variant={row.environment === 'live' ? 'live' : 'demo'}>{row.environment.toUpperCase()}</Badge> },
            { key: 'balance', header: 'Saldo', render: (row) => <span className="font-mono">${row.balance.toLocaleString()}</span> },
            { key: 'equity', header: 'Equity', render: (row) => (
              <span className={`font-mono ${row.equity >= row.balance ? 'text-[var(--mtm-green)]' : 'text-[var(--mtm-red)]'}`}>
                ${row.equity.toLocaleString()}
              </span>
            )},
            { key: 'role', header: 'Papel', render: (row) => <Badge variant={row.role === 'master' ? 'master' : 'slave'}>{row.role.toUpperCase()}</Badge> },
            { key: 'status', header: 'Estado', render: (row) => (
              <span 
                className={`w-1.5 h-1.5 rounded-full inline-block ${row.status === 'connected' ? 'bg-[var(--mtm-green)]' : 'bg-[var(--mtm-red)]'}`}
                style={{ boxShadow: `0 0 6px ${row.status === 'connected' ? 'var(--mtm-green)' : 'var(--mtm-red)'}`, animation: 'pulse 1.5s ease-in-out infinite' }}
              />
            )}
          ]}
          data={accounts}
        />
      </Card>
      
      <AddAccountModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  )
}
