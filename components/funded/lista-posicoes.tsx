"use client"

import { memo, useState } from "react"
import { ArrowLeftRight, BookOpen, Loader2, Pencil, Settings2, X } from "lucide-react"
import { type MapaPrecos, lucroUsd, precoDeFecho } from "@/lib/mtmfunded/simulado/matematica"
import { gestaoDaLinha, temGestao, type FiltroLote } from "@/lib/mtmfunded/simulado/avancadas"
import { type SimboloFicha, px, usd } from "./api"
import { AccaoCancelada, useUmClique } from "./um-clique"
import { numeroDe } from "./avancado"
import { BotoesGestaoAuto, tituloEtiqueta } from "./gestao-auto"
import { estadoGestaoAuto, type EstadoGestaoAuto } from "@/lib/mtmfunded/simulado/gestao-auto"

/**
 * POSIÇÕES, ORDENS PENDENTES E HISTÓRICO do WebTrader v2 — tabela densa no PRO, cartões no SIMPLE.
 *
 * O que a TradeLocker tem e isto também:
 *  · fechar tudo / ganhadoras / perdedoras / do símbolo, cancelar todas as pendentes;
 *  · por posição: SL/TP, fecho parcial («reduce-only»: só reduz, nunca inverte), inverter, e a
 *    GESTÃO automática (trailing, break-even, TPs parciais) que o motor executa;
 *  · Auto BE / Auto Trailing / Trailing já num toque (gestao-auto.tsx), na linha e no painel da gestão;
 *  · no histórico, a nota do diário de cada trade.
 * O lucro das abertas mexe com os preços ao vivo, com a matemática do servidor.
 * Tudo o que mexe na conta passa pela negociação num clique (um-clique.tsx): confirma ou não.
 */

type Linha = Record<string, any>
export type Executar = (accao: string, corpo: Record<string, unknown>) => Promise<unknown>

interface Props {
  vista: "posicoes" | "ordens" | "historico"
  posicoes: Linha[]
  ordens: Linha[]
  historico: Linha[]
  simbolos: Record<string, SimboloFicha>
  precos: MapaPrecos
  podeNegociar: boolean
  denso: boolean
  accountId: string
  simboloAtual?: string | null
  executar: Executar
  onSelecionarSimbolo: (symbol: string) => void
  onNota?: (positionId: string) => void
  notas?: Set<string>
}

const MOTIVOS: Record<string, string> = {
  manual: "manual", sl: "stop loss", tp: "take profit", tp_parcial: "TP parcial", stop_out: "stop-out",
  regra_quebrada: "regra quebrada", fim_de_ciclo: "fim de ciclo", estrategia: "estratégia",
}

export default function ListaPosicoes(p: Props) {
  const umClique = useUmClique()
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [edicao, setEdicao] = useState<{ id: string; modo: "sltp" | "parcial" | "gestao" } | null>(null)

  const correr = async (descricao: string, accao: string, corpo: Record<string, unknown>, confirmar = true, digitos?: number, manterEdicao = false) => {
    setOcupado(true); setErro(null)
    try {
      await umClique.executar(descricao, () => p.executar(accao, corpo), { confirmar, digitos })
      if (!manterEdicao) setEdicao(null)
    } catch (e) {
      if (!(e instanceof AccaoCancelada)) setErro((e as Error).message)
    } finally { setOcupado(false) }
  }
  const lote = (filtro: FiltroLote, nome: string) =>
    correr(`Fechar ${nome}`, "fechar_lote", { accountId: p.accountId, filtro, symbol: filtro === "simbolo" ? p.simboloAtual : undefined })

  // ── Histórico ──
  if (p.vista === "historico") {
    if (!p.historico.length) return <Vazio texto="Ainda sem trades fechadas." />
    return p.denso ? (
      <Tabela cabecalho={["Fecho", "Símbolo", "Lado", "Vol.", "Entrada", "Saída", "Motivo", "Lucro", "Líquido", ""]}>
        {p.historico.map((h) => {
          const d = p.simbolos[h.symbol]?.digits ?? 5
          const liquido = Number(h.pnl ?? 0) + Number(h.swap ?? 0) - Number(h.comissao ?? 0)
          const raiz = String(h.mae_id ?? h.id)
          return (
            <tr key={h.id} className="border-t border-white/5 hover:bg-white/[0.03]">
              <Td>{new Date(h.fechada_em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</Td>
              <Td><button className="font-semibold text-white hover:underline" onClick={() => p.onSelecionarSimbolo(h.symbol)}>{h.symbol}</button></Td>
              <Td><Lado d={h.direcao} /></Td>
              <Td mono>{Number(h.volume)}</Td>
              <Td mono>{px(Number(h.preco_entrada), d)}</Td>
              <Td mono>{px(Number(h.preco_fecho), d)}</Td>
              <Td>{MOTIVOS[h.motivo_fecho] ?? h.motivo_fecho ?? "—"}{h.mae_id ? " · parte" : ""}{h.comentario ? <span className="text-[#D2A63C]"> · {h.comentario}</span> : null}</Td>
              <Td mono cor={Number(h.pnl) >= 0 ? "text-emerald-400" : "text-rose-400"}>{usd(Number(h.pnl))}</Td>
              <Td mono cor={liquido >= 0 ? "text-emerald-300/80" : "text-rose-300/80"}>{usd(liquido)}</Td>
              <Td>{p.onNota && <button aria-label="nota no diário" title="Nota no diário" onClick={() => p.onNota!(raiz)} className={p.notas?.has(raiz) ? "text-[#D2A63C]" : "text-zinc-500 hover:text-white"}><BookOpen className="h-3.5 w-3.5" /></button>}</Td>
            </tr>
          )
        })}
      </Tabela>
    ) : (
      <div className="divide-y divide-white/5">
        {p.historico.map((h) => {
          const d = p.simbolos[h.symbol]?.digits ?? 5
          const raiz = String(h.mae_id ?? h.id)
          return (
            <div key={h.id} className="flex items-center gap-2 px-3 py-2.5 text-[12.5px]">
              <div className="min-w-0 flex-1">
                <p><Lado d={h.direcao} /> <b className="text-white">{h.symbol}</b> {Number(h.volume)}</p>
                <p className="truncate text-[10.5px] text-zinc-500">{px(Number(h.preco_entrada), d)} → {px(Number(h.preco_fecho), d)} · {MOTIVOS[h.motivo_fecho] ?? "—"} · {new Date(h.fechada_em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}</p>
              </div>
              <p className={`font-mono font-semibold ${Number(h.pnl) >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{usd(Number(h.pnl))}</p>
              {p.onNota && <button aria-label="nota no diário" onClick={() => p.onNota!(raiz)} className={`p-1 ${p.notas?.has(raiz) ? "text-[#D2A63C]" : "text-zinc-500"}`}><BookOpen className="h-4 w-4" /></button>}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Ordens pendentes ──
  if (p.vista === "ordens") {
    return (
      <div>
        {p.podeNegociar && p.ordens.length > 1 && (
          <BarraLote>
            <BotaoLote disabled={ocupado} onClick={() => correr(`Cancelar as ${p.ordens.length} ordens pendentes`, "cancelar_todas", { accountId: p.accountId })}>Cancelar todas</BotaoLote>
            {p.simboloAtual && p.ordens.some((o) => o.symbol === p.simboloAtual) && (
              <BotaoLote disabled={ocupado} onClick={() => correr(`Cancelar as pendentes de ${p.simboloAtual}`, "cancelar_todas", { accountId: p.accountId, symbol: p.simboloAtual })}>Cancelar {p.simboloAtual}</BotaoLote>
            )}
          </BarraLote>
        )}
        {erro && <p className="px-3 py-1 text-[11px] text-rose-300">{erro}</p>}
        {!p.ordens.length ? <Vazio texto="Sem ordens pendentes." /> : p.ordens.map((o) => {
          const d = p.simbolos[o.symbol]?.digits ?? 5
          const g = gestaoDaLinha(o)
          const cancelar = () => correr(`Cancelar ${o.direcao} ${o.tipo} ${o.symbol} @ ${px(Number(o.preco), d)}`, "cancelar", { orderId: o.id })
          return (
            <div key={o.id} className={`flex items-center gap-2 border-t border-white/5 px-3 ${p.denso ? "py-1.5 text-[12px]" : "py-2.5 text-[12.5px]"}`}>
              <div className="min-w-0 flex-1" onClick={() => p.onSelecionarSimbolo(o.symbol)}>
                <p className="truncate">
                  <span className={o.direcao === "buy" ? "text-emerald-400" : "text-rose-400"}>{String(o.direcao).toUpperCase()} {String(o.tipo).toUpperCase()}</span>{" "}
                  <b className="text-white">{o.symbol}</b> {Number(o.volume)} @ <span className="font-mono">{px(Number(o.preco), d)}</span>
                  {o.oco_grupo && <Etiqueta cor="#60a5fa">OCO</Etiqueta>}
                  {temGestao(g) && <EtiquetasGestao g={g} />}
                </p>
                <p className="truncate text-[10.5px] text-zinc-500">
                  SL {o.sl != null ? px(Number(o.sl), d) : "—"} · TP {o.tp != null ? px(Number(o.tp), d) : "—"}
                  {g.tps?.length ? ` · ${g.tps.map((t, i) => `TP${i + 1} ${px(t.preco, d)} ${t.pct}%`).join(" · ")}` : ""}
                  {o.expira_em ? ` · expira ${new Date(o.expira_em).toLocaleString("pt-PT", { dateStyle: "short", timeStyle: "short" })}` : " · GTC"}
                </p>
              </div>
              {p.podeNegociar && <button disabled={ocupado} onClick={cancelar} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-40">Cancelar</button>}
            </div>
          )
        })}
      </div>
    )
  }

  // ── Posições abertas ──
  const total = p.posicoes.reduce((a, pos) => a + (lucroDe(pos, p.simbolos, p.precos) ?? 0), 0)
  return (
    <div>
      {p.podeNegociar && p.posicoes.length > 0 && (
        <BarraLote>
          <span className={`mr-auto font-mono text-[12px] ${total >= 0 ? "text-emerald-300" : "text-rose-300"}`}>Flutuante {usd(total)} $</span>
          <BotaoLote disabled={ocupado} onClick={() => lote("todas", `as ${p.posicoes.length} posições`)}>Fechar todas</BotaoLote>
          <BotaoLote disabled={ocupado} onClick={() => lote("ganhadoras", "as ganhadoras")}>Ganhadoras</BotaoLote>
          <BotaoLote disabled={ocupado} onClick={() => lote("perdedoras", "as perdedoras")}>Perdedoras</BotaoLote>
          {p.simboloAtual && p.posicoes.some((x) => x.symbol === p.simboloAtual) && (
            <BotaoLote disabled={ocupado} onClick={() => lote("simbolo", `as de ${p.simboloAtual}`)}>{p.simboloAtual}</BotaoLote>
          )}
        </BarraLote>
      )}
      {erro && <p className="px-3 py-1 text-[11px] text-rose-300">{erro}</p>}
      {!p.posicoes.length && <Vazio texto="Sem posições abertas." />}
      {p.posicoes.map((pos) => (
        <LinhaPosicao
          key={pos.id} pos={pos} s={p.simbolos[pos.symbol]} precos={p.precos} denso={p.denso} podeNegociar={p.podeNegociar}
          ocupado={ocupado} edicao={edicao && edicao.id === pos.id ? edicao.modo : null}
          onEditar={(modo) => { setErro(null); setEdicao(modo ? { id: pos.id, modo } : null) }}
          onSelecionar={() => p.onSelecionarSimbolo(pos.symbol)}
          correr={correr} umCliqueLigado={umClique.ligado}
        />
      ))}
    </div>
  )
}

function lucroDe(pos: Linha, simbolos: Record<string, SimboloFicha>, precos: MapaPrecos): number | null {
  const s = simbolos[pos.symbol]
  const preco = precos[pos.symbol]
  if (!s || !preco) return null
  return lucroUsd(s, pos.direcao, Number(pos.volume), Number(pos.preco_entrada), precoDeFecho(pos.direcao, preco), precos)
}

const LinhaPosicao = memo(function LinhaPosicao({ pos, s, precos, denso, podeNegociar, ocupado, edicao, onEditar, onSelecionar, correr, umCliqueLigado }: {
  pos: Linha; s?: SimboloFicha; precos: MapaPrecos; denso: boolean; podeNegociar: boolean; ocupado: boolean
  edicao: "sltp" | "parcial" | "gestao" | null
  onEditar: (m: "sltp" | "parcial" | "gestao" | null) => void
  onSelecionar: () => void
  correr: Correr
  umCliqueLigado: boolean
}) {
  const d = s?.digits ?? 5
  const preco = precos[pos.symbol]
  const atual = preco ? precoDeFecho(pos.direcao, preco) : null
  const pnl = s && atual != null ? lucroUsd(s, pos.direcao, Number(pos.volume), Number(pos.preco_entrada), atual, precos) : null
  const g = gestaoDaLinha(pos)
  const est = estadoGestaoAuto(g, pos.direcao, Number(pos.preco_entrada), atual)
  const vol = Number(pos.volume)
  const nome = `${pos.symbol} ${vol}`
  const auto = podeNegociar && s ? <BotoesGestaoAuto pos={pos} s={s} precoFecho={atual} ocupado={ocupado} correr={correr} /> : null

  return (
    <div className={`border-t border-white/5 px-3 ${denso ? "py-1.5 text-[12px]" : "py-2.5 text-[12.5px]"}`}>
      <div className="flex items-center gap-2">
        <button className="min-w-0 flex-1 text-left" onClick={onSelecionar}>
          <p className="truncate">
            <Lado d={pos.direcao} /> <b className="text-white">{pos.symbol}</b> {vol}
            <span className="ml-1.5 font-mono text-zinc-400">{px(Number(pos.preco_entrada), d)} → {px(atual, d)}</span>
            {temGestao(g) && <EtiquetasGestao g={g} est={est} />}
          </p>
          <p className="truncate text-[10.5px] text-zinc-500">
            SL {pos.sl != null ? px(Number(pos.sl), d) : "—"} · TP {pos.tp != null ? px(Number(pos.tp), d) : "—"}
            {g.tps?.length ? ` · ${g.tps.map((t, i) => `${t.atingido ? "✓" : ""}TP${i + 1} ${px(t.preco, d)}`).join(" ")}` : ""}
            {pos.comentario ? <span className="text-[#D2A63C]"> · {pos.comentario}</span> : pos.origem && pos.origem !== "manual" ? ` · ${pos.origem === "ideia_mtm" ? "ideia MTM" : pos.origem}` : ""}
          </p>
        </button>
        <span className={`shrink-0 font-mono font-semibold ${denso ? "text-[13px]" : "text-[14px]"} ${pnl == null ? "text-zinc-500" : pnl >= 0 ? "text-emerald-400" : "text-rose-400"}`}>{usd(pnl)}</span>
        {podeNegociar && (
          <div className="flex shrink-0 items-center gap-0.5">
            {auto && <div className="mr-1 hidden sm:flex">{auto}</div>}
            <IconeAccao rotulo="SL/TP" onClick={() => onEditar(edicao === "sltp" ? null : "sltp")} ativo={edicao === "sltp"}><Pencil className="h-3.5 w-3.5" /></IconeAccao>
            <IconeAccao rotulo="Gestão automática (trailing, break-even, TPs)" onClick={() => onEditar(edicao === "gestao" ? null : "gestao")} ativo={edicao === "gestao"}><Settings2 className="h-3.5 w-3.5" /></IconeAccao>
            <IconeAccao rotulo="Inverter" disabled={ocupado} onClick={() => correr(`Inverter ${nome} (fecha e abre ${pos.direcao === "buy" ? "venda" : "compra"} ${vol})`, "inverter", { positionId: pos.id }, true, d)}><ArrowLeftRight className="h-3.5 w-3.5" /></IconeAccao>
            <button onClick={() => onEditar(edicao === "parcial" ? null : "parcial")} className={`rounded-md px-1.5 py-1 text-[11px] ${edicao === "parcial" ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`} title="Fecho parcial (só reduz)">½</button>
            <IconeAccao rotulo="Fechar" perigo disabled={ocupado} onClick={() => correr(`Fechar ${nome}`, "fechar", { positionId: pos.id }, true, d)}><X className="h-3.5 w-3.5" /></IconeAccao>
          </div>
        )}
      </div>
      {/* No telemóvel a gestão automática vai para uma linha própria (a de cima já está cheia). */}
      {auto && <div className="mt-1.5 flex justify-end sm:hidden">{auto}</div>}
      {edicao === "sltp" && <EditorSlTp pos={pos} d={d} ocupado={ocupado} correr={correr} onFechar={() => onEditar(null)} />}
      {edicao === "parcial" && s && <EditorParcial pos={pos} s={s} ocupado={ocupado} correr={correr} onFechar={() => onEditar(null)} />}
      {/* A chave muda quando a gestão muda (um botão Auto, o motor): o editor relê em vez de guardar por cima com valores velhos. */}
      {edicao === "gestao" && s && <EditorGestao key={assinaturaGestao(g)} pos={pos} s={s} precoFecho={atual} ocupado={ocupado} correr={correr} onFechar={() => onEditar(null)} />}
    </div>
  )
})

type Correr = (descricao: string, accao: string, corpo: Record<string, unknown>, confirmar?: boolean, digitos?: number, manterEdicao?: boolean) => Promise<void>

const assinaturaGestao = (g: ReturnType<typeof gestaoDaLinha>) =>
  [g.trailing_distancia, g.trailing_ativacao, g.be_gatilho, g.be_offset, g.be_no_tp1, g.be_feito, JSON.stringify(g.tps ?? [])].join("|")

function EditorSlTp({ pos, d, ocupado, correr, onFechar }: { pos: Linha; d: number; ocupado: boolean; correr: Correr; onFechar: () => void }) {
  const [sl, setSl] = useState(pos.sl == null ? "" : String(pos.sl))
  const [tp, setTp] = useState(pos.tp == null ? "" : String(pos.tp))
  return (
    <Caixa onFechar={onFechar}>
      <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
        <input inputMode="decimal" aria-label="stop loss" value={sl} onChange={(e) => setSl(e.target.value)} placeholder="SL" className="h-8 rounded-md border border-rose-500/30 bg-black px-2 font-mono text-white" />
        <input inputMode="decimal" aria-label="take profit" value={tp} onChange={(e) => setTp(e.target.value)} placeholder="TP" className="h-8 rounded-md border border-emerald-500/30 bg-black px-2 font-mono text-white" />
        <button disabled={ocupado} onClick={() => correr(`SL/TP de ${pos.symbol}`, "modificar", { positionId: pos.id, sl: numeroDe(sl), tp: numeroDe(tp) }, false, d)} className="rounded-md bg-[#D2A63C] px-3 font-bold text-black disabled:opacity-40">
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
        </button>
      </div>
    </Caixa>
  )
}

function EditorParcial({ pos, s, ocupado, correr, onFechar }: { pos: Linha; s: SimboloFicha; ocupado: boolean; correr: Correr; onFechar: () => void }) {
  const vol = Number(pos.volume)
  const [v, setV] = useState("")
  const escolhas = [25, 50, 75].map((pct) => Math.floor((vol * pct) / 100 / s.volume_step) * s.volume_step).map((x) => Math.round(x * 100) / 100).filter((x) => x >= s.volume_min && vol - x >= s.volume_min)
  const n = numeroDe(v)
  return (
    <Caixa onFechar={onFechar}>
      <div className="flex flex-wrap items-center gap-1.5">
        {escolhas.map((x, i) => <button key={x} onClick={() => setV(String(x))} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300">{[25, 50, 75][i]}% · {x}</button>)}
        <input inputMode="decimal" aria-label="volume a fechar" value={v} onChange={(e) => setV(e.target.value)} placeholder={`lotes (< ${vol})`} className="h-8 w-28 rounded-md border border-white/10 bg-black px-2 font-mono text-white" />
        <button disabled={ocupado || n == null || !(n > 0) || n >= vol} onClick={() => correr(`Reduzir ${pos.symbol} em ${n}`, "fechar", { positionId: pos.id, volume: n }, false, s.digits)} className="rounded-md bg-rose-500 px-3 py-1 font-bold text-white disabled:opacity-40">
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reduzir"}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">Só reduz a posição — nunca abre o lado contrário. O resto mantém SL, TP e gestão.</p>
    </Caixa>
  )
}

function EditorGestao({ pos, s, precoFecho, ocupado, correr, onFechar }: { pos: Linha; s: SimboloFicha; precoFecho: number | null; ocupado: boolean; correr: Correr; onFechar: () => void }) {
  const g = gestaoDaLinha(pos)
  const pip = s.pip_size
  const emPips = (x: number | null) => (x == null ? "" : String(Math.round((x / pip) * 10) / 10))
  const [trail, setTrail] = useState(emPips(g.trailing_distancia))
  const [ativ, setAtiv] = useState(emPips(g.trailing_ativacao))
  const [be, setBe] = useState(emPips(g.be_gatilho))
  const [off, setOff] = useState(emPips(g.be_offset || null))
  const [noTp1, setNoTp1] = useState(g.be_no_tp1)
  const [tps, setTps] = useState((g.tps ?? []).map((t) => ({ preco: String(t.preco), pct: String(t.pct), atingido: t.atingido })))
  const guardar = () => {
    const p = (t: string) => { const n = numeroDe(t); return n != null && n > 0 ? n * pip : null }
    const corpo = {
      trailing_distancia: p(trail), trailing_ativacao: p(ativ), be_gatilho: p(be), be_offset: p(off) ?? 0, be_no_tp1: noTp1,
      tps: tps.filter((t) => numeroDe(t.preco) && numeroDe(t.pct)).map((t) => ({ preco: numeroDe(t.preco), pct: numeroDe(t.pct), atingido: t.atingido })),
    }
    return correr(`Gestão de ${pos.symbol}`, "gestao", { positionId: pos.id, gestao: corpo }, false, s.digits)
  }
  const campo = "h-8 w-full rounded-md border border-white/10 bg-black px-2 font-mono text-[12px] text-white placeholder:text-zinc-600"
  return (
    <Caixa onFechar={onFechar}>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 border-b border-white/5 pb-2 text-[11px]">
        <span className="text-zinc-500">Num toque:</span>
        <BotoesGestaoAuto pos={pos} s={s} precoFecho={precoFecho} ocupado={ocupado} correr={correr} manterEdicao />
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-[11px] sm:grid-cols-4">
        <label className="space-y-0.5"><span className="text-zinc-500">Trailing (pips)</span><input inputMode="decimal" value={trail} onChange={(e) => setTrail(e.target.value)} className={campo} /></label>
        <label className="space-y-0.5"><span className="text-zinc-500">Começa a +pips</span><input inputMode="decimal" value={ativ} onChange={(e) => setAtiv(e.target.value)} className={campo} /></label>
        <label className="space-y-0.5"><span className="text-zinc-500">Break-even a +pips</span><input inputMode="decimal" value={be} onChange={(e) => setBe(e.target.value)} disabled={g.be_feito} className={campo} /></label>
        <label className="space-y-0.5"><span className="text-zinc-500">Offset BE (pips)</span><input inputMode="decimal" value={off} onChange={(e) => setOff(e.target.value)} disabled={g.be_feito} className={campo} /></label>
      </div>
      <label className="mt-1.5 flex items-center gap-1.5 text-[11px] text-zinc-300">
        <input type="checkbox" checked={noTp1} disabled={g.be_feito} onChange={(e) => setNoTp1(e.target.checked)} className="h-3.5 w-3.5 accent-[#D2A63C]" />
        Break-even quando o TP1 for atingido {g.be_feito && <span className="text-emerald-300">· já aplicado</span>}
      </label>
      <div className="mt-1.5 space-y-1">
        {tps.map((t, i) => (
          <div key={i} className="grid grid-cols-[2.5rem_1fr_4rem_auto] items-center gap-1.5 text-[11px]">
            <span className={t.atingido ? "text-zinc-500 line-through" : "text-emerald-300"}>TP{i + 1}</span>
            <input inputMode="decimal" aria-label={`TP${i + 1} preço`} value={t.preco} disabled={t.atingido} onChange={(e) => setTps(tps.map((x, j) => (j === i ? { ...x, preco: e.target.value } : x)))} className={campo} placeholder="preço" />
            <input inputMode="decimal" aria-label={`TP${i + 1} %`} value={t.pct} disabled={t.atingido} onChange={(e) => setTps(tps.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} className={campo} placeholder="%" />
            {!t.atingido ? <button aria-label="remover" onClick={() => setTps(tps.filter((_, j) => j !== i))} className="text-zinc-500"><X className="h-3.5 w-3.5" /></button> : <span className="text-emerald-400">✓</span>}
          </div>
        ))}
        {tps.length < 3 && <button onClick={() => setTps([...tps, { preco: "", pct: "25", atingido: false }])} className="text-[11px] text-[#D2A63C]">+ TP{tps.length + 1}</button>}
      </div>
      <div className="mt-2 flex justify-end">
        <button disabled={ocupado} onClick={guardar} className="rounded-md bg-[#D2A63C] px-3 py-1.5 text-[12px] font-bold text-black disabled:opacity-40">{ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar gestão"}</button>
      </div>
    </Caixa>
  )
}

// ── peças ──
function Lado({ d }: { d: string }) {
  return <span className={`font-semibold ${d === "buy" ? "text-emerald-400" : "text-rose-400"}`}>{d === "buy" ? "BUY" : "SELL"}</span>
}
function Etiqueta({ cor, children, titulo }: { cor: string; children: React.ReactNode; titulo?: string }) {
  return <span title={titulo} className="ml-1 rounded px-1 py-px align-middle text-[9.5px] font-bold" style={{ color: cor, background: `${cor.slice(0, 7)}22` }}>{children}</span>
}
function EtiquetasGestao({ g, est }: { g: ReturnType<typeof gestaoDaLinha>; est?: EstadoGestaoAuto }) {
  // Com o estado (posições): TRAIL à espera da ativação fica esbatido; a seguir o preço, cheio.
  const esperar = est?.trailing === "a_espera"
  return (
    <>
      {g.trailing_distancia ? <Etiqueta cor={esperar ? "#a78bfa99" : "#a78bfa"} titulo={tituloEtiqueta(est, "trail")}>{esperar ? "TRAIL ⏸" : "TRAIL"}</Etiqueta> : null}
      {g.be_gatilho || g.be_no_tp1 ? <Etiqueta cor={g.be_feito ? "#34d399" : "#fbbf24"} titulo={tituloEtiqueta(est, "be")}>{g.be_feito ? "BE ✓" : "BE"}</Etiqueta> : null}
      {g.tps?.length ? <Etiqueta cor="#34d399">{g.tps.filter((t) => t.atingido).length}/{g.tps.length} TP</Etiqueta> : null}
    </>
  )
}
function IconeAccao({ rotulo, onClick, children, disabled, perigo, ativo }: { rotulo: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; perigo?: boolean; ativo?: boolean }) {
  return (
    <button type="button" aria-label={rotulo} title={rotulo} disabled={disabled} onClick={onClick}
      className={`grid h-7 w-7 place-items-center rounded-md disabled:opacity-40 ${ativo ? "bg-white/10 text-white" : perigo ? "text-rose-400 hover:bg-rose-500/15" : "text-zinc-400 hover:bg-white/10 hover:text-white"}`}>
      {children}
    </button>
  )
}
function BarraLote({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-1 border-b border-white/5 px-2 py-1.5">{children}</div>
}
function BotaoLote({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return <button disabled={disabled} onClick={onClick} className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-zinc-300 hover:border-rose-500/40 hover:text-rose-200 disabled:opacity-40">{children}</button>
}
function Caixa({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  return (
    <div className="relative mt-2 rounded-lg border border-white/10 bg-black/40 p-2 pr-7">
      <button aria-label="fechar" onClick={onFechar} className="absolute right-1.5 top-1.5 text-zinc-500 hover:text-white"><X className="h-3.5 w-3.5" /></button>
      {children}
    </div>
  )
}
function Vazio({ texto }: { texto: string }) {
  return <p className="p-4 text-center text-[12px] text-zinc-500">{texto}</p>
}
function Tabela({ cabecalho, children }: { cabecalho: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[12px]">
        <thead className="sticky top-0 bg-[#131722] text-left text-[10px] uppercase tracking-wide text-zinc-500">
          <tr>{cabecalho.map((c, i) => <th key={i} className="px-3 py-1.5 font-medium">{c}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}
function Td({ children, mono, cor }: { children: React.ReactNode; mono?: boolean; cor?: string }) {
  return <td className={`whitespace-nowrap px-3 py-1.5 ${mono ? "font-mono" : ""} ${cor ?? "text-zinc-300"}`}>{children}</td>
}
