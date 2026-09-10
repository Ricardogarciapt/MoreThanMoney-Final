"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import ProtectedPage from "@/components/protected-page"
import {
  BookUser,
  Bot,
  Download,
  ExternalLink,
  FileText,
  KeyRound,
  LayoutDashboard,
  MonitorSmartphone,
  Radar,
  Users,
  Zap,
} from "lucide-react"

const MT5_WINDOWS_URL =
  "https://download.mql5.com/cdn/web/metaquotes.software.corp/mt5/mt5setup.exe"
const MT5_MAC_URL = "https://www.metatrader5.com/en/download"
const QFI_TERMINAL_URL = "https://qfiterminal.com/login/"

interface Contact {
  id: string
  name: string
  channel: string | null
  interest: string | null
  status: "novo" | "em_followup" | "cliente" | "perdido"
  notes: string | null
}

function SimpleContactManager() {
  const [contacts, setContacts] = useState<Contact[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: "",
    channel: "Instagram",
    interest: "Trading",
    notes: "",
  })

  useEffect(() => {
    const loadContacts = async () => {
      try {
        setLoading(true)
        setError(null)
        const res = await fetch("/api/trading/contacts")
        const data = await res.json()
        if (!res.ok || !data.success) {
          throw new Error(data.error || "Erro ao carregar contactos")
        }
        setContacts(data.contacts || [])
      } catch (err: any) {
        console.error("[TRADING CONTACTS] Erro load:", err)
        setError("Não foi possível carregar os contactos.")
      } finally {
        setLoading(false)
      }
    }
    loadContacts()
  }, [])

  const addContact = async () => {
    if (!form.name.trim()) return
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/trading/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          channel: form.channel,
          interest: form.interest,
          notes: form.notes,
        }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao guardar contacto")
      }
      setContacts((prev) => [data.contact, ...prev])
      setForm({ name: "", channel: "Instagram", interest: "Trading", notes: "" })
    } catch (err: any) {
      console.error("[TRADING CONTACTS] Erro add:", err)
      setError("Não foi possível guardar o contacto.")
    } finally {
      setLoading(false)
    }
  }

  const updateStatus = async (id: string, status: Contact["status"]) => {
    try {
      setError(null)
      const res = await fetch("/api/trading/contacts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Erro ao atualizar estado")
      }
      setContacts((prev) =>
        prev.map((c) => (c.id === id ? { ...c, status: data.contact.status } : c))
      )
    } catch (err: any) {
      console.error("[TRADING CONTACTS] Erro status:", err)
      setError("Não foi possível atualizar o estado.")
    }
  }

  const visible = contacts

  return (
    <Card className="bg-black border-white/10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <BookUser className="h-5 w-5 text-amber-400" />
          Gestor de Contactos (leads & clientes)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-zinc-400">
              Nome
            </label>
            <input
              className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nome do lead ou cliente"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-zinc-400">
              Canal
            </label>
            <select
              className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
              value={form.channel}
              onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}
            >
              <option>Instagram</option>
              <option>WhatsApp</option>
              <option>Telegram</option>
              <option>TikTok</option>
              <option>Outro</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-zinc-400">
              Interesse
            </label>
            <select
              className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
              value={form.interest}
              onChange={(e) => setForm((f) => ({ ...f, interest: e.target.value }))}
            >
              <option>Trading</option>
              <option>Equipa MTM</option>
              <option>Formação</option>
              <option>Outro</option>
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs uppercase tracking-wider text-zinc-400">
              Notas
            </label>
            <input
              className="w-full rounded-md border border-white/10 bg-black px-3 py-2 text-sm text-white outline-none focus:border-amber-500/70"
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Contexto, próximo passo, etc."
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] text-zinc-500">
            {loading && <span>A sincronizar...</span>}
            {!loading && visible.length > 0 && (
              <span>{visible.length} contacto(s) guardados</span>
            )}
            {error && <span className="text-red-400"> · {error}</span>}
          </div>
          <Button
            size="sm"
            className="bg-amber-500 hover:bg-amber-400 text-black font-medium"
            onClick={addContact}
            disabled={loading}
          >
            Adicionar contacto
          </Button>
        </div>
        {visible.length === 0 ? (
          <p className="text-xs text-zinc-500">
            Ainda não adicionaste nenhum contacto. Usa este gestor para seguir DMs,
            leads de Instagram e clientes ativos.
          </p>
        ) : (
          <div className="mt-2 max-h-64 space-y-2 overflow-y-auto pr-1">
            {visible.map((c) => (
              <div
                key={c.id}
                className="flex flex-col gap-1 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs md:flex-row md:items-center md:justify-between"
              >
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-white">{c.name}</p>
                  <p className="text-[11px] text-zinc-400">
                    {(c.channel || "—")} · {(c.interest || "—")}
                  </p>
                  {c.notes && (
                    <p className="text-[11px] text-zinc-500">Notas: {c.notes}</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1 md:pt-0">
                  {(["novo", "em_followup", "cliente", "perdido"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateStatus(c.id, s)}
                      className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        c.status === s
                          ? "border-amber-500/80 bg-amber-500/15 text-amber-300"
                          : "border-white/10 text-zinc-400 hover:border-amber-500/40 hover:text-amber-200"
                      }`}
                    >
                      {s === "novo"
                        ? "Novo"
                        : s === "em_followup"
                        ? "Follow-up"
                        : s === "cliente"
                        ? "Cliente"
                        : "Perdido"}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function TradingPage() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1400)
    return () => clearTimeout(t)
  }, [])

  const splash = (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black">
      <div className="relative flex flex-col items-center gap-6">
        <div className="absolute h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
        <Image
          src="/icon-512x512.png"
          alt="MoreThanMoney"
          width={512}
          height={512}
          className="relative h-16 w-auto drop-shadow-[0_0_35px_rgba(212,175,55,0.6)]"
          priority
        />
        <p className="relative text-sm uppercase tracking-[0.3em] text-zinc-400">
          Trading Desk
        </p>
      </div>
    </div>
  )

  return (
    <ProtectedPage redirectPath="/login?redirect=/trading" loadingMessage="A preparar o Trading Desk...">
      <main className="min-h-screen bg-black text-white pb-16">
        {showSplash && splash}

        <section className="pt-24 pb-10 px-6 bg-gradient-to-b from-black via-zinc-950 to-black">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
              <div className="space-y-4 max-w-2xl">
                <p className="text-xs uppercase tracking-[0.25em] text-amber-400/80">
                  MTM · Trading Desk
                </p>
                <h1 className="text-3xl md:text-4xl lg:text-5xl font-light tracking-tight">
                  O teu{" "}
                  <span className="font-semibold text-amber-400">painel de trabalho</span>{" "}
                  diário.
                </h1>
                <p className="text-sm md:text-base text-zinc-400 max-w-xl">
                  Acede ao scanner, terminal, plataformas e gestor de contactos num só
                  lugar. Menos fricção, mais execução.
                </p>
              </div>
              <div className="flex gap-3 md:flex-col md:items-end">
                <Button
                  asChild
                  size="sm"
                  className="bg-amber-500 hover:bg-amber-400 text-black font-semibold"
                >
                  <Link href="#tools">Abrir ferramentas</Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="border-white/20 text-zinc-200 hover:border-amber-400/70 hover:text-amber-200"
                >
                  <Link href="/scanner-access">Ver Scanner ao Vivo</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        <section id="tools" className="px-6 pt-6 pb-10">
          <div className="mx-auto max-w-6xl grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            <Card className="bg-black border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Radar className="h-5 w-5 text-amber-400" />
                  Scanner MTM
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-400">
                <p>
                  Acede às leituras e scanners da MoreThanMoney numa interface desenhada
                  para mobile, também útil em desktop.
                </p>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="border-amber-500/60 text-amber-300 hover:bg-amber-500/10"
                >
                  <Link href="/trading/scanner" target="_blank" rel="noreferrer">
                    Abrir Scanner (nova aba)
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-black border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <LayoutDashboard className="h-5 w-5 text-sky-400" />
                  Terminal Quantum
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm text-zinc-400">
                <p>
                  Dashboard profissional de analytics e dados crypto. Mantém o terminal
                  aberto ao lado do TradingView ou MT5.
                </p>
                <Button
                  asChild
                  size="sm"
                  className="bg-sky-500 hover:bg-sky-400 text-black font-medium flex items-center gap-2"
                >
                  <Link href={QFI_TERMINAL_URL} target="_blank" rel="noreferrer">
                    Abrir Terminal
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>

            <Card className="bg-black border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <MonitorSmartphone className="h-5 w-5 text-emerald-400" />
                  MetaTrader 5
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <p>
                  Instala o MT5 e liga-o às tuas contas. Depois usa o instalador do MTM Sensei
                  aqui ao lado — ele trata do resto.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="justify-between border-white/20 text-zinc-100 hover:border-amber-400/70"
                  >
                    <Link href={MT5_WINDOWS_URL} target="_blank" rel="noreferrer">
                      Download MT5 para Windows
                      <Download className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="justify-between border-white/20 text-zinc-100 hover:border-amber-400/70"
                  >
                    <Link href={MT5_MAC_URL} target="_blank" rel="noreferrer">
                      Download MT5 para macOS
                      <Download className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* O EA vive ao lado do download do MT5 de propósito: quem acabou de instalar o
                MetaTrader é exactamente quem precisa disto a seguir. */}
            <Card className="bg-black border-emerald-500/25">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Bot className="h-5 w-5 text-emerald-400" />
                  MTM Sensei EA
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <p>
                  O robô da casa para MT5. O instalador põe o EA, os presets e o calendário
                  de notícias no sítio certo e abre o guia — não tens de procurar pastas.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    asChild
                    size="sm"
                    className="justify-between bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
                  >
                    <a href="/downloads/MTM-Sensei-EA.zip" download>
                      Instalador + EA (Windows e macOS)
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="justify-between border-white/20 text-zinc-100 hover:border-emerald-400/70"
                  >
                    <Link href="/api/sensei-ea/guia" target="_blank" rel="noreferrer">
                      Guia de instruções (PDF)
                      <FileText className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="justify-between border-white/20 text-zinc-100 hover:border-emerald-400/70"
                  >
                    <Link href="/member-area?tab=subscription">
                      A minha licença
                      <KeyRound className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Precisa de licença. Premium, VIP e Fundador emitem a deles sem custo na área de
                  membro.
                </p>
              </CardContent>
            </Card>

            {/* A SEGUNDA EA. Fica ao lado da primeira e diz logo no subtítulo que é outra coisa —
                aqui, ao pé do download do MetaTrader, é onde a confusão entre as duas seria mais
                cara: alguém instala uma a pensar que é a outra e a chave não valida. */}
            <Card className="bg-black border-[#D2A63C]/30">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5 text-[#D2A63C]" />
                  Sensei Scalp Edition
                </CardTitle>
                <p className="text-xs text-[#D2A63C]/80">
                  EA diferente do Sensei EA, com licença própria
                </p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <p>
                  Scalper de ouro em M5: ordens pendentes dos dois lados, trailing desde o primeiro
                  cêntimo de lucro e reversão a fechar o lado errado. Sem stop loss fixo.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    asChild
                    size="sm"
                    className="justify-between bg-[#D2A63C] hover:bg-[#BB8525] text-black font-medium"
                  >
                    <a href="/downloads/MTM-Sensei-Scalp.zip" download>
                      Instalador + EA (Windows e macOS)
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="justify-between border-white/20 text-zinc-100 hover:border-[#D2A63C]/70"
                  >
                    <Link href="/api/sensei-scalp/guia" target="_blank" rel="noreferrer">
                      Guia de instruções (PDF)
                      <FileText className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="justify-between border-white/20 text-zinc-100 hover:border-[#D2A63C]/70"
                  >
                    <Link href="/sensei-scalp">
                      Ver e comprar — 200 €/ano
                      <KeyRound className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
                <p className="text-[11px] text-zinc-500">
                  Licença separada da do Sensei EA. Não está incluída em nenhum plano de subscrição.
                </p>
              </CardContent>
            </Card>

            <Card className="bg-black border-white/10">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-white">
                  <Users className="h-5 w-5 text-purple-400" />
                  Máquina de Relacionamento
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-zinc-400">
                <p>
                  Mantém o mapa dos teus leads, clientes e promotores. Quem entra pela
                  MTM não pode perder-se no processo.
                </p>
                <p className="text-[11px] text-zinc-500">
                  Versão inicial inspirada em CRMs simples e adaptada ao nicho de trading
                  e comunidades recorrentes.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="px-6 pb-12">
          <div className="mx-auto max-w-6xl">
            <SimpleContactManager />
          </div>
        </section>
      </main>
    </ProtectedPage>
  )
}

