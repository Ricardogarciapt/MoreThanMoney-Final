"use client"

import Link from "next/link"
import { ExternalLink, Monitor, Loader2, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

const REMOTE_DESKTOP_URL = (process.env.NEXT_PUBLIC_REMOTE_DESKTOP_URL || "").trim()

export default function AdminDesktopRemotoPage() {
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState<{
    configured?: boolean
    reachable?: boolean
    status?: number
    error?: string
  } | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setChecking(true)
      try {
        const res = await fetch("/api/admin/desktop-remoto/status", {
          credentials: "same-origin",
          cache: "no-store",
        })
        const json = await res.json().catch(() => ({}))
        if (!cancelled) setStatus(json)
      } catch {
        if (!cancelled) setStatus({ configured: Boolean(REMOTE_DESKTOP_URL), reachable: false, error: "Falha de rede." })
      } finally {
        if (!cancelled) setChecking(false)
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-zinc-950 to-black text-white p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center gap-2">
          <Monitor className="h-5 w-5 text-[#D2A63C]" />
          <h1 className="text-lg sm:text-xl font-semibold text-[#D2A63C]">Desktop remoto (VPS)</h1>
        </div>

        <div className="rounded-xl border border-[#D2A63C]/20 bg-gray-950/80 p-4 space-y-3">
          <p className="text-sm text-gray-300">
            Acesso remoto ao Ubuntu por interface web (RDP/noVNC/Guacamole), protegido pela área de admin.
          </p>
          {REMOTE_DESKTOP_URL ? (
            <div className="flex flex-wrap gap-2">
              <Link href={REMOTE_DESKTOP_URL} target="_blank" rel="noreferrer">
                <Button className="bg-[#D2A63C] text-black hover:bg-[#BB8525]">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Abrir desktop remoto
                </Button>
              </Link>
              <p className="text-xs text-gray-400 break-all self-center">{REMOTE_DESKTOP_URL}</p>
            </div>
          ) : (
            <p className="text-sm text-amber-300">
              Define `NEXT_PUBLIC_REMOTE_DESKTOP_URL` no Vercel para ativar o botão de acesso.
            </p>
          )}
          <div className="rounded-lg border border-gray-800 bg-black/50 p-3">
            <p className="text-xs text-gray-400 mb-1">Estado do serviço remoto</p>
            {checking ? (
              <p className="text-sm text-gray-300 inline-flex items-center">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                A verificar...
              </p>
            ) : status ? (
              <p
                className={`text-sm ${
                  status.reachable ? "text-green-400" : "text-amber-300"
                }`}
              >
                {status.reachable
                  ? `OK: remote desktop acessível (${status.status || 200})`
                  : `Indisponível: ${status.error || `HTTP ${status.status || "?"}`}`}
              </p>
            ) : (
              <p className="text-sm text-gray-400">Sem verificação ainda.</p>
            )}
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" className="border-[#D2A63C]/40 text-[#D2A63C] hover:bg-[#D2A63C]/10">
                <BookOpen className="h-4 w-4 mr-2" />
                Tutorial Remote Desktop
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl bg-zinc-950 border-[#D2A63C]/30 text-white">
              <DialogHeader>
                <DialogTitle className="text-[#D2A63C]">Como aceder ao Remote Desktop</DialogTitle>
                <DialogDescription className="text-gray-400">
                  Passo a passo para ligar o Ubuntu VPS ao painel admin.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm">
                <p className="text-gray-300">
                  1) Na VPS, sobe o Guacamole com os ficheiros em{" "}
                  <code className="text-[#D2A63C]">deploy/vps-remote-desktop/</code>.
                </p>
                <p className="text-gray-300">
                  2) Instala interface gráfica + XRDP no Ubuntu e cria um utilizador dedicado (ex.:{" "}
                  <code className="text-[#D2A63C]">mtmadmin</code>).
                </p>
                <p className="text-gray-300">
                  3) No Guacamole, cria ligação RDP para{" "}
                  <code className="text-[#D2A63C]">127.0.0.1:3389</code>.
                </p>
                <p className="text-gray-300">
                  4) Publica no Nginx em{" "}
                  <code className="text-[#D2A63C]">/guacamole/</code> com HTTPS.
                </p>
                <p className="text-gray-300">
                  5) No Vercel, define{" "}
                  <code className="text-[#D2A63C]">NEXT_PUBLIC_REMOTE_DESKTOP_URL</code> com a URL final
                  (ex.: <code className="text-[#D2A63C]">https://stream.morethanmoney.pt/guacamole/</code>).
                </p>
                <p className="text-xs text-gray-500">
                  Nota: se o iframe ficar em branco, abre pelo botão “Abrir desktop remoto” (alguns servidores
                  bloqueiam embed por cabeçalhos de segurança).
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {REMOTE_DESKTOP_URL ? (
          <div className="rounded-xl border border-gray-800 bg-black/60 p-2">
            <iframe
              src={REMOTE_DESKTOP_URL}
              title="Desktop remoto VPS"
              className="h-[70vh] w-full rounded-lg border border-gray-800 bg-black"
              allow="clipboard-read; clipboard-write"
            />
            <p className="text-xs text-gray-500 p-2">
              Se o ecrã ficar vazio, o servidor remoto pode bloquear iframe (X-Frame-Options). Usa o botão
              “Abrir desktop remoto”.
            </p>
          </div>
        ) : null}
      </div>
    </div>
  )
}
