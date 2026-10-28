"use client"

import { Clock, Download, FileText, Gauge, Newspaper, ShieldCheck, Sliders, TrendingDown, Layers, Ruler } from "lucide-react"
import { DescarregarMt5 } from "@/components/descarregar-mt5"
import { ScalpAnimado, SenseiEstilos } from "@/components/sensei/sensei-motion"
import { EaLanding, type EaLandingData } from "@/components/ea/ea-landing"

const PRECO_ANUAL = 200
const PRECO_VITALICIO = 697

/** Página de vendas da Sensei Scalp Edition, no formato das landings dos scanners. */
const DATA: EaLandingData = {
  name: "MTM Sensei Scalp Edition",
  eyebrow: "Família Sensei · pronta a operar",
  title: ["MTM Sensei", "Scalp Edition"],
  sub: "Um scalper de ouro para MetaTrader 5. Arma uma ordem pendente de cada lado, deixa o preço escolher, e a partir do primeiro cêntimo de lucro põe o stop em breakeven e acompanha. Quando o preço vira, a ordem contrária fecha uma e abre a outra.",
  markets: ["XAUUSD", "M5", "MetaTrader 5", "Licença por conta", "Sem DLLs"],
  video: "/ea/sensei-scalp/apresentacao.mp4",
  poster: "/ea/sensei-scalp/poster.jpg",
  hero: (
    <>
      <SenseiEstilos />
      <ScalpAnimado />
    </>
  ),
  heroCaption: "Ilustração animada de um ciclo: as duas pendentes, o breakeven, o trailing e a reversão. Os preços são ilustrativos.",
  heroNote: "XAUUSD · M5 · MetaTrader 5 · licença por conta, sem DLLs",
  guia: "/api/sensei-scalp/guia",
  facts: [
    { valor: "M5", rotulo: "tempo gráfico" },
    { valor: "2", rotulo: "pendentes armadas por ciclo" },
    { valor: "1.º", rotulo: "cêntimo de lucro → breakeven" },
    { valor: "3", rotulo: "travões de risco, ligados" },
  ],
  stepsTitle: ["Como", "trabalha"],
  steps: [
    { t: "Arma os dois lados", d: "Um buy stop acima e um sell stop abaixo, à distância medida. Quando o preço se afasta, a ordem acompanha; quando se aproxima, fica quieta e deixa-se disparar." },
    { t: "Trailing desde o primeiro cêntimo", d: "Mal a posição fique positiva o stop vai para breakeven, e daí só sobe. Uma trade fechada pelo stop nunca fecha a negativo." },
    { t: "A reversão é o travão", d: "A ordem contrária fica logo a seguir ao stop. Quando o preço vira, ela fecha o lado errado e abre o outro, no mesmo movimento." },
    { t: "Empilha enquanto ganha", d: "Com a posição a correr, acrescenta mais uma do mesmo lado. Uma só linha de stop, puxada pela mais recente, fecha-as todas juntas." },
  ],
  featuresTitle: ["O que vem", "na caixa"],
  features: [
    { icon: Sliders, t: "Vinte parâmetros, não cento e onze", d: "O motor Sensei tem 68 afinações. Ficam todas fixas, nos valores com que a configuração foi medida. Vês o que muda alguma coisa: licença, lote, sessão, notícias e os travões." },
    { icon: Gauge, t: "Painel no gráfico", d: "Iniciar, fechar tudo, inverter o lado, e trocar entre lote fixo e percentagem do saldo sem tirar a EA do gráfico. Mostra a leitura, os ciclos do dia, a próxima notícia e o estado da licença." },
    { icon: Newspaper, t: "Filtro de notícias", d: "Vem ligado e, por defeito, fecha as posições na janela do evento em vez de apenas não abrir novas. Numa EA sem stop loss, estar dentro de uma NFP é o risco que interessa evitar." },
    { icon: Download, t: "Instalador para Windows e macOS", d: "Encontra todos os terminais MT5 instalados — se tens duas corretoras, copia para as duas — e põe o EA, o indicador, o preset e o calendário no sítio certo." },
    { icon: Clock, t: "Um preset, qualquer corretora", d: "As distâncias estão gravadas em dólares e convertidas no arranque. Funciona num ouro de duas casas decimais e num de três, sem tocares em nada." },
    { icon: FileText, t: "Guia em PDF", d: "Instalação, licença, painel, dimensionamento e — a parte que importa — como a EA se comporta ao longo do dia, para saberes ler o que ela faz." },
  ],
  compare: {
    title: ["Isto não é", "o MTM Sensei EA"],
    text: "Partilham o motor de leitura — a mesma análise do Sensei que já conheces — e mais nada. Operam em tempos gráficos diferentes, entram de maneiras diferentes e comportam-se de maneiras diferentes. São licenças separadas: uma chave não abre a outra, e se a colares na EA errada ela diz-te exactamente isso.",
    cols: [
      {
        name: "MTM Sensei EA",
        href: "/sensei-ea",
        rows: [
          ["Tempo gráfico", "M15 e H1"],
          ["Como entra", "A mercado, quando o setup confirma"],
          ["Stop loss", "Sim, fixo, com quatro alvos"],
          ["Ritmo", "Poucas trades por dia"],
          ["Instrumentos", "XAUUSD, BTCUSD, US30"],
          ["Preço", "297 €/ano — grátis para membros Premium"],
        ],
      },
      {
        name: "Sensei Scalp Edition",
        here: true,
        rows: [
          ["Tempo gráfico", "M5"],
          ["Como entra", "Ordens pendentes — o preço é que escolhe"],
          ["Stop loss", "Não tem fixo. Quem fecha é a ordem de reversão"],
          ["Ritmo", "Dezenas de ciclos por dia, com tecto diário"],
          ["Instrumentos", "XAUUSD"],
          ["Preço", `${PRECO_ANUAL} €/ano — não está incluída em nenhum plano`],
        ],
      },
    ],
  },
  cautionTitle: ["Como ler", "esta EA"],
  cautionSub: "Um scalper de reversão não se comporta como um robô de alvos fixos. Sabe isto antes de a ligares e vais ler o painel com calma.",
  cautions: [
    { icon: TrendingDown, t: "A maioria dos ciclos fecha pequeno", d: "É assim por desenho. Muitos ciclos fecham com uma perda pequena — o custo do spread — e o resultado vem dos movimentos que correm. Sequências de pequenas perdas são o funcionamento normal, não uma avaria." },
    { icon: ShieldCheck, t: "Não há stop loss fixo — há três travões", d: "Quem fecha o lado errado é a ordem de reversão, e quando ela dispara há uma perda realizada. O que segura a conta são três limites — spread máximo, tecto de ciclos por dia e perda máxima diária — e vêm todos ligados." },
    { icon: Layers, t: "Começa no lote de origem", d: "0,01 lotes é a configuração com que a EA vem. Sobe só quando conheceres o ritmo dela na tua corretora: o spread que ela te dá é o que mais pesa no resultado." },
    { icon: Ruler, t: "Números só com origem declarada", d: "Não pomos curvas nem taxas de acerto nesta página. Quando publicarmos resultados da Scalp Edition, vêm de conta real e medidos em pips — como já acontece na página do MTM Sensei EA." },
  ],
  priceTitle: ["A tua", "licença"],
  priceSub: "Uma conta MT5 por licença. Produto independente — não está incluído em nenhum plano de subscrição, nem para quem já tem o MTM Sensei EA.",
  plans: [
    {
      planId: "sensei_scalp_annual",
      label: "Anual",
      price: `${PRECO_ANUAL} €`,
      note: "por ano · renova sozinha",
      incl: ["Renova sozinha", "Cancelas quando quiseres", "Actualizações incluídas"],
      highlight: true,
      buyLabel: `Comprar — ${PRECO_ANUAL} €/ano`,
    },
    {
      planId: "sensei_scalp_lifetime",
      label: "Vitalícia",
      price: `${PRECO_VITALICIO} €`,
      note: "pagamento único",
      incl: ["Sem renovação", "Actualizações incluídas", "Paga-se em três anos e meio"],
      badge: "Sem prazo",
      buyLabel: `Comprar — ${PRECO_VITALICIO} € vitalícia`,
    },
  ],
  payNote: "Pagamento seguro com Stripe. A chave segue por email logo a seguir ao pagamento.",
  install: {
    text: "O pacote é aberto — instala-o e conhece o painel. Para abrir ordens precisas da chave.",
    zip: "/downloads/MTM-Sensei-Scalp.zip",
    zipLabel: "Pacote da Scalp Edition",
    downloadMt5: <DescarregarMt5 />,
  },
  faq: [
    { q: "Preciso de deixar o computador ligado?", a: "Sim, ou de uma VPS. A EA corre dentro do MetaTrader — se o terminal fechar, não arma ordens novas." },
    { q: "A licença do MTM Sensei EA serve aqui?", a: "Não. São licenças separadas: uma chave não abre a outra, e se a colares na EA errada ela diz-te exactamente isso." },
    { q: "Posso usar a licença em duas contas?", a: "Não. Cada licença vale para uma conta MT5. Se mudaste de corretora, pedes e libertamos a que tens." },
    { q: "Funciona com qualquer corretora?", a: "Com qualquer corretora com MT5 e ouro. As distâncias estão gravadas em dólares e convertidas no arranque, por isso o mesmo preset serve em contas de duas ou três casas decimais. O spread é o que mais pesa no resultado." },
  ],
  disclaimer:
    "Conteúdo educativo, não constitui consultoria financeira. Negociar envolve risco de perda. Resultados passados não garantem resultados futuros.",
}

export default function SenseiScalpPage() {
  return <EaLanding data={DATA} />
}
