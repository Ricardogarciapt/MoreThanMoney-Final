/**
 * Recrutamento no Threads (23/11/2026). Puro: textos e regras, sem rede nem base.
 *
 * Os posts não prometem rendimento (Master Framework): ganha-se pelo que se vende e fica registado.
 * Quem responde a um post de recrutamento recebe UMA resposta pública com o link da candidatura
 * e entra no CRM como candidato (etiquetas recruta + candidato_equipa + threads).
 */
export const SITE = 'https://www.morethanmoney.pt'
export const LINK_CANDIDATURA = `${SITE}/work`
export const LINK_ENTREVISTA = `${SITE}/agendar?t=entrevista-equipa`

export const POSTS_RECRUTAMENTO: string[] = [
  `Estou a contratar setters e closers. 100% remoto.\n\nLeads quentes do Instagram, WhatsApp e Telegram, formação interna e comissão em cada venda fechada (setter 10%, closer 20–30%).\n\nSem promessas de rendimento: ganhas pelo que vendes, e tudo fica registado no teu painel.\n\nComenta «EU» ou candidata-te: ${LINK_CANDIDATURA}`,
  `Procuro 3 pessoas que gostem de conversar com gente e de fechar.\n\nSetter: qualifica e marca chamadas. Closer: apresenta e fecha. Tudo remoto, com guiões e as nossas ferramentas.\n\nNão precisas de experiência em trading. Precisas de disciplina.\n\nResponde aqui com «EU» e eu digo-te como funciona.`,
  `Já foste comercial e estás farto de horários fixos?\n\nNa MoreThanMoney a equipa comercial trabalha remoto, com leads nossas e comissão por venda (+5% nas renovações).\n\nEntrevista de 30 min por Google Meet: ${LINK_ENTREVISTA}`,
]

/** O post desta semana (roda pela lista). */
export function postDaSemana(agora = new Date()): string {
  const semana = Math.floor(agora.getTime() / (7 * 86_400_000))
  return POSTS_RECRUTAMENTO[semana % POSTS_RECRUTAMENTO.length]
}

/** Publica outra vez só depois de `dias` desde o último post de recrutamento. */
export function devePublicar(ultimo: string | null | undefined, agora = new Date(), dias = 3.5): boolean {
  if (!ultimo) return true
  return agora.getTime() - new Date(ultimo).getTime() >= dias * 86_400_000
}

/** Resposta pública a quem mostrou interesse. Curta, sem etiquetas de IA. */
export function respostaAoInteressado(username?: string): string {
  const quem = username ? `@${username}` : 'Obrigado'
  return `${quem}, obrigado! Deixa a tua candidatura aqui (2 min): ${LINK_CANDIDATURA}\nDepois marcamos 30 min por Google Meet: ${LINK_ENTREVISTA}`
}

/** Respostas que não são interesse (o próprio Ricardo, vazias). */
export function ehInteressado(texto: string | undefined, username: string | undefined, dono: string | undefined): boolean {
  if (!username || (dono && username.toLowerCase() === dono.toLowerCase())) return false
  return (texto ?? '').trim().length > 0
}
