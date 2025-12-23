"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { supabase } from "@/lib/supabase"
import {
  Mail,
  Send,
  Eye,
  BarChart3,
  Users,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Sparkles
} from "lucide-react"

interface Campaign {
  id: string
  name: string
  subject: string
  template_name: string
  status: string
  type: string
  segment: string
  total_recipients: number
  emails_sent: number
  emails_opened: number
  emails_clicked: number
  sent_at: string
  created_at: string
}

const TEMPLATES = [
  { value: 'welcome', label: '🎉 Boas-vindas', description: 'Email de boas-vindas para novos membros' },
  { value: 'onboarding_1', label: '📚 Onboarding Dia 1', description: 'Introdução à plataforma' },
  { value: 'onboarding_2', label: '📱 Onboarding Dia 2', description: 'App Mobile' },
  { value: 'onboarding_3', label: '📊 Onboarding Dia 3', description: 'Scanners & Portfolios' },
  { value: 'onboarding_4', label: '👥 Onboarding Dia 5', description: 'Comunidade Skool' },
  { value: 'onboarding_schedule', label: '📅 Agendamento', description: 'Convite para agendar Calendly' },
  { value: 'vision_announcement', label: '🚀 Visão MTM', description: 'Celebração da comunidade' },
  { value: 'dca_opportunity', label: '💎 DCA Alert', description: 'Oportunidades de compra' },
]

const SEGMENTS = [
  { value: 'admin', label: '🛡️ Apenas Admins', count: 'Testar com segurança' },
  { value: 'vip', label: '💎 Apenas VIPs', count: 'Membros premium' },
  { value: 'member', label: '👤 Apenas Membros', count: 'Membros normais' },
  { value: 'all', label: '👥 TODOS', count: 'Membros + VIPs + Admins' },
]

export default function EmailMarketingManager() {
  const [mounted, setMounted] = useState(false)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  
  const [formData, setFormData] = useState({
    name: '',
    subject: '',
    template_name: 'vision_announcement',
    segment: 'admin'
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (mounted) {
      loadCampaigns()
      
      // Real-time subscription para campanhas
      const channel = supabase
        .channel('email-campaigns-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'email_campaigns'
          },
          (payload) => {
            console.log('🔄 Real-time update:', payload)
            loadCampaigns()
          }
        )
        .subscribe()

      return () => {
        supabase.removeChannel(channel)
      }
    }
  }, [mounted])

  const loadCampaigns = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/email-marketing/campaigns')
      const data = await response.json()

      if (data.success) {
        setCampaigns(data.campaigns || [])
      }
    } catch (error) {
      console.error('❌ Erro ao carregar campanhas:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSendTest = async () => {
    try {
      setSending(true)

      if (!formData.name || !formData.subject) {
        alert('❌ Preencha nome e assunto')
        return
      }

      console.log('📧 Criando campanha de teste...')

      // Criar campanha
      const createRes = await fetch('/api/email-marketing/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          subject: formData.subject,
          template_name: formData.template_name,
          type: 'broadcast',
          segment: formData.segment,
          settings: {
            track_opens: true,
            track_clicks: true
          }
        })
      })

      const campaign = await createRes.json()

      if (!campaign.success) {
        alert(`❌ Erro ao criar campanha:\n\n${campaign.error}\n\nVerifique:\n1. SQL foi executado no Supabase?\n2. Tabelas existem?`)
        return
      }

      console.log(`✅ Campanha criada: ${campaign.campaign.id}`)

      // Confirmar envio
      const confirmar = confirm(
        `📧 CONFIRMAR ENVIO?\n\n` +
        `Campanha: ${formData.name}\n` +
        `Assunto: ${formData.subject}\n` +
        `Template: ${formData.template_name}\n` +
        `Para: ${campaign.campaign.total_recipients} ${formData.segment}\n\n` +
        `De: morethanmoneypt@gmail.com\n\n` +
        `Deseja enviar agora?`
      )

      if (!confirmar) {
        alert('❌ Envio cancelado.\n\nCampanha salva como rascunho.')
        loadCampaigns()
        return
      }

      console.log('📤 Enviando emails...')

      // Enviar
      const sendRes = await fetch('/api/email-marketing/campaigns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: campaign.campaign.id,
          action: 'send'
        })
      })

      const result = await sendRes.json()

      if (result.success) {
        alert(
          `✅ EMAIL ENVIADO COM SUCESSO!\n\n` +
          `📧 Enviados: ${result.sent}\n` +
          `❌ Falhas: ${result.failed}\n` +
          `📊 Total: ${result.total}\n\n` +
          `Verifique: morethanmoneypt@gmail.com`
        )
        setShowDialog(false)
        loadCampaigns()
      } else {
        alert(`❌ Erro ao enviar:\n\n${result.error}`)
      }

    } catch (error: any) {
      console.error('❌ Erro:', error)
      alert(`❌ Erro:\n\n${error.message}\n\nVerifique:\n1. SQL executado no Supabase?\n2. Gmail configurado?\n3. Servidor rodando?`)
    } finally {
      setSending(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const badges: Record<string, { label: string; color: string }> = {
      draft: { label: 'Rascunho', color: 'bg-gray-500/20 text-gray-400 border-gray-500/50' },
      scheduled: { label: 'Agendado', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
      sending: { label: 'Enviando', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50' },
      sent: { label: 'Enviado', color: 'bg-green-500/20 text-green-400 border-green-500/50' },
      cancelled: { label: 'Cancelado', color: 'bg-red-500/20 text-red-400 border-red-500/50' },
    }
    return badges[status] || badges.draft
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-[#D2A63C] flex items-center gap-2">
            <Mail className="h-6 w-6" />
            Email Marketing
            <span className="text-xs text-green-400 flex items-center gap-1">
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
              Tempo Real
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Gerenciar campanhas e enviar emails premium - Atualização automática
          </p>
        </div>
        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-bold">
              <Send className="h-4 w-4 mr-2" />
              Enviar Email
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-gray-900 border-[#D2A63C]/30 text-white max-w-2xl admin-dialog-content" style={{ zIndex: 99999 }}>
            <DialogHeader>
              <DialogTitle className="text-[#D2A63C] text-xl">
                📧 Enviar Email ou Campanha
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {/* Nome da Campanha */}
              <div>
                <Label className="text-white">Nome da Campanha *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  placeholder="Ex: Email de Teste - Visão MTM"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              {/* Assunto */}
              <div>
                <Label className="text-white">Assunto do Email *</Label>
                <Input
                  value={formData.subject}
                  onChange={(e) => setFormData({...formData, subject: e.target.value})}
                  placeholder="Ex: 🚀 A Nossa Jornada Juntos - MoreThanMoney"
                  className="bg-gray-800 border-gray-700 text-white mt-1"
                />
              </div>

              {/* Template */}
              <div>
                <Label className="text-white">Template do Email</Label>
                <Select value={formData.template_name} onValueChange={(value) => setFormData({...formData, template_name: value})}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 text-white">
                    {TEMPLATES.map((template) => (
                      <SelectItem key={template.value} value={template.value}>
                        <div className="flex flex-col">
                          <span>{template.label}</span>
                          <span className="text-xs text-gray-400">{template.description}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Segmento */}
              <div>
                <Label className="text-white">Destinatários</Label>
                <Select value={formData.segment} onValueChange={(value) => setFormData({...formData, segment: value})}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 text-white">
                    {SEGMENTS.map((seg) => (
                      <SelectItem key={seg.value} value={seg.value}>
                        <div className="flex flex-col">
                          <span>{seg.label}</span>
                          <span className="text-xs text-gray-400">{seg.count}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-yellow-400 mt-2">
                  ⚠️ Recomendado: Começar com "Apenas Admins" para testar
                </p>
              </div>

              {/* Preview Info */}
              <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                <p className="text-xs text-gray-400 mb-2">📧 Preview do Email:</p>
                <p className="text-sm text-white mb-1"><strong>De:</strong> MoreThanMoney &lt;morethanmoneypt@gmail.com&gt;</p>
                <p className="text-sm text-white mb-1"><strong>Assunto:</strong> {formData.subject || '(vazio)'}</p>
                <p className="text-sm text-white mb-1"><strong>Template:</strong> {TEMPLATES.find(t => t.value === formData.template_name)?.label}</p>
                <p className="text-sm text-white"><strong>Para:</strong> {SEGMENTS.find(s => s.value === formData.segment)?.label}</p>
              </div>

              {/* Botões */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSendTest}
                  disabled={sending}
                  className="flex-1 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] hover:opacity-90 text-black font-bold"
                >
                  {sending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Enviando...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      Enviar Agora
                    </>
                  )}
                </Button>
                <Button
                  onClick={() => setShowDialog(false)}
                  variant="outline"
                  className="border-gray-700 text-white hover:bg-gray-800"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900/50 border-[#D2A63C]/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-[#D2A63C]/20 rounded-lg flex items-center justify-center">
                <Mail className="h-5 w-5 text-[#D2A63C]" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {campaigns.length}
                </p>
                <p className="text-xs text-gray-400">Total de Campanhas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <CheckCircle className="h-5 w-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {campaigns.filter(c => c.status === 'sent').length}
                </p>
                <p className="text-xs text-gray-400">Enviadas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-blue-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                <Eye className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {campaigns.reduce((sum, c) => sum + (c.emails_opened || 0), 0)}
                </p>
                <p className="text-xs text-gray-400">Aberturas</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-purple-500/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <BarChart3 className="h-5 w-5 text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-black text-white">
                  {campaigns.length > 0 
                    ? Math.round((campaigns.reduce((sum, c) => sum + (c.emails_opened || 0), 0) / Math.max(campaigns.reduce((sum, c) => sum + (c.emails_sent || 0), 0), 1)) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-gray-400">Open Rate Médio</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Templates Rápidos */}
      <Card className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#D2A63C]" />
            Envios Rápidos (Templates Prontos)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
            {TEMPLATES.slice(0, 4).map((template) => (
              <button
                key={template.value}
                onClick={() => {
                  setFormData({
                    name: `${template.label} - ${new Date().toLocaleDateString('pt-PT')}`,
                    subject: template.label.split(' ')[1] + ' - MoreThanMoney',
                    template_name: template.value,
                    segment: 'admin'
                  })
                  setShowDialog(true)
                }}
                className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-[#D2A63C]/50 hover:bg-gray-800 transition-all text-left"
              >
                <div className="text-2xl mb-2">{template.label.split(' ')[0]}</div>
                <h4 className="text-white font-bold text-sm mb-1">
                  {template.label.split(' ').slice(1).join(' ')}
                </h4>
                <p className="text-xs text-gray-400">{template.description}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Lista de Campanhas */}
      <Card className="bg-gray-900/80 border-[#D2A63C]/30 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-white">Histórico de Campanhas ({campaigns.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <Mail className="w-16 h-16 text-gray-600 mx-auto mb-4" />
              <p className="text-gray-400 mb-4">Nenhuma campanha ainda</p>
              <Button
                onClick={() => setShowDialog(true)}
                className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black font-bold"
              >
                <Send className="h-4 w-4 mr-2" />
                Criar Primeira Campanha
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.slice(0, 10).map((campaign) => {
                const badge = getStatusBadge(campaign.status)
                const openRate = campaign.emails_sent > 0 
                  ? ((campaign.emails_opened / campaign.emails_sent) * 100).toFixed(1)
                  : '0'
                
                return (
                  <div
                    key={campaign.id}
                    className="flex items-center justify-between p-4 bg-gray-800/50 border border-gray-700 rounded-lg hover:border-[#D2A63C]/50 transition-all"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-bold text-white">{campaign.name}</h3>
                        <Badge className={`text-[10px] ${badge.color}`}>
                          {badge.label}
                        </Badge>
                      </div>
                      <p className="text-sm text-gray-400 mb-2">{campaign.subject}</p>
                      <div className="flex items-center gap-4 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {campaign.total_recipients || 0} destinatários
                        </span>
                        {campaign.status === 'sent' && (
                          <>
                            <span className="flex items-center gap-1">
                              <Send className="h-3 w-3" />
                              {campaign.emails_sent || 0} enviados
                            </span>
                            <span className="flex items-center gap-1">
                              <Eye className="h-3 w-3" />
                              {campaign.emails_opened || 0} abertos ({openRate}%)
                            </span>
                          </>
                        )}
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(campaign.created_at).toLocaleDateString('pt-PT')}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avisos Importantes */}
      <Card className="bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border-yellow-500/30">
        <CardContent className="p-6">
          <h3 className="text-yellow-400 font-bold mb-3 flex items-center gap-2">
            <Clock className="h-5 w-5" />
            ⚠️ Antes de Enviar Emails
          </h3>
          <div className="space-y-2 text-sm text-gray-300">
            <p>✅ Certifique-se que executou os SQLs no Supabase:</p>
            <ul className="ml-6 space-y-1 text-xs text-gray-400">
              <li>• scripts/create-email-marketing-system.sql</li>
              <li>• scripts/create-documents-system.sql</li>
            </ul>
            <p className="mt-3">✅ Variáveis de ambiente configuradas no Vercel:</p>
            <ul className="ml-6 space-y-1 text-xs text-gray-400">
              <li>• GMAIL_USER=morethanmoneypt@gmail.com</li>
              <li>• GMAIL_APP_PASSWORD (16 caracteres)</li>
            </ul>
            <p className="mt-3">💡 <strong>Dica:</strong> Sempre teste com "Apenas Admins" primeiro!</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


