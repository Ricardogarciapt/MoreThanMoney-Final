"use client"

import { useState } from "react"
import type { EstrategiaCentro } from "@/lib/admin-centro/servidor/estrategias"
import EstrategiasCopia, { Recolhivel } from "@/components/admin/mtmauto-copia/estrategias"
import ProvidersEquipas from "@/components/admin/mtmauto-copia/providers-equipas"
import EspelhoProviderRelatorio from "@/components/admin/espelho-provider-relatorio"
import MtmcopyFontesVivas from "@/components/admin/mtmcopy-fontes-vivas"
import MtmcopyStrategyControl from "@/components/admin/mtmcopy-strategy-control"
import { EstrategiasDesempenho } from "@/components/admin/estrategias-desempenho"
import { TrailingEstrategias } from "@/components/admin/trailing-estrategias"
import MtmcopySubscriberHealth from "@/components/admin/mtmcopy-subscriber-health"
import MtmcopyTelegramSenders from "@/components/admin/mtmcopy-telegram-senders"
import MtmcopyProviderPipeline from "@/components/admin/mtmcopy-provider-pipeline"
import MtmcopyProviderAccounts from "@/components/admin/mtmcopy-provider-accounts"
import MtmcopyTestPanel from "@/components/admin/mtmcopy-test-panel"
import MtmcopyGlobalPerformance from "@/components/admin/mtmcopy-global-performance"
import { useCentroCtx } from "../contexto"
import { Aviso, Azulejo, BotaoLer, Chip, Painel, Pilula, Tabela, Vazio, fmtIdade, fmtNum, idadeDe, td, th, trClic, useCentro } from "../ui"

export type DadosEstrategias = { estrategias: EstrategiaCentro[]; veredictoPendente: boolean; fontePendente: boolean }

export default function SeccaoEstrategias() {
  const ctx = useCentroCtx()
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<DadosEstrategias>(`/api/admin/centro/estrategias?v=${ctx.versao}`, 30_000)
  const [soDiv, setSoDiv] = useState(false)
  const [verApagadas, setVerApagadas] = useState(false)
  const lista = (dados?.estrategias ?? []).filter((e) => (verApagadas || !e.apagada) && (!soDiv || e.divergencias.length > 0))
  const todas = dados?.estrategias ?? []

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
        <Azulejo rotulo="Estratégias activas" valor={todas.filter((e) => e.ativa && !e.apagada).length} sub={`${todas.length} no total`} />
        <Azulejo rotulo="Seguidores" valor={fmtNum(todas.reduce((a, e) => a + e.seguidores.total, 0))} sub="MTM Auto + site + Funded" />
        <Azulejo rotulo="Com divergências" valor={todas.filter((e) => e.divergencias.length).length} tom={todas.some((e) => e.divergencias.length) ? "aviso" : "ok"} onClick={() => setSoDiv(true)} />
        <Azulejo rotulo="Em espelho" valor={todas.filter((e) => e.fonteExecucao === "espelho").length} sub={`${todas.filter((e) => e.espelho?.alinhado).length} alinhada(s)`} />
        <Azulejo rotulo="Pips 30 d" valor={fmtNum(todas.reduce((a, e) => a + e.desempenho30d.pips, 0), 1)} sub="sinais fechados MTM Auto" />
      </div>

      <Painel titulo="Estratégias" sub="Fonte de execução, seguidores por plataforma, desempenho 30 d e divergências. Clica para abrir a gaveta (acções)." accao={<BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          <Chip activo={soDiv} onClick={() => setSoDiv(!soDiv)}>só com divergências</Chip>
          <Chip activo={verApagadas} onClick={() => setVerApagadas(!verApagadas)}>mostrar apagadas</Chip>
        </div>
        {erro && <Aviso tom="grave">{erro}</Aviso>}
        {dados?.veredictoPendente && <div className="mb-2"><Aviso tom="info">Veredicto do espelho (082) indisponível nesta base.</Aviso></div>}
        {!dados ? <Vazio>A ler…</Vazio> : lista.length === 0 ? <Vazio>Nada a mostrar.</Vazio> : (
          <Tabela min={980}>
            <thead><tr><th className={th}>Estratégia</th><th className={th}>Fonte</th><th className={th}>Seguidores</th><th className={th}>30 d</th><th className={th}>Último sinal</th><th className={th}>Divergências</th></tr></thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={trClic} onClick={() => ctx.abrir({ tipo: "estrategia", id: e.id })}>
                  <td className={td}>
                    <p className="font-medium text-zinc-100">{e.nome}{e.apagada && <span className="ml-1 text-rose-400">(apagada)</span>}</p>
                    <p className="text-[10px] text-zinc-500">{e.slug} · {e.tipo ?? "—"}{e.equipa ? ` · equipa ${e.equipa}` : " · casa"}{e.estrategiaCf ? ` · CF ${e.estrategiaCf}` : ""}</p>
                  </td>
                  <td className={td}>
                    <div className="flex flex-wrap gap-1">
                      <Pilula tom={e.ativa ? "ok" : "neutro"}>{e.ativa ? "activa" : "inactiva"}</Pilula>
                      {e.fonteExecucao && <Pilula tom={e.fonteExecucao === "espelho" ? "info" : "neutro"}>{e.fonteExecucao}</Pilula>}
                      {e.espelho && <Pilula tom={e.espelho.alinhado ? "ok" : "aviso"} title={e.espelho.motivos.join(" · ")}>{e.espelho.alinhado ? "espelho alinhado" : "espelho por alinhar"}</Pilula>}
                    </div>
                  </td>
                  <td className={`${td} font-mono text-[11px]`}>
                    <p className="text-white">{e.seguidores.total}</p>
                    <p className="text-zinc-500">auto {e.seguidores.mtmauto} ({e.seguidores.mtmautoAuto} auto) · site {e.seguidores.site} · funded {e.seguidores.funded}</p>
                  </td>
                  <td className={`${td} font-mono text-[11px]`}>
                    <p className={e.desempenho30d.pips >= 0 ? "text-emerald-300" : "text-rose-300"}>{fmtNum(e.desempenho30d.pips, 1)} pips</p>
                    <p className="text-zinc-500">{e.desempenho30d.fechados}/{e.desempenho30d.sinais} fechados · {e.desempenho30d.acerto ?? "—"}% · {e.desempenho30d.pct ?? "—"}%</p>
                  </td>
                  <td className={`${td} font-mono`}>{e.ultimoSinal ? fmtIdade(idadeDe(e.ultimoSinal)) : "—"}</td>
                  <td className={`${td} max-w-[280px]`}>
                    {e.divergencias.length === 0 ? <span className="text-zinc-600">—</span> : e.divergencias.map((d) => <p key={d} className="text-[11px] text-amber-300">• {d}</p>)}
                  </td>
                </tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Painel>

      <div className="space-y-2">
        <Recolhivel titulo="Reconciliação CopyFactory (lê a MetaApi)" descricao="Seguidores reais na CopyFactory, divergências e re-sync em lote com releitura — acção explícita, não corre sozinha.">
          <EstrategiasCopia />
        </Recolhivel>
        <Recolhivel titulo="Espelho provider · relatório e configuração" descricao="Comparação mestre vs espelho trade a trade, veredicto, criar/ligar conta espelho.">
          <EspelhoProviderRelatorio />
        </Recolhivel>
        <Recolhivel titulo="Providers das equipas" descricao="Contas de estratégia agrupadas por equipa MTM Auto.">
          <ProvidersEquipas />
        </Recolhivel>
        <Recolhivel titulo="Fontes · estado real"><MtmcopyFontesVivas /></Recolhivel>
        <Recolhivel titulo="Controlo das estratégias" descricao="Interruptores, receção por canal, modos PrimeVerse/Forex Swings, perps, trailing e desempenho.">
          <div className="space-y-6"><MtmcopyStrategyControl /><EstrategiasDesempenho /><TrailingEstrategias /></div>
        </Recolhivel>
        <Recolhivel titulo="Saúde das ligações (regras de risco)"><MtmcopySubscriberHealth /></Recolhivel>
        <Recolhivel titulo="Senders · Telegram e chats"><MtmcopyTelegramSenders /></Recolhivel>
        <Recolhivel titulo="Rotas provider" aberto={Boolean(ctx.filtro.routeId)}><MtmcopyProviderPipeline initialRouteId={ctx.filtro.routeId ?? null} /></Recolhivel>
        <Recolhivel titulo="Contas provider (mestre)"><MtmcopyProviderAccounts /></Recolhivel>
        <Recolhivel titulo="Testes · provider e Telegram"><MtmcopyTestPanel /></Recolhivel>
        <Recolhivel titulo="Visão global do sistema" descricao="Performance agregada (só admin)."><MtmcopyGlobalPerformance /></Recolhivel>
      </div>
    </div>
  )
}
