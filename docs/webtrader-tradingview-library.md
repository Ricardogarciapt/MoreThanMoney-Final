# WebTrader MTM Funded — gráfico e biblioteca TradingView

## O gráfico que corre hoje

Os web traders (WebTrader do MTM Funded e a faixa do dock do scanner) têm **um modo só**: o gráfico
de negociação `components/funded/grafico-leve.tsx`, feito com **Lightweight Charts v5** — o motor
open-source do TradingView (pacote npm `lightweight-charts`, Apache-2.0). Leva tudo no mesmo gráfico:
velas + painel de volume, posições com lucro ao vivo, pendentes, SL/TP/entrada arrastáveis, a
ferramenta de posição (zonas de risco/alvo como primitiva de série), as setas dos sinais dos estudos
MTM, timeframes 1m…1D e a negociação num clique (`components/funded/um-clique.tsx`).

Não há vista de «Análise» nem interruptor, nem parâmetro `?grafico=`. O gráfico gratuito do
TradingView (`tv.js`) fica só no separador Scanner.

**Atribuição (licença do Lightweight Charts):** `layout.attributionLogo: true` mostra o logótipo
«Charts by TradingView» com ligação. Não desligar — é condição do NOTICE do projecto.

## A biblioteca licenciada (adormecida)

O `components/funded/grafico-tradingview.tsx` é o adaptador para a biblioteca licenciada. Não está
ligado a nenhum botão: o `components/funded/funded-grafico.tsx` faz um `HEAD` a
`/charting_library/charting_library.standalone.js` e só o usa se a biblioteca lá estiver **e** tiver as
primitivas de trading. Caso contrário (ou se falhar a arrancar em 20 s), fica o Lightweight.

### Pedir a edição certa: «Trading Platform»

Desde a v29, `createOrderLine`, `createPositionLine` e `createExecutionShape` **só existem na
Trading Platform** — o «Advanced Charts» simples não as tem
(<https://www.tradingview.com/charting-library-docs/latest/trading_terminal/Trading-Primitives/>).
Sem elas não há linhas de posição/ordens arrastáveis, que é a razão de ter a biblioteca.

1. Ir a <https://www.tradingview.com/trading-platform/> e pedir a **Trading Platform** (não só o
   Advanced Charts), em nome da empresa (MoreThanMoney), domínio `morethanmoney.pt`.
2. A Trading Platform traz também a **Broker API**, o **Account Manager** (painel de conta, posições
   e ordens) e o **DOM** (profundidade de mercado) — ficam disponíveis para uma fase seguinte.
3. Não publicar os ficheiros em repositórios públicos nem em CDNs — é condição da licença.

### Onde pôr os ficheiros

```
public/charting_library/      ← a pasta charting_library inteira (charting_library.standalone.js, bundles/, *.html…)
public/datafeeds/             ← se vier no pacote (não é usado: o datafeed é nosso, em JS)
```

O `middleware.ts` já deixa `/charting_library` e `/datafeeds` serem emoldurados pelo próprio site
(a biblioteca desenha-se num iframe da mesma origem).

A detecção fica na sessão do browser (`sessionStorage`); numa sessão nova é revista.

### O que o adaptador faz (a validar com a biblioteca real)

- **Datafeed JS** (interface UDF sem servidor): histórico em `/api/mtmfunded/simulado/velas`
  (M1…D1, `ate=` para paginar para trás), tempo real com os preços de `/precos`, ficha do símbolo
  do catálogo `funded_symbols` (pricescale pelos dígitos, sessão pelas `sessoes`, timezone `Etc/UTC`).
- **Detecção da edição:** ao arrancar pergunta `typeof chart.createOrderLine === 'function'`. Se não
  houver (Advanced Charts), avisa «Linhas de ordens exigem a biblioteca Trading Platform» e o
  WebTrader volta ao Lightweight — nunca fica um gráfico sem as posições.
- **Posições** → `createPositionLine()` (lucro ao vivo, «×» fecha, «modificar» põe SL/TP).
- **SL/TP e pendentes** → `createOrderLine()` arrastáveis (`onMove` grava pela API de ordens,
  `onCancel` remove/cancela). Tudo passa pela negociação num clique: desligada pede confirmação,
  cancelada ou falhada a linha volta ao sítio.
- **Ordem em preparação** → as mesmas três linhas ligadas ao ticket pelo rascunho partilhado
  (`components/funded/rascunho-ordem.tsx`).
- Escrito contra a documentação sem a biblioteca presente: tudo é `any` e protegido por `try/catch`.

## Estudos MTM (GoldKiller, Sensei, MTM Scanner)

- Nenhum dos motores de negociação corre Pine. Os **sinais** que esses estudos deram (tabela
  `tradingview_signals` via `/api/mtm-alerts`) aparecem como setas na vela do sinal, com linhas
  ténues de entrada/SL/TP do sinal activo e «Usar este sinal» (só pré-preenche o ticket, nunca envia).
- Os botões dos estudos na barra do gráfico ligam/desligam essas setas.
- Acesso por perfil (`lib/mtmfunded/acesso.ts`): membro/admin todos; torneio só GoldKiller.
