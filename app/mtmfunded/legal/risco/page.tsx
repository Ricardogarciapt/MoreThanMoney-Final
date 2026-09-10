import { PaginaLegal, Seccao, Lista } from '@/components/mtmfunded/pagina-legal'

export const metadata = { title: 'Aviso de Risco' }

/**
 * O documento mais importante dos quatro, e o único que diz o que o produto NÃO é.
 *
 * Escrito para ser entendido à primeira leitura. Um aviso de risco que ninguém percebe não
 * avisa ninguém — cumpre a formalidade e falha o objectivo.
 */
export default function AvisoDeRisco() {
  return (
    <PaginaLegal titulo="Aviso de Risco" atualizado="10 de Setembro de 2026">
      <Seccao titulo="As contas são simuladas">
        <p>
          Todas as contas emitidas pelo MTM Funded — de torneio e de avaliação — são contas de
          demonstração, com dinheiro virtual. As ordens são executadas contra os preços de
          mercado numa plataforma de simulação e <b className="text-zinc-200">não chegam a nenhum
          mercado real</b>. Nenhum participante deposita fundos numa conta de negociação nossa,
          e o MTM Funded não detém, não movimenta nem gere dinheiro de participantes.
        </p>
        <p>
          O que se compra num programa de avaliação é o acesso à avaliação e ao acompanhamento
          que vem com ela — não um investimento, nem uma participação em lucros de mercado.
        </p>
      </Seccao>

      <Seccao titulo="O que o MTM Funded não é">
        <Lista
          itens={[
            <>Não é uma corretora nem um intermediário financeiro, e não está registado como tal em nenhuma autoridade de supervisão.</>,
            <>Não é uma empresa de investimento, nem gere carteiras por conta de terceiros.</>,
            <>Não presta aconselhamento financeiro, de investimento, fiscal ou jurídico. Nada nestas páginas, nas sessões, nos sinais ou no apoio deve ser tomado como recomendação de compra ou venda.</>,
            <>Não promete rendimento, emprego, nem colocação garantida numa conta financiada.</>,
          ]}
        />
      </Seccao>

      <Seccao titulo="Resultados simulados têm limites conhecidos">
        <p>
          Uma conta de demonstração não reproduz tudo o que acontece numa conta real:
          derrapagem, recusas de execução, alargamento de spread em momentos de notícias e a
          pressão de estar a arriscar dinheiro próprio comportam-se de forma diferente. Um
          resultado obtido em simulação — nosso ou de um participante — não indica o que
          aconteceria com capital real.
        </p>
        <p>
          Quando publicarmos números, eles referem-se a contas simuladas e são medidos em
          percentagem e em pips. Resultados passados não garantem resultados futuros.
        </p>
      </Seccao>

      <Seccao titulo="Prémios e contas financiadas">
        <p>
          Os prémios de cada torneio e as condições de acesso a uma conta financiada estão
          publicados na página do respectivo torneio ou programa, antes das inscrições
          abrirem. São essas as regras que valem.
        </p>
        <p>
          A atribuição depende do cumprimento dessas regras e da verificação da identidade do
          participante. Reservamo-nos o direito de anular resultados obtidos por exploração de
          falhas da plataforma, negociação coordenada entre contas, uso de contas em nome de
          terceiros ou qualquer conduta que contorne as regras publicadas — casos em que a
          conta é congelada e o participante é informado do motivo.
        </p>
      </Seccao>

      <Seccao titulo="Negociar envolve risco">
        <p>
          A negociação em mercados financeiros — forex, metais, índices, cripto — envolve risco
          elevado de perda e não é adequada a toda a gente. Aquilo que se aprende e se prova
          numa conta simulada não elimina esse risco quando se passa a capital real. Nunca
          arrisque dinheiro de que precise.
        </p>
      </Seccao>

      <Seccao titulo="Dúvidas">
        <p>
          Qualquer questão sobre este aviso:{' '}
          <a href="mailto:funded@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
            funded@morethanmoney.pt
          </a>
          .
        </p>
      </Seccao>
    </PaginaLegal>
  )
}
