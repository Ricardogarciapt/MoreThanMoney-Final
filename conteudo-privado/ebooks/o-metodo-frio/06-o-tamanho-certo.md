# O tamanho certo

> A entrada decide se tens razão. O tamanho decide se ainda cá estás para a próxima.

Duas pessoas abrem exatamente a mesma operação, no mesmo par, ao mesmo preço, com o mesmo stop. O preço vai ao stop. Uma perde 10 € e encolhe os ombros. A outra perde 250 € e passa a noite a olhar para o teto. A única diferença entre as duas foi um número escrito no campo «Volume».

O tamanho da posição é a decisão mais importante e a mais esquecida. Toda a gente quer falar de entradas. Quase ninguém quer falar de lotes.

## O risco começa em dinheiro, não em lotes

A pergunta certa não é «quantos lotes abro?». É «quanto dinheiro aceito perder se esta operação correr mal?». A regra da casa é não arriscar mais de **1 % da conta** por operação. Numa conta de 500 €, são 5 €.

Pode parecer pouco. É de propósito. Com 1 %, dez perdas seguidas (e vão acontecer) tiram-te cerca de 10 % da conta. Com 10 %, tiram-te dois terços.

[[grafico:risco-sequencias]]

## A fórmula

**Lote = Risco em dinheiro ÷ (Distância do stop em pips × Valor do pip por lote)**

Exemplo ilustrativo, conta em dólares para simplificar, no EUR/USD:

| Passo | Cálculo | Resultado |
|---|---|---|
| 1. Conta | | 500 $ |
| 2. Risco (1 %) | 1 % de 500 $ | 5 $ |
| 3. Stop | da entrada ao stop do plano | 25 pips |
| 4. Valor do pip por lote | EUR/USD, conta em USD | 10 $ |
| 5. Lote | 5 ÷ (25 × 10) | 0,02 |

Prova: 25 pips × 0,02 lotes × 10 $ = 5 $. Bate certo com o risco.

Repara no que isto quer dizer: **o stop decide o lote, e não o contrário**. Se a tua ideia precisa de um stop de 50 pips, o lote cai para metade (0,01). Se o stop for de 12 pips, o lote sobe. O risco em dinheiro fica sempre igual.

:::alerta Erro clássico · Apertar o stop para caber um lote maior
Queres abrir 0,10 lotes porque «assim vale a pena». Para o risco não passar de 5 $, o stop teria de ficar a 5 pips da entrada, dentro do ruído normal do mercado. O stop é atingido por uma vela qualquer e a ideia, que até estava certa, nunca teve espaço para funcionar. O lote ajusta-se ao stop. O stop nunca se ajusta ao lote.
:::

:::alerta Erro clássico · Aumentar o lote para recuperar
Perdeste três seguidas e a quarta vai ser «com o dobro, para recuperar tudo». É a frase mais cara do Forex. A quarta operação não sabe que perdeste as outras três, e a probabilidade de ela correr mal é exatamente a mesma. A diferença é que agora vai doer o dobro. Depois de perdas, o lote fica igual ou desce. Nunca sobe.
:::

## A calculadora (e a prova à mão)

Há calculadoras de tamanho de posição gratuitas online e algumas corretoras mostram o risco no próprio ecrã da ordem. Usa-as. Mas faz a prova à mão nas primeiras 20 operações, até a conta te sair de cabeça.

:::ecra Calculadora de posição (exemplo ilustrativo)
Conta: 500 $
Risco: 1 % = 5 $
Par: EUR/USD
Stop: 25 pips
Valor do pip (1 lote): 10 $
Lote: 0,02
:::

Duas notas honestas:

- Com conta em **euros**, o valor do pip muda com o câmbio do dia. Confirma no MT5 ou na corretora.
- No **ouro** e nos índices, o tamanho do contrato e o valor de cada movimento mudam de corretora para corretora. Lê a especificação antes de aplicares a fórmula.

## E quando a conta é pequena?

Com 200 € e 1 % de risco, arriscas 2 € por operação. Com o lote mínimo de 0,01 (cerca de 0,10 $ por pip no EUR/USD), isso dá um stop de uns 20 pips. Se a tua ideia precisa de mais, não há lote mais pequeno para baixar. Tens duas saídas honestas: esperar por uma entrada com stop mais curto, ou não entrar. «Arriscar 5 % só desta vez» não é uma saída. É o início do problema.

## A regra fria deste capítulo

:::cartao Regra fria n.º 6
1 % por operação. O stop decide o lote. Depois de perder, o lote não sobe. Faço a prova da conta antes de clicar.
:::

## Em resumo

- O risco decide-se em dinheiro: 1 % da conta por operação.
- Lote = risco ÷ (pips de stop × valor do pip).
- O stop vem do gráfico; o lote vem da conta.
- Nunca apertes o stop para caber um lote maior, nunca aumentes o lote para recuperar.
- Com conta pequena, a resposta honesta muitas vezes é esperar.

:::exercicio Calcula três posições
1. Conta: ______ · risco 1 %: ______
2. Operação A, stop de 20 pips. Lote: ______ · prova: ______
3. Operação B, stop de 40 pips. Lote: ______ · prova: ______
4. Operação C, stop de 60 pips. Lote: ______ · prova: ______
5. O lote da C é maior ou menor do que o da A? Porquê? ____________
:::
