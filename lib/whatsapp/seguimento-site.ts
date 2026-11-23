/**
 * O SEGUIMENTO DE QUEM SAI DO WHATSAPP PARA O SITE (23/11/2026). PURO.
 *
 * Pedido do Ricardo: «não deves perder o lead no tempo quando ele vai para fases dentro do site».
 * A pessoa escolhe uma rota, recebe o link, vai ao site e cala-se. Antes ninguém voltava a falar
 * com ela. Agora há uma escada curta, sempre dentro das regras da Meta (`whatsapp-envio.ts`):
 *
 *   toque 1 (≥ 45 min calada, 30 min depois do clique, dentro da janela)
 *      clicou → «vi que já foste espreitar, ficou alguma dúvida?»  · não clicou → o link outra vez
 *      com botões: Tenho uma dúvida · Marcar conversa · Falar com pessoa
 *   toque 2 (20–23 h depois da última mensagem DELA, ainda dentro da janela)
 *      «não te quero encher de mensagens» + agenda — responder reabre a janela de 24 h
 *   toque 3 (janela fechada, ≥ 44 h depois do toque anterior)
 *      template aprovado `mtm_seguimento` (só PT; há opt-in porque tocou em «Sim, manda»)
 *   toque 4 (≥ 72 h depois) → FILA DOS SETTERS no pipeline, com o histórico do que abriu.
 *
 * Responder reinicia tudo (o closer IA põe followup_count a 0). Marcar na agenda, comprar, pedir
 * uma pessoa, «Agora não» ou SAIR param a escada. Só entre as 9h e as 21h de Lisboa.
 */
import type { Lingua } from './linguas'

export const ID_SEG_DUVIDA = 'seg_duvida'
export const ID_SEG_AGENDAR = 'seg_agendar'

export type Toque = 'clique' | 'lembrete' | 'ultima_janela' | 'template' | 'setter'

/** Fases em que o seguimento NÃO corre: ainda sem «Sim», pediu pessoa, disse «agora não», já marcou. */
export const FASES_FORA = ['wa_reencontro', 'wa_lingua_reencontro', 'wa_humano', 'wa_depois', 'wa_agendou', 'wa_saiu', 'tg_humano', 'tg_agendou'] as const

const MIN = 60_000
const H = 60 * MIN

export interface EstadoSeguimento {
  stage: string | null
  followupCount: number
  /** Última atividade no lead (updated_at): mensagem dela ou passo do funil. */
  ultimaAtividadeIso: string | null
  /** Última mensagem DELA (janela da Meta). */
  ultimaEntradaIso: string | null
  ultimoToqueIso: string | null
  clicouEmIso: string | null
  lingua: Lingua
  convertido: boolean
  saiu: boolean
  /** Hora local de Lisboa (0–23). */
  horaLisboa: number
  /** No Telegram não há template: depois da janela passa logo ao setter. */
  canal?: 'whatsapp' | 'telegram'
  agora: number
}

const t = (iso: string | null) => (iso ? Date.parse(iso) : NaN)
const passou = (iso: string | null, ms: number, agora: number) => {
  const v = t(iso)
  return Number.isFinite(v) && agora - v >= ms
}

/** Que toque sai agora (ou nenhum). */
export function proximoToque(e: EstadoSeguimento): Toque | null {
  if (e.convertido || e.saiu) return null
  if (e.stage && (FASES_FORA as readonly string[]).includes(e.stage)) return null
  if (e.followupCount >= 4) return null
  if (e.horaLisboa < 9 || e.horaLisboa >= 21) return null

  const entrada = t(e.ultimaEntradaIso)
  const dentroJanela = Number.isFinite(entrada) && e.agora - entrada < 23 * H
  const fc = e.followupCount

  if (fc === 0) {
    if (!dentroJanela) return null // nunca falou connosco nesta janela: não é seguimento, é abordagem
    if (!passou(e.ultimaAtividadeIso, 45 * MIN, e.agora)) return null
    if (e.clicouEmIso) return passou(e.clicouEmIso, 30 * MIN, e.agora) ? 'clique' : null
    return 'lembrete'
  }
  if (fc === 1 && dentroJanela) {
    return passou(e.ultimaEntradaIso, 20 * H, e.agora) && passou(e.ultimoToqueIso, 4 * H, e.agora) ? 'ultima_janela' : null
  }
  if ((fc === 1 || fc === 2) && !dentroJanela) {
    if (!passou(e.ultimoToqueIso, 44 * H, e.agora)) return null
    return e.lingua === 'pt' && e.canal !== 'telegram' ? 'template' : 'setter'
  }
  if (fc === 3) return passou(e.ultimoToqueIso, 72 * H, e.agora) ? 'setter' : null
  return null
}

/** followup_count depois de cada toque. */
export function contagemDepois(toque: Toque): number {
  return { clique: 1, lembrete: 1, ultima_janela: 2, template: 3, setter: 4 }[toque]
}

interface TextosSeguimento {
  clique: (n: string) => string
  lembrete: (n: string, link: string) => string
  ultima: (n: string, agenda: string) => string
  botaoDuvida: string
  botaoAgendar: string
  botaoPessoa: string
  respostaDuvida: string
  respostaAgendar: (agenda: string) => string
}

export const TEXTOS_SEGUIMENTO: Record<Lingua, TextosSeguimento> = {
  pt: {
    clique: (n) => `${n}, vi que já foste espreitar a página 👀\n\nFicou alguma dúvida? Respondo-te aqui mesmo, sem pressas.`,
    lembrete: (n, link) => `${n}, deixo-te aqui o link outra vez, para quando tiveres 2 minutos: ${link}\n\nSe preferires, explico-te tudo numa conversa rápida.`,
    ultima: (n, agenda) => `${n}, não te quero encher de mensagens 🙂\n\nSe quiseres continuar, é só responderes aqui. Ou marca uma conversa à hora que te der jeito: ${agenda}`,
    botaoDuvida: 'Tenho uma dúvida',
    botaoAgendar: 'Marcar conversa',
    botaoPessoa: 'Falar com pessoa',
    respostaDuvida: 'Diz-me 🙂 Qual é a dúvida?',
    respostaAgendar: (agenda) => `Boa! Escolhe a hora que te der jeito aqui: ${agenda}\n\nRecebes a confirmação por email e nós ficamos logo a saber.`,
  },
  en: {
    clique: (n) => `${n}, I saw you had a look at the page 👀\n\nAny questions? I'll answer right here, no rush.`,
    lembrete: (n, link) => `${n}, here's the link again for when you have 2 minutes: ${link}\n\nIf you prefer, I can walk you through it on a quick call.`,
    ultima: (n, agenda) => `${n}, I don't want to flood you with messages 🙂\n\nIf you'd like to continue, just reply here. Or book a call at a time that suits you: ${agenda}`,
    botaoDuvida: 'I have a question',
    botaoAgendar: 'Book a call',
    botaoPessoa: 'Talk to a person',
    respostaDuvida: 'Sure 🙂 What would you like to know?',
    respostaAgendar: (agenda) => `Great! Pick the time that suits you here: ${agenda}\n\nYou'll get a confirmation by email and we'll be notified straight away.`,
  },
  fr: {
    clique: (n) => `${n}, j'ai vu que tu as jeté un œil à la page 👀\n\nTu as une question ? Je te réponds ici, sans pression.`,
    lembrete: (n, link) => `${n}, je te remets le lien pour quand tu auras 2 minutes : ${link}\n\nSi tu préfères, je t'explique tout lors d'un appel rapide.`,
    ultima: (n, agenda) => `${n}, je ne veux pas te submerger de messages 🙂\n\nSi tu veux continuer, réponds simplement ici. Ou réserve un appel au moment qui t'arrange : ${agenda}`,
    botaoDuvida: "J'ai une question",
    botaoAgendar: 'Réserver un appel',
    botaoPessoa: 'Parler à quelqu’un',
    respostaDuvida: 'Dis-moi 🙂 Quelle est ta question ?',
    respostaAgendar: (agenda) => `Super ! Choisis l'heure qui te convient ici : ${agenda}\n\nTu recevras la confirmation par email et nous serons prévenus tout de suite.`,
  },
  de: {
    clique: (n) => `${n}, ich habe gesehen, dass du dir die Seite angeschaut hast 👀\n\nHast du eine Frage? Ich antworte dir gleich hier, ganz ohne Druck.`,
    lembrete: (n, link) => `${n}, hier nochmal der Link für wenn du 2 Minuten hast: ${link}\n\nWenn du willst, erkläre ich dir alles in einem kurzen Gespräch.`,
    ultima: (n, agenda) => `${n}, ich will dich nicht mit Nachrichten überhäufen 🙂\n\nWenn du weitermachen willst, antworte einfach hier. Oder buch dir einen Termin, wann es dir passt: ${agenda}`,
    botaoDuvida: 'Ich habe eine Frage',
    botaoAgendar: 'Termin buchen',
    botaoPessoa: 'Mit Person sprechen',
    respostaDuvida: 'Klar 🙂 Was möchtest du wissen?',
    respostaAgendar: (agenda) => `Super! Such dir hier die passende Zeit aus: ${agenda}\n\nDu bekommst die Bestätigung per E-Mail und wir sind sofort informiert.`,
  },
  es: {
    clique: (n) => `${n}, vi que ya echaste un vistazo a la página 👀\n\n¿Te quedó alguna duda? Te respondo aquí mismo, sin prisas.`,
    lembrete: (n, link) => `${n}, te dejo aquí el enlace otra vez para cuando tengas 2 minutos: ${link}\n\nSi prefieres, te lo explico todo en una llamada rápida.`,
    ultima: (n, agenda) => `${n}, no quiero llenarte de mensajes 🙂\n\nSi quieres seguir, solo responde aquí. O reserva una llamada a la hora que te venga bien: ${agenda}`,
    botaoDuvida: 'Tengo una duda',
    botaoAgendar: 'Reservar llamada',
    botaoPessoa: 'Hablar con alguien',
    respostaDuvida: 'Dime 🙂 ¿Cuál es tu duda?',
    respostaAgendar: (agenda) => `¡Genial! Elige la hora que te venga bien aquí: ${agenda}\n\nRecibirás la confirmación por email y nosotros nos enteramos al momento.`,
  },
}

/** Tema do template `mtm_seguimento` ({{2}}) por rota. */
export function temaDaRota(rota: string | null | undefined): string {
  switch (rota) {
    case 'educacao':
      return 'a formação MoreThanMoney'
    case 'corretora':
      return 'a rota da corretora'
    case 'funded':
      return 'o MTM Funded'
    case 'solucoes':
      return 'as soluções de IA para o teu negócio'
    default:
      return 'a MoreThanMoney'
  }
}

/** Rota a partir da fase/interesse guardados no lead. */
export function rotaDoLead(stage: string | null | undefined, interest: string | null | undefined): string | null {
  const m = /^wa_rota_(\w+)$/.exec(String(stage ?? ''))
  if (m) return m[1]
  const i = String(interest ?? '')
  return ['educacao', 'corretora', 'funded', 'solucoes', 'curioso'].includes(i) ? i : null
}

/** Hora de Lisboa (0–23) para um instante. */
export function horaDeLisboa(agora = Date.now()): number {
  const h = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Lisbon', hour: '2-digit', hour12: false }).format(new Date(agora))
  return Number(h) % 24
}
