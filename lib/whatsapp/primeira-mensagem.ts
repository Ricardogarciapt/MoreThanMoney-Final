/**
 * A PRIMEIRA MENSAGEM DE WHATSAPP de cada negócio do pipeline, pronta a sair com um toque (23/11/2026).
 *
 * Serve dois caminhos que dizem a MESMA coisa:
 *  · o automático — os templates aprovados (`lib/whatsapp/templates-mtm.ts`), que a Cloud API manda
 *    sozinha a quem pediu contacto (`lib/pedido-contacto-registo.ts`) e aos contactos antigos em lotes
 *    (`lib/whatsapp/reencontro.ts`);
 *  · o manual — o botão «WhatsApp» do back-office abre `wa.me/<número>?text=<isto>` já escrito, para
 *    quem está a trabalhar o lead carregar só em «Enviar» (fila em /backoffice/pipeline/whatsapp).
 *
 * Puro: sem base de dados, sem rede. O texto segue o tom da casa (PT-PT, «tu», sem promessas de
 * ganhos) e termina sempre com a saída (SAIR), que o webhook trata.
 */
import { INTERESSES } from '@/lib/pedido-contacto-textos'

export interface NegocioParaMensagem {
  nome?: string | null
  origem?: string | null
  interesse?: string | null
  etiquetas?: string[] | null
}

const SAIDA = 'Se preferires não receber mensagens, responde SAIR.'

export function primeiroNomeDe(nome: string | null | undefined): string {
  const n = String(nome ?? '').trim().split(/\s+/)[0] ?? ''
  // Nomes importados vêm às vezes como número ou emoji: nesse caso não se usa nome nenhum.
  return /^[\p{L}][\p{L}'-]{1,}$/u.test(n) ? n.charAt(0).toUpperCase() + n.slice(1).toLowerCase() : ''
}

/** De onde veio o lead, em três famílias que pedem textos diferentes. */
export function familiaDaOrigem(origem: string | null | undefined): 'importado' | 'ebook' | 'pedido' {
  const o = String(origem ?? '')
  if (o === 'whatsapp_import') return 'importado'
  if (o.startsWith('ebook:')) return 'ebook'
  return 'pedido'
}

export function primeiraMensagem(n: NegocioParaMensagem): string {
  const nome = primeiroNomeDe(n.nome)
  const ola = nome ? `Olá ${nome}` : 'Olá'
  const familia = familiaDaOrigem(n.origem)

  if (familia === 'importado') {
    // O mesmo texto do template mtm_reencontro: pede licença antes de mandar seja o que for.
    return (
      `${ola}, é o Ricardo Garcia, da MoreThanMoney. 👋\n\n` +
      'Há algum tempo que não falamos. Estou a preparar uma coisa nova e lembrei-me de ti. ' +
      `Posso mandar-te um áudio curto a explicar?\n\n${SAIDA}`
    )
  }

  if (familia === 'ebook') {
    const slug = String(n.origem).slice('ebook:'.length).replace(/-/g, ' ')
    return (
      `${ola}, é o Ricardo, da MoreThanMoney. Vi que pediste o e-book «${slug}». ` +
      'Já conseguiste abrir? Se quiseres, digo-te por onde começar.\n\n' +
      SAIDA
    )
  }

  const tema = n.interesse && n.interesse in INTERESSES ? INTERESSES[n.interesse as keyof typeof INTERESSES] : null
  return (
    `${ola}, aqui é a MoreThanMoney. ` +
    (tema ? `Pediste que te contactássemos sobre ${tema}. ` : 'Pediste que te contactássemos. ') +
    `Quando te dá jeito falarmos?\n\n${SAIDA}`
  )
}

/** Só dígitos, com 351 à frente quando o número português veio sem indicativo. `null` se não serve. */
export function numeroParaWaMe(telefone: string | null | undefined): string | null {
  let d = String(telefone ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.length === 9 && /^[29]/.test(d)) d = `351${d}`
  return d.length >= 10 && d.length <= 15 ? d : null
}

/** `https://wa.me/<dígitos>?text=<mensagem>` — abre a conversa já com o rascunho escrito. */
export function linkWhatsApp(telefone: string | null | undefined, texto?: string | null): string | null {
  const d = numeroParaWaMe(telefone)
  if (!d) return null
  return texto ? `https://wa.me/${d}?text=${encodeURIComponent(texto)}` : `https://wa.me/${d}`
}
