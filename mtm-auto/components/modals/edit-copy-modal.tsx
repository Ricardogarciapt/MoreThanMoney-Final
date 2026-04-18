"use client"

import { useState } from "react"
import { X, Settings2, AlertTriangle, Shield, TrendingUp, TrendingDown, DollarSign, Percent, Lock, Unlock } from "lucide-react"
import { useAppStore } from '@mtm-auto/lib/store'
import type { CopyConfig } from '@mtm-auto/lib/types'

interface EditCopyModalProps {
  isOpen: boolean
  onClose: () => void
  copyId: string
}

export function EditCopyModal({ isOpen, onClose, copyId }: EditCopyModalProps) {
  const { myCopies, updateCopyConfig } = useAppStore()
  const copy = myCopies.find(c => c.id === copyId)
  
  const [config, setConfig] = useState<CopyConfig>(copy?.config || {
    riskType: "fixed",
    lotSize: 0.01,
    lotMultiplier: 1.0,
    maxLotSize: 1.0,
    maxOpenTrades: 10,
    maxDailyLoss: 0,
    maxDailyLossEnabled: false,
    maxTotalLoss: 0,
    maxTotalLossEnabled: false,
    copyStopLoss: true,
    copyTakeProfit: true,
    invertTrades: false,
    onlyBuy: false,
    onlySell: false,
    symbolMapping: {},
    symbolSuffix: "",
    slippage: 3,
    maxSpread: 0,
    maxSpreadEnabled: false,
  })

  const [activeTab, setActiveTab] = useState("risk")

  const handleSave = () => {
    if (copy) {
      updateCopyConfig(copyId, config)
      onClose()
    }
  }

  if (!isOpen || !copy) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl max-h-[90vh] bg-[var(--mtm-bg2)] border border-[var(--mtm-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-[var(--mtm-border)]">
          <div>
            <h2 className="text-xl font-bold text-[var(--mtm-text)]">Configurar Copy</h2>
            <p className="text-[var(--mtm-text3)] text-sm mt-1">{copy.strategyName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[var(--mtm-bg3)] rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-[var(--mtm-text3)]" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--mtm-border)]">
          {[
            { id: "risk", label: "Risco", icon: TrendingUp },
            { id: "safeguard", label: "SafeGuard", icon: Shield },
            { id: "filters", label: "Filtros", icon: Settings2 },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-4 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? "border-[var(--mtm-green)] text-[var(--mtm-green)]"
                  : "border-transparent text-[var(--mtm-text3)] hover:text-[var(--mtm-text)]"
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === "risk" && (
            <div className="space-y-6">
              {/* Risk Type */}
              <div>
                <label className="block text-sm font-medium text-[var(--mtm-text)] mb-3">Tipo de Risco</label>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { value: "fixed", label: "Lote Fixo", desc: "Mesmo lote sempre" },
                    { value: "multiplier", label: "Multiplicador", desc: "Multiplica pelo Master" },
                    { value: "risk", label: "% de Risco", desc: "Baseado no saldo" },
                  ].map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setConfig({ ...config, riskType: option.value as CopyConfig["riskType"] })}
                      className={`p-4 rounded-lg border text-left transition-all ${
                        config.riskType === option.value
                          ? "bg-[var(--mtm-green)]/20 border-[var(--mtm-green)]"
                          : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] hover:border-[var(--mtm-border2)]"
                      }`}
                    >
                      <p className="font-medium text-[var(--mtm-text)]">{option.label}</p>
                      <p className="text-xs text-[var(--mtm-text3)] mt-1">{option.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Lot Settings */}
              {config.riskType === "fixed" && (
                <div>
                  <label className="block text-sm font-medium text-[var(--mtm-text)] mb-2">Tamanho do Lote</label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={config.lotSize}
                      onChange={(e) => setConfig({ ...config, lotSize: parseFloat(e.target.value) || 0.01 })}
                      className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                    />
                  </div>
                </div>
              )}

              {config.riskType === "multiplier" && (
                <div>
                  <label className="block text-sm font-medium text-[var(--mtm-text)] mb-2">Multiplicador</label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={config.lotMultiplier}
                      onChange={(e) => setConfig({ ...config, lotMultiplier: parseFloat(e.target.value) || 1 })}
                      className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                    />
                  </div>
                  <p className="text-xs text-[var(--mtm-text3)] mt-2">Se o Master abrir 0.1 lote e o multiplicador for 2x, voce abrira 0.2 lotes</p>
                </div>
              )}

              {config.riskType === "risk" && (
                <div>
                  <label className="block text-sm font-medium text-[var(--mtm-text)] mb-2">Risco por Trade (%)</label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                    <input
                      type="number"
                      step="0.5"
                      min="0.1"
                      max="10"
                      value={config.riskPercent || 1}
                      onChange={(e) => setConfig({ ...config, riskPercent: parseFloat(e.target.value) || 1 })}
                      className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                    />
                  </div>
                </div>
              )}

              {/* Max Lot Size */}
              <div>
                <label className="block text-sm font-medium text-[var(--mtm-text)] mb-2">Lote Maximo</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.01"
                  value={config.maxLotSize}
                  onChange={(e) => setConfig({ ...config, maxLotSize: parseFloat(e.target.value) || 1 })}
                  className="w-full px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                />
              </div>

              {/* Max Open Trades */}
              <div>
                <label className="block text-sm font-medium text-[var(--mtm-text)] mb-2">Maximo de Trades Abertos</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={config.maxOpenTrades}
                  onChange={(e) => setConfig({ ...config, maxOpenTrades: parseInt(e.target.value) || 10 })}
                  className="w-full px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                />
              </div>
            </div>
          )}

          {activeTab === "safeguard" && (
            <div className="space-y-6">
              <div className="p-4 bg-[var(--mtm-gold)]/10 border border-[var(--mtm-gold)]/30 rounded-lg">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-[var(--mtm-gold)] mt-0.5" />
                  <div>
                    <p className="font-medium text-[var(--mtm-text)]">SafeGuard Protecao</p>
                    <p className="text-sm text-[var(--mtm-text3)] mt-1">
                      Configure limites de perda para proteger sua conta automaticamente
                    </p>
                  </div>
                </div>
              </div>

              {/* Daily Loss Limit */}
              <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <TrendingDown className="w-5 h-5 text-[var(--mtm-red)]" />
                    <div>
                      <p className="font-medium text-[var(--mtm-text)]">Limite de Perda Diaria</p>
                      <p className="text-xs text-[var(--mtm-text3)]">Pausa a copia ao atingir o limite</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, maxDailyLossEnabled: !config.maxDailyLossEnabled })}
                    className={`p-2 rounded-lg transition-colors ${
                      config.maxDailyLossEnabled ? "bg-[var(--mtm-green)]/20 text-[var(--mtm-green)]" : "bg-[var(--mtm-bg4)] text-[var(--mtm-text3)]"
                    }`}
                  >
                    {config.maxDailyLossEnabled ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </button>
                </div>
                {config.maxDailyLossEnabled && (
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                    <input
                      type="number"
                      min="0"
                      value={config.maxDailyLoss}
                      onChange={(e) => setConfig({ ...config, maxDailyLoss: parseFloat(e.target.value) || 0 })}
                      placeholder="Ex: 100"
                      className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg4)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] placeholder:text-[var(--mtm-text3)] focus:outline-none focus:border-[var(--mtm-green)]"
                    />
                  </div>
                )}
              </div>

              {/* Total Loss Limit */}
              <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-5 h-5 text-[var(--mtm-red)]" />
                    <div>
                      <p className="font-medium text-[var(--mtm-text)]">Limite de Perda Total</p>
                      <p className="text-xs text-[var(--mtm-text3)]">Desativa a copia permanentemente</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, maxTotalLossEnabled: !config.maxTotalLossEnabled })}
                    className={`p-2 rounded-lg transition-colors ${
                      config.maxTotalLossEnabled ? "bg-[var(--mtm-green)]/20 text-[var(--mtm-green)]" : "bg-[var(--mtm-bg4)] text-[var(--mtm-text3)]"
                    }`}
                  >
                    {config.maxTotalLossEnabled ? <Unlock className="w-5 h-5" /> : <Lock className="w-5 h-5" />}
                  </button>
                </div>
                {config.maxTotalLossEnabled && (
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--mtm-text3)]" />
                    <input
                      type="number"
                      min="0"
                      value={config.maxTotalLoss}
                      onChange={(e) => setConfig({ ...config, maxTotalLoss: parseFloat(e.target.value) || 0 })}
                      placeholder="Ex: 500"
                      className="w-full pl-10 pr-4 py-3 bg-[var(--mtm-bg4)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] placeholder:text-[var(--mtm-text3)] focus:outline-none focus:border-[var(--mtm-green)]"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "filters" && (
            <div className="space-y-6">
              {/* Copy SL/TP */}
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--mtm-text)]">Copiar Stop Loss</span>
                    <button
                      onClick={() => setConfig({ ...config, copyStopLoss: !config.copyStopLoss })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        config.copyStopLoss ? "bg-[var(--mtm-green)]" : "bg-[var(--mtm-bg5)]"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        config.copyStopLoss ? "translate-x-7" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                </div>
                <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-[var(--mtm-text)]">Copiar Take Profit</span>
                    <button
                      onClick={() => setConfig({ ...config, copyTakeProfit: !config.copyTakeProfit })}
                      className={`w-12 h-6 rounded-full transition-colors relative ${
                        config.copyTakeProfit ? "bg-[var(--mtm-green)]" : "bg-[var(--mtm-bg5)]"
                      }`}
                    >
                      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        config.copyTakeProfit ? "translate-x-7" : "translate-x-1"
                      }`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Direction Filter */}
              <div>
                <label className="block text-sm font-medium text-[var(--mtm-text)] mb-3">Filtro de Direcao</label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setConfig({ ...config, onlyBuy: false, onlySell: false })}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      !config.onlyBuy && !config.onlySell
                        ? "bg-[var(--mtm-green)]/20 border-[var(--mtm-green)] text-[var(--mtm-green)]"
                        : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] text-[var(--mtm-text2)]"
                    }`}
                  >
                    Ambos
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, onlyBuy: true, onlySell: false })}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      config.onlyBuy
                        ? "bg-[var(--mtm-green)]/20 border-[var(--mtm-green)] text-[var(--mtm-green)]"
                        : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] text-[var(--mtm-text2)]"
                    }`}
                  >
                    Apenas Buy
                  </button>
                  <button
                    onClick={() => setConfig({ ...config, onlyBuy: false, onlySell: true })}
                    className={`p-3 rounded-lg border text-center transition-all ${
                      config.onlySell
                        ? "bg-[var(--mtm-red)]/20 border-[var(--mtm-red)] text-[var(--mtm-red)]"
                        : "bg-[var(--mtm-bg3)] border-[var(--mtm-border)] text-[var(--mtm-text2)]"
                    }`}
                  >
                    Apenas Sell
                  </button>
                </div>
              </div>

              {/* Invert Trades */}
              <div className="p-4 bg-[var(--mtm-bg3)] rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[var(--mtm-text)] font-medium">Inverter Trades</p>
                    <p className="text-xs text-[var(--mtm-text3)]">Buy vira Sell e vice-versa</p>
                  </div>
                  <button
                    onClick={() => setConfig({ ...config, invertTrades: !config.invertTrades })}
                    className={`w-12 h-6 rounded-full transition-colors relative ${
                      config.invertTrades ? "bg-[var(--mtm-green)]" : "bg-[var(--mtm-bg5)]"
                    }`}
                  >
                    <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
                      config.invertTrades ? "translate-x-7" : "translate-x-1"
                    }`} />
                  </button>
                </div>
              </div>

              {/* Symbol Suffix */}
              <div>
                <label className="block text-sm font-medium text-[var(--mtm-text)] mb-2">Sufixo de Simbolo</label>
                <input
                  type="text"
                  value={config.symbolSuffix}
                  onChange={(e) => setConfig({ ...config, symbolSuffix: e.target.value })}
                  placeholder="Ex: .r ou .a"
                  className="w-full px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] placeholder:text-[var(--mtm-text3)] focus:outline-none focus:border-[var(--mtm-green)]"
                />
                <p className="text-xs text-[var(--mtm-text3)] mt-2">Adiciona sufixo aos simbolos (EURUSD vira EURUSD.r)</p>
              </div>

              {/* Slippage */}
              <div>
                <label className="block text-sm font-medium text-[var(--mtm-text)] mb-2">Slippage Maximo (pips)</label>
                <input
                  type="number"
                  min="0"
                  max="50"
                  value={config.slippage}
                  onChange={(e) => setConfig({ ...config, slippage: parseInt(e.target.value) || 3 })}
                  className="w-full px-4 py-3 bg-[var(--mtm-bg3)] border border-[var(--mtm-border)] rounded-lg text-[var(--mtm-text)] focus:outline-none focus:border-[var(--mtm-green)]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-[var(--mtm-border)]">
          <button
            onClick={onClose}
            className="flex-1 py-3 bg-[var(--mtm-bg4)] text-[var(--mtm-text)] rounded-lg font-medium hover:bg-[var(--mtm-bg5)] transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 py-3 bg-[var(--mtm-green)] text-[var(--mtm-bg)] rounded-lg font-medium hover:opacity-90 transition-opacity"
          >
            Salvar Configuracoes
          </button>
        </div>
      </div>
    </div>
  )
}
