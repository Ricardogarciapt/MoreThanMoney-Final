# Golden Zone by MTM — descrição para o TradingView

Script: `docs/pine/golden-zone.pine` (Pine v6, overlay). Publicar como **Invite-only**. Depois de publicado,
trocar o id em `lib/scanners/estudos.ts` (`GoldenZone`) e, quando o PR da entrega dos links existir,
acrescentar a página do script em `LINKS_SCRIPTS_POR_SCANNER`.

## Título
Golden Zone by MTM

## Descrição (EN)

Golden Zone by MTM is a gold scalping tool for the 5-minute chart. It does not chase price: it marks the
level where price broke out and draws the plan for you to wait for the pullback.

**Psychological levels.** Black lines every 5 $ in gold (automatic step in other markets), ten around price. They are the only fixed lines on the chart; every other line belongs to the active position.

**Check and zone.** When a candle closes beyond a level with the trend (EMA 50 over EMA 200 for buys, under
for sells), a yellow check appears above the candle together with a 1 $ box centred on the level. The
*Zone of action* is the edge on the price side (buy at 4070: box 4069.50–4070.50, zone of action 4070.50).

**Plan on the next candle.** When the candle after the check closes, the levels appear, written on the
line with the price, with the lines starting at the check candle: *Invalidation zone* 1.5 $ away (150 points), *Exit 1* at +1.5 $ and *Exit 2* at
+3 $. Example: zone 4070.50 → invalidation 4069.00, Exit 1 4072.00, Exit 2 4073.50. The entry is yours: a limit
order inside the zone when price pulls back.

**Gold flag.** When Exit 1 is touched the gold flag appears. Exit 2 or the invalidation close the plan:
the box and the lines stop at the closing candle. A new check clears every drawing of the previous one, so the
tool is followed live.

**Stats table** (off by default): signals, plans, Exit 1 / Exit 2 hits, invalidations and Exit 1 rate.

**Inputs:** psychological lines (count, colour), zone colours, stats table (position, size), colours of
the zone of action, Exit 1, Exit 2 and invalidation and offset (20 bars ahead for the lines) for the active position, psychological
step (0 = auto), stop distance in half zones (3 = 1.5 $ in gold) and the trend filter (the EMAs are not drawn).

**Alerts.** Create one alert with *Any alert() function call*, once per bar close. Each event goes out as
JSON (`signal`, `plan`, `exit1`, `exit2`, `invalidation`) with the level, zone, invalidation, Exit 1 and
Exit 2, ready for webhooks. Simple alerts for the follow-up of the same trade: *Golden Zone Compra*, *Venda*,
*Plano*, *Exit 1*, *Exit 2*, *Invalidação*.

Educational content. This is not financial advice; it does not place orders and results are not guaranteed.

## Descrição (PT)

A Golden Zone by MTM é uma ferramenta de scalping de ouro para o gráfico de 5 minutos. Não corre atrás do
preço: marca o nível que o preço rompeu e desenha o plano para esperares pelo recuo.

Níveis psicológicos de 5 em 5 $ · visto amarelo e zona de 1 $ no rompimento a favor da tendência (EMA
50/200) · plano completo no fecho da vela seguinte: invalidação a 1,5 $ (150 pontos), Saída 1 a +1,5 $ e
Saída 2 a +3 $ · bandeira dourada na Saída 1 · tabela de estatísticas opcional · alertas JSON por evento e
alertas simples de seguimento (Plano, Exit 1, Exit 2, Invalidação), prontos para webhook.

Conteúdo educativo, não constitui consultoria financeira. Não executa ordens nem garante resultados.

## Alerta para o webhook MTM
`Any alert() function call` · Once Per Bar Close · URL:
`https://www.morethanmoney.pt/api/webhooks/tradingview?strategy=goldenzone&secret=<secret>`
(a chave `goldenzone` ainda não está mapeada em `lib/mtm-alerts/scanners.ts`; fica para o PR do webhook,
como no Quantum.)
