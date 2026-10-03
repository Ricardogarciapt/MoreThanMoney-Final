/**
 * QUANDO É QUE UM TORNEIO AINDA ACEITA GENTE.
 *
 * Até aqui a resposta era o ESTADO: só se entrava enquanto `estado === 'inscricoes'`, e começar
 * o torneio fechava a porta. Faz sentido por omissão — quem entra a meio compete com menos dias
 * do que os outros —, mas amarrava duas decisões que são separadas: «o torneio já arrancou?» e
 * «ainda se pode entrar?».
 *
 * No primeiro torneio elas divergem de propósito. Arranca a 15 de Setembro e as inscrições ficam
 * abertas até 15 de Outubro (decisão do Ricardo, 2026-09-12): é a primeira edição, e vale mais
 * ter gente lá dentro do que ter todos a começar no mesmo minuto.
 *
 * Por isso quem manda é a DATA. `inscricoes_fecham_em` é a porta; o estado diz apenas em que
 * ponto o torneio vai. Um torneio `a_decorrer` com a data por vencer continua a aceitar
 * inscrições, e é isso que «entrar a meio» quer dizer.
 *
 * Vive num módulo próprio porque a pergunta é feita em cinco sítios — a rota de inscrição, o
 * painel do participante, a página do torneio, a página inicial e as FAQ. Com a regra copiada,
 * bastava mudá-la num para os outros passarem a mentir: o botão a dizer «inscrever» numa página
 * e a rota a responder «as inscrições não estão abertas» na outra.
 */

export interface TorneioComPorta {
  estado?: string | null
  publicado?: boolean | null
  inscricoes_fecham_em?: string | null
}

/** Estados em que já não se entra, aconteça o que acontecer à data. */
const FECHADOS = new Set(['draft', 'terminado', 'cancelado'])

export function inscricoesAbertas(t: TorneioComPorta | null | undefined): boolean {
  if (!t || t.publicado === false) return false
  if (FECHADOS.has(String(t.estado ?? ''))) return false

  // Sem data marcada, manda o estado — o comportamento de sempre, para os torneios que não
  // querem gente a entrar depois de arrancar.
  if (!t.inscricoes_fecham_em) return t.estado === 'inscricoes'

  return new Date(t.inscricoes_fecham_em) > new Date()
}

/** O torneio já arrancou? Serve para o texto mudar — «começa» ou «já vai a meio». */
export function jaArrancou(t: { comeca_em?: string | null } | null | undefined): boolean {
  if (!t?.comeca_em) return false
  return new Date(t.comeca_em) <= new Date()
}
