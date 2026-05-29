"use client"

import { useEffect, useMemo, useState } from "react"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type AccessState = {
  requested: boolean
  enabled: boolean
  requested_at: string | null
}

export function MtmAutoAccessGate({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  const [access, setAccess] = useState<AccessState | null>(null)
  const [loadingAccess, setLoadingAccess] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      if (!user?.id) {
        if (mounted) {
          setLoadingAccess(false)
          setAccess(null)
        }
        return
      }
      setLoadingAccess(true)
      try {
        const res = await fetch("/api/mtmauto/access", { cache: "no-store" })
        const data = await res.json()
        if (!mounted) return
        if (res.ok) {
          setAccess({
            requested: Boolean(data.requested),
            enabled: Boolean(data.enabled),
            requested_at: data.requested_at || null,
          })
        } else {
          setAccess({ requested: false, enabled: false, requested_at: null })
        }
      } finally {
        if (mounted) setLoadingAccess(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [user?.id])

  const requestAccess = async () => {
    setSubmitting(true)
    try {
      const res = await fetch("/api/mtmauto/access", { method: "POST" })
      const data = await res.json()
      if (res.ok) {
        setAccess((prev) => ({
          requested: true,
          enabled: prev?.enabled ?? false,
          requested_at: data.requested_at || new Date().toISOString(),
        }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const requestedLabel = useMemo(() => {
    if (!access?.requested_at) return ""
    try {
      return new Date(access.requested_at).toLocaleString("pt-PT")
    } catch {
      return access.requested_at
    }
  }, [access?.requested_at])

  if (isLoading || loadingAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--mtm-bg)]">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-[var(--mtm-green)]" />
          <p className="text-sm text-[var(--mtm-text2)]">A validar acesso ao MTM Auto...</p>
        </div>
      </div>
    )
  }

  if (access?.enabled) return <>{children}</>

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--mtm-bg)] px-4">
      <Card className="w-full max-w-xl border-[var(--mtm-border2)] bg-[var(--mtm-bg2)]">
        <CardHeader>
          <CardTitle className="text-[var(--mtm-text)]">Acesso MTM Auto</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-[var(--mtm-text2)]">
            O teu registo no site já está válido. Para usar cópias e estratégias no MTM Auto, precisas de aprovação da equipa.
          </p>

          {access?.requested ? (
            <div className="rounded-md border border-[var(--mtm-border)] bg-[var(--mtm-bg3)] p-3 text-sm text-[var(--mtm-text2)]">
              Pedido já enviado{requestedLabel ? ` em ${requestedLabel}` : ""}. Vais receber acesso após validação no painel admin.
            </div>
          ) : (
            <Button
              onClick={requestAccess}
              disabled={submitting}
              className="bg-[var(--mtm-cyan)] text-black hover:brightness-110"
            >
              {submitting ? "A enviar..." : "Pedir acesso ao MTM Auto"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
