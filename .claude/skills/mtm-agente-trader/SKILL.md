---
name: mtm-agente-trader
description: >-
  Agente Trader MTM: aplica o método do day-trader-skill (máquina do tempo, risco, orçamento,
  papel primeiro) aos sinais e estratégias da casa — MTM Scanner, Premium, Sensei, GoldKiller,
  TrendShot, Aurum — na conta de papel 77549217. Use quando pedirem «como está o agente trader»,
  «que estratégias têm vantagem», «porque é que ele não abriu», «arma/desarma o trader», «muda a
  régua do trader», ou para ligar alertas/webhooks do TradingView ao agente.
license: MIT
---

# mtm-agente-trader

As 11 skills `trader-*` ao lado desta são o pacote original (acções EUA, dados Yahoo/SEC). Para
ouro, forex, índices e cripto da MTM o método está no código do site:

| peça do day-trader-skill | onde vive na MTM |
| --- | --- |
| trader-timemachine | `lib/agentes/trader-disciplina.ts` → `vantagemPorCombo`, sobre a vista `agente_trader_vantagem` (migração 213: posições SIM fechadas, 60 dias) |
| trader-risk | `riscoRecompensa` (RR ao último TP) e `travaoDiario` (perda do dia) |
| trader-budget | `abrirSinalNaConta` (lote por 1000 de saldo, `lib/mtmfunded/estrategias-sinais`) |
| trader-broker | `contaSegura()` em `lib/agentes/trader.ts`: só conta `motor='sim'` sem MetaApi |
| trader-scanner / trader-entry | os estudos `lib/estudos/{trendshot,sensei,goldkiller,mtmscanner}` e os webhooks TradingView → `mestres_sinais` |
| trader-alerts | MTM Alerts, chats e Telegram (já existentes) |

## Fluxo

1. Webhook TradingView (`?strategy=...`, JSON com `ticker`, `close`, `action`) → mestre → `mestres_sinais`.
2. Vigia `agente-trader` no VPS `mtm-vigias` (de minuto a minuto) → `correrTrader`.
3. Recusa por ordem: dados/SL → frescura 15 min → duplicado → travão do dia → RR → vantagem → limites.
4. Abre na 77549217 com chave `agente-trader:…`; regista no livro (`agentes_eventos`, AG-TRADER).

## Régua (sem código)

`site_settings.agente_trader`:

```json
{ "armado": true,
  "regua": { "minAmostra": 20, "minRMedio": 0.05, "margemErros": 0, "minRR": 1, "perdaDiariaMax": 0.02 } }
```

## Consultas úteis

```sql
-- o que tem vantagem hoje
select estrategia, symbol, n, ganhos, round(pnl::numeric,2) pnl, round((soma_r/n)::numeric,3) r_medio
from agente_trader_vantagem where n >= 20 and pnl > 0 order by pnl desc;

-- desempenho do agente em papel
select count(*) filter (where fp.estado='fechada') fechadas, round(sum(fp.pnl)::numeric,2) pnl
from funded_sinal_posicoes sp join funded_positions fp on fp.id = sp.funded_position_id
where sp.chave like 'agente-trader:%';
```

## Regras que não se negociam

- Papel primeiro. Conta real só com o sim explícito do Ricardo, por escrito.
- Nunca inventar taxas de acerto: só o que a base mede, com a amostra (n) ao lado.
- Disclaimer em tudo o que sair: «Conteúdo educativo, não constitui consultoria financeira.»
