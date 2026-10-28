"use client"

import Link from "next/link"
import { BellRing, Download, LayoutDashboard, ListChecks, Newspaper, ShieldCheck, SlidersHorizontal, Target } from "lucide-react"
import QueroQueMeLiguem from "@/components/captacao/quero-que-me-liguem"
import { MockupPainel, MockupConfirmacoes } from "@/components/sensei-ea-mockups"
import { SenseiResultadosLive } from "@/components/sensei-resultados-live"
import { DescarregarMt5 } from "@/components/descarregar-mt5"
import { ConfirmacoesAnimadas, GraficoEaAnimado, SenseiEstilos } from "@/components/sensei/sensei-motion"
import { EaLanding, type EaLandingData } from "@/components/ea/ea-landing"

const PRECO_ANUAL = 297
const PRECO_VITALICIO = 1000

const DATA: EaLandingData = {
  name: "MTM Sensei EA",
  eyebrow: "MetaTrader 5 · Expert Advisor · pronto a operar",
  title: ["O MTM Sensei", "a correr sozinho"],
  sub: "A mesma leitura que fazemos à mão — estrutura, order blocks, liquidez, sessões — transformada num robô que lê, entra, tira parciais e faz trailing. Vinte confirmações antes de cada entrada, e o painel no gráfico para tomares conta quando quiseres.",
  markets: ["XAUUSD", "BTCUSD", "US30", "M15", "H1", "MetaTrader 5"],
  hero: (
    <>
      <SenseiEstilos />
      <GraficoEaAnimado />
    </>
  ),
  heroCaption: "Ilustração animada do comportamento do EA. As velas e os preços são ilustrativos.",
  heroNote: "Incluído sem custo para membros Premium, VIP e Fundador.",
  guia: "/api/sensei-ea/guia",
  facts: [
    { valor: "20", rotulo: "confirmações por entrada" },
    { valor: "4", rotulo: "saídas parciais" },
    { valor: "3", rotulo: "instrumentos com preset" },
    { valor: "72 h", rotulo: "a operar sem internet" },
  ],
  stepsTitle: ["Do sinal", "à saída"],
  stepsSub: "Sem tirares os olhos da tua vida.",
  stepsAside: <ConfirmacoesAnimadas />,
  steps: [
    { t: "Lê", d: "A cada vela fechada corre as vinte confirmações do Sensei. Cada entrada traz o seu score — vês porque é que entrou." },
    { t: "Entra", d: "A mercado, quando o setup confirma, já com stop loss e quatro alvos na corretora. Nada fica só na memória do terminal." },
    { t: "Gere até ao fim", d: "Parciais nos alvos, breakeven automático e trailing por ATR ou por pontos. Deixa um runner a correr ou fecha tudo na quarta saída." },
  ],
  featuresTitle: ["O que está", "lá dentro"],
  featuresSub: "Um só ficheiro para anexar ao gráfico. O indicador corre dentro do robô — não precisas de instalar nada por fora nem de ligar dois ficheiros um ao outro.",
  features: [
    { icon: ListChecks, t: "Vinte confirmações", d: "Tendência de tempo superior, EMA 200 fechada, estrutura (BOS/CHoCH), order blocks, sweeps de liquidez, POC, RSI, ADX, fluxo de ordens e sessão. Cada entrada traz o seu score." },
    { icon: Target, t: "Gestão até ao fim", d: "Quatro saídas parciais configuráveis, breakeven automático e trailing por ATR ou por pontos. Podes deixar um runner a correr ou fechar tudo na quarta saída." },
    { icon: LayoutDashboard, t: "Painel no gráfico", d: "Automático on/off, comprar e vender à mão, risco em % ou lotes, parcial imediato, trailing, fechar tudo, estilo de trading, PT/EN. Painéis arrastáveis." },
    { icon: Newspaper, t: "Filtro de notícias", d: "Calendário do MetaTrader ou fonte externa por CSV/URL. Define a antecedência e o tempo depois do evento, e o robô fica quieto." },
    { icon: ShieldCheck, t: "Modo prop firm", d: "Perda diária, perda total e alvo de lucro, medidos por saldo ou por equity. Trava o dia quando o limite é tocado e volta a abrir no dia seguinte." },
    { icon: SlidersHorizontal, t: "Presets prontos", d: "Ficheiros .set com par, tempo gráfico e horário já afinados. O guia diz qual usar em cada instrumento." },
    { icon: Download, t: "Instalador automático", d: "Windows e macOS. Encontra o teu MetaTrader — mesmo com dois instalados de corretoras diferentes — copia tudo para o sítio certo e abre o guia." },
    { icon: BellRing, t: "Avisos de versão", d: "O EA diz-te quando sai uma versão nova e o que mudou, e pode descarregá-la para a pasta Files. Afinações de risco e trailing podem chegar do servidor, se autorizares." },
  ],
  showcase: [
    { node: <MockupPainel className="w-full h-auto" />, caption: "Painel de controlo, sobre o gráfico." },
    { node: <MockupConfirmacoes className="w-full h-auto" />, caption: "Confirmações em tempo real." },
  ],
  extra: <SenseiResultadosLive />,
  priceTitle: ["A tua", "licença"],
  priceSub: "Uma conta MT5 por licença. Presets, guia e actualizações incluídos.",
  plans: [
    {
      planId: "sensei_ea_annual",
      label: "Anual",
      price: `${PRECO_ANUAL} €`,
      note: "por ano · renova sozinha",
      incl: ["1 conta MT5", "Presets e guia", "Actualizações durante a subscrição", "Cancelas quando quiseres"],
      buyLabel: `Comprar — ${PRECO_ANUAL} €/ano`,
    },
    {
      planId: "sensei_ea_lifetime",
      label: "Vitalícia",
      price: `${PRECO_VITALICIO} €`,
      note: "pagamento único · sem prazo",
      incl: ["1 conta MT5", "Presets e guia", "Actualizações sem prazo", "Sem renovações"],
      highlight: true,
      badge: "Sem prazo",
      buyLabel: `Comprar — ${PRECO_VITALICIO} € vitalícia`,
    },
  ],
  payNote: (
    <>
      Pagamento seguro com Stripe. Já és membro Premium ou VIP?{" "}
      <Link href="/member-area?tab=subscription">O EA já está incluído na tua área de membro.</Link>
    </>
  ),
  install: {
    text: "O pacote é aberto — instala-o e conhece o painel. Para abrir ordens precisas da chave, que segue no email da compra.",
    zip: "/downloads/MTM-Sensei-EA.zip",
    zipLabel: "Descarregar o pacote",
    downloadMt5: <DescarregarMt5 />,
  },
  faq: [
    { q: "Preciso de deixar o computador ligado?", a: "Sim, ou de uma VPS. O EA corre dentro do MetaTrader — se o terminal fechar, nada acontece. As posições já abertas ficam com o stop e o take profit na corretora." },
    { q: "Funciona em conta de prop firm?", a: "Tem um módulo próprio para isso: perda diária, perda total e alvo, medidos por saldo ou por equity. Confirma sempre os limites da tua empresa — os valores por defeito são só um ponto de partida." },
    { q: "Posso usar a licença em duas contas?", a: "Não. Cada licença vale para uma conta MT5. Precisas de outra conta, compras outra licença — ou pedes para libertar a que tens, se mudaste de corretora." },
    { q: "O que acontece se cancelar a anual?", a: "A licença deixa de validar no fim do período pago e o EA pára de abrir ordens novas. As posições abertas continuam a ser geridas até fecharem." },
    { q: "Que corretora recomendam?", a: "Qualquer uma com MT5 e spreads decentes em ouro. Os presets foram afinados em contas com 2 e 3 casas decimais no XAUUSD, e o script MTM_Setup diz-te o que a tua corretora tem." },
  ],
  disclaimer:
    "Conteúdo educativo, não constitui consultoria financeira. Software de apoio à decisão. Negociar com alavancagem implica risco de perda do capital investido. Resultados passados dos sinais não são indicativos de resultados futuros.",
  after: <QueroQueMeLiguem origem="produto:/sensei-ea" interesseInicial="ea_sensei" titulo="Queres ajuda a instalar a EA Sensei?" />,
}

export default function SenseiEaPage() {
  return <EaLanding data={DATA} />
}
