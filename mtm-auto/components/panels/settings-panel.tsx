"use client"

import { useAppStore } from '@mtm-auto/lib/store'
import { Settings, User, Bell, Shield, Palette, Globe, Key, Save, Moon, Sun } from "lucide-react"
import { useState } from "react"

export function SettingsPanel() {
  const { user } = useAppStore()
  const [activeTab, setActiveTab] = useState("profile")
  const [settings, setSettings] = useState({
    name: user?.name || "",
    email: user?.email || "",
    phone: "+55 11 99999-9999",
    notifications: {
      email: true,
      push: true,
      trades: true,
      marketing: false
    },
    security: {
      twoFactor: false,
      sessionTimeout: 30
    },
    appearance: {
      theme: "dark",
      language: "pt-BR"
    }
  })

  const tabs = [
    { id: "profile", label: "Perfil", icon: User },
    { id: "notifications", label: "Notificacoes", icon: Bell },
    { id: "security", label: "Seguranca", icon: Shield },
    { id: "appearance", label: "Aparencia", icon: Palette },
  ]

  return (
    <div className="space-y-4 sm:space-y-6 py-1 sm:p-0">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-[var(--mtm-text)]">Configuracoes</h1>
        <p className="text-sm text-[var(--mtm-text2)] mt-1">Gerencie suas preferencias e configuracoes da conta</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
        {/* Tabs — scroll horizontal em ecrãs estreitos */}
        <div className="flex lg:flex-col gap-1 overflow-x-auto pb-1 -mx-1 px-1 lg:w-64 lg:overflow-visible lg:pb-0 shrink-0 scrollbar-thin">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors whitespace-nowrap shrink-0 lg:w-full ${
                activeTab === tab.id
                  ? "bg-[var(--mtm-green)]/20 text-[var(--mtm-green)]"
                  : "text-[var(--mtm-text2)] hover:bg-[var(--mtm-bg3)]"
              }`}
            >
              <tab.icon className="w-5 h-5 shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-xl p-4 sm:p-6">
          {activeTab === "profile" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--mtm-text)]">Informacoes do Perfil</h2>
              
              <div className="flex items-center gap-6">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[var(--mtm-green)] to-[var(--mtm-cyan)] flex items-center justify-center">
                  <User className="w-10 h-10 text-[var(--mtm-bg)]" />
                </div>
                <div>
                  <button className="px-4 py-2 bg-[var(--mtm-bg4)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] hover:bg-[var(--mtm-bg5)] transition-colors">
                    Alterar Foto
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-[var(--mtm-text2)] mb-2">Nome Completo</label>
                  <input
                    type="text"
                    value={settings.name}
                    onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                    className="w-full px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--mtm-text2)] mb-2">Email</label>
                  <input
                    type="email"
                    value={settings.email}
                    onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                    className="w-full px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                  />
                </div>
                <div>
                  <label className="block text-sm text-[var(--mtm-text2)] mb-2">Telefone</label>
                  <input
                    type="tel"
                    value={settings.phone}
                    onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                    className="w-full px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                  />
                </div>
              </div>

              <button className="flex items-center gap-2 px-6 py-3 bg-[var(--mtm-green)] text-[var(--mtm-bg)] rounded-lg font-medium hover:opacity-90 transition-opacity">
                <Save className="w-4 h-4" />
                Salvar Alteracoes
              </button>
            </div>
          )}

          {activeTab === "notifications" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--mtm-text)]">Preferencias de Notificacao</h2>
              
              <div className="space-y-4">
                {[
                  { key: "email", label: "Notificacoes por Email", desc: "Receba atualizacoes por email" },
                  { key: "push", label: "Notificacoes Push", desc: "Receba notificacoes no navegador" },
                  { key: "trades", label: "Alertas de Trades", desc: "Seja notificado sobre novos trades copiados" },
                  { key: "marketing", label: "Comunicacoes de Marketing", desc: "Receba novidades e promocoes" },
                ].map((item) => (
                  <div key={item.key} className="flex items-center justify-between p-4 bg-[var(--mtm-bg3)] rounded-lg">
                    <div>
                      <p className="text-[var(--mtm-text)] font-medium">{item.label}</p>
                      <p className="text-[var(--mtm-text3)] text-sm">{item.desc}</p>
                    </div>
                    <button
                      onClick={() => setSettings({
                        ...settings,
                        notifications: {
                          ...settings.notifications,
                          [item.key]: !settings.notifications[item.key as keyof typeof settings.notifications]
                        }
                      })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        settings.notifications[item.key as keyof typeof settings.notifications]
                          ? "bg-[var(--mtm-green)]"
                          : "bg-[var(--mtm-bg5)]"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        settings.notifications[item.key as keyof typeof settings.notifications]
                          ? "translate-x-7"
                          : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === "security" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--mtm-text)]">Seguranca da Conta</h2>
              
              <div className="space-y-4">
                <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Key className="w-5 h-5 text-[var(--mtm-cyan)]" />
                      <div>
                        <p className="text-[var(--mtm-text)] font-medium">Alterar Senha</p>
                        <p className="text-[var(--mtm-text3)] text-sm">Ultima alteracao: 30 dias atras</p>
                      </div>
                    </div>
                    <button className="px-4 py-2 bg-[var(--mtm-bg4)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] hover:bg-[var(--mtm-bg5)] transition-colors">
                      Alterar
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5 text-[var(--mtm-green)]" />
                      <div>
                        <p className="text-[var(--mtm-text)] font-medium">Autenticacao de Dois Fatores</p>
                        <p className="text-[var(--mtm-text3)] text-sm">Adicione uma camada extra de seguranca</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setSettings({
                        ...settings,
                        security: { ...settings.security, twoFactor: !settings.security.twoFactor }
                      })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        settings.security.twoFactor ? "bg-[var(--mtm-green)]" : "bg-[var(--mtm-bg5)]"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        settings.security.twoFactor ? "translate-x-7" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[var(--mtm-text)] font-medium">Timeout de Sessao</p>
                      <p className="text-[var(--mtm-text3)] text-sm">Encerrar sessao automaticamente apos inatividade</p>
                    </div>
                    <select
                      value={settings.security.sessionTimeout}
                      onChange={(e) => setSettings({
                        ...settings,
                        security: { ...settings.security, sessionTimeout: Number(e.target.value) }
                      })}
                      className="px-3 py-2 bg-[var(--mtm-bg4)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none"
                    >
                      <option value={15}>15 minutos</option>
                      <option value={30}>30 minutos</option>
                      <option value={60}>1 hora</option>
                      <option value={120}>2 horas</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === "appearance" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-[var(--mtm-text)]">Aparencia</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-[var(--mtm-text2)] mb-3">Tema</label>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setSettings({ ...settings, appearance: { ...settings.appearance, theme: "dark" } })}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                        settings.appearance.theme === "dark"
                          ? "bg-[var(--mtm-green)]/20 border-[var(--mtm-green)] text-[var(--mtm-green)]"
                          : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] text-[var(--mtm-text2)]"
                      }`}
                    >
                      <Moon className="w-5 h-5" />
                      Escuro
                    </button>
                    <button
                      onClick={() => setSettings({ ...settings, appearance: { ...settings.appearance, theme: "light" } })}
                      className={`flex items-center gap-2 px-4 py-3 rounded-lg border transition-colors ${
                        settings.appearance.theme === "light"
                          ? "bg-[var(--mtm-green)]/20 border-[var(--mtm-green)] text-[var(--mtm-green)]"
                          : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] text-[var(--mtm-text2)]"
                      }`}
                    >
                      <Sun className="w-5 h-5" />
                      Claro
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm text-[var(--mtm-text2)] mb-3">Idioma</label>
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-[var(--mtm-text3)]" />
                    <select
                      value={settings.appearance.language}
                      onChange={(e) => setSettings({
                        ...settings,
                        appearance: { ...settings.appearance, language: e.target.value }
                      })}
                      className="px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                    >
                      <option value="pt-BR">Portugues (Brasil)</option>
                      <option value="en-US">English (US)</option>
                      <option value="es-ES">Espanol</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
