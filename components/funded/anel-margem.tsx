"use client"

// `React` em âmbito: o teste desenha o anel com `npx tsx` (JSX clássico), sem o compilador do Next.
import React from "react"

/**
 * O nível de margem num anel, para o topo do SIMPLE (no PRO o número já vai na barra de métricas).
 *
 * No telemóvel não há espaço para a linha toda de métricas; o anel diz de relance se a conta está
 * folgada sem abrir o resumo. O arco enche até 500 % (acima disso já não muda nada para quem
 * decide) e a cor segue os limiares de sempre: abaixo de 100 % é chamada de margem, abaixo de
 * 200 % é aviso. Sem posições não há margem a medir: anel vazio e «—», em vez de inventar 0 %.
 */
const CHEIO_EM = 500
const RAIO = 15
const VOLTA = 2 * Math.PI * RAIO

export function corDoNivel(nivel: number | null): string {
  if (nivel == null) return "#52525B"
  if (nivel < 100) return "#F23645"
  if (nivel < 200) return "#E9C46A"
  return "#D2A63C"
}

export default function AnelMargem({ nivel }: { nivel: number | null }) {
  const fracao = nivel == null ? 0 : Math.min(Math.max(nivel, 0), CHEIO_EM) / CHEIO_EM
  const texto = nivel == null ? "—" : nivel >= 1000 ? `${Math.round(nivel / 100) / 10}k` : `${Math.round(nivel)}`
  const cor = corDoNivel(nivel)
  return (
    <span
      className="relative grid h-9 w-9 shrink-0 place-items-center"
      role="img"
      aria-label={nivel == null ? "Nível de margem: sem posições" : `Nível de margem ${Math.round(nivel)}%`}
    >
      <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
        <circle cx="18" cy="18" r={RAIO} fill="none" stroke="#2A2E39" strokeWidth="3" />
        <circle
          cx="18" cy="18" r={RAIO} fill="none" stroke={cor} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={VOLTA} strokeDashoffset={VOLTA * (1 - fracao)}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
        />
      </svg>
      <span className="font-mono text-[9.5px] font-semibold leading-none" style={{ color: nivel == null ? "#A1A1AA" : cor }}>{texto}</span>
    </span>
  )
}
