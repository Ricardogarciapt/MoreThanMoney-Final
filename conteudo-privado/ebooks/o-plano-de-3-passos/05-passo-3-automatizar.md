# Passo 3 · Automatizar

> Automatizar não é deixar ao acaso. É seguir regras sem emoção.

Ao fim de algumas semanas no passo 2, vais notar uma coisa: a parte que te custa não é encontrar operações. É gerir as que estão abertas. Mexer no stop quando o preço se aproxima, fechar cedo demais por medo, esquecer-te de proteger uma operação que já estava a ganhar. O terceiro passo existe para tirar essas decisões das tuas mãos nos momentos em que as tuas mãos são o problema.

## O que se automatiza

| O quê | Como | O que te poupa |
|---|---|---|
| **Proteção** | Auto Break-Even: o stop passa para a entrada quando o preço chega ao primeiro alvo | Ver uma operação a ganhar transformar-se em perda |
| **Seguimento** | Trailing Stop: o stop acompanha o preço a uma distância fixa | Fechar cedo por medo |
| **Saídas** | Saídas parciais em cada alvo | Ter de decidir tudo de uma vez |
| **Registo** | Histórico e diário juntos | Esquecer o que fizeste e porquê |
| **Prova** | Auditoria partilhável | Depender de prints |

No WebTrader da MoreThanMoney, o Auto Break-Even, o Trailing Stop e as saídas parciais correm no servidor, mesmo com o separador fechado. Funciona com contas demo, contas MTM Funded (simuladas) e contas da tua corretora, MetaTrader ou TradeLocker.

[[foto: wt-gestao.jpg | Gestão automática no WebTrader: definida uma vez, cumprida sempre. | larga]]

## Regras escritas, não lembradas

Automatizar começa num papel. Antes de ligares qualquer automatismo, escreve as regras que ele vai cumprir.

:::exercicio As minhas regras de gestão
- Quando chega ao primeiro alvo, faço: ☐ Break-Even ☐ parcial ☐ as duas
- Percentagem que fecho no primeiro alvo: ________ %
- Trailing Stop: ☐ sim, a ________ pips/pontos ☐ não
- Paro de operar no dia quando perder: ________ R
- Paro de operar na semana quando perder: ________ R
:::

:::destaque
A regra de paragem é a automatização mais importante de todas. Um dia mau não pode virar uma semana má.
:::

## A auditoria: a tua prova, para ti

Ao fim de um mês, abre o teu histórico e a auditoria da tua conta. Não é para mostrares a ninguém. É para veres, com números, se estás a cumprir. As contas da casa têm auditoria pública com todas as operações, e é esse o padrão que te peço que uses contigo próprio.

:::exercicio Para fazer hoje
1. Escreve as tuas regras de gestão na folha acima.
2. Liga o Auto Break-Even na tua conta demo e faz a próxima operação com ele ativo.
3. Marca na agenda a revisão mensal do diário: ____ / ____
:::
