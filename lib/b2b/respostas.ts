/**
 * AS RESPOSTAS DA PROSPEÇÃO B2B (17/11). Puro: sem rede, sem base de dados.   npx tsx lib/b2b/respostas.check.ts
 *
 * Até aqui, «respondeu» só existia se alguém marcasse à mão em /admin/sales-machine. A caixa de onde
 * saem os emails recebia as respostas e ninguém as cruzava com os prospectos, por isso o MTMOS
 * mostrava zero respostas mesmo quando as havia. Este módulo decide, mensagem a mensagem, o que
 * cada uma é. O cron `b2b-respostas` lê a caixa por IMAP e aplica a decisão.
 *
 * Quatro tipos, por esta ordem (a primeira que bate ganha):
 *  - devolvido: o servidor do destinatário recusou (mailer-daemon, «Undeliverable»…). O endereço
 *    sai da sequência para não insistirmos num email morto.
 *  - automatica: férias, ausência, «recebemos o seu pedido». Não é resposta; não mexe em nada.
 *  - saida: a pessoa pede para não voltar a receber. Exclusão global, como o link de saída.
 *  - resposta: tudo o resto que venha de um prospecto contactado. Sai da sequência e avisa o dono.
 */

export type TipoResposta = 'devolvido' | 'automatica' | 'saida' | 'resposta'

export interface MensagemRecebida {
  de: string
  assunto: string
  /** Primeiros ~4 KB do corpo em texto. Chega para decidir e não carrega anexos. */
  corpo: string
  /** Cabeçalhos relevantes, em minúsculas: auto-submitted, x-autoreply, precedence, x-autorespond. */
  cabecalhos?: Record<string, string>
}

export interface ProspectoContactado {
  id: string
  email: string
  empresa: string
  segmento: string
  estado: string
}

const DEVOLVIDO_DE = /^(mailer-daemon|postmaster|mail-daemon|bounce[s]?)@/i
const DEVOLVIDO_ASSUNTO =
  /(undeliver|delivery status notification|delivery has failed|mail delivery (failed|subsystem)|returned mail|failure notice|non remis|unzustellbar|non recapitat|não entregue|nao entregue|mensagem não entregue)/i

const AUTOMATICA_ASSUNTO =
  /(out of (the )?office|automatic reply|auto[- ]?reply|autoreply|away from|on vacation|réponse automatique|absence|abwesenheit|automatische antwort|risposta automatica|fuori ufficio|resposta autom[aá]tica|ausente|f[eé]rias|we('ve| have) received your (message|email|request)|ticket (#|received)|thank you for contacting)/i

const SAIDA_CORPO =
  /(unsubscribe|remove me|take me off|stop (emailing|sending)|not interested,? (please )?(remove|stop)|n[aã]o (quero|pretendo) receber|remov(a|e)-me|retir(a|e)-me|deixem de (enviar|contactar)|d[eé]sinscri|ne plus (recevoir|m'envoyer)|abmelden|keine (weiteren )?e-?mails|cancellami|non (voglio|desidero) ricevere)/i

/** Webmail genérico: o domínio não identifica a empresa, por isso não serve para cruzar. */
const WEBMAIL = /@(gmail|googlemail|hotmail|outlook|live|msn|yahoo|icloud|me|aol|proton|protonmail|gmx|web|sapo|uol|bol|terra)\./i

export function enderecoDe(cabecalhoDe: string): string {
  const s = String(cabecalhoDe ?? '')
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim().toLowerCase()
}

export function dominioDe(email: string): string {
  return String(email ?? '').trim().toLowerCase().split('@')[1] ?? ''
}

/** Só o que a pessoa escreveu: corta a citação do nosso email («On … wrote:», linhas com «>»). */
export function semCitacao(corpo: string): string {
  const linhas = String(corpo ?? '').split(/\r?\n/)
  const out: string[] = []
  for (const l of linhas) {
    if (/^\s*>/.test(l)) break
    if (/^\s*(on .+ wrote:|em .+ escreveu:|le .+ a écrit\s*:|am .+ schrieb .+:|il .+ ha scritto:|-{2,}\s*original message|de:\s.+@)/i.test(l)) break
    out.push(l)
  }
  return out.join('\n').trim()
}

export function classificar(m: MensagemRecebida): TipoResposta {
  const de = enderecoDe(m.de)
  const assunto = String(m.assunto ?? '')
  if (DEVOLVIDO_DE.test(de) || DEVOLVIDO_ASSUNTO.test(assunto)) return 'devolvido'
  const h = m.cabecalhos ?? {}
  const auto = String(h['auto-submitted'] ?? '').toLowerCase()
  if ((auto && auto !== 'no') || h['x-autoreply'] || h['x-autorespond'] || /^(auto_reply|bulk|junk)$/i.test(String(h['precedence'] ?? ''))) {
    return 'automatica'
  }
  if (AUTOMATICA_ASSUNTO.test(assunto)) return 'automatica'
  if (SAIDA_CORPO.test(semCitacao(m.corpo)) || /^\s*(unsubscribe|remove|stop|sair|remover)\s*$/i.test(assunto)) return 'saida'
  return 'resposta'
}

/**
 * A que prospecto pertence a mensagem. Primeiro o endereço exacto; depois o domínio da empresa (a
 * resposta vem muitas vezes de uma pessoa, não do geral@). Nunca cruza por domínio de webmail.
 * Num devolvido, o remetente é o servidor: procura-se o endereço do prospecto dentro do corpo.
 */
export function cruzar(m: MensagemRecebida, tipo: TipoResposta, prospectos: ProspectoContactado[]): ProspectoContactado | null {
  if (tipo === 'devolvido') {
    const corpo = String(m.corpo ?? '').toLowerCase()
    return prospectos.find((p) => p.email && corpo.includes(p.email.toLowerCase())) ?? null
  }
  const de = enderecoDe(m.de)
  const exacto = prospectos.find((p) => p.email.toLowerCase() === de)
  if (exacto) return exacto
  if (WEBMAIL.test(de)) return null
  const dom = dominioDe(de)
  if (!dom) return null
  const doDominio = prospectos.filter((p) => dominioDe(p.email) === dom)
  return doDominio.length === 1 ? doDominio[0] : null
}

export interface Accao {
  prospectoId: string
  email: string
  empresa: string
  tipo: Exclude<TipoResposta, 'automatica'>
}

/** Decide o que fazer com um lote. Ignora automáticas e o que não é de ninguém; um prospecto, uma acção. */
export function decidirAccoes(mensagens: MensagemRecebida[], prospectos: ProspectoContactado[]): Accao[] {
  const peso: Record<Accao['tipo'], number> = { saida: 3, resposta: 2, devolvido: 1 }
  const porId = new Map<string, Accao>()
  for (const m of mensagens) {
    const tipo = classificar(m)
    if (tipo === 'automatica') continue
    const p = cruzar(m, tipo, prospectos)
    if (!p) continue
    // Já tratado: quem respondeu ou saiu não volta a contar.
    if (['respondeu', 'reuniao', 'fechado', 'excluido'].includes(p.estado)) continue
    const a: Accao = { prospectoId: p.id, email: p.email, empresa: p.empresa, tipo }
    const ant = porId.get(p.id)
    if (!ant || peso[tipo] > peso[ant.tipo]) porId.set(p.id, a)
  }
  return [...porId.values()]
}

/** O resumo semanal que vai para o dono e para o MTMOS. Só contagens reais, nada estimado. */
export interface ResumoSemanal {
  semana_inicio: string
  enviados: number
  respostas: number
  saidas: number
  devolvidos: number
  taxa_resposta_pct: number | null
  por_lingua: Record<string, { enviados: number; respostas: number }>
  quem_respondeu: { empresa: string; segmento: string; pais: string }[]
}

export function textoResumo(r: ResumoSemanal): string {
  const linguas = Object.entries(r.por_lingua)
    .filter(([, v]) => v.enviados > 0 || v.respostas > 0)
    .map(([k, v]) => `${k} ${v.respostas}/${v.enviados}`)
    .join(' · ')
  const quem = r.quem_respondeu.slice(0, 8).map((q) => `• ${q.empresa} (${q.segmento}, ${q.pais})`).join('\n')
  return [
    `📊 B2B, semana de ${r.semana_inicio}`,
    `Enviados ${r.enviados} · respostas ${r.respostas}${r.taxa_resposta_pct != null ? ` (${r.taxa_resposta_pct}%)` : ''} · saídas ${r.saidas} · devolvidos ${r.devolvidos}`,
    linguas ? `Por língua (respostas/enviados): ${linguas}` : '',
    quem ? `Quem respondeu:\n${quem}` : 'Ainda sem respostas esta semana.',
  ]
    .filter(Boolean)
    .join('\n')
}
