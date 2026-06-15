"use client"

import { useState, useEffect, useCallback } from 'react'
import { X, Apple, Shield, Zap, Star, Tag, Loader2, CheckCircle2, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'

const REF_SPONSOR_KEY = 'mtm_ref_sponsor'

const PRODUCTS = [
  {
    id:       'pt.morethanmoney.app.member.monthly',
    label:    'Pack Membro',
    price:    '€35/mês',
    annual:   false,
    features: ['App MTM completa', 'Scanner GoldKiller', 'Copy Trade'],
    badge:    null,
    tier:     'standard',
  },
  {
    id:       'pt.morethanmoney.app.member.annual',
    label:    'Pack Membro Anual',
    price:    '€28/mês',
    annual:   true,
    features: ['App MTM completa', 'Scanner GoldKiller', 'Copy Trade'],
    badge:    '20% off',
    tier:     'standard',
  },
  {
    id:       'pt.morethanmoney.app.premium.monthly',
    label:    'Pack Premium',
    price:    '€65/mês',
    annual:   false,
    features: ['Tudo do Membro', 'Acesso ao site completo', 'DCA & Portfólios', 'Comunidade Skool'],
    badge:    'Popular',
    tier:     'premium',
  },
  {
    id:       'pt.morethanmoney.app.premium.annual',
    label:    'Pack Premium Anual',
    price:    '€52/mês',
    annual:   true,
    features: ['Tudo do Membro', 'Acesso ao site completo', 'DCA & Portfólios', 'Comunidade Skool'],
    badge:    '20% off',
    tier:     'premium',
  },
]

interface Props {
  onSuccess?: (result: { userId?: string; plan: string; category: string }) => void
  onClose?:   () => void
  preselect?: string
}

export default function ApplePaywall({ onSuccess, onClose, preselect }: Props) {
  const [selected,        setSelected]        = useState(preselect ?? PRODUCTS[0].id)
  const [couponCode,      setCouponCode]       = useState('')
  const [couponResult,    setCouponResult]     = useState<null | { valid: boolean; message: string; hasAppleOffer?: boolean; offerData?: Record<string, unknown> }>(null)
  const [validating,      setValidating]       = useState(false)
  const [purchasing,      setPurchasing]       = useState(false)
  const [step,            setStep]             = useState<'plan' | 'confirm' | 'success'>('plan')
  const [error,           setError]            = useState('')
  const [storeProducts,   setStoreProducts]    = useState<Record<string, { displayPrice: string }>>({})

  const plugin = typeof window !== 'undefined' ? (window as any).Capacitor?.Plugins?.MTMPayments : null

  // Buscar preços reais do App Store
  useEffect(() => {
    if (!plugin) return
    plugin.getProducts({ productIds: PRODUCTS.map(p => p.id) })
      .then((res: any) => {
        const map: Record<string, { displayPrice: string }> = {}
        ;(res.products ?? []).forEach((p: any) => { map[p.id] = { displayPrice: p.displayPrice } })
        setStoreProducts(map)
      })
      .catch(() => {})
  }, [plugin])

  // Capturar ref=username da URL (deep link de afiliado)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const ref = new URLSearchParams(window.location.search).get('ref')
    if (ref?.trim()) {
      localStorage.setItem(REF_SPONSOR_KEY, ref.trim().toLowerCase())
    }
  }, [])

  const validateCoupon = useCallback(async () => {
    const code = couponCode.trim().toUpperCase()
    if (!code) return
    setValidating(true)
    setCouponResult(null)
    try {
      const res  = await fetch('/api/apple/iap/sign-offer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ couponCode: code, productId: selected }),
      })
      const data = await res.json()
      if (data.valid) {
        setCouponResult({
          valid:         true,
          message:       data.hasAppleOffer ? '✓ Desconto aplicado!' : '✓ Cupão válido!',
          hasAppleOffer: data.hasAppleOffer,
          offerData:     data,
        })
      } else {
        setCouponResult({ valid: false, message: data.error ?? 'Cupão inválido' })
      }
    } catch {
      setCouponResult({ valid: false, message: 'Erro ao validar cupão' })
    } finally {
      setValidating(false)
    }
  }, [couponCode, selected])

  const handlePurchase = async () => {
    if (!plugin) {
      setError('Plugin IAP não disponível')
      return
    }
    setPurchasing(true)
    setError('')
    try {
      const purchaseOpts: Record<string, unknown> = { productId: selected }

      // Aplicar oferta promocional se cupão foi validado com sucesso
      if (couponResult?.valid && couponResult.hasAppleOffer && couponResult.offerData) {
        const od = couponResult.offerData as any
        purchaseOpts.offerIdentifier = od.offerIdentifier
        purchaseOpts.keyIdentifier   = od.keyIdentifier
        purchaseOpts.nonce           = od.nonce
        purchaseOpts.signature       = od.signature
        purchaseOpts.timestamp       = od.timestamp
      }

      const result: any = await plugin.purchase(purchaseOpts)

      if (result.pending) {
        setError('Compra pendente — aguarda aprovação parental e tenta novamente.')
        return
      }

      // Validar no servidor e activar subscrição
      const sponsorUsername =
        typeof window !== 'undefined'
          ? localStorage.getItem(REF_SPONSOR_KEY) || undefined
          : undefined

      const validateRes = await fetch('/api/apple/iap/validate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jwsToken:    result.jwsToken,
          couponCode:  couponCode.trim().toUpperCase() || undefined,
          sponsorUsername,
          environment: result.environment,
        }),
      })
      const validateData = await validateRes.json()

      if (validateData.requiresRegistration) {
        // Novo utilizador — continuar para registo
        setStep('success')
        onSuccess?.({ plan: validateData.plan, category: validateData.category, userId: undefined })
        return
      }

      if (validateData.success) {
        setStep('success')
        onSuccess?.({ userId: validateData.userId, plan: validateData.plan, category: validateData.category })
      } else {
        setError(validateData.error ?? 'Erro ao activar subscrição')
      }
    } catch (err: any) {
      if (err?.message === 'USER_CANCELLED') {
        // silencioso
      } else {
        setError(err?.message ?? 'Erro na compra. Tenta novamente.')
      }
    } finally {
      setPurchasing(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-sm bg-gray-900 rounded-t-3xl border border-white/10 p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-[#D2A63C] mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Subscrição activada!</h2>
          <p className="text-gray-400 text-sm mb-6">Inicia sessão ou cria a tua conta para continuar.</p>
          <Button
            className="w-full bg-[#D2A63C] text-black font-bold"
            onClick={() => { window.location.href = '/login?redirect=/app-mobile' }}
          >
            Continuar
          </Button>
        </div>
      </div>
    )
  }

  const selectedProduct = PRODUCTS.find(p => p.id === selected)

  return (
    <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-sm bg-gray-900 border border-white/10 rounded-t-3xl overflow-hidden max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#D2A63C]/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-[#D2A63C]" />
            </div>
            <span className="font-bold text-white text-base">More Than Money</span>
          </div>
          {onClose && (
            <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-white/10">
              <X className="w-4 h-4 text-gray-400" />
            </button>
          )}
        </div>

        <div className="px-5 pb-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-white">Escolhe o teu plano</h2>
            <p className="text-gray-400 text-xs mt-0.5">Cancela a qualquer momento na App Store</p>
          </div>

          {/* Planos */}
          <div className="space-y-2">
            {PRODUCTS.map(p => {
              const isSelected = p.id === selected
              const storePrice = storeProducts[p.id]?.displayPrice
              return (
                <button
                  key={p.id}
                  onClick={() => { setSelected(p.id); setCouponResult(null) }}
                  className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                    isSelected
                      ? 'border-[#D2A63C] bg-[#D2A63C]/10'
                      : 'border-white/10 bg-white/5 hover:bg-white/8'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-[#D2A63C]' : 'border-gray-600'}`}>
                        {isSelected && <div className="w-2 h-2 rounded-full bg-[#D2A63C]" />}
                      </div>
                      <div>
                        <span className="text-white text-sm font-semibold">{p.label}</span>
                        {p.badge && (
                          <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-[#D2A63C]/20 text-[#D2A63C] font-bold">
                            {p.badge}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[#D2A63C] font-bold text-sm">{storePrice ?? p.price}</span>
                  </div>
                  {isSelected && (
                    <ul className="mt-2 space-y-0.5 ml-6">
                      {p.features.map(f => (
                        <li key={f} className="text-gray-300 text-xs flex items-center gap-1.5">
                          <CheckCircle2 className="w-3 h-3 text-[#D2A63C] shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                </button>
              )
            })}
          </div>

          {/* Cupão */}
          <div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  value={couponCode}
                  onChange={e => { setCouponCode(e.target.value.toUpperCase()); setCouponResult(null) }}
                  placeholder="Código de cupão (opcional)"
                  className="w-full pl-8 pr-3 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-[#D2A63C]/50"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={validateCoupon}
                disabled={validating || !couponCode.trim()}
                className="border-white/20 text-white hover:bg-white/10 px-4"
              >
                {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aplicar'}
              </Button>
            </div>
            {couponResult && (
              <p className={`mt-1.5 text-xs ${couponResult.valid ? 'text-green-400' : 'text-red-400'}`}>
                {couponResult.message}
              </p>
            )}
          </div>

          {/* Erro */}
          {error && (
            <p className="text-red-400 text-xs bg-red-400/10 border border-red-400/20 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          {/* CTA */}
          <Button
            className="w-full h-12 bg-[#D2A63C] text-black font-bold text-base rounded-2xl flex items-center gap-2"
            onClick={handlePurchase}
            disabled={purchasing}
          >
            {purchasing ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                <Apple className="w-5 h-5" />
                Subscrever com Apple
              </>
            )}
          </Button>

          {/* Aviso legal */}
          <p className="text-[10px] text-gray-500 text-center leading-relaxed">
            A subscrição renova automaticamente. Gere na App Store → Definições → Subscrições.
            Pagamento cobrado na conta Apple ID ao confirmar a compra.
          </p>

          {/* Restore */}
          <button
            className="w-full text-center text-xs text-gray-500 underline py-1"
            onClick={async () => {
              if (!plugin) return
              try {
                const r: any = await plugin.restorePurchases()
                if (r?.restored?.length > 0) {
                  alert('Compras restauradas com sucesso.')
                } else {
                  alert('Nenhuma compra encontrada para restaurar.')
                }
              } catch {
                alert('Erro ao restaurar compras.')
              }
            }}
          >
            Restaurar compras anteriores
          </button>
        </div>
      </div>
    </div>
  )
}
