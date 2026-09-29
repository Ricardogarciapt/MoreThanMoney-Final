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
import { Aviso, Botao, Campo, Gaveta, Pilula, pedirCentro } from "../centro/ui"

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
  const [gaveta, setGaveta] = useState<null | { tipo: "adicionar"; slug: string } | { tipo: "contas" }>(null)
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[11px] text-zinc-500">
          Arrasta a BARRA de uma estratégia para a arrumar (só desenho). Arrasta um SUBSCRITOR para outra estratégia
          para o mudar de cópia — isso escreve na base. Com <kbd className="rounded bg-white/10 px-1">Alt</kbd> ele passa a
          seguir as duas.
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
                </div>
                <div className="flex flex-wrap gap-1 px-2 py-1">
                  <Pilula tom={n.modoPedido === "live" ? "grave" : n.modoPedido === "sombra" ? "info" : "neutro"}>cópia {n.modoPedido}</Pilula>
                  <Pilula tom={n.t2tModo === "live" ? "grave" : n.t2tModo === "sombra" ? "info" : "neutro"}>T2T {n.t2tModo}</Pilula>
                  {!n.ativo && <Pilula tom="neutro">inactivo</Pilula>}
                </div>
                <div className="max-h-[240px] overflow-y-auto border-t border-white/[0.06]">
                  {n.subscritores.length === 0
                    ? <p className="px-2 py-2 text-[11px] text-zinc-600">Larga aqui uma conta.</p>
                    : n.subscritores.map((s) => <Cartao key={s.rotaId} s={s} slug={n.slug} />)}
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
      {gaveta?.tipo === "contas" && <GavetaCriarContas estrategias={c.estrategias} fechar={() => setGaveta(null)} feito={() => { setGaveta(null); recarregar() }} />}
    </div>
  )
}

function Cartao({ s, slug }: { s: SubscritorCadeia; slug: string }) {
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/plain", JSON.stringify({ ref: s.ref, chave: s.chave, slugOrigem: slug }))}
      className="flex cursor-grab items-center gap-1.5 border-b border-white/[0.04] px-2 py-1 last:border-b-0 hover:bg-white/5 active:cursor-grabbing"
      title={s.motivo}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: s.efectivo === "live" ? "#f87171" : s.efectivo === "sombra" ? "#60a5fa" : "#52525b" }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11.5px] text-zinc-200">{s.etiqueta ?? s.email ?? s.ref}</p>
        <p className="truncate text-[10px] text-zinc-500">{s.lote}{s.tipo === "t2t" && " · T2T"}{s.pausadaMotivo && " · pausada"}</p>
      </div>
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

/** Criar as contas de um utilizador para uma ou mais estratégias (idempotente). */
function GavetaCriarContas({ estrategias, fechar, feito }: { estrategias: NoEstrategia[]; fechar: () => void; feito: () => void }) {
  const [userId, setUserId] = useState("")
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
      <Campo rotulo="Utilizador (uuid)">
        <input value={userId} onChange={(e) => setUserId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 font-mono text-[12px] text-white" />
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
        <Botao tom="ouro" onClick={() => void criar()} disabled={aCriar || !userId.trim() || escolhidas.length === 0}>
          {aCriar ? "A criar…" : `Criar ${escolhidas.length || ""} conta(s)`}
        </Botao>
      </div>
    </Gaveta>
  )
}
