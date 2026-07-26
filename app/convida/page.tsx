"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { getAccessToken } from "@/lib/auth-token"
import { Gift, Copy, Check, Share2, Users, Loader2 } from "lucide-react"

interface RefData {
  code: string
  link: string
  referrals: number
  daysEarned: number
  referrerDays: number
  referredTrialDays: number
}

export default function ConvidaPage() {
  const [data, setData] = useState<RefData | null>(null)
  const [loading, setLoading] = useState(true)
  const [needLogin, setNeedLogin] = useState(false)
  const [copied, setCopied] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) { setNeedLogin(true); return }
      const r = await fetch("/api/referral", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" })
      if (r.status === 401) { setNeedLogin(true); return }
      const j = await r.json()
      if (j?.code) setData(j)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const copy = async () => {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.link)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch { /* ignore */ }
  }

  const shareText = data
    ? `Estou a usar a MoreThanMoney — educação e trading a sério. Entra com o meu link e ganhas ${data.referredTrialDays} dias de Premium grátis 👉 ${data.link}`
    : ""
  const waHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`
  const nativeShare = async () => {
    if (data && (navigator as any).share) {
      try { await (navigator as any).share({ title: "MoreThanMoney", text: shareText, url: data.link }) } catch { /* cancel */ }
    } else {
      copy()
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/20 text-amber-600">
          <Gift className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Convida &amp; Ganha</h1>
          <p className="text-sm text-neutral-500">Partilha a MoreThanMoney e ganha Premium.</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 py-16 text-neutral-500">
          <Loader2 className="h-5 w-5 animate-spin" /> A carregar…
        </div>
      )}

      {!loading && needLogin && (
        <div className="rounded-2xl border p-6 text-center">
          <p className="mb-4 text-neutral-600">Inicia sessão para obteres o teu link de convite.</p>
          <Link href="/login"><Button>Iniciar sessão</Button></Link>
        </div>
      )}

      {!loading && data && (
        <div className="space-y-5">
          {/* Oferta */}
          <div className="rounded-2xl border bg-gradient-to-br from-amber-50 to-white p-5">
            <p className="text-sm text-neutral-700">
              Por cada amigo que entrar pelo teu link:
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="text-2xl font-bold text-amber-600">+{data.referrerDays} dias</div>
                <div className="text-xs text-neutral-500">Premium para ti</div>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <div className="text-2xl font-bold text-emerald-600">{data.referredTrialDays} dias</div>
                <div className="text-xs text-neutral-500">Trial grátis p/ o amigo</div>
              </div>
            </div>
          </div>

          {/* Link */}
          <div className="rounded-2xl border p-4">
            <div className="mb-2 text-xs font-medium uppercase text-neutral-400">O teu link</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-neutral-100 px-3 py-2 text-sm">{data.link}</code>
              <Button variant="outline" size="icon" onClick={copy} title="Copiar">
                {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
            <div className="mt-3 flex gap-2">
              <Button className="flex-1" onClick={nativeShare}>
                <Share2 className="mr-1 h-4 w-4" /> Partilhar
              </Button>
              <a className="flex-1" href={waHref} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full">WhatsApp</Button>
              </a>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center justify-between rounded-2xl border p-4">
            <div className="flex items-center gap-2 text-neutral-600">
              <Users className="h-5 w-5" /> Amigos que entraram
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold">{data.referrals}</div>
              <div className="text-xs text-neutral-500">+{data.daysEarned} dias Premium ganhos</div>
            </div>
          </div>

          <p className="text-center text-xs text-neutral-400">
            A recompensa é creditada quando o amigo cria conta pelo teu link. 1 por pessoa.
          </p>
        </div>
      )}
    </div>
  )
}
