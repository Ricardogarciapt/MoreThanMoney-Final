"use client"

/**
 * /admin/vendas — a equipa de vendas num ecrã: pipeline, tarefas, percentagens, livro de comissões
 * e relatórios.
 *
 * Três coisas que esta página faz de propósito, e que não são detalhes de UI:
 *
 *  · PAGAR pede confirmação duas vezes e mostra o TOTAL antes. A API recusa sem `confirmar: true`
 *    (devolve 409 com o valor); o botão aqui só existe para o passo humano, e o que a API responder
 *    aparece tal e qual. Nada nesta página paga sozinho.
 *  · O QUE FALTA DECIDIR está à vista, em cima. Vendas trabalhadas por alguém sem percentagem
 *    definida para o pack não são um erro silencioso: são uma dívida a acumular, e têm de gritar.
 *  · Mudar uma percentagem avisa que a anterior é FECHADA e não apagada — quem muda tem de saber
 *    que o passado não se reescreve com ela.
 */

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuth } from "@/contexts/auth-context"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Loader2, RefreshCw, AlertTriangle, Check, Users, Euro, ListChecks, BarChart3, Percent } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

// ─── Tipos (só o que a página usa; a verdade é a das rotas) ───────────────────

type Papel = "prospector" | "setter" | "closer" | "afiliado" | "team_leader"
const PAPEIS: Papel[] = ["prospector", "setter", "closer", "afiliado", "team_leader"]
const COLUNA: Record<Papel, string> = {
  prospector: "prospector_id",
  setter: "setter_id",
  closer: "closer_id",
  afiliado: "afiliado_id",
  team_leader: "team_leader_id",
}

const ESTADOS = ["lead", "contactado", "qualificado", "marcado", "no_show", "apresentado", "ganho", "perdido"] as const

type Negocio = Record<string, unknown> & { id: string; nome: string; estado: string }
type Tarefa = { id: string; titulo: string; responsavel_id: string; prazo: string | null; estado: string; atrasada?: boolean; negocio_id: string | null }
type Regra = { id: string; plano: string; papel: Papel; pack: string; pct: number; aplica_a: string; valido_de: string; nota: string | null }
type Degrau = { id: string; papel: Papel; min_vendas: number; pct: number }
type Comissao = Record<string, unknown> & { id: string; papel: string; valor_cents: number; estado: string; beneficiario_id: string }
type Pessoa = { id: string; nome: string; email: string | null; plano: string | null }

type Aba = "pipeline" | "tarefas" | "regras" | "comissoes" | "relatorios"

// ─── Ajudas ──────────────────────────────────────────────────────────────────

function euros(cents: unknown): string {
  const n = Number(cents) || 0
  const negativo = n < 0
  const abs = Math.abs(Math.round(n))
  return `${negativo ? "-" : ""}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")} €`
}

function dia(iso: unknown): string {
  if (!iso) return "—"
  return new Date(String(iso)).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit" })
}

const CAIXA = "rounded-lg border border-gray-800 bg-gray-900/60 p-4"
const TH = "px-3 py-2 text-left text-[11px] uppercase tracking-wider text-gray-500 font-medium"
const TD = "px-3 py-2 text-sm text-gray-300"

export default function AdminVendasPage() {
  const router = useRouter()
  const { user, isAdmin, isLoading: authLoading } = useAuth()
  const { toast } = useToast()

  const [montado, setMontado] = useState(false)
  const [aba, setAba] = useState<Aba>("pipeline")
  const [ocupado, setOcupado] = useState(false)

  const [negocios, setNegocios] = useState<Negocio[]>([])
  const [porEstado, setPorEstado] = useState<Record<string, number>>({})
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [regras, setRegras] = useState<Regra[]>([])
  const [degraus, setDegraus] = useState<Degrau[]>([])
  const [comissoes, setComissoes] = useState<Comissao[]>([])
  const [totais, setTotais] = useState<Record<string, number>>({})
  const [relatorio, setRelatorio] = useState<Record<string, unknown> | null>(null)
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [semComissao, setSemComissao] = useState<Array<Record<string, unknown>>>([])

  useEffect(() => setMontado(true), [])
  useEffect(() => {
    if (!montado || authLoading) return
    if (!user) router.push("/login?redirect=/admin/vendas")
    else if (!isAdmin) router.push("/new-landing")
  }, [montado, authLoading, user, isAdmin, router])

  const nomeDe = useMemo(() => {
    const mapa = new Map(pessoas.map((p) => [p.id, p.nome]))
    return (id: unknown) => (id ? mapa.get(String(id)) ?? String(id).slice(0, 8) : "—")
  }, [pessoas])

  const carregar = useCallback(async () => {
    setOcupado(true)
    try {
      const [n, t, r, c, rel, p, sc] = await Promise.all([
        fetch("/api/admin/vendas/negocios").then((x) => x.json()),
        fetch("/api/admin/vendas/tarefas?estado=todas").then((x) => x.json()),
        fetch("/api/admin/vendas/regras").then((x) => x.json()),
        fetch("/api/admin/vendas/comissoes").then((x) => x.json()),
        fetch("/api/admin/vendas/relatorios").then((x) => x.json()),
        fetch("/api/admin/vendas/pessoas").then((x) => x.json()),
        fetch("/api/admin/vendas/vendas?sem_comissao=1").then((x) => x.json()),
      ])
      setNegocios(n.negocios ?? [])
      setPorEstado(n.porEstado ?? {})
      setTarefas(t.tarefas ?? [])
      setRegras(r.emVigor ?? [])
      setDegraus(r.ranks ?? [])
      setComissoes(c.comissoes ?? [])
      setTotais(c.totais ?? {})
      setRelatorio(rel ?? null)
      setPessoas(p.pessoas ?? [])
      setSemComissao(sc.vendas ?? [])
    } catch {
      toast({ title: "Não foi possível carregar", description: "A migração 127/128 já foi aplicada?", variant: "destructive" })
    } finally {
      setOcupado(false)
    }
  }, [toast])

  useEffect(() => {
    if (montado && user && isAdmin) void carregar()
  }, [montado, user, isAdmin, carregar])

  // ─── Acções ────────────────────────────────────────────────────────────────

  async function pedir(url: string, corpo: unknown, metodo: "POST" | "PATCH" = "POST") {
    const resposta = await fetch(url, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    })
    const dados = await resposta.json().catch(() => ({}))
    if (!resposta.ok) {
      // A API responde 409 a um pagamento sem confirmação, com o total. Mostra-se o que ela diz —
      // inventar uma mensagem aqui era esconder a razão pela qual não se pagou.
      toast({
        title: dados.error || "Pedido recusado",
        description: dados.aConfirmar ? `${dados.aConfirmar.comissoes} comissões · ${dados.aConfirmar.total}` : undefined,
        variant: "destructive",
      })
      return null
    }
    return dados
  }

  async function mudarEstado(id: string, estado: string) {
    const r = await pedir("/api/admin/vendas/negocios", { id, estado }, "PATCH")
    if (r) {
      toast({ title: `Negócio em «${estado}»`, description: "Mudar de estado não cria comissão — só um pagamento confirmado o faz." })
      void carregar()
    }
  }

  async function atribuir(id: string, papel: Papel, pessoaId: string) {
    const r = await pedir("/api/admin/vendas/negocios", { id, [COLUNA[papel]]: pessoaId || null }, "PATCH")
    if (r) void carregar()
  }

  async function aprovar(ids: string[]) {
    const r = await pedir("/api/admin/vendas/comissoes", { accao: "aprovar", ids })
    if (r) {
      toast({ title: `${r.feitas} aprovada(s)`, description: r.recusadas?.length ? `${r.recusadas.length} recusada(s)` : undefined })
      void carregar()
    }
  }

  async function pagar(ids: string[]) {
    const total = comissoes.filter((c) => ids.includes(c.id)).reduce((t, c) => t + (Number(c.valor_cents) || 0), 0)
    const referencia = window.prompt(
      `Vais marcar ${ids.length} comissão(ões) como PAGAS — ${euros(total)}.\n\n` +
        `Isto não transfere dinheiro: regista que TU já pagaste. Escreve a referência do pagamento (transferência, MB Way, nota de crédito):`,
    )
    if (!referencia?.trim()) return
    const r = await pedir("/api/admin/vendas/comissoes", { accao: "pagar", ids, confirmar: true, pagamento_ref: referencia.trim() })
    if (r) {
      toast({ title: `${r.feitas} marcada(s) como paga(s)`, description: `Referência: ${referencia.trim()}` })
      void carregar()
    }
  }

  const [novaRegra, setNovaRegra] = useState({ papel: "closer" as Papel, pack: "premium_monthly", pct: "", aplica_a: "primeira", plano: "padrao" })

  async function gravarRegra() {
    if (!novaRegra.pct.trim()) {
      toast({ title: "Falta a percentagem", description: "Sem percentagem definida não se calcula nada — e é isso que está certo.", variant: "destructive" })
      return
    }
    const r = await pedir("/api/admin/vendas/regras", {
      accao: "definir",
      ...novaRegra,
      pct: Number(novaRegra.pct.replace(",", ".")),
    })
    if (r) {
      toast({
        title: "Percentagem gravada",
        description: r.aviso ?? "Vale para as vendas de agora em diante; o que já foi calculado não muda.",
      })
      setNovaRegra((f) => ({ ...f, pct: "" }))
      void carregar()
    }
  }

  async function marcarTarefa(id: string, estado: string) {
    const r = await pedir("/api/admin/vendas/tarefas", { id, estado }, "PATCH")
    if (r) void carregar()
  }

  if (!montado || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black">
        <Loader2 className="h-6 w-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }
  if (!user || !isAdmin) return null

  const porPagar = comissoes.filter((c) => c.estado === "pendente" || c.estado === "aprovada")

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-6">
        {/* Cabeçalho */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin">
              <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
                <ArrowLeft className="mr-1 h-4 w-4" /> Admin
              </Button>
            </Link>
            <h1 className="text-xl font-semibold">
              Equipa de <span className="text-[#D2A63C]">Vendas</span>
            </h1>
          </div>
          <Button variant="outline" size="sm" onClick={() => void carregar()} disabled={ocupado} className="border-gray-700 text-gray-300">
            {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>

        {/* O QUE FALTA DECIDIR — em cima, porque é dinheiro a acumular sem regra */}
        {semComissao.length > 0 && (
          <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="mb-1 flex items-center gap-2 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <span className="text-sm font-medium">
                {semComissao.length} venda(s) trabalhadas pela equipa que não pagaram nada a ninguém
              </span>
            </div>
            <p className="text-xs text-amber-200/80">
              Falta a percentagem para o pack. Enquanto não a definires (aba <b>Regras</b>), estas vendas ficam registadas e sem
              comissão — de propósito: o sistema não inventa percentagens. Packs:{" "}
              {[...new Set(semComissao.map((v) => String(v.pack ?? "(sem pack)")))].join(", ")}
            </p>
          </div>
        )}

        {/* Cartões */}
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <div className={CAIXA}>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Por pagar</p>
            <p className="mt-1 text-lg font-semibold text-[#D2A63C]">{euros((totais.pendente ?? 0) + (totais.aprovada ?? 0))}</p>
            <p className="text-[11px] text-gray-500">{porPagar.length} comissões</p>
          </div>
          <div className={CAIXA}>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Já pago</p>
            <p className="mt-1 text-lg font-semibold">{euros(totais.paga)}</p>
          </div>
          <div className={CAIXA}>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">A descontar (devolvido)</p>
            <p className="mt-1 text-lg font-semibold text-red-400">{euros(totais.aDescontar)}</p>
            <p className="text-[11px] text-gray-500">pago e depois devolvido</p>
          </div>
          <div className={CAIXA}>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Negócios abertos</p>
            <p className="mt-1 text-lg font-semibold">
              {Object.entries(porEstado)
                .filter(([e]) => e !== "ganho" && e !== "perdido")
                .reduce((t, [, n]) => t + n, 0)}
            </p>
          </div>
        </div>

        {/* Abas */}
        <div className="mb-4 flex flex-wrap gap-2">
          {(
            [
              ["pipeline", "Pipeline", Users],
              ["tarefas", "Tarefas", ListChecks],
              ["regras", "Regras", Percent],
              ["comissoes", "Comissões", Euro],
              ["relatorios", "Relatórios", BarChart3],
            ] as const
          ).map(([chave, rotulo, Icone]) => (
            <button
              key={chave}
              onClick={() => setAba(chave as Aba)}
              className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm transition ${
                aba === chave ? "border-[#D2A63C]/60 bg-[#D2A63C]/10 text-[#D2A63C]" : "border-gray-800 text-gray-400 hover:text-white"
              }`}
            >
              <Icone className="h-3.5 w-3.5" /> {rotulo}
            </button>
          ))}
        </div>

        {/* ── PIPELINE ── */}
        {aba === "pipeline" && (
          <div className={CAIXA}>
            <p className="mb-3 text-xs text-gray-500">
              A atribuição é o que PAGA. Mudar o estado deixa rasto no percurso do negócio; não cria comissão — essa nasce do
              pagamento confirmado.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className={TH}>Negócio</th>
                    <th className={TH}>Estado</th>
                    {PAPEIS.map((p) => (
                      <th key={p} className={TH}>
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {negocios.map((n) => (
                    <tr key={n.id} className="border-b border-gray-800/50">
                      <td className={TD}>
                        <div className="font-medium text-white">{n.nome}</div>
                        <div className="text-[11px] text-gray-500">
                          {String(n.pack_previsto ?? "—")} · {String(n.origem ?? "—")} · {dia(n.atualizado_em)}
                        </div>
                      </td>
                      <td className={TD}>
                        <select
                          value={n.estado}
                          onChange={(e) => void mudarEstado(n.id, e.target.value)}
                          className="rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white"
                        >
                          {ESTADOS.map((e) => (
                            <option key={e} value={e}>
                              {e}
                            </option>
                          ))}
                        </select>
                      </td>
                      {PAPEIS.map((papel) => (
                        <td key={papel} className={TD}>
                          <select
                            value={String(n[COLUNA[papel]] ?? "")}
                            onChange={(e) => void atribuir(n.id, papel, e.target.value)}
                            className="max-w-[130px] rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-white"
                          >
                            <option value="">—</option>
                            {pessoas.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.nome}
                                {p.plano ? ` (${p.plano})` : ""}
                              </option>
                            ))}
                          </select>
                        </td>
                      ))}
                    </tr>
                  ))}
                  {negocios.length === 0 && (
                    <tr>
                      <td className={`${TD} text-gray-500`} colSpan={7}>
                        Sem negócios. Cria-os pela API (`POST /api/admin/vendas/negocios`) ou pelo funil quando estiver ligado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── TAREFAS ── */}
        {aba === "tarefas" && (
          <div className={CAIXA}>
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className={TH}>Tarefa</th>
                  <th className={TH}>Quem</th>
                  <th className={TH}>Prazo</th>
                  <th className={TH}>Estado</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {tarefas.map((t) => (
                  <tr key={t.id} className="border-b border-gray-800/50">
                    <td className={TD}>{t.titulo}</td>
                    <td className={TD}>{nomeDe(t.responsavel_id)}</td>
                    <td className={TD}>
                      <span className={t.atrasada ? "text-red-400" : ""}>{t.prazo ? dia(t.prazo) : "—"}</span>
                    </td>
                    <td className={TD}>
                      <Badge variant="outline" className="border-gray-700 text-xs text-gray-300">
                        {t.estado}
                      </Badge>
                    </td>
                    <td className={TD}>
                      {t.estado === "aberta" && (
                        <Button size="sm" variant="outline" className="border-gray-700 text-xs" onClick={() => void marcarTarefa(t.id, "feita")}>
                          <Check className="mr-1 h-3 w-3" /> Feita
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
                {tarefas.length === 0 && (
                  <tr>
                    <td className={`${TD} text-gray-500`} colSpan={5}>
                      Sem tarefas.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── REGRAS ── */}
        {aba === "regras" && (
          <div className="space-y-4">
            <div className={CAIXA}>
              <p className="mb-3 text-xs text-gray-500">
                Mudar uma percentagem FECHA a anterior e abre outra. O que já foi calculado continua a apontar para a regra antiga —
                é assim que uma comissão de Agosto se explica com a percentagem de Agosto.
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <select
                  value={novaRegra.papel}
                  onChange={(e) => setNovaRegra((f) => ({ ...f, papel: e.target.value as Papel }))}
                  className="rounded border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white"
                >
                  {PAPEIS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <Input
                  value={novaRegra.pack}
                  onChange={(e) => setNovaRegra((f) => ({ ...f, pack: e.target.value }))}
                  placeholder="pack (ou * para todos)"
                  className="w-48 border-gray-700 bg-gray-800 text-sm"
                />
                <select
                  value={novaRegra.aplica_a}
                  onChange={(e) => setNovaRegra((f) => ({ ...f, aplica_a: e.target.value }))}
                  className="rounded border border-gray-700 bg-gray-800 px-2 py-2 text-sm text-white"
                >
                  <option value="primeira">1.º pagamento</option>
                  <option value="renovacao">renovação</option>
                  <option value="ambos">ambos</option>
                </select>
                <Input
                  value={novaRegra.pct}
                  onChange={(e) => setNovaRegra((f) => ({ ...f, pct: e.target.value }))}
                  placeholder="%"
                  className="w-24 border-gray-700 bg-gray-800 text-sm"
                />
                <Input
                  value={novaRegra.plano}
                  onChange={(e) => setNovaRegra((f) => ({ ...f, plano: e.target.value }))}
                  placeholder="plano"
                  className="w-40 border-gray-700 bg-gray-800 text-sm"
                />
                <Button onClick={() => void gravarRegra()} className="bg-[#D2A63C] text-black hover:bg-[#c09a36]">
                  Gravar
                </Button>
              </div>
            </div>

            <div className={CAIXA}>
              <h3 className="mb-2 text-sm font-medium">Em vigor</h3>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className={TH}>Plano</th>
                    <th className={TH}>Papel</th>
                    <th className={TH}>Pack</th>
                    <th className={TH}>Aplica a</th>
                    <th className={TH}>%</th>
                    <th className={TH}>Desde</th>
                  </tr>
                </thead>
                <tbody>
                  {regras.map((r) => (
                    <tr key={r.id} className="border-b border-gray-800/50">
                      <td className={TD}>{r.plano}</td>
                      <td className={TD}>{r.papel}</td>
                      <td className={TD}>{r.pack}</td>
                      <td className={TD}>{r.aplica_a}</td>
                      <td className={`${TD} text-[#D2A63C]`}>{r.pct} %</td>
                      <td className={TD}>{dia(r.valido_de)}</td>
                    </tr>
                  ))}
                  {regras.length === 0 && (
                    <tr>
                      <td className={`${TD} text-gray-500`} colSpan={6}>
                        Nenhuma percentagem definida. Até haver, nenhuma venda paga nada a ninguém — e o livro diz porquê.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={CAIXA}>
              <h3 className="mb-1 text-sm font-medium">Degraus de rank</h3>
              <p className="mb-2 text-xs text-gray-500">
                O degrau sobe a percentagem da PRÓPRIA pessoa (não acrescenta níveis a pagar) e entra como proporção sobre o degrau
                base — é isso que impede um degrau das subscrições de furar o tecto do MTM Funded.
              </p>
              <div className="flex flex-wrap gap-2">
                {degraus.map((d) => (
                  <Badge key={d.id} variant="outline" className="border-gray-700 text-xs text-gray-300">
                    {d.papel} · {d.min_vendas}+ vendas/mês → {d.pct} %
                  </Badge>
                ))}
                {degraus.length === 0 && <span className="text-xs text-gray-500">Sem degraus definidos.</span>}
              </div>
            </div>
          </div>
        )}

        {/* ── COMISSÕES ── */}
        {aba === "comissoes" && (
          <div className={CAIXA}>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                className="border-gray-700 text-xs"
                disabled={!comissoes.some((c) => c.estado === "pendente")}
                onClick={() => void aprovar(comissoes.filter((c) => c.estado === "pendente").map((c) => c.id))}
              >
                Aprovar todas as pendentes
              </Button>
              <Button
                size="sm"
                className="bg-[#D2A63C] text-xs text-black hover:bg-[#c09a36]"
                disabled={!comissoes.some((c) => c.estado === "aprovada")}
                onClick={() => void pagar(comissoes.filter((c) => c.estado === "aprovada").map((c) => c.id))}
              >
                Marcar aprovadas como pagas…
              </Button>
              <span className="text-[11px] text-gray-500">
                Pagar não transfere nada: regista que já pagaste, com referência e autor.
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px]">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className={TH}>Quem</th>
                    <th className={TH}>Papel</th>
                    <th className={TH}>Conta</th>
                    <th className={TH}>Valor</th>
                    <th className={TH}>Estado</th>
                    <th className={TH}>Venda</th>
                  </tr>
                </thead>
                <tbody>
                  {comissoes.map((c) => {
                    const venda = c.venda as Record<string, unknown> | null
                    return (
                      <tr key={c.id} className="border-b border-gray-800/50">
                        <td className={TD}>{nomeDe(c.beneficiario_id)}</td>
                        <td className={TD}>{c.papel}</td>
                        <td className={`${TD} text-[11px] text-gray-500`}>
                          {euros(c.base_cents)} × {String(c.pct)} %
                          {c.rank_min_vendas !== null && c.rank_min_vendas !== undefined
                            ? ` (degrau ${String(c.rank_min_vendas)}+, ${String(c.vendas_no_mes)} no mês)`
                            : ""}
                          {c.numero_pagamento ? ` · pag. nº ${String(c.numero_pagamento)}` : ""}
                        </td>
                        <td className={`${TD} font-medium`}>{euros(c.valor_cents)}</td>
                        <td className={TD}>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              c.estornada_em
                                ? "border-red-500/50 text-red-400"
                                : c.estado === "paga"
                                  ? "border-green-500/40 text-green-400"
                                  : "border-gray-700 text-gray-300"
                            }`}
                          >
                            {c.estornada_em ? "estornada" : c.estado}
                          </Badge>
                        </td>
                        <td className={`${TD} text-[11px] text-gray-500`}>
                          {String(venda?.pack ?? "—")} · {String(venda?.tipo ?? "")} · {dia(venda?.pago_em)}
                        </td>
                      </tr>
                    )
                  })}
                  {comissoes.length === 0 && (
                    <tr>
                      <td className={`${TD} text-gray-500`} colSpan={6}>
                        Sem comissões. Nascem de pagamentos confirmados em negócios com equipa atribuída.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── RELATÓRIOS ── */}
        {aba === "relatorios" && relatorio && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className={CAIXA}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Receita (90d)</p>
                <p className="mt-1 text-lg font-semibold">{String((relatorio.total as Record<string, unknown>)?.valor ?? "—")}</p>
                <p className="text-[11px] text-red-400">
                  estornado {String((relatorio.total as Record<string, unknown>)?.estornado ?? "—")}
                </p>
              </div>
              <div className={CAIXA}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Custo de vendas</p>
                <p className="mt-1 text-lg font-semibold text-[#D2A63C]">
                  {String((relatorio.custoDeVendas as Record<string, unknown>)?.total ?? "—")}
                </p>
                <p className="text-[11px] text-gray-500">
                  {String((relatorio.custoDeVendas as Record<string, unknown>)?.pct_da_receita ?? "—")} % da receita
                </p>
              </div>
              <div className={CAIXA}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Vendas sem equipa</p>
                <p className="mt-1 text-lg font-semibold">{String((relatorio.semEquipa as Record<string, unknown>)?.valor ?? "—")}</p>
                <p className="text-[11px] text-gray-500">estas é que o MLM binário paga</p>
              </div>
              <div className={CAIXA}>
                <p className="text-[11px] uppercase tracking-wider text-gray-500">Por pagar à equipa</p>
                <p className="mt-1 text-lg font-semibold">
                  {String((relatorio.custoDeVendas as Record<string, unknown>)?.por_pagar ?? "—")}
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className={CAIXA}>
                <h3 className="mb-2 text-sm font-medium">Por pack</h3>
                {((relatorio.porPack as Array<Record<string, unknown>>) ?? []).map((p) => (
                  <div key={String(p.chave)} className="flex justify-between border-b border-gray-800/50 py-1 text-sm">
                    <span className="text-gray-300">{String(p.chave)}</span>
                    <span className="text-gray-400">
                      {String(p.vendas)} · {String(p.valor)}
                    </span>
                  </div>
                ))}
              </div>
              <div className={CAIXA}>
                <h3 className="mb-2 text-sm font-medium">Funil</h3>
                {((relatorio.funil as Record<string, unknown>)?.andares as Array<Record<string, unknown>> ?? []).map((a) => (
                  <div key={String(a.nome)} className="flex justify-between border-b border-gray-800/50 py-1 text-sm">
                    <span className="text-gray-300">{String(a.nome)}</span>
                    <span className="text-gray-400">
                      {String(a.n)}
                      {a.passou !== null && a.passou !== undefined ? ` (${String(a.passou)} %)` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className={CAIXA}>
              <h3 className="mb-2 text-sm font-medium">Por pessoa</h3>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px]">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className={TH}>Pessoa</th>
                      <th className={TH}>Papel</th>
                      <th className={TH}>Vendas</th>
                      <th className={TH}>Valor gerado</th>
                      <th className={TH}>Comissões</th>
                      <th className={TH}>Por pagar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {((relatorio.porPessoa as Array<Record<string, unknown>>) ?? []).map((p, i) => (
                      <tr key={`${String(p.pessoa)}-${String(p.papel)}-${i}`} className="border-b border-gray-800/50">
                        <td className={TD}>{String(p.nome)}</td>
                        <td className={TD}>{String(p.papel)}</td>
                        <td className={TD}>{String(p.vendas)}</td>
                        <td className={TD}>{String(p.valor)}</td>
                        <td className={TD}>{String((p.comissoes as Record<string, unknown>)?.ganho ?? "—")}</td>
                        <td className={TD}>{String((p.comissoes as Record<string, unknown>)?.por_pagar ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
