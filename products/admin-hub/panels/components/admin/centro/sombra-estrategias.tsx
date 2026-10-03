"use client"

import { Moon } from "lucide-react"
import type { SombraCentro } from "@/lib/admin-centro/servidor/estrategias"
import { Aviso, Azulejo, Painel, Pilula, Tabela, Vazio, fmtNum, td, th } from "./ui"

/**
 * Cartão «Sombra» — estratégias que NÃO executam mas são medidas todos os dias (hoje o MTM Scanner):
 * as trades que teriam passado o gate e como teriam acabado, dos últimos 14 dias de
 * `estrategia_sombra_dia` (serviço VPS sombra-estrategias). Só leitura; ligar a execução é `ativo`.
 */
export default function SombraEstrategias({ sombras, pendente }: { sombras: SombraCentro[]; pendente: boolean }) {
  if (!sombras.length) return null
  if (pendente) return <Aviso tom="info">Sombra das estratégias: migração 108 por aplicar.</Aviso>
  return (
    <>
      {sombras.map((s) => {
        const dias = s.dias
        const trades = dias.reduce((a, d) => a + d.trades, 0)
        const vit = dias.reduce((a, d) => a + d.vitorias, 0)
        const r = dias.reduce((a, d) => a + d.r_total, 0)
        const expMax = Math.max(0, ...dias.map((d) => d.exposicao_max))
        const cronologico = [...dias].reverse()
        const ultima = dias[0]?.atualizado_em ?? null
        const velha = !ultima || Date.now() - Date.parse(ultima) > 36 * 3_600_000
        return (
          <Painel
            key={s.slug}
            titulo={`${s.nome} · sombra`}
            icone={<Moon className="h-4 w-4" />}
            sub="O que teria sido executado (gate do webhook de hoje) e como teria acabado em velas M15, com a gestão actual. Nenhuma trade é aberta."
          >
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {s.executa
                ? <Pilula tom="grave">activa — a estratégia EXECUTA (a sombra é redundante)</Pilula>
                : <Pilula tom="info">Sombra — não executa</Pilula>}
              <Pilula tom={velha ? "aviso" : "ok"}>{ultima ? `medida ${new Date(ultima).toLocaleString("pt-PT", { timeZone: "UTC", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} UTC` : "ainda sem medições"}</Pilula>
              {s.gestao && <Pilula tom="neutro" title={JSON.stringify(s.gestao)}>gestão: BE {String(s.gestao.break_even ?? "—")} · trailing {String(s.gestao.trailing ?? "—")}</Pilula>}
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
              <Azulejo rotulo={`Trades ${dias.length} d`} valor={fmtNum(trades)} sub={`${trades ? Math.round((100 * vit) / trades) : 0}% vitórias`} serie={cronologico.map((d) => d.trades)} barras />
              <Azulejo rotulo="R total" valor={`${r >= 0 ? "+" : ""}${fmtNum(r, 1)}`} tom={r >= 0 ? "ok" : "grave"} sub={trades ? `${fmtNum(r / trades, 3)} R por trade` : undefined} />
              <Azulejo rotulo="Exposição máx." valor={expMax} sub={`posições abertas · ${fmtNum(expMax * 0.25, 2)}% a 0,25% · ${expMax}% a 1%`} tom={expMax > 12 ? "aviso" : "neutro"} serie={cronologico.map((d) => d.exposicao_max)} />
              <Azulejo rotulo="Perdas seguidas (pior dia)" valor={Math.max(0, ...dias.map((d) => d.perdas_seguidas))} sub={`pior queda num dia ${fmtNum(Math.min(0, ...dias.map((d) => d.pior_sequencia)), 1)} R`} />
            </div>
            {dias.length === 0 ? <Vazio>Sem dias medidos — o serviço sombra-estrategias ainda não correu.</Vazio> : (
              <Tabela min={720}>
                <thead><tr>
                  <th className={th}>Dia (UTC)</th><th className={th}>Ideias → gate</th><th className={th}>Trades</th><th className={th}>% vit.</th>
                  <th className={th}>R total</th><th className={th}>R médio</th><th className={th}>Pior queda</th><th className={th}>Perdas seg.</th><th className={th}>Exposição</th>
                </tr></thead>
                <tbody>
                  {dias.map((d) => (
                    <tr key={d.dia}>
                      <td className={`${td} font-mono`}>{d.dia}{!d.definitivo && <span className="ml-1 text-amber-300" title={`${d.abertas} trade(s) ainda por resolver`}>*</span>}</td>
                      <td className={`${td} font-mono text-zinc-500`}>{d.ideias ?? "—"} → {d.passaram_gate ?? "—"}</td>
                      <td className={`${td} font-mono`}>{d.trades}</td>
                      <td className={`${td} font-mono`}>{d.trades ? Math.round((100 * d.vitorias) / d.trades) : "—"}%</td>
                      <td className={`${td} font-mono ${d.r_total >= 0 ? "text-emerald-300" : "text-rose-300"}`}>{d.r_total >= 0 ? "+" : ""}{fmtNum(d.r_total, 2)}</td>
                      <td className={`${td} font-mono`}>{d.r_medio == null ? "—" : fmtNum(d.r_medio, 3)}</td>
                      <td className={`${td} font-mono`}>{fmtNum(d.pior_sequencia, 1)}</td>
                      <td className={`${td} font-mono`}>{d.perdas_seguidas}</td>
                      <td className={`${td} font-mono`}>{d.exposicao_max}</td>
                    </tr>
                  ))}
                </tbody>
              </Tabela>
            )}
            <p className="mt-2 text-[11px] text-zinc-500">* dia provisório: há trades que ainda não resolveram e o serviço volta a medi-lo. 1R = entrada → stop (alargado a 20 pips), com spread. Histórico completo: docs/sombra-mtm-scanner.md.</p>
          </Painel>
        )
      })}
    </>
  )
}
