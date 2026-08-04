# Sensei X — ajustes cirúrgicos (auditoria de sinais 2026-08-03)

Base: o script real "MTM — Sensei X" (@version=6). NÃO reescrever — aplicar 3 blocos.

## Porquê (dados: 524 trades fechados)
- Só **M5 BUY** positivo (+11R). **M15 = −302R.** SELL partido em TODOS os TFs (1.8–4.4% win).
- Maioria dos símbolos ~100% loss → entradas contra a tendência maior a serem varridas.
- Winners correm até ao TP3 → a escada de TP está boa; o que falha é a ENTRADA e o LADO.

## BLOCO 1 — inputs (viés de lado + HTF200 + validados)
Anchor (linha existente no grupo FILTROS DE QUALIDADE):
```
confirmClose = input.bool(true, 'Apenas Fecho de Vela', group = gr_filters, tooltip = 'ON: signals only on closed bars (no intrabar repaint). Recommended for webhooks.')
```
Substituir por:
```
confirmClose = input.bool(true, 'Apenas Fecho de Vela', group = gr_filters, tooltip = 'ON: signals only on closed bars (no intrabar repaint). Recommended for webhooks.')
htfEmaLen = input.int(200, 'EMA do HTF (200 = tendencia forte)', minval = 20, group = gr_filters, tooltip = 'Auditoria 2026-08: entradas contra a tendencia maior foram varridas. 200 filtra melhor que 50.')

// ─── VIES DE LADO + SETUPS VALIDADOS (auditoria de sinais 2026-08-03) ───
gr_bias = '━━━ VIES DE LADO (auditoria) ━━━'
allowBuy = input.bool(true, 'Permitir COMPRAS', group = gr_bias)
allowSell = input.bool(false, 'Permitir VENDAS', group = gr_bias, tooltip = 'Auditoria: SELL 1.8-4.4% win em TODOS os timeframes (-374R). OFF por defeito. So liga se validares um edge de venda.')
sellExtra = input.int(3, 'Score extra exigido p/ VENDA', minval = 0, maxval = 8, group = gr_bias, tooltip = 'Se ligares VENDAS, exige +N confirmacoes face a COMPRA (venda so com sinal muito forte).')
strictAuto = input.bool(false, 'So operar setups validados (auto)', group = gr_bias, tooltip = 'ON: bloqueia sinais em pares/timeframes SEM config walk-forward validada. Corta exposicao a setups nao testados (a maioria perdia ~100%).')
```

## BLOCO 2 — HTF usa EMA200
Anchor:
```
htfEma = request.security(syminfo.tickerid, htfTF, ta.ema(close, 50))
```
Substituir por:
```
htfEma = request.security(syminfo.tickerid, htfTF, ta.ema(close, htfEmaLen))
```

## BLOCO 3 — gatilhos de sinal (lado + validados)
Anchor:
```
isBuySignal = base_buy and bull_score >= eff_minScore and buy_conf and cooldown and inSess and chopOK and bar_ok and htfBuyOK
isSellSignal = base_sell and bear_score >= eff_minScore and sell_conf and cooldown and inSess and chopOK and bar_ok and htfSellOK
```
Substituir por:
```
_validOK = not strictAuto or a_valid
isBuySignal = allowBuy and base_buy and bull_score >= eff_minScore and buy_conf and cooldown and inSess and chopOK and bar_ok and htfBuyOK and _validOK
isSellSignal = allowSell and base_sell and bear_score >= eff_minScore + sellExtra and sell_conf and cooldown and inSess and chopOK and bar_ok and htfSellOK and _validOK
```

## OPCIONAL — sessão (evitar chop asiático)
```
useSession = input.bool(true, 'Filtro de Sessao', ...)      // era false
sessStr = input.session('0700-2000', 'Sessao Permitida', ...) // era 0000-2400 (hora do gráfico)
```

## Efeito
- VENDAS OFF por defeito → mata o lado que perdia sempre.
- HTF EMA200 → só a favor da tendência maior (corta os ~100%-loss).
- `strictAuto` (quando ligado) → só BTC/ETH/XAU/JPY @1h e NAS/CAD @15m (os validados).
- Payload/alertas inalterados — encaixa no webhook `?secret=mtm-tv-sensei-2026`, `alert_name=MTM Sensei X`.
