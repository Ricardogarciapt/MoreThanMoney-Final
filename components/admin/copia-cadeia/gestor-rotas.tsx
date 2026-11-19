"use client"

/**
 * O GESTOR DE ROTAS — o ecrã simples de «quem copia o quê» (pedido do dono, 19/11/2026).
 *
 * Uma coluna por estratégia LIGADA. No topo de cada coluna, a cadeia inteira em três degraus:
 *   1. de onde vem o sinal (webhook do scanner, relay de Telegram da VPS, chat);
 *   2. a conta mestre (MTM Funded) de onde o motor copia, com o saldo;
 *   3. onde a estratégia aparece nas apps (App MTM Auto, MTM System/chat, Tap to Trade).
 * Por baixo, as contas dos clientes como cartões: tipo de conta (MT5 / MTM Funded / TradeLocker),
 * por que app entrou, lote, e o que o motor faz com ela agora (live / sombra / parado).
 *
 * Arrastar um cartão para outra coluna MUDA a estratégia que a conta segue (Alt = fica nas duas).
 * Arrastar para «Sem estratégia» deixa de seguir. Cada cartão tem também o menu «Mover para…», que
 * funciona sempre (telemóvel, colunas fora do ecrã). Tudo escreve pela MESMA via da cadeia — o
 * desejo do cliente + ressincronização das rotas — por isso a app MTM Auto, o WebTrader e o MTM
 * System vêem a mudança sem passo extra.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react"
import { ArrowRight, GripVertical, Lock, MessageSquare, Radio, Search, Send, Smartphone, Webhook, X } from "lucide-react"
import type { Cadeia, NoEstrategia, SubscritorCadeia } from "@/lib/copia-contas/cadeia"
import {
  APP_DA_ORIGEM, CURTO_PLATAFORMA, NOME_PLATAFORMA, bateNaProcura, fonteDaEstrategia, fraseDoPedido, organizarGestor,
  origemDaRef, pedidoDoLargar, plataformaDaRef, podeMexer, type ContaGestor, type PedidoLargar, type TipoFonte,
} from "@/lib/copia-contas/gestor-rotas"
import { Aviso, Pilula, fmtNum, pedirCentro } from "../centro/ui"

const ICONE_FONTE: Record<TipoFonte, typeof Webhook> = { webhook: Webhook, telegram: Send, chat: MessageSquare, externa: Radio, desconhecida: Radio }
const COR_EFECTIVO = { live: "#34d399", sombra: "#60a5fa", parado: "#52525b" } as const
const NOME_EFECTIVO = { live: "live", sombra: "sombra", parado: "parado" } as const

type Arrasto = { ref: string; chave: string; de: string | null }
const SEM = "__sem__"

export default function GestorRotas({ c, recarregar, contasIniciais }: { c: Cadeia; recarregar: () => void; contasIniciais?: ContaGestor[] }) {
  const [contas, setContas] = useState<ContaGestor[]>(contasIniciais ?? [])
  const [q, setQ] = useState("")
  const [msg, setMsg] = useState<{ tom: "info" | "grave"; texto: string } | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [sobre, setSobre] = useState<string | null>(null)
  const [verDesligadas, setVerDesligadas] = useState(false)
  const arrasto = useRef<Arrasto | null>(null)
  const quadro = useRef<HTMLDivElement>(null)

  const lerContas = useCallback(async () => {
    const r = await pedirCentro<{ contas?: ContaGestor[] }>("/api/admin/mtmauto-copia/contas")
    if (r.success) setContas(r.data?.contas ?? [])
  }, [])
  useEffect(() => { if (!contasIniciais) void lerContas() }, [lerContas, contasIniciais])

  const g = useMemo(() => organizarGestor(c, contas), [c, contas])
  const contaPorRef = useMemo(() => new Map(contas.map((x) => [x.ref.toLowerCase(), x])), [contas])
  const porSlug = useMemo(() => new Map(c.estrategias.map((n) => [n.slug.toLowerCase(), n])), [c.estrategias])
  const nomes = useMemo(() => new Map(c.estrategias.map((n) => [n.slug.toLowerCase(), n.nome])), [c.estrategias])
  const contasNumNo = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const n of g.ativas) for (const s of n.subscritores) m.set(s.ref.toLowerCase(), [...(m.get(s.ref.toLowerCase()) ?? []), n.nome])
    return m
  }, [g.ativas])

  const executar = async (pedido: PedidoLargar, rotulo: string) => {
    setAGravar(true); setMsg(null)
    const r = await pedirCentro<{ mensagem?: string; error?: string }>("/api/admin/mtmauto-copia/cadeia", { method: "POST", body: pedido })
    setAGravar(false)
    if (r.success) {
      setMsg({ tom: "info", texto: fraseDoPedido(pedido, nomes, rotulo) })
      recarregar(); void lerContas()
    } else setMsg({ tom: "grave", texto: r.error ?? "Não deu para gravar." })
  }

  const largar = (ref: string, chave: string, deSlug: string | null, paraSlug: string | null, copiar: boolean, rotulo: string) => {
    if (deSlug === paraSlug) return
    const de = deSlug ? porSlug.get(deSlug.toLowerCase()) ?? null : null
    const para = paraSlug ? porSlug.get(paraSlug.toLowerCase()) ?? null : null
    const v = pedidoDoLargar({ ref, chave, de, para, copiar })
    if (!v.ok) { setMsg({ tom: "grave", texto: v.motivo }); return }
    void executar(v.pedido, rotulo)
  }

  // ── arrastar ──
  const aoComecar = (e: DragEvent, a: Arrasto) => {
    arrasto.current = a
    e.dataTransfer.effectAllowed = "copyMove"
    e.dataTransfer.setData("text/plain", a.ref)
  }
  /** O browser não desliza o quadro sozinho: perto da borda, desliza-se à mão. */
  const deslizar = (e: DragEvent) => {
    const el = quadro.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (e.clientX > r.right - 80) el.scrollLeft += 18
    else if (e.clientX < r.left + 80) el.scrollLeft -= 18
  }
  const zona = (id: string) => ({
    onDragOver: (e: DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = e.altKey ? "copy" : "move"; if (sobre !== id) setSobre(id) },
    onDragLeave: () => setSobre((s) => (s === id ? null : s)),
    onDrop: (e: DragEvent) => {
      e.preventDefault(); setSobre(null)
      const a = arrasto.current; arrasto.current = null
      if (!a) return
      const conta = contaPorRef.get(a.ref.toLowerCase())
      largar(a.ref, a.chave, a.de, id === SEM ? null : id, e.altKey, conta?.etiqueta ?? conta?.email ?? a.ref)
    },
  })

  const sub = (n: NoEstrategia) => n.subscritores.filter((s) => bateNaProcura(q, s, contaPorRef.get(s.ref.toLowerCase())))
  const semVisiveis = g.semEstrategia.filter((x) => bateNaProcura(q, { etiqueta: x.etiqueta, descricao: x.rotulo, email: x.email, ref: x.ref }, x))
  const totalContas = new Set(g.ativas.flatMap((n) => n.subscritores.map((s) => s.chave))).size
  const totalLive = g.ativas.reduce((a, n) => a + n.contagem.live, 0)

  return (
    <div className="space-y-3">
      {/* Como ler — uma linha, sem jargão. */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-[#D2A63C]/15 bg-[#D2A63C]/[0.04] px-3 py-2 text-[11.5px] text-zinc-300">
        <span className="font-semibold text-[#E9C46A]">Como funciona</span>
        <span>Sinal</span><ArrowRight className="h-3 w-3 text-zinc-600" />
        <span>Conta mestre (MTM Funded)</span><ArrowRight className="h-3 w-3 text-zinc-600" />
        <span>Contas dos clientes</span><ArrowRight className="h-3 w-3 text-zinc-600" />
        <span>App MTM Auto · WebTrader · MTM System</span>
        <span className="ml-auto text-zinc-500">Arrasta um cartão para mudar de estratégia · <kbd className="rounded border border-white/10 px-1 text-[10px]">Alt</kbd> fica nas duas</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1 sm:max-w-sm">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Procurar cliente, email, login…" className="w-full rounded-lg border border-white/10 bg-zinc-900/70 py-1.5 pl-8 pr-2 text-[12px] text-white placeholder:text-zinc-600 focus:border-[#D2A63C]/50 focus:outline-none" />
        </div>
        <Pilula tom="ouro">{g.ativas.length} estratégias ligadas</Pilula>
        <Pilula tom="neutro">{totalContas} contas a copiar</Pilula>
        <Pilula tom={totalLive ? "ok" : "neutro"}>{totalLive} em live</Pilula>
        <Pilula tom={c.motor.kill ? "grave" : c.motor.ligado ? "ok" : "aviso"} vivo={c.motor.ligado && !c.motor.kill}>motor {c.motor.kill ? "KILL" : c.motor.ligado ? "ligado" : "desligado"}</Pilula>
        {aGravar && <span className="text-[11px] text-zinc-500">a gravar…</span>}
      </div>

      {msg && <Aviso tom={msg.tom}>{msg.texto}</Aviso>}
      {g.presasEmDesligadas.length > 0 && (
        <Aviso>
          {g.presasEmDesligadas.length} conta{g.presasEmDesligadas.length === 1 ? "" : "s"} ainda segue{g.presasEmDesligadas.length === 1 ? "" : "m"} uma estratégia desligada e não recebe{g.presasEmDesligadas.length === 1 ? "" : "m"} sinais novos:{" "}
          {g.presasEmDesligadas.map((p) => `${p.s.etiqueta ?? p.s.email ?? p.s.ref} (${p.estrategia.nome})`).join(" · ")}. Abre «Estratégias desligadas» e arrasta-as para uma ligada.
        </Aviso>
      )}

      {/* O QUADRO: colunas lado a lado, deslizam na horizontal. */}
      <div ref={quadro} onDragOver={deslizar} className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-3">
        {/* Sem estratégia — de onde se arrasta para ligar, para onde se arrasta para desligar. */}
        <Coluna id={SEM} sobre={sobre === SEM} zona={zona(SEM)} larguraFixa>
          <div className="border-b border-white/[0.07] px-3 py-2.5">
            <p className="text-[13px] font-semibold text-zinc-200">Sem estratégia</p>
            <p className="text-[10.5px] text-zinc-500">Contas de clientes ligadas que não copiam nada. Larga aqui para deixar de seguir.</p>
          </div>
          <Cartoes vazio={contas.length ? "Todas as contas activas seguem uma estratégia." : "A ler contas…"}>
            {semVisiveis.slice(0, 80).map((x) => (
              <Cartao
                key={x.ref} refConta={x.ref} conta={x} titulo={x.etiqueta ?? x.nome ?? x.email ?? x.ref} subtitulo={x.email}
                linha={`${x.login ?? "—"}${x.servidor ? ` · ${x.servidor}` : ""}${x.demo ? " · demo" : ""}`}
                aoComecar={(e) => aoComecar(e, { ref: x.ref, chave: x.ref, de: null })}
                destinos={g.ativas} aoEscolher={(slug, copiar) => largar(x.ref, x.ref, null, slug, copiar, x.etiqueta ?? x.email ?? x.ref)}
              />
            ))}
          </Cartoes>
        </Coluna>

        {g.ativas.map((n) => (
          <Coluna key={n.chave} id={n.slug} sobre={sobre === n.slug} zona={zona(n.slug)}>
            <Cabecalho n={n} />
            <Cartoes vazio={q ? "Nenhuma conta bate na procura." : "Ninguém copia esta estratégia. Arrasta contas para aqui."}>
              {sub(n).map((s) => {
                const conta = contaPorRef.get(s.ref.toLowerCase())
                const outras = (contasNumNo.get(s.ref.toLowerCase()) ?? []).filter((x) => x !== n.nome)
                return (
                  <Cartao
                    key={s.rotaId} refConta={s.ref} conta={conta} s={s}
                    titulo={s.etiqueta ?? conta?.etiqueta ?? conta?.nome ?? s.email ?? s.ref}
                    subtitulo={s.email ?? conta?.email ?? null}
                    linha={`${conta?.login ?? "—"} · ${s.lote}${s.abertas ? ` · ${s.abertas} aberta${s.abertas === 1 ? "" : "s"}` : ""}${outras.length ? ` · também ${outras.join(", ")}` : ""}`}
                    aoComecar={(e) => aoComecar(e, { ref: s.ref, chave: s.chave, de: n.slug })}
                    destinos={g.ativas.filter((d) => d.slug !== n.slug)}
                    aoEscolher={(slug, copiar) => largar(s.ref, s.chave, n.slug, slug, copiar, s.etiqueta ?? s.email ?? s.ref)}
                    aoDesligar={() => largar(s.ref, s.chave, n.slug, null, false, s.etiqueta ?? s.email ?? s.ref)}
                  />
                )
              })}
            </Cartoes>
          </Coluna>
        ))}
      </div>

      {/* Desligadas — recolhidas: não recebem sinais, mas podem ter contas presas. */}
      {g.desligadas.length > 0 && (
        <div className="rounded-xl border border-white/[0.06] bg-zinc-950/40">
          <button type="button" onClick={() => setVerDesligadas((v) => !v)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-zinc-400 hover:text-white">
            <span className="flex-1">Estratégias desligadas ({g.desligadas.length}) · {g.desligadas.map((n) => n.nome).join(" · ")}</span>
            <span className="text-[10px]">{verDesligadas ? "▾ esconder" : "▸ ver"}</span>
          </button>
          {verDesligadas && (
            <div className="flex gap-3 overflow-x-auto border-t border-white/[0.05] p-3">
              {g.desligadas.map((n) => (
                <Coluna key={n.chave} id={n.slug} sobre={false} zona={{}} apagada>
                  <Cabecalho n={n} />
                  <Cartoes vazio="Sem contas.">
                    {n.subscritores.map((s) => {
                      const conta = contaPorRef.get(s.ref.toLowerCase())
                      return (
                        <Cartao
                          key={s.rotaId} refConta={s.ref} conta={conta} s={s}
                          titulo={s.etiqueta ?? conta?.etiqueta ?? s.email ?? s.ref} subtitulo={s.email ?? null}
                          linha={`${conta?.login ?? "—"} · ${s.lote}`}
                          aoComecar={(e) => aoComecar(e, { ref: s.ref, chave: s.chave, de: n.slug })}
                          destinos={g.ativas}
                          aoEscolher={(slug, copiar) => largar(s.ref, s.chave, n.slug, slug, copiar, s.etiqueta ?? s.email ?? s.ref)}
                          aoDesligar={() => largar(s.ref, s.chave, n.slug, null, false, s.etiqueta ?? s.email ?? s.ref)}
                        />
                      )
                    })}
                  </Cartoes>
                </Coluna>
              ))}
            </div>
          )}
        </div>
      )}

      <p className="text-[10.5px] leading-relaxed text-zinc-600">
        Ligar e desligar uma estratégia é o mesmo interruptor da admin da app MTM Auto (Estratégias) — o que se liga lá aparece aqui como coluna.
        Mudar uma conta de estratégia escreve na escolha do cliente e as rotas ressincronizam sozinhas: a app MTM Auto, o WebTrader e o MTM System leem o mesmo.
        «Live / sombra / parado» é o que o motor decide agora para aquela conta.
      </p>
    </div>
  )
}

// ── peças ───────────────────────────────────────────────────────────────────

function Coluna({ id, sobre, zona, children, larguraFixa, apagada }: {
  id: string
  sobre: boolean
  zona: Partial<Record<"onDragOver" | "onDragLeave" | "onDrop", (e: DragEvent) => void>>
  children: ReactNode
  larguraFixa?: boolean
  apagada?: boolean
}) {
  return (
    <section
      data-coluna={id}
      {...zona}
      className={`flex w-[290px] shrink-0 flex-col rounded-xl border transition-colors ${larguraFixa ? "border-dashed" : ""} ${sobre ? "border-[#D2A63C]/70 bg-[#D2A63C]/[0.07]" : apagada ? "border-white/[0.05] bg-zinc-950/60 opacity-75" : "border-white/[0.08] bg-zinc-900/45"}`}
    >
      {children}
    </section>
  )
}

function Cabecalho({ n }: { n: NoEstrategia }) {
  const f = fonteDaEstrategia(n)
  const IconeFonte = ICONE_FONTE[f.tipo]
  const m = n.contaMestre
  const pct = m?.linhaDeAgua?.pct ?? null
  return (
    <div className="border-b border-white/[0.07]">
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <p className="min-w-0 flex-1 truncate text-[14px] font-semibold text-[#E9C46A]" title={n.slug}>{n.nome}</p>
        <Pilula tom={n.ativo ? (n.modoPedido === "live" ? "ok" : n.modoPedido === "sombra" ? "info" : "neutro") : "neutro"}>
          {n.ativo ? (n.modoPedido === "sem-mestre" ? "sem mestre" : n.modoPedido) : "desligada"}
        </Pilula>
      </div>
      {/* a cadeia, em 3 degraus */}
      <ol className="space-y-1 px-3 py-2 text-[11px]">
        <li className="flex items-start gap-1.5 text-zinc-300" title="De onde nasce o sinal">
          <IconeFonte className="mt-px h-3.5 w-3.5 shrink-0 text-[#D2A63C]" />
          <span className="min-w-0 flex-1">{f.texto}</span>
        </li>
        <li className="flex items-start gap-1.5" title="A conta mestre: é dela que o motor copia para os clientes">
          <span className="mt-px flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm bg-[#D2A63C]/20 text-[8px] font-bold text-[#E9C46A]">M</span>
          {m ? (
            <span className="min-w-0 flex-1 truncate font-mono text-zinc-400">
              {m.etiqueta ?? m.login ?? m.id.slice(0, 8)}
              {m.saldo != null && <span className="text-zinc-200"> · {fmtNum(m.saldo, 2)}</span>}
              {pct != null && <span className={pct >= 0 ? "text-emerald-400" : "text-rose-400"}> {pct >= 0 ? "+" : ""}{fmtNum(pct, 1)}%</span>}
            </span>
          ) : <span className="text-amber-400">mestre em falta — executa pelo caminho antigo</span>}
        </li>
        <li className="flex items-start gap-1.5" title="Onde a estratégia aparece para os clientes">
          <Smartphone className="mt-px h-3.5 w-3.5 shrink-0 text-zinc-500" />
          <span className="flex min-w-0 flex-1 flex-wrap gap-1">
            <Etiqueta ligado={n.ativo}>App MTM Auto</Etiqueta>
            {n.canalChat && <Etiqueta ligado={n.ativo} title={`Chat ${n.canalChat}`}>MTM System</Etiqueta>}
            <Etiqueta ligado={n.t2tModo === "live" || n.t2tModo === "sombra"} title={`Tap to Trade: ${n.t2tModo}`}>T2T {n.t2tModo === "sem-mestre" ? "—" : n.t2tModo}</Etiqueta>
          </span>
        </li>
      </ol>
      <div className="flex items-center gap-1.5 border-t border-white/[0.04] px-3 py-1.5 text-[10.5px] text-zinc-500">
        <span className="flex-1">{n.contagem.total} conta{n.contagem.total === 1 ? "" : "s"}</span>
        {n.contagem.live > 0 && <span className="text-emerald-400">{n.contagem.live} live</span>}
        {n.contagem.sombra > 0 && <span className="text-sky-400">{n.contagem.sombra} sombra</span>}
        {n.contagem.parado > 0 && <span>{n.contagem.parado} parado</span>}
        {!n.comTravas && n.ativo && <span className="text-amber-400" title="A mestre não tem travas (horário, notícias, drawdown do dia). Edita em Quadro livre → regras.">sem travas</span>}
      </div>
    </div>
  )
}

function Etiqueta({ ligado, children, title }: { ligado: boolean; children: ReactNode; title?: string }) {
  return (
    <span title={title} className={`rounded border px-1.5 py-px text-[9.5px] ${ligado ? "border-emerald-500/30 text-emerald-300" : "border-zinc-700 text-zinc-600 line-through"}`}>{children}</span>
  )
}

function Cartoes({ children, vazio }: { children: ReactNode; vazio: string }) {
  const lista = Array.isArray(children) ? children.filter(Boolean) : children ? [children] : []
  return (
    <div className="flex max-h-[560px] min-h-[120px] flex-col gap-1.5 overflow-y-auto p-2">
      {lista.length === 0 ? <p className="px-1 py-6 text-center text-[11px] text-zinc-600">{vazio}</p> : children}
    </div>
  )
}

function Cartao({ refConta, conta, s, titulo, subtitulo, linha, aoComecar, destinos, aoEscolher, aoDesligar }: {
  refConta: string
  conta?: ContaGestor
  s?: SubscritorCadeia
  titulo: string
  subtitulo: string | null
  linha: string
  aoComecar: (e: DragEvent) => void
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
    <div
      draggable={mexe} onDragStart={mexe ? aoComecar : undefined}
      className={`group relative rounded-lg border border-white/[0.07] bg-zinc-950/80 px-2.5 py-2 ${mexe ? "cursor-grab active:cursor-grabbing hover:border-[#D2A63C]/40" : ""}`}
      title={s ? `${s.motivo}${s.pausadaMotivo ? ` · pausada: ${s.pausadaMotivo}` : ""}` : undefined}
    >
      <div className="flex items-start gap-1.5">
        {mexe ? <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-zinc-700 group-hover:text-zinc-400" /> : <Lock className="mt-0.5 h-3 w-3 shrink-0 text-zinc-700" />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-zinc-100">{titulo}</p>
          {subtitulo && subtitulo !== titulo && <p className="truncate text-[10.5px] text-zinc-500">{subtitulo}</p>}
        </div>
        {efectivo && (
          <span className="flex shrink-0 items-center gap-1 text-[9.5px] uppercase tracking-wide text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: COR_EFECTIVO[efectivo] }} />{NOME_EFECTIVO[efectivo]}
          </span>
        )}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-5">
        <span className="rounded bg-white/[0.06] px-1.5 py-px text-[9.5px] font-semibold text-zinc-200" title={NOME_PLATAFORMA[plat]}>{CURTO_PLATAFORMA[plat]}</span>
        {app && <span className={`rounded border px-1.5 py-px text-[9.5px] ${app.cor}`}>{app.nome}</span>}
        {s?.tipo === "t2t" && <span className="rounded border border-sky-500/30 px-1.5 py-px text-[9.5px] text-sky-300">entra por T2T</span>}
        {s?.pausadaMotivo && <span className="rounded border border-amber-500/30 px-1.5 py-px text-[9.5px] text-amber-300">pausada</span>}
      </div>
      <p className={`mt-1 truncate pl-5 font-mono text-[10px] text-zinc-500 ${mexe ? "pr-12" : ""}`} title={linha}>{linha}</p>

      {mexe && (
        <button type="button" onClick={() => setMenu((v) => !v)} className="absolute right-1.5 bottom-1.5 rounded px-1.5 py-0.5 text-[10px] text-zinc-500 opacity-70 hover:bg-white/10 hover:text-white group-hover:opacity-100">
          mover ▾
        </button>
      )}
      {menu && (
        <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-2xl">
          <div className="flex items-center border-b border-white/[0.06] px-2 py-1 text-[10px] uppercase tracking-wider text-zinc-500">
            <span className="flex-1">Passar a seguir</span>
            <button type="button" onClick={() => setMenu(false)} className="text-zinc-500 hover:text-white"><X className="h-3 w-3" /></button>
          </div>
          {destinos.length === 0 && <p className="px-3 py-2 text-[11px] text-zinc-600">Não há outra estratégia ligada.</p>}
          {destinos.map((d) => (
            <div key={d.slug} className="flex items-center border-b border-white/[0.03] last:border-b-0">
              <button type="button" onClick={() => { setMenu(false); aoEscolher(d.slug, false) }} className="min-w-0 flex-1 truncate px-3 py-1.5 text-left text-[11.5px] text-zinc-200 hover:bg-white/10">{d.nome}</button>
              {aoDesligar && (
                <button type="button" title={`Seguir também «${d.nome}» sem deixar a actual`} onClick={() => { setMenu(false); aoEscolher(d.slug, true) }} className="px-2 py-1.5 text-[10.5px] text-[#E9C46A] hover:bg-[#D2A63C]/10">+ também</button>
              )}
            </div>
          ))}
          {aoDesligar && (
            <button type="button" onClick={() => { setMenu(false); aoDesligar() }} className="block w-full border-t border-white/[0.06] px-3 py-1.5 text-left text-[11.5px] text-rose-300 hover:bg-rose-500/10">Deixar de seguir</button>
          )}
        </div>
      )}
    </div>
  )
}

