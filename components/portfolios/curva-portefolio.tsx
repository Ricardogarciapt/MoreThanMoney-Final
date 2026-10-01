"use client"

/**
 * A CURVA DE UM PORTEFÓLIO — o que entrou e o que vale, semana a semana desde 01/03/2024.
 *
 * ═══ PORQUE É QUE SÃO DUAS LINHAS E NÃO UMA ════════════════════════════════════════════════
 *
 * Uma curva de VALOR sozinha é a forma mais fácil de enganar sem mentir: um portefólio onde se
 * despeja dinheiro todas as semanas sobe no gráfico mesmo quando cada compra está a perder. Quem
 * olha vê uma linha a subir e lê «isto está a ganhar».
 *
 * Com as duas, a história lê-se sozinha: a área entre elas é o lucro quando o valor está por cima,
 * e é a perda quando está por baixo. É por isso que o reforço aparece como linha e não como um
 * número no canto.
 *
 * O resultado em percentagem é medido contra o CONTRIBUÍDO, não contra os 1000 $ iniciais —
 * medir um portefólio com reforços semanais contra o primeiro depósito dá um número bonito que
 * não é o retorno de ninguém.
 */

import { useMemo } from "react"
import {
  Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts"

export interface PontoCurva {
  data: string
  contribuido: number
  valor: number
}

const OURO = "#D2A63C"
const OURO_CLARO = "#E9C46A"

const dinheiro = (n: number) =>
  n.toLocaleString("pt-PT", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function CurvaPortefolio({
  titulo,
  curva,
  contribuido,
  valor,
  desde,
  dca,
  fontePrecos,
  nota,
}: {
  titulo: string
  curva: PontoCurva[]
  contribuido: number
  valor: number
  desde?: string
  dca?: string
  fontePrecos?: string
  /** Fica disponível para o admin, mas NÃO se desenha: o dono tirou-a do ecrã público. */
  nota?: string
}) {
  const resultado = contribuido > 0 ? (valor / contribuido - 1) * 100 : 0
  const ganha = valor >= contribuido

  // Uma marca por trimestre: com 135 sextas no eixo, as datas sobrepunham-se até ficarem ilegíveis.
  const dados = useMemo(
    () => curva.map((p) => ({ ...p, rotulo: p.data.slice(0, 7) })),
    [curva],
  )
  if (!dados.length) return null

  return (
    <section className="rounded-2xl border border-[#D2A63C]/20 bg-black/40 p-4 sm:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-white">{titulo}</h3>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {desde ? `desde ${desde}` : null}
            {dca ? ` · reforço de ${dca}` : null}
            {fontePrecos ? ` · preços: ${fontePrecos}` : null}
          </p>
        </div>
        <div className="text-right">
          <p className={`text-2xl font-semibold tabular-nums ${ganha ? "text-emerald-400" : "text-red-400"}`}>
            {resultado >= 0 ? "+" : ""}{resultado.toFixed(2)}%
          </p>
          <p className="text-[11px] tabular-nums text-gray-500">
            {dinheiro(contribuido)} investidos → {dinheiro(valor)}
          </p>
        </div>
      </header>

      <div className="h-56 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={dados} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={`v-${titulo}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ganha ? "#34d399" : "#f87171"} stopOpacity={0.35} />
                <stop offset="100%" stopColor={ganha ? "#34d399" : "#f87171"} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#ffffff10" vertical={false} />
            <XAxis
              dataKey="rotulo" tick={{ fill: "#9ca3af", fontSize: 10 }}
              tickLine={false} axisLine={false} minTickGap={48}
            />
            <YAxis
              tick={{ fill: "#9ca3af", fontSize: 10 }} tickLine={false} axisLine={false}
              width={52} tickFormatter={(v) => `${Math.round(Number(v) / 1000)}k`}
            />
            <Tooltip
              contentStyle={{ background: "#0A0A0B", border: "1px solid rgba(210,166,60,0.3)", borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: "#E9C46A" }}
              formatter={(v, nome) => [dinheiro(Number(v)), String(nome)] as [string, string]}
            />
            <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
            {/* O VALOR por baixo e o CONTRIBUÍDO por cima: assim a linha do dinheiro investido
                nunca fica escondida pela área, que é o que torna a comparação legível. */}
            <Area
              type="monotone" dataKey="valor" name="Valor de mercado"
              stroke={ganha ? "#34d399" : "#f87171"} strokeWidth={2}
              fill={`url(#v-${titulo})`} dot={false} isAnimationActive={false}
            />
            <Area
              type="monotone" dataKey="contribuido" name="Dinheiro investido"
              stroke={OURO} strokeWidth={1.5} strokeDasharray="4 3"
              fill="none" dot={false} isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

    </section>
  )
}
