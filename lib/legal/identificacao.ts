/**
 * Quem está por trás do site, num só sítio.
 *
 * A lei do comércio electrónico (DL 7/2004, art. 10.º) obriga a mostrar nome, morada
 * geográfica, contacto e NIF do prestador de forma permanente e de fácil acesso. Os termos,
 * a privacidade e o aviso de risco lêem daqui, para nunca dizerem coisas diferentes.
 *
 * MORADA: tem de ser preenchida pelo Ricardo antes de publicar. Enquanto estiver vazia, as
 * páginas mostram «morada disponível a pedido por email», que NÃO cumpre o art. 10.º.
 */
export const IDENTIFICACAO = {
  marca: 'MoreThanMoney (MTM)',
  titular: 'Ricardo Garcia',
  forma: 'empresário em nome individual',
  nif: '241991439',
  morada: '',
  email: 'support@morethanmoney.pt',
  site: 'https://www.morethanmoney.pt',
} as const

export const ULTIMA_ACTUALIZACAO_LEGAL = '16 de Novembro de 2026'

export function linhaIdentificacao(): string {
  const i = IDENTIFICACAO
  const morada = i.morada || 'morada disponível a pedido por email'
  return `${i.marca} é uma marca de ${i.titular}, ${i.forma}, NIF ${i.nif}, ${morada}, Portugal.`
}
