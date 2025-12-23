"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter
} from "@/components/ui/dialog"
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { 
  CheckCircle, 
  XCircle, 
  Shield, 
  UserPlus, 
  Trash2,
  Mail,
  User,
  Phone,
  Hash
} from "lucide-react"
import type { UserManagement } from "@/lib/admin-types"

interface UserManagementProps {
  users: UserManagement[]
  onApprove: (userId: string) => void
  onToggleRole: (userId: string, currentRole: string) => void
  onRefresh: () => void
}

export default function UserManagementComponent({ users, onApprove, onToggleRole, onRefresh }: UserManagementProps) {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleChangeMemberCategory = async (userId: string, category: 'iq' | 'skool' | 'vip' | 'standard') => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, member_category: category })
      })

      if (response.ok) {
        onRefresh()
        console.log(`✅ Categoria alterada para: ${category}`)
      } else {
        const result = await response.json()
        alert(`Erro ao alterar categoria: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao alterar categoria:', error)
      alert('Erro ao alterar categoria do membro.')
    }
  }

  const handleChangeUserType = async (userId: string, newType: string) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, user_type: newType })
      })

      if (response.ok) {
        onRefresh()
        console.log(`✅ User type alterado para: ${newType}`)
      } else {
        const result = await response.json()
        alert(`Erro ao alterar tipo: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao alterar user type:', error)
      alert('Erro ao alterar tipo de utilizador.')
    }
  }

  const handleChangeOnboardingPlatform = async (userId: string, platform: 'vxa' | 'rfg' | null) => {
    try {
      const response = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, onboarding_platform: platform })
      })

      if (response.ok) {
        onRefresh()
        console.log(`✅ Plataforma de onboarding alterada para: ${platform || 'padrão'}`)
      } else {
        const result = await response.json()
        alert(`Erro ao alterar plataforma: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao alterar plataforma:', error)
      alert('Erro ao alterar plataforma de onboarding.')
    }
  }
  
  const [newUser, setNewUser] = useState({
    email: '',
    username: '',
    full_name: '',
    password: '',
    phone: '',
    whatsapp: '',
    user_type: 'guest' as 'admin' | 'vip' | 'guest' | 'inactive',
    member_category: 'standard' as 'standard' | 'iq' | 'skool'
  })

  const handleAddUser = async () => {
    try {
      setIsSubmitting(true)

      // Validações
      if (!newUser.email || !newUser.username || !newUser.password || !newUser.full_name) {
        alert('Email, nome de utilizador, palavra-passe e nome completo são obrigatórios.')
        return
      }

      if (newUser.password.length < 6) {
        alert('A palavra-passe deve ter pelo menos 6 carateres.')
        return
      }

      // Verificar se é trial
      const isTrial = newUser.user_type === 'guest' || newUser.user_type === 'presentation'
      const apiEndpoint = isTrial ? '/api/admin/create-trial-user' : '/api/admin/create-user'
      
      const payload = isTrial ? {
        email: newUser.email,
        username: newUser.username,
        full_name: newUser.full_name,
        trialType: newUser.user_type
      } : newUser

      // Criar utilizador via API
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const result = await response.json()

      if (response.ok) {
        const message = isTrial 
          ? `Utilizador ${newUser.user_type} criado!\n\nEmail: ${result.user.email}\nPalavra-passe: ${result.user.password}\nExpira: ${new Date(result.user.trial_expires_at).toLocaleString('pt-PT')}\n\n⚠️ Copia a palavra-passe temporária!`
          : `Utilizador ${newUser.email} criado com sucesso!`
        
        alert(message)
        setIsAddDialogOpen(false)
        setNewUser({
          email: '',
          username: '',
          full_name: '',
          password: '',
          phone: '',
          whatsapp: '',
          user_type: 'member',
          membership_level: 'basic'
        })
        onRefresh()
      } else {
        alert(`Erro ao criar utilizador: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao criar utilizador:', error)
      alert('Erro ao criar utilizador')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!selectedUser) return

    try {
      setIsSubmitting(true)

      const response = await fetch(`/api/admin/delete-user`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser })
      })

      const result = await response.json()

      if (response.ok) {
        alert('Utilizador apagado com sucesso!')
        setIsDeleteDialogOpen(false)
        setSelectedUser(null)
        onRefresh()
      } else {
        alert(`Erro ao apagar utilizador: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao apagar utilizador:', error)
      alert('Erro ao apagar utilizador')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="card-clean">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-mtm-primary">Gestão de Utilizadores</CardTitle>
        
        {/* Botão Adicionar Utilizador */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="bg-green-600 hover:bg-green-700 text-white">
              <UserPlus className="w-4 h-4 mr-2" />
              Adicionar Utilizador
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 text-white border-mtm-primary max-w-2xl admin-dialog-content" style={{ zIndex: 99999 }}>
            <DialogHeader>
              <DialogTitle className="text-mtm-primary text-2xl">Criar Novo Utilizador</DialogTitle>
              <DialogDescription className="text-gray-400">
                Preencha os dados para criar um novo utilizador manualmente
              </DialogDescription>
            </DialogHeader>
            
            <div className="grid grid-cols-2 gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-gray-300">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="input-focus"
                  placeholder="email@exemplo.com"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="username" className="text-gray-300">Username *</Label>
                <Input
                  id="username"
                  type="text"
                  value={newUser.username}
                  onChange={(e) => setNewUser({...newUser, username: e.target.value})}
                  className="input-focus"
                  placeholder="username"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="full_name" className="text-gray-300">Nome Completo *</Label>
                <Input
                  id="full_name"
                  type="text"
                  value={newUser.full_name}
                  onChange={(e) => setNewUser({...newUser, full_name: e.target.value})}
                  className="input-focus"
                  placeholder="Nome completo"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-gray-300">Password *</Label>
                <Input
                  id="password"
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="input-focus"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone" className="text-gray-300">Telefone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({...newUser, phone: e.target.value})}
                  className="input-focus"
                  placeholder="+351 912 345 678"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="whatsapp" className="text-gray-300">WhatsApp</Label>
                <Input
                  id="whatsapp"
                  type="tel"
                  value={newUser.whatsapp}
                  onChange={(e) => setNewUser({...newUser, whatsapp: e.target.value})}
                  className="input-focus"
                  placeholder="+351 912 345 678"
                />
              </div>

              <div className="space-y-2 col-span-2">
                <Label htmlFor="user_status" className="text-gray-300">Status do Utilizador *</Label>
                <Select 
                  value={`${newUser.user_type}-${newUser.member_category}`} 
                  onValueChange={(value) => {
                    const [type, category] = value.split('-')
                    setNewUser({
                      ...newUser, 
                      user_type: type as 'admin' | 'vip' | 'guest' | 'inactive',
                      member_category: category as 'standard' | 'iq' | 'skool'
                    })
                  }}
                >
                  <SelectTrigger className="input-focus">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-mtm-primary">
                    <SelectItem value="admin-standard">👑 Admin (Acesso Total)</SelectItem>
                    <SelectItem value="vip-standard">⭐ VIP (Acesso Premium)</SelectItem>
                    <SelectItem value="member-iq">🎓 Membro IQ (Subscrição IQ)</SelectItem>
                    <SelectItem value="member-skool">📚 Membro Skool (Subscrição Skool)</SelectItem>
                    <SelectItem value="guest-standard">🆓 Free Trial (7 dias grátis)</SelectItem>
                    <SelectItem value="inactive-standard">🚫 Inativo (Sem Subscrição)</SelectItem>
                  </SelectContent>
                </Select>
                {newUser.user_type === 'guest' && (
                  <p className="text-xs text-blue-400 mt-1">
                    ℹ️ Free Trial com 7 dias de acesso completo. Senha gerada automaticamente.
                  </p>
                )}
                {newUser.user_type === 'inactive' && (
                  <p className="text-xs text-orange-400 mt-1">
                    ⚠️ Acesso apenas a páginas públicas e início rápido (sem subscrição ativa)
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setIsAddDialogOpen(false)}
                className="btn-mtm-secondary"
              >
                Cancelar
              </Button>
              <Button 
                onClick={handleAddUser}
                disabled={isSubmitting}
                className="btn-mtm-primary"
              >
                {isSubmitting ? 'A Criar...' : 'Criar Utilizador'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardHeader>
      
      <CardContent>
        <div className="space-y-4">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg hover:bg-gray-800/70 transition-all">
              <div className="flex items-center space-x-4">
                <div className="w-10 h-10 bg-mtm-primary rounded-full flex items-center justify-center">
                  <span className="text-black font-bold">
                    {user.full_name?.[0] || user.username?.[0] || 'U'}
                  </span>
                </div>
                <div>
                  <p className="text-white font-medium">{user.full_name || user.username}</p>
                  <p className="text-gray-400 text-sm">{user.email}</p>
                  <div className="flex items-center space-x-2 mt-1 flex-wrap">
                    {/* XP e Nível */}
                    {user.xp && (
                      <Badge className="bg-gradient-to-r from-[#D2A63C]/20 to-yellow-400/20 text-[#D2A63C] border border-[#D2A63C]/30 text-xs">
                        ⭐ Nível {user.xp.level} · {user.xp.total_xp.toLocaleString()} XP
                      </Badge>
                    )}
                    {/* Fast Start Progress */}
                    {user.fast_start && user.fast_start.steps_completed > 0 && (
                      <Badge className="bg-green-600/20 text-green-400 border border-green-600/30 text-xs">
                        🚀 Fast Start {user.fast_start.progress_percent}%
                      </Badge>
                    )}
                    {/* Apenas badges informativos extras (não status principal) */}
                    {user.is_verified && (
                      <Badge className="bg-blue-600/20 text-blue-400 border border-blue-600/30 text-xs">
                        ✓ Verificado
                      </Badge>
                    )}
                    {(user.user_type === 'guest' || user.user_type === 'presentation') && (user as any).trial_expires_at && (
                      <Badge className="bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs">
                        ⏱️ Expira: {new Date((user as any).trial_expires_at).toLocaleDateString('pt-PT')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                {user.user_type === 'pending' && (
                  <Button
                    onClick={() => onApprove(user.id)}
                    className="bg-green-600 hover:bg-green-700 text-white"
                    size="sm"
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Aprovar
                  </Button>
                )}
                
                {/* Dropdown ÚNICO - Status Unificado */}
                <Select 
                  value={`${user.user_type}-${user.member_category || 'standard'}`}
                  onValueChange={(value) => {
                    const [type, category] = value.split('-')
                    
                    // Atualizar ambos simultaneamente
                    Promise.all([
                      handleChangeUserType(user.id, type),
                      category !== 'standard' && category !== user.member_category 
                        ? handleChangeMemberCategory(user.id, category as 'iq' | 'skool' | 'vip' | 'standard')
                        : Promise.resolve()
                    ])
                  }}
                >
                  <SelectTrigger className="w-[200px] h-9 bg-gray-700 border-gray-600 text-white hover:bg-gray-600">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-700">
                    <SelectItem value="inactive-standard">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-gray-400" />
                        <span>🚫 Inativo</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="admin-standard">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-red-400" />
                        <span>👑 Admin</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="vip-standard">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#D2A63C]" />
                        <span>⭐ VIP</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="member-iq">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                        <span>🎓 Membro IQ</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="member-skool">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-purple-400" />
                        <span>📚 Membro Skool</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="guest-standard">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>🆓 Free Trial</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                
                {/* Seletor de Plataforma de Onboarding (apenas para membros IQ) */}
                {user.member_category === 'iq' && (
                  <Select 
                    value={user.onboarding_platform || 'default'}
                    onValueChange={(value) => {
                      const platform = value === 'default' ? null : value as 'vxa' | 'rfg'
                      handleChangeOnboardingPlatform(user.id, platform)
                    }}
                  >
                    <SelectTrigger className="w-[200px] h-9 bg-blue-600/20 border-blue-500/50 text-white hover:bg-blue-600/30">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-900 border-gray-700">
                      <SelectItem value="default">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-gray-400" />
                          <span>🌐 Padrão</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="rfg">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-amber-400" />
                          <span>🎯 RFG</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="vxa">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-purple-400" />
                          <span>⚡ VXA</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
                
                {/* Botão Apagar */}
                <Dialog open={isDeleteDialogOpen && selectedUser === user.id} onOpenChange={(open) => {
                  setIsDeleteDialogOpen(open)
                  if (open) setSelectedUser(user.id)
                  else setSelectedUser(null)
                }}>
                  <DialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
                      onClick={() => setSelectedUser(user.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="bg-gray-900 text-white border-red-500 admin-dialog-content" style={{ zIndex: 99999 }}>
                    <DialogHeader>
                      <DialogTitle className="text-red-400 text-xl">Confirmar Eliminação</DialogTitle>
                      <DialogDescription className="text-gray-400">
                        Tem certeza que deseja apagar este utilizador? Esta ação é irreversível.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                        <p className="text-white font-medium mb-2">{user.full_name || user.username}</p>
                        <p className="text-gray-400 text-sm">{user.email}</p>
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setIsDeleteDialogOpen(false)
                          setSelectedUser(null)
                        }}
                      >
                        Cancelar
                      </Button>
                      <Button 
                        onClick={handleDeleteUser}
                        disabled={isSubmitting}
                        className="bg-red-600 hover:bg-red-700 text-white"
                      >
                        {isSubmitting ? 'A Apagar...' : 'Apagar Utilizador'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
