# MTM Auto Premium — spec de execução fiel ao guia GMI (London/NY Intelligence)

Fonte: "The Signal Guide" (Global Market Intelligence). Objetivo: quando um sinal chega ao
**Premium** (relay GMI) e é replicado para o **MTM Auto** (mestre + CopyFactory), seguir a
**intenção exata do trader original** — para não haver os losses de fighting-the-trend (ex.
03/08: estávamos SELL num dia em que eles eram BUY → −625€).

## 1. Direção (o mais crítico — falhou hoje)
- `GOLD BUY NOW` → **LONG** (aposta na subida).
- `GOLD SELL NOW` → **SHORT**.
- **A execução TEM de tomar o MESMO lado do sinal.** Nunca inverter, nunca "ler o mercado" contra.
- Sem viés próprio: se o canal está BUY, o MTM Auto está BUY.

## 2. Entrada por ZONA
- `Gold Buy/Sell Zone X - Y` = **intervalo**, não preço único. Entrar dentro da zona.
- BUY: preço mais baixo na zona = melhor entrada. SELL: mais alto = melhor.
- Zona pode ter **entradas parciais** (scale-in). Se usar múltiplas, gerir cada uma.

## 3. Stop Loss
- `SL : Z` → **sempre** colocar, exatamente no nível dado. **Sem SL, não há trade. Nunca.**
- No OURO o SL é **mais largo** que forex — é esperado. **Dimensionar o lote ao SL** (ver §7),
  não apertar o SL. Apertar = ser varrido no 1º swing (foi o que aconteceu aos shorts a 4070).

## 4. Take Profits
- `TP1 / TP2 / TP3` → **fechar parte** em cada nível (parciais).
- `TP4 : Hold` → **runner**: segurar o resto para o movimento grande.
- `HIT TP1/2/3` → fechar a parcial + garantir o resto em BE.
- `HIT ALL TP` → **fechar tudo**, trade concluído.

## 5. Break-Even (nunca deixar um winner virar loser)
- **Assim que TP1 bate OU está claramente em lucro → mover SL para a ENTRADA (BE).** A partir daí
  a trade não pode ficar negativa.
- Mensagens `BE / Breakeven`, `SL UPDATED / Move SL to XXXX` → **mover o stop** para esse nível.
- `TP UPDATED` → ajustar o TP.
- `Trade active and running +XX PIPS` / `1st/2nd entry running` → fechar as entradas mais fracas
  e/ou mover SL para BE.

## 6. Limite diário (a regra que salva a conta — FALTA hoje)
- **Máximo 2–3 STOP LOSS por dia. Ao 3º SL, PARA o dia.** Sem revenge trading.
- `HIT SL` conta para o limite. (03/08 continuámos a operar depois de SLs grandes → pilha de −625.)

## 7. Sizing
- Regra base: **0.01 lote por 100 USD** de conta. Risco **1–3%** por trade (igual em todas).
- **Calcular o risco em €/$ ANTES de entrar** (SL do ouro é largo). Nunca entrar sem saber a perda máxima.
- Tabela: 500$→0.05 · 1000$→0.10 · 2500$→0.25 · 5000$→0.50 · 10000$→1.00.

## 8. Mapa mensagem → ação (parser)
| Mensagem GMI | Ação MTM Auto |
|---|---|
| GOOD MORNING / STANDBY | nada (aguardar) |
| NEW POSITION | preparar (sem ordem) |
| GOLD BUY/SELL NOW + zona/SL/TP | **abrir** no lado certo, na zona, com SL, parciais nos TP |
| Trade active and running +PIPS | fechar entradas fracas / mover SL→BE |
| HIT TP1/2/3 | fechar parcial + resto em BE |
| HIT ALL TP | fechar tudo |
| BE / SL UPDATED / Move SL | mover stop ao nível |
| TP UPDATED | ajustar TP |
| HIT SL | fechar (já é a perda); **+1 ao contador diário**; ao 3º → parar |

## Gaps vs implementação atual (a verificar/construir)
1. **Fidelidade de direção** — garantir que o parser toma exatamente BUY→long / SELL→short do texto GMI (hoje ficámos short vs long deles).
2. **Limite diário de SL (2–3 → stop)** — gate por dia na execução do Premium (o maior loss-preventer).
3. **BE automático no TP1** — mover SL→entrada quando TP1 bate (winner nunca vira loser).
4. **Parser das mensagens de gestão** (SL UPDATED / TP UPDATED / BE / HIT ALL TP) → agir na mestre + propagar aos seguidores.
5. **Sizing por SL** (0.01/100$, risco 1–3%, calcular pelo SL largo do ouro).

Relaciona: [[premium-zone-entry-engine]], [[telegram-relay-wifimoney]] (relay), auditoria 03/08 (short vs long).
