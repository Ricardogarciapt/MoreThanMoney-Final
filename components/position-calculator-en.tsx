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

// Function to calculate pip value dynamically based on asset type
const getPipValueForPair = (pair: string, entryPrice?: number): number => {
  const pairUpper = pair.toUpperCase()
  
  // Metals - Gold
  if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) {
    // MetaTrader standard: 1 lot = 100 oz, 1 pip = $1 per lot (fixed value)
    return 1
  }
  
  // Metals - Silver
  if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) {
    // MetaTrader standard: 1 lot = 5000 oz, pip value varies
    // Use $5 as standard approximation
    return 5
  }
  
  // Forex - Majors (USD as second currency) = 10 USD per lot
  if (pairUpper === 'EUR/USD' || pairUpper === 'GBP/USD' || 
      pairUpper === 'AUD/USD' || pairUpper === 'NZD/USD' ||
      pairUpper === 'USD/CHF' || pairUpper === 'USD/CAD' ||
      pairUpper === 'EUR/GBP' || pairUpper === 'AUD/CAD' ||
      pairUpper === 'EUR/AUD' || pairUpper === 'EUR/CAD') {
    return 10
  }
  
  // Forex - JPY pairs = ~9 USD per lot (varies)
  if (pairUpper.includes('JPY')) {
    return 9.09
  }
  
  // Indices - USD per point
  if (pairUpper === 'US30') return 1    // 1 point = $1/lot
  if (pairUpper === 'NAS100') return 20 // 1 point = $20/lot
  if (pairUpper === 'SPX500') return 50 // 1 point = $50/lot
  if (pairUpper === 'UK100') return 10  // 1 point = £10/lot
  if (pairUpper === 'GER40') return 25  // 1 point = €25/lot
  
  // Crypto - USD per $1 movement
  if (pairUpper === 'BTC/USD' || pairUpper === 'BTCUSD' || 
      pairUpper === 'ETH/USD' || pairUpper === 'ETHUSD') {
    return 1
  }
  if (pairUpper === 'SOL/USD' || pairUpper === 'SOLUSD') {
    return 0.1
  }
  
  // Default: 10 USD per lot (standard forex)
  return 10
}

export default function PositionCalculatorEN() {
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
    // Metals
    'XAU/USD', 'XAG/USD',
    // Indices
    'US30', 'NAS100', 'SPX500', 'UK100',
    // Crypto
    'BTC/USD', 'ETH/USD', 'SOL/USD'
  ]

  // Get pip factor based on asset type
  const getPipFactor = (pair: string): number => {
    const pairUpper = pair.toUpperCase()
    
    // JPY pairs
    if (pairUpper.includes('JPY')) return 100
    
    // Metals (Gold and Silver)
    if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) return 100
    if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) return 100
    
    // Indices (usually 1 point)
    if (['US30', 'NAS100', 'SPX500', 'UK100', 'GER40'].includes(pairUpper)) return 1
    
    // Crypto ($1 movement = 1 "pip")
    if (pairUpper.includes('BTC') || pairUpper.includes('ETH') || pairUpper.includes('SOL')) return 1
    
    // Standard forex (4 decimal places)
    return 10000
  }

  // Get correct label for measurement unit
  const getUnitLabel = (pair: string): string => {
    const pairUpper = pair.toUpperCase()
    
    // Metals
    if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) return 'Points (0.01)'
    if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) return 'Points (0.001)'
    
    // Indices
    if (['US30', 'NAS100', 'SPX500', 'UK100', 'GER40'].includes(pairUpper)) return 'Points'
    
    // Crypto
    if (pairUpper.includes('BTC') || pairUpper.includes('ETH') || pairUpper.includes('SOL')) return 'USD'
    
    // Forex
    if (pairUpper.includes('JPY')) return 'Pips (0.01)'
    
    // Standard forex
    return 'Pips (0.0001)'
  }

  // Calculate pips automatically if Entry and Stop Loss are entered
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

  // Calculate position
  const calculatePosition = () => {
    setError(null)
    
    try {
      const balance = parseFloat(accountBalance)
      const risk = parseFloat(riskPercent)
      const pips = parseFloat(stopLossPips)
      
      if (isNaN(balance) || balance <= 0) {
        setError('Invalid account balance')
        return
      }
      
      if (isNaN(risk) || risk <= 0 || risk > 100) {
        setError('Invalid risk percentage (0-100)')
        return
      }
      
      if (isNaN(pips) || pips <= 0) {
        setError('Invalid Stop Loss in pips')
        return
      }
      
      // Calculate risk amount
      const riskAmount = balance * (risk / 100)
      
      // Get pip value (dynamic for metals based on price)
      const entry = entryPrice ? parseFloat(entryPrice) : undefined
      const pipValue = getPipValueForPair(currencyPair, entry)
      
      // Calculate pip difference
      const pipDifference = pips
      
      // Calculate position size (lots)
      // Position = Risk / (Pips × Pip Value per Lot)
      const positionSize = riskAmount / (pipDifference * pipValue)
      
      // Calculate units based on asset type
      const pairUpper = currencyPair.toUpperCase()
      let units: number
      
      // Metals: 1 lot = 100 oz (gold) or 5000 oz (silver)
      if (pairUpper.includes('XAU') || pairUpper.includes('GOLD')) {
        units = positionSize * 100 // Gold: 100 oz per lot
      } else if (pairUpper.includes('XAG') || pairUpper.includes('SILVER')) {
        units = positionSize * 5000 // Silver: 5000 oz per lot
      }
      // Indices and Crypto: 1 lot = 1 contract/unit
      else if (['US30', 'NAS100', 'SPX500', 'UK100', 'GER40'].includes(pairUpper) ||
               pairUpper.includes('BTC') || pairUpper.includes('ETH') || pairUpper.includes('SOL')) {
        units = positionSize * 1
      }
      // Forex: 1 lot = 100,000 units
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
      setError('Error calculating position')
      console.error(err)
    }
  }

  return (
    <Card className="border-primary/30 bg-black/50" style={{ borderColor: '#015BF9' + '50', backgroundColor: '#040507' + '80' }}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2" style={{ color: '#015BF9', fontFamily: "'Gonero ExtExp Bolo', sans-serif" }}>
          <Calculator className="w-5 h-5" />
          Position Size Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Help information */}
        <Alert className="bg-amber-500/10 border-amber-500/30">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription className="text-xs" style={{ color: '#EDECED' }}>
            Calculate the ideal position size based on your maximum risk per trade
          </AlertDescription>
        </Alert>

        {/* Form */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Account balance */}
          <div className="space-y-2">
            <Label htmlFor="balance" style={{ color: '#EDECED' }}>Account Balance</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-3 h-4 w-4" style={{ color: '#015BF9' }} />
              <Input
                id="balance"
                type="number"
                value={accountBalance}
                onChange={(e) => setAccountBalance(e.target.value)}
                className="pl-10"
                style={{ backgroundColor: '#1200DE', borderColor: '#015BF9' + '60', color: '#FFFFFF' }}
                placeholder="10000"
              />
            </div>
          </div>

          {/* Risk percentage */}
          <div className="space-y-2">
            <Label htmlFor="risk" style={{ color: '#EDECED' }}>Risk per Trade (%)</Label>
            <div className="relative">
              <TrendingUp className="absolute left-3 top-3 h-4 w-4" style={{ color: '#015BF9' }} />
              <Input
                id="risk"
                type="number"
                value={riskPercent}
                onChange={(e) => setRiskPercent(e.target.value)}
                className="pl-10"
                style={{ backgroundColor: '#1200DE', borderColor: '#015BF9' + '60', color: '#FFFFFF' }}
                placeholder="1"
              />
            </div>
          </div>

          {/* Currency pair */}
          <div className="space-y-2">
            <Label htmlFor="pair" style={{ color: '#EDECED' }}>Currency Pair</Label>
            <select
              id="pair"
              value={currencyPair}
              onChange={(e) => setCurrencyPair(e.target.value)}
              className="w-full px-3 py-2 rounded-md focus:outline-none focus:ring-2"
              style={{ 
                backgroundColor: '#1200DE', 
                borderColor: '#015BF9' + '60', 
                color: '#FFFFFF',
                fontFamily: "'Gonero ExtExp Regular', sans-serif"
              }}
            >
              {popularPairs.map(pair => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>

          {/* Stop Loss in pips */}
          <div className="space-y-2">
            <Label htmlFor="sl" style={{ color: '#EDECED' }}>Stop Loss ({getUnitLabel(currencyPair)})</Label>
            <Input
              id="sl"
              type="number"
              value={stopLossPips}
              onChange={(e) => setStopLossPips(e.target.value)}
              style={{ backgroundColor: '#1200DE', borderColor: '#015BF9' + '60', color: '#FFFFFF' }}
              placeholder="20"
            />
          </div>

          {/* Entry Price (optional) */}
          <div className="space-y-2">
            <Label htmlFor="entry" style={{ color: '#EDECED' }}>Entry Price (optional)</Label>
            <Input
              id="entry"
              type="number"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              style={{ backgroundColor: '#1200DE', borderColor: '#015BF9' + '60', color: '#FFFFFF' }}
              placeholder="1.0850"
              step="0.0001"
            />
          </div>

          {/* Stop Loss Price (optional) */}
          <div className="space-y-2">
            <Label htmlFor="stop-loss" style={{ color: '#EDECED' }}>Stop Loss Price (optional)</Label>
            <Input
              id="stop-loss"
              type="number"
              value={stopLossPrice}
              onChange={(e) => setStopLossPrice(e.target.value)}
              style={{ backgroundColor: '#1200DE', borderColor: '#015BF9' + '60', color: '#FFFFFF' }}
              placeholder="1.0830"
              step="0.0001"
            />
          </div>
        </div>

        {/* Show calculated pips */}
        {calculatedPips && (
          <div className="text-xs" style={{ color: '#015BF9' }}>
            ✓ {getUnitLabel(currencyPair)} calculated automatically: {calculatedPips}
          </div>
        )}

        {/* Calculate button */}
        <Button
          onClick={calculatePosition}
          className="w-full"
          style={{ 
            backgroundColor: '#015BF9', 
            borderColor: '#015BF9', 
            color: '#FFFFFF',
            fontFamily: "'Gonero ExtExp Regular', sans-serif"
          }}
        >
          <Calculator className="w-4 h-4 mr-2" />
          Calculate Position
        </Button>

        {/* Error */}
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Results */}
        {calculation && (
          <div className="mt-6 space-y-4 p-4 rounded-lg" style={{ backgroundColor: '#015BF9' + '10', borderColor: '#015BF9' + '30', borderWidth: '1px', borderStyle: 'solid' }}>
            <h3 className="text-lg font-bold" style={{ color: '#015BF9', fontFamily: "'Gonero ExtExp Bolo', sans-serif" }}>Position Results</h3>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs" style={{ color: '#EDECED' + '80' }}>Position Size</p>
                <p className="text-xl font-bold" style={{ color: '#FFFFFF' }}>
                  {calculation.positionSize.toFixed(2)} <span style={{ color: '#015BF9' }}>Lots</span>
                </p>
              </div>
              
              <div>
                <p className="text-xs" style={{ color: '#EDECED' + '80' }}>Units</p>
                <p className="text-xl font-bold" style={{ color: '#FFFFFF' }}>
                  {calculation.units.toFixed(0)}
                </p>
              </div>
              
              <div>
                <p className="text-xs" style={{ color: '#EDECED' + '80' }}>Risk Amount</p>
                <p className="text-xl font-bold" style={{ color: '#FF4D4D' }}>
                  ${calculation.riskAmount.toFixed(2)}
                </p>
              </div>
              
              <div>
                <p className="text-xs" style={{ color: '#EDECED' + '80' }}>Pip Value</p>
                <p className="text-xl font-bold" style={{ color: '#00C084' }}>
                  ${calculation.pipValue.toFixed(2)}
                </p>
              </div>
            </div>

            {/* Risk/reward summary */}
            <div className="mt-4 p-3 rounded border" style={{ backgroundColor: '#040507' + '80', borderColor: '#015BF9' + '60' }}>
              <p className="text-xs mb-2" style={{ color: '#EDECED' + '80' }}>Risk Summary</p>
              <div className="flex items-center justify-between">
                <span className="text-sm" style={{ color: '#EDECED' }}>Risk per trade:</span>
                <span className="text-sm font-bold" style={{ color: '#FF4D4D' }}>
                  {riskPercent}% (${calculation.riskAmount.toFixed(2)})
                </span>
              </div>
              <div className="flex items-center justify-between mt-1">
                <span className="text-sm" style={{ color: '#EDECED' }}>Stop Loss:</span>
                <span className="text-sm font-bold" style={{ color: '#FFA500' }}>{stopLossPips} {getUnitLabel(currencyPair)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}


