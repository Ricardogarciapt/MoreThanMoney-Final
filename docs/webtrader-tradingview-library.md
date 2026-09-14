# WebTrader MTM Funded — biblioteca TradingView (Advanced Charts)

## Porquê

O widget gratuito do TradingView (`tv.js`, usado no Scanner e na vista «Análise» do WebTrader)
corre os nossos estudos Pine publicados, mas **não tem API para linhas de ordens**. As linhas
arrastáveis de posição, SL/TP e ordens pendentes — como no paper trading do TradingView — só
existem na biblioteca licenciada **Advanced Charts** / **Trading Platform** (`charting_library`).

Enquanto ela não estiver no projecto, a vista «Negociar» usa o nosso gráfico
(`components/funded/grafico-leve.tsx`, lightweight-charts com a paleta e as linhas do TradingView).

## Como pedir

1. Ir a <https://www.tradingview.com/advanced-charts/> → **Get library** (ou «Trading Platform»,
   se quisermos também o painel de conta/ordens do TradingView).
2. Preencher o formulário em nome da empresa (MoreThanMoney), com o domínio `morethanmoney.pt`.
   É gratuito para empresas; o TradingView dá acesso a um repositório GitHub privado.
3. Não publicar os ficheiros em repositórios públicos nem em CDNs — é condição da licença.

## Onde pôr os ficheiros

Copiar do repositório privado do TradingView:

```
public/charting_library/      ← a pasta charting_library inteira (charting_library.standalone.js, bundles/, *.html…)
public/datafeeds/             ← opcional; não é usado (o datafeed é nosso, em JS)
```

Não é preciso mais nada: **muda sozinho**. Ao abrir o WebTrader, `components/funded/biblioteca-tv.ts`
faz um `HEAD /charting_library/charting_library.standalone.js`; se responder, a vista «Negociar»
passa a ser `components/funded/grafico-tradingview.tsx` e fica por defeito. A resposta fica na
sessão do browser — para testar logo, abrir com `?grafico=tv`; para comparar com o nosso gráfico,
`?grafico=leve`. Se a biblioteca não arrancar em 20 s, volta ao gráfico leve.

O `middleware.ts` já deixa `/charting_library` e `/datafeeds` serem emoldurados pelo próprio site
(a biblioteca desenha-se num iframe da mesma origem; com `X-Frame-Options: DENY` ficava em branco).

## O que o adaptador faz (a validar com a biblioteca real)

- **Datafeed JS** (interface UDF sem servidor): histórico em `/api/mtmfunded/simulado/velas`
  (M1…D1, `ate=` para paginar para trás), tempo real com os preços de `/precos`, ficha do símbolo
  do catálogo `funded_symbols` (pricescale pelos dígitos, sessão pelas `sessoes`, timezone `Etc/UTC`).
- **Posições** → `createPositionLine()` (lucro ao vivo, «×» fecha, «modificar» põe SL/TP).
- **SL/TP e pendentes** → `createOrderLine()` arrastáveis (`onMove` grava pela API de ordens,
  `onCancel` remove/cancela).
- **Ordem em preparação** → as mesmas três linhas ligadas ao ticket pelo rascunho partilhado
  (`components/funded/rascunho-ordem.tsx`): escrever no ticket move-as, arrastá-las escreve no ticket.
- Foi escrito contra a documentação sem a biblioteca presente: tudo é `any` e protegido por
  `try/catch`. Na primeira instalação convém rever `grafico-tradingview.tsx` com a versão recebida
  (algumas versões devolvem Promises em `createOrderLine`/`createShape`; o código aceita ambos).

## Estudos MTM (GoldKiller, Sensei, MTM Scanner)

- Na vista «Análise» correm os scripts Pine publicados (`lib/scanners/estudos.ts`).
- **A biblioteca Advanced Charts não corre Pine.** Para ver os estudos desenhados dentro dela é
  preciso portá-los para JavaScript via `custom_indicators_getter` (trabalho futuro).
- O que funciona já, nos dois motores de negociação: os **sinais** que esses estudos deram
  (tabela `tradingview_signals` via `/api/mtm-alerts`) aparecem como setas na vela do sinal, com
  linhas ténues de entrada/SL/TP do sinal activo e o botão «Usar este sinal» (pré-preenche o ticket).
- Acesso por perfil (`lib/mtmfunded/acesso.ts`): membro/admin todos; torneio só GoldKiller.

## Licença e atribuição

A licença exige manter a atribuição ao TradingView visível (o logótipo/ligação que a biblioteca
mostra por defeito) e não remover os avisos de copyright dos ficheiros. Não desactivar a feature
de atribuição nas `disabled_features`.
