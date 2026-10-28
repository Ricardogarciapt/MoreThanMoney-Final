"use client"

import Link from "next/link"
import { BarChart3, Bot, FlaskConical, LineChart, Ruler, ShieldCheck } from "lucide-react"
import { DescarregarMt5 } from "@/components/descarregar-mt5"
import { EaLanding, type EaLandingData } from "@/components/ea/ea-landing"

const PRECO_PACOTE = 1250

/** Página de venda do MTM Premium Scanner EA: indicador + estratégia no TradingView + EA no MT5. */
const DATA: EaLandingData = {
  name: "MTM Premium Scanner EA",
  eyebrow: "Indicador · Estratégia · EA",
  title: ["MTM Premium", "Scanner EA"],
  sub: "O ouro em três sessões — Ásia, Londres e Nova Iorque. A mesma regra no teu TradingView e no teu MetaTrader 5: lê a direcção com cinco critérios, espera pelo recuo e desenha a zona, o stop e os alvos. A EA executa-a sozinha, com o mesmo plano no gráfico.",
  markets: ["XAUUSD", "M15", "Ásia", "Londres", "Nova Iorque", "TradingView", "MetaTrader 5"],
  // eslint-disable-next-line @next/next/no-img-element
  hero: <img src="/scanners/premium-scanner.png" alt="Zona de entrada, stop e alvos do MTM Premium Scanner no ouro" />,
  heroCaption: "Zona de entrada, SL e TP1–TP3 desenhados no gráfico. A EA desenha os mesmos níveis no MetaTrader.",
  heroNote: (
    <>
      XAUUSD · M15 · TradingView + MetaTrader 5 · licença vitalícia por conta, sem DLLs ·{" "}
      <Link href="/scanner/premium-scanner" style={{ color: "#e9c46a" }}>Ver o scanner</Link>
    </>
  ),
  facts: [
    { valor: "3", rotulo: "sessões do ouro" },
    { valor: "5", rotulo: "critérios no voto da direcção" },
    { valor: "50/25/25", rotulo: "saídas, SL na entrada no TP1" },
    { valor: "1", rotulo: "grupo de cada vez" },
  ],
  stepsTitle: ["Como", "trabalha"],
  steps: [
    { t: "Só nas sessões", d: "Ásia 00–06, Londres 07–11 e Nova Iorque 13–16 (UTC), cada uma com o seu interruptor. Fora delas, não há sinais." },
    { t: "Cinco perguntas", d: "No fecho de cada vela: acima da abertura da sessão? De há 1 h? De há 4 h? Da EMA200? Da EMA9? Maioria ou Unânime decide se há sinal." },
    { t: "Espera pelo recuo", d: "A entrada é uma ordem limite no meio de uma zona de 5 $ colocada contra o movimento. Se o preço não volta em 4 velas, a ordem cai." },
    { t: "Gestão por partes", d: "50 % sai no TP1 e o stop do resto passa para a entrada; 25 % no TP2 e 25 % no TP3. Tudo editável." },
  ],
  featuresTitle: ["Três ferramentas,", "a mesma regra"],
  featuresSub: "Vês o sinal no TradingView, testas a regra com os custos da tua corretora e deixas a EA executá-la no MetaTrader 5. Os três usam os mesmos números por omissão.",
  features: [
    { icon: LineChart, t: "Indicador · TradingView", d: "Sinais BUY/SELL no fecho da vela, zona de entrada, SL e TP1–TP4 desenhados, e alertas JSON prontos para webhook." },
    { icon: BarChart3, t: "Estratégia · TradingView", d: "A mesma regra em backtest: ordem limite no meio da zona, três parciais e SL na entrada depois do TP1. Pões o spread e a comissão da tua corretora e lês o resultado." },
    { icon: Bot, t: "EA · MetaTrader 5", d: "Executa a regra sozinha, com painel no gráfico: iniciar e parar, fechar tudo, Maioria ou Unânime, lote fixo ou risco em %, e o estado da sessão e da licença." },
  ],
  cautionTitle: ["Antes de", "a ligares"],
  cautions: [
    { icon: FlaskConical, t: "Testa com os teus custos", d: "O resultado de uma regra de ouro em M15 depende muito do spread e da comissão. Põe os da tua corretora na estratégia do TradingView e no testador do MetaTrader antes de usares dinheiro real." },
    { icon: ShieldCheck, t: "Começa em demo e com lote pequeno", d: "O lote total reparte-se pelas três partes: 0,04 dá 0,02 / 0,01 / 0,01. Sobe só quando conheceres o ritmo da EA na tua conta." },
    { icon: Ruler, t: "Números só com origem declarada", d: "Não pomos curvas nem taxas de acerto nesta página. Quando publicarmos resultados da EA, vêm de conta e medidos em pips, com a origem dita." },
  ],
  priceTitle: ["O", "pacote"],
  priceSub: "Indicador e estratégia no TradingView + EA no MetaTrader 5, com uma licença para uma conta MT5.",
  plans: [
    {
      planId: "premium_scanner_ea_lifetime",
      label: "Pacote vitalício",
      price: `${PRECO_PACOTE} €`,
      note: "pagamento único · sem renovação",
      incl: [
        "Indicador e estratégia por convite no teu TradingView",
        "EA para MetaTrader 5 com painel",
        "Licença sem renovação",
        "Actualizações incluídas",
        "Guia em PDF e vídeos de uso",
      ],
      highlight: true,
      badge: "Indicador + Estratégia + EA",
      buyLabel: `Comprar o pacote — ${PRECO_PACOTE} €`,
    },
  ],
  askTradingView: true,
  payNote: "Pagamento seguro com Stripe. A chave da EA segue por email e o acesso ao indicador e à estratégia chega ao teu utilizador do TradingView.",
  install: {
    text: "O pacote é aberto — instala-o e conhece o painel. Para abrir ordens precisas da chave, que segue no email da compra.",
    zip: "/downloads/MTM-Premium-Scanner-EA.zip",
    zipLabel: "Pacote da EA (MetaTrader 5)",
    downloadMt5: <DescarregarMt5 />,
    tip: "As sessões estão em UTC; a EA lê sozinha o fuso do servidor da tua corretora.",
  },
  faq: [
    { q: "Preciso de deixar o computador ligado?", a: "Sim, ou de uma VPS. A EA corre dentro do MetaTrader — se o terminal fechar, não abre ordens novas. As posições abertas ficam com o stop e os alvos na corretora." },
    { q: "O que recebo no TradingView?", a: "O indicador e a estratégia, por convite ao utilizador que indicares na compra. O indicador mostra os sinais e os níveis; a estratégia deixa-te testar a regra com os custos da tua corretora." },
    { q: "Posso usar a licença em duas contas MT5?", a: "Não. A licença da EA vale para uma conta MT5. Se mudaste de corretora, pedes e libertamos a que tens." },
    { q: "Há renovação?", a: "Não. O pacote é pago uma vez e as actualizações estão incluídas." },
  ],
  disclaimer:
    "Conteúdo educativo, não constitui consultoria financeira. Negociar envolve risco de perda. Resultados passados não garantem resultados futuros.",
}

export default function PremiumScannerEaPage() {
  return <EaLanding data={DATA} />
}
