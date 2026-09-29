"use client"

/**
 * O QUADRO BRANCO DA CADEIA — arrastar e largar subscritores entre estratégias.
 *
 * ═══ O QUE PROPAGA E O QUE NÃO PROPAGA ══════════════════════════════════════════════════════
 *
 * Isto NÃO é um desenho bonito por cima da base. Cada acção vai a /api/admin/mtmauto-copia/cadeia
 * e escreve onde o sistema real lê:
 *
 *  · arrastar um subscritor para outra estratégia → escreve no DESEJO do cliente
 *    (`mtmcopy_connections.strategy_lots` ou `mtmauto_subscriptions`) e ressincroniza as rotas com
 *    a mesma função do script (`lib/mestres/servidor/sincronizar-rotas`). Mexer na rota à mão não
 *    servia: a sincronização seguinte desfazia-a;
 *  · «Adicionar subscritor» → o mesmo caminho, a partir da lista de contas do admin;
 *  · «Criar contas» → `lib/mtmfunded/contas-estrategia` (conta simulada + MTM Auto + subscrição);
 *  · MOVER UM NÓ NO QUADRO não muda NADA no sistema. Só guarda a posição
 *    (`site_settings.copia_cadeia_layout`) para o desenho não se perder entre visitas. Está dito
 *    no ecrã, para ninguém pensar que arrumar caixas pára uma cópia.
 *
 * Uma conta pode estar ligada a VÁRIOS nós: `strategy_lots` é um mapa de estratégias, não uma
 * escolha única — arrastar com a tecla Alt COPIA a ligação em vez de a mover.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { accoesDoArrasto, podeLigar, type Cadeia, type NoEstrategia, type SubscritorCadeia } from "@/lib/copia-contas/cadeia"
import { Aviso, Botao, Campo, Gaveta, Pilula, fmtNum, pedirCentro } from "../centro/ui"
import MestreEditor from "./mestre-editor"
import { MarcaProveniencia, PctLinhaDeAgua } from "../centro/linha-de-agua"

/**
 * A ORIGEM de cada conta, pelo prefixo da `ref` — é o que interliga o quadro ao resto da casa.
 *
 * As quatro superfícies escrevem na MESMA cadeia e o gestor tem de saber por qual delas a pessoa
 * entrou: `site:` é a ligação do site (e é também por ela que o Tap to Trade abre), `auto:` é uma
 * conta da app MTM Auto, `wt:` é o WebTrader, `funded:` é uma conta MTM Funded. A mesma pessoa pode
 * ter contas em várias, e vê-las misturadas sem etiqueta era o que fazia parecer que havia contas
 * duplicadas quando não havia.
 */
const ORIGEM: Record<string, { curto: string; nome: string; cor: string }> = {
  site: { curto: "Site", nome: "Ligação do site (MTM Copy / Tap to Trade)", cor: "text-sky-300/80" },
  auto: { curto: "Auto", nome: "Conta da app MTM Auto", cor: "text-emerald-300/80" },
  wt: { curto: "WT", nome: "Conta do WebTrader", cor: "text-violet-300/80" },
  funded: { curto: "Funded", nome: "Conta MTM Funded", cor: "text-amber-300/80" },
  prov: { curto: "Mestre", nome: "Conta mestre de uma estratégia", cor: "text-[#D2A63C]" },
}

const origemDaRef = (ref: string) => ORIGEM[String(ref).split(":")[0]?.toLowerCase() ?? ""] ?? null

const LARGURA_NO = 280
const ESPACO_X = 320
const ESPACO_Y = 460

type Posicoes = Record<string, { x: number; y: number }>

/** Posição de partida de um nó que ainda não foi arrumado à mão: uma grelha simples. */
function posicaoInicial(i: number, colunas: number): { x: number; y: number } {
  return { x: 24 + (i % colunas) * ESPACO_X, y: 24 + Math.floor(i / colunas) * ESPACO_Y }
}

export default function QuadroCadeia({ c, recarregar }: { c: Cadeia; recarregar: () => void }) {
  const [pos, setPos] = useState<Posicoes>({})
  const [sujo, setSujo] = useState(false)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [aGravar, setAGravar] = useState(false)
  const [gaveta, setGaveta] = useState<null | { tipo: "adicionar"; slug: string } | { tipo: "contas" } | { tipo: "mestre"; slug: string }>(null)
  const arrasto = useRef<null | { chave: string; dx: number; dy: number }>(null)
  const tela = useRef<HTMLDivElement>(null)

  const colunas = Math.max(1, Math.min(4, c.estrategias.length))
  // As posições guardadas mandam; as que faltam caem na grelha (e não tapam a caixa anterior).
  useEffect(() => {
    setPos((atual) => {
      const novo = { ...atual }
      c.estrategias.forEach((n, i) => {
        if (!novo[n.chave]) novo[n.chave] = n.x != null && n.y != null ? { x: n.x, y: n.y } : posicaoInicial(i, colunas)
      })
      return novo
    })
  }, [c.estrategias, colunas])

  const porChave = useMemo(() => new Map(c.estrategias.map((n) => [n.chave, n])), [c.estrategias])

  /**
   * A MESMA CONTA em vários nós. `strategy_lots` é um mapa, não uma escolha única: uma conta pode
   * seguir o Sensei e o GoldKiller ao mesmo tempo (é o que a tecla Alt faz). Sem isto desenhado, o
   * gestor vê a conta duas vezes e não sabe se é a mesma — e é a mesma, com a MESMA exposição, que é
   * exactamente o que os limites de `mestres_contas` somam.
   */
  const nosPorConta = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const n of c.estrategias) {
      for (const s of n.subscritores) m.set(s.chave, [...(m.get(s.chave) ?? []), n.chave])
    }
    return m
  }, [c.estrategias])

  /** Os pares de nós ligados pela mesma conta — as linhas que se desenham por baixo das caixas. */
  const lacos = useMemo(() => {
    const out: { de: string; para: string; contas: number }[] = []
    const pares = new Map<string, number>()
    for (const nos of nosPorConta.values()) {
      if (nos.length < 2) continue
      for (let i = 0; i < nos.length; i++) {
        for (let j = i + 1; j < nos.length; j++) {
          const k = [nos[i], nos[j]].sort().join("|")
          pares.set(k, (pares.get(k) ?? 0) + 1)
        }
      }
    }
    for (const [k, contas] of pares) { const [de, para] = k.split("|"); out.push({ de, para, contas }) }
    return out
  }, [nosPorConta])

  const aoMover = useCallback((e: MouseEvent) => {
    const a = arrasto.current
    const caixa = tela.current?.getBoundingClientRect()
    if (!a || !caixa) return
    setPos((p) => ({ ...p, [a.chave]: { x: Math.round(e.clientX - caixa.left - a.dx), y: Math.round(e.clientY - caixa.top - a.dy) } }))
    setSujo(true)
  }, [])

  const aoLargarRato = useCallback(() => { arrasto.current = null }, [])

  useEffect(() => {
    window.addEventListener("mousemove", aoMover)
    window.addEventListener("mouseup", aoLargarRato)
    return () => { window.removeEventListener("mousemove", aoMover); window.removeEventListener("mouseup", aoLargarRato) }
  }, [aoMover, aoLargarRato])

  const guardarDisposicao = async () => {
    setAGravar(true)
    const r = await pedirCentro<{ mensagem?: string; error?: string }>("/api/admin/mtmauto-copia/cadeia", { method: "POST", body: { accao: "disposicao", nos: pos } })
    setAGravar(false)
    if (r.success) { setSujo(false); setMensagem(r.data?.mensagem ?? "Disposição guardada."); setErro(null) }
    else setErro(r.error ?? "não deu para guardar a disposição")
  }

  /** O arrasto de um SUBSCRITOR (HTML5 drag) — o do NÓ é com o rato, mais acima. */
  const largarSubscritor = async (destino: NoEstrategia, dados: string, copiar: boolean) => {
    setErro(null); setMensagem(null)
    let carga: { ref: string; chave: string; slugOrigem: string | null }
    try { carga = JSON.parse(dados) } catch { return }
    const origem = carga.slugOrigem ? c.estrategias.find((n) => n.slug === carga.slugOrigem) ?? null : null
    const v = podeLigar(destino, { chave: carga.chave, ref: carga.ref }, origem)
    if (!v.ok) { setErro(v.mensagem); return }
    // Alt = uma conta a seguir MAIS uma estratégia (strategy_lots aceita várias). Sem Alt, muda de casa.
    const accoes = copiar ? [{ tipo: "ligar" as const, slug: destino.slug, ref: carga.ref }] : accoesDoArrasto(origem, destino, carga.ref)
    for (const a of accoes) {
      const corpo = a.tipo === "ligar" ? { accao: "ligar", ref: a.ref, slug: a.slug } : { accao: "mover", ref: a.ref, de: a.de, para: a.para }
      const r = await pedirCentro<{ mensagem?: string }>("/api/admin/mtmauto-copia/cadeia", { method: "POST", body: corpo })
      if (!r.success) { setErro(r.error ?? "falhou"); recarregar(); return }
      setMensagem(r.data?.mensagem ?? "feito")
    }
    recarregar()
  }

  /**
   * Deixar de seguir. A rota `desligar` já existia e o quadro não tinha por onde a pedir: dava para
   * ligar e mover, nunca para tirar. Pede confirmação porque uma conta com posições abertas deixa de
   * receber ordens novas — o que está aberto continua a ser gerido, mas isso tem de ser dito.
   */
  const desligar = async (slug: string, s: SubscritorCadeia) => {
    const nome = s.etiqueta ?? s.email ?? s.ref
    const aviso = s.abertas > 0 ? `\n\nATENÇÃO: tem ${s.abertas} posição(ões) aberta(s). Deixa de abrir novas; as abertas continuam geridas.` : ""
    if (!window.confirm(`«${nome}» deixa de seguir «${slug}».${aviso}`)) return
    setErro(null); setMensagem(null)
    const r = await pedirCentro<{ mensagem?: string }>("/api/admin/mtmauto-copia/cadeia", { method: "POST", body: { accao: "desligar", ref: s.ref, slug } })
    if (r.success) setMensagem(r.data?.mensagem ?? "deixou de seguir")
    else setErro(r.error ?? "não deu para desligar")
    recarregar()
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-zinc-500">
          Arrasta a BARRA de uma estratégia para a arrumar (só desenho). Arrasta um SUBSCRITOR para outra estratégia
          para o mudar de cópia — isso escreve na base. Com <kbd className="rounded bg-white/10 px-1">Alt</kbd> ele passa a
          seguir as duas. O <span className="text-zinc-300">✕</span> no cartão tira-o desta estratégia,
          e <span className="text-zinc-300">+ adicionar subscritor</span> escolhe uma conta já existente.
          <span className="text-zinc-300"> regras…</span> abre as travas da Conta Mestre.
          As linhas tracejadas ligam estratégias que <strong>partilham contas</strong> — a mesma exposição, somada uma só vez pelos
          limites de <code>mestres_contas</code>.
        </p>
        <div className="ml-auto flex gap-2">
          <Botao onClick={() => setGaveta({ tipo: "contas" })}>Criar contas…</Botao>
          <Botao tom={sujo ? "ouro" : "neutro"} onClick={() => void guardarDisposicao()} disabled={aGravar || !sujo}>
            {aGravar ? "A guardar…" : sujo ? "Guardar disposição" : "Disposição guardada"}
          </Botao>
        </div>
      </div>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {mensagem && <Aviso tom="info">{mensagem}</Aviso>}

      <div ref={tela} className="relative h-[70vh] min-h-[520px] w-full overflow-auto rounded-xl border border-white/[0.07] bg-[radial-gradient(circle,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:24px_24px]">
        <div className="relative" style={{ width: Math.max(1200, colunas * ESPACO_X + 80), height: Math.max(700, Math.ceil(c.estrategias.length / colunas) * ESPACO_Y + 80) }}>
          {/*
            AS LINHAS entre estratégias que partilham contas. `pointer-events-none` de propósito: a
            linha é informação, não um alvo — arrastar tem de continuar a apanhar a caixa que está por
            cima dela. Fica por baixo (sem z-index) para nunca tapar um cartão.
          */}
          {lacos.length > 0 && (
            <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
              {lacos.map((l) => {
                const a = pos[l.de]
                const b = pos[l.para]
                if (!a || !b) return null
                const x1 = a.x + LARGURA_NO / 2
                const x2 = b.x + LARGURA_NO / 2
                return (
                  <g key={`${l.de}|${l.para}`}>
                    <line
                      x1={x1} y1={a.y + 40} x2={x2} y2={b.y + 40}
                      stroke="#D2A63C" strokeOpacity={0.28} strokeWidth={1 + Math.min(3, l.contas)} strokeDasharray="5 4"
                    />
                    <text x={(x1 + x2) / 2} y={(a.y + b.y) / 2 + 36} fill="#D2A63C" fillOpacity={0.55} fontSize={9.5} textAnchor="middle">
                      {l.contas} conta{l.contas > 1 ? "s" : ""} em comum
                    </text>
                  </g>
                )
              })}
            </svg>
          )}
          {c.estrategias.map((n) => {
            const p = pos[n.chave] ?? { x: 24, y: 24 }
            return (
              <div
                key={n.chave}
                className="absolute rounded-xl border border-white/10 bg-zinc-900/90 shadow-lg"
                style={{ left: p.x, top: p.y, width: LARGURA_NO }}
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = e.altKey ? "copy" : "move" }}
                onDrop={(e) => { e.preventDefault(); void largarSubscritor(n, e.dataTransfer.getData("text/plain"), e.altKey) }}
              >
                {/* a pega: arrastar daqui só arruma o desenho */}
                <div
                  className="cursor-grab select-none rounded-t-xl border-b border-white/10 bg-white/[0.04] px-3 py-1.5 active:cursor-grabbing"
                  onMouseDown={(e) => {
                    const caixa = tela.current?.getBoundingClientRect()
                    if (!caixa) return
                    arrasto.current = { chave: n.chave, dx: e.clientX - caixa.left - p.x, dy: e.clientY - caixa.top - p.y }
                  }}
                >
                  <p className="truncate text-[10px] uppercase tracking-wider text-zinc-500">{n.fonte}</p>
                  <p className="truncate text-[12.5px] font-semibold text-[#D2A63C]">{n.nome}</p>
                  <p className="truncate font-mono text-[10.5px] text-zinc-500">
                    mestre {n.contaMestre ? n.contaMestre.etiqueta ?? n.contaMestre.login ?? n.contaMestre.id.slice(0, 8) : "— em falta"}
                  </p>
                  {n.contaMestre && (
                    <p className="flex items-center gap-1.5 font-mono text-[10.5px]">
                      <span className="text-zinc-300">{n.contaMestre.saldo == null ? "—" : fmtNum(n.contaMestre.saldo, 2)}</span>
                      <MarcaProveniencia p={n.contaMestre.linhaDeAgua.proveniencia} />
                      <PctLinhaDeAgua l={n.contaMestre.linhaDeAgua} />
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-1 px-2 py-1">
                  <Pilula tom={n.modoPedido === "live" ? "grave" : n.modoPedido === "sombra" ? "info" : "neutro"}>cópia {n.modoPedido}</Pilula>
                  <Pilula tom={n.t2tModo === "live" ? "grave" : n.t2tModo === "sombra" ? "info" : "neutro"}>T2T {n.t2tModo}</Pilula>
                  {!n.ativo && <Pilula tom="neutro">inactivo</Pilula>}
                  {/* As travas de RAIZ, na barra: uma mestre sem elas não protege a cadeia, e isso
                      tem de se ver sem abrir nada. Ver lib/copia-contas/mestre-travas.ts. */}
                  <Pilula tom={n.comTravas ? "ok" : "aviso"} title={n.comTravas ? "A mestre tem travas de raiz configuradas." : "Nada impede esta mestre de emitir fora de horas, em cima de uma notícia ou já a perder o dia."}>
                    {n.comTravas ? "com travas" : "sem travas"}
                  </Pilula>
                  <button
                    type="button"
                    onClick={() => setGaveta({ tipo: "mestre", slug: n.slug })}
                    title="Editar as regras da Conta Mestre (saídas, horários, risco de raiz)"
                    className="ml-auto rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-[#D2A63C]/40 hover:text-[#E9C46A]"
                  >
                    regras…
                  </button>
                </div>
                {/* O resumo das saídas em texto: «BE a 1,25× · trailing a 2×». Sem isto o gestor tinha
                    de abrir os oito nós para saber qual deles gere as trades e qual as deixa correr. */}
                <p className="truncate px-2 pb-1 font-mono text-[10px] text-zinc-500" title={n.gestaoTexto}>{n.gestaoTexto}</p>
                <div className="max-h-[240px] overflow-y-auto border-t border-white/[0.06]">
                  {n.subscritores.length === 0
                    ? <p className="px-2 py-2 text-[11px] text-zinc-600">Larga aqui uma conta.</p>
                    : n.subscritores.map((s) => (
                      <Cartao
                        key={s.rotaId} s={s} slug={n.slug}
                        noutras={(nosPorConta.get(s.chave)?.length ?? 1) - 1}
                        desligar={() => void desligar(n.slug, s)}
                      />
                    ))}
                </div>
                <button
                  type="button"
                  onClick={() => setGaveta({ tipo: "adicionar", slug: n.slug })}
                  className="w-full rounded-b-xl border-t border-white/[0.06] px-2 py-1.5 text-left text-[11px] text-zinc-400 hover:bg-white/5 hover:text-white"
                >
                  + adicionar subscritor
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {gaveta?.tipo === "adicionar" && <GavetaAdicionar slug={gaveta.slug} fechar={() => setGaveta(null)} feito={() => { setGaveta(null); recarregar() }} />}
      {gaveta?.tipo === "mestre" && (() => {
        const n = porChave.get(`estrategia:${gaveta.slug}`)
        return n ? <MestreEditor no={n} fechar={() => setGaveta(null)} feito={() => recarregar()} /> : null
      })()}
      {gaveta?.tipo === "contas" && <GavetaCriarContas estrategias={c.estrategias} fechar={() => setGaveta(null)} feito={() => { setGaveta(null); recarregar() }} />}
    </div>
  )
}

function Cartao({ s, slug, desligar, noutras = 0 }: { s: SubscritorCadeia; slug: string; desligar: () => void; noutras?: number }) {
  const origem = origemDaRef(s.ref)
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ ref: s.ref, chave: s.chave, slugOrigem: slug }))}
      className="group flex cursor-grab items-center gap-1.5 border-b border-white/[0.04] px-2 py-1 last:border-b-0 hover:bg-white/5 active:cursor-grabbing"
      title={s.motivo}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.efectivo === "live" ? "#f87171" : s.efectivo === "sombra" ? "#60a5fa" : "#52525b" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] text-zinc-200">{s.etiqueta ?? s.email ?? s.ref}</p>
        <p className="truncate text-[10px] text-zinc-500">
          {/* Por QUAL superfície é que esta conta entrou na cadeia: sem isto, uma conta do WebTrader e
              uma da app MTM Auto são duas linhas iguais e a mesma pessoa parece estar duplicada. */}
          {origem && <span className={origem.cor} title={origem.nome}>{origem.curto}</span>}
          {origem && " · "}{s.lote}{s.tipo === "t2t" && " · T2T"}{s.abertas > 0 && ` · ${s.abertas} aberta(s)`}{s.pausadaMotivo && " · pausada"}
          {noutras > 0 && <span className="text-[#D2A63C]/70" title="A mesma conta segue mais do que uma estratégia (strategy_lots aceita várias).">{` · +${noutras}`}</span>}
        </p>
      </div>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); desligar() }}
        title={`Deixar de seguir «${slug}»`}
        className="shrink-0 px-1 text-[12px] text-zinc-600 opacity-0 hover:text-rose-300 group-hover:opacity-100"
      >
        ✕
      </button>
    </div>
  )
}

/** Escolher uma conta já existente e ligá-la à estratégia. A lista vem do admin de contas de sempre. */
function GavetaAdicionar({ slug, fechar, feito }: { slug: string; fechar: () => void; feito: () => void }) {
  const [q, setQ] = useState("")
  const [contas, setContas] = useState<Array<{ ref: string; rotulo: string; email: string | null }>>([])
  const [erro, setErro] = useState<string | null>(null)
  const [aCarregar, setACarregar] = useState(true)

  useEffect(() => {
    void (async () => {
      const r = await pedirCentro<{ contas?: Array<Record<string, unknown>> }>("/api/admin/mtmauto-copia/contas")
      setACarregar(false)
      if (!r.success) { setErro(r.error ?? "não deu para ler as contas"); return }
      setContas((r.data?.contas ?? [])
        // Só contas de cliente entram: uma mestre (`prov:`) é origem, nunca subscritora.
        .filter((x) => /^(site|auto|wt):/i.test(String(x.ref)))
        // A etiqueta do dono (113) manda sobre o rótulo da corretora — é o nome por que ele a conhece.
        .map((x) => ({ ref: String(x.ref), rotulo: String(x.etiqueta ?? x.rotulo ?? x.ref), email: (x.email as string) ?? null })))
    })()
  }, [])

  const visiveis = contas.filter((x) => !q || `${x.rotulo} ${x.email ?? ""} ${x.ref}`.toLowerCase().includes(q.toLowerCase())).slice(0, 60)

  const ligar = async (ref: string) => {
    const r = await pedirCentro<{ mensagem?: string }>("/api/admin/mtmauto-copia/cadeia", { method: "POST", body: { accao: "ligar", ref, slug } })
    if (r.success) feito()
    else setErro(r.error ?? "falhou")
  }

  return (
    <Gaveta aberta titulo={`Adicionar subscritor a «${slug}»`} sub="Escreve na escolha do cliente (strategy_lots / subscrição) e ressincroniza as rotas." aoFechar={fechar}>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      <Campo rotulo="Procurar">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="etiqueta, email, login…" className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-white" />
      </Campo>
      {aCarregar
        ? <p className="px-1 py-2 text-[12px] text-zinc-500">A ler contas…</p>
        : visiveis.map((x) => (
          <button key={x.ref} type="button" onClick={() => void ligar(x.ref)} className="flex w-full items-center gap-2 border-b border-white/[0.05] px-1 py-1.5 text-left hover:bg-white/5">
            <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-200">{x.rotulo}</span>
            <span className="truncate text-[10.5px] text-zinc-500">{x.email ?? x.ref}</span>
          </button>
        ))}
    </Gaveta>
  )
}

/**
 * Criar as contas de um utilizador para uma ou mais estratégias (idempotente).
 *
 * O campo do utilizador era um UUID à mão. Ninguém sabe UUIDs de cor, por isso o botão existia e não
 * se usava: procura-se por email pela MESMA pesquisa da paleta de comandos (/api/admin/centro/pesquisa)
 * e o uuid nunca é escrito à mão.
 */
function GavetaCriarContas({ estrategias, fechar, feito }: { estrategias: NoEstrategia[]; fechar: () => void; feito: () => void }) {
  const [userId, setUserId] = useState("")
  const [quem, setQuem] = useState<string | null>(null)
  const [qUser, setQUser] = useState("")
  const [achados, setAchados] = useState<Array<{ id: string; titulo: string; sub: string }>>([])
  const [aProcurar, setAProcurar] = useState(false)

  // Pesquisa com travão: o endpoint corre sobre os loaders em cache, mas não a cada tecla.
  useEffect(() => {
    const t = qUser.trim()
    if (t.length < 2) { setAchados([]); return }
    const atraso = setTimeout(() => {
      void (async () => {
        setAProcurar(true)
        const r = await pedirCentro<{ resultados?: Array<{ tipo: string; id: string; titulo: string; sub: string }> }>(`/api/admin/centro/pesquisa?q=${encodeURIComponent(t)}`)
        setAProcurar(false)
        setAchados(r.success ? (r.data?.resultados ?? []).filter((x) => x.tipo === "utilizador").slice(0, 12) : [])
      })()
    }, 350)
    return () => clearTimeout(atraso)
  }, [qUser])

  const [saldo, setSaldo] = useState("1000")
  const [escolhidas, setEscolhidas] = useState<string[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [mensagem, setMensagem] = useState<string | null>(null)
  const [aCriar, setACriar] = useState(false)

  const criar = async () => {
    setACriar(true); setErro(null); setMensagem(null)
    const r = await pedirCentro<{ mensagem?: string }>("/api/admin/mtmauto-copia/cadeia", {
      method: "POST",
      body: { accao: "criar-contas", userId: userId.trim(), slugs: escolhidas, saldo: Number(saldo) || undefined },
    })
    setACriar(false)
    if (r.success) { setMensagem(r.data?.mensagem ?? "feito"); feito() }
    else setErro(r.error ?? "falhou")
  }

  return (
    <Gaveta aberta titulo="Criar contas para um utilizador" sub="Conta MTM Funded simulada + linha no MTM Auto + subscrição. Repetir não duplica." aoFechar={fechar}>
      {erro && <Aviso tom="grave">{erro}</Aviso>}
      {mensagem && <Aviso tom="info">{mensagem}</Aviso>}
      <Campo rotulo="Utilizador">
        {userId ? (
          <div className="flex items-center gap-2 rounded-md border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2 py-1">
            <span className="min-w-0 flex-1 truncate text-[12px] text-[#E9C46A]">{quem ?? userId}</span>
            <button type="button" onClick={() => { setUserId(""); setQuem(null) }} className="text-[11px] text-zinc-400 hover:text-white">trocar</button>
          </div>
        ) : (
          <>
            <input value={qUser} onChange={(e) => setQUser(e.target.value)} placeholder="email ou nome do membro…" className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-white" />
            {aProcurar && <p className="px-1 py-1 text-[11px] text-zinc-500">a procurar…</p>}
            {achados.map((u) => (
              <button key={u.id} type="button" onClick={() => { setUserId(u.id); setQuem(u.titulo) }} className="flex w-full items-center gap-2 border-b border-white/[0.05] px-1 py-1.5 text-left hover:bg-white/5">
                <span className="min-w-0 flex-1 truncate text-[12px] text-zinc-200">{u.titulo}</span>
                <span className="truncate text-[10.5px] text-zinc-500">{u.sub}</span>
              </button>
            ))}
          </>
        )}
      </Campo>
      <Campo rotulo="Saldo de partida (USD)">
        <input value={saldo} onChange={(e) => setSaldo(e.target.value)} inputMode="numeric" className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[12px] text-white" />
      </Campo>
      <Campo rotulo="Estratégias">
        <div className="flex flex-wrap gap-1.5">
          {estrategias.map((n) => (
            <button
              key={n.slug}
              type="button"
              onClick={() => setEscolhidas((v) => (v.includes(n.slug) ? v.filter((s) => s !== n.slug) : [...v, n.slug]))}
              className={`rounded-md px-2 py-1 text-[11.5px] ${escolhidas.includes(n.slug) ? "bg-[#D2A63C] text-black" : "border border-white/10 text-zinc-300 hover:bg-white/5"}`}
            >
              {n.nome}
            </button>
          ))}
        </div>
      </Campo>
      <div className="pt-2">
        <Botao tom="ouro" onClick={() => void criar()} disabled={aCriar || !userId || escolhidas.length === 0}>
          {aCriar ? "A criar…" : `Criar ${escolhidas.length || ""} conta(s)`}
        </Botao>
      </div>
    </Gaveta>
  )
}
