/**
 * Prospeção ativa no Threads (23/11/2026, pedido do Ricardo): procurar pessoas que encaixam no
 * perfil (futuros setters/closers e futuros alunos), puxar conversa em público, levar ao passo
 * seguinte e aprender com as métricas o que pega. Puro: regras e limites, sem rede nem base.
 *
 * Escreve-se como o Ricardo, sem etiquetas de IA (regra da casa), mas sem mentir: se alguém
 * perguntar diretamente se é um bot, a resposta diz que é a equipa do Ricardo e que ele lê tudo.
 */
export type Perfil = 'recruta' | 'cliente'

export const PALAVRAS: { q: string; perfil: Perfil }[] = [
  { q: 'trabalho remoto vendas', perfil: 'recruta' },
  { q: 'procuro trabalho remoto', perfil: 'recruta' },
  { q: 'closer de vendas', perfil: 'recruta' },
  { q: 'setter vendas', perfil: 'recruta' },
  { q: 'trabalhar à comissão', perfil: 'recruta' },
  { q: 'comercial cansado horário', perfil: 'recruta' },
  { q: 'aprender trading', perfil: 'cliente' },
  { q: 'trading iniciante', perfil: 'cliente' },
  { q: 'forex iniciante', perfil: 'cliente' },
  { q: 'liberdade financeira', perfil: 'cliente' },
  { q: 'investir em ouro', perfil: 'cliente' },
  { q: 'sair do 9 às 5', perfil: 'cliente' },
]

/** Roda pelas palavras: duas por ciclo, alternando perfis. */
export function palavrasDoCiclo(agora = new Date(), n = 2): { q: string; perfil: Perfil }[] {
  const i = Math.floor(agora.getTime() / (2 * 3_600_000))
  return Array.from({ length: n }, (_, k) => PALAVRAS[(i * n + k) % PALAVRAS.length])
}

export const TECTO_DIA = 20
export const TECTO_CICLO = 4
export const MAX_TURNOS = 4

export type EstadoProspecao = {
  dia?: string
  feitas_hoje?: number
  vistos?: string[]
  conversas?: Conversa[]
}
export type Conversa = {
  username: string
  perfil: Perfil
  /** id da nossa última resposta (é aí que a pessoa responde). */
  nosso_id: string
  turnos: number
  historico: { quem: 'eles' | 'nos'; texto: string }[]
  atualizado: string
}

export function quotaRestante(est: EstadoProspecao, agora = new Date()): number {
  const dia = agora.toISOString().slice(0, 10)
  const feitas = est.dia === dia ? est.feitas_hoje ?? 0 : 0
  return Math.max(0, TECTO_DIA - feitas)
}

export function contarFeita(est: EstadoProspecao, agora = new Date()): void {
  const dia = agora.toISOString().slice(0, 10)
  if (est.dia !== dia) {
    est.dia = dia
    est.feitas_hoje = 0
  }
  est.feitas_hoje = (est.feitas_hoje ?? 0) + 1
}

const SPAM = /(giveaway|airdrop|sorteio|link na bio|dm me|send me|pump|\bonlyfans\b|casino|aposta)/i
const PT = /\b(não|que|para|estou|quero|preciso|alguém|trabalho|você|tu|é|são|também|muito|mais)\b|[ãõçáéíóúâêô]/i

/** Um post merece resposta? Não é nosso, não foi visto, é recente, tem substância, parece PT, não é spam. */
export function postValido(
  p: { id: string; text?: string; username?: string; timestamp?: string },
  dono: string | undefined,
  vistos: Set<string>,
  agora = new Date(),
): boolean {
  if (!p.username || vistos.has(p.id) || vistos.has(`u:${p.username.toLowerCase()}`)) return false
  if (dono && p.username.toLowerCase() === dono.toLowerCase()) return false
  const t = (p.text ?? '').trim()
  if (t.length < 20 || SPAM.test(t) || !PT.test(t)) return false
  if (p.timestamp && agora.getTime() - new Date(p.timestamp).getTime() > 72 * 3_600_000) return false
  return true
}

const PROIBIDO = /(garant|lucro certo|rendimento fixo|ganhos? de \d|sem risco|\bia\b|intelig[êe]ncia artificial|chatgpt|como assistente)/i

/** Limpa o que a IA escreveu; devolve null se não serve para publicar. */
export function limparResposta(txt: string | undefined | null): string | null {
  let t = (txt ?? '').replace(/#[\p{L}\d_]+/gu, '').trim().replace(/^["«“]+|["»”]+$/g, '').trim()
  if (t.length < 8 || PROIBIDO.test(t)) return null
  if (t.length > 480) t = t.slice(0, 477).replace(/\s+\S*$/, '') + '…'
  return t
}
