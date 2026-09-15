# MTM Premium Streaming (VPS)

Processo longo que mantém uma ligação de **streaming** MetaApi às contas do motor listadas em
`PREMIUM_STREAMING_CONTAS` e escreve a fotografia (posições + preços dos símbolos delas) em
`metaapi_snapshot`. O monitor de preço Premium (`lib/mtmcopy/premium-price-monitor.ts`, na Vercel)
usa essa fotografia em vez de `getPositions`/`getSymbolPrice` por RPC **só** quando é fresca (≤3 s)
e sincronizada. Em qualquer outro caso usa o RPC exactamente como antes.

Não decide nada e não envia ordens. As decisões (trailing, BE, parciais, fechos) e as ordens do
monitor não mudaram. Uma posição que **falta** na fotografia é sempre confirmada por RPC antes de
a linha ser encerrada.

Fonte: `services/premium-streaming/streaming.ts`; regras puras em
`lib/mtmcopy/metaapi-snapshot-regras.ts` (teste `lib/mtmcopy/__tests__/metaapi-snapshot.check.ts`).

## 1. Base de dados

Aplicar `supabase/migrations/071_metaapi_snapshot.sql` (tabelas `metaapi_snapshot` e
`metaapi_snapshot_sombra`, só service role).

## 2. Construir

```bash
node_modules/.bin/esbuild services/premium-streaming/streaming.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/premium-streaming/dist/streaming.js
npx tsx lib/mtmcopy/__tests__/metaapi-snapshot.check.ts
```

## 3. Variáveis — `/etc/mtm-premium-streaming.env` (chmod 600, root)

```
SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
METAAPI_TOKEN=…
PREMIUM_STREAMING_CONTAS=<UM id MetaApi para o teste>
# opcionais: PREMIUM_STREAMING_INTERVALO_MS=1000 · PREMIUM_STREAMING_BATIMENTO_MS=2000
```

```bash
grep -E '^(SUPABASE_SERVICE_ROLE_KEY|METAAPI_TOKEN)=' .env.local \
  | ssh mtm-stream 'sudo tee -a /etc/mtm-premium-streaming.env >/dev/null && sudo chmod 600 /etc/mtm-premium-streaming.env'
```

## 4. Instalar

```bash
scp deploy/vps-stream/premium-streaming/dist/streaming.js deploy/vps-stream/premium-streaming/mtm-premium-streaming.service mtm-stream:/tmp/
ssh mtm-stream 'sudo mkdir -p /opt/mtm/premium-streaming && sudo mv /tmp/streaming.js /opt/mtm/premium-streaming/ \
  && sudo mv /tmp/mtm-premium-streaming.service /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl enable --now mtm-premium-streaming'
ssh mtm-stream 'journalctl -u mtm-premium-streaming -f'   # esperar «sincronizada» e [pulso] com escritas a subir
```

Confirmar na Supabase que `metaapi_snapshot.em` anda (≤2 s) e `sincronizado=true`.

## 5. Ligar no monitor (Vercel)

Só depois do passo 4 estar estável: na Vercel, `PREMIUM_STREAMING_CONTAS=<o mesmo id>` e redeploy.
Deixar 1–2 dias e ler a sombra:

```sql
select date_trunc('hour', em) h, count(*) amostras, count(*) filter (where not iguais) diferentes,
       max(idade_ms) idade_max
from metaapi_snapshot_sombra group by 1 order by 1 desc;
select em, diferencas, preco_delta_pips from metaapi_snapshot_sombra where not iguais order by em desc limit 50;
```

Diferenças esperadas e aceitáveis: um `sl` que acabou de ser movido (≤1 s) e Δ de preço de 1–2 pips.
Inaceitável: contagens diferentes repetidas, posições «só no RPC» persistentes.

## Reverter

1. Vercel: apagar/esvaziar `PREMIUM_STREAMING_CONTAS` + redeploy → o monitor volta 100% ao RPC
   (nem lê a tabela). É o passo que basta.
2. VPS: `sudo systemctl disable --now mtm-premium-streaming`.
3. (Opcional) `drop table metaapi_snapshot_sombra; drop table metaapi_snapshot;`

## Leituras com mercado fechado

Independente disto: `SALTAR_LEITURAS_MERCADO_FECHADO` (default ligado; `0` desliga) faz o monitor
Premium, o monitor T2T, o signal tracker e o motor do MTM Auto não lerem a MetaApi ao fim de semana
(sexta 17:05 → domingo 16:55, hora de Nova Iorque) para contas/sinais sem cripto. Ver
`lib/mtmcopy/market-hours.ts`.
