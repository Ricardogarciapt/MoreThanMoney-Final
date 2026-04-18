"use client"

import { useState } from "react"
import { X, Server, User, Lock, Hash, Eye, EyeOff, AlertCircle, CheckCircle } from "lucide-react"
import { useAppStore } from "@mtm-auto/lib/store"
import { brokers } from "@mtm-auto/lib/brokers"

interface AddAccountModalProps {
  isOpen: boolean
  onClose: () => void
}

export function AddAccountModal({ isOpen, onClose }: AddAccountModalProps) {
  const { addAccount, user } = useAppStore()
  const [step, setStep] = useState(1)
  const [showPassword, setShowPassword] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectionStatus, setConnectionStatus] = useState<"idle" | "connecting" | "success" | "error">("idle")
  
  const [formData, setFormData] = useState({
    broker: "",
    server: "",
    accountNumber: "",
    password: "",
    platform: "MT5" as "MT4" | "MT5",
    nickname: ""
  })

  const selectedBroker = brokers.find(b => b.id === formData.broker)

  const handleConnect = async () => {
    setIsConnecting(true)
    setConnectionStatus("connecting")
    
    // Simulate connection
    await new Promise(resolve => setTimeout(resolve, 2000))
    
    // Random success (90% chance)
    if (Math.random() > 0.1) {
      setConnectionStatus("success")

      const bal = Math.floor(Math.random() * 50000) + 1000
      const eq = Math.floor(Math.random() * 50000) + 1000

      addAccount({
        login: formData.accountNumber,
        broker: selectedBroker?.name || formData.broker,
        server: formData.server,
        platform: formData.platform,
        environment: "live",
        balance: bal,
        equity: eq,
        role: "slave",
        status: "connected",
        userId: user?.id || "u1",
      })
      
      setTimeout(() => {
        onClose()
        resetForm()
      }, 1500)
    } else {
      setConnectionStatus("error")
    }
    
    setIsConnecting(false)
  }

  const resetForm = () => {
    setStep(1)
    setFormData({
      broker: "",
      server: "",
      accountNumber: "",
      password: "",
      platform: "MT5",
      nickname: ""
    })
    setConnectionStatus("idle")
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-lg bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--mtm-border)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--mtm-text)]">Adicionar Conta</h2>
            <p className="text-[var(--mtm-text3)] text-sm mt-1">Conecte sua conta MT4/MT5</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--mtm-bg3)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--mtm-text3)]" />
          </button>
        </div>

        {/* Steps */}
        <div className="flex items-center justify-center gap-4 p-4 border-b border-[var(--mtm-border)]">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s 
                  ? "bg-[var(--mtm-green)] text-[var(--mtm-bg)]" 
                  : "bg-[var(--mtm-bg4)] text-[var(--mtm-text3)]"
              }`}>
                {s}
              </div>
              {s < 3 && (
                <div className={`w-12 h-0.5 ${step > s ? "bg-[var(--mtm-green)]" : "bg-[var(--mtm-bg4)]"}`} />
              )}
            </div>
          ))}
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[var(--mtm-text)]">Selecione a Corretora</h3>
              
              <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
                {brokers.map((broker) => (
                  <button
                    key={broker.id}
                    onClick={() => {
                      setFormData({
                        ...formData,
                        broker: broker.id,
                        server: broker.servers[0] || "",
                        platform: broker.platform,
                      })
                    }}
                    className={`p-4 rounded-lg border text-left transition-all ${
                      formData.broker === broker.id
                        ? "bg-[var(--mtm-green)]/20 border-[var(--mtm-green)]"
                        : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] hover:border-[var(--mtm-border2)]"
                    }`}
                  >
                    <p className="font-medium text-[var(--mtm-text)]">{broker.name}</p>
                    <p className="text-xs text-[var(--mtm-text3)] mt-1">{broker.servers.length} servidores</p>
                  </button>
                ))}
              </div>

              <button
                onClick={() => setStep(2)}
                disabled={!formData.broker}
                className="w-full py-3 bg-[var(--mtm-green)] text-[var(--mtm-bg)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                Continuar
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-[var(--mtm-text)]">Dados da Conta</h3>
              
              <div>
                <label className="block text-sm text-[var(--mtm-text2)] mb-2">Plataforma</label>
                <div className="flex gap-3">
                  {(["MT4", "MT5"] as const).map((platform) => (
                    <button
                      key={platform}
                      onClick={() => setFormData({ ...formData, platform })}
                      className={`flex-1 py-3 rounded-lg border font-medium transition-colors ${
                        formData.platform === platform
                          ? "bg-[var(--mtm-green)]/20 border-[var(--mtm-green)] text-[var(--mtm-green)]"
                          : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] text-[var(--mtm-text2)]"
                      }`}
                    >
                      {platform}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--mtm-text2)] mb-2">Servidor</label>
                <div className="relative">
                  <Server className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                  <select
                    value={formData.server}
                    onChange={(e) => setFormData({ ...formData, server: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                  >
                    {selectedBroker?.servers.map((server) => (
                      <option key={server} value={server}>{server}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--mtm-text2)] mb-2">Numero da Conta</label>
                <div className="relative">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    placeholder="Ex: 12345678"
                    className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] placeholder:text-[var(--mtm-text3)] focus:outline-none focus:border-[var(--mtm-green)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--mtm-text2)] mb-2">Senha do Investidor (Read-Only)</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Senha do investidor"
                    className="w-full pl-10 pr-12 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] placeholder:text-[var(--mtm-text3)] focus:outline-none focus:border-[var(--mtm-green)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--mtm-text3)] hover:text-[var(--mtm-text)]"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm text-[var(--mtm-text2)] mb-2">Apelido (Opcional)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                  <input
                    type="text"
                    value={formData.nickname}
                    onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                    placeholder="Ex: Conta Principal"
                    className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] placeholder:text-[var(--mtm-text3)] focus:outline-none focus:border-[var(--mtm-green)]"
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="flex-1 py-3 bg-[var(--mtm-bg4)] text-[var(--mtm-text)] rounded-lg font-medium hover:bg-[var(--mtm-bg5)] transition-colors"
                >
                  Voltar
                </button>
                <button
                  onClick={() => setStep(3)}
                  disabled={!formData.accountNumber || !formData.password}
                  className="flex-1 py-3 bg-[var(--mtm-green)] text-[var(--mtm-bg)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  Continuar
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold text-[var(--mtm-text)]">Confirmar Conexao</h3>
              
              <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg space-y-3">
                <div className="flex justify-between">
                  <span className="text-[var(--mtm-text3)]">Corretora</span>
                  <span className="text-[var(--mtm-text)]">{selectedBroker?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--mtm-text3)]">Plataforma</span>
                  <span className="text-[var(--mtm-text)]">{formData.platform}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--mtm-text3)]">Servidor</span>
                  <span className="text-[var(--mtm-text)]">{formData.server}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--mtm-text3)]">Conta</span>
                  <span className="text-[var(--mtm-text)]">{formData.accountNumber}</span>
                </div>
              </div>

              {connectionStatus === "error" && (
                <div className="flex items-center gap-3 p-4 bg-[var(--mtm-red)]/20 border border-[var(--mtm-red)]/30 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-[var(--mtm-red)]" />
                  <div>
                    <p className="text-[var(--mtm-text)] font-medium">Falha na conexao</p>
                    <p className="text-[var(--mtm-text3)] text-sm">Verifique os dados e tente novamente</p>
                  </div>
                </div>
              )}

              {connectionStatus === "success" && (
                <div className="flex items-center gap-3 p-4 bg-[var(--mtm-green)]/20 border border-[var(--mtm-green)]/30 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-[var(--mtm-green)]" />
                  <div>
                    <p className="text-[var(--mtm-text)] font-medium">Conta conectada com sucesso!</p>
                    <p className="text-[var(--mtm-text3)] text-sm">Redirecionando...</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  disabled={isConnecting}
                  className="flex-1 py-3 bg-[var(--mtm-bg4)] text-[var(--mtm-text)] rounded-lg font-medium hover:bg-[var(--mtm-bg5)] transition-colors disabled:opacity-50"
                >
                  Voltar
                </button>
                <button
                  onClick={handleConnect}
                  disabled={isConnecting || connectionStatus === "success"}
                  className="flex-1 py-3 bg-[var(--mtm-green)] text-[var(--mtm-bg)] rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
                >
                  {isConnecting ? "Conectando..." : connectionStatus === "success" ? "Conectado!" : "Conectar Conta"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
