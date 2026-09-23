"use client"

/**
 * CONFIRMAR UM SINAL — o que antes era um rascunho que aparecia calado no ticket.
 *
 * Um sinal de scanner, de alerta ou uma ideia MTM chega por deep link (?origem=scanner|ideia_mtm)
 * ou pela faixa do gráfico, e até aqui só PRÉ-ENCHIA o ticket: o símbolo mudava, os níveis
 * apareciam, e quem não estivesse a olhar para o painel da direita não percebia que tinha uma
 * ordem pronta a disparar — nem com que risco. Aceitar um sinal é uma decisão, e uma decisão
 * pede um sítio onde se lê tudo antes de carregar.
 *
 * Por isso abre-se esta folha: direcção, símbolo, entrada, stop, alvo, lote, o risco em dinheiro
 * E em percentagem da conta, a relação risco/recompensa, a margem e a comissão — os mesmos
 * números que o ticket calcula (é o mesmo contexto, não uma segunda conta de cabeça). Daqui sai-se
 * por três portas: confirmar (abre), ajustar (fecha a folha e deixa o rascunho no ticket e no
 * gráfico, para arrastar níveis) ou descartar.
 *
 * Um sinal só interrompe UMA vez: descartado ou confirmado, não volta a abrir para a mesma
 * referência. E nunca aparece sem números — se o preço ainda não chegou, espera-se por ele em vez
 * de mostrar um risco a zero que não quer dizer nada.
 */
import { useEffect, useState } from "react"
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Loader2, X } from "lucide-react"
import { useRascunho } from "./rascunho-ordem"

const fmt = (n: number | null | undefined, casas = 2) =>
  n == null || !Number.isFinite(n) ? "—" : n.toLocaleString("pt-PT", { minimumFractionDigits: casas, maximumFractionDigits: casas })

const NOME_ORIGEM: Record<string, string> = {
  scanner: "Sinal do scanner",
  ideia_mtm: "Ideia MTM",
  alerta: "Alerta de preço",
}

export default function ModalSinal({ nomeConta }: { nomeConta?: string | null }) {
  const k = useRascunho()
  const { r, simbolo, entrada, sl, tp, volume, resumo, erros, temErros, aEnviar, erroEnvio } = k
  // Um sinal identifica-se pela referência; sem ela (sinal local do gráfico), pelo par símbolo+lado.
  const chave = r.ideiaRef ?? (r.origem !== "manual" ? `${simbolo?.symbol ?? ""}:${r.lado}:${r.sl ?? ""}:${r.tp ?? ""}` : null)
  const [tratadas, setTratadas] = useState<string[]>([])
  const [aberto, setAberto] = useState(false)

  const deSinal = r.origem === "scanner" || r.origem === "ideia_mtm"
  const pronto = Boolean(simbolo) && entrada != null

  useEffect(() => {
    if (!deSinal || !chave || !pronto) return
    if (tratadas.includes(chave)) return
    setAberto(true)
  }, [deSinal, chave, pronto, tratadas])

  if (!aberto || !deSinal || !simbolo) return null

  const fechar = (descartar: boolean) => {
    if (chave) setTratadas((t) => [...t, chave])
    setAberto(false)
    if (descartar) k.limpar()
  }

  const confirmar = async () => {
    await k.enviar()
    // `enviar` limpa o rascunho quando corre bem; se falhou, o erro fica à vista na folha.
    if (!k.erroEnvio) fechar(false)
  }

  const compra = r.lado === "buy"
  const Seta = compra ? ArrowUpRight : ArrowDownRight
  const cor = compra ? "text-emerald-300" : "text-rose-300"
  const fundoCor = compra ? "bg-emerald-500/10" : "bg-rose-500/10"

  const linha = (rot: string, valor: string, forte = false) => (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span className="text-zinc-400">{rot}</span>
      <span className={`font-mono tabular-nums ${forte ? "font-semibold text-white" : "text-zinc-200"}`}>{valor}</span>
    </div>
  )

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-[420px] overflow-hidden rounded-t-2xl border border-white/10 bg-[#0e0e10] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#D2A63C]">{NOME_ORIGEM[r.origem] ?? "Sinal"}</p>
            <p className="mt-0.5 truncate text-[17px] font-bold text-white">{simbolo.symbol}</p>
            {nomeConta && <p className="truncate text-[11.5px] text-zinc-500">{nomeConta}</p>}
          </div>
          <button type="button" onClick={() => fechar(false)} aria-label="Fechar" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/5">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <div className={`flex items-center gap-2 rounded-xl px-3 py-2 ${fundoCor}`}>
            <Seta className={`h-5 w-5 ${cor}`} />
            <span className={`text-[15px] font-bold ${cor}`}>{compra ? "Comprar" : "Vender"}</span>
            <span className="ml-auto font-mono text-[15px] tabular-nums text-white">{fmt(entrada, simbolo.digits ?? 2)}</span>
          </div>

          <div className="mt-2 divide-y divide-white/5">
            {linha("Stop loss", sl == null ? "sem stop" : fmt(sl, simbolo.digits ?? 2))}
            {linha("Take profit", tp == null ? "sem alvo" : fmt(tp, simbolo.digits ?? 2))}
            {linha("Lote", fmt(volume, 2), true)}
            {linha("Risco", resumo.risco == null ? "—" : `${fmt(resumo.risco)} USD${resumo.riscoPct == null ? "" : ` · ${fmt(resumo.riscoPct)}%`}`, true)}
            {linha("Ganho no alvo", resumo.ganho == null ? "—" : `${fmt(resumo.ganho)} USD${resumo.ganhoPct == null ? "" : ` · ${fmt(resumo.ganhoPct)}%`}`)}
            {linha("Risco/recompensa", resumo.rr ?? "—")}
            {linha("Distância", `${resumo.pipsSl == null ? "—" : `${fmt(resumo.pipsSl, 1)} pips`}${resumo.pipsTp == null ? "" : ` → ${fmt(resumo.pipsTp, 1)} pips`}`)}
            {linha("Margem", resumo.margem == null ? "—" : `${fmt(resumo.margem)} USD`)}
            {linha("Comissão", `${fmt(resumo.comissao)} USD`)}
          </div>

          {sl == null && (
            <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-amber-500/10 px-2.5 py-1.5 text-[12px] text-amber-200">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Este sinal vem sem stop loss. Sem stop, a perda desta posição não tem limite definido.
            </p>
          )}
          {temErros && (
            <p className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-200">
              {erros.volume ?? erros.entrada ?? erros.sl ?? erros.tp ?? erros.margem ?? erros.avancado}
            </p>
          )}
          {erroEnvio && <p className="mt-2 rounded-lg bg-rose-500/10 px-2.5 py-1.5 text-[12px] text-rose-200">{erroEnvio}</p>}
        </div>

        <div className="flex gap-2 border-t border-white/10 px-4 py-3">
          <button type="button" onClick={() => fechar(true)} className="rounded-xl px-3 py-2.5 text-[13.5px] text-zinc-300 hover:bg-white/5">
            Descartar
          </button>
          <button type="button" onClick={() => fechar(false)} className="rounded-xl border border-white/15 px-3 py-2.5 text-[13.5px] text-zinc-200 hover:bg-white/5">
            Ajustar
          </button>
          <button type="button" onClick={() => void confirmar()} disabled={aEnviar || temErros}
            className="ml-auto flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#D2A63C] to-[#BB8525] px-4 py-2.5 text-[13.5px] font-bold text-black disabled:opacity-40">
            {aEnviar && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {compra ? "Confirmar compra" : "Confirmar venda"}
          </button>
        </div>
      </div>
    </div>
  )
}
