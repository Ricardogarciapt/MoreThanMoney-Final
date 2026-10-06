/**
 * QUEM PODE RECEBER UM EMAIL B2B DA MTM — o validador, puro (sem rede, sem base).
 *
 * Só passa:
 *  · email de DOMÍNIO DE EMPRESA — nunca webmail pessoal (gmail, hotmail, outlook, yahoo, icloud…);
 *  · endereço GENÉRICO (info@, geral@, parcerias@, partners@, hello@, business@, contact@…) OU um
 *    endereço que a empresa publicou explicitamente para contacto comercial — e então tem de vir com
 *    a URL onde está publicado;
 *  · de uma PESSOA COLECTIVA confirmada (Lei 41/2004 art. 13.º-A n.º 2 só cobre pessoas colectivas);
 *  · que NÃO esteja na exclusão global (nem o email, nem o domínio inteiro, se a empresa pediu).
 *
 * A guarda está em `lib/b2b/b2b.check.ts`.
 */
import { WEBMAIL as WEBMAIL_MOTOR } from '@/lib/agentes/contacto-inicial'

/** Webmail pessoal: os do motor + os que faltam lá (sobretudo Brasil e europeus). */
export const WEBMAIL_PESSOAL: ReadonlySet<string> = new Set([
  ...WEBMAIL_MOTOR,
  'hotmail.com.br', 'outlook.com.br', 'live.pt', 'ymail.com', 'rocketmail.com', 'yahoo.es', 'yahoo.fr',
  'yahoo.co.uk', 'hotmail.fr', 'hotmail.es', 'hotmail.co.uk', 'outlook.es', 'live.fr', 'icloud.pt',
  'pm.me', 'proton.com', 'tutanota.com', 'tuta.io', 'hey.com', 'fastmail.com', 'gmx.de', 'gmx.pt', 'web.de',
  'mail.ru', 'yandex.ru', 'qq.com', '163.com', 'ig.com.br', 'r7.com', 'globo.com', 'globomail.com',
  'zipmail.com.br', 'oi.com.br', 'click21.com.br', 'superig.com.br', 'portugalmail.pt', 'mail.pt',
  'vodafone.pt', 'meo.pt', 'zonmail.pt', 'aeiou.pt', 'gmail.com.br',
])

/** Caixas genéricas de empresa (a parte antes do @). */
export const LOCAIS_GENERICOS: ReadonlySet<string> = new Set([
  'info', 'informacoes', 'informacao', 'geral', 'parcerias', 'parceria', 'parceiros', 'partners', 'partnership',
  'partnerships', 'hello', 'hi', 'ola', 'business', 'contact', 'contacts', 'contacto', 'contactos', 'contato',
  'contatos', 'comercial', 'sales', 'vendas', 'afiliados', 'affiliates', 'affiliate', 'ib', 'ibs',
  'marketing', 'publicidade', 'anuncie', 'media', 'midia', 'atendimento', 'office',
  'escritorio', 'secretaria', 'team', 'equipa', 'equipe', 'bd', 'bizdev',
])

export type TipoEmail = 'generico' | 'comercial_publicado'

export interface CandidatoB2B {
  email: string
  emailTipo?: TipoEmail | null
  /** A URL pública onde o email está escrito. Obrigatória em todos; sem ela não se prova a origem. */
  fonteUrl?: string | null
  pessoaColectiva?: boolean | null
}

export interface Veredicto {
  ok: boolean
  motivo: string
}

const SINTAXE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/

export function normalizarEmail(e: unknown): string {
  return String(e ?? '').trim().toLowerCase()
}

export function dominioDe(email: string): string {
  return normalizarEmail(email).split('@')[1] ?? ''
}

export function eWebmailPessoal(email: string): boolean {
  const d = dominioDe(email)
  return !d || WEBMAIL_PESSOAL.has(d)
}

export function eGenerico(email: string): boolean {
  const local = normalizarEmail(email).split('@')[0] ?? ''
  // «info.pt@», «parcerias-br@», «contato2@» continuam a ser caixas genéricas.
  const raiz = local.split(/[.\-_+0-9]/)[0]
  return LOCAIS_GENERICOS.has(local) || LOCAIS_GENERICOS.has(raiz)
}

/** O email (ou o domínio inteiro, guardado como «@dominio») está na exclusão global? */
export function estaExcluido(email: string, exclusao: Iterable<string>): boolean {
  const e = normalizarEmail(email)
  const d = '@' + dominioDe(e)
  for (const x of exclusao) {
    const v = normalizarEmail(x)
    if (v === e || v === d) return true
  }
  return false
}

/** A decisão. A ORDEM É A REGRA: exclusão primeiro, depois sintaxe, webmail, pessoa colectiva, tipo. */
export function validarProspecto(c: CandidatoB2B, exclusao: Iterable<string> = []): Veredicto {
  const email = normalizarEmail(c.email)
  if (estaExcluido(email, exclusao)) return { ok: false, motivo: 'Na lista de exclusão global — nunca recebe.' }
  if (!SINTAXE.test(email)) return { ok: false, motivo: 'Email com forma inválida.' }
  if (eWebmailPessoal(email)) return { ok: false, motivo: `Webmail pessoal (${dominioDe(email)}): é de um particular, não B2B.` }
  if (c.pessoaColectiva !== true) return { ok: false, motivo: 'Pessoa colectiva por confirmar — o regime B2B só cobre empresas.' }
  const fonte = String(c.fonteUrl ?? '').trim()
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(fonte)) return { ok: false, motivo: 'Sem a URL pública onde o email está publicado.' }
  if (eGenerico(email)) return { ok: true, motivo: 'Caixa genérica de empresa, publicada.' }
  if (c.emailTipo === 'comercial_publicado') return { ok: true, motivo: 'Endereço profissional publicado pela empresa para contacto comercial.' }
  return { ok: false, motivo: 'Endereço nominal sem prova de ser o contacto comercial publicado — recusado.' }
}
