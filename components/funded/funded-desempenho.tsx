"use client"

import type { Desempenho } from "@/lib/mtmfunded/simulado/desempenho"

/**
 * O DESEMPENHO DA CONTA — no separador «Conta» do WebTrader.
 *
 * Para as contas que seguem uma estratégia do MTM Auto é a razão de a conta existir: o aluno vê
 * como a estratégia se está a portar. Números em pips/pontos e em % do saldo inicial; em USD só o
 * resultado líquido da própria conta simulada (a moeda dela). Sem euros, sem promessas.
 * As contas vêm do servidor (lib/mtmfunded/simulado/desempenho.ts) — uma trade com parciais conta
 * uma vez, e os pips são pesados pelo volume de cada saída.
 */
export default function FundedDesempenho({ d, estrategia }: { d: Desempenho; estrategia?: string | null }) {
  const pct = (v: number | null) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString("pt-PT", { maximumFractionDigits: 2 })}%`)
  const cor = (v: number | null) => (v == null ? "text-white" : v >= 0 ? "text-emerald-300" : "text-rose-300")
  const unidade = d.unidade === "misto" ? "pips/pontos" : d.unidade
  const linhas: Array<[string, string, string?]> = [
    ["Trades terminadas", String(d.tradesTerminadas)],
    ["Taxa de acerto", d.taxaAcertoPct == null ? "—" : `${d.taxaAcertoPct}% (${d.ganhas}/${d.tradesTerminadas})`],
    [unidade.charAt(0).toUpperCase() + unidade.slice(1), `${d.pips > 0 ? "+" : ""}${d.pips.toLocaleString("pt-PT")}`, cor(d.pips)],
    ["Retorno", pct(d.retornoPct), cor(d.retornoPct)],
    ["Drawdown máximo", `${d.drawdownMaxPct.toLocaleString("pt-PT")}%`],
    ["Melhor / pior trade", `${pct(d.melhorTradePct)} / ${pct(d.piorTradePct)}`],
  ]
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-white">Desempenho</p>
        {estrategia && <p className="truncate text-[11px] text-[#D2A63C]">segue {estrategia}</p>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
        {linhas.map(([k, v, c]) => (
          <div key={k} className="flex justify-between gap-2 text-[11.5px]">
            <span className="text-zinc-500">{k}</span>
            <span className={`font-mono ${c ?? "text-white"}`}>{v}</span>
          </div>
        ))}
      </div>
      {d.porComentario.length > 1 && (
        <div className="divide-y divide-white/5 rounded-lg border border-white/10">
          {d.porComentario.map((g) => (
            <div key={g.comentario} className="flex items-center justify-between gap-2 px-2 py-1 text-[11px]">
              <span className="truncate text-zinc-300">{g.comentario}</span>
              <span className="shrink-0 font-mono text-zinc-400">
                {g.trades} · {g.taxaAcertoPct ?? "—"}% · <span className={cor(g.retornoPct)}>{pct(g.retornoPct)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="text-[10.5px] leading-snug text-zinc-500">
        Negociação simulada, com fins educativos. Uma trade com saídas parciais conta uma vez. Resultados passados não garantem resultados futuros.
      </p>
    </div>
  )
}
