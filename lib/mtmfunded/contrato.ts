/**
 * O CONTRATO DE TRADER FINANCIADO.
 *
 * O texto vive no código e é gravado INTEIRO com a assinatura. Guardar só o número da versão
 * e remeter para uma página deixava a prova dependente de uma página que pode mudar — e o
 * que interessa provar é o que a pessoa leu naquele dia, não o que lá está hoje.
 *
 * A versão sobe sempre que o texto mudar. Quem assinou a v1 continua sob a v1 até assinar
 * outra: mudar o acordo por baixo de alguém que já está a negociar não é uma actualização,
 * é outra coisa.
 */
export const CONTRATO_VERSAO = '2026-09-v2'

export interface DadosContrato {
  nome: string
  saldo: number
  moeda?: string
}

export function textoDoContrato({ nome, saldo }: DadosContrato): string {
  const conta = Number(saldo).toLocaleString('pt-PT')
  return `CONTRATO DE TRADER FINANCIADO · MTM FUNDED
Versão ${CONTRATO_VERSAO}

Entre a MoreThanMoney, que opera o MTM Funded ("MTM"), e ${nome} ("o Trader").

1. OBJECTO
A MTM concede ao Trader o acesso a uma conta de negociação SIMULADA, de ${conta} USD em
dinheiro virtual, para avaliação e demonstração de competência. Não é constituído nenhum
depósito do Trader numa conta da MTM, nem a MTM detém ou gere fundos do Trader.

2. NATUREZA DA RELAÇÃO
Este contrato não constitui contrato de trabalho, mandato de gestão de carteira, nem
prestação de serviço de investimento. O Trader actua por sua conta e critério, dentro das
regras publicadas. A MTM não é corretora nem empresa de investimento e não presta
aconselhamento financeiro.

3. REGRAS DE NEGOCIAÇÃO
Aplicam-se as regras publicadas do programa em causa, incluindo perda diária máxima, perda
máxima total, dias mínimos de negociação, limite de concentração de lucro num dia, tempo
mínimo por operação, risco máximo por operação, número máximo de posições simultâneas no
mesmo par e direcção, proibição de hedge, restrições ao uso de robôs (EA) e ao copytrading.
O incumprimento congela a conta e cessa o direito a qualquer pagamento sobre resultados
obtidos em incumprimento.

4. COMO A CONTA FINANCIADA FUNCIONA
A negociação é SIMULADA do princípio ao fim. O que a conta financiada tem de real é o capital
que a MTM lhe afecta: o Fundo MTM aloca capital real correspondente a 10% do valor nominal da
conta financiada (numa conta de 10.000 USD, 1.000 USD reais). É desse capital, e do
desempenho que ele produz, que saem os pagamentos ao Trader.

5. PARTICIPAÇÃO NOS RESULTADOS — 75/25
O Trader recebe 75% do lucro apurado no seu desempenho simulado; os restantes 25% ficam para
a MTM, que suporta o capital, a infraestrutura e o risco.

Só é levantável o que exceder a ALMOFADA DE LEVANTAMENTO de 3% sobre o saldo inicial da
conta. A almofada não é uma retenção: fica na conta do Trader e continua a ser dele para
negociar. Existe para que a conta não regresse ao ponto de partida a cada levantamento, e
para que a MTM constitua o capital que financia os traders seguintes.

6. FORMA DE PAGAMENTO
Todos os pagamentos são feitos por DEPÓSITO na conta do Trader junto da corretora parceira
PU Prime, em USDC na rede Solana, para o endereço de depósito gerado pela própria corretora
na conta do Trader. O Trader é responsável por indicar o UID correcto da sua conta e por
anexar o comprovativo do menu de depósito com o endereço e o valor. Pagamentos enviados para
um endereço indicado erradamente pelo Trader não são recuperáveis nem repetidos.

7. IDADE E IDENTIDADE
O Trader declara ter 18 anos ou mais e que os dados que forneceu são verdadeiros e lhe
pertencem. A MTM pode exigir verificação de identidade antes de qualquer pagamento.

8. CONDUTA
São causa de cessação imediata e de anulação de resultados: explorar falhas de preço,
execução ou latência da plataforma; coordenar posições opostas entre contas; negociar a conta
de outra pessoa ou ceder a sua a terceiros; e contornar por qualquer meio as regras
publicadas.

9. DURAÇÃO E CESSAÇÃO
Vigora enquanto a conta estiver activa. Qualquer das partes o pode fazer cessar, com efeitos
imediatos, sem prejuízo dos pagamentos já aprovados.

10. DADOS PESSOAIS
Tratados nos termos da Política de Privacidade do MTM Funded.

11. LEI APLICÁVEL
Lei portuguesa.

Ao assinar, o Trader declara ter lido e compreendido este contrato, o Aviso de Risco e os
Termos e Condições do MTM Funded, e que compreende que as contas são SIMULADAS.`
}

/** A fatia do lucro que é do trader. Os 25% restantes suportam capital e risco. */
export const QUOTA_TRADER = 0.75

/** Capital real que o Fundo MTM aloca a uma conta financiada, em fracção do nominal. */
export const CAPITAL_REAL_PCT = 0.10

/** A almofada, em USD, para uma conta deste tamanho. */
export function almofadaUsd(saldoInicial: number, pct = 3): number {
  return (Number(saldoInicial) || 0) * (pct / 100)
}

/**
 * Quanto é que este trader pode levantar agora.
 *
 * O lucro conta-se sobre o SALDO INICIAL, e só o que passar da almofada é levantável. Sem
 * isto, um trader com +1% levantava e a conta ficava sem margem nenhuma para o mês seguinte
 * — e a MTM sem o capital que precisa de acumular para financiar quem passa.
 */
export function levantavelUsd(
  saldoInicial: number,
  equity: number,
  jaLevantado = 0,
  almofadaPct = 3,
): number {
  const inicial = Number(saldoInicial) || 0
  // O lucro conta-se sobre o saldo inicial e soma-se o que já saiu: sem isso, cada
  // levantamento reduzia a equity e fazia o lucro «desaparecer» aos olhos da conta seguinte.
  const lucro = (Number(equity) || 0) - inicial + (Number(jaLevantado) || 0)
  const acimaDaAlmofada = lucro - almofadaUsd(inicial, almofadaPct)
  if (acimaDaAlmofada <= 0) return 0

  // A quota do trader aplica-se ao lucro levantável, e desconta-se o que já recebeu.
  const dele = acimaDaAlmofada * QUOTA_TRADER - (Number(jaLevantado) || 0)
  return dele > 0 ? Math.floor(dele * 100) / 100 : 0
}
