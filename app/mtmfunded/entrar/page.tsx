import Entrada from './entrada'

export const metadata = { title: 'Entrar' }

/**
 * A porta de entrada do MTM Funded — a dele, não a do site.
 *
 * O `/register` do morethanmoney.pt encaminha para a venda de packs da MTM. Mandar para lá
 * quem vem comprar uma avaliação é oferecer-lhe outro produto no meio de uma decisão, e
 * dizer-lhe que as duas coisas são a mesma empresa quando o resto do site diz que não são.
 *
 * A conta criada aqui é a MESMA conta MoreThanMoney, na mesma base de dados: quem já for
 * cliente entra com o que tem. O que muda é o papel com que nasce quem chega de novo.
 */
export default function EntrarFunded({
  searchParams,
}: {
  searchParams: Promise<{ redirect?: string }>
}) {
  return <Entrada searchParams={searchParams} />
}
