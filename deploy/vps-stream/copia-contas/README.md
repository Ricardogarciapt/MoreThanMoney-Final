# Cópia entre contas (VPS) — mtm-copia-contas

Copia posições de uma conta de ORIGEM para uma conta de DESTINO do mesmo dono, entre MTM Funded,
MT4, MT5 e TradeLocker. Fonte: `services/copia-contas/servico.ts`; as decisões (lote, símbolo,
filtros, SL/TP, parciais, idempotência, fechaduras) estão em `lib/copia-contas/` com testes.

```
MTM Funded ── trigger 078 ────────────────▶ copia_eventos ─▶ motor ─▶ sombra: acção pretendida
MT4/MT5 ───── streaming MetaApi (1/conta) ─▶  (chave única)          live:   adaptadores
TradeLocker ─ sondagem ≥2 s (1/conta) ─────▶                                (REST /trade, TL, funded_*)
```

## Estado desta entrega: SÓ SOMBRA

Três fechaduras, todas fechadas:
1. `site_settings.copia_contas = {"ligado": false}` — sem isto o processo não liga fontes nem consome
   eventos (só escreve o pulso 1×/min). Liga-se em «MTM Auto · Cópia › Visão geral» com «CONFIRMAR».
2. Por rota: `estado='aprovada'` e `ativa=true` (admin). Rotas de clientes chegam como `pedido`.
3. Live: `copia_rotas.modo='live'` (pedido com «LIGAR») **e** `site_settings.copia_contas_live_desbloqueado=true`
   (a base recusa modo live sem isto — trigger `copia_rotas_guarda`) **e** `COPIA_ESCRITA=1` neste processo.

## Testes

```bash
npx tsx lib/copia-contas/__tests__/copia-contas.check.ts     # lotes, símbolos, ciclos, parciais, sombra nunca escreve
npx tsx lib/copia-contas/__tests__/sincronizacao.check.ts    # «Sincronizar tudo» com fotografias
npx tsx lib/copia-contas/__tests__/admin-auth.check.ts       # rotas do admin só para admins
```

## Construir

```bash
node_modules/.bin/esbuild services/copia-contas/servico.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/copia-contas/dist/servico.js
```

## Variáveis — `/etc/mtm-copia-contas.env` (chmod 600, root)

```
NEXT_PUBLIC_SUPABASE_URL=https://iwscxotvmtkphajmasof.supabase.co
SUPABASE_SERVICE_ROLE_KEY=…
METAAPI_TOKEN=…
MTMFUNDED_CRED_KEY=…        # decifrar credenciais TradeLocker
COPIA_ESCRITA=0             # 0 = sombra, sempre, mesmo com rota em live
# opcionais: COPIA_SONDAGEM_MS=10000 (rede da outbox; o Realtime acorda) · COPIA_LOTE=50 · COPIA_TL_MIN_MS=2000
```

## Instalar (não feito nesta entrega)

1. Aplicar `supabase/migrations/078_copia_contas.sql`.
2. `scp dist/servico.js mtm-copia-contas.service mtm-stream:/tmp/` → `/opt/mtm/copia-contas/` e
   `/etc/systemd/system/`, `systemctl enable --now mtm-copia-contas`.
3. `journalctl -u mtm-copia-contas -f` — `[pulso]` de minuto a minuto, `[sombra] open #id … → sombra {acção}`.

## Passar a live (decisão do dono, fora desta entrega)

Semanas em sombra com contas DEMO a dar lotes/SL/TP certos em «Eventos» → `update site_settings set
value='true' where key='copia_contas_live_desbloqueado'` → `COPIA_ESCRITA=1` + restart → rota a rota,
«pedir live» com «LIGAR». Voltar atrás: desligar o interruptor global (efeito em ≤30 s).

## Custo MetaApi

Cada conta MT de ORIGEM com rota activa é uma ligação de streaming permanente (a conta fica deployed
24 h — conta para a quota do dono e para a factura). Destinos MT: leituras REST com cache (símbolos e
specs 1 h, conta 5 s) e ordens por POST /trade. Nenhum RPC, nenhum getPositions em sondagem. Ao
primeiro erro de limite da MetaApi as fontes fecham 1 h (a entrega aos subscritores tem prioridade).

## Copiador MTM Funded (068)

`mtm-funded-copier` continua a correr sobre `funded_copiers`/`funded_copy_events` sem mudanças. As
linhas dele aparecem no admin e na vista `copia_rotas_todas`; migrá-las para rotas novas é decisão à parte.
