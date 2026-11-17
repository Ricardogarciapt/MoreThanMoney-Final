/**
 * LEAD INSTANTÂNEO — a parte pura (provada em `lead-instantaneo.check.ts`).
 *
 * Quem acabou de entrar no pipeline vindo de uma fonte quente recebe um aviso no Telegram do dono
 * em minutos, com o que se sabe, o sinal mais forte primeiro e um toque para abrir a conversa.
 * Não envia nada ao lead: avisa um humano. A primeira resposta continua a ser de uma pessoa.
 */
export type LeadNovo = {
  id: string
  nome: string
  origem: string
  interesse: string | null
  broker_uid: string | null
  telegram_username: string | null
  instagram_handle: string | null
  telefone: string | null
  idioma: string | null
  criado_em: string
}

/** Sinais reais, por ordem de força. Nada inventado: só o que a fonte deu. */
export function sinaisDoLead(l: LeadNovo): string[] {
  const s: string[] = []
  if (l.broker_uid) s.push('🔥 já tem conta na corretora')
  if (l.interesse) s.push(`interesse: ${l.interesse}`)
  if (l.telefone) s.push('tem telefone')
  if (l.idioma && !/^pt/i.test(l.idioma)) s.push(`fala ${l.idioma}`)
  return s
}

/** Onde se responde já, por ordem de rapidez. */
export function ligacaoDeResposta(l: LeadNovo): string | null {
  if (l.telegram_username) return `https://t.me/${l.telegram_username.replace(/^@/, '')}`
  if (l.instagram_handle) return `https://ig.me/m/${l.instagram_handle.replace(/^@/, '')}`
  const tel = (l.telefone ?? '').replace(/\D/g, '')
  if (tel.length >= 9) return `https://wa.me/${tel.length === 9 ? `351${tel}` : tel}`
  return null
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function mensagemDoAviso(l: LeadNovo, site: string, agora = new Date()): string {
  const min = Math.max(0, Math.round((agora.getTime() - Date.parse(l.criado_em)) / 60000))
  const sinais = sinaisDoLead(l)
  const resp = ligacaoDeResposta(l)
  return [
    `⚡ <b>Lead novo · ${esc(l.origem)}</b> (há ${min} min)`,
    `<b>${esc(l.nome)}</b>`,
    sinais.length ? sinais.map(esc).join(' · ') : 'sem sinais extra',
    '',
    'Responder nos primeiros 5 minutos é o que mais pesa na conversão.',
    resp ? `👉 <a href="${resp}">Responder agora</a>` : '',
    `📋 <a href="${site}/backoffice/pipeline/ficha/${l.id}">Ficha no CRM</a>`,
  ]
    .filter(Boolean)
    .join('\n')
}
