/**
 * Os países e os seus indicativos, para o formulário da conta.
 *
 * O INDICATIVO é o que interessa, e não o nome. A lista de países do MetaTrader está ordenada
 * por indicativo e a combo é editável: escrever «Portugal» lá dentro escreve mesmo a palavra
 * e não escolhe país nenhum — o número fica recusado com «Mobile phone required» e ninguém
 * percebe porquê. Escreve-se «+351», que salta para a entrada certa.
 *
 * A lista é curta de propósito: os países de onde vêm os participantes, e não as 200 entradas
 * do mundo inteiro. Uma lista onde não se encontra o próprio país faz-se acrescentar; uma
 * lista de 200 faz-se rolar sempre.
 */
export interface Pais {
  nome: string
  codigo: string
  indicativo: string
}

export const PAISES: Pais[] = [
  { nome: 'Portugal', codigo: 'PT', indicativo: '+351' },
  { nome: 'Brasil', codigo: 'BR', indicativo: '+55' },
  { nome: 'Espanha', codigo: 'ES', indicativo: '+34' },
  { nome: 'França', codigo: 'FR', indicativo: '+33' },
  { nome: 'Reino Unido', codigo: 'GB', indicativo: '+44' },
  { nome: 'Alemanha', codigo: 'DE', indicativo: '+49' },
  { nome: 'Suíça', codigo: 'CH', indicativo: '+41' },
  { nome: 'Luxemburgo', codigo: 'LU', indicativo: '+352' },
  { nome: 'Bélgica', codigo: 'BE', indicativo: '+32' },
  { nome: 'Países Baixos', codigo: 'NL', indicativo: '+31' },
  { nome: 'Irlanda', codigo: 'IE', indicativo: '+353' },
  { nome: 'Itália', codigo: 'IT', indicativo: '+39' },
  { nome: 'Angola', codigo: 'AO', indicativo: '+244' },
  { nome: 'Moçambique', codigo: 'MZ', indicativo: '+258' },
  { nome: 'Cabo Verde', codigo: 'CV', indicativo: '+238' },
  { nome: 'Estados Unidos', codigo: 'US', indicativo: '+1' },
  { nome: 'Canadá', codigo: 'CA', indicativo: '+1' },
  { nome: 'Emirados Árabes Unidos', codigo: 'AE', indicativo: '+971' },
  { nome: 'Andorra', codigo: 'AD', indicativo: '+376' },
]

export function indicativoDe(codigo: string): string {
  return PAISES.find((p) => p.codigo === codigo)?.indicativo ?? '+351'
}

export function paisValido(codigo: string): boolean {
  return PAISES.some((p) => p.codigo === codigo)
}
