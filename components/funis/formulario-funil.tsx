'use client'

/**
 * O contacto de cada funil (22/11/2026): formulário curto (nome + WhatsApp) e botão de WhatsApp
 * direto. Mesma porta de entrada do «Quero que me liguem» (consentimento, tarefa do setter, aviso
 * no Telegram), com a origem `funil:<chave>` + o anúncio, e os eventos Lead / Contact do pixel.
 */
import ContactoRapido from '@/components/captacao/contacto-rapido'
import { rastrear } from '@/lib/funis-pixel-browser'
import { FUNIS, type FunilPublicidade } from '@/lib/funis-publicidade'

export default function FormularioFunil({ chave }: { chave: FunilPublicidade }) {
  const f = FUNIS[chave]
  return (
    <ContactoRapido
      origem={`funil:${chave}`}
      interesse={f.interesse}
      ag={f.ag}
      textoBotao={f.formulario.botao}
      mensagemWhatsapp={`Olá! Vi o anúncio da MoreThanMoney sobre ${f.nome} e quero saber mais.`}
      onLead={() => rastrear('Lead', { content_name: f.nome, content_category: chave })}
      onWhatsapp={() => rastrear('Contact', { content_name: f.nome, content_category: chave })}
    />
  )
}
