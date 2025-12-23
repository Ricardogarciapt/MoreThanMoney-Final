"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Save, RefreshCw, Check } from "lucide-react"

interface AdminSettings {
  site_name: string
  site_description: string
  maintenance_mode: boolean
  registration_enabled: boolean
  auto_approve_users: boolean
  email_notifications: boolean
  default_user_role: 'member' | 'admin'
}

export default function SettingsManager() {
  const [settings, setSettings] = useState<AdminSettings>({
    site_name: 'MoreThanMoney',
    site_description: 'Plataforma de Trading e Educação Financeira',
    maintenance_mode: false,
    registration_enabled: true,
    auto_approve_users: false,
    email_notifications: true,
    default_user_role: 'member'
  })
  
  const [isSaving, setIsSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/settings')
      const result = await response.json()
      
      if (result.data) {
        setSettings(result.data)
      }
    } catch (error) {
      console.error('Erro ao carregar configurações:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSaveSettings = async () => {
    try {
      setIsSaving(true)
      setSaveSuccess(false)

      const response = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      })

      const result = await response.json()

      if (response.ok) {
        setSaveSuccess(true)
        setTimeout(() => setSaveSuccess(false), 3000)
      } else {
        alert(`Erro ao salvar configurações: ${result.error}`)
      }
    } catch (error) {
      console.error('Erro ao salvar configurações:', error)
      alert('Erro ao salvar configurações')
    } finally {
      setIsSaving(false)
    }
  }

  const handleResetSettings = () => {
    setSettings({
      site_name: 'MoreThanMoney',
      site_description: 'Plataforma de Trading e Educação Financeira',
      maintenance_mode: false,
      registration_enabled: true,
      auto_approve_users: false,
      email_notifications: true,
      default_user_role: 'member'
    })
  }

  if (isLoading) {
    return (
      <Card className="card-clean">
        <CardContent className="py-12 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-mtm-primary mx-auto mb-4" />
          <p className="text-gray-300">A carregar configurações...</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="card-clean">
      <CardHeader>
        <CardTitle className="text-mtm-primary">Configurações do Sistema</CardTitle>
        <p className="text-gray-400 text-sm">
          Gerir todas as configurações globais da plataforma
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Informações do Site */}
        <div className="space-y-4">
          <h3 className="text-white font-medium text-lg">Informações do Site</h3>
          
          <div className="space-y-2">
            <Label className="text-gray-300">Nome do Site</Label>
            <Input
              value={settings.site_name}
              onChange={(e) => setSettings({...settings, site_name: e.target.value})}
              className="input-focus"
              placeholder="MoreThanMoney"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-gray-300">Descrição do Site</Label>
            <Input
              value={settings.site_description}
              onChange={(e) => setSettings({...settings, site_description: e.target.value})}
              className="input-focus"
              placeholder="Plataforma de Trading e Educação Financeira"
            />
          </div>
        </div>

        {/* Configurações de Sistema */}
        <div className="space-y-4">
          <h3 className="text-white font-medium text-lg">Configurações de Sistema</h3>
          
          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="space-y-1">
              <Label className="text-white">Modo de Manutenção</Label>
              <p className="text-sm text-gray-400">Desativa o acesso público ao site</p>
            </div>
            <Switch
              checked={settings.maintenance_mode}
              onCheckedChange={(checked) => setSettings({...settings, maintenance_mode: checked})}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="space-y-1">
              <Label className="text-white">Registo de Novos Utilizadores</Label>
              <p className="text-sm text-gray-400">Permite que novos utilizadores se registem</p>
            </div>
            <Switch
              checked={settings.registration_enabled}
              onCheckedChange={(checked) => setSettings({...settings, registration_enabled: checked})}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-mtm-primary/10 rounded-lg border border-mtm-primary/30">
            <div className="space-y-1">
              <Label className="text-white font-semibold">Aprovação Automática de Utilizadores</Label>
              <p className="text-sm text-gray-400">
                Novos utilizadores são aprovados automaticamente sem necessidade de aprovação manual
              </p>
              <p className="text-xs text-mtm-primary mt-1">
                ⚠️ Se ativado, todos os novos registos serão automaticamente aprovados
              </p>
            </div>
            <Switch
              checked={settings.auto_approve_users}
              onCheckedChange={(checked) => setSettings({...settings, auto_approve_users: checked})}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-gray-800/50 rounded-lg">
            <div className="space-y-1">
              <Label className="text-white">Notificações por Email</Label>
              <p className="text-sm text-gray-400">
                Envia emails para admin quando há novos registos
              </p>
            </div>
            <Switch
              checked={settings.email_notifications}
              onCheckedChange={(checked) => setSettings({...settings, email_notifications: checked})}
            />
          </div>
        </div>

        {/* Configurações de Utilizadores */}
        <div className="space-y-4">
          <h3 className="text-white font-medium text-lg">Configurações de Utilizadores</h3>
          
          <div className="space-y-2">
            <Label className="text-gray-300">Role Padrão para Novos Utilizadores</Label>
            <select
              value={settings.default_user_role}
              onChange={(e) => setSettings({...settings, default_user_role: e.target.value as 'member' | 'admin'})}
              className="w-full bg-gray-800 border border-gray-700 text-white rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-mtm-primary"
            >
              <option value="member">Member (Recomendado)</option>
              <option value="admin">Admin</option>
            </select>
            <p className="text-xs text-gray-400">
              Define o tipo de utilizador atribuído automaticamente ao registar
            </p>
          </div>
        </div>

        {/* Preview das Configurações */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <h4 className="text-blue-400 font-medium mb-3">📋 Resumo das Configurações</h4>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-gray-400">Modo Manutenção:</span>
              <span className={`ml-2 font-medium ${settings.maintenance_mode ? 'text-red-400' : 'text-green-400'}`}>
                {settings.maintenance_mode ? 'Ativado' : 'Desativado'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Registo:</span>
              <span className={`ml-2 font-medium ${settings.registration_enabled ? 'text-green-400' : 'text-red-400'}`}>
                {settings.registration_enabled ? 'Ativado' : 'Desativado'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Aprovação Auto:</span>
              <span className={`ml-2 font-medium ${settings.auto_approve_users ? 'text-orange-400' : 'text-green-400'}`}>
                {settings.auto_approve_users ? 'Ativado' : 'Desativado'}
              </span>
            </div>
            <div>
              <span className="text-gray-400">Emails:</span>
              <span className={`ml-2 font-medium ${settings.email_notifications ? 'text-green-400' : 'text-gray-400'}`}>
                {settings.email_notifications ? 'Ativado' : 'Desativado'}
              </span>
            </div>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex gap-4">
          <Button
            onClick={handleSaveSettings}
            disabled={isSaving}
            className="btn-mtm-primary flex-1"
          >
            {isSaving ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                A Guardar...
              </>
            ) : saveSuccess ? (
              <>
                <Check className="w-4 h-4 mr-2" />
                Configurações Guardadas!
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Guardar Configurações
              </>
            )}
          </Button>
          
          <Button
            onClick={handleResetSettings}
            variant="outline"
            className="btn-mtm-secondary"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Restaurar Padrões
          </Button>
        </div>

        {saveSuccess && (
          <div className="bg-green-500/20 border border-green-500 rounded-lg p-4">
            <p className="text-green-400 text-sm font-medium">
              ✅ Configurações guardadas com sucesso!
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
