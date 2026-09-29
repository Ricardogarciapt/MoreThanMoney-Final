"use client"

/**
 * COMO SE DESENHA UM SALDO NO CENTRO — e como se distingue o real do simulado.
 *
 * O cálculo é de `lib/admin-centro/linha-de-agua.ts`; aqui só está a APARÊNCIA, uma vez, para o
 * cockpit, a tabela de contas e o topo das estratégias na cadeia mostrarem a mesma coisa da mesma
 * maneira. Sem isto, cada ecrã inventava a sua cor e o seu sinal, e um deles esquecia-se de dizer
 * que o número era simulado.
 *
 * A marca «SIM» não é decoração: uma conta simulada entra ao preço do sinal e esse viés já foi
 * medido nesta casa como ~56% do lucro. Um saldo simulado sem marca, ao lado de um real, é uma
 * mentira por omissão — por isso o `Pilula` do simulado leva sempre o aviso no title.
 */

import type { LinhaDeAgua, Proveniencia } from "@/lib/admin-centro/linha-de-agua"
import { AVISO_SIMULADO, textoLinhaDeAgua } from "@/lib/admin-centro/linha-de-agua"
import { Pilula, fmtNum } from "./ui"

/** A etiqueta da proveniência. O real não leva nada: é o normal, e ruído mata a marca do simulado. */
export function MarcaProveniencia({ p }: { p: Proveniencia }) {
  if (p === "real") return null
  return <Pilula tom="aviso" title={AVISO_SIMULADO}>SIM</Pilula>
}

/** «+2,50 %» a verde / «−13,00 %» a vermelho, e «—» quando a conta não declara linha de partida. */
export function PctLinhaDeAgua({ l, titulo }: { l: LinhaDeAgua; titulo?: string }) {
  if (l.pct == null) {
    return <span className="text-zinc-600" title={titulo ?? "sem saldo_inicial: não há linha de partida contra a qual medir"}>—</span>
  }
  const cor = l.proveniencia === "simulado"
    ? l.acima ? "text-emerald-300/70" : "text-rose-300/70" // esmaecido: é simulado, não é prova
    : l.acima ? "text-emerald-300" : "text-rose-300"
  return (
    <span className={cor} title={titulo ?? (l.proveniencia === "simulado" ? AVISO_SIMULADO : "saldo actual contra o saldo_inicial")}>
      {textoLinhaDeAgua(l)}
    </span>
  )
}

/** Saldo + linha de água + marca, na mesma célula — o formato de sempre para uma conta. */
export function SaldoComLinha({ saldo, inicial, linha }: { saldo: number | null; inicial: number | null; linha: LinhaDeAgua }) {
  return (
    <div className="flex flex-col items-start gap-0.5">
      <span className="flex items-center gap-1">
        {saldo == null ? <span className="text-zinc-600">—</span> : <span>{fmtNum(saldo, 2)}</span>}
        <MarcaProveniencia p={linha.proveniencia} />
      </span>
      <span className="text-[10px]">
        <PctLinhaDeAgua l={linha} />
        {inicial != null && <span className="ml-1 text-zinc-600">de {fmtNum(inicial, 0)}</span>}
      </span>
    </div>
  )
}
