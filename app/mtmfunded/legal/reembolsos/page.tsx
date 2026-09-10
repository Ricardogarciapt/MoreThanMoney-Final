import { PaginaLegal, Seccao, Lista } from '@/components/mtmfunded/pagina-legal'

export const metadata = { title: 'Política de Reembolsos' }

/**
 * Escrito para ser cumprido, não para ser invocado.
 *
 * A regra difícil é a do direito de livre resolução: em serviços digitais começados de
 * imediato, ele extingue-se — e a lei obriga a dizê-lo ANTES da compra, não depois. Por isso
 * está aqui em vez de estar escondido numa cláusula de termos gerais.
 */
export default function Reembolsos() {
  return (
    <PaginaLegal titulo="Política de Reembolsos" atualizado="10 de Setembro de 2026">
      <Seccao titulo="Torneios">
        <p>Os torneios são gratuitos. Não há nada a reembolsar.</p>
      </Seccao>

      <Seccao titulo="Programas de avaliação: 14 dias, enquanto não começar">
        <p>
          Enquanto consumidor, tem 14 dias para desistir da compra de um programa de avaliação,
          sem indicar motivo — desde que <b className="text-zinc-200">a conta ainda não tenha sido
          emitida</b> e não tenha começado a negociar.
        </p>
        <p>
          Pedindo a emissão imediata da conta, está a pedir que o serviço comece antes do fim
          desses 14 dias, e com isso o direito de livre resolução extingue-se assim que a conta
          é emitida. É a lei dos serviços digitais, e dizemo-lo aqui, antes da compra, porque é
          quando faz diferença.
        </p>
      </Seccao>

      <Seccao titulo="Reembolsamos sempre nestes casos">
        <Lista
          itens={[
            <>Cobrança duplicada, ou valor diferente do anunciado.</>,
            <>Conta que não chega a ser emitida por causa nossa.</>,
            <>Programa cancelado por nós antes de começar — devolução integral. Cancelado a meio — devolução da parte não prestada.</>,
            <>Regras alteradas por nós a meio de uma avaliação já paga, se não aceitar as novas.</>,
          ]}
        />
      </Seccao>

      <Seccao titulo="Não reembolsamos">
        <Lista
          itens={[
            <>Conta quebrada por incumprimento das regras publicadas. É esse o objecto da avaliação: perder faz parte.</>,
            <>Desqualificação por conduta descrita nos Termos.</>,
            <>Desistência depois de a conta estar emitida e a negociação começada.</>,
            <>Resultados abaixo do esperado.</>,
          ]}
        />
      </Seccao>

      <Seccao titulo="Como pedir">
        <p>
          Escreva para{' '}
          <a href="mailto:funded@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
            funded@morethanmoney.pt
          </a>{' '}
          com o email da compra. Respondemos em dias úteis. Aprovado o reembolso, o valor é
          devolvido pelo mesmo meio de pagamento — o prazo até estar disponível depende do banco
          ou do emissor do cartão.
        </p>
      </Seccao>
    </PaginaLegal>
  )
}
