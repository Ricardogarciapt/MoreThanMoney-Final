import Link from 'next/link'
import { PaginaLegal, Seccao, Lista } from '@/components/mtmfunded/pagina-legal'

export const metadata = { title: 'Termos e Condições' }

export default function Termos() {
  return (
    <PaginaLegal titulo="Termos e Condições" atualizado="17 de Setembro de 2026">
      <Seccao titulo="Quem somos e o que estes termos cobrem">
        <p>
          O MTM Funded é um serviço de avaliação de traders operado pela MoreThanMoney, em
          Portugal. Estes termos aplicam-se a tudo o que existe em <code className="text-zinc-300">/mtmfunded</code>:
          os torneios, os programas de avaliação, as contas emitidas e o painel do participante.
        </p>
        <p>
          O MTM Funded é um negócio distinto do site de educação morethanmoney.pt. Ser cliente
          de um não dá direitos no outro, e as condições de cada um valem por si.
        </p>
      </Seccao>

      <Seccao titulo="Quem se pode inscrever">
        <Lista
          itens={[
            <>Ter 18 anos ou mais.</>,
            <>Inscrever-se em nome próprio, com dados verdadeiros. Uma pessoa, uma inscrição por torneio ou programa.</>,
            <>Não residir em jurisdição onde a participação lhe seja vedada.</>,
          ]}
        />
        <p>
          Os dados pedidos na inscrição — nome, telemóvel e data de nascimento — são os que a
          corretora exige para emitir a conta de demonstração. Dados falsos invalidam a
          inscrição e qualquer prémio associado.
        </p>
      </Seccao>

      <Seccao titulo="As contas">
        <p>
          As contas de torneio e de avaliação são de demonstração, com dinheiro virtual. A conta
          Funded é negociação de capital patrocinado MTM, nos termos do contrato de trader
          financiado e do Aviso de Risco. As contas são emitidas em nome do participante junto do
          fornecedor da plataforma, e as credenciais são enviadas por email. A password é definida pelo nosso
          sistema no momento da emissão e pode ser alterada pelo participante na plataforma.
        </p>
        <p>
          A emissão não é instantânea: as contas são criadas uma a uma. O participante é
          informado quando a sua estiver pronta. Uma conta é pessoal e intransmissível — quem a
          negocia tem de ser quem se inscreveu.
        </p>
      </Seccao>

      <Seccao titulo="As regras de negociação">
        <p>
          Cada torneio e cada programa tem as suas regras publicadas antes de abrir: perda
          diária máxima, perda máxima total, dias mínimos de negociação e limite de
          concentração de lucro num só dia. Tudo é medido sobre <b className="text-zinc-200">equity</b>,
          o que significa que as posições abertas contam.
        </p>
        <p>
          Quebrar uma regra congela a conta na posição em que estava, e o motivo fica visível no
          painel do participante. A conta não é reaberta: o participante pode entrar no torneio
          ou programa seguinte.
        </p>
      </Seccao>

      <Seccao titulo="Conduta">
        <p>São motivo de desqualificação, com a conta congelada e o participante informado:</p>
        <Lista
          itens={[
            <>Explorar falhas de preço, de execução ou de latência da plataforma.</>,
            <>Coordenar posições opostas entre contas para garantir que uma delas passa.</>,
            <>Negociar a conta de outra pessoa, ou entregar a sua a terceiros.</>,
            <>Usar automatismos proibidos nas regras do programa em causa.</>,
          ]}
        />
      </Seccao>

      <Seccao titulo="Prémios e contas financiadas">
        <p>
          Os prémios estão publicados na página de cada torneio. A atribuição depende do
          cumprimento das regras e da confirmação da identidade do vencedor. Os prémios em
          dinheiro são pagos por transferência, após essa confirmação.
        </p>
        <p>
          Impostos e obrigações declarativas sobre prémios recebidos são da responsabilidade de
          quem os recebe.
        </p>
      </Seccao>

      <Seccao titulo="Pagamentos">
        <p>
          Os torneios são gratuitos. Os programas de avaliação são pagos, com o preço indicado
          na página do programa, e processados pela Stripe — não guardamos dados de cartão. As
          condições de reembolso estão em{' '}
          <Link href="/mtmfunded/legal/reembolsos" className="text-[#D2A63C] hover:underline">
            Reembolsos
          </Link>
          .
        </p>
      </Seccao>

      <Seccao titulo="Suspensão do serviço">
        <p>
          Podemos suspender ou encerrar um torneio ou programa por razões técnicas ou legais. Se
          isso acontecer com um programa pago em curso, o valor é devolvido proporcionalmente ao
          que não chegou a ser prestado.
        </p>
      </Seccao>

      <Seccao titulo="Limitação de responsabilidade">
        <p>
          O serviço é prestado tal como está. Não respondemos por indisponibilidades da
          plataforma de negociação, do fornecedor de preços ou da corretora, nem por decisões de
          negociação tomadas por participantes. Nada nestes termos exclui responsabilidade que a
          lei não permita excluir.
        </p>
      </Seccao>

      <Seccao titulo="Lei aplicável">
        <p>
          Aplica-se a lei portuguesa. Enquanto consumidor, o participante mantém o direito de
          recorrer aos meios de resolução alternativa de litígios de consumo previstos na lei.
        </p>
      </Seccao>

      <Seccao titulo="Alterações e contacto">
        <p>
          Alterações a estes termos são publicadas nesta página com nova data. As regras de um
          torneio ou programa já a decorrer não mudam a meio.{' '}
          <a href="mailto:funded@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
            funded@morethanmoney.pt
          </a>
        </p>
      </Seccao>
    </PaginaLegal>
  )
}
