"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldAlert } from "lucide-react"

interface Metrica {
  symbol: string
  trades: number
  ganhos: number
  acertoPct: number
  pips: number
}

interface Metricas {
  porInstrumento: Metrica[]
  abaixoDoMinimo: Array<{ symbol: string; trades: number }>
  totalTrades: number
  acertoPct: number
  pips: number
  desde: string | null
  ate: string | null
  dias: number
  aindaAbertas: number
}

function data(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
}

function num(n: number): string {
  return n.toLocaleString("pt-PT", { maximumFractionDigits: 1 })
}

/**
 * As métricas da conta provider do Sensei — as ordens reais, não os sinais publicados.
 *
 * A versão anterior media o registo dos SINAIS, onde uma ideia que pagou TP1 e TP2 e depois
 * reverteu era contada como perda inteira. Dava 25% de acerto e não descrevia o que a conta fez:
 * descrevia o que teria acontecido a quem levasse a posição toda até ao fim, que não é como isto
 * se opera. Aqui cada saída parcial conta pelo seu peso, que é o que o motor faz de verdade.
 *
 * Sem selector de período e sem ordenação pelo resultado: as duas coisas que transformam uma
 * tabela de prova numa montra.
 */
export function SenseiResultadosLive() {
  const [d, setD] = useState<Metricas | null>(null)
  const [estado, setEstado] = useState<"carrega" | "ok" | "falha">("carrega")

  useEffect(() => {
    fetch("/api/sensei-ea/provider")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sem dados"))))
      .then((j) => {
        setD(j)
        setEstado("ok")
      })
      .catch(() => setEstado("falha"))
  }, [])

  if (estado === "carrega") {
    return (
      <div className="py-12 flex justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#D2A63C]" />
      </div>
    )
  }

  // Sem dados não se inventa nada nem se mostra uma caixa vazia: a secção não existe.
  if (estado === "falha" || !d || !d.porInstrumento.length) return null

  return (
    <>
      <div className="mt-8 overflow-x-auto rounded-xl border border-gray-800">
        <table className="w-full text-sm min-w-[520px]">
          <thead>
            <tr className="bg-gray-900/60 text-gray-500 text-xs uppercase tracking-wider">
              <th className="text-left font-medium px-4 py-3">Instrumento</th>
              <th className="text-right font-medium px-4 py-3">Trades</th>
              <th className="text-right font-medium px-4 py-3">Acerto</th>
              <th className="text-right font-medium px-4 py-3">Pips</th>
            </tr>
          </thead>
          <tbody>
            {d.porInstrumento.map((i) => (
              <tr key={i.symbol} className="border-t border-gray-800/70">
                <td className="px-4 py-3 font-mono text-gray-200">{i.symbol}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-400">{i.trades}</td>
                <td className="px-4 py-3 text-right tabular-nums text-gray-300">
                  {num(i.acertoPct)}%
                </td>
                <td
                  className={`px-4 py-3 text-right tabular-nums font-medium ${
                    i.pips >= 0 ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {i.pips >= 0 ? "+" : ""}
                  {num(i.pips)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-gray-500 mt-4">
        Só instrumentos com pelo menos 10 trades — abaixo disso o número não diz nada. Ordenado
        pelo número de trades, nunca pelo resultado.
        {d.abaixoDoMinimo.length > 0 && (
          <>
            {" "}
            Ainda abaixo do mínimo:{" "}
            {d.abaixoDoMinimo.map((x) => `${x.symbol} (${x.trades})`).join(", ")}.
          </>
        )}
      </p>

      <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 flex gap-4">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-300 leading-relaxed space-y-2">
          <p>
            <strong className="text-amber-300">
              Amostra de {d.dias} {d.dias === 1 ? "dia" : "dias"}
            </strong>{" "}
            ({data(d.desde)} a {data(d.ate)}), {d.totalTrades} trades fechadas. É pouco tempo para
            julgar uma estratégia — meses maus existem e não estão aqui dentro. Lê isto como o que
            é: o que a conta fez até agora, não o que vai fazer.
          </p>
          <p>
            Contamos cada saída parcial pelo seu peso. Uma posição que fecha um terço no TP1, um
            terço no TP2 e o resto no breakeven vale a média das três — não vale o último preço. É
            assim que o motor opera, por isso é assim que se mede.
          </p>
        </div>
      </div>
    </>
  )
}
