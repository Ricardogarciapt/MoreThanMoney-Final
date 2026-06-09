"use client"

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calculator, TrendingUp, DollarSign, AlertTriangle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface PositionCalculation {
  positionSize: number
  riskAmount: number
  pipValue: number
  pipDifference: number
  units: number
}

// Função para calcular valor do pip dinamicamente baseado no tipo de ativo
const getPipValueForPair = (pair: string, entryPrice?: number): number => {
  const pairUpper = pair.toUpperCase()
  
  // Metais - Ouro
  if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) {
    // MetaTrader padrão: 1 lote = 100 oz, 1 pip = $1 por lote (valor fixo)
    // Nota: O Myfxbook e outras fontes indicam $1 por pip para 1 lot de 100 oz
    return 1
  }
  
  // Metais - Prata
  if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) {
    // MetaTrader padrão: 1 lote = 5000 oz, valor do pip varia
    // Usar $5 como aproximação padrão
    return 5
  }
  
  // Forex - Maiores (USD como segunda moeda) = 10 USD por lote
  if (pairUpper === 'EUR/USD' || pairUpper === 'GBP/USD' || 
      pairUpper === 'AUD/USD' || pairUpper === 'NZD/USD' ||
      pairUpper === 'USD/CHF' || pairUpper === 'USD/CAD' ||
      pairUpper === 'EUR/GBP' || pairUpper === 'AUD/CAD' ||
      pairUpper === 'EUR/AUD' || pairUpper === 'EUR/CAD') {
    return 10
  }
  
  // Forex - JPY pairs = ~9 USD por lote (varia)
  if (pairUpper.includes('JPY')) {
    return 9.09
  }
  
  // Índices - USD por ponto
  if (pairUpper === 'US30') return 1    // 1 ponto = $1/lote
  if (pairUpper === 'NAS100') return 20 // 1 ponto = $20/lote
  if (pairUpper === 'SPX500') return 50 // 1 ponto = $50/lote
  if (pairUpper === 'UK100') return 10  // 1 ponto = £10/lote
  if (pairUpper === 'GER40') return 25  // 1 ponto = €25/lote
  
  // Crypto - USD por $1 de movimento
  if (pairUpper === 'BTC/USD' || pairUpper === 'BTCUSD' || 
      pairUpper === 'ETH/USD' || pairUpper === 'ETHUSD') {
    return 1
  }
  if (pairUpper === 'SOL/USD' || pairUpper === 'SOLUSD') {
    return 0.1
  }
  
  // Default: 10 USD por lote (forex padrão)
  return 10
}

export default function PositionCalculator() {
  const [accountBalance, setAccountBalance] = useState('10000')
  const [riskPercent, setRiskPercent] = useState('1')
  const [stopLossPips, setStopLossPips] = useState('20')
  const [currencyPair, setCurrencyPair] = useState('EUR/USD')
  const [entryPrice, setEntryPrice] = useState('')
  const [stopLossPrice, setStopLossPrice] = useState('')
  const [calculation, setCalculation] = useState<PositionCalculation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [calculatedPips, setCalculatedPips] = useState<number | null>(null)

  const popularPairs = [
    // Forex
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD',
    'USD/CAD', 'USD/CHF', 'EUR/GBP', 'EUR/JPY',
    // Metais
    'XAU/USD', 'XAG/USD',
    // Índices
    'US30', 'NAS100', 'SPX500', 'UK100',
    // Crypto
    'BTC/USD', 'ETH/USD', 'SOL/USD'
  ]

  // Obter pip factor baseado no tipo de ativo
  const getPipFactor = (pair: string): number => {
    const pairUpper = pair.toUpperCase()
    
    // JPY pairs
    if (pairUpper.includes('JPY')) return 100
    
    // Metais (Ouro e Prata)
    if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) return 100
    if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) return 100
    
    // Índices (geralmente 1 ponto)
    if (['US30', 'NAS100', 'SPX500', 'UK100', 'GER40'].includes(pairUpper)) return 1
    
    // Crypto (movimento de $1 = 1 "pip")
    if (pairUpper.includes('BTC') || pairUpper.includes('ETH') || pairUpper.includes('SOL')) return 1
    
    // Forex padrão (4 casas decimais)
    return 10000
  }

  // Obter label correto para a unidade de medida
  const getUnitLabel = (pair: string): string => {
    const pairUpper = pair.toUpperCase()
    
    // Metais
    if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) return 'Pontos (0.01)'
    if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) return 'Pontos (0.001)'
    
    // Índices
    if (['US30', 'NAS100', 'SPX500', 'UK100', 'GER40'].includes(pairUpper)) return 'Pontos'
    
    // Crypto
    if (pairUpper.includes('BTC') || pairUpper.includes('ETH') || pairUpper.includes('SOL')) return 'USD'
    
    // Forex
    if (pairUpper.includes('JPY')) return 'Pips (0.01)'
    
    // Forex padrão
    return 'Pips (0.0001)'
  }

  // Calcular pips automaticamente se Entry e Stop Loss forem inseridos
  useEffect(() => {
    if (entryPrice && stopLossPrice) {
      const entry = parseFloat(entryPrice)
      const stopLoss = parseFloat(stopLossPrice)
      
      if (!isNaN(entry) && !isNaN(stopLoss) && entry > 0 && stopLoss > 0) {
        const pipFactor = getPipFactor(currencyPair)
        const diff = Math.abs(entry - stopLoss) * pipFactor
        setCalculatedPips(Math.round(diff))
        setStopLossPips(Math.round(diff).toString())
      }
    }
  }, [entryPrice, stopLossPrice, currencyPair])

  // Calcular posição
  const calculatePosition = () => {
    setError(null)
    
    try {
      const balance = parseFloat(accountBalance)
      const risk = parseFloat(riskPercent)
      const pips = parseFloat(stopLossPips)
      
      if (isNaN(balance) || balance <= 0) {
        setError('Saldo da conta inválido')
        return
      }
      
      if (isNaN(risk) || risk <= 0 || risk > 100) {
        setError('Percentagem de risco inválida (0-100)')
        return
      }
      
      if (isNaN(pips) || pips <= 0) {
        setError('Stop Loss em pips inválido')
        return
      }
      
      // Calcular valor de risco
      const riskAmount = balance * (risk / 100)
      
      // Obter valor de pip (dinâmico para metais baseado no preço)
      const entry = entryPrice ? parseFloat(entryPrice) : undefined
      const pipValue = getPipValueForPair(currencyPair, entry)
      
      // Calcular diferença de pips
      const pipDifference = pips
      
      // Calcular tamanho da posição (lots)
      // Posição = Risco / (Pips × Valor do Pip por Lote)
      const positionSize = riskAmount / (pipDifference * pipValue)
      
      // Calcular unidades baseado no tipo de ativo
      const pairUpper = currencyPair.toUpperCase()
      let units: number
      
      // Metais: 1 lote = 100 oz (ouro) ou 5000 oz (prata)
      if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) {
        units = positionSize * 100 // Ouro: 100 oz por lote
      } else if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) {
        units = positionSize * 5000 // Prata: 5000 oz por lote
      }
      // Índices e Crypto: 1 lote = 1 contrato/unidade
      else if (['US30', 'NAS100', 'SPX500', 'UK100', 'GER40'].includes(pairUpper) ||
               pairUpper.includes('BTC') || pairUpper.includes('ETH') || pairUpper.includes('SOL')) {
        units = positionSize * 1
      }
      // Forex: 1 lote = 100,000 unidades
      else {
        units = positionSize * 100000
      }
      
      setCalculation({
        positionSize,
        riskAmount,
        pipValue,
        pipDifference,
        units
      })
    } catch (err) {
      setError('Erro ao calcular posição')
      console.error(err)
    }
  }

  return (
    <Card className="border-mtm-primary/30 bg-black/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-mtm-primary">
          <Calculator className="w-5 h-5" />
          Calculadora de Posição
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Informação de ajuda */}
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs text-gray-300">
            Calcula o tamanho de posição ideal baseado no teu risco máximo por trade
          </AlertDescription>
        </Alert>

        {/* Formulário */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Saldo da conta */}
          <div className="space-y-2">
            <Label htmlFor="balance" className="text-gray-300">Saldo da Conta</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 h-4 w-4 text-mtm-primary" />
              <Input
                id="balance"
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(e.target.value)}
                className="pl-10 bg-gray-900 border-gray-700 text-white"
                placeholder="10000"
              />
            </div>
          </div>

          {/* Percentagem de risco */}
          <div className="space-y-2">
            <Label htmlFor="risk" className="text-gray-300">Risco por Trade (%)</Label>
            <div className="relative">
              <TrendingUp className="absolute left-3 top-3 h-4 w-4 text-mtm-primary" />
              <Input
                id="risk"
                type="number"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                className="pl-10 bg-gray-900 border-gray-700 text-white"
                placeholder="1"
              />
            </div>
          </div>

          {/* Par de moedas */}
          <div className="space-y-2">
            <Label htmlFor="pair" className="text-gray-300">Par de Moedas</Label>
            <select
              id="pair"
              value={currencyPair}
              onChange={(e) => setCurrencyPair(e.target.value)}
              className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-mtm-primary"
            >
              {popularPairs.map(pair => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>

          {/* Stop Loss em pips */}
          <div className="space-y-2">
            <Label htmlFor="sl" className="text-gray-300">Stop Loss ({getUnitLabel(currencyPair)})</Label>
            <Input
              id="sl"
              type="number"
              value={stopLossPips}
              onChange={(e) => setStopLossPips(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white"
              placeholder="20"
            />
          </div>

          {/* Entry Price (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="entry" className="text-gray-300">Preço de Entrada (opcional)</Label>
            <Input
              id="entry"
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white"
              placeholder="1.0850"
              step="0.0001"
            />
          </div>

          {/* Stop Loss Price (opcional) */}
          <div className="space-y-2">
            <Label htmlFor="stop-loss" className="text-gray-300">Preço Stop Loss (opcional)</Label>
            <Input
              id="stop-loss"
              type="number"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(e.target.value)}
              className="bg-gray-900 border-gray-700 text-white"
              placeholder="1.0830"
              step="0.0001"
            />
          </div>
        </div>

        {/* Mostrar pips calculados */}
        {calculatedPips && (
          <div className="text-xs text-mtm-primary">
            ✓ {getUnitLabel(currencyPair)} calculados automaticamente: {calculatedPips}
          </div>
        )}

        {/* Botão calcular */}
        <Button
          onClick={calculatePosition}
          className="w-full btn-primary"
        >
          <Calculator className="w-4 h-4 mr-2" />
          Calcular Posição
        </Button>

        {/* Erro */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Resultados */}
        {calculation && (
          <div className="mt-6 space-y-4 p-4 bg-mtm-primary/10 border border-mtm-primary/30 rounded-lg">
            <h3 className="text-lg font-bold text-mtm-primary">Resultados da Posição</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">Tamanho da Posição</p>
                <p className="text-xl font-bold text-white">
                  {calculation.positionSize.toFixed(2)} <span className="text-mtm-primary">Lotes</span>
                </p>
              </div>
              
              <div>
                <p className="text-xs text-gray-400">Unidades</p>
                <p className="text-xl font-bold text-white">
                  {calculation.units.toFixed(0)}
                </p>
              </div>
              
              <div>
                <p className="text-xs text-gray-400">Valor do Risco</p>
                <p className="text-xl font-bold text-red-400">
                  ${calculation.riskAmount.toFixed(2)}
                </p>
              </div>
              
              <div>
                <p className="text-xs text-gray-400">Valor por Pip</p>
                <p className="text-xl font-bold text-green-400">
                  ${calculation.pipValue.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Resumo de risco/recompensa */}
            <div className="mt-4 p-3 bg-black/50 rounded border border-gray-700">
              <p className="text-xs text-gray-400 mb-2">Resumo de Risco</p>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Risco por trade:</span>
                <span className="text-sm font-bold text-red-400">
                  {riskPercent}% ({calculation.riskAmount.toFixed(2)} {currencyPair.split('/')[1]})
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm text-gray-300">Stop Loss:</span>
                <span className="text-sm font-bold text-orange-400">{stopLossPips} {getUnitLabel(currencyPair)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

