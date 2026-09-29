/**
 * O PERÍODO A SEGUIR AO PREÇO — «/mês», «/ano», e nunca um palpite.
 *
 * ── PORQUE É QUE ISTO É UM COMPONENTE E NÃO TRÊS `span` ───────────────────────────────────
 *
 * Porque são TRÊS os sítios que desenham o preço de um produto — a montra, a ficha e a loja do
 * vendedor — e os três tinham a mesma linha escrita à mão. A 29/09 as três diziam «/mês» a partir de
 * `recorrente: boolean`, e o cartão do «Premium · anual» anunciava «624,00 €/mês» num produto que
 * custa 624 € POR ANO. Anunciar um preço anual como mensal não é um erro de estilo: é a loja a
 * mentir no número, no produto mais caro do catálogo.
 *
 * Com a linha repetida três vezes, corrigir era corrigir em três sítios e esperar não esquecer o
 * quarto que nascesse depois (e nasceu um: a loja do vendedor). Um componente resolve isso — e
 * `sufixoDoPeriodo`, em `regras.ts`, é a mesma função que a guarda corre.
 *
 * NÃO ADIVINHA. Um produto recorrente cuja periodicidade não se lê escreve «subscrição»: vago, mas
 * verdadeiro. O que não volta a acontecer é escrever «/mês» sem saber.
 */
"use client"

import { sufixoDoPeriodo } from "@/lib/marketplace/regras"

export default function SufixoPeriodo({
  p,
  className = "text-xs",
}: {
  p: { recorrente?: boolean | null; periodicidade?: string | null }
  /** O tamanho do texto, que muda entre o cartão e a ficha. A cor e o peso não mudam. */
  className?: string
}) {
  const sufixo = sufixoDoPeriodo(p)
  if (!sufixo.texto) return null
  // `junto` decide o espaço: «624,00 €/ano» não leva nenhum, «65,00 € subscrição» leva. Quem decide
  // é a regra e não o ecrã — era assim que os três sítios divergiam.
  return (
    <span className={`${sufixo.junto ? "" : "ml-1"} font-normal text-zinc-500 ${className}`}>{sufixo.texto}</span>
  )
}
