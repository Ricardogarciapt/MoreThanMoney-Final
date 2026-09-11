'use client'

import Link from 'next/link'
import { useT } from '@/components/i18n-provider'

/**
 * Texto do dicionário com NEGRITO, LINKS, LISTAS e valores interpolados.
 *
 * Existe por causa da FAQ. As respostas têm palavras a negrito, ligações para os termos e
 * números que vêm da base de dados — e havia três saídas más para isso:
 *
 * · Partir cada resposta em seis chaves («…parte 1», «…parte 2»). O tradutor perde a frase de
 *   vista e traduz fragmentos, que é como se obtêm aquelas traduções que ninguém percebe.
 * · Guardar HTML no dicionário e injectá-lo. Passa a haver marcação a vir de uma string, e
 *   basta um dia alguém pôr ali conteúdo de fora para isso ser um problema a sério.
 * · Deixar as respostas em português. Que é o que estava.
 *
 * Então o dicionário guarda a frase INTEIRA, numa marcação mínima que se lê bem enquanto se
 * traduz — `**negrito**`, `[texto](/rota)`, linhas a começar por `- ` — e o desenho sai daqui,
 * em JSX. Nada do que vem do dicionário é tratado como HTML.
 *
 * Os valores entram como `{nome}` e são substituídos ANTES da marcação, para que um número
 * vindo da base de dados nunca possa ser lido como marcação.
 */

function interpolar(texto: string, vars?: Record<string, string | number>): string {
  if (!vars) return texto
  return texto.replace(/\{(\w+)\}/g, (todo, nome) =>
    Object.prototype.hasOwnProperty.call(vars, nome) ? String(vars[nome]) : todo,
  )
}

/** Uma linha: negrito e ligações. */
function linha(texto: string, chave: string): React.ReactNode[] {
  const pedacos: React.ReactNode[] = []
  // Uma só expressão para os dois casos, senão a ordem entre elas passa a importar e o
  // negrito dentro de um link (ou o contrário) parte-se de formas difíceis de ver.
  const re = /\*\*(.+?)\*\*|\[(.+?)\]\(([^)]+)\)/g
  let ultimo = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(texto))) {
    if (m.index > ultimo) pedacos.push(texto.slice(ultimo, m.index))
    if (m[1] !== undefined) {
      pedacos.push(
        <b key={`${chave}-b${i++}`} className="text-zinc-200">
          {m[1]}
        </b>,
      )
    } else {
      const href = m[3]
      const externo = /^(https?:|mailto:)/.test(href)
      pedacos.push(
        externo ? (
          <a key={`${chave}-a${i++}`} href={href} className="text-[#D2A63C] hover:underline">
            {m[2]}
          </a>
        ) : (
          <Link key={`${chave}-a${i++}`} href={href} className="text-[#D2A63C] hover:underline">
            {m[2]}
          </Link>
        ),
      )
    }
    ultimo = m.index + m[0].length
  }
  if (ultimo < texto.length) pedacos.push(texto.slice(ultimo))
  return pedacos
}

export default function TextoRico({
  k,
  vars,
}: {
  k: string
  vars?: Record<string, string | number>
}) {
  const t = useT()
  const texto = interpolar(t(k), vars)

  // As listas vêm como linhas a começar por «- ». O resto é parágrafo.
  const linhas = texto.split('\n')
  const blocos: React.ReactNode[] = []
  let itens: string[] = []

  const despejarLista = () => {
    if (!itens.length) return
    blocos.push(
      <ul key={`${k}-ul${blocos.length}`} className="ml-4 mt-2 list-disc space-y-1">
        {itens.map((it, j) => (
          <li key={j}>{linha(it, `${k}-li${j}`)}</li>
        ))}
      </ul>,
    )
    itens = []
  }

  for (const l of linhas) {
    const cru = l.trim()
    if (cru.startsWith('- ')) {
      itens.push(cru.slice(2))
      continue
    }
    despejarLista()
    if (cru) blocos.push(<p key={`${k}-p${blocos.length}`}>{linha(cru, `${k}-p`)}</p>)
  }
  despejarLista()

  return <>{blocos}</>
}
