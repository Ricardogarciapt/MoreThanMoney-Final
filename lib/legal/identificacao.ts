/**
 * Quem está por trás do site, num só sítio.
 *
 * A lei do comércio electrónico (DL 7/2004, art. 10.º) obriga a mostrar nome, morada
 * geográfica, contacto e NIF do prestador de forma permanente e de fácil acesso. Os termos,
 * a privacidade e o aviso de risco lêem daqui, para nunca dizerem coisas diferentes.
 *
 * MORADA: por decisão do Ricardo (16/11/2026) a morada profissional não é publicada no site;
 * ele assumiu o risco de não cumprir à letra o art. 10.º. Fica vazia e as páginas não a mostram.
 */
export const IDENTIFICACAO = {
  marca: 'MoreThanMoney (MTM)',
  titular: 'Ricardo Garcia',
  forma: 'empresário em nome individual',
  nif: '241991439',
  morada: '',
  email: 'suporte@morethanmoney.pt',
  emailGeral: 'geral@morethanmoney.pt',
  site: 'https://www.morethanmoney.pt',
} as const

export const ULTIMA_ACTUALIZACAO_LEGAL = '16 de Novembro de 2026'

export function linhaIdentificacao(): string {
  const i = IDENTIFICACAO
  const morada = i.morada ? `${i.morada}, ` : ''
  return `${i.marca} é uma marca de ${i.titular}, ${i.forma}, NIF ${i.nif}, ${morada}Portugal. Contacto: ${i.email} · ${i.emailGeral}.`
}
