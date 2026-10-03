/**
 * O CRM DE WHATSAPP — as decisões, sem base de dados e sem rede.
 *
 * ═══ O QUE ESTE FICHEIRO DECIDE ════════════════════════════════════════════════════════════
 *
 * Três coisas, e todas elas erram em silêncio se estiverem mal:
 *
 *  · **se a janela das 24 horas está aberta.** É a regra da Meta e é o que separa «posso escrever
 *    o que quiser» de «só passa um template aprovado». Errar para o lado permissivo faz a mensagem
 *    ser recusada pela Meta; errar para o lado restritivo faz quem trabalha leads não responder a
 *    alguém que estava à espera. As duas custam, e nenhuma dá erro no ecrã;
 *  · **por que ordem se trabalha o dia.** Uma lista por ordem de chegada põe em cima a conversa
 *    mais recente, que não é a mais urgente. A mais urgente é a que tem gente à espera e a janela
 *    a fechar;
 *  · **que transições de estado fazem sentido.** Uma conversa «perdida» que salta para «ganho» sem
 *    passar por lado nenhum é quase sempre um clique errado.
 *
 * Puro porque um erro aqui não rebenta: dá uma lista pela ordem errada, ou um botão que envia o que
 * não devia. Assim `crm.check.ts` consegue provar tudo sem um único número de telefone real.
 */

/** A janela de atendimento da Meta. Não é configurável porque não é nossa. */
export const JANELA_MS = 24 * 60 * 60 * 1000

/** Quando se começa a avisar que a janela está a fechar. */
export const AVISO_MS = 4 * 60 * 60 * 1000

export type EstadoConversa = 'novo' | 'a_falar' | 'a_aguardar' | 'ganho' | 'perdido' | 'silenciado'

export interface Conversa {
  telefone: string
  nome?: string | null
  estado: EstadoConversa
  ultima_entrada?: string | null
  ultima_saida?: string | null
  por_responder?: number | null
  responsavel?: string | null
  negocio_id?: string | null
}

export interface Janela {
  aberta: boolean
  /** Milissegundos até fechar. Zero ou menos quando já fechou. */
  restaMs: number
  /** «faltam 3 h 20 m», «fechada há 2 dias» — o que se escreve no ecrã. */
  texto: string
  /** A fechar dentro de `AVISO_MS`: é o que merece atenção antes do resto. */
  aFechar: boolean
}

function humanizar(ms: number): string {
  const min = Math.floor(ms / 60_000)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return min % 60 ? `${h} h ${min % 60} min` : `${h} h`
  return `${Math.floor(h / 24)} dia${Math.floor(h / 24) === 1 ? '' : 's'}`
}

/**
 * A janela desta conversa.
 *
 * Conta-se da ÚLTIMA ENTRADA — a última vez que ELA escreveu. Não da nossa resposta: responder não
 * estica a janela, e um CRM que conte a partir da nossa saída diz «aberta» quando a Meta já a
 * fechou. É o erro que se descobre com uma mensagem recusada e um cliente sem resposta.
 */
export function janelaDe(conversa: Conversa, agora: Date = new Date()): Janela {
  const t = conversa.ultima_entrada ? new Date(conversa.ultima_entrada).getTime() : NaN
  if (!Number.isFinite(t)) {
    return { aberta: false, restaMs: 0, texto: 'nunca escreveu', aFechar: false }
  }
  const resta = t + JANELA_MS - agora.getTime()
  if (resta <= 0) return { aberta: false, restaMs: 0, texto: `fechada há ${humanizar(-resta)}`, aFechar: false }
  return { aberta: true, restaMs: resta, texto: `faltam ${humanizar(resta)}`, aFechar: resta <= AVISO_MS }
}

/**
 * A ORDEM DO DIA.
 *
 * Quem trabalha leads abre esta lista de manhã e trabalha de cima para baixo. A ordem é, por esta
 * sequência:
 *
 *  1. **tem gente à espera E a janela a fechar** — é a única combinação que se perde por esperar;
 *  2. **tem gente à espera** — alguém escreveu e ninguém respondeu;
 *  3. **janela aberta** — dá para falar sem template, e isso acaba;
 *  4. o resto, pelo mais recente.
 *
 * As silenciadas, as ganhas e as perdidas vão para o fim, sempre: já não é trabalho de hoje.
 */
export function prioridade(c: Conversa, agora: Date = new Date()): number {
  if (c.estado === 'silenciado' || c.estado === 'ganho' || c.estado === 'perdido') return 0
  const j = janelaDe(c, agora)
  const esperam = Math.max(0, Number(c.por_responder ?? 0))
  if (esperam > 0 && j.aFechar) return 1000 + Math.min(esperam, 99)
  if (esperam > 0) return 500 + Math.min(esperam, 99)
  if (j.aberta) return 100
  return 10
}

export function ordenarConversas<T extends Conversa>(lista: T[], agora: Date = new Date()): T[] {
  return [...lista].sort((a, b) => {
    const d = prioridade(b, agora) - prioridade(a, agora)
    if (d !== 0) return d
    const ta = a.ultima_entrada ? Date.parse(a.ultima_entrada) : 0
    const tb = b.ultima_entrada ? Date.parse(b.ultima_entrada) : 0
    return tb - ta
  })
}

/**
 * O QUE SE PODE ESCREVER A ESTA PESSOA, AGORA.
 *
 * Devolve a decisão E o motivo em português — o motivo é para aparecer no ecrã, não só nos
 * registos. Um botão desligado sem explicação ensina quem o usa a desconfiar da ferramenta.
 *
 * NÃO substitui `lib/whatsapp-envio.ts::decidirEnvio`, que é quem manda no envio de verdade e
 * conhece também o consentimento. Isto é o que o ECRÃ mostra antes de alguém escrever — e mostra-o
 * com a mesma regra da janela, para não haver um botão que convida a escrever o que vai ser
 * recusado.
 */
export function oQuePodeEscrever(c: Conversa, agora: Date = new Date()): {
  textoLivre: boolean
  template: boolean
  porque: string
} {
  if (c.estado === 'silenciado') {
    return { textoLivre: false, template: false, porque: 'Conversa silenciada — ninguém lhe escreve até ser reaberta.' }
  }
  const j = janelaDe(c, agora)
  if (j.aberta) {
    return { textoLivre: true, template: true, porque: `Janela aberta — ${j.texto}. Podes escrever à vontade.` }
  }
  return {
    textoLivre: false,
    template: true,
    porque: c.ultima_entrada
      ? `Janela ${j.texto}. Só passa um template aprovado.`
      : 'Esta pessoa nunca nos escreveu. Só passa um template aprovado, e só com consentimento.',
  }
}

/**
 * As transições de estado que fazem sentido.
 *
 * Não é burocracia: a lista existe para apanhar o clique errado. De «perdido» só se volta a
 * «a_falar» — porque reabrir um perdido é uma conversa nova, não uma vitória que apareceu do nada.
 */
const TRANSICOES: Record<EstadoConversa, EstadoConversa[]> = {
  novo: ['a_falar', 'a_aguardar', 'perdido', 'silenciado'],
  a_falar: ['a_aguardar', 'ganho', 'perdido', 'silenciado'],
  a_aguardar: ['a_falar', 'ganho', 'perdido', 'silenciado'],
  ganho: ['a_falar', 'silenciado'],
  perdido: ['a_falar', 'silenciado'],
  silenciado: ['a_falar', 'novo'],
}

export function podeMudarPara(de: EstadoConversa, para: EstadoConversa): boolean {
  if (de === para) return true
  return (TRANSICOES[de] ?? []).includes(para)
}

export const ROTULO_ESTADO: Record<EstadoConversa, string> = {
  novo: 'Novo',
  a_falar: 'A falar',
  a_aguardar: 'À espera dela',
  ganho: 'Ganho',
  perdido: 'Perdido',
  silenciado: 'Silenciado',
}
