"use client"

import { useState } from "react"
import type { EstrategiaCentro, SombraCentro } from "@/lib/admin-centro/servidor/estrategias"
import SombraEstrategias from "../sombra-estrategias"
import EstrategiasCopia from "@/components/admin/mtmauto-copia/estrategias"
import ProvidersEquipas from "@/components/admin/mtmauto-copia/providers-equipas"
import ProvidersExternos from "@/components/admin/mtmauto-copia/providers-externos"
import MotorMestres from "@/components/admin/mtmauto-copia/motor-mestres"
import EspelhoProviderRelatorio from "@/components/admin/espelho-provider-relatorio"
import MtmcopyFontesVivas from "@/components/admin/mtmcopy-fontes-vivas"
import MtmcopyStrategyControl from "@/components/admin/mtmcopy-strategy-control"
import { EstrategiasDesempenho } from "@/components/admin/estrategias-desempenho"
import MtmcopySubscriberHealth from "@/components/admin/mtmcopy-subscriber-health"
import MtmcopyTelegramSenders from "@/components/admin/mtmcopy-telegram-senders"
import MtmcopyProviderPipeline from "@/components/admin/mtmcopy-provider-pipeline"
import MtmcopyProviderAccounts from "@/components/admin/mtmcopy-provider-accounts"
import MtmcopyTestPanel from "@/components/admin/mtmcopy-test-panel"
import MtmcopyGlobalPerformance from "@/components/admin/mtmcopy-global-performance"
import { useCentroCtx } from "../contexto"
import PaginaEstrategia from "../estrategia-pagina"
import { textoResumo90d, type Resumo90d } from "@/lib/mestres/painel"
import { Aviso, Azulejo, BotaoLer, Chip, Filtros, Grupo, Lista, Painel, Pilula, Recolhivel, Tabela, fmtIdade, fmtNum, idadeDe, td, th, trClic, useCentro } from "../ui"

export type DadosEstrategias = { estrategias: EstrategiaCentro[]; sombras?: SombraCentro[]; sombraPendente?: boolean; veredictoPendente: boolean; fontePendente: boolean }

/**
 * ESTRATÉGIAS — revamp de 05/10 (pedido do dono: menos cartões repetidos, hierarquia clara).
 *
 *   1. Atenção   — só as estratégias com algo por resolver (divergências, fonte desligada).
 *   2. Controlo  — a lista; um clique abre a PÁGINA da estratégia (`&e=<slug>`), que é o único sítio
 *                  onde se decide o que ela faz (cadeia fonte → mestre → rotas → subscritores).
 *   3. Detalhe   — o motor global (kill-switch, modo por conta) e os painéis de diagnóstico, recolhidos.
 *
 * O que saiu daqui e para onde foi está em docs/admin-controlo-unico.md («Centro: o que mudou»).
 */
export default function SeccaoEstrategias() {
  const ctx = useCentroCtx()
  // A página de uma estratégia substitui a lista inteira: é para lá que o dono vai decidir.
  if (ctx.filtro.e) return <PaginaEstrategia refEstrategia={ctx.filtro.e} />
  return <ListaEstrategias />
}

function ListaEstrategias() {
  const ctx = useCentroCtx()
  const { dados, erro, aCarregar, recarregar, lidoEm } = useCentro<DadosEstrategias>(`/api/admin/centro/estrategias?v=${ctx.versao}`, 30_000)
  // Métricas de 90 dias TAL COMO a MTM Auto as publica (contas reais, parciais pesadas). O «ideias
  // 30 d» ao lado é o diagnóstico interno de sempre (mtmauto_signals, tudo-ou-nada) — não se publica.
  const m90 = useCentro<{ porProvider: Record<string, Resumo90d>; lido: boolean; motivo?: string }>(`/api/admin/centro/metricas-90d?v=${ctx.versao}`, 600_000)
  const [soDiv, setSoDiv] = useState(false)
  const [verApagadas, setVerApagadas] = useState(false)
  const lista = (dados?.estrategias ?? []).filter((e) => (verApagadas || (!e.apagada && !e.abandonada)) && (!soDiv || e.divergencias.length > 0))
  const abandonadas = (dados?.estrategias ?? []).filter((e) => e.abandonada && !e.apagada)
  const todas = dados?.estrategias ?? []

  // ATENÇÃO primeiro: só o que tem algo por resolver. Uma estratégia sem problemas não ocupa ecrã aqui.
  const atencao = todas.filter((e) => !e.apagada && !e.abandonada && (e.divergencias.length > 0 || e.fonteDesligada))
  const abrir = (slug: string) => ctx.irPara("estrategias", { e: slug })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Azulejo rotulo="Estratégias activas" valor={todas.filter((e) => (e.ativa || e.mestres) && !e.apagada && !e.abandonada).length} sub={`${todas.length} no total${todas.filter((e) => e.apagada).length ? ` · ${todas.filter((e) => e.apagada).length} escondida(s)` : ""}${abandonadas.length ? ` · ${abandonadas.length} abandonada(s)` : ""}`} />
        <Azulejo rotulo="Motor das mestres" valor={`${todas.filter((e) => e.mestres?.modo === "live").length} live`} sub={`${todas.filter((e) => e.mestres && e.mestres.modo !== "live").length} em sombra/desligadas · ${todas.reduce((a, e) => a + (e.mestres?.nContasLive ?? 0), 0)} conta(s) live`} tom={todas.some((e) => e.mestres?.modo === "live") ? "ok" : "neutro"} />
        <Azulejo rotulo="Seguidores" valor={fmtNum(todas.reduce((a, e) => a + e.seguidores.total, 0))} sub="MTM Auto + site + Funded" />
        <Azulejo rotulo="Precisam de atenção" valor={atencao.length} tom={atencao.length ? "aviso" : "ok"} onClick={() => setSoDiv(true)} />
      </div>

      {/* 1 · ATENÇÃO */}
      {atencao.length > 0 && (
        <section aria-label="Precisam de atenção" className="space-y-1.5">
          <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#D2A63C]/80">Atenção</p>
          {atencao.map((e) => (
            <button key={e.id} type="button" onClick={() => abrir(e.slug)} className="block w-full rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-left transition-colors duration-200 hover:border-[#D2A63C]/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#D2A63C]">
              <span className="text-[12.5px] font-medium text-amber-100">{e.nome}</span>
              {e.fonteDesligada && <span className="ml-2"><Pilula tom="grave">fonte desligada</Pilula></span>}
              {e.divergencias.map((d) => <span key={d} className="block text-[11px] text-amber-200/80">• {d}</span>)}
            </button>
          ))}
        </section>
      )}

      {dados?.sombras && dados.sombras.length > 0 && <SombraEstrategias sombras={dados.sombras} pendente={dados.sombraPendente === true} />}

      <Painel titulo="Estratégias" sub="Clica numa estratégia para abrir a página dela — a cadeia inteira (fonte → mestre → rotas → subscritores) e todos os interruptores. É o único sítio onde se decide." accao={<BotaoLer onClick={recarregar} aCarregar={aCarregar} lidoEm={lidoEm} />}>
        <Filtros contagem={lista.length} total={todas.length}>
          <Chip activo={soDiv} onClick={() => setSoDiv(!soDiv)}>só com divergências</Chip>
          <Chip activo={verApagadas} onClick={() => setVerApagadas(!verApagadas)}>mostrar escondidas e abandonadas{abandonadas.length ? ` (${abandonadas.map((e) => e.nome).join(", ")})` : ""}</Chip>
        </Filtros>
        {dados?.veredictoPendente && <div className="mb-2"><Aviso tom="info">Veredicto do espelho (082) indisponível nesta base.</Aviso></div>}
        <Lista dados={dados} erro={erro} vazio={todas.length === 0} textoVazio="Nenhuma estratégia registada." filtrada={lista.length === 0}>
          <Tabela min={1120}>
            <thead><tr><th className={th}>Estratégia</th><th className={th}>Execução</th><th className={th}>Seguidores</th><th className={th} title="Catálogo da MTM Auto: trades reais fechadas em 90 dias, parciais pesadas — o número que os clientes vêem">90 d · publicado</th><th className={th} title="mtmauto_signals: tudo-ou-nada, sem parciais — sub-avalia. Diagnóstico interno, não publicar.">Ideias 30 d</th><th className={th}>Último sinal</th><th className={th}>Divergências</th></tr></thead>
            <tbody>
              {lista.map((e) => (
                <tr key={e.id} className={trClic} onClick={() => abrir(e.slug)}>
                  <td className={td}>
                    <p className="font-medium text-zinc-100">{e.nome}{e.apagada && <span className="ml-1 text-rose-400" title="apagado_em: fora de todos os catálogos, histórico intacto. Abre a ficha para restaurar.">(escondida)</span>}</p>
                    <p className="text-[10px] text-zinc-500">{e.slug} · {e.tipo ?? "—"}{e.equipa ? ` · equipa ${e.equipa}` : " · casa"}{e.mestres?.cfIds.length ? ` · CF ${e.mestres.cfIds.join(",")} ${e.mestres.cfCortado ? "cortada" : "por cortar"}` : e.estrategiaCf ? ` · CF ${e.estrategiaCf}` : ""}{e.abandonada ? " · abandonada" : ""}{e.canalChat ? ` · chat ${e.canalChat}` : ""}</p>
                    {e.fonteDesligada && <p className="mt-0.5"><Pilula tom="grave" title={e.fonteDesligada.motivo ?? undefined}>fonte desligada {e.fonteDesligada.em.slice(0, 10)}</Pilula></p>}
                    {e.tipo === "mt5" && <p className="mt-0.5"><Pilula tom="aviso">MT5 directo · {e.mt5Estado ?? "por_ligar"}</Pilula></p>}
                  </td>
                  <td className={td}>
                    {e.mestres && (
                      <div className="mb-1 flex flex-wrap gap-1">
                        <Pilula tom={e.mestres.executor === "motor" ? "ok" : e.mestres.executor === "copyfactory" ? "aviso" : "neutro"} title={e.mestres.executorNota}>
                          {e.mestres.executor === "motor" ? "motor das mestres" : e.mestres.executor === "copyfactory" ? "CopyFactory" : "legado"}
                        </Pilula>
                        <Pilula tom={e.mestres.modo === "live" ? "grave" : e.mestres.modo === "sombra" ? "info" : "neutro"} title={`sinal ${e.mestres.sinalModo} · T2T ${e.mestres.t2tModo}`}>motor {e.mestres.modo}</Pilula>
                        {e.mestres.sinalModo !== e.mestres.modo && <Pilula tom={e.mestres.sinalModo === "live" ? "grave" : "neutro"}>sinal {e.mestres.sinalModo}</Pilula>}
                        <Pilula title={`${e.mestres.nRotasLive}/${e.mestres.nRotas} rotas live · ${e.mestres.nContasLive} conta(s) live`}>{e.mestres.rotuloMestre} {e.mestres.contaMestreLogin ?? ""}</Pilula>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-1">
                      {e.modo === "sombra" && !e.ativa
                        ? <Pilula tom="info" title="Medida todos os dias sem abrir nada (estrategia_sombra_dia). Quem decide a execução é «ativo».">Sombra — não executa</Pilula>
                        : <Pilula tom={e.ativa ? "ok" : "neutro"} title="mtmauto_providers.ativo — o executor antigo do MTM Auto">{e.mestres ? `MTM Auto ${e.ativa ? "activa" : "inactiva"}` : e.ativa ? "activa" : "inactiva"}</Pilula>}
                      {e.fonteExecucao && <Pilula tom={e.fonteExecucao === "espelho" ? "info" : "neutro"}>{e.fonteExecucao}</Pilula>}
                      {e.espelho && <Pilula tom={e.espelho.alinhado ? "ok" : "aviso"} title={e.espelho.motivos.join(" · ")}>{e.espelho.alinhado ? "espelho alinhado" : "espelho por alinhar"}</Pilula>}
                    </div>
                  </td>
                  <td className={`${td} font-mono text-[11px]`}>
                    <p className="text-white">{e.seguidores.total}</p>
                    <p className="text-zinc-500">auto {e.seguidores.mtmauto} ({e.seguidores.mtmautoAuto} auto) · site {e.seguidores.site} · funded {e.seguidores.funded}</p>
                  </td>
                  <td className={`${td} text-[11px]`}>
                    {(() => {
                      const r = m90.dados?.porProvider?.[e.id]
                      if (!m90.dados) return <span className="text-zinc-600">a ler…</span>
                      if (!m90.dados.lido) return <span className="text-zinc-600" title={m90.dados.motivo}>catálogo indisponível</span>
                      return <span className={r?.temHistorico ? "text-zinc-100" : "text-zinc-500"} title={r?.simuladas ? "Simuladas: só contas SIM, nunca se publicam nem se somam às reais" : undefined}>{textoResumo90d(r)}</span>
                    })()}
                  </td>
                  <td className={`${td} font-mono text-[11px] opacity-70`}>
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
        </Lista>
      </Painel>

      {/* 3 · DETALHE — recolhido. Decidir uma estratégia faz-se na página dela; aqui fica o que é do
          motor inteiro (kill-switch, modo por conta) e o diagnóstico. O que saiu está no inventário. */}
      <Grupo titulo="Motor e criação" nota="O que não é de uma estratégia só.">
        <Recolhivel titulo="Motor das mestres · kill-switch, contas e alertas" descricao="O motor inteiro: kill-switch, modo por conta, últimas ordens e alertas. Os modos de cada estratégia mudam-se na página dela."><MotorMestres /></Recolhivel>
        <Recolhivel titulo="Nova estratégia · provider externo" descricao="MetaApi (id colado), Telegram (chat id) ou MT5 directo. Nasce em sombra com mestre, rotas e canal."><ProvidersExternos aoCriar={recarregar} /></Recolhivel>
        <Recolhivel titulo="Interruptores globais da receção" descricao="Receção por canal, perps, sombra do Sensei (site_settings) — valem para todas as estratégias."><MtmcopyStrategyControl /></Recolhivel>
      </Grupo>

      <Grupo titulo="Diagnóstico" nota="Só leitura (a reconciliação lê a MetaApi quando lho pedes).">
        <Recolhivel titulo="Desempenho por estratégia" descricao="Resultados por estratégia (interno)."><EstrategiasDesempenho /></Recolhivel>
        <Recolhivel titulo="Fontes · estado real" descricao="Cada estratégia, a conta que a publica e o que a MetaApi diz sobre ela."><MtmcopyFontesVivas /></Recolhivel>
        <Recolhivel titulo="Contas provider (mestre)" descricao="As contas de origem de cada estratégia."><MtmcopyProviderAccounts /></Recolhivel>
        <Recolhivel titulo="Providers das equipas" descricao="Contas de estratégia agrupadas por equipa MTM Auto."><ProvidersEquipas /></Recolhivel>
        <Recolhivel titulo="Senders · Telegram e rotas provider" descricao="Para que canal sai cada estratégia e o caminho de cada rota." aberto={Boolean(ctx.filtro.routeId)}><div className="space-y-6"><MtmcopyTelegramSenders /><MtmcopyProviderPipeline initialRouteId={ctx.filtro.routeId ?? null} /></div></Recolhivel>
        <Recolhivel titulo="Reconciliação CopyFactory (lê a MetaApi)" descricao="Seguidores reais na CopyFactory, divergências e re-sync em lote com releitura."><EstrategiasCopia /></Recolhivel>
        <Recolhivel titulo="Saúde das ligações (regras de risco)" descricao="Multiplicador sem risco, T2T com grupos, sem baseline, MT5 em erro."><MtmcopySubscriberHealth /></Recolhivel>
        <Recolhivel titulo="Espelho provider · relatório" descricao="Mestre MetaApi vs conta SIM trade a trade (caminho antigo). Ligar/configurar: página da estratégia."><EspelhoProviderRelatorio /></Recolhivel>
        <Recolhivel titulo="Testes · provider e Telegram" descricao="Ordem de teste na conta provider e mensagem de teste nos canais."><MtmcopyTestPanel /></Recolhivel>
        <Recolhivel titulo="Visão global do sistema" descricao="Performance agregada (só admin)."><MtmcopyGlobalPerformance /></Recolhivel>
      </Grupo>
    </div>
  )
}
