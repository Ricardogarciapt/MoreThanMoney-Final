"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Bell, 
  Send, 
  Plus, 
  Settings, 
  Users, 
  Mail, 
  Smartphone, 
  Trash2,
  Edit,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  RefreshCw,
  Clock
} from "lucide-react"
import { supabase } from "@/lib/supabase"
import { createAdminSubscription } from "@/lib/admin-helpers"

interface NotificationConfig {
  id: string
  name: string
  type: 'email' | 'push' | 'both'
  title: string
  message: string
  enabled: boolean
  targetUsers: 'all' | 'members' | 'vip' | 'admin'
  scheduledAt?: string
  sentAt?: string
  recipientsCount?: number
  status?: 'draft' | 'scheduled' | 'sent' | 'failed'
}

interface NotificationStats {
  totalSent: number
  emailNotifications: number
  pushNotifications: number
  successRate: number
  pendingNotifications: number
}

export default function NotificationsManager() {
  const [mounted, setMounted] = useState(false)
  const [notifications, setNotifications] = useState<NotificationConfig[]>([])
  const [stats, setStats] = useState<NotificationStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreateDialog, setShowCreateDialog] = useState(false)
  const [editingNotification, setEditingNotification] = useState<NotificationConfig | null>(null)
  const [sending, setSending] = useState(false)

  const [newNotification, setNewNotification] = useState<Partial<NotificationConfig>>({
    name: '',
    type: 'email',
    title: '',
    message: '',
    targetUsers: 'all',
    enabled: true
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    let channel: any = null
    let statsInterval: NodeJS.Timeout | null = null
    
    const initializeSubscriptions = async () => {
      try {
        // Carregar dados iniciais
        await Promise.all([loadNotifications(), loadStats()])
        
        // Real-time subscription para notificações (com tratamento de erros)
        try {
          channel = createAdminSubscription('notification_configs', (payload) => {
            console.log('🔄 [NOTIFICATIONS] Real-time update recebida:', payload.eventType)
            // Usar setTimeout para evitar múltiplas atualizações simultâneas
            setTimeout(() => {
              loadNotifications()
              loadStats()
            }, 100)
          })
        } catch (subError) {
          console.warn('⚠️ [NOTIFICATIONS] Erro ao criar subscription, usando apenas polling:', subError)
        }

        // Auto-refresh stats a cada 30 segundos (fallback)
        statsInterval = setInterval(() => {
          loadStats()
        }, 30000)
      } catch (error) {
        console.error('❌ [NOTIFICATIONS] Erro ao inicializar:', error)
      }
    }

    initializeSubscriptions()

    return () => {
      if (channel && typeof channel === 'function') {
        channel()
      }
      if (statsInterval) {
        clearInterval(statsInterval)
      }
    }
  }, [mounted])

  const loadNotifications = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/admin/notifications')
      const data = await response.json()
      
      if (data.success) {
        setNotifications(data.notifications || [])
      }
    } catch (error) {
      console.error('Erro ao carregar notificações:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const response = await fetch('/api/admin/notifications/stats')
      const data = await response.json()
      
      if (data.success) {
        setStats(data.stats)
      }
    } catch (error) {
      console.error('Erro ao carregar stats:', error)
    }
  }

  const handleCreateNotification = async () => {
    try {
      setSending(true)
      const response = await fetch('/api/admin/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newNotification)
      })

      const result = await response.json()

      if (response.ok && result.success) {
        await loadNotifications() // Recarregar da base de dados
        setShowCreateDialog(false)
        setEditingNotification(null)
        setNewNotification({
          name: '',
          type: 'email',
          title: '',
          message: '',
          targetUsers: 'all',
          enabled: true
        })
        await loadStats()
        // Usar toast em vez de alert se disponível
        if (typeof window !== 'undefined' && (window as any).toast) {
          (window as any).toast.success('✅ Notificação criada com sucesso!')
        } else {
          alert('✅ Notificação criada com sucesso!')
        }
      } else {
        const errorMsg = result.error || 'Erro ao criar notificação'
        console.error('❌ [NOTIFICATIONS] Erro ao criar:', errorMsg)
        alert(`❌ Erro: ${errorMsg}`)
      }
    } catch (error) {
      console.error('Erro ao criar notificação:', error)
      alert('Erro ao criar notificação')
    } finally {
      setSending(false)
    }
  }

  const handleSendNotification = async (id: string) => {
    try {
      setSending(true)
      const response = await fetch(`/api/admin/notifications/${id}/send`, {
        method: 'POST'
      })

      const result = await response.json()

      if (response.ok) {
        await loadNotifications()
        await loadStats()
        alert('Notificação enviada com sucesso!')
      } else {
        alert(`Erro: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao enviar notificação:', error)
      alert('Erro ao enviar notificação')
    } finally {
      setSending(false)
    }
  }

  const handleDeleteNotification = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta notificação?')) return

    try {
      const response = await fetch(`/api/admin/notifications/${id}`, {
        method: 'DELETE'
      })

      const result = await response.json()

      if (response.ok && result.success) {
        setNotifications(prev => prev.filter(n => n.id !== id))
        await loadStats()
        alert('✅ Notificação excluída com sucesso!')
      } else {
        alert(`❌ Erro: ${result.error || 'Erro ao excluir notificação'}`)
      }
    } catch (error) {
      console.error('Erro ao excluir notificação:', error)
      alert('❌ Erro ao excluir notificação')
    }
  }

  const handleUpdateNotification = async () => {
    if (!editingNotification) return

    try {
      setSending(true)
      const response = await fetch('/api/admin/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingNotification.id,
          ...newNotification
        })
      })

      const result = await response.json()

      if (response.ok && result.success) {
        await loadNotifications()
        await loadStats()
        setShowCreateDialog(false)
        setEditingNotification(null)
        setNewNotification({
          name: '',
          type: 'email',
          title: '',
          message: '',
          targetUsers: 'all',
          enabled: true
        })
        if (typeof window !== 'undefined' && (window as any).toast) {
          (window as any).toast.success('✅ Notificação atualizada com sucesso!')
        } else {
          alert('✅ Notificação atualizada com sucesso!')
        }
      } else {
        const errorMsg = result.error || 'Erro ao atualizar notificação'
        console.error('❌ [NOTIFICATIONS] Erro ao atualizar:', errorMsg, result)
        alert(`❌ Erro: ${errorMsg}`)
      }
    } catch (error) {
      console.error('Erro ao atualizar notificação:', error)
      alert('❌ Erro ao atualizar notificação')
    } finally {
      setSending(false)
    }
  }

  const startEditNotification = (notification: NotificationConfig) => {
    console.log('🔄 [NOTIFICATIONS] Iniciando edição:', notification)
    setEditingNotification(notification)
    setNewNotification({
      name: notification.name || '',
      type: notification.type || 'email',
      title: notification.title || '',
      message: notification.message || '',
      targetUsers: notification.targetUsers || 'all',
      enabled: notification.enabled !== undefined ? notification.enabled : true
    })
    // Forçar abertura do dialog
    setShowCreateDialog(true)
    console.log('✅ [NOTIFICATIONS] Dialog deve abrir agora')
  }

  const getIconForType = (type: string) => {
    switch (type) {
      case 'email': return <Mail className="w-4 h-4" />
      case 'push': return <Smartphone className="w-4 h-4" />
      case 'both': return <Bell className="w-4 h-4" />
      default: return <Bell className="w-4 h-4" />
    }
  }

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'sent':
        return <Badge className="bg-green-500/20 text-green-400"><CheckCircle className="w-3 h-3 mr-1" />Enviado</Badge>
      case 'scheduled':
        return <Badge className="bg-blue-500/20 text-blue-400"><Clock className="w-3 h-3 mr-1" />Agendado</Badge>
      case 'failed':
        return <Badge className="bg-red-500/20 text-red-400"><XCircle className="w-3 h-3 mr-1" />Falhou</Badge>
      default:
        return <Badge className="bg-gray-500/20 text-gray-400"><Info className="w-3 h-3 mr-1" />Rascunho</Badge>
    }
  }

  if (loading) {
    return (
      <Card className="bg-gray-900/50 border-[#D2A63C]/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="h-8 w-8 animate-spin text-[#D2A63C]" />
            <span className="ml-2 text-gray-300">Carregando notificações...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#D2A63C] flex items-center gap-2">
            <Bell className="w-6 h-6" />
            Gestão de Notificações
            <span className="text-xs text-green-400 flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Tempo Real
            </span>
          </h2>
          <p className="text-gray-400">Enviar notificações push e emails - Atualização automática a cada 30s</p>
        </div>
        <Dialog 
          open={showCreateDialog} 
          onOpenChange={(open) => {
            console.log('🔔 [DIALOG] onOpenChange chamado:', open, 'editing:', editingNotification?.id)
            setShowCreateDialog(open)
            if (!open) {
              setEditingNotification(null)
              setNewNotification({
                name: '',
                type: 'email',
                title: '',
                message: '',
                targetUsers: 'all',
                enabled: true
              })
            }
          }}
        >
          <DialogTrigger asChild>
            <Button 
              className="bg-[#D2A63C] hover:bg-[#BB8525]"
              onClick={(e) => {
                // Se já estava editando, limpar antes de criar nova
                if (editingNotification) {
                  setEditingNotification(null)
                  setNewNotification({
                    name: '',
                    type: 'email',
                    title: '',
                    message: '',
                    targetUsers: 'all',
                    enabled: true
                  })
                }
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Notificação
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl bg-gray-900 border-gray-700 admin-dialog-content" style={{ zIndex: 99999 }}>
            <DialogHeader>
              <DialogTitle className="text-[#D2A63C]">
                {editingNotification ? 'Editar Notificação' : 'Criar Nova Notificação'}
              </DialogTitle>
              <DialogDescription className="text-gray-400">
                {editingNotification 
                  ? 'Edite os detalhes da notificação' 
                  : 'Configure e envie notificações para os utilizadores'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="name">Nome da Notificação</Label>
                  <Input
                    id="name"
                    value={newNotification.name || ''}
                    onChange={(e) => setNewNotification(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Ex: Oportunidade DCA"
                  />
                </div>
                <div>
                  <Label htmlFor="type">Tipo *</Label>
                  <Select value={newNotification.type} onValueChange={(value: any) => setNewNotification(prev => ({ ...prev, type: value }))}>
                    <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-600">
                      <SelectItem value="email" className="text-white">📧 Apenas Email</SelectItem>
                      <SelectItem value="push" className="text-white">📱 Apenas Push</SelectItem>
                      <SelectItem value="both" className="text-white">📧📱 Email + Push</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label htmlFor="target">Público-Alvo *</Label>
                <Select value={newNotification.targetUsers} onValueChange={(value: any) => setNewNotification(prev => ({ ...prev, targetUsers: value }))}>
                  <SelectTrigger className="bg-gray-800 border-gray-600 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-600">
                    <SelectItem value="all" className="text-white">👥 Todos os utilizadores</SelectItem>
                    <SelectItem value="members" className="text-white">⭐ Apenas membros</SelectItem>
                    <SelectItem value="vip" className="text-white">👑 Apenas VIP</SelectItem>
                    <SelectItem value="admin" className="text-white">🔧 Apenas administradores</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="title">Título *</Label>
                <Input
                  id="title"
                  value={newNotification.title || ''}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Título da notificação"
                  className="bg-gray-800 border-gray-600 text-white"
                  maxLength={100}
                />
                <p className="text-xs text-gray-500 mt-1">{(newNotification.title || '').length}/100 caracteres</p>
              </div>
              <div>
                <Label htmlFor="message">Mensagem *</Label>
                <Textarea
                  id="message"
                  value={newNotification.message || ''}
                  onChange={(e) => setNewNotification(prev => ({ ...prev, message: e.target.value }))}
                  placeholder="Conteúdo da notificação..."
                  rows={5}
                  className="bg-gray-800 border-gray-600 text-white"
                  maxLength={500}
                />
                <p className="text-xs text-gray-500 mt-1">{(newNotification.message || '').length}/500 caracteres</p>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="enabled"
                  checked={newNotification.enabled}
                  onCheckedChange={(checked) => setNewNotification(prev => ({ ...prev, enabled: checked }))}
                />
                <Label htmlFor="enabled">Notificação ativa</Label>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowCreateDialog(false)
                  setEditingNotification(null)
                  setNewNotification({
                    name: '',
                    type: 'email',
                    title: '',
                    message: '',
                    targetUsers: 'all',
                    enabled: true
                  })
                }}
              >
                Cancelar
              </Button>
              <Button 
                onClick={editingNotification ? handleUpdateNotification : handleCreateNotification}
                disabled={sending || !newNotification.name || !newNotification.title || !newNotification.message}
                className="bg-[#D2A63C] hover:bg-[#BB8525]"
              >
                {sending ? (
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                ) : editingNotification ? (
                  <Edit className="w-4 h-4 mr-2" />
                ) : (
                  <Send className="w-4 h-4 mr-2" />
                )}
                {editingNotification ? 'Atualizar Notificação' : 'Criar Notificação'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="bg-gray-900/50 border-blue-500/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Total Enviadas</p>
                  <p className="text-2xl font-bold text-blue-400">{stats.totalSent}</p>
                </div>
                <Bell className="w-8 h-8 text-blue-400/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-purple-500/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Emails</p>
                  <p className="text-2xl font-bold text-purple-400">{stats.emailNotifications}</p>
                </div>
                <Mail className="w-8 h-8 text-purple-400/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-green-500/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Push</p>
                  <p className="text-2xl font-bold text-green-400">{stats.pushNotifications}</p>
                </div>
                <Smartphone className="w-8 h-8 text-green-400/50" />
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/50 border-[#D2A63C]/30">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-sm">Taxa Sucesso</p>
                  <p className="text-2xl font-bold text-[#D2A63C]">{stats.successRate}%</p>
                </div>
                <CheckCircle className="w-8 h-8 text-[#D2A63C]/50" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Notifications List */}
      <Card className="bg-gray-900/50 border-gray-600/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Notificações Configuradas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="w-16 h-16 text-gray-500 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Nenhuma notificação configurada</p>
              <Button onClick={() => setShowCreateDialog(true)} className="bg-[#D2A63C] hover:bg-[#BB8525]">
                <Plus className="w-4 h-4 mr-2" />
                Criar Primeira Notificação
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {notifications.map((notification) => (
                <Card key={notification.id} className="bg-gray-800/50 border-gray-700/50 hover:border-[#D2A63C]/30 transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            {getIconForType(notification.type)}
                            <h3 className="text-white font-semibold text-lg">{notification.name}</h3>
                          </div>
                          {getStatusBadge(notification.status)}
                          {notification.enabled ? (
                            <Badge className="bg-green-500/20 text-green-400">
                              <CheckCircle className="w-3 h-3 mr-1" />Ativa
                            </Badge>
                          ) : (
                            <Badge className="bg-gray-500/20 text-gray-400">
                              <XCircle className="w-3 h-3 mr-1" />Inativa
                            </Badge>
                          )}
                        </div>
                        <p className="text-gray-300 font-medium mb-1">{notification.title}</p>
                        <p className="text-gray-400 text-sm mb-3 line-clamp-2">{notification.message}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            Público: <strong className="text-gray-400">{notification.targetUsers}</strong>
                          </span>
                          {notification.recipientsCount !== undefined && notification.recipientsCount > 0 && (
                            <span className="flex items-center gap-1">
                              <Send className="w-3 h-3" />
                              Destinatários: <strong className="text-gray-400">{notification.recipientsCount}</strong>
                            </span>
                          )}
                          {notification.sentAt && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              Enviado: <strong className="text-gray-400">{new Date(notification.sentAt).toLocaleString('pt-PT', { 
                                day: '2-digit', 
                                month: '2-digit', 
                                year: 'numeric',
                                hour: '2-digit', 
                                minute: '2-digit' 
                              })}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {notification.status === 'draft' && (
                          <Button
                            size="sm"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              handleSendNotification(notification.id)
                            }}
                            disabled={sending}
                            className="bg-[#D2A63C] hover:bg-[#BB8525] text-black"
                            title="Enviar notificação agora"
                          >
                            <Send className="w-4 h-4 mr-1" />
                            Enviar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            console.log('🔘 [BUTTON] Editar clicado para:', notification.id)
                            startEditNotification(notification)
                          }}
                          title="Editar notificação"
                          className="border-[#D2A63C]/50 hover:bg-[#D2A63C]/10 hover:border-[#D2A63C]"
                        >
                          <Edit className="w-4 h-4 mr-1" />
                          Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            handleDeleteNotification(notification.id)
                          }}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 border-red-500/50 hover:border-red-500"
                          title="Excluir notificação"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
