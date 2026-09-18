"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { supabase } from "@/lib/supabase"
import { getAccessToken } from "@/lib/auth-token"
import { semCripto } from "@/lib/ios-sem-cripto"
import Image from "next/image"
import {
  TrendingUp,
  TrendingDown,
  Plus,
  Bell,
  X,
  Loader2,
  BarChart3,
  Share2,
  Download,
  BellPlus,
  Target,
  Shield,
  RefreshCw
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { PortfolioRebalanceAssistant } from "@/components/mobile/portfolio-rebalance-assistant"
import { useT } from "@/components/i18n-provider"

interface MTMAsset {
  symbol: string
  name: string
  entry_price?: number
  current_price?: number
  target_1?: number
  target_2?: number
  target_3?: number
  stop_loss?: number
  performance_7d: number
  performance_30d: number
  performance_ytd: number
  status: "active" | "closed" | "watching"
  category: "crypto" | "stocks" | "forex"
  ai_validated?: boolean
}

interface PersonalAsset {
  id: string
  symbol: string
  name: string
  quantity: number
  purchase_price: number
  current_price: number
  performance: number
  alerts?: Alert[]
}

interface Alert {
  id: string
  type: "price_above" | "price_below"
  value: number
  active: boolean
}

const PERSONAL_PORTFOLIO_STORAGE = "mtm_personal_portfolio"

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
}

function serializeAlertsNotes(alerts: Alert[] | undefined): string | null {
  try {
    return JSON.stringify({ mtm_alerts: alerts?.length ? alerts : [] })
  } catch {
    return '{"mtm_alerts":[]}'
  }
}

function parseAlertsFromNotes(notes: string | null | undefined): Alert[] {
  if (!notes?.trim()) return []
  try {
    const j = JSON.parse(notes)
    if (Array.isArray(j.mtm_alerts)) return j.mtm_alerts
  } catch {
    /* ignore */
  }
  return []
}

function dbRowToPersonal(row: Record<string, unknown>): PersonalAsset {
  const purchase = Number(row.purchase_price ?? row.buy_price ?? 0)
  const current = Number(row.current_price ?? purchase)
  return {
    id: String(row.id),
    symbol: String(row.symbol ?? ""),
    name: String(row.name ?? ""),
    quantity: Number(row.quantity ?? 0),
    purchase_price: purchase,
    current_price: current,
    performance: purchase > 0 ? ((current - purchase) / purchase) * 100 : 0,
    alerts: parseAlertsFromNotes(typeof row.notes === "string" ? row.notes : null),
  }
}

export default function PortfolioMobile() {
  const t = useT()
  const [mounted, setMounted] = useState(false)
  const [mtmAssets, setMtmAssets] = useState<MTMAsset[]>([])
  const [personalAssets, setPersonalAssets] = useState<PersonalAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddAsset, setShowAddAsset] = useState(false)
  const [showSharePNL, setShowSharePNL] = useState(false)
  const pnlCardRef = useRef<HTMLDivElement>(null)
  const personalPersistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [newAsset, setNewAsset] = useState({
    symbol: "",
    name: "",
    quantity: 0,
    purchase_price: 0,
  })

  // Função para formatar preços de forma inteligente
  const formatPrice = (price: number | null | undefined): string => {
    if (!price || price === 0) return '-'
    
    // Para preços muito grandes (>1000): usar 2 decimais com separador
    if (price >= 1000) {
      return price.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    }
    
    // Para preços médios (1 a 1000): usar 2-4 decimais
    if (price >= 1) {
      return price.toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
    }
    
    // Para preços pequenos (<1): usar até 8 decimais, removendo zeros trailing
    if (price < 1) {
      const formatted = price.toFixed(8).replace(/\.?0+$/, '')
      return formatted
    }
    
    return price.toFixed(4)
  }

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    
    // Carregar tudo em paralelo para maior velocidade
    Promise.all([
      loadMTMPortfolio(),
      loadPersonalPortfolio()
    ])
    
    // Auto-sincronização completa a cada 2 minutos (dados + preços)
    const syncInterval = setInterval(() => {
      console.log('🔄 App Mobile: Auto-sincronização ativada...')
      loadMTMPortfolio() // Recarrega dados do Notion + preços (já inclui preços)
      updateAllPrices() // Atualiza apenas portfólio pessoal
    }, 120000)
    
    return () => clearInterval(syncInterval)
  }, [mounted])

  const updateAllPrices = async () => {
    try {
      console.log('💰 [MOBILE] Atualizando preços...')
      
      // Atualizar preços do MTM Portfolio via CoinGecko (mesma API que /portfolios)
      if (mtmAssets.length > 0) {
        const cryptoSymbols = mtmAssets.filter(a => a.category === 'crypto').map(a => a.symbol)
        
        if (cryptoSymbols.length > 0) {
          const symbolsParam = cryptoSymbols.join(',')
          console.log(`🔍 [MOBILE] Buscando preços para ${cryptoSymbols.length} crypto: ${symbolsParam.substring(0, 50)}...`)
          
          const response = await fetch(`/api/portfolio/prices-coingecko?symbols=${symbolsParam}`)
          console.log(`📡 [MOBILE] Response status: ${response.status} ${response.ok ? 'OK' : 'ERROR'}`)
          
          if (response.ok) {
            const data = await response.json()
            console.log(`📦 [MOBILE] Data recebida:`, { success: data.success, pricesCount: Object.keys(data.prices || {}).length })
            const pricesReceived = Object.keys(data.prices || {}).length
            console.log(`✅ [MOBILE] Preços CoinGecko recebidos: ${pricesReceived}/${cryptoSymbols.length}`)
            
            const updatedAssets = mtmAssets.map(asset => {
              if (asset.category === 'crypto' && data.prices?.[asset.symbol]) {
                const currentPrice = data.prices[asset.symbol]
                const entryPrice = asset.entry_price || currentPrice
                const performance = ((currentPrice - entryPrice) / entryPrice) * 100
                
                console.log(`💰 [MOBILE] ${asset.symbol}: $${currentPrice} (${performance.toFixed(1)}%)`)
                
                return {
                  ...asset,
                  current_price: currentPrice,
                  performance_7d: performance,
                  performance_30d: performance,
                  performance_ytd: performance
                }
              }
              return asset
            })
            
            setMtmAssets(updatedAssets)
            
            const withPrices = updatedAssets.filter(a => a.current_price).length
            console.log(`✅ [MOBILE] Total assets com preço após update: ${withPrices}/${updatedAssets.length}`)
          } else {
            console.error(`❌ [MOBILE] Erro ao buscar preços: ${response.status} ${response.statusText}`)
            const errorText = await response.text()
            console.error(`❌ [MOBILE] Response body:`, errorText)
          }
        } else {
          console.log('⚠️ [MOBILE] Nenhum crypto asset para atualizar preços')
        }
        
        // Atualizar ETFs via Yahoo Finance (se houver)
        const etfSymbols = mtmAssets.filter(a => a.category === 'stocks').map(a => a.symbol)
        if (etfSymbols.length > 0) {
          // ETFs já vêm com preço do /api/portfolio/mtm
          console.log(`📈 [MOBILE] ${etfSymbols.length} ETFs já têm preços`)
        }
      }
      
      // Atualizar preços do Personal Portfolio
      if (personalAssets.length > 0) {
        const symbols = personalAssets.map(a => a.symbol).join(',')
        const response = await fetch(`/api/portfolio/prices-coingecko?symbols=${symbols}`)
        
        if (response.ok) {
          const data = await response.json()
          const updatedAssets = personalAssets.map(asset => {
            const currentPrice = data.prices?.[asset.symbol] || asset.current_price
            const performance = ((currentPrice - asset.purchase_price) / asset.purchase_price) * 100
            return {
              ...asset,
              current_price: currentPrice,
              performance
            }
          })
          savePersonalPortfolio(updatedAssets)
        }
      }
      
      console.log('✅ [MOBILE] Preços atualizados com sucesso!')
    } catch (error) {
      console.error("❌ [MOBILE] Erro ao atualizar preços:", error)
    }
  }

  const loadMTMPortfolio = async () => {
    try {
      setLoading(true)
      console.log('📱 [MOBILE PORTFOLIO] Carregando dados MTM...')
      
      // Buscar dados do portfólio MTM (já inclui preços atualizados da API)
      // Buscar preços CoinGecko em paralelo para máxima velocidade
      const [portfolioResponse, pricesResponse] = await Promise.all([
        // App iOS: só a parte ETF do portefólio MTM (Apple 3.1.5(iii)) — ver lib/ios-sem-cripto.ts.
        fetch(semCripto() ? '/api/portfolio/mtm?type=etf' : '/api/portfolio/mtm?type=all'),
        // Preparar symbols para buscar preços em paralelo
        (async () => {
          // Pequeno delay para garantir que temos os symbols após primeiro fetch
          return null // Será atualizado depois
        })()
      ])
      
      const result = await portfolioResponse.json()
      
      if (result.success) {
        console.log('✅ [MOBILE PORTFOLIO] Dados carregados:', {
          cryptoCount: result.data.crypto?.assets?.length || 0,
          etfCount: result.data.etf?.assets?.length || 0,
          source: result.source
        })
        
        // Combinar crypto e ETF assets
        const fonteCripto: any = semCripto() ? [] : (result.data.crypto?.assets || [])
        const cryptoAssets = fonteCripto.map((asset: any) => {
          // Calcular performance real baseada em preços atuais
          const entryPrice = asset.entry_price || asset.current_price || 0
          const currentPrice = asset.current_price || entryPrice
          const realPerformance = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0
          
          return {
            symbol: asset.symbol,
            name: asset.criptomoeda,
            category: 'crypto',
            current_price: currentPrice,
            entry_price: entryPrice,
            // Usar TP/SL do Admin Panel se existirem, senão calcular dinamicamente
            target_1: asset.tp1_price || (currentPrice ? currentPrice * 1.30 : 0),
            target_2: asset.tp2_price || (currentPrice ? currentPrice * 1.75 : 0),
            target_3: asset.tp3_price || (currentPrice ? currentPrice * 2.50 : 0),
            stop_loss: asset.stop_loss_price || (currentPrice ? currentPrice * 0.85 : 0),
            // Usar performance real calculada, com fallback para pnl_percent
            performance_7d: realPerformance || asset.pnl_percent || 0,
            performance_30d: realPerformance || asset.potencial_crescimento_percent || 0,
            performance_ytd: realPerformance || asset.potencial_crescimento_percent || 0,
            status: 'active',
            ai_validated: asset.ai_validated || false
          }
        })
        
        const etfAssets = (result.data.etf?.assets || []).map((asset: any) => {
          // Calcular performance real baseada em preços atuais
          const entryPrice = asset.entry_price || asset.current_price || 0
          const currentPrice = asset.current_price || entryPrice
          const realPerformance = entryPrice > 0 ? ((currentPrice - entryPrice) / entryPrice) * 100 : 0
          
          return {
            symbol: asset.symbol,
            name: asset.etf,
            category: 'stocks',
            current_price: currentPrice,
            entry_price: entryPrice,
            // Usar TP/SL do Admin Panel se existirem, senão calcular dinamicamente
            target_1: asset.tp1_price || (currentPrice ? currentPrice * 1.30 : 0),
            target_2: asset.tp2_price || (currentPrice ? currentPrice * 1.50 : 0),
            target_3: asset.tp3_price || (currentPrice ? currentPrice * 2.00 : 0),
            stop_loss: asset.stop_loss_price || (currentPrice ? currentPrice * 0.90 : 0),
            // Usar performance real calculada, com fallback para pnl_percent
            performance_7d: realPerformance || asset.pnl_percent || 0,
            performance_30d: realPerformance || asset.crescimento_esperado_percent || 0,
            performance_ytd: realPerformance || asset.crescimento_esperado_percent || 0,
            status: 'active',
            ai_validated: asset.ai_validated || false
          }
        })
        
        const allAssets = [...cryptoAssets, ...etfAssets]
        
        console.log(`📱 [MOBILE PORTFOLIO] Assets processados: ${allAssets.length}`)
        console.log(`📱 [MOBILE PORTFOLIO] Assets com preço: ${allAssets.filter(a => a.current_price).length}/${allAssets.length}`)
        console.log(`📱 [MOBILE PORTFOLIO] Com TP/SL validado por IA: ${allAssets.filter(a => a.ai_validated).length}`)
        
        // Definir assets imediatamente (já têm preços da API)
        setMtmAssets(allAssets)
        setLoading(false)
        
        // Atualizar preços CoinGecko apenas para crypto que não tem preço ou precisa refresh
        const cryptoSymbols = cryptoAssets
          .filter(a => a.category === 'crypto' && (!a.current_price || result.source === 'Notion Database'))
          .map(a => a.symbol)
        
        if (cryptoSymbols.length > 0) {
          console.log(`💰 [MOBILE] Atualizando ${cryptoSymbols.length} preços via CoinGecko em background...`)
          
          // Buscar em background, sem bloquear UI
          fetch(`/api/portfolio/prices-coingecko?symbols=${cryptoSymbols.join(',')}`)
            .then(res => res.json())
            .then(pricesData => {
              if (pricesData.success && pricesData.prices) {
                const updatedAssets = allAssets.map(asset => {
                  if (asset.category === 'crypto' && pricesData.prices[asset.symbol]) {
                    const currentPrice = pricesData.prices[asset.symbol]
                    const entryPrice = asset.entry_price || currentPrice
                    return {
                      ...asset,
                      current_price: currentPrice,
                      target_1: asset.target_1 || currentPrice * 1.30,
                      target_2: asset.target_2 || currentPrice * 1.75,
                      target_3: asset.target_3 || currentPrice * 2.50,
                      stop_loss: asset.stop_loss || currentPrice * 0.85,
                    }
                  }
                  return asset
                })
                setMtmAssets(updatedAssets)
                console.log(`✅ [MOBILE] ${cryptoSymbols.length} preços CoinGecko atualizados`)
              }
            })
            .catch(err => console.error('❌ [MOBILE] Erro ao atualizar preços CoinGecko:', err))
        } else {
          console.log('✅ [MOBILE] Todos os preços já atualizados da API principal')
        }
      } else {
        setLoading(false)
      }
    } catch (error) {
      console.error("❌ [MOBILE PORTFOLIO] Erro ao carregar portfólio MTM:", error)
      setLoading(false)
    }
  }

  const flushPersonalToServer = async (assets: PersonalAsset[]) => {
    const session = await getAccessToken() // token (truthy = autenticado; verificação leve)
    if (!session) return
    await Promise.all(
      assets
        .filter((a) => isUuid(a.id))
        .map((a) =>
          fetch("/api/portfolio/personal", {
            method: "PUT",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: a.id,
              symbol: a.symbol,
              name: a.name,
              purchase_price: a.purchase_price,
              quantity: a.quantity,
              current_price: a.current_price,
              notes: serializeAlertsNotes(a.alerts),
            }),
          }).then((r) => {
            if (!r.ok) console.error("[portfolio] PUT falhou", a.symbol, r.status)
          })
        )
    )
  }

  const loadPersonalPortfolio = useCallback(async () => {
    try {
      const session = await getAccessToken() // token (truthy = autenticado; verificação leve)
      if (!session) {
        const saved = localStorage.getItem(PERSONAL_PORTFOLIO_STORAGE)
        setPersonalAssets(saved ? JSON.parse(saved) : [])
        return
      }

      const res = await fetch("/api/portfolio/personal", { credentials: "include" })
      if (res.status === 401) {
        const saved = localStorage.getItem(PERSONAL_PORTFOLIO_STORAGE)
        setPersonalAssets(saved ? JSON.parse(saved) : [])
        return
      }
      if (!res.ok) {
        console.error("[portfolio] GET remoto falhou", res.status)
        const saved = localStorage.getItem(PERSONAL_PORTFOLIO_STORAGE)
        setPersonalAssets(saved ? JSON.parse(saved) : [])
        return
      }

      const { assets } = await res.json()
      let mapped: PersonalAsset[] = (assets ?? []).map((r: Record<string, unknown>) =>
        dbRowToPersonal(r)
      )

      if (mapped.length === 0) {
        const saved = localStorage.getItem(PERSONAL_PORTFOLIO_STORAGE)
        if (saved) {
          try {
            const parsed = JSON.parse(saved) as PersonalAsset[]
            for (const a of parsed) {
              const pr = await fetch("/api/portfolio/personal", {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  symbol: a.symbol,
                  name: a.name,
                  quantity: a.quantity,
                  purchase_price: a.purchase_price,
                  current_price: a.current_price || a.purchase_price,
                  notes: serializeAlertsNotes(a.alerts),
                }),
              })
              if (!pr.ok) console.error("[portfolio] migração POST", a.symbol, pr.status)
            }
            localStorage.removeItem(PERSONAL_PORTFOLIO_STORAGE)
            const res2 = await fetch("/api/portfolio/personal", { credentials: "include" })
            if (res2.ok) {
              const j2 = await res2.json()
              mapped = (j2.assets ?? []).map((r: Record<string, unknown>) => dbRowToPersonal(r))
            }
          } catch (e) {
            console.error("[portfolio] migração localStorage → Supabase", e)
          }
        }
      }

      setPersonalAssets(mapped)
    } catch (e) {
      console.error("[portfolio] loadPersonalPortfolio", e)
      const saved = localStorage.getItem(PERSONAL_PORTFOLIO_STORAGE)
      setPersonalAssets(saved ? JSON.parse(saved) : [])
    }
  }, [])

  const savePersonalPortfolio = (next: PersonalAsset[]) => {
    setPersonalAssets(next)
    if (personalPersistTimerRef.current) clearTimeout(personalPersistTimerRef.current)
    personalPersistTimerRef.current = setTimeout(() => {
      personalPersistTimerRef.current = null
      void (async () => {
        const session = await getAccessToken() // token (truthy = autenticado; verificação leve)
        if (!session) {
          localStorage.setItem(PERSONAL_PORTFOLIO_STORAGE, JSON.stringify(next))
          return
        }
        await flushPersonalToServer(next)
      })()
    }, 450)
  }

  const handleAddAsset = async () => {
    if (!newAsset.symbol || !newAsset.name || newAsset.quantity <= 0 || newAsset.purchase_price <= 0) {
      alert(t("portfolio.fillFieldsError"))
      return
    }

    const session = await getAccessToken() // token (truthy = autenticado; verificação leve)

    if (session) {
      const res = await fetch("/api/portfolio/personal", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol: newAsset.symbol.toUpperCase(),
          name: newAsset.name,
          quantity: newAsset.quantity,
          purchase_price: newAsset.purchase_price,
          current_price: newAsset.purchase_price,
          notes: serializeAlertsNotes([]),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || t("portfolio.saveServerError"))
        return
      }
      setPersonalAssets((prev) => [...prev, dbRowToPersonal(data.asset as Record<string, unknown>)])
    } else {
      const asset: PersonalAsset = {
        id: Date.now().toString(),
        symbol: newAsset.symbol.toUpperCase(),
        name: newAsset.name,
        quantity: newAsset.quantity,
        purchase_price: newAsset.purchase_price,
        current_price: newAsset.purchase_price,
        performance: 0,
        alerts: [],
      }
      setPersonalAssets((prev) => {
        const next = [...prev, asset]
        localStorage.setItem(PERSONAL_PORTFOLIO_STORAGE, JSON.stringify(next))
        return next
      })
    }

    setNewAsset({ symbol: "", name: "", quantity: 0, purchase_price: 0 })
    setShowAddAsset(false)
  }

  const handleRemoveAsset = async (id: string) => {
    if (!confirm(t("portfolio.removeConfirm"))) return

    const session = await getAccessToken() // token (truthy = autenticado; verificação leve)
    if (session && isUuid(id)) {
      const res = await fetch(`/api/portfolio/personal?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        alert((data as { error?: string }).error || t("portfolio.removeServerError"))
        return
      }
    }

    setPersonalAssets((prev) => {
      const next = prev.filter((a) => a.id !== id)
      if (!session) {
        localStorage.setItem(PERSONAL_PORTFOLIO_STORAGE, JSON.stringify(next))
      }
      return next
    })
  }

  useEffect(() => {
    if (!mounted) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      void loadPersonalPortfolio()
    })
    return () => subscription.unsubscribe()
  }, [mounted, loadPersonalPortfolio])

  const handleAddAlert = (assetId: string, type: "price_above" | "price_below", value: number) => {
    const updated = personalAssets.map(asset => {
      if (asset.id === assetId) {
        const newAlert: Alert = {
          id: Date.now().toString(),
          type,
          value,
          active: true
        }
        return {
          ...asset,
          alerts: [...(asset.alerts || []), newAlert]
        }
      }
      return asset
    })
    savePersonalPortfolio(updated)
  }

  const createTPAlert = async (asset: PersonalAsset) => {
    const tp = asset.current_price * 1.20 // +20% TP
    try {
      const response = await fetch('/api/notifications/dca-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: asset.symbol,
          alert_type: 'take_profit',
          target_value: tp
        })
      })

      const result = await response.json()

      if (response.ok && result.alert) {
        handleAddAlert(asset.id, 'price_above', tp)
        alert(`${t("portfolio.tpAlertCreated")}\n\n${asset.symbol}\n${t("portfolio.currentPrice")}: $${formatPrice(asset.current_price)}\n${t("portfolio.targetLabel")}: $${formatPrice(tp)}\n\n${t("portfolio.tpAlertNotify")}`)
      } else {
        throw new Error(result.error || t("portfolio.unknownError"))
      }
    } catch (error: any) {
      console.error('❌ Erro ao criar TP alert:', error)
      alert(`${t("portfolio.alertCreateError")}\n${error.message || t("portfolio.checkConnection")}`)
    }
  }

  const createSLAlert = async (asset: PersonalAsset) => {
    const sl = asset.current_price * 0.85 // -15% SL
    try {
      const response = await fetch('/api/notifications/dca-alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: asset.symbol,
          alert_type: 'stop_loss',
          target_value: sl
        })
      })

      const result = await response.json()

      if (response.ok && result.alert) {
        handleAddAlert(asset.id, 'price_below', sl)
        alert(`${t("portfolio.slAlertCreated")}\n\n${asset.symbol}\n${t("portfolio.currentPrice")}: $${formatPrice(asset.current_price)}\n${t("portfolio.stopLoss")}: $${formatPrice(sl)}\n\n${t("portfolio.slAlertNotify")}`)
      } else {
        throw new Error(result.error || t("portfolio.unknownError"))
      }
    } catch (error: any) {
      console.error('❌ Erro ao criar SL alert:', error)
      alert(`${t("portfolio.alertCreateError")}\n${error.message || t("portfolio.checkConnection")}`)
    }
  }

  const handleRemoveAlert = (assetId: string, alertId: string) => {
    const updated = personalAssets.map(asset => {
      if (asset.id === assetId) {
        return {
          ...asset,
          alerts: asset.alerts?.filter(a => a.id !== alertId)
        }
      }
      return asset
    })
    savePersonalPortfolio(updated)
  }

  const calculateTotalValue = (asset: PersonalAsset) => {
    return asset.quantity * asset.current_price
  }

  const calculateTotalInvestment = (asset: PersonalAsset) => {
    return asset.quantity * asset.purchase_price
  }

  const calculateTotalPortfolioPerformance = () => {
    if (personalAssets.length === 0) return 0
    const totalInvested = personalAssets.reduce((sum, a) => sum + calculateTotalInvestment(a), 0)
    const totalCurrent = personalAssets.reduce((sum, a) => sum + calculateTotalValue(a), 0)
    return ((totalCurrent - totalInvested) / totalInvested) * 100
  }

  const calculatePNL = () => {
    if (personalAssets.length === 0) return { total: 0, percentage: 0 }
    const totalInvested = personalAssets.reduce((sum, a) => sum + calculateTotalInvestment(a), 0)
    const totalCurrent = personalAssets.reduce((sum, a) => sum + calculateTotalValue(a), 0)
    return {
      total: totalCurrent - totalInvested,
      percentage: ((totalCurrent - totalInvested) / totalInvested) * 100
    }
  }

  const calculateTotalMTMPerformance = () => {
    if (mtmAssets.length === 0) return 0
    const assetsWithPrice = mtmAssets.filter(a => a.current_price)
    if (assetsWithPrice.length === 0) return 0
    const totalPerformance = assetsWithPrice.reduce((sum, a) => sum + a.performance_7d, 0)
    return totalPerformance / assetsWithPrice.length
  }

  // Função fallback para copiar texto em browsers mais antigos
  const fallbackCopyTextToClipboard = (text: string) => {
    const textArea = document.createElement("textarea")
    textArea.value = text
    textArea.style.position = "fixed"
    textArea.style.left = "-999999px"
    textArea.style.top = "-999999px"
    document.body.appendChild(textArea)
    textArea.focus()
    textArea.select()
    
    try {
      const successful = document.execCommand('copy')
      if (successful) {
        alert(t("portfolio.textCopied"))
      } else {
        alert(t("portfolio.copyErrorManual") + " " + text)
      }
    } catch (err) {
      alert(t("portfolio.copyErrorManual") + " " + text)
    }
    
    document.body.removeChild(textArea)
  }

  const sharePNLCard = async (platform?: string) => {
    const pnl = calculatePNL()
    const message = `💼 ${t("portfolio.myMtmPortfolio")}

📊 ${t("portfolio.performanceTotal")}: ${pnl.percentage >= 0 ? '+' : ''}${pnl.percentage.toFixed(2)}%
💰 PNL: €${pnl.total.toFixed(2)}
📈 ${t("portfolio.shareAssets")}: ${personalAssets.length}

${t("portfolio.shareGeneratedVia")}
www.morethanmoney.com`

    const shareUrl = "https://morethanmoney.com"

    if (platform) {
      let url = ""
      switch (platform) {
        case "whatsapp":
          url = `https://wa.me/?text=${encodeURIComponent(message)}`
          break
        case "telegram":
          url = `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(message)}`
          break
        case "instagram":
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(message).then(() => {
              alert(t("portfolio.copiedInstagram"))
            }).catch(() => {
              fallbackCopyTextToClipboard(message)
            })
          } else {
            fallbackCopyTextToClipboard(message)
          }
          return
        case "facebook":
          url = `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(message)}`
          break
        case "twitter":
          url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}`
          break
      }
      if (url) window.open(url, '_blank')
    } else {
      // Usar Web Share API nativa se disponível
      if (navigator.share) {
        try {
          await navigator.share({
            title: t("portfolio.myMtmPortfolio"),
            text: message,
          })
        } catch (error) {
          console.log("Partilha cancelada")
        }
      } else {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(message).then(() => {
            alert(t("portfolio.statsCopied"))
          }).catch(() => {
            fallbackCopyTextToClipboard(message)
          })
        } else {
          fallbackCopyTextToClipboard(message)
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  return (
    <div className="bg-gradient-to-b from-black via-gray-950 to-black min-h-screen">
      {/* Header Dashboard Premium Fixo */}
      <div className="sticky top-0 z-50 bg-gradient-to-r from-[#D2A63C] via-[#BB8525] to-[#D2A63C] p-4 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-black/30 rounded-2xl flex items-center justify-center backdrop-blur-md">
              <Image src="/icon-512x512.png" alt="MTM" width={32} height={32} className="rounded-lg" />
            </div>
            <div>
              <h1 className="text-black text-xl font-black tracking-tight">{t("portfolio.dashboardTitle")}</h1>
              <p className="text-black/70 text-xs font-bold flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-black animate-pulse"></div>
                {t("portfolio.syncedRealtime")}
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              loadMTMPortfolio()
              loadPersonalPortfolio()
            }}
            size="sm"
            className="bg-black/20 hover:bg-black/30 text-black border-2 border-black/30 backdrop-blur-sm font-black"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="p-4">
        <Tabs defaultValue="mtm" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-gradient-to-r from-gray-900 to-black border-2 border-[#D2A63C]/30 mb-6 p-1 rounded-2xl">
            <TabsTrigger 
              value="mtm" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#D2A63C] data-[state=active]:to-[#BB8525] data-[state=active]:text-black data-[state=active]:font-black rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-[#D2A63C]/50"
            >
              💎 MTM Pro
            </TabsTrigger>{/* MTM Pro = brand term, not translated */}
            <TabsTrigger 
              value="personal" 
              className="data-[state=active]:bg-gradient-to-r data-[state=active]:from-[#D2A63C] data-[state=active]:to-[#BB8525] data-[state=active]:text-black data-[state=active]:font-black rounded-xl transition-all duration-300 data-[state=active]:shadow-lg data-[state=active]:shadow-[#D2A63C]/50"
            >
              📊 {t("portfolio.tabMyPortfolio")}
            </TabsTrigger>
          </TabsList>

        {/* MTM Portfolio */}
        <TabsContent value="mtm" className="space-y-4">
          {/* Stats Dashboard Premium */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <Card className="relative overflow-hidden bg-gradient-to-br from-green-900/40 to-black border-2 border-green-500/30">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-green-500/20 rounded-full blur-3xl"></div>
              <CardContent className="p-4 relative z-10">
                <p className="text-[10px] text-green-300 uppercase tracking-wider mb-1 font-black">{t("portfolio.totalAssets")}</p>
                <p className="text-3xl font-black text-white">{mtmAssets.length}</p>
                <p className="text-xs text-green-400 mt-1">
                  {mtmAssets.filter(a => a.current_price).length} {t("portfolio.synced")}
                </p>
              </CardContent>
            </Card>
            
            <Card className="relative overflow-hidden bg-gradient-to-br from-[#D2A63C]/40 to-black border-2 border-[#D2A63C]/30">
              <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#D2A63C]/20 rounded-full blur-3xl"></div>
              <CardContent className="p-4 relative z-10">
                <p className="text-[10px] text-[#D2A63C] uppercase tracking-wider mb-1 font-black">{t("portfolio.performance")}</p>
                <p className={`text-3xl font-black ${calculateTotalMTMPerformance() >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {calculateTotalMTMPerformance() >= 0 ? '+' : ''}{calculateTotalMTMPerformance().toFixed(1)}%
                </p>
                <p className="text-xs text-gray-400 mt-1">{t("portfolio.overallAverage")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Info Banner */}
          <div className="relative overflow-hidden bg-gradient-to-r from-blue-900/20 to-purple-900/20 border border-blue-500/30 rounded-2xl p-4 mb-4">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-pulse"></div>
            <div className="relative z-10 flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Target className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <p className="text-white font-bold text-sm mb-1">{t("portfolio.mtmPortfolioTitle")}</p>
                <p className="text-gray-300 text-xs leading-relaxed">
                  {t("portfolio.recommendedPre")} <span className="text-[#D2A63C] font-bold">{t("portfolio.recommendedHighlight")}</span> {t("portfolio.recommendedPost")}
                </p>
              </div>
            </div>
          </div>

          {mtmAssets.map((asset) => (
            <Card key={asset.symbol} className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-gray-900 to-black border-2 border-[#D2A63C]/40 hover:border-[#D2A63C] transition-all duration-300 shadow-lg hover:shadow-[#D2A63C]/30">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#D2A63C]/5 rounded-full blur-3xl"></div>
              <CardContent className="p-5 relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-[#D2A63C]/20 flex items-center justify-center border border-[#D2A63C]/40">
                      <span className="text-2xl">💰</span>
                    </div>
                    <div>
                      <h3 className="font-black text-white text-xl">{asset.symbol}</h3>
                      <p className="text-sm text-gray-400 font-medium">{asset.name}</p>
                      <span className="text-[10px] text-[#D2A63C] uppercase tracking-wider font-bold">{asset.category}</span>
                    </div>
                  </div>
                  <div className={`px-4 py-2 rounded-2xl text-xs font-black border-2 backdrop-blur-sm ${
                    asset.status === 'active' ? 'bg-green-500/20 text-green-300 border-green-500/50' :
                    asset.status === 'closed' ? 'bg-blue-500/20 text-blue-300 border-blue-500/50' :
                    'bg-gray-500/20 text-gray-300 border-gray-500/50'
                  }`}>
                    {asset.status === 'active' ? t("portfolio.statusActive") : asset.status === 'closed' ? t("portfolio.statusClosed") : t("portfolio.statusWatching")}
                  </div>
                </div>

                {/* Preços - Design Premium com Indicador de Status */}
                <div className="relative bg-gradient-to-br from-black/90 via-gray-900/80 to-black/90 p-5 rounded-3xl mb-4 border-2 border-white/20 overflow-hidden shadow-xl">
                  {/* Animated Background */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-[#D2A63C]/10 to-transparent animate-pulse"></div>
                  <div className="absolute inset-0 opacity-5" style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, white 1px, transparent 0)`,
                    backgroundSize: '16px 16px'
                  }}></div>
                  
                  <div className="relative z-10">
                    {/* Header com Performance */}
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#D2A63C] animate-pulse"></div>
                        <p className="text-[11px] text-white/80 uppercase tracking-widest font-black">{t("portfolio.livePrices")}</p>
                      </div>
                      {asset.current_price && asset.entry_price && (
                        <div className={`px-3 py-1 rounded-full text-xs font-black ${
                          asset.current_price >= asset.entry_price 
                            ? 'bg-green-500/20 text-green-300 border border-green-500/50' 
                            : 'bg-red-500/20 text-red-300 border border-red-500/50'
                        }`}>
                          {asset.current_price >= asset.entry_price ? '▲' : '▼'} 
                          {(((asset.current_price - asset.entry_price) / asset.entry_price) * 100).toFixed(1)}%
                        </div>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {/* Entry Price */}
                      <div>
                        <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5">
                          {t("portfolio.entry")}
                        </p>
                        <p className="font-black text-white text-2xl tracking-tight">
                          ${formatPrice(asset.entry_price)}
                        </p>
                      </div>
                      
                      {/* Current Price */}
                      <div>
                        <p className="text-[11px] text-gray-500 uppercase tracking-widest mb-2 font-bold flex items-center gap-1.5">
                          {t("portfolio.current")}
                          {!asset.current_price && (
                            <Loader2 className="w-3 h-3 animate-spin text-[#D2A63C]" />
                          )}
                        </p>
                        {asset.current_price ? (
                          <p className="font-black text-[#D2A63C] text-2xl tracking-tight">
                            ${formatPrice(asset.current_price)}
                          </p>
                        ) : (
                          <p className="font-black text-gray-600 text-2xl tracking-tight animate-pulse">
                            {t("portfolio.loading")}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Alvos - Design Ultra Premium com Gradiente */}
                {asset.target_1 && (
                  <div className="relative bg-gradient-to-br from-gray-900/90 via-black/80 to-gray-900/90 p-5 rounded-3xl mb-4 border-2 border-green-500/30 overflow-hidden shadow-2xl">
                    {/* Background Animado */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-green-500/20 rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute bottom-0 left-0 w-24 h-24 bg-[#D2A63C]/20 rounded-full blur-3xl animate-pulse delay-700"></div>
                    
                    <div className="relative z-10">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center shadow-lg">
                            <span className="text-base">🎯</span>
                          </div>
                          <p className="text-xs text-white uppercase tracking-widest font-black">{t("portfolio.exitStrategy")}</p>
                        </div>
                        {asset.ai_validated && (
                          <div className="relative">
                            <div className="absolute inset-0 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] blur-md opacity-50 animate-pulse"></div>
                            <span className="relative text-[10px] px-3 py-1.5 bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black rounded-full font-black flex items-center gap-1.5 shadow-lg">
                              <span className="animate-pulse">🤖</span> {t("portfolio.aiValidated")}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      {/* Targets com Progresso Visual */}
                      <div className="space-y-3">
                        <div className="relative group">
                          <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-green-600/20 rounded-2xl blur-sm group-hover:blur-md transition-all"></div>
                          <div className="relative flex items-center justify-between p-3.5 bg-green-500/15 rounded-2xl border-2 border-green-500/40 backdrop-blur-sm hover:border-green-400/60 transition-all">
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-lg bg-green-500/30 flex items-center justify-center">
                                <span className="text-xs">1️⃣</span>
                              </div>
                              <span className="text-xs text-green-200 font-bold uppercase tracking-wide">{t("portfolio.takeProfit1")}</span>
                            </div>
                            <span className="text-green-300 font-black text-lg tracking-tight">${formatPrice(asset.target_1)}</span>
                          </div>
                        </div>
                        
                        {asset.target_2 && (
                          <div className="relative group">
                            <div className="absolute inset-0 bg-gradient-to-r from-green-400/20 to-green-500/20 rounded-2xl blur-sm group-hover:blur-md transition-all"></div>
                            <div className="relative flex items-center justify-between p-3.5 bg-green-400/15 rounded-2xl border-2 border-green-400/40 backdrop-blur-sm hover:border-green-300/60 transition-all">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-green-400/30 flex items-center justify-center">
                                  <span className="text-xs">2️⃣</span>
                                </div>
                                <span className="text-xs text-green-200 font-bold uppercase tracking-wide">{t("portfolio.takeProfit2")}</span>
                              </div>
                              <span className="text-green-300 font-black text-lg tracking-tight">${formatPrice(asset.target_2)}</span>
                            </div>
                          </div>
                        )}
                        
                        {asset.target_3 && (
                          <div className="relative group">
                            <div className="absolute inset-0 bg-gradient-to-r from-green-300/20 to-green-400/20 rounded-2xl blur-sm group-hover:blur-md transition-all"></div>
                            <div className="relative flex items-center justify-between p-3.5 bg-green-300/15 rounded-2xl border-2 border-green-300/40 backdrop-blur-sm hover:border-green-200/60 transition-all">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-green-300/30 flex items-center justify-center">
                                  <span className="text-xs">3️⃣</span>
                                </div>
                                <span className="text-xs text-green-200 font-bold uppercase tracking-wide">{t("portfolio.takeProfit3")}</span>
                              </div>
                              <span className="text-green-300 font-black text-lg tracking-tight">${formatPrice(asset.target_3)}</span>
                            </div>
                          </div>
                        )}
                        
                        {/* Stop Loss com Destaque Especial */}
                        {asset.stop_loss && (
                          <div className="relative group mt-4">
                            <div className="absolute inset-0 bg-gradient-to-r from-red-500/30 to-red-600/30 rounded-2xl blur-md group-hover:blur-lg transition-all"></div>
                            <div className="relative flex items-center justify-between p-4 bg-gradient-to-br from-red-500/20 to-red-600/20 rounded-2xl border-2 border-red-500/50 backdrop-blur-sm hover:border-red-400/70 transition-all shadow-lg">
                              <div className="flex items-center gap-2">
                                <div className="w-8 h-8 rounded-xl bg-red-500/40 flex items-center justify-center shadow-lg animate-pulse">
                                  <span className="text-base">🛑</span>
                                </div>
                                <span className="text-sm text-red-200 font-black uppercase tracking-wide">{t("portfolio.stopLoss")}</span>
                              </div>
                              <span className="text-red-300 font-black text-xl tracking-tight">${formatPrice(asset.stop_loss)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Exit 1, 2 e 3 - Design Moderno */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="relative bg-gradient-to-br from-green-500/20 to-green-600/20 p-3 rounded-2xl border-2 border-green-500/40 overflow-hidden">
                    <div className="absolute inset-0 bg-green-500/10 animate-pulse"></div>
                    <p className="text-[10px] text-green-300 uppercase tracking-wider mb-1.5 font-bold relative z-10">{t("portfolio.exit1")}</p>
                    <p className="font-black text-green-300 text-base relative z-10">
                      {asset.target_1 ? `$${formatPrice(asset.target_1)}` : '-'}
                    </p>
                  </div>
                  <div className="relative bg-gradient-to-br from-green-400/20 to-green-500/20 p-3 rounded-2xl border-2 border-green-400/40 overflow-hidden">
                    <div className="absolute inset-0 bg-green-400/10 animate-pulse"></div>
                    <p className="text-[10px] text-green-300 uppercase tracking-wider mb-1.5 font-bold relative z-10">{t("portfolio.exit2")}</p>
                    <p className="font-black text-green-300 text-base relative z-10">
                      {asset.target_2 ? `$${formatPrice(asset.target_2)}` : '-'}
                    </p>
                  </div>
                  <div className="relative bg-gradient-to-br from-green-300/20 to-green-400/20 p-3 rounded-2xl border-2 border-green-300/40 overflow-hidden">
                    <div className="absolute inset-0 bg-green-300/10 animate-pulse"></div>
                    <p className="text-[10px] text-green-300 uppercase tracking-wider mb-1.5 font-bold relative z-10">{t("portfolio.exit3")}</p>
                    <p className="font-black text-green-300 text-base relative z-10">
                      {asset.target_3 ? `$${formatPrice(asset.target_3)}` : '-'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Personal Portfolio */}
        <TabsContent value="personal" className="space-y-3">
          <Card className="bg-gradient-to-br from-[#D2A63C] to-[#BB8525] border-none">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-black/80">{t("portfolio.totalPerformance")}</p>
                  <h3 className={`text-2xl font-bold ${
                    calculateTotalPortfolioPerformance() >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {calculateTotalPortfolioPerformance() >= 0 ? '+' : ''}
                    {calculateTotalPortfolioPerformance().toFixed(2)}%
                  </h3>
                </div>
                <div className="flex gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button 
                        size="sm"
                        className="bg-black text-white hover:bg-black/90"
                      >
                        <Share2 className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="bg-gray-800 border-gray-700">
                      <DropdownMenuItem
                        onClick={() => sharePNLCard('whatsapp')}
                        className="text-white hover:bg-green-500/20 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>
                        WhatsApp
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sharePNLCard('telegram')}
                        className="text-white hover:bg-blue-500/20 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                        Telegram
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sharePNLCard('instagram')}
                        className="text-white hover:bg-pink-500/20 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z"/></svg>
                        Instagram
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sharePNLCard('facebook')}
                        className="text-white hover:bg-blue-600/20 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                        Facebook
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sharePNLCard('twitter')}
                        className="text-white hover:bg-sky-500/20 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                        X (Twitter)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => sharePNLCard()}
                        className="text-white hover:bg-gray-700 cursor-pointer flex items-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                        {t("portfolio.copyText")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Dialog open={showAddAsset} onOpenChange={setShowAddAsset}>
                    <DialogTrigger asChild>
                      <Button size="sm" className="bg-black text-white hover:bg-black/90">
                        <Plus className="w-4 h-4 mr-1" />
                        {t("portfolio.add")}
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="bg-gray-900 border-[#D2A63C]/30 text-white w-[90%] max-w-md">
                      <DialogHeader>
                        <DialogTitle className="text-[#D2A63C]">{t("portfolio.addAsset")}</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label>{t("portfolio.symbol")}</Label>
                          <Input
                            placeholder={semCripto() ? "Ex: SPY" : t("portfolio.symbolPlaceholder")}
                            value={newAsset.symbol}
                            onChange={(e) => setNewAsset({ ...newAsset, symbol: e.target.value })}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                        <div>
                          <Label>{t("portfolio.name")}</Label>
                          <Input
                            placeholder={semCripto() ? "Ex: S&P 500" : t("portfolio.namePlaceholder")}
                            value={newAsset.name}
                            onChange={(e) => setNewAsset({ ...newAsset, name: e.target.value })}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                        <div>
                          <Label>{t("portfolio.quantity")}</Label>
                          <Input
                            type="number"
                            step="0.0001"
                            placeholder="0.00"
                            value={newAsset.quantity || ''}
                            onChange={(e) => setNewAsset({ ...newAsset, quantity: parseFloat(e.target.value) || 0 })}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                        <div>
                          <Label>{t("portfolio.purchasePrice")}</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0.00"
                            value={newAsset.purchase_price || ''}
                            onChange={(e) => setNewAsset({ ...newAsset, purchase_price: parseFloat(e.target.value) || 0 })}
                            className="bg-gray-800 border-gray-700 text-white"
                          />
                        </div>
                        <Button
                          onClick={handleAddAsset}
                          className="w-full bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black hover:opacity-90"
                        >
                          {t("portfolio.addAsset")}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* PNL Summary */}
              {personalAssets.length > 0 && (
                <div ref={pnlCardRef} className="bg-black/30 p-3 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-black/80">{t("portfolio.pnlTotal")}</span>
                    <span className={`font-bold text-lg ${calculatePNL().total >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      €{calculatePNL().total.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <PortfolioRebalanceAssistant
            personalPositions={personalAssets.map((a) => ({
              symbol: a.symbol,
              name: a.name,
              quantity: a.quantity,
              avg_price: a.purchase_price,
            }))}
            mtmSnapshot={mtmAssets.map((a) => ({
              symbol: a.symbol,
              name: a.name,
              entry_price: a.entry_price,
              current_price: a.current_price,
              category: a.category,
            }))}
            onImportToPortfolio={async (rows) => {
              const session = await getAccessToken() // token (truthy = autenticado; verificação leve)
              if (session) {
                const created: PersonalAsset[] = []
                for (const r of rows) {
                  const res = await fetch("/api/portfolio/personal", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      symbol: r.symbol.toUpperCase(),
                      name: r.name || r.symbol,
                      quantity: r.quantity,
                      purchase_price: r.avg_price,
                      current_price: r.avg_price,
                      notes: serializeAlertsNotes([]),
                    }),
                  })
                  const data = await res.json()
                  if (res.ok && data.asset) {
                    created.push(dbRowToPersonal(data.asset as Record<string, unknown>))
                  } else {
                    console.error("[portfolio] import IA POST", r.symbol, data)
                  }
                }
                if (created.length) {
                  setPersonalAssets((prev) => [...prev, ...created])
                }
                return
              }
              const additions: PersonalAsset[] = rows.map((r, i) => ({
                id: `ai_import_${Date.now()}_${i}`,
                symbol: r.symbol.toUpperCase(),
                name: r.name || r.symbol,
                quantity: r.quantity,
                purchase_price: r.avg_price,
                current_price: r.avg_price,
                performance: 0,
                alerts: [],
              }))
              setPersonalAssets((prev) => {
                const next = [...prev, ...additions]
                localStorage.setItem(PERSONAL_PORTFOLIO_STORAGE, JSON.stringify(next))
                return next
              })
            }}
          />

          {personalAssets.length === 0 ? (
            <Card className="bg-gray-900 border-[#D2A63C]/30">
              <CardContent className="p-8 text-center">
                <BarChart3 className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400 mb-4">{t("portfolio.emptyState")}</p>
                <Button
                  onClick={() => setShowAddAsset(true)}
                  className="bg-gradient-to-r from-[#D2A63C] to-[#BB8525] text-black hover:opacity-90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t("portfolio.addFirstAsset")}
                </Button>
              </CardContent>
            </Card>
          ) : (
            personalAssets.map((asset) => (
              <Card key={asset.id} className="bg-gray-900 border-[#D2A63C]/30">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-bold text-white text-lg">{asset.symbol}</h3>
                      <p className="text-sm text-gray-400">{asset.name}</p>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveAsset(asset.id)}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/20"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div className="bg-gray-800 p-2 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">{t("portfolio.quantity")}</p>
                      <p className="font-semibold text-white">{asset.quantity}</p>
                    </div>
                    <div className="bg-gray-800 p-2 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">{t("portfolio.valorization")}</p>
                      <p className={`font-bold ${asset.performance >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {asset.performance >= 0 ? '+' : ''}{asset.performance.toFixed(2)}%
                      </p>
                    </div>
                    <div className="bg-gray-800 p-2 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">{t("portfolio.purchasePriceShort")}</p>
                      <p className="font-semibold text-white">${asset.purchase_price.toLocaleString()}</p>
                    </div>
                    <div className="bg-gray-800 p-2 rounded-lg">
                      <p className="text-xs text-gray-400 mb-1">{t("portfolio.currentPrice")}</p>
                      <p className="font-semibold text-white">${asset.current_price.toLocaleString()}</p>
                    </div>
                  </div>

                  {/* Botões de Alertas TP e SL */}
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <Button
                      onClick={() => createTPAlert(asset)}
                      size="sm"
                      className="bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/30 h-9"
                    >
                      <Target className="h-3 w-3 mr-1.5" />
                      {t("portfolio.tpAlertBtn")}
                    </Button>
                    <Button
                      onClick={() => createSLAlert(asset)}
                      size="sm"
                      className="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 h-9"
                    >
                      <Shield className="h-3 w-3 mr-1.5" />
                      {t("portfolio.slAlertBtn")}
                    </Button>
                  </div>

                  {/* Alerts */}
                  <div className="border-t border-gray-800 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-400 flex items-center gap-1">
                        <Bell className="w-3 h-3" />
                        {t("portfolio.alerts")}
                      </p>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="ghost" className="text-[#D2A63C] hover:text-[#BB8525] h-6 px-2">
                            <Plus className="w-3 h-3" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="bg-gray-900 border-[#D2A63C]/30 text-white w-[90%] max-w-md">
                          <DialogHeader>
                            <DialogTitle className="text-[#D2A63C]">{t("portfolio.newAlert")}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <Button
                              onClick={() => {
                                const value = prompt(t("portfolio.priceAbovePrompt"))
                                if (value) handleAddAlert(asset.id, "price_above", parseFloat(value))
                              }}
                              className="w-full bg-green-500/20 text-green-400 hover:bg-green-500/30"
                            >
                              <TrendingUp className="w-4 h-4 mr-2" />
                              {t("portfolio.alertAbove")}
                            </Button>
                            <Button
                              onClick={() => {
                                const value = prompt(t("portfolio.priceBelowPrompt"))
                                if (value) handleAddAlert(asset.id, "price_below", parseFloat(value))
                              }}
                              className="w-full bg-red-500/20 text-red-400 hover:bg-red-500/30"
                            >
                              <TrendingDown className="w-4 h-4 mr-2" />
                              {t("portfolio.alertBelow")}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                    {asset.alerts && asset.alerts.length > 0 ? (
                      <div className="space-y-1">
                        {asset.alerts.map((alert) => (
                          <div key={alert.id} className="flex items-center justify-between bg-gray-800 px-2 py-1 rounded text-xs">
                            <span className="text-gray-300">
                              {alert.type === 'price_above' ? '📈' : '📉'} ${alert.value.toLocaleString()}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveAlert(asset.id, alert.id)}
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-300"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500 text-center py-2">{t("portfolio.noAlerts")}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
      </div>
    </div>
  )
}
