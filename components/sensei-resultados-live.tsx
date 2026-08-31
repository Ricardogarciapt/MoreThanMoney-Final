"use client"

import { useEffect, useState } from "react"
import { ShieldAlert } from "lucide-react"

interface Metrica {
  symbol: string
  trades: number
  ganhos: number
  acertoPct: number
  pips: number
}

interface Metricas {
  amostraSuficiente: true
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

/** O que a rota devolve enquanto a conta ainda não tem histórico que chegue. */
interface AmostraCurta {
  amostraSuficiente: false
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
 *
 * A secção INTEIRA vive aqui dentro — título e texto de abertura incluídos. Enquanto a conta não
 * tiver histórico que chegue, o servidor não manda números e isto devolve `null`. Se o título
 * ficasse na página, sobrava um cabeçalho a prometer resultados por cima de nada.
 */
export function SenseiResultadosLive() {
  const [d, setD] = useState<Metricas | null>(null)
  const [estado, setEstado] = useState<"carrega" | "ok" | "escondida" | "falha">("carrega")

  useEffect(() => {
    fetch("/api/sensei-ea/provider")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("sem dados"))))
      .then((j: Metricas | AmostraCurta) => {
        if (!j.amostraSuficiente) {
          setEstado("escondida")
          return
        }
        setD(j)
        setEstado("ok")
      })
      .catch(() => setEstado("falha"))
  }, [])

  // Nada de esqueleto a piscar antes de decidir: enquanto a amostra for curta a secção nem vai
  // existir, e um bloco que aparece e desaparece é pior do que nunca ter estado lá.
  if (estado !== "ok" || !d || !d.porInstrumento.length) return null

  const meses = Math.round(d.dias / 30)

  return (
    <section className="border-y border-gray-800 bg-gray-900/30">
      <div className="max-w-6xl mx-auto px-4 py-16">
        <h2 className="text-2xl md:text-3xl font-bold mb-3">A conta Sensei, por instrumento</h2>
        <p className="text-gray-400 max-w-2xl">
          As ordens reais da conta que alimenta o MTM Auto Sensei, lidas em direto do histórico da
          corretora. Não são sinais publicados nem simulações — são trades que aconteceram, com
          cada saída parcial a contar pelo seu peso.
        </p>

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
          {data(d.desde)} a {data(d.ate)} — {meses > 1 ? `${meses} meses` : `${d.dias} dias`},{" "}
          {d.totalTrades} trades fechadas. Só instrumentos com pelo menos 10 trades: abaixo disso o
          número não diz nada. Ordenado pelo número de trades, nunca pelo resultado.
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
              Contamos cada saída parcial pelo seu peso. Uma posição que fecha um terço no TP1, um
              terço no TP2 e o resto no breakeven vale a média das três — não vale o último preço.
              É assim que o motor opera, por isso é assim que se mede.
            </p>
            <p>
              Isto é o que a conta fez neste período, não o que vai fazer. Meses maus existem, e um
              período bom não os impede de vir.
            </p>
          </div>
        </div>

        <p className="text-xs text-gray-600 mt-8 leading-relaxed max-w-3xl">
          Medimos em pips e não em dinheiro porque o mesmo trade vale cerca de 8 euros a quem opera
          0,01 lotes e 800 euros a quem opera 1 lote — a percentagem é igual para toda a gente, o
          dinheiro não. Resultados passados não indicam resultados futuros, e a tua corretora não é
          a nossa: o spread e o slippage que apanhas são teus.
        </p>
      </div>
    </section>
  )
}
