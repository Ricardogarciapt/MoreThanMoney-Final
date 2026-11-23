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

  // O mesmo texto do template mtm_reencontro_v2: apresenta o número e pede licença.
  if (familia === 'importado') return mensagemDoFunil('reencontro', n)

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

// ── Escolha do funil (dropdown do back-office) ──────────────────────────────────────────────────

export type IdFunilMensagem = 'auto' | 'reencontro' | 'educacao' | 'corretora' | 'funded' | 'resposta' | 'seguimento' | 'reativar'

export interface FunilMensagem {
  id: IdFunilMensagem
  nome: string
  /** Template aprovado que diz o mesmo pela Cloud API (fora das 24 h). `null` em «auto». */
  template: string | null
  /** 'campanha' para MARKETING, 'servico' para UTILITY — quem decide se sai é o servidor. */
  finalidade: 'campanha' | 'servico'
  /** O template leva um 2.º parâmetro (tema). */
  comTema: boolean
}

/** Uma entrada por funil. Os textos manuais espelham o corpo dos templates (`templates-mtm.ts`). */
export const FUNIS_MENSAGEM: FunilMensagem[] = [
  { id: 'auto', nome: 'Automática (pela origem do lead)', template: null, finalidade: 'campanha', comTema: false },
  { id: 'reencontro', nome: 'Reencontro (contactos antigos)', template: 'mtm_reencontro_v2', finalidade: 'campanha', comTema: false },
  { id: 'educacao', nome: 'Funil Educação', template: 'mtm_funil_educacao', finalidade: 'servico', comTema: false },
  { id: 'corretora', nome: 'Funil Corretora', template: 'mtm_funil_corretora', finalidade: 'servico', comTema: false },
  { id: 'funded', nome: 'Funil MTM Funded', template: 'mtm_funil_funded', finalidade: 'servico', comTema: false },
  { id: 'resposta', nome: 'Resposta a pedido de informação', template: 'mtm_resposta_lead', finalidade: 'servico', comTema: true },
  { id: 'seguimento', nome: 'Seguimento', template: 'mtm_seguimento', finalidade: 'campanha', comTema: true },
  { id: 'reativar', nome: 'Reativar (novidade da semana)', template: 'mtm_reativar', finalidade: 'campanha', comTema: true },
]

export function ehIdFunilMensagem(v: unknown): v is IdFunilMensagem {
  return FUNIS_MENSAGEM.some((f) => f.id === v)
}

/** O texto manual (wa.me) de cada funil. «auto» = `primeiraMensagem`. */
export function mensagemDoFunil(id: IdFunilMensagem, n: NegocioParaMensagem, tema?: string | null): string {
  const nome = primeiroNomeDe(n.nome)
  const ola = nome ? `Olá ${nome}` : 'Olá'
  const t = tema?.trim()
  switch (id) {
    case 'reencontro':
      return (
        `${ola}, é o Ricardo Garcia 👋\n\nEste é o número oficial da MoreThanMoney, o meu número de trabalho (guarda-o, se quiseres). ` +
        'Tinha o teu contacto e lembrei-me de ti: estou a abrir uma coisa nova e queria saber se te interessa.\n\n' +
        `Posso mandar-te um áudio curto, de 1 minuto, a explicar?\n\n${SAIDA}`
      )
    case 'educacao':
      return `${ola}, aqui é a equipa MoreThanMoney. Pediste para te contactarmos sobre a formação em trading.\n\nPara te orientarmos bem: já operaste alguma vez ou estás a começar do zero?\n\n${SAIDA}`
    case 'corretora':
      return `${ola}, aqui é a equipa MoreThanMoney. Pediste ajuda para abrir conta na corretora regulada que recomendamos.\n\nJá tens conta aberta ou queres que te acompanhemos desde o primeiro passo?\n\n${SAIDA}`
    case 'funded':
      return `${ola}, aqui é a equipa MoreThanMoney. Pediste informação sobre o MTM Funded, os desafios em conta simulada.\n\nQueres que te expliquemos as regras e como começar?\n\n${SAIDA}`
    case 'resposta':
      return `${ola}, recebemos o teu pedido de informação${t ? ` sobre ${t}` : ''}.\n\nQueres que te expliquemos aqui por mensagem ou preferes marcar uma conversa curta?\n\n${SAIDA}`
    case 'seguimento':
      return `${ola}, é a MoreThanMoney. Ficou alguma dúvida${t ? ` sobre ${t}` : ''}? Estou por aqui para ajudar.\n\n${SAIDA}`
    case 'reativar':
      return `${ola}, há algum tempo que não falamos. 🙂${t ? ` Esta semana temos ${t} na MoreThanMoney.` : ''}\n\nQueres saber mais? Responde SIM. ${SAIDA}`
    default:
      return primeiraMensagem(n)
  }
}
