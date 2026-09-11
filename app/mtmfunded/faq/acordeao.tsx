'use client'

import { useT } from '@/components/i18n-provider'
import TextoRico from '@/components/mtmfunded/texto-rico'

/**
 * As perguntas abertas e fechadas.
 *
 * É cliente por uma razão só: as perguntas são o texto do `<summary>`, e esse é uma STRING —
 * não aceita um componente lá dentro sem se perder o comportamento nativo do `<details>`. Por
 * isso a tradução é feita com `t()` em vez de `<T>`.
 */

export interface Entrada {
  /** Chave da pergunta. */
  p: string
  /** Chave da resposta. */
  r: string
  vars?: Record<string, string | number>
  /** Frase encaixada na resposta do torneio — traduzida aqui, onde a língua se conhece. */
  inscricoes?: { chave: string; ate: string | null }
  /** Lista de regras, cada uma com o seu valor. */
  lista?: Array<{ k: string; v: number }>
}

export default function Acordeao({ entradas }: { entradas: Entrada[] }) {
  const t = useT()

  return (
    <div className="mt-10 divide-y divide-zinc-900 border-y border-zinc-900">
      {entradas.map((q) => {
        // A frase das inscrições resolve-se antes de entrar na resposta, para a resposta
        // continuar a ser UMA frase traduzível em vez de três pedaços colados.
        let vars = q.vars
        if (q.inscricoes) {
          const ate = q.inscricoes.ate ? t('faq.q3ate').replace('{data}', q.inscricoes.ate) : ''
          vars = { ...vars, inscricoes: t(q.inscricoes.chave).replace('{ate}', ate) }
        }

        return (
          <details key={q.p} className="group py-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-zinc-200 marker:content-none group-open:text-[#D2A63C]">
              {t(q.p)}
            </summary>
            <div className="mt-3 space-y-2 text-sm leading-relaxed text-zinc-400">
              <TextoRico k={q.r} vars={vars} />
              {q.lista && (
                <ul className="ml-4 list-disc space-y-1">
                  {q.lista.map((it) => (
                    <li key={it.k}>{t(it.k).replace('{v}', String(it.v))}</li>
                  ))}
                </ul>
              )}
            </div>
          </details>
        )
      })}
    </div>
  )
}
