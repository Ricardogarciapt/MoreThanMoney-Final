"use client"

import { useState } from 'react'
import { Modal, Badge, Button, Alert } from '@mtm-auto/components/ui-primitives'
import { SubscribeModal } from './subscribe-modal'
import type { Strategy } from '@mtm-auto/lib/types'

interface Props {
  strategy: Strategy | null
  onClose: () => void
}

export function StrategyDetailModal({ strategy, onClose }: Props) {
  const [showSubscribe, setShowSubscribe] = useState(false)
  
  if (!strategy) return null
  
  const handleSubscribe = () => {
    onClose()
    setShowSubscribe(true)
  }
  
  return (
    <>
      <Modal
        isOpen={!!strategy}
        onClose={onClose}
        title={strategy.name}
        subtitle={`${strategy.groupName} - ${strategy.subscribers} subscritores`}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Fechar</Button>
            <Button onClick={handleSubscribe}>Subscrever - ${strategy.priceMonthly}/mes</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-5">
          {/* Left Column */}
          <div>
            {/* Mini Chart */}
            <div className="h-28 bg-[var(--mtm-bg3)] rounded-lg overflow-hidden mb-2.5">
              <svg width="100%" height="120" viewBox="0 0 400 120" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sg-modal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4fffb0" stopOpacity="0.25"/>
                    <stop offset="100%" stopColor="#4fffb0" stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d="M0,100 C20,88 45,80 70,65 C95,50 110,60 140,45 C170,30 190,38 220,25 C250,12 270,18 300,10 C330,2 360,6 390,3 L400,2 L400,120 L0,120Z" fill="url(#sg-modal)"/>
                <path d="M0,100 C20,88 45,80 70,65 C95,50 110,60 140,45 C170,30 190,38 220,25 C250,12 270,18 300,10 C330,2 360,6 390,3 L400,2" stroke="#4fffb0" strokeWidth="2" fill="none"/>
              </svg>
            </div>
            
            {/* Performance Stats */}
            <div className="grid grid-cols-3 gap-2 mb-2.5">
              <div className="bg-[var(--mtm-bg3)] rounded-lg p-2.5 text-center border border-[var(--mtm-border)]">
                <div className="font-bold text-lg text-[var(--mtm-green)]">+{strategy.stats.return90d}%</div>
                <div className="text-[9px] text-[var(--mtm-text3)] font-mono">90 Dias</div>
              </div>
              <div className="bg-[var(--mtm-bg3)] rounded-lg p-2.5 text-center border border-[var(--mtm-border)]">
                <div className="font-bold text-lg">{strategy.stats.winRate}%</div>
                <div className="text-[9px] text-[var(--mtm-text3)] font-mono">Win Rate</div>
              </div>
              <div className="bg-[var(--mtm-bg3)] rounded-lg p-2.5 text-center border border-[var(--mtm-border)]">
                <div className="font-bold text-lg">-{strategy.stats.maxDrawdown}%</div>
                <div className="text-[9px] text-[var(--mtm-text3)] font-mono">Max DD</div>
              </div>
            </div>
            
            <div className="grid grid-cols-3 gap-2 mb-3.5">
              <div className="bg-[var(--mtm-bg3)] rounded-lg p-2.5 text-center border border-[var(--mtm-border)]">
                <div className="font-bold text-lg">{strategy.stats.profitFactor}</div>
                <div className="text-[9px] text-[var(--mtm-text3)] font-mono">Profit Factor</div>
              </div>
              <div className="bg-[var(--mtm-bg3)] rounded-lg p-2.5 text-center border border-[var(--mtm-border)]">
                <div className="font-bold text-lg text-[var(--mtm-gold)]">{strategy.stats.sharpe}</div>
                <div className="text-[9px] text-[var(--mtm-text3)] font-mono">Sharpe</div>
              </div>
              <div className="bg-[var(--mtm-bg3)] rounded-lg p-2.5 text-center border border-[var(--mtm-border)]">
                <div className="font-bold text-lg text-[var(--mtm-green)]">{strategy.stats.totalTrades}</div>
                <div className="text-[9px] text-[var(--mtm-text3)] font-mono">Trades</div>
              </div>
            </div>
            
            {/* Description */}
            <div className="mb-3">
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
                Descricao
              </label>
              <div className="text-xs text-[var(--mtm-text2)] leading-relaxed bg-[var(--mtm-bg3)] rounded-md p-2.5">
                {strategy.description}
              </div>
            </div>
            
            {strategy.myfxbookUrl && (
              <a href={strategy.myfxbookUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[var(--mtm-cyan)] flex items-center gap-1.5 mt-1.5">
                Ver no Myfxbook
              </a>
            )}
          </div>
          
          {/* Right Column */}
          <div>
            <div className="mb-3">
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
                Preco Mensal
              </label>
              <div className="font-bold text-3xl text-[var(--mtm-gold)]">
                ${strategy.priceMonthly} <span className="text-sm text-[var(--mtm-text3)] font-normal">/mes</span>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
                Capital Minimo Sugerido
              </label>
              <div className="font-mono text-sm text-[var(--mtm-green)]">${strategy.minCapital.toLocaleString()}</div>
            </div>
            
            <div className="mb-3">
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
                Configuracao Sugerida pelo Mestre
              </label>
              <div className="bg-[var(--mtm-bg3)] rounded-md p-3 space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--mtm-text3)]">Metodo sugerido:</span>
                  <span className="font-mono">% Saldo</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--mtm-text3)]">Lote minimo:</span>
                  <span className="font-mono">{strategy.minLot}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--mtm-text3)]">% minima de copia:</span>
                  <span className="font-mono">{strategy.minCopyPercent}% saldo</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[var(--mtm-text3)]">SafeGuard minimo:</span>
                  <span className="font-mono text-[var(--mtm-gold)]">{strategy.minSafeGuard}%/dia</span>
                </div>
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
                Plataformas e Ambiente
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {strategy.platforms.map(p => (
                  <Badge key={p} variant={p === 'MT5' ? 'mt5' : 'mt4'}>{p}</Badge>
                ))}
                {strategy.environments.map(e => (
                  <Badge key={e} variant={e === 'live' ? 'live' : 'demo'}>{e.toUpperCase()}</Badge>
                ))}
              </div>
            </div>
            
            <div className="mb-3">
              <label className="block text-[10px] text-[var(--mtm-text3)] uppercase tracking-[1.5px] font-mono mb-1.5">
                Brokers Compativeis
              </label>
              <div className="flex flex-wrap gap-1">
                {['ICMarkets', 'Pepperstone', 'Exness', 'FP Markets', 'Monaxa', '+ todos MT5'].map(broker => (
                  <span 
                    key={broker}
                    className="bg-[var(--mtm-bg4)] border border-[var(--mtm-border)] rounded px-1.5 py-0.5 text-[10px] font-mono text-[var(--mtm-text2)]"
                  >
                    {broker}
                  </span>
                ))}
              </div>
            </div>
            
            <Alert variant="warning" className="text-[11px] mt-2">
              Pagamento via API de integracao. O acesso a copia inicia apos aprovacao do admin.
            </Alert>
          </div>
        </div>
      </Modal>
      
      {showSubscribe && strategy && (
        <SubscribeModal 
          strategy={strategy}
          onClose={() => setShowSubscribe(false)}
        />
      )}
    </>
  )
}
