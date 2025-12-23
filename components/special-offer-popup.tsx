"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { usePathname } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, X, CheckCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { useConfigStore } from "@/lib/config-service"

export default function SpecialOfferPopup() {
  const { config } = useConfigStore()
  const router = useRouter()
  const pathname = usePathname()

  const [isVisible, setIsVisible] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [hasBeenShown, setHasBeenShown] = useState(false)

  const offerConfig = config.specialOffer

  const safeOfferConfig = {
    ...offerConfig,
    title: offerConfig.title || "Oferta Especial",
    subtitle: offerConfig.subtitle || "Aproveite esta oportunidade",
    originalPrice: offerConfig.originalPrice || 999,
    offerPrice: offerConfig.offerPrice || 299,
    buttonText: offerConfig.buttonText || "Aproveitar Oferta",
    features: offerConfig.features || ["Acesso completo", "Suporte incluído"],
    backgroundColor: offerConfig.backgroundColor || "#000000",
    textColor: offerConfig.textColor || "#ffffff",
    redirectUrl: offerConfig.redirectUrl || "/",
  }

  useEffect(() => {
    // Só mostrar o popup na página inicial
    if (pathname !== "/") {
      return
    }

    if (!offerConfig?.enabled || !offerConfig.title || !offerConfig.originalPrice) {
      return null
    }

    const sessionKey = `offer-shown-${pathname}`
    if (sessionStorage.getItem(sessionKey)) {
      return
    }

    const timer = setTimeout(
      () => {
        setIsVisible(true)
        setHasBeenShown(true)
        sessionStorage.setItem(sessionKey, "true")
      },
      (offerConfig.delayToShow || 5) * 1000,
    )

    return () => clearTimeout(timer)
  }, [pathname, offerConfig])

  useEffect(() => {
    if (safeOfferConfig?.timeLimit) {
      setTimeLeft((safeOfferConfig.timeLimit || 24) * 60 * 60) // converter horas para segundos
    }
  }, [safeOfferConfig?.timeLimit])

  useEffect(() => {
    if (timeLeft > 0) {
      const interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            return (safeOfferConfig?.timeLimit || 24) * 60 * 60 // Reset
          }
          return prev - 1
        })
      }, 1000)

      return () => clearInterval(interval)
    }
  }, [timeLeft, safeOfferConfig?.timeLimit])

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
  }

  const handleClose = () => {
    setIsVisible(false)
  }

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }

  const handleGetOffer = () => {
    router.push(safeOfferConfig?.redirectUrl || "/jifu-education")
    handleClose()
  }

  if (!isVisible || !safeOfferConfig?.enabled) {
    return null
  }

  const discount = Math.round(
    ((safeOfferConfig.originalPrice - safeOfferConfig.offerPrice) / safeOfferConfig.originalPrice) * 100,
  )

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={handleBackdropClick}
    >
      <Card
        className="relative max-w-md w-full border-gold-500/50 shadow-2xl animate-in zoom-in-95 duration-300"
        style={{ backgroundColor: safeOfferConfig.backgroundColor }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 p-1 rounded-full bg-gray-800/50 hover:bg-gray-700/50 transition-colors z-10"
        >
          <X className="w-4 h-4 text-gray-300" />
        </button>

        <CardContent className="p-6" style={{ color: safeOfferConfig.textColor }}>
          {/* Header */}
          <div className="text-center mb-4">
            <div className="inline-flex items-center gap-2 bg-red-500/20 border border-red-500/50 rounded-full px-3 py-1 mb-3">
              <Clock className="w-3 h-3 text-red-400" />
              <span className="text-red-400 font-semibold text-xs">OFERTA LIMITADA</span>
            </div>

            <h2 className="text-xl font-bold mb-2">{safeOfferConfig.title}</h2>

            <p className="text-sm opacity-90 mb-3">{safeOfferConfig.subtitle}</p>

            {/* Pricing */}
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="text-center">
                <div className="text-gray-400 line-through text-sm">€{safeOfferConfig.originalPrice}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gold-400">€{safeOfferConfig.offerPrice}</div>
              </div>
              <div className="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">{discount}% OFF</div>
            </div>

            {/* Countdown */}
            <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-4">
              <div className="text-red-400 font-semibold text-xs mb-1">Expira em:</div>
              <div className="text-lg font-bold text-red-400">{formatTime(timeLeft)}</div>
            </div>
          </div>

          {/* Features */}
          <div className="space-y-2 mb-4">
            {safeOfferConfig.features?.slice(0, 4).map((feature, index) => (
              <div key={index} className="flex items-center gap-2">
                <CheckCircle className="w-3 h-3 text-green-400 flex-shrink-0" />
                <span className="text-xs">{feature}</span>
              </div>
            ))}
          </div>

          {/* Urgency */}
          {safeOfferConfig.urgencyText && (
            <div className="bg-orange-500/20 border border-orange-500/50 rounded-lg p-2 mb-4 text-center">
              <span className="text-orange-400 font-semibold text-xs">⚡ {safeOfferConfig.urgencyText}</span>
            </div>
          )}

          {/* CTA Button */}
          <Button
            onClick={handleGetOffer}
            className="w-full bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-black font-bold py-3 text-sm transform transition-transform duration-300 hover:scale-105"
          >
            {safeOfferConfig.buttonText}
          </Button>

          <div className="text-center mt-2">
            <span className="text-xs opacity-70">💳 Pagamento seguro | 🛡️ Garantia 30 dias</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
