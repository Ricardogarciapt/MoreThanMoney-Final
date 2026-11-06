/**
 * CARROSSEL DIÁRIO — o contrato de um carrossel de entrega de valor.
 *
 * Dois perfis, cada um com a sua marca (pedido do Ricardo, 06/11/2026):
 *   · ricardo — @ricardogarciapt, preto e branco, uma linha em teal e uma linha grande em branco,
 *               fotografia do Ricardo (real ou gerada por IA a partir das fotos dele);
 *   · mtm     — @morethanmoney.pt, ouro sobre carvão, a rodar pelas áreas da casa.
 *
 * A primeira lâmina é a capa e a última o fecho. As do meio entregam UMA ideia cada.
 */
export type Perfil = 'ricardo' | 'mtm'

export type Lamina = {
  /** Linha pequena, na cor da marca (teal no Ricardo, ouro na MTM). */
  linha: string
  /** A linha grande, em branco, CAIXA ALTA. */
  titulo: string
  /** Texto de apoio (vazio na capa). */
  corpo?: string
}

export type Carrossel = {
  /** Único e estável: é o que impede o mesmo carrossel de sair duas vezes. */
  id: string
  perfil: Perfil
  /** Área/tema (para rodar e para o relatório). */
  area: string
  laminas: Lamina[]
  /** Só MTM: palavra que o funil do Instagram apanha nos comentários. */
  palavraChave?: string
  /** Legenda completa, já com CTA e aviso educativo. */
  legenda: string
}

export const ARROBA: Record<Perfil, string> = { ricardo: '@ricardogarciapt', mtm: '@morethanmoney.pt' }
export const IG_ID: Record<Perfil, string> = { ricardo: '17841405656956716', mtm: '17841474872672009' }
export const CRIADO_POR: Record<Perfil, string> = { ricardo: 'carrossel-diario:ricardo', mtm: 'carrossel-diario:mtm' }
