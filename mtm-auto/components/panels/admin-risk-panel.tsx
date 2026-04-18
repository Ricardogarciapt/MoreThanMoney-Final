"use client"

import { useAppStore } from '@mtm-auto/lib/store'
import { Card, CardHeader, Alert, Range, Toggle, Input, Button } from '@mtm-auto/components/ui-primitives'

export function AdminRiskPanel() {
  const { globalRiskSettings, updateRiskSettings } = useAppStore()
  
  return (
    <div className="grid grid-cols-2 gap-3.5">
      {/* Left Column - Copy Modes */}
      <div>
        <Card className="mb-3.5">
          <CardHeader title="Modos de Copia Permitidos" />
          <Toggle 
            checked={globalRiskSettings.allowedRiskModes.includes('balance_percent')} 
            onChange={(v) => {
              const modes = v 
                ? [...globalRiskSettings.allowedRiskModes, 'balance_percent' as const]
                : globalRiskSettings.allowedRiskModes.filter(m => m !== 'balance_percent')
              updateRiskSettings({ allowedRiskModes: modes })
            }}
            label="Percentagem do Saldo"
          />
          <Toggle 
            checked={globalRiskSettings.allowedRiskModes.includes('fixed_lot')} 
            onChange={(v) => {
              const modes = v 
                ? [...globalRiskSettings.allowedRiskModes, 'fixed_lot' as const]
                : globalRiskSettings.allowedRiskModes.filter(m => m !== 'fixed_lot')
              updateRiskSettings({ allowedRiskModes: modes })
            }}
            label="Lote Fixo"
          />
          <Toggle 
            checked={globalRiskSettings.allowedRiskModes.includes('equity_percent')} 
            onChange={(v) => {
              const modes = v 
                ? [...globalRiskSettings.allowedRiskModes, 'equity_percent' as const]
                : globalRiskSettings.allowedRiskModes.filter(m => m !== 'equity_percent')
              updateRiskSettings({ allowedRiskModes: modes })
            }}
            label="Capital Fixo por Operacao"
          />
          <Toggle 
            checked={globalRiskSettings.allowedRiskModes.includes('lot_multiplier')} 
            onChange={(v) => {
              const modes = v 
                ? [...globalRiskSettings.allowedRiskModes, 'lot_multiplier' as const]
                : globalRiskSettings.allowedRiskModes.filter(m => m !== 'lot_multiplier')
              updateRiskSettings({ allowedRiskModes: modes })
            }}
            label="Multiplicador de Lote"
          />
          
          <div className="h-px bg-[var(--mtm-border)] my-3.5" />
          
          <Range
            label="Risco Maximo por Operacao (%)"
            value={globalRiskSettings.maxRiskPerTrade}
            onChange={(v) => updateRiskSettings({ maxRiskPerTrade: v })}
            min={0.1}
            max={50}
            step={0.1}
            unit="%"
          />
          
          <Input
            label="Lote Minimo Global"
            value={globalRiskSettings.minLotGlobal.toString()}
            onChange={(v) => updateRiskSettings({ minLotGlobal: parseFloat(v) || 0.01 })}
          />
          
          <Input
            label="Lote Maximo Global"
            value={globalRiskSettings.maxLotGlobal.toString()}
            onChange={(v) => updateRiskSettings({ maxLotGlobal: parseFloat(v) || 100 })}
          />
        </Card>
      </div>
      
      {/* Right Column - SafeGuard & Filters */}
      <div>
        <Card className="mb-3.5">
          <CardHeader title="SafeGuard Global - PropFirm Mode" />
          <Alert variant="warning" className="text-[11px]">
            Limites globais aplicados a TODAS as contas slave. Individualmente podem ser mais restritivos.
          </Alert>
          
          <Range
            label="Perda Diaria Maxima Padrao (%)"
            value={globalRiskSettings.defaultDailyLoss}
            onChange={(v) => updateRiskSettings({ defaultDailyLoss: v })}
            min={0.5}
            max={15}
            step={0.5}
            unit="%"
            color="gold"
          />
          
          <Range
            label="Perda Total Maxima Padrao (%)"
            value={globalRiskSettings.defaultTotalLoss}
            onChange={(v) => updateRiskSettings({ defaultTotalLoss: v })}
            min={1}
            max={50}
            step={0.5}
            unit="%"
            color="red"
          />
          
          <Input
            label="Hora de Reset Diario (UTC)"
            value={globalRiskSettings.resetTimeUTC}
            onChange={(v) => updateRiskSettings({ resetTimeUTC: v })}
            type="time"
          />
          
          <div className="mt-3">
            <Toggle 
              checked={globalRiskSettings.autoPauseOnDailyLimit} 
              onChange={(v) => updateRiskSettings({ autoPauseOnDailyLimit: v })}
              label="Pausar automaticamente ao atingir limite diario"
            />
            <Toggle 
              checked={globalRiskSettings.closePositionsOnTotalLimit} 
              onChange={(v) => updateRiskSettings({ closePositionsOnTotalLimit: v })}
              label="Fechar posicoes ao atingir limite total"
            />
            <Toggle 
              checked={globalRiskSettings.notifyAt80Percent} 
              onChange={(v) => updateRiskSettings({ notifyAt80Percent: v })}
              label="Notificacao email a 80% do limite"
            />
          </div>
        </Card>
        
        <Card>
          <CardHeader title="Filtros de Copia Globais" />
          <Toggle 
            checked={globalRiskSettings.copyStopLoss} 
            onChange={(v) => updateRiskSettings({ copyStopLoss: v })}
            label="Copiar Stop Loss e Take Profit"
          />
          <Toggle 
            checked={globalRiskSettings.copyPendingOrders} 
            onChange={(v) => updateRiskSettings({ copyPendingOrders: v })}
            label="Copiar ordens pendentes"
          />
          <Toggle 
            checked={globalRiskSettings.copyTrailingStop} 
            onChange={(v) => updateRiskSettings({ copyTrailingStop: v })}
            label="Copiar trailing stop"
          />
          <Toggle 
            checked={globalRiskSettings.reverseModeAvailable} 
            onChange={(v) => updateRiskSettings({ reverseModeAvailable: v })}
            label="Modo reverso disponivel para clientes"
          />
          
          <Input
            label="Simbolos Excluidos"
            value={globalRiskSettings.excludedSymbols.join(', ')}
            onChange={(v) => updateRiskSettings({ excludedSymbols: v.split(',').map(s => s.trim()).filter(Boolean) })}
            placeholder="Ex: USDTRY, USDZAR, EURTRY"
          />
          
          <Button fullWidth className="mt-1">Guardar Configuracoes</Button>
        </Card>
      </div>
    </div>
  )
}
