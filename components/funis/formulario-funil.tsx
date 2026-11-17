'use client'

/**
 * O «Quero que me liguem» de cada funil: mesma porta de entrada (consentimento por canal, tarefa
 * do setter, aviso no Telegram), com a origem `funil:<chave>` + UTM do anúncio e o evento Lead.
 */
import { useEffect, useState } from 'react'
import QueroQueMeLiguem from '@/components/captacao/quero-que-me-liguem'
import { rastrear } from '@/lib/funis-pixel-browser'
import { FUNIS, origemDoFunil, type FunilPublicidade } from '@/lib/funis-publicidade'

export default function FormularioFunil({ chave }: { chave: FunilPublicidade }) {
  const f = FUNIS[chave]
  const [origem, setOrigem] = useState(() => origemDoFunil(chave))

  useEffect(() => {
    try {
      const q = new URLSearchParams(window.location.search)
      setOrigem(
        origemDoFunil(chave, {
          utm_source: q.get('utm_source'),
          utm_campaign: q.get('utm_campaign'),
          utm_content: q.get('utm_content'),
        }),
      )
    } catch {
      /* fica a origem sem UTM */
    }
  }, [chave])

  return (
    <QueroQueMeLiguem
      origem={origem}
      ag={f.ag}
      titulo={f.formulario.titulo}
      subtitulo={f.formulario.subtitulo}
      interesseInicial={f.interesse}
      variante="solto"
      onEnviado={() => rastrear('Lead', { content_name: f.nome, content_category: chave })}
    />
  )
}
