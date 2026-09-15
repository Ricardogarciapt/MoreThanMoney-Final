"use client"

import FundedCopier from "./funded-copier"
import FundedDesempenho from "./funded-desempenho"
import FundedWebhook from "./funded-webhook"
import { InterruptorUmClique } from "./um-clique"
import { EtiquetaConta, type Trader } from "./trader-contexto"

/**
 * O SEPARADOR «CONTA» — métricas completas, negociação num clique, desempenho da estratégia
 * seguida, copiador para contas MT5 e webhooks do TradingView. As interligações da conta, num sítio.
 */
export default function PainelConta({ t }: { t: Trader }) {
  const c = t.dados.conta
  const cartao = "rounded-lg border border-white/10 bg-[#0d0d0d] p-3"
  return (
    <div className="grid gap-2 p-2.5 lg:grid-cols-2">
      <div className={`${cartao} space-y-2`}>
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <EtiquetaConta t={t} />
          <span className="font-mono text-white">{String(c.login ?? "—")}</span>
          <span className="text-zinc-500">{String(c.servidor ?? "")}</span>
          <span className="text-zinc-500">1:{c.alavancagem}</span>
          {c.segueEstrategia && <span className="rounded-full border border-[#D2A63C]/40 bg-[#D2A63C]/10 px-2 py-0.5 text-[11px] text-[#D2A63C]">segue {c.segueEstrategia.nome}{c.segueEstrategia.ativa ? "" : " (em pausa)"}</span>}
          {c.aceitaT2T && <span className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">aceita Tap to Trade</span>}
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1">
          {[...t.metricas, ["Dias negociados", String(c.diasNegociados)] as [string, string], ["Saldo inicial", `${c.saldoInicial.toLocaleString("pt-PT")} $`] as [string, string]].map(([k, v, cor]) => (
            <div key={k} className="flex justify-between gap-2 text-[11.5px]"><span className="text-zinc-500">{k}</span><span className={`font-mono ${cor ?? "text-white"}`}>{v}</span></div>
          ))}
        </div>
      </div>
      {t.podeNegociar && <div className={cartao}><InterruptorUmClique variante="cartao" /></div>}
      <div className={cartao}><FundedDesempenho d={t.dados.desempenho} estrategia={c.segueEstrategia?.nome} /></div>
      <div className={cartao}><FundedCopier accountId={t.accountId} podeGerir={t.dados.modo === "master"} /></div>
      <div className={cartao}><FundedWebhook accountId={t.accountId} podeGerir={t.dados.modo === "master"} /></div>
    </div>
  )
}
