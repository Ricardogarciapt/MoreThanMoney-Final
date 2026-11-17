/**
 * BASE DE CONHECIMENTO DO MENTOR — tudo o que ele precisa para ajudar o aluno ao máximo.
 *
 * Pedido do Ricardo (17/11, MTMOS): «o Mentor tem de ter todo o conhecimento: produtos, cursos,
 * onboarding e o framework». Regra desta casa: os factos que mudam (preços, scanners, academias)
 * NÃO se copiam para aqui — importam-se da fonte (`escada-precos`, `scanners-catalog`, `pilares`).
 * Se um preço mudar lá, o Mentor sabe-o no deploy seguinte. O framework entra por
 * `blocoFramework('apoio')` em `prompt.ts`.
 *
 * Puro (sem base de dados): as salas ao vivo do dia, que mudam, entram pelo `blocoSalas`.
 */
import { AREAS } from "@/lib/pilares"
import { SCANNERS } from "@/lib/scanners-catalog"
import { MIN_DEPOSIT, NOME_DEGRAU_TOPO, PRECO_MEMBRO, PRECO_PREMIUM, PRECO_PREMIUM_1O_MES, PRECO_TOPO } from "@/lib/escada-precos"
import { LINK_AGENDAR_ONBOARDING } from "@/lib/agenda/link"

const SITE = "https://www.morethanmoney.pt"

/** Academias que o Mentor recomenda. A de Network Marketing fica de fora por decisão do Ricardo (17/11). */
const ACADEMIAS_FORA = new Set(["network-marketing"])

export function baseConhecimento(): string {
  const academias = AREAS.filter((a) => !a.academias.some((s) => ACADEMIAS_FORA.has(s)))
    .map((a) => `- ${a.titulo}: ${a.descricao}`)
    .join("\n")
  const scanners = SCANNERS.map((s) => `- ${s.name} (${s.subtitle}) → ${SITE}/scanner/${s.key}`).join("\n")

  return `## Base de conhecimento MTM (usa-a; se não estiver aqui, não inventes — diz que vais confirmar com a equipa ou manda para Agendar)

### Primeiros passos (onboarding em 5 passos, ${SITE}/onboarding/mtm)
1. Conta com 3 dias de Premium para experimentar.
2. Instalar a app MTM System (telemóvel) e conhecer os separadores.
3. Corretora parceira PU Prime pelo link da app (Abrir Conta, ${SITE}/abrir-conta): verificação de identidade, conta Live Standard MT5 em USD, depósito mínimo ${MIN_DEPOSIT}$, enviar o UID ao bot do Telegram para validar.
4. Sinais: ligar o MTM Auto (cópia automática com risco definido) ou acompanhar os Trading Alerts / Tap to Trade.
5. Academias e chamada de onboarding com a equipa (${LINK_AGENDAR_ONBOARDING}).
Começa SEMPRE em demo ou com um valor que não tire o sono, e com o risco por operação definido antes de entrar.

### Planos (preços em vigor)
- Membro · ${PRECO_MEMBRO}: comunidade, sinais base e formação; a porta de entrada.
- Premium · ${PRECO_PREMIUM} (1.º mês ${PRECO_PREMIUM_1O_MES}, trial de 3 dias): Scanner, Trading Alerts, Tap to Trade, salas e aulas Premium.
- ${NOME_DEGRAU_TOPO} · ${PRECO_TOPO}: um ano de Premium com estatuto VIP.
- Rota corretora PU Prime: conta financiada com ${MIN_DEPOSIT}$ = Premium sem mensalidade enquanto estiver financiada.
- Mudar de plano: ${SITE}/upgrade. Dúvidas de pagamento, faturas ou reembolsos: são sempre com a equipa (suporte no Chat da app).

### A app MTM System
- Feed (novidades), Chat (canais da comunidade e suporte), Ao Vivo (sessões em direto, com legendas CC noutras línguas).
- Tap to Trade: chega um sinal e executas com um toque, com o teu risco.
- MTM Auto (${SITE}/mtmauto): copia as estratégias para a tua conta MT5 com o risco que definires; grátis com a conta PU Prime validada.
- Scanner / Trading Alerts: os sinais das estratégias por ativo e timeframe.
- WebTrader (${SITE}/webtrader): plataforma própria para operar e treinar.
- Portfólio: carteiras e DCA em cripto, ações e ETF.
- Mais → Afiliados (só se perguntarem; paga por clientes reais, sem ranks).

### MTM Funded (${SITE}/mtmfunded)
Desafios e torneios em conta SIMULADA. Quem se destaca recebe um Patrocínio de Desempenho para abrir conta própria numa corretora regulada. Não é prop firm e a MTM não gere dinheiro de ninguém. É o caminho para quem ainda não tem capital.

### Academias (aulas ao vivo + gravações, ao ritmo de cada um)
${academias}
As aulas ao vivo são em português; noutras línguas usa-se o botão CC nas sessões.

### Cursos e certificados
- Fast Start: as bases do Forex e da gestão de risco, do zero à primeira operação; tem avaliação e certificado.
- Bootcamp MoreThanMoney (cerca de 30 h): o percurso completo; avaliação e certificado.
- Teste Final: certifica o percurso. Avaliações em ${SITE}/avaliacoes.

### Scanners (indicadores TradingView da casa)
${scanners}
O Pack de Scanners e o Premium dão acesso a vários; cada scanner tem a sua página com o que faz e como se usa.

### Conceitos que ensinas com frequência
Gestão de risco por operação (1 % ou menos para quem começa), stop loss e take profit, lote e valor por pip, alavancagem, spread, sessões de mercado (Londres, Nova Iorque), tendência e estrutura, liquidez, order blocks e fair value gaps, diário de trading, psicologia (medo, ganância, vingança após perda), conta demo vs. real, DCA.`
}

/** As salas abertas desta semana (vêm da base de dados, pela rota). */
export function blocoSalas(salas: { titulo: string; academia?: string | null; quando?: string | null }[]): string {
  if (!salas.length) return ""
  return `### Salas e aulas abertas agora\n${salas
    .slice(0, 15)
    .map((s) => `- ${s.titulo}${s.academia ? ` (${s.academia})` : ""}${s.quando ? ` · ${s.quando}` : ""}`)
    .join("\n")}`
}
