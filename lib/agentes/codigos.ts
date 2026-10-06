/**
 * OS CÓDIGOS DOS AGENTES QUE ASSINAM OS LINKS DA MÁQUINA — num só sítio.
 *
 * ═══ PORQUE É QUE ISTO EXISTE (06/10) ══════════════════════════════════════════════════════
 *
 * A medição contava ZERO usos de `?ag=` e os sete agentes estavam todos «em_risco» por isso: não
 * por falta de trabalho, por falta de links assinados. A regra passou a ser: TODO o link que a
 * máquina gera sai com o código do agente dono. Quando o dono certo é herdado (o post comentado,
 * o lead que já trazia código), herda-se; quando não há herança, o link sai com o agente do
 * CANAL — nunca sem nada.
 *
 * Os códigos AG-PROSPECTOR/AG-SETTER/AG-CLOSER/AG-SOCIAL/AG-EMAIL são criados em
 * `agentes_equipa` por uma migração paralela. Estão aqui como constantes para ninguém os escrever
 * à mão: um `AG-SOCAIL` escrito num ficheiro passa a forma (`pareceCodigoDeAgente`) e credita um
 * agente que não existe, sem erro em sítio nenhum.
 */
import { linkDoAgente, normalizar, PARAMETRO } from './atribuicao'

export const AG = Object.freeze({
  /** Encontra pessoas (radar, comentários) — o topo do funil. */
  PROSPECTOR: 'AG-PROSPECTOR',
  /** Marca chamadas: tudo o que leva à agenda (`linkAgendar`). */
  SETTER: 'AG-SETTER',
  /** Fecha nas DMs do Instagram. */
  CLOSER: 'AG-CLOSER',
  /** Publicações e respostas automáticas no Instagram quando o post não tem outro dono. */
  SOCIAL: 'AG-SOCIAL',
  /** Emails da máquina (recuperação de checkout). */
  EMAIL: 'AG-EMAIL',
  /** O bot do Telegram (funil de leads) — vendas de formação. */
  FORMACAO: 'AG-FORMACAO',
  /** App/teste — já existente, dono do follow-up de reactivação no Telegram. */
  SAAS: 'AG-SAAS',
} as const)

export type CodigoAgente = (typeof AG)[keyof typeof AG]

const RAIZ = (process.env.NEXT_PUBLIC_SITE_URL || 'https://www.morethanmoney.pt').replace(/\/$/, '')

/** Link absoluto do site já assinado por um agente. */
export function linkAssinado(caminho: string, codigo: CodigoAgente | string): string {
  return linkDoAgente(RAIZ, caminho, codigo)
}

/** O link leva um `?ag=` válido? É a pergunta da guarda: um link da máquina sem isto não mede. */
export function linkTemAg(url: string): boolean {
  try {
    const u = new URL(url)
    return normalizar(u.searchParams.get(PARAMETRO)) !== null
  } catch {
    return false
  }
}
