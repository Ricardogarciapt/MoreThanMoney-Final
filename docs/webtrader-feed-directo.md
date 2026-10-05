# WebTrader — feed directo da conta do cliente

**Desde 05/10/2026.** Quando o cliente abre no WebTrader uma conta real ligada (MT4/MT5 pela MetaApi ou
TradeLocker), as **cotações, as velas do gráfico, as posições, as ordens e o saldo/equity vêm directamente da
ligação dessa conta à corretora, puxadas pelo browser dele** — não do nosso VPS nem de reencaminhamento.
O WebTrader passa a comportar-se como um «fork do MetaTrader» com o nosso estilo: o cliente opera com os
dados dele, nós poupamos VPS. **As ordens continuam a sair pelo servidor** (`/api/webtrader/[plataforma]/…`,
auditadas); o browser recebe só credenciais **de leitura**.

## O que corre onde

| | browser do cliente | servidor (Vercel) |
|---|---|---|
| credencial curta | pede-a (`POST /api/webtrader/feed-directo/token {ref}`) | emite-a: MT → `autorizarMt5` (posse+quota+chave casa/equipa) + narrow-down MetaApi (papel `reader`, 2 h); TL → `TradeLockerSessao.fichaSoLeitura()` (accessToken, **sem refreshToken**) |
| cotações | MT: SDK web da MetaApi (`import('metaapi.cloud-sdk/web')`), 1 subscrição `quotes` por símbolo visível; TL: `GET /trade/quotes` a 1,5 s por símbolo visível | — |
| velas | MT: `getHistoricalCandles` (≤1000/pedido, ≤5 concorrentes); TL: `GET /trade/history` (≤20 000, 3/s) — escritas no armazém como série `conta:<ref>\|símbolo:tf` | — (a rota `/api/mtmfunded/simulado/velas` fica para o feed MTM) |
| posições / ordens / conta | MT: empurradas pelo stream (`terminalState`); TL: sondagem 3 s | reconciliação de 60 s (e o estado da gestão automática, que é do servidor) |
| ordens, modificar, fechar | — | como sempre, pelo adaptador da corretora |
| batimento | `POST /api/webtrader/feed-directo/pulso` a cada 60 s | `webtrader_feed_pulsos` (quem lê que conta, por que caminho) |

Ficheiros: `lib/webtrader/feed-directo/{tipos,narrow-down,emitir,normalizar,metaapi,tradelocker,ligar,fonte,avisador}.ts`,
`hooks/use-feed-conta.ts`, `components/funded/armazem-velas.ts` (fonte directa), `components/webtrader/corretora-trader.tsx`,
migração `180_webtrader_feed_directo.sql`.

## Fallback

`useFeedConta` dá `fonte: 'conta' | 'mtm'`. Sem conta ligada, credencial recusada (403/404) ou feed caído
**mais de 10 s** → cai para o feed MTM (`usePrecos`, indicativo) e o badge passa a «Preço indicativo MTM»;
mal o feed volte a `ligado`, volta a «Dados da tua corretora». Símbolos que a conta não tem (só do catálogo)
lêem-se sempre do MTM. Regra pura em `fonte.ts`, provada em `fonte.check.ts`.

## Limites por plataforma

**MetaApi (MT4/MT5)**
- quotes por WS: G1 dá no máximo 1 tick por 2,5 s por símbolo; subscreve-se SÓ o que está no ecrã e desubscreve-se ao sair;
- velas: ≤1000 por pedido, ≤5 pedidos históricos concorrentes por conta (semáforo); MT5 dá 1m 2m 3m 4m 5m 6m 10m 12m 15m 20m 30m 1h 2h 3h 4h 6h 8h 12h 1d 1w 1mn, MT4 só 1m 5m 15m 30m 1h 4h 1d 1w 1mn — o que a plataforma não dá agrega-se do maior divisor que ela dá (`timeframeParaDerivar`);
- render coalescido a ~1/s; reconexão é do SDK;
- bundle do SDK: ~6,8 MB minificado (≈1,5 MB gzip), carregado por `import()` só em contas MT. Escolhido em vez de um socket.io à mão porque o protocolo de streaming (instâncias, hashes, sequência, re-sincronização) é o que o SDK já resolve e é o mesmo que o motor usa; uma segunda implementação seria mais um sítio para errar com dinheiro real.

**TradeLocker**
- não há WS de preços: cotações por sondagem (≤10/s no total, fila ritmada a 110 ms), posições/ordens/estado a 3 s, histórico 3/s (fila a 350 ms), ≤20 000 barras, resoluções 1m 5m 15m 30m 1H 4H 1D 1W 1M;
- o accessToken dura o que a TradeLocker disser (`expireDate`); o hook renova 2 min antes pedindo ao servidor, que usa o refresh do cofre;
- `tl-developer-api-key`: dá limites mais largos. Pede-se à TradeLocker (suporte/parceiros: developer-api-key para a nossa integração); no servidor vai na env `TRADELOCKER_DEVELOPER_API_KEY` (header `developer-api-key`). **Não se envia ao browser** — é nossa, não do cliente.

## Custos MetaApi (o que isto muda e o que não muda)

- **Conta deployed**: factura-se por conta deployed, **mínimo 6 h por arranque**. O feed directo não faz deploy nem undeploy: uma conta desligada aparece com «Ligar conta» (acção explícita) e a política de undeploy das ociosas continua a ser a de sempre.
- **Subscrição de streaming**: cada browser com o feed ligado abre uma ligação de streaming à conta (como o motor para as providers). Conta para a factura de subscrições. Dois separadores = duas ligações (o registo do hook partilha dentro do mesmo separador, não entre separadores).
- **Quotes**: cada símbolo subscrito conta; por isso só os visíveis.
- **Histórico**: pedidos de velas são REST facturados por pedido — a cache do armazém (memória + IndexedDB) evita repetir.
- **Narrow-down**: grátis; a cache em `webtrader_feed_tokens` evita um pedido por abertura.

Nada disto depende de créditos para **preços do motor/sinais** — regra do dono (ver memória `metaapi-so-entrega-slaves`): aqui a MetaApi serve a conta do cliente, paga no plano dele (quota em `lib/contas/quota-metaapi.ts`).

## Decisões pendentes (dono)

1. **Undeploy automático** com base nos pulsos (`webtrader_feed_pulsos.ultimo_pulso`): NÃO está ligado. Risco: contas slave da cópia têm de ficar deployed; e cada arranque custa 6 h.
2. **Timeframes no gráfico**: a lista é `TIMEFRAMES` em `components/funded/grafico-tipos.ts` (do outro agente). `timeframesSuportados(TIMEFRAMES, plataforma, versao)` em `normalizar.ts` filtra pelo que a conta dá, mas `funded-grafico.tsx` ainda não recebe uma prop para a usar — entretanto um timeframe que a plataforma não tem agrega-se do que ela tem.
3. **Troca de série ao ligar o feed**: o gráfico guarda a chave da série por símbolo+tf; quando o feed liga a meio, a série actual só troca para a da conta na próxima mudança de símbolo/timeframe (a vela viva já usa a cotação da conta).

## Guardas

```
npx tsx lib/webtrader/feed-directo/normalizar.check.ts   # XAUUSD.r/GOLD → XAUUSD, timeframes, fichas, TL
npx tsx lib/webtrader/feed-directo/narrow-down.check.ts  # o corpo do token nunca tem trade/writer
npx tsx lib/webtrader/feed-directo/fonte.check.ts        # fallback conta→mtm→conta
```
