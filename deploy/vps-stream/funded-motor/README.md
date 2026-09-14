# MTM Funded — motor de simulação (VPS)

O processo longo que dá vida às contas simuladas: escreve os preços (`funded_precos`), fecha por
SL/TP e stop-out, executa pendentes, mede equity/margem, aplica as regras do programa ou do
torneio, vira o dia às 22:00 UTC, tira fotografias de equity e mantém `metricas` na forma do cron
do MT5. Fonte: `services/funded-motor/` (a avaliação pura está em `avaliacao.ts`, com teste).

O site nunca chama esta máquina. Quando uma conta quebra ou passa, o motor avisa o site em
`POST /api/mtmfunded/simulado/motor` (cabeçalho `x-caption-secret`), e é o site que manda os
emails, emite o certificado e abre a fase seguinte.

## Antes de ligar

Por esta ordem, na Supabase:

1. `supabase/migrations/064_funded_symbols_classes.sql` — classes novas, `moeda_lucro`, `sessoes`,
   `funded_precos_pedidos`, e as funções atómicas `funded_fechar_posicao` / `funded_executar_pendente`
   / `funded_somar_saldo`. **Sem ela o motor em modo 1 falha ao fechar posições.**
2. `supabase/seeds/funded_symbols_puprime.sql` — o catálogo da PU Prime (gerado por
   `npx tsx scripts/funded-sync-simbolos.ts`; voltar a correr quando a corretora mudar).

## Construir

```bash
node_modules/.bin/esbuild services/funded-motor/motor.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/funded-motor/dist/motor.js
npx tsx services/funded-motor/teste-avaliacao.ts   # tem de dizer «todos certos»
```

Um só ficheiro (~3 MB, com o SDK da MetaApi e a Supabase lá dentro): o VPS não precisa de
`node_modules`. `dist/` não vai para o git.

## Variáveis — `/etc/mtm-funded-motor.env` (chmod 600, root)

```
SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
METAAPI_TOKEN=…
METAAPI_CONTA_PRECOS=530d2e07-b391-440f-bc6e-f4c2a224057b   # PU Prime · «MTM Auto Premium»
LMS_CAPTION_WORKER_SECRET=…                                   # o mesmo dos outros workers
MTM_API_BASE=https://www.morethanmoney.pt
MOTOR_ESCRITA=0          # 0 = só decide e escreve no log; 1 = a sério
# opcionais: MOTOR_INTERVALO_MS=1000 · MOTOR_DESVIO_CORRETORA_MIN=180
```

Copiar segredos sem os mostrar:

```bash
grep -E '^(SUPABASE_SERVICE_ROLE_KEY|METAAPI_TOKEN|LMS_CAPTION_WORKER_SECRET)=' .env.local \
  | ssh mtm-stream 'sudo tee -a /etc/mtm-funded-motor.env >/dev/null && sudo chmod 600 /etc/mtm-funded-motor.env'
```

## Instalar / actualizar

```bash
scp deploy/vps-stream/funded-motor/dist/motor.js deploy/vps-stream/funded-motor/mtm-funded-motor.service mtm-stream:/tmp/
ssh mtm-stream 'sudo mkdir -p /opt/mtm/funded-motor && sudo mv /tmp/motor.js /opt/mtm/funded-motor/ \
  && sudo mv /tmp/mtm-funded-motor.service /etc/systemd/system/ && sudo systemctl daemon-reload \
  && sudo systemctl enable --now mtm-funded-motor && sudo systemctl restart mtm-funded-motor'
ssh mtm-stream 'journalctl -u mtm-funded-motor -f'
```

## Passar a modo 1

Só depois de: 064 e o seed aplicados; umas horas em modo 0 com linhas `[pulso]` a mostrar preços
e nenhuma linha `[seco]` absurda; o site com a rota `/api/mtmfunded/simulado/motor` em produção.
Então `MOTOR_ESCRITA=1` no ficheiro e `systemctl restart mtm-funded-motor`.

## O que ler no log

- `[pulso]` de minuto a minuto: ticks/min, contas, desvio da hora da corretora, preços base.
  Três minutos sem um tick (o BTC negoceia 24/7) → o processo sai e o systemd reinicia-o.
- `[seco] …` (modo 0): o que o motor faria — fechos, execuções, quebras, viragem do dia.
- `[evento] quebrou|objetivo … → 200`: o site recebeu. Enquanto não receber, `metricas.eventoPendente`
  fica na conta e o motor volta a tentar de 30 em 30 segundos.

## Regras de execução (as que se publicam)

- SL/TP fecham ao nível exacto, sem requotes; SL e TP no mesmo tick → vale o SL.
- Pendentes executam ao preço da ordem; sem margem, cancelam. A comissão é debitada à abertura.
- Stop-out abaixo de 50% de nível de margem: fecha a pior posição, uma de cada vez.
- Fora da sessão da corretora não há fills; o último preço fica.
- Swap ainda não é cobrado (as colunas existem; falta a regra de rollover).
