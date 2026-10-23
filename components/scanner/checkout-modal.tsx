"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowRight, Loader2, X } from "lucide-react"
import { supabase } from "@/lib/supabase"
import type { ScannerProduct } from "@/lib/scanners-catalog"

interface CheckoutModalProps {
  product: ScannerProduct
  scannerName: string
  onClose: () => void
}

export function CheckoutModal({ product, scannerName, onClose }: CheckoutModalProps) {
  const [tvUsername, setTvUsername] = useState("")
  const [guestEmail, setGuestEmail] = useState("")
  const [sponsorCode, setSponsorCode] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [isGuest, setIsGuest] = useState<boolean | null>(null) // null = a verificar

  // Verificar se está logado ao abrir o modal
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsGuest(!session?.access_token)
    })
  }, [])

  const handleCheckout = async () => {
    if (isGuest === null) {
      setError("A verificar sessão… tenta novamente dentro de um segundo.")
      return
    }
    if (!tvUsername.trim()) {
      setError("O teu nome de utilizador do TradingView é necessário para activar o acesso.")
      return
    }
    setError("")
    setIsLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()

      if (session?.access_token) {
        // Utilizador autenticado — usa endpoint com auth
        const res = await fetch("/api/stripe/create-checkout-session", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            planId: product.planId,
            tradingview_username: tvUsername.trim(),
            sponsorCode: sponsorCode.trim() || '',
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(data.error || "Erro ao iniciar pagamento. Tenta novamente.")
          setIsLoading(false)
          return
        }
        window.location.href = data.url
      } else {
        const email = guestEmail.trim()
        if (!email) {
          setError("O teu email é necessário para receberes a confirmação de pagamento.")
          setIsLoading(false)
          return
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          setError("Email inválido. Verifica e tenta novamente.")
          setIsLoading(false)
          return
        }
        // Visitante sem conta — usa endpoint guest
        const res = await fetch("/api/stripe/scanner-checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planId: product.planId,
            email,
            tvUsername: tvUsername.trim(),
            sponsorCode: sponsorCode.trim() || '',
          }),
        })
        const data = await res.json()
        if (!res.ok || !data.url) {
          setError(data.error || "Erro ao iniciar pagamento. Tenta novamente.")
          setIsLoading(false)
          return
        }
        window.location.href = data.url
      }
    } catch {
      setError("Erro de rede. Verifica a tua ligação e tenta novamente.")
      setIsLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6 relative">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <h3 className="text-xl font-bold text-white mb-1">{scannerName}</h3>
          <div className="text-2xl font-black text-[#D2A63C]">{product.price}</div>
          {product.priceNote && <div className="text-xs text-gray-400 mt-0.5">{product.priceNote}</div>}
        </div>

        {/* Campo email — apenas para visitantes sem conta */}
        {isGuest && (
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              O teu email *
            </label>
            <Input
              type="email"
              value={guestEmail}
              onChange={e => setGuestEmail(e.target.value)}
              placeholder="exemplo@email.com"
              className="bg-gray-800 border-gray-700 text-white"
              disabled={isLoading}
            />
            <p className="text-xs text-gray-500 mt-1.5">
              Recebes a confirmação de compra e as instruções de acesso neste email.
            </p>
          </div>
        )}

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Nome de utilizador TradingView *
          </label>
          <Input
            value={tvUsername}
            onChange={e => setTvUsername(e.target.value)}
            placeholder="O teu @username no TradingView"
            className="bg-gray-800 border-gray-700 text-white"
            disabled={isLoading}
          />
          <p className="text-xs text-gray-500 mt-1.5">
            Após o pagamento recebes um email com as instruções de acesso ao script no TradingView.
          </p>
        </div>

        <div className="mb-5">
          <label className="block text-sm font-medium text-gray-400 mb-2">
            Código do patrocinador <span className="text-gray-600 font-normal">(opcional)</span>
          </label>
          <Input
            value={sponsorCode}
            onChange={e => setSponsorCode(e.target.value)}
            placeholder="Username de quem te indicou"
            className="bg-gray-800 border-gray-700 text-white"
            disabled={isLoading}
          />
        </div>

        {error && (
          <div className="mb-4 text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg p-3">
            {error}
          </div>
        )}

        <Button
          onClick={handleCheckout}
          disabled={isLoading || isGuest === null}
          className="w-full bg-[#D2A63C] hover:bg-[#BB8525] text-black font-bold text-base"
          size="lg"
        >
          {isGuest === null ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A verificar sessão...</>
          ) : isLoading ? (
            <><Loader2 className="mr-2 h-5 w-5 animate-spin" />A processar...</>
          ) : (
            <>Avançar para Pagamento <ArrowRight className="ml-2 h-5 w-5" /></>
          )}
        </Button>

        <p className="text-xs text-gray-500 text-center mt-3">
          Pagamento seguro via Stripe · SSL encriptado
        </p>
      </div>
    </div>
  )
}
