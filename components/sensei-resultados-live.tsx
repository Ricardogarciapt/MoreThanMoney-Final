"use client"

import { useEffect, useState } from "react"
import { Loader2, ShieldAlert } from "lucide-react"

interface Resultados {
  sinais: number
  resolvidos: number
  ganhos: number
  perdidos: number
  acertoPct: number
  r: number
  desde: string | null
  ate: string | null
  porInstrumento: Array<{ ticker: string; resolvidos: number; acertoPct: number; r: number }>
}

function mes(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("pt-PT", { day: "2-digit", month: "short", year: "numeric" })
}

/**
 * O registo dos sinais Sensei, lido em direto.
 *
 * Sem selector de período: escolher a janela é a forma mais fácil de fazer uma estratégia parecer
 * melhor do que é, e esta secção existe para provar, não para vender uma fatia boa.
 *
 * O acerto e o R aparecem sempre juntos. Separados, cada um deles mente: 25% de acerto assusta
 * quem não sabe que as perdas custam 1R e os ganhos correm até à quarta saída.
 */
export function SenseiResultadosLive() {
  const [d, setD] = useState<Resultados | null>(null)
  const [estado, setEstado] = useState<"carrega" | "ok" | "falha">("carrega")

  useEffect(() => {
    fetch("/api/sensei-ea/resultados")
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

  // Sem dados não se inventa nada nem se mostra uma caixa vazia: a secção simplesmente não existe.
  if (estado === "falha" || !d || d.resolvidos === 0) return null

  const positivo = d.r >= 0

  return (
    <>
      <div className="grid sm:grid-cols-4 gap-4 mt-8">
        {[
          { v: d.sinais.toLocaleString("pt-PT"), l: "sinais publicados" },
          { v: d.resolvidos.toLocaleString("pt-PT"), l: "já resolvidos" },
          { v: `${d.acertoPct.toString().replace(".", ",")}%`, l: "acerto" },
          {
            v: `${positivo ? "+" : ""}${d.r.toLocaleString("pt-PT")}R`,
            l: "resultado acumulado",
            destaque: true,
          },
        ].map(({ v, l, destaque }) => (
          <div
            key={l}
            className={`rounded-xl border p-6 ${
              destaque
                ? "border-[#D2A63C]/40 bg-[#D2A63C]/[0.06]"
                : "border-[#D2A63C]/20 bg-black/40"
            }`}
          >
            <div className={`text-3xl font-bold tabular-nums ${destaque ? "text-[#D2A63C]" : "text-white"}`}>
              {v}
            </div>
            <div className="text-sm text-gray-500 mt-1">{l}</div>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-500 mt-4">
        Registo completo, de {mes(d.desde)} a {mes(d.ate)}. Sem escolha de período: é tudo o que foi
        emitido. Os sinais ainda abertos ficam de fora até fecharem.
      </p>

      <div className="mt-6 rounded-xl border border-amber-500/25 bg-amber-500/5 p-5 flex gap-4">
        <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-sm text-gray-300 leading-relaxed space-y-2">
          <p>
            <strong className="text-amber-300">Lê o acerto e o R juntos.</strong> {d.acertoPct
              .toString()
              .replace(".", ",")}
            % parece pouco — e é, de propósito. Uma perda custa 1R; um ganho corre até à quarta
            saída e pode valer 4R. São {d.ganhos.toLocaleString("pt-PT")} ganhos e{" "}
            {d.perdidos.toLocaleString("pt-PT")} perdas a dar{" "}
            {positivo ? "um saldo positivo" : "um saldo negativo"} de{" "}
            {positivo ? "+" : ""}
            {d.r}R. Quem não aguenta uma sequência de perdas seguidas não deve usar isto.
          </p>
          <p>
            R é o que arriscas em cada trade. Em euros o mesmo sinal vale 8 € a quem opera 0,01
            lotes e 800 € a quem opera 1 — por isso medimos em R e não em dinheiro.
          </p>
        </div>
      </div>

      {d.porInstrumento.length > 0 && (
        <div className="mt-8">
          <h3 className="text-sm uppercase tracking-wider text-gray-500 mb-3">
            Por instrumento <span className="normal-case tracking-normal">(mínimo 10 trades)</span>
          </h3>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-900/60 text-gray-500 text-xs uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-3">Instrumento</th>
                  <th className="text-right font-medium px-4 py-3">Trades</th>
                  <th className="text-right font-medium px-4 py-3">Acerto</th>
                  <th className="text-right font-medium px-4 py-3">R</th>
                </tr>
              </thead>
              <tbody>
                {d.porInstrumento.map((i) => (
                  <tr key={i.ticker} className="border-t border-gray-800/70">
                    <td className="px-4 py-2.5 font-mono text-gray-300">{i.ticker}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">{i.resolvidos}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-gray-400">
                      {i.acertoPct.toString().replace(".", ",")}%
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right tabular-nums font-medium ${
                        i.r >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {i.r >= 0 ? "+" : ""}
                      {i.r}R
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-gray-600 mt-3">
            Os instrumentos que não aguentaram foram retirados da emissão. Ficam aqui porque
            aconteceram.
          </p>
        </div>
      )}
    </>
  )
}
