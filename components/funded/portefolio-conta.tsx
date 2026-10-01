"use client"

import { useMemo, useState } from "react"
import { usd } from "./api"
import {
  carteiraDoPortefolio, diarioDoPortefolio, historicoDoPortefolio,
  type MovimentoPortefolio, type PontoCurvaPortefolio, type ResumoPortefolio,
} from "@/lib/mtmfunded/portefolio"
import { pctFormatada } from "@/lib/portfolios/retorno"

/**
 * AS CARTEIRAS DO DONO DENTRO DO WEBTRADER — Histórico, Métricas e Diário feitos dos MOVIMENTOS.
 *
 * As duas contas de portefólio (173) não têm nada em `funded_positions`: o que elas fizeram está
 * em `portefolio_movimentos` (2 139 + 1 215 linhas) e a curva em `portefolio_curva`. Os três
 * separadores olhavam para a tabela errada e ficavam vazios — um histórico a somar zero tendo
 * 2 139 linhas na base.
 *
 * Tudo o que aqui aparece sai dos movimentos ou da curva. Nada é estimado: o valor de mercado é o
 * que está gravado na conta (o mesmo que a lista do seletor mostra), e onde ele falta mostra-se
 * «—» em vez de um zero que ninguém mediu.
 */

export interface DadosPortefolio {
  movimentos: MovimentoPortefolio[]
  curva: PontoCurvaPortefolio[]
  resumo: ResumoPortefolio
}

const cartao = "rounded-lg border border-white/10 bg-[#0d0d0d] p-2.5"

const data = (d: string | null) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" }) : "—")
/** Unidades com casas que cheguem para um XRP e para um BTC: 8 casas, sem zeros à direita. */
const unidades = (n: number) => Number(n.toFixed(8)).toLocaleString("pt-PT", { maximumFractionDigits: 8 })
const preco = (n: number) => Number(n).toLocaleString("pt-PT", { maximumFractionDigits: 8 })

function Linha({ k, v, cor }: { k: string; v: string; cor?: string }) {
  return (
    <div className="flex justify-between gap-2 text-[11.5px]">
      <span className="text-zinc-500">{k}</span>
      <span className={`font-mono ${cor ?? "text-white"}`}>{v}</span>
    </div>
  )
}

/** As MÉTRICAS da carteira: o que foi posto, o que vale, e o que lá está dentro. */
export function MetricasPortefolio({ d }: { d: DadosPortefolio }) {
  const r = d.resumo
  const carteira = useMemo(() => carteiraDoPortefolio(d.movimentos), [d.movimentos])
  const abertos = carteira.filter((l) => !l.fechada)
  const fechados = carteira.filter((l) => l.fechada)
  const corResultado = r.resultado == null ? "text-white" : r.resultado >= 0 ? "text-emerald-300" : "text-rose-300"

  return (
    <div className="space-y-2">
      <div className="grid gap-2 lg:grid-cols-2">
        <div className={`${cartao} space-y-1`}>
          <p className="text-[12.5px] font-semibold text-white">A carteira hoje</p>
          <Linha k="Contribuído (investido)" v={`${usd(r.contribuido)} $`} />
          <Linha k="Valor de mercado" v={r.valor == null ? "—" : `${usd(r.valor)} $`} />
          <Linha k="Resultado" v={r.resultado == null ? "—" : `${usd(r.resultado)} $`} cor={corResultado} />
          <Linha k="Resultado %" v={pctFormatada(r.resultadoPct)} cor={corResultado} />
          <p className="pt-1 text-[10.5px] leading-snug text-zinc-500">
            Medido contra o CONTRIBUÍDO e não contra o primeiro depósito: uma carteira com reforço
            semanal medida contra o depósito inicial dá um número que não é o retorno de ninguém.
          </p>
        </div>

        <div className={`${cartao} space-y-1`}>
          <p className="text-[12.5px] font-semibold text-white">O que foi feito</p>
          <Linha k="Comprado (soma das compras)" v={`${usd(r.comprado)} $`} />
          <Linha k="Vendido (soma das vendas)" v={r.vendas ? `${usd(r.vendido)} $` : "—"} />
          <Linha k="Movimentos" v={`${r.movimentos.toLocaleString("pt-PT")} (${r.compras} compras · ${r.vendas} vendas)`} />
          <Linha k="Período" v={`${data(r.de)} → ${data(r.ate)}`} />
          <Linha k="Semanas com reforço" v={String(r.semanasComReforco)} />
          <Linha k="Reforço médio por semana" v={r.reforcoMedioSemanal == null ? "—" : `${usd(r.reforcoMedioSemanal)} $`} />
          <Linha k="Activos" v={`${r.activos} (${r.activosAbertos} em carteira · ${r.activosFechados} fechados)`} />
        </div>
      </div>

      {(r.picoValor || r.valeValor) && (
        <div className={`${cartao} space-y-1`}>
          <p className="text-[12.5px] font-semibold text-white">A curva</p>
          <Linha k="Melhor semana" v={r.picoValor ? `${usd(r.picoValor.valor)} $ · ${data(r.picoValor.data)}` : "—"} />
          <Linha k="Pior semana" v={r.valeValor ? `${usd(r.valeValor.valor)} $ · ${data(r.valeValor.data)}` : "—"} />
          <Linha k="Pontos de curva" v={String(r.pontosDeCurva)} />
        </div>
      )}

      <Tabela
        titulo={`Em carteira (${abertos.length})`}
        vazio="Nada em carteira."
        linhas={abertos}
      />
      {fechados.length > 0 && (
        <Tabela
          titulo={`Fechados (${fechados.length})`}
          vazio=""
          linhas={fechados}
        />
      )}
    </div>
  )
}

function Tabela({ titulo, vazio, linhas }: { titulo: string; vazio: string; linhas: ReturnType<typeof carteiraDoPortefolio> }) {
  if (!linhas.length) return vazio ? <p className={`${cartao} text-[11.5px] text-zinc-500`}>{vazio}</p> : null
  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <p className="border-b border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-[11.5px] font-semibold text-white">{titulo}</p>
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead className="text-zinc-500">
            <tr className="border-b border-white/5">
              <th className="px-2.5 py-1.5 text-left font-normal">Activo</th>
              <th className="px-2 py-1.5 text-right font-normal">Unidades</th>
              <th className="px-2 py-1.5 text-right font-normal">Preço médio</th>
              <th className="px-2 py-1.5 text-right font-normal">Comprado</th>
              <th className="px-2 py-1.5 text-right font-normal">Vendido</th>
              <th className="px-2 py-1.5 text-right font-normal">Reforços</th>
              <th className="px-2.5 py-1.5 text-right font-normal">Desde</th>
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-200">
            {linhas.map((l) => (
              <tr key={l.symbol} className="border-b border-white/5 last:border-0">
                <td className="px-2.5 py-1.5 font-sans font-semibold text-white">{l.symbol}</td>
                <td className="px-2 py-1.5 text-right">{unidades(l.unidades)}</td>
                <td className="px-2 py-1.5 text-right">{l.precoMedio == null ? "—" : preco(l.precoMedio)}</td>
                <td className="px-2 py-1.5 text-right">{usd(l.comprado)} $</td>
                <td className="px-2 py-1.5 text-right">{l.vendido ? `${usd(l.vendido)} $` : "—"}</td>
                <td className="px-2 py-1.5 text-right">{l.reforcos}</td>
                <td className="px-2.5 py-1.5 text-right font-sans text-zinc-500">{data(l.primeira)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const PAGINA = 100

/** O HISTÓRICO: os movimentos, do mais recente para o mais antigo, aos cem de cada vez. */
export function HistoricoPortefolio({ d }: { d: DadosPortefolio }) {
  const todos = useMemo(() => historicoDoPortefolio(d.movimentos), [d.movimentos])
  const [quantos, setQuantos] = useState(PAGINA)
  if (!todos.length) return <p className={`${cartao} text-[11.5px] text-zinc-500`}>Esta carteira ainda não tem movimentos.</p>

  return (
    <div className="overflow-hidden rounded-lg border border-white/10">
      <div className="overflow-x-auto">
        <table className="w-full text-[11.5px]">
          <thead className="text-zinc-500">
            <tr className="border-b border-white/10 bg-white/[0.03]">
              <th className="px-2.5 py-1.5 text-left font-normal">Data</th>
              <th className="px-2 py-1.5 text-left font-normal">Activo</th>
              <th className="px-2 py-1.5 text-left font-normal">Tipo</th>
              <th className="px-2 py-1.5 text-right font-normal">Unidades</th>
              <th className="px-2 py-1.5 text-right font-normal">Preço</th>
              <th className="px-2.5 py-1.5 text-right font-normal">Valor</th>
            </tr>
          </thead>
          <tbody className="font-mono text-zinc-200">
            {todos.slice(0, quantos).map((m) => (
              <tr key={m.id} className="border-b border-white/5 last:border-0">
                <td className="whitespace-nowrap px-2.5 py-1.5 font-sans text-zinc-400">{data(m.data)}</td>
                <td className="px-2 py-1.5 font-sans font-semibold text-white">{m.symbol}</td>
                <td className={`px-2 py-1.5 font-sans ${m.tipo === "compra" ? "text-emerald-300" : "text-amber-300"}`}>
                  {m.tipo}
                  {m.motivo && <span className="ml-1 text-[10px] text-zinc-500" title={m.motivo}>· {m.motivo}</span>}
                </td>
                <td className="px-2 py-1.5 text-right">{unidades(m.unidades)}</td>
                <td className="px-2 py-1.5 text-right">{preco(m.preco)}</td>
                <td className={`px-2.5 py-1.5 text-right ${m.tipo === "compra" ? "text-zinc-200" : "text-amber-300"}`}>
                  {m.tipo === "compra" ? "−" : "+"}{usd(m.valor)} $
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2 px-2.5 py-1.5">
        <p className="text-[10.5px] text-zinc-500">
          {Math.min(quantos, todos.length).toLocaleString("pt-PT")} de {todos.length.toLocaleString("pt-PT")} movimentos ·
          {" "}origem: portefolio_movimentos
        </p>
        {quantos < todos.length && (
          <button type="button" onClick={() => setQuantos((q) => q + PAGINA)} className="min-h-[32px] rounded-md border border-white/15 px-3 text-[11.5px] text-zinc-200">
            Mostrar mais
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * O DIÁRIO de uma carteira: um DIA por linha e não uma nota por trade.
 *
 * O diário do trader (funded_diario) é sobre decisões de entrada e saída. Aqui não há decisões
 * avulsas: há um reforço semanal às sextas. Listar 2 139 linhas uma a uma não é um diário — é o
 * histórico outra vez.
 */
export function DiarioPortefolio({ d }: { d: DadosPortefolio }) {
  const dias = useMemo(() => diarioDoPortefolio(d.movimentos), [d.movimentos])
  const [quantos, setQuantos] = useState(30)
  if (!dias.length) return <p className={`${cartao} text-[11.5px] text-zinc-500`}>Esta carteira ainda não tem movimentos.</p>

  return (
    <div className="space-y-2">
      <p className={`${cartao} text-[11px] leading-snug text-zinc-400`}>
        Cada linha é um dia em que a carteira mexeu: o reforço da semana, ou uma venda com o motivo
        que ficou escrito. Tudo saído de <span className="font-mono text-zinc-300">portefolio_movimentos</span>.
      </p>
      {dias.slice(0, quantos).map((dia) => (
        <div key={dia.data} className={`${cartao} space-y-1`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[12px] font-semibold text-white">{data(dia.data)}</p>
            <p className="font-mono text-[11.5px] text-zinc-400">
              {dia.compras > 0 && <span className="text-zinc-200">−{usd(dia.investido)} $ em {dia.compras} compra{dia.compras === 1 ? "" : "s"}</span>}
              {dia.compras > 0 && dia.vendas > 0 && " · "}
              {dia.vendas > 0 && <span className="text-amber-300">+{usd(dia.recebido)} $ de {dia.vendas} venda{dia.vendas === 1 ? "" : "s"}</span>}
            </p>
          </div>
          <p className="text-[11px] text-zinc-500">{dia.simbolos.join(" · ")}</p>
          {dia.motivos.map((m) => <p key={m} className="text-[11px] text-amber-200/80">{m}</p>)}
        </div>
      ))}
      {quantos < dias.length && (
        <button type="button" onClick={() => setQuantos((q) => q + 30)} className="min-h-[36px] w-full rounded-md border border-white/15 text-[11.5px] text-zinc-200">
          Mostrar mais ({dias.length - quantos} dias)
        </button>
      )}
    </div>
  )
}
