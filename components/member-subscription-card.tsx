"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

/**
 * Gestão de subscrição consciente da plataforma (Stripe / Apple / manual).
 * - Stripe  → Portal de faturação Stripe (mudar pack, cartão, cancelar).
 * - Apple   → gerido na App Store (não se muda pela web — Guideline 3.1.1).
 * - manual/coupon/skool/grátis → /upgrade (checkout Stripe no site/Android).
 * No app iOS nativo NUNCA se abre checkout/portal Stripe (compliance) — remete p/ App Store.
 */

export type SubscriptionInfo = {
  memberCategory?: string | null
  subscriptionPlan?: string | null
  subscriptionPlatform?: string | null
  subscriptionStatus?: string | null
  subscriptionExpiresAt?: string | null
  billingCycle?: string | null
  hasStripeCustomer?: boolean
  /** PrimeVerse: esconde qualquer CTA de upgrade/portal (Member sem upsell) */
  hideUpgrade?: boolean
}

const PLAN_LABEL: Record<string, string> = {
  premium: "💎 Premium",
  app_member: "📱 Membro",
  standard: "📱 Membro",
  vip: "⭐ VIP",
  iq: "🎓 IQ",
  skool: "📚 Skool",
}

const PLATFORM_LABEL: Record<string, string> = {
  stripe: "Cartão (Stripe)",
  app_store: "App Store (Apple)",
  google_play: "Google Play",
  manual: "MTM (manual)",
  coupon: "Cupão",
  partnership: "Parceria",
  skool: "Skool",
}

function isIOSNative(): boolean {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : ""
  return /MTMNativeApp/i.test(ua) && /iPhone|iPad|iPod/i.test(ua)
}

export function MemberSubscriptionCard(info: SubscriptionInfo) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const cat = (info.memberCategory || "standard").toLowerCase()
  const platform = (info.subscriptionPlatform || "manual").toLowerCase()
  const status = (info.subscriptionStatus || "inactive").toLowerCase()
  const isPremium = cat === "premium" || cat === "vip"
  const isApple = platform === "app_store"
  const isPlay = platform === "google_play"
  const isActive = status === "active"
  const planText = PLAN_LABEL[cat] || PLAN_LABEL[info.subscriptionPlan || ""] || "📱 Membro"

  const openStripePortal = async () => {
    setBusy(true)
    setErr(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch("/api/stripe/create-portal-session", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token || ""}` },
      })
      const j = await res.json()
      if (res.ok && j.url) {
        window.location.href = j.url
      } else {
        setErr(j.error || "Não foi possível abrir o portal.")
      }
    } catch {
      setErr("Erro de rede.")
    } finally {
      setBusy(false)
    }
  }

  const goUpgrade = () => {
    if (isIOSNative()) {
      setErr("Na app, gere a subscrição em Mais → Subscrição.")
      return
    }
    window.location.href = "/upgrade"
  }

  return (
    <div className="rounded-2xl border border-[#D2A63C]/25 bg-gray-950/70 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-gray-500">O teu plano</p>
          <p className="text-xl font-bold text-white">{planText}</p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${
            isActive ? "bg-green-600/20 text-green-400" : "bg-gray-700 text-gray-300"
          }`}
        >
          {isActive ? "Ativo" : status === "canceled" ? "Cancelado" : "Inativo"}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-black/30 px-3 py-2">
          <p className="text-gray-500">Gestão</p>
          <p className="font-semibold text-white">{PLATFORM_LABEL[platform] || platform}</p>
        </div>
        {info.subscriptionExpiresAt && (
          <div className="rounded-lg bg-black/30 px-3 py-2">
            <p className="text-gray-500">{isActive ? "Renova/expira" : "Expirou"}</p>
            <p className="font-semibold text-white">
              {new Date(info.subscriptionExpiresAt).toLocaleDateString("pt-PT")}
            </p>
          </div>
        )}
      </div>

      {/* Ações conscientes da plataforma */}
      <div className="space-y-2">
        {isApple ? (
          <div className="space-y-2">
            <p className="text-xs text-gray-400">
              A tua subscrição é gerida pela <b className="text-white">App Store</b>. Para mudar de pack ou cancelar,
              usa o iPhone: <b>Definições → [o teu nome] → Subscrições</b>.
            </p>
            {!isIOSNative() && (
              <a
                href="https://apps.apple.com/account/subscriptions"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-bold text-black"
              >
                Gerir na App Store
              </a>
            )}
          </div>
        ) : isPlay ? (
          <a
            href="https://play.google.com/store/account/subscriptions"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-bold text-black"
          >
            Gerir na Google Play
          </a>
        ) : info.hasStripeCustomer && !isIOSNative() ? (
          <button
            type="button"
            onClick={openStripePortal}
            disabled={busy}
            className="rounded-lg bg-[#D2A63C] px-4 py-2 text-sm font-bold text-black disabled:opacity-50"
          >
            {busy ? "A abrir…" : "Gerir subscrição · mudar pack ou cancelar"}
          </button>
        ) : null}

        {/* Cross-sell: quem não é Premium vê upgrade (exceto Apple, que sobe na App Store) */}
        {!info.hideUpgrade && !isPremium && !isApple && !isPlay && (
          <div>
            <button
              type="button"
              onClick={goUpgrade}
              className="rounded-lg border border-[#D2A63C]/50 px-4 py-2 text-sm font-semibold text-[#D2A63C]"
            >
              ⬆︎ Fazer upgrade para Premium
            </button>
          </div>
        )}
        {!isPremium && isApple && (
          <p className="text-xs text-gray-500">Para subir para Premium, faz upgrade em Definições → Subscrições (App Store).</p>
        )}
      </div>

      {err && <p className="text-xs text-red-400">{err}</p>}
    </div>
  )
}
