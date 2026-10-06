/**
 * O ENDEREÇO DE MARCAR UMA CHAMADA — escrito uma vez, em toda a casa.
 *
 * ═══ PORQUE É QUE ISTO É UM FICHEIRO ═══════════════════════════════════════════════════════
 *
 * Porque o anterior não era. O link do Calendly estava escrito à mão em sete sítios — dois
 * modelos de email, a jornada do Fast Start, o registo de emails do sistema, o painel de gestão, o
 * mapa de conteúdos e duas rotas de marketing — mais duas variáveis de ambiente com valores de
 * recurso diferentes uns dos outros (`https://calendly.com/morethanmoney`, sem o `pt`, que nem
 * sequer era o endereço certo).
 *
 * O resultado é o que se esperava: trocar de ferramenta obrigava a encontrar os sete, e quem
 * falhasse um mandava clientes a uma agenda que já não existe — sem erro nenhum a assinalá-lo, só
 * uma página de outra empresa a dizer que o link expirou.
 *
 * ═══ ABSOLUTO, E PORQUÊ ════════════════════════════════════════════════════════════════════
 *
 * Um caminho relativo (`/agendar`) funciona numa página e não funciona num email nem no Telegram,
 * que é precisamente onde este link mais viaja. Por isso é sempre absoluto, e a raiz sai do
 * ambiente para não haver um `localhost` a escapar para dentro de uma campanha.
 */

import { AG, linkAssinado } from '@/lib/agentes/codigos'

/** Os assuntos, como estão em `agenda_tipos.slug`. Existe para não se escrever o slug à mão. */
export type AssuntoDaChamada =
  | 'apresentacao'
  | 'onboarding'
  | 'copytrading'
  | 'parcerias'
  | 'corretora'
  | 'negocios'

/**
 * O link para marcar. Sem assunto, abre a lista toda; com assunto, salta o primeiro ecrã.
 *
 * Um slug que não exista NÃO dá erro: a página mostra a lista, que é o comportamento certo — é
 * melhor a pessoa escolher do que ver uma página de erro por causa de uma letra num email.
 *
 * SAI SEMPRE ASSINADO (06/10): marcar uma chamada é trabalho do AG-SETTER, e um link da agenda
 * sem `?ag=` era uma chamada que nunca se ligava a ninguém. Quem tem um dono mais certo (o post,
 * o lead que já trazia código) passa-o em `codigo`.
 */
export function linkAgendar(assunto?: AssuntoDaChamada, codigo: string = AG.SETTER): string {
  return linkAssinado(assunto ? `/agendar?t=${assunto}` : '/agendar', codigo)
}

/** O de onboarding, que é o que substitui o antigo link do Calendly nos emails de boas-vindas. */
export const LINK_AGENDAR_ONBOARDING = linkAgendar('onboarding')

/** A lista toda. É este que vai no Beacons e no botão «Agenda já». */
export const LINK_AGENDAR = linkAgendar()
