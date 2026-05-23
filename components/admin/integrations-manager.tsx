"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { 
  Save, 
  RefreshCw, 
  Check, 
  ExternalLink,
  BarChart3,
  Globe,
  Video,
  MessageCircle,
  Database,
  Mail,
  Palette,
  Zap
} from "lucide-react"

interface Integration {
  id: string
  name: string
  icon: any
  color: string
  enabled: boolean
  config: Record<string, any>
}

interface IntegrationsManagerProps {
  setActiveTab?: (tab: string) => void
}

export default function IntegrationsManager({ setActiveTab }: IntegrationsManagerProps = {}) {
  const [integrations, setIntegrations] = useState<Integration[]>([
    {
      id: 'tradingview',
      name: 'TradingView',
      icon: BarChart3,
      color: 'text-cyan-400',
      enabled: true,
      config: {
        widgetType: 'advanced',
        defaultSymbol: 'OANDA:XAUUSD',
        theme: 'dark',
        maxSavedCharts: 20
      }
    },
    {
      id: 'google-translate',
      name: 'Google Translate',
      icon: Globe,
      color: 'text-blue-400',
      enabled: true,
      config: {
        totalLanguages: 21,
        autoTranslate: true,
        defaultLanguage: 'pt'
      }
    },
    {
      id: 'youtube',
      name: 'YouTube Embed',
      icon: Video,
      color: 'text-red-400',
      enabled: true,
      config: {
        autoSubtitles: true,
        hideBranding: true,
        qualityPreference: '1080p'
      }
    },
    {
      id: 'whatsapp',
      name: 'WhatsApp CTA',
      icon: MessageCircle,
      color: 'text-green-400',
      enabled: true,
      config: {
        phoneNumber: '+351912666699',
        floatingButton: true,
        position: 'bottom-right'
      }
    },
    {
      id: 'supabase',
      name: 'Supabase',
      icon: Database,
      color: 'text-emerald-400',
      enabled: true,
      config: {
        authEnabled: true,
        dbConnected: true,
        realtimeEnabled: false
      }
    },
    {
      id: 'gmail',
      name: 'Gmail SMTP',
      icon: Mail,
      color: 'text-red-300',
      enabled: true,
      config: {
        emailFrom: 'morethanmoneypt@gmail.com',
        emailNotifications: true
      }
    },
    {
      id: 'themes',
      name: 'Sistema de Temas',
      icon: Palette,
      color: 'text-purple-400',
      enabled: true,
      config: {
        totalThemes: 4,
        customThemeEnabled: true,
        currentTheme: 'default'
      }
    },
    {
      id: 'vercel',
      name: 'Vercel Deploy',
      icon: Zap,
      color: 'text-white',
      enabled: true,
      config: {
        autoDeploy: true,
        productionUrl: 'site-morethanmoney-final.vercel.app'
      }
    }
  ])

  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [editingIntegration, setEditingIntegration] = useState<string | null>(null)

  const handleToggleIntegration = (id: string) => {
    setIntegrations(integrations.map(int => 
      int.id === id ? { ...int, enabled: !int.enabled } : int
    ))
  }

  const handleUpdateConfig = (id: string, key: string, value: any) => {
    setIntegrations(integrations.map(int => 
      int.id === id ? { ...int, config: { ...int.config, [key]: value } } : int
    ))
  }

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setSaveSuccess(false)

      const response = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ integrations })
      })

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        alert('Erro ao salvar integrações')
      }
    } catch (error) {
      console.error('Erro ao salvar:', error)
      alert('Erro ao salvar integrações')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-mtm-primary">Gestão de Integrações</h2>
          <p className="text-gray-400 mt-1">
            Configure e gerencie todas as integrações e recursos do site
          </p>
        </div>
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="bg-mtm-primary hover:bg-mtm-primary-dark text-black"
        >
          {isSaving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              A Guardar...
            </>
          ) : saveSuccess ? (
            <>
              <Check className="w-4 h-4 mr-2" />
              Guardado!
            </>
          ) : (
            <>
              <Save className="w-4 h-4 mr-2" />
              Guardar Tudo
            </>
          )}
        </Button>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {integrations.map((integration) => {
          const Icon = integration.icon
          const isEditing = editingIntegration === integration.id

          return (
            <Card key={integration.id} className="bg-gray-900/50 border-gray-700 hover:border-mtm-primary/50 transition-all">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 bg-gray-800 rounded-lg ${integration.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <CardTitle className="text-white text-lg">{integration.name}</CardTitle>
                      <Badge 
                        className={integration.enabled 
                          ? "bg-green-500/20 text-green-400 border-green-500/30 mt-1" 
                          : "bg-red-500/20 text-red-400 border-red-500/30 mt-1"
                        }
                      >
                        {integration.enabled ? 'Ativo' : 'Desativado'}
                      </Badge>
                    </div>
                  </div>
                  <Switch
                    checked={integration.enabled}
                    onCheckedChange={() => handleToggleIntegration(integration.id)}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Configurações Específicas */}
                {integration.id === 'tradingview' && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-gray-300 text-sm">Símbolo Padrão</Label>
                      <Input
                        value={integration.config.defaultSymbol}
                        onChange={(e) => handleUpdateConfig(integration.id, 'defaultSymbol', e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Tema</Label>
                      <select
                        value={integration.config.theme}
                        onChange={(e) => handleUpdateConfig(integration.id, 'theme', e.target.value)}
                        className="w-full bg-gray-800 border-gray-700 text-white rounded-lg px-3 py-2 mt-1"
                      >
                        <option value="dark">Escuro</option>
                        <option value="light">Claro</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Máx. Gráficos Salvos</Label>
                      <Input
                        type="number"
                        value={integration.config.maxSavedCharts}
                        onChange={(e) => handleUpdateConfig(integration.id, 'maxSavedCharts', parseInt(e.target.value))}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                      />
                    </div>
                  </div>
                )}

                {integration.id === 'google-translate' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Tradução Automática</span>
                      <Switch
                        checked={integration.config.autoTranslate}
                        onCheckedChange={(checked) => handleUpdateConfig(integration.id, 'autoTranslate', checked)}
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Idioma Padrão</Label>
                      <Input
                        value={integration.config.defaultLanguage}
                        onChange={(e) => handleUpdateConfig(integration.id, 'defaultLanguage', e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                        disabled
                      />
                    </div>
                    <div className="text-sm text-gray-400">
                      {integration.config.totalLanguages} idiomas disponíveis
                    </div>
                  </div>
                )}

                {integration.id === 'youtube' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Legendas Automáticas</span>
                      <Switch
                        checked={integration.config.autoSubtitles}
                        onCheckedChange={(checked) => handleUpdateConfig(integration.id, 'autoSubtitles', checked)}
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Ocultar Branding YouTube</span>
                      <Switch
                        checked={integration.config.hideBranding}
                        onCheckedChange={(checked) => handleUpdateConfig(integration.id, 'hideBranding', checked)}
                      />
                    </div>
                  </div>
                )}

                {integration.id === 'whatsapp' && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-gray-300 text-sm">Número de Telefone</Label>
                      <Input
                        value={integration.config.phoneNumber}
                        onChange={(e) => handleUpdateConfig(integration.id, 'phoneNumber', e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                        placeholder="+351 912 666 699"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Botão Flutuante</span>
                      <Switch
                        checked={integration.config.floatingButton}
                        onCheckedChange={(checked) => handleUpdateConfig(integration.id, 'floatingButton', checked)}
                      />
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Posição</Label>
                      <select
                        value={integration.config.position}
                        onChange={(e) => handleUpdateConfig(integration.id, 'position', e.target.value)}
                        className="w-full bg-gray-800 border-gray-700 text-white rounded-lg px-3 py-2 mt-1"
                      >
                        <option value="bottom-right">Inferior Direita</option>
                        <option value="bottom-left">Inferior Esquerda</option>
                      </select>
                    </div>
                  </div>
                )}

                {integration.id === 'supabase' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Autenticação</span>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        {integration.config.authEnabled ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Base de Dados</span>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        {integration.config.dbConnected ? 'Conectado' : 'Desconectado'}
                      </Badge>
                    </div>
                    <a
                      href="https://supabase.com/dashboard/project/iwscxotvmtkphajmasof"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir Dashboard
                    </a>
                  </div>
                )}

                {integration.id === 'gmail' && (
                  <div className="space-y-3">
                    <div>
                      <Label className="text-gray-300 text-sm">Email Remetente</Label>
                      <Input
                        value={integration.config.emailFrom}
                        onChange={(e) => handleUpdateConfig(integration.id, 'emailFrom', e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white mt-1"
                      />
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Notificações Email</span>
                      <Switch
                        checked={integration.config.emailNotifications}
                        onCheckedChange={(checked) => handleUpdateConfig(integration.id, 'emailNotifications', checked)}
                      />
                    </div>
                  </div>
                )}

                {integration.id === 'themes' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Total de Temas</span>
                      <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                        {integration.config.totalThemes} + Custom
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">Tema Atual</Label>
                      <Input
                        value={integration.config.currentTheme}
                        disabled
                        className="bg-gray-800 border-gray-700 text-gray-400 mt-1"
                      />
                    </div>
                    {setActiveTab && (
                      <Button
                        variant="outline"
                        onClick={() => setActiveTab('settings')}
                        className="w-full"
                      >
                        Ir para Gestão de Temas
                      </Button>
                    )}
                  </div>
                )}

                {integration.id === 'vercel' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
                      <span className="text-sm text-gray-300">Deploy Automático</span>
                      <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                        {integration.config.autoDeploy ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-gray-300 text-sm">URL de Produção</Label>
                      <Input
                        value={integration.config.productionUrl}
                        disabled
                        className="bg-gray-800 border-gray-700 text-gray-400 mt-1"
                      />
                    </div>
                    <a
                      href="https://vercel.com/ricardosubtilgarcia-8872s-projects/site-morethanmoney-final"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2 w-full bg-gray-800 hover:bg-gray-700 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Abrir Dashboard Vercel
                    </a>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Save Success Message */}
      {saveSuccess && (
        <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
          <p className="text-green-400 text-sm font-medium text-center">
            ✅ Configurações de integrações salvas com sucesso!
          </p>
        </div>
      )}

      <Card className="bg-[#D2A63C]/10 border-[#D2A63C]/30">
        <CardContent className="p-6">
          <h4 className="text-[#D2A63C] font-semibold mb-2">API de gestão — Agentes IA (Claude)</h4>
          <p className="text-gray-300 text-sm mb-3">
            Liga o Claude ou outras automações ao site via{" "}
            <code className="text-xs bg-gray-800 px-1 rounded">/api/agent/v1</code>. Define{" "}
            <code className="text-xs bg-gray-800 px-1 rounded">AGENT_SITE_API_KEY</code> na Vercel e
            envia <code className="text-xs bg-gray-800 px-1 rounded">Authorization: Bearer …</code>.
          </p>
          <ul className="text-gray-400 text-xs space-y-1 list-disc list-inside">
            <li>GET /api/agent/v1/health — estado (público)</li>
            <li>GET /api/agent/v1 — manifesto de endpoints</li>
            <li>GET /api/agent/v1/context — contexto do site para o agente</li>
            <li>POST /api/agent/v1/ai/chat — chat com contexto de gestão</li>
          </ul>
        </CardContent>
      </Card>

      {/* Info Box */}
      <Card className="bg-blue-500/10 border-blue-500/30">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <div className="text-2xl">ℹ️</div>
            <div>
              <h4 className="text-blue-400 font-semibold mb-2">Sobre as Integrações</h4>
              <p className="text-gray-300 text-sm">
                Estas integrações são fundamentais para o funcionamento do site. Algumas configurações requerem 
                acesso direto aos dashboards externos (Supabase, Vercel). As alterações aqui são salvas localmente 
                e podem afetar o comportamento de funcionalidades específicas.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
