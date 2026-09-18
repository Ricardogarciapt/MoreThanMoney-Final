"use client"

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { Loader2, Zap } from "lucide-react"

/**
 * NEGOCIAÇÃO NUM CLIQUE — como o «One Click Trading» do MetaTrader 5 e o «One-click trading» do
 * TradingView.
 *
 * Desligada (por defeito), toda a acção que mexe na conta passa por uma confirmação: abrir, pôr
 * pendente, fechar (total ou parcial), mover SL/TP/pendente arrastando a linha, cancelar. Ligada,
 * tudo isso sai logo — e o resultado aparece num aviso curto.
 *
 * Duas regras que não dependem do interruptor:
 *  · uma conta em modo investor nunca negoceia (os botões nem aparecem: `podeNegociar`);
 *  · «Usar este sinal» só pré-preenche — nunca envia.
 *
 * Ligar pela primeira vez pede que se aceite o aviso. A aceitação e o estado ficam no browser
 * (localStorage) com o id da conta na chave: ligar numa conta não liga as outras.
 *
 * Os componentes chamam `executar(descricao, fn, { confirmar })`:
 *  · `confirmar: true` — a acção ainda não teve confirmação na interface (arrastar uma linha, «×»,
 *    «Cancelar»): com o interruptor desligado abre a janela de confirmação;
 *  · `confirmar: false` — a própria interface já foi a confirmação (o «Confirmar compra» do resumo,
 *    o «Fechar tudo» depois de escolher o volume): executa-se logo.
 * Em ambos os casos há protecção contra toques repetidos: a mesma acção dentro de 800 ms, ou
 * enquanto a anterior ainda corre, é ignorada.
 */

export const CHAVE_UM_CLIQUE = (accountId: string) => `mtmfunded_um_clique:${accountId}`
export const CHAVE_UM_CLIQUE_ACEITE = (accountId: string) => `mtmfunded_um_clique_aceite:${accountId}`
/** A aceitação também fica ao nível do utilizador (serve de registo; cada conta pede a sua). */
export const CHAVE_UM_CLIQUE_ACEITE_UTILIZADOR = "mtmfunded_um_clique_aceite"

export const TEXTO_AVISO_UM_CLIQUE =
  "Com a negociação num clique, as ordens são enviadas imediatamente, sem janela de confirmação. Um toque por engano abre, fecha ou altera uma posição."
/** Contas TradeLocker/MT5 no WebTrader: dinheiro real. */
export const TEXTO_AVISO_UM_CLIQUE_REAL =
  "CONTA REAL: com a negociação num clique, as ordens seguem imediatamente para a tua corretora, com dinheiro real, sem janela de confirmação. Um toque por engano abre, fecha ou altera uma posição real."

const REPETICAO_MS = 800

/** Erro de quem carregou em «Cancelar» na confirmação — quem chamou repõe a linha e cala-se. */
export class AccaoCancelada extends Error {
  constructor() { super("cancelado") }
}

export interface ResultadoAccao { precoExecucao?: number | null; precoFecho?: number | null }

interface Valor {
  ligado: boolean
  /** Uma acção está a correr — os botões de ordem ficam desactivados. */
  ocupado: boolean
  pedirLigar: () => void
  desligar: () => void
  executar: <T>(descricao: string, fn: () => Promise<T>, opcoes: { confirmar: boolean; digitos?: number }) => Promise<T>
}

const Contexto = createContext<Valor | null>(null)

/** Sem provider (componentes usados fora de uma conta): confirma sempre, com o diálogo do browser. */
const SEM_PROVIDER: Valor = {
  ligado: false,
  ocupado: false,
  pedirLigar: () => {},
  desligar: () => {},
  executar: async (descricao, fn, { confirmar }) => {
    if (confirmar && typeof window !== "undefined" && !window.confirm(`${descricao}?`)) throw new AccaoCancelada()
    return fn()
  },
}

export function useUmClique(): Valor {
  return useContext(Contexto) ?? SEM_PROVIDER
}

function ler(chave: string): string | null {
  try { return localStorage.getItem(chave) } catch { return null }
}
function escrever(chave: string, v: string) {
  try { localStorage.setItem(chave, v) } catch { /* modo privado: vale só nesta página */ }
}

export function UmCliqueProvider({ accountId, investor, real = false, children }: { accountId: string; investor: boolean; real?: boolean; children: ReactNode }) {
  const [ligadoGuardado, setLigadoGuardado] = useState(false)
  const [aAceitar, setAAceitar] = useState(false)
  const [confirmacao, setConfirmacao] = useState<{ descricao: string; ok: () => void; nao: () => void } | null>(null)
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [emCurso, setEmCurso] = useState(0)
  const ultimas = useRef<Map<string, { em: number; promessa: Promise<unknown> | null }>>(new Map())

  useEffect(() => {
    setLigadoGuardado(ler(CHAVE_UM_CLIQUE(accountId)) === "1" && ler(CHAVE_UM_CLIQUE_ACEITE(accountId)) != null)
  }, [accountId])
  useEffect(() => { if (!aviso) return; const t = setTimeout(() => setAviso(null), 3500); return () => clearTimeout(t) }, [aviso])
  // Esc na confirmação = Cancelar (e na janela do aviso, desistir de ligar).
  useEffect(() => {
    if (!confirmacao && !aAceitar) return
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      if (confirmacao) confirmacao.nao()
      else setAAceitar(false)
    }
    window.addEventListener("keydown", tecla)
    return () => window.removeEventListener("keydown", tecla)
  }, [confirmacao, aAceitar])
  // Sair da conta com uma confirmação aberta: a promessa de quem pediu não fica pendurada para sempre.
  const confirmacaoRef = useRef(confirmacao)
  confirmacaoRef.current = confirmacao
  useEffect(() => () => { confirmacaoRef.current?.nao() }, [])

  // Investor nunca negoceia — o interruptor não tem efeito nenhum aí.
  const ligado = ligadoGuardado && !investor

  const pedirLigar = useCallback(() => {
    if (investor) return
    if (ler(CHAVE_UM_CLIQUE_ACEITE(accountId)) != null) {
      escrever(CHAVE_UM_CLIQUE(accountId), "1")
      setLigadoGuardado(true)
    } else setAAceitar(true)
  }, [accountId, investor])
  const desligar = useCallback(() => {
    escrever(CHAVE_UM_CLIQUE(accountId), "0")
    setLigadoGuardado(false)
  }, [accountId])
  const aceitar = () => {
    const agora = new Date().toISOString()
    escrever(CHAVE_UM_CLIQUE_ACEITE(accountId), agora)
    escrever(CHAVE_UM_CLIQUE_ACEITE_UTILIZADOR, agora)
    escrever(CHAVE_UM_CLIQUE(accountId), "1")
    setLigadoGuardado(true)
    setAAceitar(false)
  }

  const executar = useCallback(<T,>(descricao: string, fn: () => Promise<T>, opcoes: { confirmar: boolean; digitos?: number }): Promise<T> => {
    const correr = async (): Promise<T> => {
      const u = ultimas.current.get(descricao)
      if (u && (u.promessa || Date.now() - u.em < REPETICAO_MS)) {
        // Toque repetido: não se envia outra vez. Quem chamou recebe o mesmo resultado (ou nada).
        if (u.promessa) return u.promessa as Promise<T>
        throw new AccaoCancelada()
      }
      const promessa = fn()
      ultimas.current.set(descricao, { em: Date.now(), promessa })
      setEmCurso((n) => n + 1)
      try {
        const r = await promessa
        const res = (r ?? {}) as { plano?: ResultadoAccao }
        const preco = res.plano?.precoExecucao ?? res.plano?.precoFecho
        setAviso({ tipo: "ok", texto: `${descricao} — feito${preco != null ? ` @ ${opcoes.digitos != null ? Number(preco).toFixed(opcoes.digitos) : preco}` : ""}` })
        return r
      } catch (e) {
        setAviso({ tipo: "erro", texto: `${descricao}: ${(e as Error).message}` })
        throw e
      } finally {
        ultimas.current.set(descricao, { em: Date.now(), promessa: null })
        setEmCurso((n) => n - 1)
      }
    }
    if (ligado || !opcoes.confirmar) return correr()
    return new Promise<T>((ok, falha) => {
      setConfirmacao({
        descricao,
        ok: () => { setConfirmacao(null); correr().then(ok, falha) },
        nao: () => { setConfirmacao(null); falha(new AccaoCancelada()) },
      })
    })
  }, [ligado])

  return (
    <Contexto.Provider value={{ ligado, ocupado: emCurso > 0, pedirLigar, desligar, executar }}>
      {children}

      {aAceitar && (
        <Janela titulo="Negociação num clique">
          <AceitarAviso real={real} onAceitar={aceitar} onCancelar={() => setAAceitar(false)} />
        </Janela>
      )}

      {confirmacao && (
        <Janela titulo="Confirmar">
          <p className="text-[13px] text-zinc-200">{confirmacao.descricao}?</p>
          {real && <p className="mt-1.5 rounded bg-rose-500/10 px-2 py-1 text-[11px] text-rose-200">Conta real — executa na tua corretora.</p>}
          <div className="mt-3 flex gap-2">
            <button type="button" onClick={confirmacao.nao} className="flex-1 rounded-lg border border-white/10 py-2 text-zinc-300">Cancelar</button>
            <button type="button" autoFocus onClick={confirmacao.ok} className="flex-[2] rounded-lg bg-[#2962FF] py-2 font-bold text-white">Confirmar</button>
          </div>
          <p className="mt-2 text-[10.5px] text-zinc-500">Para enviar sem esta janela, liga a negociação num clique (⚡).</p>
        </Janela>
      )}

      {(aviso || emCurso > 0) && (
        <div role="status" className="pointer-events-none fixed inset-x-0 bottom-[max(16px,env(safe-area-inset-bottom))] z-[1000] flex justify-center px-4">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-[12.5px] shadow-xl ${aviso?.tipo === "erro" ? "bg-rose-600 text-white" : "bg-[#1E222D] text-zinc-100 ring-1 ring-white/10"}`}>
            {emCurso > 0 && !aviso ? <><Loader2 className="h-4 w-4 animate-spin" /> A enviar…</> : aviso?.texto}
          </div>
        </div>
      )}
    </Contexto.Provider>
  )
}

function Janela({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[1001] grid place-items-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-label={titulo}>
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-[#131722] p-4 text-[12.5px] text-white shadow-2xl">
        <p className="mb-2 flex items-center gap-1.5 text-[14px] font-bold"><Zap className="h-4 w-4 text-amber-300" /> {titulo}</p>
        {children}
      </div>
    </div>
  )
}

function AceitarAviso({ onAceitar, onCancelar, real }: { onAceitar: () => void; onCancelar: () => void; real?: boolean }) {
  const [marcado, setMarcado] = useState(false)
  return (
    <>
      <p className="leading-relaxed text-zinc-200">{real ? TEXTO_AVISO_UM_CLIQUE_REAL : TEXTO_AVISO_UM_CLIQUE}</p>
      <label className="mt-3 flex items-start gap-2 text-zinc-300">
        <input type="checkbox" checked={marcado} onChange={(e) => setMarcado(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#2962FF]" />
        Li e percebi o risco. Posso desligar a qualquer momento.
      </label>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={onCancelar} className="flex-1 rounded-lg border border-white/10 py-2 text-zinc-300">Cancelar</button>
        <button type="button" disabled={!marcado} onClick={onAceitar} className="flex-[2] rounded-lg bg-[#2962FF] py-2 font-bold text-white disabled:opacity-40">Aceito</button>
      </div>
    </>
  )
}

/** O interruptor ⚡ (ao lado de SELL/BUY) ou em versão de cartão (definições da conta). */
export function InterruptorUmClique({ variante = "compacto" }: { variante?: "compacto" | "cartao" }) {
  const u = useUmClique()
  const alternar = () => (u.ligado ? u.desligar() : u.pedirLigar())
  if (variante === "compacto") {
    return (
      <button
        type="button" onClick={alternar} role="switch" aria-checked={u.ligado}
        aria-label="Negociação num clique"
        title={u.ligado ? "Negociação num clique LIGADA — carregar para desligar" : "Ligar a negociação num clique"}
        className={`grid min-h-[28px] w-9 shrink-0 place-items-center rounded-xl border [@media(pointer:coarse)]:min-h-[44px] [@media(pointer:coarse)]:w-11 ${u.ligado ? "border-amber-400 bg-amber-400/15 text-amber-300" : "border-white/10 text-zinc-500 hover:text-zinc-300"}`}
      >
        <Zap className="h-4 w-4" fill={u.ligado ? "currentColor" : "none"} />
      </button>
    )
  }
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-white"><Zap className="h-3.5 w-3.5 text-amber-300" /> Negociação num clique</p>
        <button type="button" onClick={alternar} role="switch" aria-checked={u.ligado} aria-label="Negociação num clique"
          className={`relative h-5 w-9 rounded-full transition ${u.ligado ? "bg-amber-400" : "bg-white/15"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${u.ligado ? "left-[18px]" : "left-0.5"}`} />
        </button>
      </div>
      <p className="text-[10.5px] leading-snug text-zinc-500">
        {u.ligado
          ? "Ligada: abrir, fechar, cancelar e arrastar SL/TP enviam logo, sem confirmação."
          : "Desligada: cada ordem, fecho, cancelamento ou SL/TP arrastado pede confirmação."}
      </p>
    </div>
  )
}

/** Etiqueta «⚡ 1 clique» para o cabeçalho do ticket. */
export function EtiquetaUmClique() {
  const u = useUmClique()
  if (!u.ligado) return null
  return (
    <span className="inline-flex items-center gap-0.5 rounded bg-amber-400/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
      <Zap className="h-3 w-3" fill="currentColor" /> 1 clique
    </span>
  )
}
