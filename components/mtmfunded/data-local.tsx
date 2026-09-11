'use client'

import { useI18n } from '@/components/i18n-provider'

/**
 * Uma data escrita na língua de quem está a ler.
 *
 * As páginas são Server Components e formatavam as datas com `pt-PT` fixo — o servidor não
 * sabe em que língua a página vai ser lida, e o resultado era «runs from 14 de setembro de
 * 2026 to 15 de dezembro de 2026» no meio de uma frase em inglês. Metade traduzida é pior do
 * que nada traduzido: parece descuido, e é.
 *
 * O servidor passa a data em ISO e a formatação acontece aqui, onde a língua já se conhece.
 */

/** Formata uma data ISO na língua dada. Exportada para quem já tem o `lang` à mão. */
export function formatarData(iso: string | null | undefined, lang: string, curta = false): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return '—'
  return d.toLocaleDateString(lang === 'pt' ? 'pt-PT' : lang, {
    day: '2-digit',
    month: 'long',
    ...(curta ? {} : { year: 'numeric' }),
  })
}

export default function DataLocal({ iso, curta }: { iso: string | null | undefined; curta?: boolean }) {
  const { lang } = useI18n()
  return <>{formatarData(iso, lang, curta)}</>
}
