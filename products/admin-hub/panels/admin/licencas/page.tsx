"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  ArrowLeft,
  Plus,
  Copy,
  Check,
  Loader2,
  KeyRound,
  RefreshCw,
  Ban,
  RotateCcw,
  Unlink,
  Monitor,
  Users,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"

/**
 * Os dois produtos. Repetidos aqui em vez de importados de `lib/licencas` porque esse módulo
 * arrasta o cliente de admin do Supabase, que não pode ir para o browser.
 *
 * Uma licença gravada antes de existirem dois produtos não tem o campo preenchido de forma
 * fiável — por isso `nomeProduto` trata o desconhecido como AllInOne, que era o único que havia.
 */
const PRODUTOS = [
  { id: "sensei_ea", nome: "MTM Sensei EA", curto: "Sensei EA" },
  { id: "sensei_scalp", nome: "MTM Sensei Scalp Edition", curto: "Scalp" },
] as const

function nomeProduto(id: string | null | undefined, curto = false) {
  const p = PRODUTOS.find((x) => x.id === id) ?? PRODUTOS[0]
  return curto ? p.curto : p.nome
}

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Ativacao {
  id: string
  mt5_login: string
  corretora: string | null
  servidor: string | null
  primeira_em: string
  ultima_em: string
  validacoes: number
}

interface Licenca {
  id: string
  chave: string
  user_id: string | null
  email: string | null
  produto: string
  origem: "membro" | "stripe" | "admin"
  plano: "anual" | "vitalicia" | "incluida"
  contas_permitidas: number
  mt5_login: string | null
  estado: "ativa" | "revogada" | "expirada"
  expira_em: string | null
  notas: string | null
  criada_em: string
  dono: { id: string; email: string; full_name: string | null } | null
  ativacoes: Ativacao[]
}

const PLANO_LABEL = {
  anual: "Anual",
  vitalicia: "Vitalícia",
  incluida: "Incluída",
} as const

const ORIGEM_LABEL = {
  membro: "Área de membro",
  stripe: "Comprada",
  admin: "Emitida no admin",
} as const

function data(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-PT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// ─── Componente ───────────────────────────────────────────────────────────────

export default function LicencasPage() {
  const { user, isAdmin, isLoading: authLoading } = useAuth()
  const router = useRouter()
  const { toast } = useToast()

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [licencas, setLicencas] = useState<Licenca[]>([])
  const [procura, setProcura] = useState("")
  const [estado, setEstado] = useState("todos")
  const [produto, setProduto] = useState("todos")
  const [totais, setTotais] = useState<Record<string, number>>({})
  const [copiada, setCopiada] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)

  const [mostrarLote, setMostrarLote] = useState(false)
  const [lotePrevia, setLotePrevia] = useState<{ elegiveis: number; jaTinham: number; semDireito: number } | null>(null)
  const [loteAConfirmar, setLoteAConfirmar] = useState(false)

  const [mostrarCriar, setMostrarCriar] = useState(false)
  const [aGuardar, setAGuardar] = useState(false)
  const [form, setForm] = useState({
    email: "",
    produto: "sensei_ea",
    plano: "anual",
    mt5Login: "",
    notas: "",
  })

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!mounted || authLoading) return
    if (!user) router.push("/login?redirect=/admin/licencas")
    else if (!isAdmin) router.push("/new-landing")
  }, [mounted, authLoading, user, isAdmin, router])

  const carregar = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (procura.trim()) params.set("q", procura.trim())
      if (estado !== "todos") params.set("estado", estado)
      if (produto !== "todos") params.set("produto", produto)
      const r = await fetch(`/api/admin/licencas?${params}`)
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Erro a carregar")
      setLicencas(d.licencas || [])
      setTotais(d.totais || {})
    } catch (e) {
      toast({
        title: "Não deu para carregar",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [procura, estado, produto, toast])

  useEffect(() => {
    if (mounted && user && isAdmin) void carregar()
  }, [mounted, user, isAdmin, carregar])

  const stats = useMemo(() => {
    const ativas = licencas.filter((l) => l.estado === "ativa")
    return {
      total: licencas.length,
      ativas: ativas.length,
      aCorrer: licencas.reduce((n, l) => n + l.ativacoes.length, 0),
    }
  }, [licencas])

  async function agir(id: string, acao: "revogar" | "reativar" | "libertar") {
    try {
      const r = await fetch("/api/admin/licencas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, acao }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Erro")
      toast({
        title:
          acao === "revogar"
            ? "Licença revogada"
            : acao === "reativar"
              ? "Licença reactivada"
              : "Contas libertadas",
      })
      void carregar()
    } catch (e) {
      toast({
        title: "Falhou",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      })
    }
  }

  /**
   * Duas fases: primeiro pergunta-se ao servidor quantos seriam (dryRun), mostra-se o número, e
   * só depois se emite. Emitir dezenas de licenças reais sem ver a conta antes é o tipo de botão
   * de que ninguém gosta às duas da manhã.
   */
  async function verLote() {
    setLotePrevia(null)
    setMostrarLote(true)
    try {
      const r = await fetch("/api/admin/licencas/emitir-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Erro")
      setLotePrevia({ elegiveis: d.elegiveis, jaTinham: d.jaTinham, semDireito: d.semDireito })
    } catch (e) {
      toast({
        title: "Não deu para calcular",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      })
      setMostrarLote(false)
    }
  }

  async function emitirLote() {
    setLoteAConfirmar(true)
    try {
      const r = await fetch("/api/admin/licencas/emitir-lote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: false }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Erro")
      const falhas = (d.lista || []).filter((x: { erro?: string }) => x.erro).length
      toast({
        title: `${d.elegiveis - falhas} licenças emitidas`,
        description: falhas ? `${falhas} falharam — vê o log do servidor.` : "Já aparecem na área de membro de cada um.",
      })
      setMostrarLote(false)
      void carregar()
    } catch (e) {
      toast({
        title: "Falhou",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setLoteAConfirmar(false)
    }
  }

  async function criar() {
    if (!form.email.trim()) {
      toast({ title: "Falta o email do cliente", variant: "destructive" })
      return
    }
    setAGuardar(true)
    try {
      const r = await fetch("/api/admin/licencas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || "Erro")
      toast({ title: `Licença ${d.licenca.chave} emitida` })
      setMostrarCriar(false)
      // mantém o produto escolhido: quem emite duas seguidas costuma emitir do mesmo
      setForm((f) => ({ email: "", produto: f.produto, plano: "anual", mt5Login: "", notas: "" }))
      void carregar()
    } catch (e) {
      toast({
        title: "Não deu para emitir",
        description: e instanceof Error ? e.message : "Erro desconhecido",
        variant: "destructive",
      })
    } finally {
      setAGuardar(false)
    }
  }

  function copiar(chave: string) {
    void navigator.clipboard.writeText(chave)
    setCopiada(chave)
    setTimeout(() => setCopiada(null), 1500)
  }

  if (!mounted || authLoading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  if (!user || !isAdmin) return null

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <div className="border-b border-[#D2A63C]/15 bg-gray-950 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/admin"
              className="flex items-center gap-2 text-gray-400 hover:text-[#D2A63C] text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Admin
            </Link>
            <span className="text-gray-600">/</span>
            <div className="flex items-center gap-2">
              <div className="rounded-lg bg-[#D2A63C]/15 p-1.5 ring-1 ring-[#D2A63C]/25">
                <KeyRound className="h-4 w-4 text-[#D2A63C]" />
              </div>
              <span className="text-white font-semibold">Licenças do EA</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={carregar} className="text-gray-400 hover:text-white">
              <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={verLote}
              className="border-[#D2A63C]/40 text-[#D2A63C]"
            >
              <Users className="w-4 h-4 mr-1.5" />
              Emitir aos membros
            </Button>
            <Button
              size="sm"
              onClick={() => setMostrarCriar(true)}
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525] font-medium"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              Emitir licença
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Licenças emitidas", value: stats.total, icon: KeyRound },
            { label: "Activas", value: stats.ativas, icon: Check },
            { label: "Contas MT5 a correr", value: stats.aCorrer, icon: Monitor },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-3"
            >
              <div className="rounded-lg bg-[#D2A63C]/10 p-2.5 ring-1 ring-[#D2A63C]/20">
                <Icon className="w-5 h-5 text-[#D2A63C]" />
              </div>
              <div>
                <div className="text-2xl font-bold text-white">{value}</div>
                <div className="text-xs text-gray-500">{label}</div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-3">
          <Input
            value={procura}
            onChange={(e) => setProcura(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && carregar()}
            placeholder="Chave, email ou conta MT5…"
            className="max-w-sm bg-gray-900 border-gray-800 text-white"
          />
          <Select value={produto} onValueChange={setProduto}>
            <SelectTrigger className="w-56 bg-gray-900 border-gray-800 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Os dois produtos</SelectItem>
              {PRODUTOS.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nome}
                  {totais[p.id] !== undefined ? ` (${totais[p.id]})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={estado} onValueChange={setEstado}>
            <SelectTrigger className="w-44 bg-gray-900 border-gray-800 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os estados</SelectItem>
              <SelectItem value="ativa">Activas</SelectItem>
              <SelectItem value="revogada">Revogadas</SelectItem>
              <SelectItem value="expirada">Expiradas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-3">
          {loading && licencas.length === 0 && (
            <div className="py-16 text-center text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
            </div>
          )}

          {!loading && licencas.length === 0 && (
            <div className="py-16 text-center text-gray-500 border border-dashed border-gray-800 rounded-xl">
              Ainda não há licenças emitidas.
            </div>
          )}

          {licencas.map((l) => {
            const expandida = aberta === l.id
            return (
              <div key={l.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="p-4 flex flex-wrap items-center gap-4">
                  <button
                    onClick={() => copiar(l.chave)}
                    className="font-mono text-[#D2A63C] text-sm tracking-wider flex items-center gap-2 hover:text-[#F4D03F]"
                    title="Copiar chave"
                  >
                    {l.chave}
                    {copiada === l.chave ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 opacity-50" />
                    )}
                  </button>

                  <div className="flex-1 min-w-[200px]">
                    <div className="text-sm text-white">
                      {l.dono?.full_name || l.dono?.email || l.email || "Sem conta no site"}
                    </div>
                    <div className="text-xs text-gray-500">
                      {ORIGEM_LABEL[l.origem]} · {data(l.criada_em)}
                    </div>
                  </div>

                  {/* Qual EA. Fica mesmo quando o filtro está a mostrar só uma: uma tabela onde
                      a coluna desaparece conforme o filtro obriga a olhar para o filtro para saber
                      o que se está a ver. */}
                  <Badge
                    variant="outline"
                    className={cn(
                      "shrink-0",
                      l.produto === "sensei_scalp"
                        ? "border-[#D2A63C]/50 text-[#D2A63C]"
                        : "border-emerald-600/40 text-emerald-400",
                    )}
                  >
                    {nomeProduto(l.produto, true)}
                  </Badge>

                  <Badge variant="outline" className="border-gray-700 text-gray-300">
                    {PLANO_LABEL[l.plano]}
                  </Badge>

                  <div className="text-xs text-gray-400 min-w-[110px]">
                    {l.mt5_login ? `Conta ${l.mt5_login}` : "Conta por definir"}
                  </div>

                  <div className="text-xs text-gray-400 min-w-[110px]">
                    {l.plano === "incluida"
                      ? "Segue a subscrição"
                      : l.expira_em
                        ? `Até ${data(l.expira_em)}`
                        : "Sem prazo"}
                  </div>

                  <Badge
                    className={cn(
                      "border",
                      l.estado === "ativa"
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                        : l.estado === "revogada"
                          ? "bg-red-500/10 text-red-400 border-red-500/30"
                          : "bg-gray-500/10 text-gray-400 border-gray-500/30",
                    )}
                  >
                    {l.estado}
                  </Badge>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setAberta(expandida ? null : l.id)}
                      className="text-gray-400 hover:text-white text-xs"
                    >
                      {l.ativacoes.length} conta{l.ativacoes.length === 1 ? "" : "s"}
                    </Button>
                    {l.estado === "ativa" ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => agir(l.id, "revogar")}
                        className="text-gray-400 hover:text-red-400"
                        title="Revogar"
                      >
                        <Ban className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => agir(l.id, "reativar")}
                        className="text-gray-400 hover:text-emerald-400"
                        title="Reactivar"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => agir(l.id, "libertar")}
                      className="text-gray-400 hover:text-[#D2A63C]"
                      title="Libertar as contas (o cliente mudou de corretora)"
                    >
                      <Unlink className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {expandida && (
                  <div className="border-t border-gray-800 bg-gray-950/60 px-4 py-3 space-y-2">
                    {l.ativacoes.length === 0 && (
                      <div className="text-xs text-gray-500">
                        Ainda não foi usada em nenhuma conta.
                      </div>
                    )}
                    {l.ativacoes.map((a) => (
                      <div key={a.id} className="flex flex-wrap gap-4 text-xs text-gray-400">
                        <span className="text-white font-mono">{a.mt5_login}</span>
                        <span>{a.corretora || "—"}</span>
                        <span>{a.servidor || "—"}</span>
                        <span>1.ª vez: {data(a.primeira_em)}</span>
                        <span>última: {data(a.ultima_em)}</span>
                        <span>{a.validacoes} validações</span>
                      </div>
                    ))}
                    {l.notas && <div className="text-xs text-gray-600 pt-1">{l.notas}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Dialog open={mostrarLote} onOpenChange={setMostrarLote}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Emitir a licença incluída aos membros</DialogTitle>
          </DialogHeader>
          {!lotePrevia ? (
            <div className="py-8 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-[#D2A63C]" />
            </div>
          ) : (
            <div className="space-y-4 py-2 text-sm">
              <p className="text-gray-300">
                <strong className="text-[#D2A63C] text-lg">{lotePrevia.elegiveis}</strong> membros
                com direito e ainda sem licença.
              </p>
              <p className="text-gray-500 text-xs leading-relaxed">
                {lotePrevia.jaTinham} já tinham uma. {lotePrevia.semDireito} não têm direito
                (Premium, VIP, Fundador e admin — a cópia automática não conta).
              </p>
              <p className="text-gray-500 text-xs leading-relaxed">
                Cada licença fica sem conta MT5 definida e prende-se à primeira onde o EA arrancar.
                Aparece na área de membro de cada um, no separador da subscrição. Não é enviado
                email.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMostrarLote(false)}>
              Cancelar
            </Button>
            <Button
              onClick={emitirLote}
              disabled={!lotePrevia || !lotePrevia.elegiveis || loteAConfirmar}
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
            >
              {loteAConfirmar ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                `Emitir ${lotePrevia?.elegiveis ?? ""}`
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mostrarCriar} onOpenChange={setMostrarCriar}>
        <DialogContent className="bg-gray-900 border-gray-800 text-white">
          <DialogHeader>
            <DialogTitle>Emitir licença</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Email do cliente</label>
              <Input
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="cliente@email.com"
                className="bg-gray-950 border-gray-800 text-white"
              />
              <p className="text-[11px] text-gray-600 mt-1">
                Se já for membro, a licença aparece-lhe na área de membro.
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Produto</label>
              <Select value={form.produto} onValueChange={(v) => setForm({ ...form, produto: v })}>
                <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRODUTOS.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-gray-600 mt-1">
                Uma chave só abre o EA para que foi emitida.
              </p>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Plano</label>
              <Select value={form.plano} onValueChange={(v) => setForm({ ...form, plano: v })}>
                <SelectTrigger className="bg-gray-950 border-gray-800 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="anual">Anual (1 ano)</SelectItem>
                  <SelectItem value="vitalicia">Vitalícia</SelectItem>
                  <SelectItem value="incluida">Incluída (segue a subscrição)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Conta MT5 (opcional)</label>
              <Input
                value={form.mt5Login}
                onChange={(e) => setForm({ ...form, mt5Login: e.target.value.replace(/\D/g, "") })}
                placeholder="Só dígitos — deixa vazio para prender na 1.ª utilização"
                className="bg-gray-950 border-gray-800 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Notas</label>
              <Input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
                placeholder="Porquê esta licença"
                className="bg-gray-950 border-gray-800 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMostrarCriar(false)}>
              Cancelar
            </Button>
            <Button
              onClick={criar}
              disabled={aGuardar}
              className="bg-[#D2A63C] text-black hover:bg-[#BB8525]"
            >
              {aGuardar ? <Loader2 className="w-4 h-4 animate-spin" /> : "Emitir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
