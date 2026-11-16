import type { Metadata } from 'next'
import Link from 'next/link'
import { PaginaLegal, Seccao, Lista, F } from '@/components/legal/pagina-legal'
import { ULTIMA_ACTUALIZACAO_LEGAL } from '@/lib/legal/identificacao'

export const metadata: Metadata = {
  title: 'Aviso de Risco | MoreThanMoney',
  description: 'Os riscos de negociar Forex, CFDs, índices e criptoativos, e o que a MoreThanMoney é e não é.',
}

/**
 * Aviso de Risco do site principal. Escrito para ser percebido à primeira leitura.
 * O MTM Funded tem aviso próprio em /mtmfunded/legal/risco.
 */
export default function AvisoDeRiscoPage() {
  return (
    <PaginaLegal titulo="Aviso de Risco" atualizado={ULTIMA_ACTUALIZACAO_LEGAL}>
      <Seccao titulo="Em resumo">
        <p className="rounded-lg border border-[#D2A63C]/40 bg-[#D2A63C]/5 p-4 text-zinc-200">
          Negociar Forex, CFDs, ouro, índices e criptoativos tem <b>risco elevado</b> e pode
          levar à perda de todo o dinheiro que depositas. Só negocies dinheiro que possas perder.
          O nosso conteúdo é educativo e <b>não constitui consultoria financeira</b>.
        </p>
      </Seccao>

      <Seccao titulo="Alavancagem e CFDs">
        <p>
          Os CFDs e o Forex com alavancagem amplificam ganhos e perdas: um movimento pequeno do
          mercado pode consumir grande parte da conta. A maioria das contas de investidores não
          profissionais perde dinheiro a negociar CFDs. Cada corretora é obrigada a publicar a
          percentagem real das suas contas que perde dinheiro — consulta-a antes de abrir conta.
        </p>
      </Seccao>

      <Seccao titulo="Criptoativos">
        <p>
          Os criptoativos são muito voláteis, podem perder todo o valor e, em regra, não estão
          cobertos por fundos de garantia de depósitos ou de investidores.
        </p>
      </Seccao>

      <Seccao titulo="Ideias de mercado, sinais e scanners">
        <Lista itens={[
          'São publicados para toda a comunidade, com fins educativos. Não têm em conta a tua situação financeira, objectivos ou tolerância ao risco, e por isso não são recomendações personalizadas.',
          'Os resultados que mostramos são medidos em pips ou pontos, com origem identificada. Não são promessa nem previsão de resultados futuros.',
          'Resultados em conta de demonstração ou em simulação não reproduzem tudo o que acontece numa conta real (derrapagem, spreads, recusas de ordens, pressão emocional).',
          'Um scanner ou indicador é uma ferramenta de análise. Pode dar sinais errados e não substitui a gestão de risco.',
        ]} />
      </Seccao>

      <Seccao titulo="Execução automática">
        <p>
          Ferramentas que copiam operações para a tua conta (como o MTM Auto ou o Tap to Trade)
          dependem da corretora, de servidores de ligação e da internet. Pode haver atrasos,
          diferenças de preço, operações não copiadas ou fechadas de forma diferente da
          referência. Tu escolhes o risco e podes desligar a ferramenta a qualquer momento.
        </p>
      </Seccao>

      <Seccao titulo="Conflito de interesses">
        <p>
          Somos <F>Introducing Broker</F> de corretoras que recomendamos e recebemos delas uma
          comissão em função do volume negociado pelos clientes que abrem conta pelo nosso link.
          Isto significa que temos interesse em que abras conta e negocies nessas corretoras.
          Avalia as nossas recomendações sabendo disto, e compara sempre com outras opções.
        </p>
      </Seccao>

      <Seccao titulo="Antes de abrires conta numa corretora">
        <Lista itens={[
          'Confirma qual é a entidade que te presta o serviço e em que país está autorizada.',
          <>Consulta os alertas e as listas de entidades autorizadas da CMVM em{' '}
            <a href="https://www.cmvm.pt" target="_blank" rel="noopener noreferrer" className="text-[#D2A63C]">www.cmvm.pt</a>.</>,
          'Lê o documento de informação fundamental (KID) e as condições de custos da corretora.',
        ]} />
      </Seccao>

      <Seccao titulo="O que a MoreThanMoney não é">
        <p>
          Não somos corretora, empresa de investimento, consultora financeira nem gestora de
          carteiras. Não recebemos nem movimentamos o teu dinheiro. Ver os{' '}
          <Link href="/terms" className="text-[#D2A63C]">Termos e Condições</Link>.
        </p>
      </Seccao>
    </PaginaLegal>
  )
}
