"use client"

import { useState } from 'react'
import { useAppStore } from '@mtm-auto/lib/store'
import { Card, Badge, Button, Modal, Input, Select } from '@mtm-auto/components/ui-primitives'

function CreateGroupModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { createGroup } = useAppStore()
  const [name, setName] = useState('')
  const [icon, setIcon] = useState('zap')
  const [description, setDescription] = useState('')
  const [visibility, setVisibility] = useState<'public' | 'private' | 'hidden'>('public')
  
  const icons = ['zap', 'trending-up', 'bot', 'target', 'waves', 'newspaper', 'diamond', 'crystal']
  const iconLabels: Record<string, string> = {
    'zap': 'Z', 'trending-up': 'T', 'bot': 'B', 'target': 'O', 'waves': 'W', 'newspaper': 'N', 'diamond': 'D', 'crystal': 'C'
  }
  
  const handleSubmit = () => {
    createGroup({
      name,
      icon,
      description,
      visibility,
      status: 'active'
    })
    onClose()
    setName('')
    setDescription('')
  }
  
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Criar / Editar Grupo"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name}>Guardar Grupo</Button>
        </>
      }
    >
      <Input label="Nome do Grupo" value={name} onChange={setName} placeholder="Ex: Scalping Elite" />
      
      <div className="mb-3">
        <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
          Icone
        </label>
        <div className="flex gap-2 flex-wrap">
          {icons.map(i => (
            <span
              key={i}
              onClick={() => setIcon(i)}
              className={`text-xl cursor-pointer p-1.5 rounded-md border transition-colors ${
                icon === i ? 'border-[var(--mtm-green)]' : 'border-[var(--mtm-border)]'
              }`}
            >
              {iconLabels[i]}
            </span>
          ))}
        </div>
      </div>
      
      <Input label="Descricao" value={description} onChange={setDescription} placeholder="Descreva o estilo e foco do grupo..." />
      
      <Select
        label="Visibilidade"
        value={visibility}
        onChange={(v) => setVisibility(v as 'public' | 'private' | 'hidden')}
        options={[
          { value: 'public', label: 'Publico - visivel no marketplace' },
          { value: 'private', label: 'Privado - apenas clientes convidados' },
          { value: 'hidden', label: 'Oculto - apenas admin' },
        ]}
      />
    </Modal>
  )
}

export function AdminGroupsPanel() {
  const { groups } = useAppStore()
  const [showCreateModal, setShowCreateModal] = useState(false)
  
  const iconLabels: Record<string, string> = {
    'zap': 'Z', 'trending-up': 'T', 'bot': 'B', 'target': 'O', 'waves': 'W', 'newspaper': 'N', 'diamond': 'D', 'crystal': 'C'
  }
  
  const iconColors: Record<string, string> = {
    'zap': 'rgba(79,255,176,0.1)',
    'trending-up': 'rgba(245,200,66,0.1)',
    'bot': 'rgba(157,123,255,0.1)',
    'target': 'rgba(0,212,255,0.1)',
    'waves': 'rgba(79,255,176,0.1)',
    'newspaper': 'rgba(255,107,107,0.1)',
    'diamond': 'rgba(157,123,255,0.1)',
    'crystal': 'rgba(0,212,255,0.1)',
  }
  
  return (
    <div>
      <div className="flex items-center justify-between mb-3.5">
        <div />
        <Button size="sm" onClick={() => setShowCreateModal(true)}>+ Criar Grupo</Button>
      </div>
      
      <div className="grid grid-cols-3 gap-3.5">
        {groups.map(group => (
          <Card key={group.id} onClick={() => setShowCreateModal(true)}>
            <div className="flex items-center gap-2.5 mb-2.5">
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                style={{ background: iconColors[group.icon] || 'rgba(79,255,176,0.1)' }}
              >
                {iconLabels[group.icon] || 'S'}
              </div>
              <div>
                <div className="font-bold">{group.name}</div>
                <div className="text-[11px] text-[var(--mtm-text3)]">{group.strategies} estrategias - {group.slaves} slaves</div>
              </div>
            </div>
            <p className="text-xs text-[var(--mtm-text2)] mb-3 leading-relaxed">{group.description}</p>
            <div className="flex items-center justify-between">
              <Badge variant={group.status === 'active' ? 'active' : 'paused'}>{group.status === 'active' ? 'Ativo' : 'Inativo'}</Badge>
              <div className="flex gap-1.5">
                <Button variant="ghost" size="xs">Editar</Button>
                <Button variant="secondary" size="xs">Gerir</Button>
              </div>
            </div>
          </Card>
        ))}
        
        {/* Add new card */}
        <Card onClick={() => setShowCreateModal(true)} className="border-dashed">
          <div className="text-center py-10">
            <div className="text-3xl opacity-40 mb-2.5">+</div>
            <div className="font-bold mb-1">Novo Grupo</div>
            <p className="text-xs text-[var(--mtm-text3)]">Criar grupo de estrategias</p>
          </div>
        </Card>
      </div>
      
      <CreateGroupModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} />
    </div>
  )
}
