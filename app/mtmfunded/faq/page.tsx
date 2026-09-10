import Link from 'next/link'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'
import { getMtmFundedConfig } from '@/lib/mtmfunded/config'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Perguntas Frequentes' }

/**
 * A FAQ do MTM Funded — só dele, e com as respostas lidas da BASE DE DADOS onde faz sentido.
 *
 * As regras e as datas do torneio saem da linha do torneio, não de texto escrito à mão: uma
 * FAQ que diz «perda diária de 5%» enquanto o admin já mudou a regra para 4% é pior do que
 * não ter FAQ nenhuma — parece informação e é desinformação.
 */
export default async function FaqFunded() {
  const config = await getMtmFundedConfig()
  const { data: torneio } = await getSupabaseAdmin()
    .from('mtm_tournaments')
    .select('nome, estado, comeca_em, acaba_em, saldo_inicial, regras, premios, inscricoes_fecham_em')
    .eq('publicado', true)
    .order('comeca_em', { ascending: false })
    .limit(1)
    .maybeSingle()

  const r = (torneio?.regras ?? {}) as Record<string, number>
  const data = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString('pt-PT', { day: '2-digit', month: 'long', year: 'numeric' }) : null

  const perguntas: Array<{ p: string; resposta: React.ReactNode }> = [
    {
      p: 'O dinheiro das contas é real?',
      resposta: (
        <>
          Não. Todas as contas do MTM Funded — de torneio e de avaliação — são contas de
          demonstração, com dinheiro virtual. As ordens não chegam a nenhum mercado real e
          ninguém deposita fundos numa conta nossa. O que se avalia é a forma como negoceia.
        </>
      ),
    },
    {
      p: 'Quanto custa participar no torneio?',
      resposta: <>Nada. Os torneios são gratuitos, com conta emitida por nós.</>,
    },
    torneio
      ? {
          p: 'Quando começa o próximo torneio?',
          resposta: (
            <>
              O {torneio.nome} decorre de {data(torneio.comeca_em)} a {data(torneio.acaba_em)}, com
              conta de {Number(torneio.saldo_inicial).toLocaleString('pt-PT')} USD.{' '}
              {torneio.estado === 'inscricoes'
                ? `As inscrições estão abertas${data(torneio.inscricoes_fecham_em) ? ` até ${data(torneio.inscricoes_fecham_em)}` : ''}.`
                : torneio.estado === 'a_decorrer'
                  ? 'As inscrições estão fechadas — o próximo é trimestral.'
                  : 'As inscrições abrem em breve.'}
            </>
          ),
        }
      : {
          p: 'Quando é o próximo torneio?',
          resposta: <>Os torneios são trimestrais. Assim que o próximo abrir, aparece nesta página e na página do torneio.</>,
        },
    {
      p: 'Como me inscrevo?',
      resposta: (
        <>
          Entra na{' '}
          <Link href="/mtmfunded/tradingtournament/dashboard" className="text-[#D2A63C] hover:underline">
            tua área
          </Link>{' '}
          e preenche a inscrição. Pedimos o nome que queres na classificação, o telemóvel e a
          data de nascimento — as duas últimas porque a corretora as exige para emitir a conta.
        </>
      ),
    },
    {
      p: 'Quanto tempo demora a receber a conta?',
      resposta: (
        <>
          Não é imediato. As contas são criadas uma a uma no MetaTrader e as credenciais seguem
          por email assim que cada uma estiver pronta. Enquanto isso, o painel mostra a conta
          como «a emitir».
        </>
      ),
    },
    torneio
      ? {
          p: 'Quais são as regras?',
          resposta: (
            <>
              Tudo medido sobre equity — as posições abertas contam:
              <ul className="mt-2 ml-4 list-disc space-y-1">
                {r.perda_diaria_pct != null && <li>Perda diária máxima: {r.perda_diaria_pct}%</li>}
                {r.perda_maxima_pct != null && <li>Perda máxima total: {r.perda_maxima_pct}%</li>}
                {r.dias_minimos != null && <li>Dias mínimos de negociação: {r.dias_minimos}</li>}
                {r.consistencia_pct != null && <li>Nenhum dia acima de {r.consistencia_pct}% do lucro total</li>}
              </ul>
            </>
          ),
        }
      : null,
    {
      p: 'O que acontece se quebrar uma regra?',
      resposta: (
        <>
          A conta congela na posição em que estava e o motivo fica à vista no teu painel. A
          conta não é reaberta — entras no torneio seguinte. Não há penalização nenhuma além
          disso.
        </>
      ),
    },
    {
      p: 'Porque é que a minha posição não conta?',
      resposta: (
        <>
          A classificação mostra o motivo ao lado de cada participante. Normalmente é por ainda
          não teres os dias mínimos de negociação, ou por concentração — um único dia a
          representar demasiado do lucro total. Ambos se resolvem continuando a negociar.
        </>
      ),
    },
    {
      p: 'Com que frequência actualiza a classificação?',
      resposta: <>De hora a hora. A hora da última leitura está no fundo da tabela.</>,
    },
    {
      p: 'O meu email fica público?',
      resposta: (
        <>
          Não. A tabela mostra-o censurado, e a censura é feita no servidor — o email completo
          nunca chega ao browser de quem consulta a classificação.
        </>
      ),
    },
    {
      p: 'Posso usar robôs ou copiar sinais?',
      resposta: (
        <>
          As regras de cada programa dizem o que é permitido. O que é sempre motivo de
          desqualificação está nos{' '}
          <Link href="/mtmfunded/legal/termos" className="text-[#D2A63C] hover:underline">
            Termos
          </Link>
          : explorar falhas da plataforma, coordenar posições opostas entre contas e negociar a
          conta de outra pessoa.
        </>
      ),
    },
    {
      p: 'Recebo certificado?',
      resposta: (
        <>
          Sim. Os certificados são emitidos no fim de cada torneio, ficam na tua área e cada um
          tem um código que qualquer pessoa pode verificar.
        </>
      ),
    },
    config.ativo
      ? {
          p: 'Qual é a diferença entre o torneio e um programa de avaliação?',
          resposta: (
            <>
              O torneio é gratuito, trimestral e competitivo: vale a tua posição face aos
              outros. Um programa de avaliação é pago, individual e sem prazo de competição —
              vale o cumprimento dos objectivos publicados.
            </>
          ),
        }
      : null,
    {
      p: 'Como funciona uma conta financiada da MTM?',
      resposta: (
        <>
          A negociação é <b className="text-zinc-200">simulada do princípio ao fim</b> — não há
          ordens tuas a chegar ao mercado. O que é real é o capital que o Fundo MTM afecta à
          conta: <b className="text-zinc-200">10% do valor nominal</b>. Numa conta financiada de
          10.000 USD, isso são 1.000 USD reais alocados pela MTM. É desse capital e do
          desempenho que ele produz que saem os teus pagamentos.
        </>
      ),
    },
    {
      p: 'Quanto é que eu recebo do que ganho?',
      resposta: (
        <>
          <b className="text-zinc-200">75% do lucro é teu</b>, 25% ficam para a MTM. Os 25%
          pagam o capital real que a MTM põe, a infraestrutura e o risco — sem isso não haveria
          conta financiada nenhuma para financiar.
        </>
      ),
    },
    {
      p: 'O que é a almofada de 3%?',
      resposta: (
        <>
          Só é levantável o que passar de <b className="text-zinc-200">3% de lucro sobre o saldo
          inicial</b> da conta. A almofada não é uma retenção: fica na tua conta e continua a ser
          tua para negociar. Existe para que a conta não regresse ao ponto de partida a cada
          levantamento — e para que a MTM acumule o capital que financia os traders seguintes.
        </>
      ),
    },
    {
      p: 'Como recebo o dinheiro?',
      resposta: (
        <>
          Por <b className="text-zinc-200">depósito na tua conta da PU Prime</b>, a corretora
          parceira, em USDC na rede Solana. No pedido indicas o UID da tua conta e anexas o
          print do menu de depósito, com o endereço e o valor visíveis. O endereço nunca é
          escrito à mão por ninguém: é o que a corretora gerou, tal como aparece no print. Um
          pagamento em cripto enviado para um endereço errado não se recupera.
        </>
      ),
    },
    {
      p: 'Preciso de assinar alguma coisa antes de levantar?',
      resposta: (
        <>
          Sim: o <b className="text-zinc-200">contrato de trader financiado</b>, na tua área, em
          Contratos. Confirmas aí o teu nome completo e a data de nascimento — tens de ter 18
          anos ou mais. Sem contrato assinado o pedido de levantamento nem chega a ser aceite.
        </>
      ),
    },
    {
      p: 'Posso usar robôs, copytrading ou negociar em notícias?',
      resposta: (
        <>
          <b className="text-zinc-200">Notícias, sim</b> — não fechamos janelas à volta de
          indicadores. <b className="text-zinc-200">Robôs (EA)</b>: podes usá-los para passar a
          avaliação, mas não na conta financiada — o que se financia é o teu critério.{' '}
          <b className="text-zinc-200">Copytrading</b>: só sincronizado com o MTM Auto, porque aí
          a origem e a gestão são conhecidas. Copiar sinais de fora não mostra nada sobre quem os
          copia.
        </>
      ),
    },
    {
      p: 'Que outras regras de negociação existem?',
      resposta: (
        <>
          Mínimo de <b className="text-zinc-200">2 minutos por operação</b>, risco máximo de{' '}
          <b className="text-zinc-200">1,5% por operação</b>, máximo de{' '}
          <b className="text-zinc-200">3 posições</b> no mesmo par e direcção, e{' '}
          <b className="text-zinc-200">sem hedge</b> — nem na mesma conta nem entre contas.
        </>
      ),
    },
    {
      p: 'Porque é que o desafio mais pequeno é de 3.000 USD?',
      resposta: (
        <>
          Porque a corretora não emite contas de demonstração abaixo desse valor. Vender um
          desafio de 500 USD seria vender uma conta que nunca chegaria a ser criada. A escada
          começa nos 3K e vai até aos 10K, com 25K a caminho.
        </>
      ),
    },
    {
      p: 'Isto é aconselhamento financeiro?',
      resposta: (
        <>
          Não. O MTM Funded não é corretora nem empresa de investimento e não presta
          aconselhamento. Lê o{' '}
          <Link href="/mtmfunded/legal/risco" className="text-[#D2A63C] hover:underline">
            Aviso de Risco
          </Link>
          .
        </>
      ),
    },
  ].filter(Boolean) as Array<{ p: string; resposta: React.ReactNode }>

  return (
    <main className="mx-auto max-w-3xl px-5 py-16 text-white">
      <h1 className="text-3xl font-bold sm:text-4xl">Perguntas frequentes</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Sobre o MTM Funded e os torneios. Para o resto,{' '}
        <a href="mailto:funded@morethanmoney.pt" className="text-[#D2A63C] hover:underline">
          funded@morethanmoney.pt
        </a>
        .
      </p>

      <div className="mt-10 divide-y divide-zinc-900 border-y border-zinc-900">
        {perguntas.map((q) => (
          <details key={q.p} className="group py-4">
            <summary className="cursor-pointer list-none text-sm font-medium text-zinc-200 marker:content-none group-open:text-[#D2A63C]">
              {q.p}
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-zinc-400">{q.resposta}</div>
          </details>
        ))}
      </div>
    </main>
  )
}
