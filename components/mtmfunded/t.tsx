'use client'

import { useT } from '@/components/i18n-provider'

/**
 * Uma palavra traduzida, embrulhada num componente cliente.
 *
 * As páginas do MTM Funded são Server Components — lêem a base de dados — e `useT()` é um
 * hook, que só corre no cliente. Reescrevê-las todas como componentes cliente obrigaria a
 * passar os dados por props e a duplicar cada página em duas.
 *
 * Assim, o texto traduzido entra onde é preciso e o resto da página continua a ser renderizado
 * no servidor. É menos elegante do que uma página cliente inteira, e é muito menos código a
 * mudar — o que, num sítio onde os números vêm da base de dados, conta mais.
 */
export default function T({ k }: { k: string }) {
  return <>{useT()(k)}</>
}
