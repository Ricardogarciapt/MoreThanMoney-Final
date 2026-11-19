"use client"

/**
 * O GESTOR DE ROTAS — o ecrã simples de «quem copia o quê» (pedido do dono, 19/11/2026).
 *
 * 2.ª ronda (mesmo dia): o dono pediu apresentação ao nível de produtos bem aceites. O desenho segue
 * o que os gestores de cópia de referência (painel de masters do B2COPY: dono, plataforma, saldo e
 * equity à vista em cada linha) e os quadros Kanban maduros fazem:
 *   · faixa de números no topo (estratégias, contas, live, capital sob cópia);
 *   · cabeçalho de coluna com o que interessa à cabeça: a conta mestre e o resultado dela, a cadeia
 *     sinal → mestre → apps, contagens e a barra live/sombra/parado;
 *   · cartões com avatar, saldo em algarismos tabulares e só os sinais que mudam decisões;
 *   · arrasto com alvo explícito («largar aqui»), colunas que não aceitam ficam apagadas com o motivo,
 *     e um aviso com «Desfazer» depois de cada mudança;
 *   · duas lentes sobre os mesmos dados: Quadro e Lista, com os mesmos filtros.
 *
 * Cada mudança escreve pela via da cadeia (`/api/admin/mtmauto-copia/cadeia`: desejo do cliente +
 * ressincronização das rotas), por isso a app MTM Auto, o WebTrader e o MTM System leem o mesmo.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import { ArrowRight, Columns3, GripVertical, LayoutList, Loader2, Lock, MessageSquare, Radio, Search, Send, Undo2, Webhook, X } from "lucide-react"
import { podeLigar, type Cadeia, type NoEstrategia, type SubscritorCadeia } from "@/lib/copia-contas/cadeia"
import {
  APP_DA_ORIGEM, CURTO_PLATAFORMA, NOME_PLATAFORMA, bateNaProcura, botoesTipoConta, capitalDaColuna, desfazerDe, fonteDaEstrategia,
  fraseDoPedido, iniciais, organizarGestor, origemDaRef, pedidoDoLargar, plataformaDaRef, podeMexer,
  type ContaGestor, type PedidoLargar, type TipoConta, type TipoFonte,
} from "@/lib/copia-contas/gestor-rotas"
import { fmtNum, pedirCentro } from "../centro/ui"

const ICONE_FONTE: Record<TipoFonte, typeof Webhook> = { webhook: Webhook, telegram: Send, chat: MessageSquare, externa: Radio, desconhecida: Radio }
const COR_FONTE: Record<TipoFonte, string> = { webhook: "#D2A63C", telegram: "#38bdf8", chat: "#a1a1aa", externa: "#a78bfa", desconhecida: "#52525b" }
const COR_EFECTIVO = { live: "#34d399", sombra: "#60a5fa", parado: "#52525b" } as const
const NOME_EFECTIVO = { live: "Live", sombra: "Sombra", parado: "Parado" } as const

type Arrasto = { ref: string; chave: string; de: string | null; rotulo: string }
type Estado = "" | "live" | "sombra"
const SEM = "__sem__"
const CHAVE_LENTE = "centro:rotas:lente"
const dinheiro = (v: number) => v.toLocaleString("pt-PT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function GestorRotas({ c, recarregar, contasIniciais }: { c: Cadeia; recarregar: () => void; contasIniciais?: ContaGestor[] }) {
  const [contas, setContas] = useState<ContaGestor[]>(contasIniciais ?? [])
  const [q, setQ] = useState("")
  const [tipo, setTipo] = useState<TipoConta>("")
  const [estado, setEstado] = useState<Estado>("")
  const [lente, setLente] = useState<"quadro" | "lista">("quadro")
  const [aviso, setAviso] = useState<null | { tom: "ok" | "erro" | "a-gravar"; texto: string; desfazer?: PedidoLargar }>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const [aArrastar, setAArrastar] = useState<Arrasto | null>(null)
  const [verDesligadas, setVerDesligadas] = useState(false)
  const quadro = useRef<HTMLDivElement>(null)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { try { if (window.localStorage.getItem(CHAVE_LENTE) === "lista") setLente("lista") } catch { /* fica o quadro */ } }, [])
  useEffect(() => { try { window.localStorage.setItem(CHAVE_LENTE, lente) } catch { /* nada */ } }, [lente])

  const lerContas = useCallback(async () => {
    const r = await pedirCentro<{ contas?: ContaGestor[] }>("/api/admin/mtmauto-copia/contas")
    if (r.success) setContas(r.data?.contas ?? [])
  }, [])
  useEffect(() => { if (!contasIniciais) void lerContas() }, [lerContas, contasIniciais])

  const g = useMemo(() => organizarGestor(c, contas), [c, contas])
  const contaPorRef = useMemo(() => new Map(contas.map((x) => [x.ref.toLowerCase(), x])), [contas])
  const porSlug = useMemo(() => new Map(c.estrategias.map((n) => [n.slug.toLowerCase(), n])), [c.estrategias])
  const nomes = useMemo(() => new Map(c.estrategias.map((n) => [n.slug.toLowerCase(), n.nome])), [c.estrategias])

  // ── filtros (os mesmos nas duas lentes) ──
  const passa = useCallback((s: { ref: string; etiqueta?: string | null; descricao?: string | null; email?: string | null; efectivo?: string }) => {
    const conta = contaPorRef.get(s.ref.toLowerCase())
    if (!bateNaProcura(q, s, conta)) return false
    if (tipo && plataformaDaRef(s.ref, conta) !== tipo) return false
    if (estado && s.efectivo !== estado) return false
    return true
  }, [q, tipo, estado, contaPorRef])

  const todasNasColunas = useMemo(() => g.ativas.flatMap((n) => n.subscritores.map((s) => ({ ...s, plataforma: plataformaDaRef(s.ref, contaPorRef.get(s.ref.toLowerCase())) }))), [g.ativas, contaPorRef])
  const tipos = useMemo(() => botoesTipoConta([...todasNasColunas, ...g.semEstrategia]), [todasNasColunas, g.semEstrategia])

  // ── números do topo ──
  const kpi = useMemo(() => {
    const contasUnicas = new Set(todasNasColunas.map((s) => s.chave)).size
    const live = new Set(todasNasColunas.filter((s) => s.efectivo === "live").map((s) => s.chave)).size
    const capital = capitalDaColuna(todasNasColunas, contaPorRef)
    return { contasUnicas, live, capital }
  }, [todasNasColunas, contaPorRef])

  // ── escrever ──
  const mostrar = (a: typeof aviso, ms = 8000) => {
    if (temporizador.current) clearTimeout(temporizador.current)
    setAviso(a)
    if (a && a.tom !== "a-gravar") temporizador.current = setTimeout(() => setAviso(null), ms)
  }
  const executar = async (pedido: PedidoLargar, rotulo: string, comDesfazer = true) => {
    mostrar({ tom: "a-gravar", texto: "A gravar e a ressincronizar as rotas…" })
    const r = await pedirCentro<{ mensagem?: string; error?: string }>("/api/admin/mtmauto-copia/cadeia", { method: "POST", body: pedido })
    if (r.success) {
      mostrar({ tom: "ok", texto: fraseDoPedido(pedido, nomes, rotulo), desfazer: comDesfazer ? desfazerDe(pedido) : undefined })
      recarregar(); void lerContas()
    } else mostrar({ tom: "erro", texto: `Não deu para mover: ${r.error ?? "erro desconhecido"}. Nada mudou.` }, 12000)
  }
  const largar = (a: Arrasto, paraSlug: string | null, copiar: boolean) => {
    if (a.de === paraSlug) return
    const de = a.de ? porSlug.get(a.de.toLowerCase()) ?? null : null
    const para = paraSlug ? porSlug.get(paraSlug.toLowerCase()) ?? null : null
    const v = pedidoDoLargar({ ref: a.ref, chave: a.chave, de, para, copiar })
    if (!v.ok) { mostrar({ tom: "erro", texto: v.motivo }, 10000); return }
    void executar(v.pedido, a.rotulo)
  }

  /** Durante o arrasto, cada coluna diz se aceita — e porquê não, quando não aceita. */
  const motivoRecusa = (n: NoEstrategia): string | null => {
    if (!aArrastar || aArrastar.de === n.slug) return null
    const v = podeLigar(n, { chave: aArrastar.chave, ref: aArrastar.ref }, aArrastar.de ? porSlug.get(aArrastar.de.toLowerCase()) : null)
    return v.ok ? null : v.mensagem
  }

  const aoComecar = (e: DragEvent, a: Arrasto) => {
    setAArrastar(a)
    e.dataTransfer.effectAllowed = "copyMove"
    e.dataTransfer.setData("text/plain", a.ref)
  }
  const aoAcabar = () => { setAArrastar(null); setSobre(null) }
  const deslizar = (e: DragEvent) => {
    const el = quadro.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const d = e.clientX > r.right - 90 ? 1 : e.clientX < r.left + 90 ? -1 : 0
    if (d) el.scrollLeft += d * 22
  }
  const zona = (id: string, recusa: string | null) => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = recusa ? "none" : e.altKey ? "copy" : "move"; if (sobre !== id) setSobre(id) },
    onDragLeave: (e: DragEvent) => { if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) setSobre((s) => (s === id ? null : s)) },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const a = aArrastar
      aoAcabar()
      if (!a) return
      if (recusa) { mostrar({ tom: "erro", texto: recusa }, 10000); return }
      largar(a, id === SEM ? null : id, e.altKey)
    },
  })

  const rotuloDe = (s: { etiqueta?: string | null; email?: string | null; ref: string }) => s.etiqueta ?? contaPorRef.get(s.ref.toLowerCase())?.etiqueta ?? s.email ?? s.ref
  const semVisiveis = g.semEstrategia.filter((x) => passa({ ref: x.ref, etiqueta: x.etiqueta, descricao: x.rotulo, email: x.email }) && !estado)

  return (
    <div className="space-y-4">
      {/* ── 1. números ── */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.06] lg:grid-cols-4">
        <Numero rotulo="Estratégias ligadas" valor={String(g.ativas.length)} nota={g.desligadas.length ? `${g.desligadas.length} desligadas` : "todas ligadas"} />
        <Numero rotulo="Contas a copiar" valor={String(kpi.contasUnicas)} nota={`${g.semEstrategia.length} sem estratégia`} />
        <Numero rotulo="Em live" valor={String(kpi.live)} nota={kpi.contasUnicas ? `${Math.round((kpi.live / kpi.contasUnicas) * 100)} % das contas` : "—"} barra={kpi.contasUnicas ? kpi.live / kpi.contasUnicas : 0} />
        <Numero rotulo="Capital sob cópia" valor={kpi.capital.conhecidas ? dinheiro(kpi.capital.total) : "—"} nota={`saldo lido em ${kpi.capital.conhecidas} de ${kpi.contasUnicas} contas`} />
      </div>

      {/* ── 2. barra de ferramentas ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 lg:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar cliente, email, login…" className="w-full rounded-xl border border-white/10 bg-zinc-900/70 py-2 pl-9 pr-3 text-[12.5px] text-white placeholder:text-zinc-600 transition-colors focus:border-[#D2A63C]/50 focus:outline-none" />
        </div>
        <Segmentos valor={tipo} aoMudar={(v) => setTipo(v as TipoConta)} opcoes={tipos.map((t) => ({ id: t.id, nome: t.id ? CURTO_NOME(t.id) : "Todas", n: t.n }))} />
        <Segmentos valor={estado} aoMudar={(v) => setEstado(v as Estado)} opcoes={[{ id: "", nome: "Todos" }, { id: "live", nome: "Live" }, { id: "sombra", nome: "Sombra" }]} />
        <div className="ml-auto flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-400" title={c.motor.escritaNoProcesso ? "o motor da VPS está a escrever" : "o motor da VPS está em sombra"}>
            <span className={`h-2 w-2 rounded-full ${c.motor.kill ? "bg-rose-500" : c.motor.ligado ? "animate-pulse bg-emerald-400" : "bg-amber-400"}`} />
            Motor {c.motor.kill ? "parado (kill)" : c.motor.ligado ? "a correr" : "desligado"}
          </span>
          <Segmentos valor={lente} aoMudar={(v) => setLente(v as "quadro" | "lista")} opcoes={[{ id: "quadro", nome: "Quadro", icone: <Columns3 className="h-3.5 w-3.5" /> }, { id: "lista", nome: "Lista", icone: <LayoutList className="h-3.5 w-3.5" /> }]} />
        </div>
      </div>

      {g.presasEmDesligadas.length > 0 && (
        <button type="button" onClick={() => setVerDesligadas(true)} className="flex w-full items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-2.5 text-left text-[12px] text-amber-200 transition-colors hover:bg-amber-500/10">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
          <span className="flex-1">
            <b className="font-semibold">{g.presasEmDesligadas.length} conta{g.presasEmDesligadas.length === 1 ? "" : "s"}</b> ainda segue{g.presasEmDesligadas.length === 1 ? "" : "m"} uma estratégia desligada e não recebe{g.presasEmDesligadas.length === 1 ? "" : "m"} sinais novos: {g.presasEmDesligadas.map((p) => `${rotuloDe(p.s)} (${p.estrategia.nome})`).join(" · ")}
          </span>
          <span className="shrink-0 text-amber-300/80">ver e mover →</span>
        </button>
      )}

      {/* ── 3a. lente QUADRO ── */}
      {lente === "quadro" && (
        <div ref={quadro} onDragOver={deslizar} className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-4 [scrollbar-width:thin]">
          <Coluna id={SEM} sobre={sobre === SEM} zona={zona(SEM, null)} arrastoActivo={Boolean(aArrastar)} tracejada
            alvoTexto={aArrastar?.de ? "Largar aqui · deixa de seguir" : null}>
            <div className="px-4 pb-3 pt-4">
              <p className="text-[14px] font-semibold tracking-tight text-zinc-100">Sem estratégia</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500">Contas de clientes ligadas que não copiam nada. Arrasta para uma estratégia para começar.</p>
            </div>
            <Pilha vazio={contas.length ? "Todas as contas activas seguem uma estratégia." : "A ler as contas…"} aCarregar={!contas.length && !contasIniciais}>
              {semVisiveis.slice(0, 80).map((x) => (
                <Cartao key={x.ref} refConta={x.ref} conta={x} titulo={x.etiqueta ?? x.nome ?? x.email ?? x.ref} subtitulo={x.email}
                  meta={`${x.login ?? "—"}${x.servidor ? ` · ${x.servidor}` : ""}${x.demo ? " · demo" : ""}`}
                  aArrastar={aArrastar?.ref === x.ref}
                  aoComecar={(e) => aoComecar(e, { ref: x.ref, chave: x.ref, de: null, rotulo: x.etiqueta ?? x.email ?? x.ref })} aoAcabar={aoAcabar}
                  destinos={g.ativas} aoEscolher={(slug, copiar) => largar({ ref: x.ref, chave: x.ref, de: null, rotulo: x.etiqueta ?? x.email ?? x.ref }, slug, copiar)} />
              ))}
            </Pilha>
          </Coluna>

          {g.ativas.map((n) => {
            const recusa = motivoRecusa(n)
            const visiveis = n.subscritores.filter(passa)
            return (
              <Coluna key={n.chave} id={n.slug} sobre={sobre === n.slug} zona={zona(n.slug, recusa)} arrastoActivo={Boolean(aArrastar)} recusa={recusa}
                alvoTexto={aArrastar && aArrastar.de !== n.slug && !recusa ? `Largar aqui · passa a seguir ${n.nome}` : null}>
                <Cabecalho n={n} capital={capitalDaColuna(n.subscritores, contaPorRef)} />
                <Pilha vazio={q || tipo || estado ? "Nenhuma conta com estes filtros." : "Ninguém copia esta estratégia. Arrasta contas para aqui."}>
                  {visiveis.map((s) => {
                    const conta = contaPorRef.get(s.ref.toLowerCase())
                    const rot = rotuloDe(s)
                    return (
                      <Cartao key={s.rotaId} refConta={s.ref} conta={conta} s={s} titulo={rot} subtitulo={s.email ?? conta?.email ?? null}
                        meta={`${conta?.login ?? "—"} · ${s.lote}${s.abertas ? ` · ${s.abertas} aberta${s.abertas === 1 ? "" : "s"}` : ""}`}
                        aArrastar={aArrastar?.ref === s.ref && aArrastar.de === n.slug}
                        aoComecar={(e) => aoComecar(e, { ref: s.ref, chave: s.chave, de: n.slug, rotulo: rot })} aoAcabar={aoAcabar}
                        destinos={g.ativas.filter((d) => d.slug !== n.slug)}
                        aoEscolher={(slug, copiar) => largar({ ref: s.ref, chave: s.chave, de: n.slug, rotulo: rot }, slug, copiar)}
                        aoDesligar={() => largar({ ref: s.ref, chave: s.chave, de: n.slug, rotulo: rot }, null, false)} />
                    )
                  })}
                </Pilha>
              </Coluna>
            )
          })}
        </div>
      )}

      {/* ── 3b. lente LISTA ── */}
      {lente === "lista" && (
        <Lista g={g} contas={contas} contaPorRef={contaPorRef} passa={passa} estadoFiltro={estado}
          mover={(a, para, copiar) => largar(a, para, copiar)} />
      )}

      {/* ── 4. desligadas ── */}
      {g.desligadas.length > 0 && (
        <section className="overflow-hidden rounded-2xl border border-white/[0.06] bg-zinc-950/50">
          <button type="button" onClick={() => setVerDesligadas((v) => !v)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.02]">
            <span className="text-[12.5px] font-medium text-zinc-300">Estratégias desligadas</span>
            <span className="rounded-md bg-white/[0.06] px-1.5 py-px font-mono text-[10.5px] text-zinc-400">{g.desligadas.length}</span>
            <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-500">{g.desligadas.map((n) => n.nome).join(" · ")}</span>
            <span className="text-[11px] text-zinc-500">{verDesligadas ? "esconder" : "mostrar"}</span>
          </button>
          {verDesligadas && (
            <div className="flex gap-3 overflow-x-auto border-t border-white/[0.05] p-3">
              {g.desligadas.map((n) => (
                <Coluna key={n.chave} id={n.slug} sobre={false} zona={{}} arrastoActivo={false} apagada alvoTexto={null}>
                  <Cabecalho n={n} capital={capitalDaColuna(n.subscritores, contaPorRef)} />
                  <Pilha vazio="Sem contas.">
                    {n.subscritores.map((s) => {
                      const conta = contaPorRef.get(s.ref.toLowerCase())
                      const rot = rotuloDe(s)
                      return (
                        <Cartao key={s.rotaId} refConta={s.ref} conta={conta} s={s} titulo={rot} subtitulo={s.email ?? null}
                          meta={`${conta?.login ?? "—"} · ${s.lote}`} aArrastar={false}
                          aoComecar={(e) => aoComecar(e, { ref: s.ref, chave: s.chave, de: n.slug, rotulo: rot })} aoAcabar={aoAcabar}
                          destinos={g.ativas}
                          aoEscolher={(slug, copiar) => largar({ ref: s.ref, chave: s.chave, de: n.slug, rotulo: rot }, slug, copiar)}
                          aoDesligar={() => largar({ ref: s.ref, chave: s.chave, de: n.slug, rotulo: rot }, null, false)} />
                      )
                    })}
                  </Pilha>
                </Coluna>
              ))}
            </div>
          )}
        </section>
      )}

      <p className="max-w-[90ch] text-[11px] leading-relaxed text-zinc-600">
        As colunas são as estratégias ligadas na admin da app MTM Auto. Mudar uma conta de estratégia grava a escolha do cliente e as rotas ressincronizam
        sozinhas, por isso a app MTM Auto, o WebTrader e o MTM System mostram o mesmo. «Live / Sombra / Parado» é o que o motor decide agora para cada conta.
        Arrastar com <kbd className="rounded border border-white/10 px-1 text-[10px]">Alt</kbd> deixa a conta nas duas estratégias.
      </p>

      {/* ── aviso com desfazer ── */}
      {aviso && (
        <div role="status" className="fixed bottom-5 left-1/2 z-50 flex max-w-[92vw] -translate-x-1/2 items-center gap-3 rounded-xl border border-white/10 bg-zinc-900/95 px-4 py-2.5 text-[12.5px] text-zinc-100 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)] backdrop-blur">
          {aviso.tom === "a-gravar" ? <Loader2 className="h-4 w-4 animate-spin text-[#D2A63C]" /> : <span className={`h-2 w-2 rounded-full ${aviso.tom === "ok" ? "bg-emerald-400" : "bg-rose-400"}`} />}
          <span className="min-w-0">{aviso.texto}</span>
          {aviso.desfazer && (
            <button type="button" onClick={() => { const d = aviso.desfazer!; void executar(d, "A conta", false) }} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 font-medium text-[#E9C46A] transition-colors hover:bg-[#D2A63C]/15">
              <Undo2 className="h-3.5 w-3.5" /> Desfazer
            </button>
          )}
          {aviso.tom !== "a-gravar" && <button type="button" aria-label="Fechar" onClick={() => setAviso(null)} className="text-zinc-500 hover:text-white"><X className="h-3.5 w-3.5" /></button>}
        </div>
      )}
    </div>
  )
}

const CURTO_NOME = (t: string) => (t === "mt5" ? "MT5" : t === "mt4" ? "MT4" : t === "tradelocker" ? "TradeLocker" : t === "mtmfunded" ? "MTM Funded" : t)

// ── peças ───────────────────────────────────────────────────────────────────

function Numero({ rotulo, valor, nota, barra }: { rotulo: string; valor: string; nota: string; barra?: number }) {
  return (
    <div className="bg-zinc-950 px-4 py-3.5">
      <p className="text-[11px] text-zinc-500">{rotulo}</p>
      <p className="mt-1 font-mono text-[22px] font-semibold tabular-nums tracking-tight text-zinc-50">{valor}</p>
      {barra != null && (
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full rounded-full bg-emerald-400/80 transition-[width] duration-500" style={{ width: `${Math.round(barra * 100)}%` }} /></div>
      )}
      <p className="mt-1 text-[10.5px] text-zinc-500">{nota}</p>
    </div>
  )
}

function Segmentos({ valor, aoMudar, opcoes }: { valor: string; aoMudar: (v: string) => void; opcoes: Array<{ id: string; nome: string; n?: number; icone?: ReactNode }> }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-zinc-900/70 p-0.5">
      {opcoes.map((o) => (
        <button key={o.id || "todos"} type="button" onClick={() => aoMudar(o.id)} aria-pressed={valor === o.id}
          className={`inline-flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-[11.5px] transition-all duration-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#D2A63C] ${valor === o.id ? "bg-[#D2A63C]/15 text-[#E9C46A] shadow-[inset_0_0_0_1px_rgba(210,166,60,0.35)]" : "text-zinc-400 hover:text-zinc-100"}`}>
          {o.icone}{o.nome}{o.n != null && <span className="font-mono text-[10px] tabular-nums text-zinc-500">{o.n}</span>}
        </button>
      ))}
    </div>
  )
}

function Coluna({ id, sobre, zona, children, tracejada, apagada, arrastoActivo, recusa, alvoTexto }: {
  id: string
  sobre: boolean
  zona: Partial<Record<"onDragOver" | "onDragLeave" | "onDrop", (e: DragEvent) => void>>
  children: ReactNode
  tracejada?: boolean
  apagada?: boolean
  arrastoActivo: boolean
  recusa?: string | null
  alvoTexto: string | null
}) {
  const estilo = sobre && !recusa
    ? "border-[#D2A63C]/70 bg-[#D2A63C]/[0.06] shadow-[0_0_0_3px_rgba(210,166,60,0.12)]"
    : recusa && arrastoActivo ? "border-white/[0.04] bg-zinc-950/40 opacity-45"
    : apagada ? "border-white/[0.05] bg-zinc-950/60 opacity-80"
    : "border-white/[0.07] bg-zinc-900/40"
  return (
    <section data-coluna={id} {...zona} className={`relative flex w-[304px] shrink-0 snap-start flex-col rounded-2xl border transition-all duration-200 ${tracejada ? "border-dashed" : ""} ${estilo}`}>
      {children}
      {arrastoActivo && alvoTexto && (
        <div className={`pointer-events-none mx-2 mb-2 rounded-xl border border-dashed px-3 py-3 text-center text-[11px] transition-colors ${sobre ? "border-[#D2A63C]/70 bg-[#D2A63C]/10 text-[#E9C46A]" : "border-white/10 text-zinc-500"}`}>{alvoTexto}</div>
      )}
      {arrastoActivo && recusa && <p className="pointer-events-none mx-3 mb-3 text-center text-[10.5px] text-zinc-400">{recusa}</p>}
    </section>
  )
}

function Cabecalho({ n, capital }: { n: NoEstrategia; capital: { total: number; conhecidas: number } }) {
  const f = fonteDaEstrategia(n)
  const IconeFonte = ICONE_FONTE[f.tipo]
  const m = n.contaMestre
  const pct = m?.linhaDeAgua?.pct ?? null
  const t = n.contagem.total || 1
  const estadoTxt = !n.ativo ? "Desligada" : n.modoPedido === "sem-mestre" ? "Sem mestre" : n.modoPedido === "live" ? "Live" : n.modoPedido === "sombra" ? "Sombra" : "Desligada no motor"
  const estadoCor = !n.ativo ? "text-zinc-500" : n.modoPedido === "live" ? "text-emerald-300" : n.modoPedido === "sombra" ? "text-sky-300" : "text-amber-300"
  return (
    <header className="overflow-hidden rounded-t-2xl border-b border-white/[0.06]">
      <div className="h-[3px]" style={{ background: `linear-gradient(90deg, ${COR_FONTE[f.tipo]}, transparent)` }} />
      <div className="px-4 pt-3">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 text-[15px] font-semibold leading-snug tracking-tight text-zinc-50 [text-wrap:balance]" title={n.slug}>{n.nome}</h3>
          <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 text-[10.5px] font-medium ${estadoCor}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${n.ativo && n.modoPedido === "live" ? "animate-pulse bg-emerald-400" : "bg-current"}`} />{estadoTxt}
          </span>
        </div>

        {/* A MESTRE à cabeça: é dela que sai cada ordem, e o resultado dela é a pergunta que se faz primeiro. */}
        <div className="mt-2 flex items-baseline gap-2">
          {m ? (
            <>
              <span className="font-mono text-[19px] font-semibold tabular-nums tracking-tight text-zinc-100">{m.saldo == null ? "—" : dinheiro(m.saldo)}</span>
              {pct != null && <span className={`font-mono text-[12px] tabular-nums ${pct >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{pct >= 0 ? "+" : ""}{fmtNum(pct, 2)} %</span>}
            </>
          ) : <span className="text-[12px] text-amber-300">Sem conta mestre</span>}
        </div>
        <p className="text-[10.5px] text-zinc-500">{m ? `Mestre ${m.etiqueta ?? m.login ?? m.id.slice(0, 8)}${m.saldoInicial != null ? ` · partiu de ${fmtNum(m.saldoInicial, 0)}` : ""}` : "executa pelo caminho antigo"}</p>

        {/* A CADEIA, como um percurso: sinal → mestre → apps. */}
        <ol className="relative mt-3 space-y-2 border-l border-white/[0.08] pl-3 text-[11px]">
          <Degrau cor={COR_FONTE[f.tipo]} rotulo="Sinal"><IconeFonte className="mr-1 inline h-3 w-3 -translate-y-px" style={{ color: COR_FONTE[f.tipo] }} />{f.texto}</Degrau>
          <Degrau cor="#D2A63C" rotulo="Copia para">
            <span className="inline-flex flex-wrap gap-1">
              <Etiqueta ligado={n.ativo}>App MTM Auto</Etiqueta>
              <Etiqueta ligado={n.ativo}>WebTrader</Etiqueta>
              {n.canalChat && <Etiqueta ligado={n.ativo} title={`Chat ${n.canalChat}`}>MTM System</Etiqueta>}
              <Etiqueta ligado={n.t2tModo === "live" || n.t2tModo === "sombra"} title={`Tap to Trade: ${n.t2tModo}`}>T2T</Etiqueta>
            </span>
          </Degrau>
        </ol>
      </div>

      {/* contagens + barra live/sombra/parado */}
      <div className="mt-3 px-4 pb-3">
        <div className="flex items-center gap-2 text-[10.5px] text-zinc-500">
          <span className="font-mono tabular-nums text-zinc-300">{n.contagem.total}</span> conta{n.contagem.total === 1 ? "" : "s"}
          {capital.conhecidas > 0 && <span className="font-mono tabular-nums">· {dinheiro(capital.total)}</span>}
          <span className="ml-auto flex gap-2">
            {n.contagem.live > 0 && <span className="text-emerald-400">{n.contagem.live} live</span>}
            {n.contagem.sombra > 0 && <span className="text-sky-400">{n.contagem.sombra} sombra</span>}
            {n.contagem.parado > 0 && <span>{n.contagem.parado} parado</span>}
          </span>
        </div>
        <div className="mt-1.5 flex h-1 overflow-hidden rounded-full bg-white/[0.05]">
          <span style={{ width: `${(n.contagem.live / t) * 100}%`, background: COR_EFECTIVO.live }} />
          <span style={{ width: `${(n.contagem.sombra / t) * 100}%`, background: COR_EFECTIVO.sombra }} />
          <span style={{ width: `${(n.contagem.parado / t) * 100}%`, background: COR_EFECTIVO.parado }} />
        </div>
        {!n.comTravas && n.ativo && <p className="mt-1.5 text-[10.5px] text-amber-300/90" title="A mestre não tem travas (horário, notícias, drawdown do dia). Edita em Cópia (avançado) → Quadro → regras.">Sem travas de segurança na mestre</p>}
      </div>
    </header>
  )
}

function Degrau({ cor, rotulo, children }: { cor: string; rotulo: string; children: ReactNode }) {
  return (
    <li className="relative">
      <span className="absolute -left-[16.5px] top-1 h-2 w-2 rounded-full ring-2 ring-zinc-950" style={{ background: cor }} />
      <p className="text-[9.5px] uppercase tracking-[0.12em] text-zinc-600">{rotulo}</p>
      <div className="mt-0.5 leading-snug text-zinc-300">{children}</div>
    </li>
  )
}

function Etiqueta({ ligado, children, title }: { ligado: boolean; children: ReactNode; title?: string }) {
  return <span title={title} className={`rounded-md px-1.5 py-px text-[10px] ${ligado ? "bg-emerald-500/10 text-emerald-300" : "bg-white/[0.03] text-zinc-600 line-through"}`}>{children}</span>
}

function Pilha({ children, vazio, aCarregar }: { children: ReactNode; vazio: string; aCarregar?: boolean }) {
  const lista = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return (
    <div className="flex max-h-[600px] min-h-[140px] flex-1 flex-col gap-2 overflow-y-auto p-2.5 [scrollbar-width:thin]">
      {aCarregar
        ? [0, 1, 2].map((i) => <div key={i} className="h-[92px] animate-pulse rounded-xl bg-white/[0.03]" />)
        : lista.length === 0 ? <p className="px-2 py-8 text-center text-[11.5px] leading-relaxed text-zinc-600 [text-wrap:balance]">{vazio}</p> : children}
    </div>
  )
}

function Avatar({ texto, plat }: { texto: string; plat: string }) {
  const funded = plat === "mtmfunded"
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-[11.5px] font-semibold ${funded ? "bg-amber-400/12 text-amber-200 ring-1 ring-amber-400/25" : "bg-white/[0.06] text-zinc-200 ring-1 ring-white/10"}`}>{iniciais(texto)}</span>
  )
}

function Cartao({ refConta, conta, s, titulo, subtitulo, meta, aArrastar, aoComecar, aoAcabar, destinos, aoEscolher, aoDesligar }: {
  refConta: string
  conta?: ContaGestor
  s?: SubscritorCadeia
  titulo: string
  subtitulo: string | null
  meta: string
  aArrastar: boolean
  aoComecar: (e: DragEvent) => void
  aoAcabar: () => void
  destinos: NoEstrategia[]
  aoEscolher: (slug: string, copiar: boolean) => void
  aoDesligar?: () => void
}) {
  const [menu, setMenu] = useState(false)
  const mexe = podeMexer(refConta)
  const plat = plataformaDaRef(refConta, conta)
  const app = APP_DA_ORIGEM[origemDaRef(refConta)]
  const efectivo = s?.efectivo
  return (
    <article
      draggable={mexe} onDragStart={mexe ? aoComecar : undefined} onDragEnd={aoAcabar}
      className={`group relative rounded-xl border bg-zinc-950/90 p-3 transition-all duration-200 ${aArrastar ? "scale-[0.98] border-[#D2A63C]/40 opacity-40" : "border-white/[0.07]"} ${mexe ? "cursor-grab hover:-translate-y-px hover:border-white/15 hover:shadow-[0_8px_24px_-12px_rgba(0,0,0,0.9)] active:cursor-grabbing" : ""}`}
      title={s ? `${s.motivo}${s.pausadaMotivo ? ` · pausada: ${s.pausadaMotivo}` : ""}` : undefined}
    >
      <div className="flex items-start gap-2.5">
        <Avatar texto={titulo} plat={plat} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium leading-tight text-zinc-50">{titulo}</p>
          {subtitulo && subtitulo !== titulo && <p className="mt-0.5 truncate text-[11px] text-zinc-500">{subtitulo}</p>}
        </div>
        <div className="shrink-0 text-right">
          {conta?.saldo != null && <p className="font-mono text-[12px] tabular-nums text-zinc-200">{dinheiro(conta.saldo)}</p>}
          {efectivo && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-[10.5px]" style={{ color: COR_EFECTIVO[efectivo] }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_EFECTIVO[efectivo] }} />{NOME_EFECTIVO[efectivo]}
            </p>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1">
        <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200" title={NOME_PLATAFORMA[plat]}>{CURTO_PLATAFORMA[plat]}</span>
        {app && <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${app.cor}`}>{app.nome}</span>}
        {s?.tipo === "t2t" && <span className="rounded-md border border-sky-500/30 px-1.5 py-0.5 text-[10px] text-sky-300">entra por T2T</span>}
        {s?.pausadaMotivo && <span className="rounded-md border border-amber-500/30 px-1.5 py-0.5 text-[10px] text-amber-300">pausada</span>}
      </div>

      <div className="mt-2 flex items-center gap-2">
        {mexe ? <GripVertical className="h-3.5 w-3.5 shrink-0 text-zinc-700 transition-colors group-hover:text-zinc-400" /> : <Lock className="h-3 w-3 shrink-0 text-zinc-700" aria-label="Só leitura: escolhe-se na conta MTM Auto ou na ligação do site" />}
        <p className="min-w-0 flex-1 truncate font-mono text-[10.5px] text-zinc-500" title={meta}>{meta}</p>
        {mexe && (
          <button type="button" onClick={() => setMenu((v) => !v)} aria-expanded={menu}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] text-zinc-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-1 focus-visible:outline-[#D2A63C]">
            Mover <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {menu && (
        <div className="mt-2.5 overflow-hidden rounded-lg border border-white/10 bg-zinc-900">
          <div className="flex items-center border-b border-white/[0.06] px-3 py-1.5 text-[10.5px] text-zinc-500">
            <span className="flex-1">Passar a seguir</span>
            <button type="button" aria-label="Fechar" onClick={() => setMenu(false)} className="text-zinc-500 hover:text-white"><X className="h-3 w-3" /></button>
          </div>
          {destinos.length === 0 && <p className="px-3 py-2 text-[11px] text-zinc-600">Não há outra estratégia ligada.</p>}
          {destinos.map((d) => {
            const v = podeLigar(d, { chave: s?.chave ?? refConta, ref: refConta }, null)
            return (
              <div key={d.slug} className="flex items-center border-b border-white/[0.03] last:border-b-0">
                <button type="button" disabled={!v.ok} title={v.ok ? undefined : v.mensagem} onClick={() => { setMenu(false); aoEscolher(d.slug, false) }}
                  className="min-w-0 flex-1 truncate px-3 py-2 text-left text-[12px] text-zinc-200 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:text-zinc-600">{d.nome}</button>
                {aoDesligar && v.ok && (
                  <button type="button" title={`Seguir também «${d.nome}» sem deixar a actual`} onClick={() => { setMenu(false); aoEscolher(d.slug, true) }}
                    className="px-2.5 py-2 text-[10.5px] text-[#E9C46A] transition-colors hover:bg-[#D2A63C]/10">+ também</button>
                )}
              </div>
            )
          })}
          {aoDesligar && (
            <button type="button" onClick={() => { setMenu(false); aoDesligar() }} className="block w-full border-t border-white/[0.06] px-3 py-2 text-left text-[12px] text-rose-300 transition-colors hover:bg-rose-500/10">Deixar de seguir</button>
          )}
        </div>
      )}
    </article>
  )
}

// ── lente LISTA: uma linha por conta, as estratégias que segue, e mover sem arrastar ──

function Lista({ g, contas, contaPorRef, passa, estadoFiltro, mover }: {
  g: ReturnType<typeof organizarGestor>
  contas: ContaGestor[]
  contaPorRef: Map<string, ContaGestor>
  passa: (s: { ref: string; etiqueta?: string | null; descricao?: string | null; email?: string | null; efectivo?: string }) => boolean
  estadoFiltro: Estado
  mover: (a: Arrasto, para: string | null, copiar: boolean) => void
}) {
  const linhas = useMemo(() => {
    const m = new Map<string, { ref: string; chave: string; titulo: string; email: string | null; segue: Array<{ n: NoEstrategia; s: SubscritorCadeia }> }>()
    for (const n of g.ativas) for (const s of n.subscritores) {
      const k = s.ref.toLowerCase()
      const conta = contaPorRef.get(k)
      const l = m.get(k) ?? { ref: s.ref, chave: s.chave, titulo: s.etiqueta ?? conta?.etiqueta ?? s.email ?? s.ref, email: s.email ?? conta?.email ?? null, segue: [] }
      l.segue.push({ n, s })
      m.set(k, l)
    }
    for (const x of g.semEstrategia) m.set(x.ref.toLowerCase(), { ref: x.ref, chave: x.ref, titulo: x.etiqueta ?? x.nome ?? x.email ?? x.ref, email: x.email, segue: [] })
    return [...m.values()].sort((a, b) => b.segue.length - a.segue.length || a.titulo.localeCompare(b.titulo, "pt"))
  }, [g, contaPorRef])
  const visiveis = linhas.filter((l) => passa({ ref: l.ref, etiqueta: l.titulo, email: l.email, efectivo: estadoFiltro ? l.segue.find((x) => x.s.efectivo === estadoFiltro)?.s.efectivo ?? "—" : undefined }))
  void contas

  return (
    <div className="overflow-x-auto rounded-2xl border border-white/[0.07]">
      <table className="w-full min-w-[860px] border-collapse text-[12px]">
        <thead>
          <tr className="border-b border-white/[0.06] bg-zinc-950 text-left text-[10.5px] text-zinc-500">
            <th className="px-4 py-2.5 font-medium">Conta</th>
            <th className="px-3 py-2.5 font-medium">Tipo · app</th>
            <th className="px-3 py-2.5 font-medium">Segue</th>
            <th className="px-3 py-2.5 text-right font-medium">Saldo</th>
            <th className="px-4 py-2.5 font-medium">Mudar para</th>
          </tr>
        </thead>
        <tbody>
          {visiveis.length === 0 && <tr><td colSpan={5} className="px-4 py-10 text-center text-zinc-600">Nenhuma conta com estes filtros.</td></tr>}
          {visiveis.map((l) => {
            const conta = contaPorRef.get(l.ref.toLowerCase())
            const plat = plataformaDaRef(l.ref, conta)
            const app = APP_DA_ORIGEM[origemDaRef(l.ref)]
            const mexe = podeMexer(l.ref)
            const actual = l.segue[0]?.n.slug ?? null
            return (
              <tr key={l.ref} className="border-b border-white/[0.04] bg-zinc-900/30 transition-colors last:border-b-0 hover:bg-white/[0.03]">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <Avatar texto={l.titulo} plat={plat} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-100">{l.titulo}</p>
                      <p className="truncate font-mono text-[10.5px] text-zinc-500">{conta?.login ?? "—"}{l.email ? ` · ${l.email}` : ""}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-zinc-200">{CURTO_PLATAFORMA[plat]}</span>{" "}
                  {app && <span className={`rounded-md border px-1.5 py-0.5 text-[10px] ${app.cor}`}>{app.nome}</span>}
                </td>
                <td className="px-3 py-2.5">
                  {l.segue.length === 0 ? <span className="text-zinc-600">Nenhuma</span> : (
                    <span className="flex flex-wrap gap-1">
                      {l.segue.map(({ n, s }) => (
                        <span key={n.slug} className="inline-flex items-center gap-1 rounded-md bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-zinc-200" title={s.motivo}>
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_EFECTIVO[s.efectivo] }} />{n.nome}
                          <span className="font-mono text-[10px] text-zinc-500">{s.lote}</span>
                        </span>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-200">{conta?.saldo != null ? dinheiro(conta.saldo) : "—"}</td>
                <td className="px-4 py-2.5">
                  {mexe ? (
                    <select value="" onChange={(e) => {
                      const v = e.target.value
                      if (!v) return
                      const a: Arrasto = { ref: l.ref, chave: l.chave, de: actual, rotulo: l.titulo }
                      if (v === SEM) mover(a, null, false)
                      else mover(a, v, false)
                    }} className="w-full max-w-[220px] rounded-lg border border-white/10 bg-zinc-950 px-2 py-1.5 text-[11.5px] text-zinc-200 focus:border-[#D2A63C]/50 focus:outline-none">
                      <option value="">Escolher…</option>
                      {g.ativas.filter((n) => n.slug !== actual).map((n) => <option key={n.slug} value={n.slug}>{n.nome}</option>)}
                      {actual && <option value={SEM}>Deixar de seguir</option>}
                    </select>
                  ) : <span className="inline-flex items-center gap-1 text-[11px] text-zinc-600"><Lock className="h-3 w-3" /> escolhe-se na app</span>}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
