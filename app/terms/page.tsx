import type { Metadata } from 'next'
import Link from 'next/link'
import { PaginaLegal, Seccao, Lista, F } from '@/components/legal/pagina-legal'
import { IDENTIFICACAO, ULTIMA_ACTUALIZACAO_LEGAL } from '@/lib/legal/identificacao'

export const metadata: Metadata = {
  title: 'Termos e Condições | MoreThanMoney',
  description: 'Termos e condições de utilização e de compra dos produtos digitais MoreThanMoney.',
}

/**
 * Termos e Condições do morethanmoney.pt — regime de infoproduto (conteúdos e ferramentas
 * digitais vendidos a consumidores), ENI em Portugal.
 *
 * Base: DL 7/2004 (comércio electrónico), DL 24/2014 (contratos à distância, livre resolução),
 * DL 84/2021 (conformidade de conteúdos e serviços digitais), Lei 144/2015 (RAL),
 * DL 156/2005 (Livro de Reclamações electrónico), Reg. (UE) 2024/1689 art. 50.º (IA).
 * Orientação geral preparada sem advogado — ver o resumo de diferenças no thread jurídico.
 *
 * MTM Funded tem termos próprios em /mtmfunded/legal e não é tratado aqui.
 */
export default function TermosPage() {
  const i = IDENTIFICACAO
  return (
    <PaginaLegal titulo="Termos e Condições" atualizado={ULTIMA_ACTUALIZACAO_LEGAL}>
      <Seccao titulo="1. Quem somos">
        <p>
          O site {i.site.replace('https://', '')}, as apps MTM System e MTM Auto e os produtos
          vendidos com a marca {i.marca} são disponibilizados por <F>{i.titular}</F>, {i.forma},
          NIF {i.nif}{i.morada ? `, com domicílio profissional em ${i.morada}` : ''}, Portugal.
          Contacto: <a href={`mailto:${i.email}`} className="text-[#D2A63C]">{i.email}</a>.
        </p>
        <p>
          Ao criar conta ou comprar um produto aceitas estes termos. Se não concordares, não
          utilizes o serviço. Tens de ter pelo menos 18 anos.
        </p>
      </Seccao>

      <Seccao titulo="2. O que vendemos — e o que não somos">
        <p>
          A MoreThanMoney é um projecto de <F>educação financeira</F>. Vendemos infoprodutos e
          ferramentas digitais:
        </p>
        <Lista itens={[
          'Cursos, bootcamps, aulas e materiais educativos sobre mercados, gestão de risco e mentalidade.',
          'Planos de subscrição (Membro, Premium e outros indicados na página de preços) com acesso a conteúdos, comunidade, ideias de mercado com fins educativos e ferramentas da plataforma.',
          'Licenças de indicadores (scanners) para TradingView e de Expert Advisors (EAs) para MetaTrader 5.',
          'Ferramentas de automatização que o próprio utilizador liga à sua conta de corretora (por exemplo, MTM Auto e Tap to Trade).',
          'Assistentes de inteligência artificial (como o Mentor AI) para apoio ao estudo.',
        ]} />
        <p>A MoreThanMoney <F>não</F> é:</p>
        <Lista itens={[
          'uma corretora, um banco, nem uma empresa de investimento, e não está registada como tal na CMVM nem noutra autoridade de supervisão;',
          'consultora financeira: nada do que publicamos (aulas, ideias de mercado, sinais, alertas, respostas do apoio ou da IA) é uma recomendação personalizada para comprares ou venderes um instrumento financeiro;',
          'gestora de carteiras ou de patrimónios: não recebemos, não guardamos e não movimentamos o teu dinheiro. O dinheiro que negoceias fica sempre numa conta em teu nome, numa corretora escolhida por ti.',
        ]} />
        <p>
          Todas as decisões de investimento são tuas e da tua responsabilidade. Lê o{' '}
          <Link href="/aviso-de-risco" className="text-[#D2A63C]">Aviso de Risco</Link> antes de
          usar qualquer conteúdo ou ferramenta.
        </p>
      </Seccao>

      <Seccao titulo="3. Corretoras recomendadas e a nossa relação com elas">
        <p>
          Recomendamos corretoras com quem trabalhamos como <F>Introducing Broker (IB)</F> e em
          quem confiamos. Quando abres conta através de um link nosso, a corretora paga-nos uma
          comissão em função do volume que negoceias. Essa comissão é paga pela corretora; não é
          um valor que nós te cobremos. Dizemos-te isto porque é um <F>interesse nosso</F> que
          deves conhecer ao avaliar as nossas recomendações.
        </p>
        <p>
          Em alguns planos, ter uma conta financiada numa corretora parceira desbloqueia acesso a
          conteúdos pagos (por exemplo, o Premium). Esse acesso dura enquanto a conta se mantiver
          financiada nas condições indicadas na página do plano.
        </p>
        <p>
          A tua relação contratual com a corretora é directa e rege-se pelos termos dela. Antes de
          abrires conta, confirma quem é a entidade que te presta o serviço, onde está autorizada e
          que protecções tens. Não somos responsáveis pela actividade, solvência ou execução de
          ordens da corretora.
        </p>
      </Seccao>

      <Seccao titulo="4. Conta de utilizador">
        <p>
          És responsável pelos teus dados de acesso e pelo que for feito na tua conta. A conta é
          pessoal: não a partilhes nem revendas o acesso. Podemos suspender contas usadas para
          partilha de acessos, revenda, cópia de conteúdos ou comportamento abusivo na comunidade.
        </p>
      </Seccao>

      <Seccao titulo="5. Preços, pagamento e subscrições">
        <Lista itens={[
          'Os preços estão na página de cada produto, em euros, e incluem os impostos aplicáveis quando devidos. Os pagamentos são processados pela Stripe.',
          'As subscrições (mensais ou anuais) renovam-se automaticamente no fim de cada período, ao preço em vigor, até as cancelares. Cancelas a qualquer momento na área de cliente ou por email; o acesso mantém-se até ao fim do período já pago.',
          'Períodos de experiência: quando existirem, a duração e as condições estão indicadas na oferta. No fim da experiência só és cobrado se confirmares o pagamento.',
          'Se alterarmos o preço de uma subscrição, avisamos-te por email com pelo menos 30 dias de antecedência; a alteração aplica-se na renovação seguinte e podes cancelar antes dela.',
          'Licenças semestrais terminam no fim do período; licenças vitalícias valem enquanto o produto for mantido pela MoreThanMoney (ver ponto 7).',
        ]} />
      </Seccao>

      <Seccao id="livre-resolucao" titulo="6. Direito de livre resolução e reembolsos">
        <p>
          Se és consumidor, tens <F>14 dias</F> para desistir de uma compra feita à distância, sem
          justificação, enviando um pedido para{' '}
          <a href={`mailto:${i.email}`} className="text-[#D2A63C]">{i.email}</a>. Devolvemos o
          valor no prazo de 14 dias, pelo mesmo meio de pagamento.
        </p>
        <p>
          <F>Conteúdo digital com acesso imediato</F> (cursos, downloads, licenças de scanners ou
          EAs): se pedires acesso imediato e confirmares no checkout que sabes que, ao começar o
          acesso, perdes o direito de livre resolução, esse direito deixa de existir a partir do
          momento em que o acesso começa (art. 17.º, n.º 1, al. m) do DL 24/2014).
        </p>
        <p>
          <F>Subscrições de serviço</F>: se pedires para começar já e depois desistires dentro dos
          14 dias, pagas apenas a parte proporcional ao tempo utilizado.
        </p>
        <p>
          Fora destes casos, pedidos de reembolso são analisados um a um. Escreve-nos e respondemos
          em até 10 dias úteis.
        </p>
      </Seccao>

      <Seccao titulo="7. Licenças de scanners, EAs e ferramentas">
        <Lista itens={[
          'Cada licença é pessoal, não exclusiva e intransmissível: um scanner para um utilizador TradingView; um EA para uma conta MetaTrader 5, salvo indicação diferente na página do produto.',
          'Não podes copiar, descompilar, revender, sublicenciar, partilhar ou publicar o código, as configurações ou os sinais gerados.',
          'Os scanners funcionam dentro do TradingView e os EAs dentro do MetaTrader 5. Alterações, falhas ou regras desses fornecedores podem afectar o funcionamento; nesse caso fazemos o razoável para adaptar o produto.',
          'Se descontinuarmos um produto vitalício, avisamos com pelo menos 90 dias de antecedência e mantemos o acesso a uma versão funcional ou oferecemos um produto equivalente.',
          'Tens direito a que o conteúdo ou serviço digital esteja conforme o que foi anunciado (DL 84/2021). Se não estiver, reportas-nos e corrigimos, substituímos ou reembolsamos.',
        ]} />
      </Seccao>

      <Seccao titulo="8. Ferramentas de execução automática (MTM Auto, Tap to Trade)">
        <Lista itens={[
          'Só funcionam numa conta de corretora em teu nome, que tu próprio ligas. Podes desligar a ligação a qualquer momento.',
          'És tu quem escolhe a estratégia, o risco por operação, o tamanho das posições e os limites. Antes de ligar uma conta real, recomendamos testar em conta de demonstração.',
          'A execução depende de terceiros (corretora, servidores de ligação, internet). Pode haver atrasos, derrapagem, ordens recusadas ou operações não copiadas. Não garantimos que cada ordem seja executada igual à de referência.',
          'Resultados passados de qualquer estratégia não garantem resultados futuros.',
        ]} />
      </Seccao>

      <Seccao titulo="9. Inteligência artificial">
        <p>
          Algumas respostas no site, nas apps e nas mensagens (Instagram, WhatsApp, Telegram) são
          geradas por <F>inteligência artificial</F>. Sempre que estiveres a falar com um
          assistente de IA, isso é-te indicado. As respostas de IA podem conter erros, são de
          carácter educativo e não substituem a tua própria análise. Podes pedir para falar com
          uma pessoa.
        </p>
      </Seccao>

      <Seccao titulo="10. Propriedade intelectual">
        <p>
          Textos, vídeos, aulas, marcas, logótipos, scanners, EAs e software são da MoreThanMoney
          ou de quem nos licenciou. A compra dá-te uma licença de uso pessoal, não a propriedade.
          Gravar, redistribuir ou revender conteúdos é proibido.
        </p>
      </Seccao>

      <Seccao titulo="11. Responsabilidade">
        <p>
          Fazemos o possível para que o serviço esteja disponível e correcto, mas pode haver
          interrupções e erros. Não respondemos por perdas de trading ou de investimento, que
          resultam das tuas decisões e do risco de mercado. Nada nestes termos limita direitos que
          a lei te garanta como consumidor, nem a nossa responsabilidade por dolo ou culpa grave.
        </p>
      </Seccao>

      <Seccao titulo="12. Alterações a estes termos">
        <p>
          Podemos actualizar estes termos. Alterações relevantes são comunicadas por email ou na
          plataforma com pelo menos 30 dias de antecedência e aplicam-se às renovações seguintes.
          As compras já feitas regem-se pelos termos em vigor à data da compra.
        </p>
      </Seccao>

      <Seccao titulo="13. Reclamações e resolução de litígios">
        <p>
          Podes reclamar para <a href={`mailto:${i.email}`} className="text-[#D2A63C]">{i.email}</a>{' '}
          ou no <a href="https://www.livroreclamacoes.pt" target="_blank" rel="noopener noreferrer" className="text-[#D2A63C]">Livro de Reclamações Electrónico</a>.
        </p>
        <p>
          Em caso de litígio de consumo, podes recorrer a uma entidade de resolução alternativa de
          litígios, como o <F>CNIACC — Centro Nacional de Informação e Arbitragem de Conflitos de
          Consumo</F> (<a href="https://www.cniacc.pt" target="_blank" rel="noopener noreferrer" className="text-[#D2A63C]">www.cniacc.pt</a>).
          Mais informação no Portal do Consumidor (<a href="https://www.consumidor.gov.pt" target="_blank" rel="noopener noreferrer" className="text-[#D2A63C]">www.consumidor.gov.pt</a>).
        </p>
        <p>
          Estes termos regem-se pela lei portuguesa. Se fores consumidor noutro país da União
          Europeia, mantens as protecções obrigatórias da lei do teu país.
        </p>
      </Seccao>
    </PaginaLegal>
  )
}
