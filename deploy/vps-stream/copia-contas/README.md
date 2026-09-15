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
npx tsx lib/copia-contas/__tests__/copia-equipas.check.ts    # risco % TradeLocker, chaves casa×equipas, fontes partilhadas, migração 068
```

## Equipas MTM Auto, providers e chaves MetaApi (migração 083)

- Origem nova `prov:<mtmauto_providers.id>`: contas de estratégia (MT4/MT5, MTM Funded, TradeLocker) servem de
  fonte a rotas de cópia, com fan-out até 2000. Um provider nunca é destino.
- UMA fonte por conta física (e por chave MetaApi) para todas as rotas dessa conta — cliente e estratégia
  partilham a mesma ligação de streaming / a mesma sondagem TradeLocker (`lib/copia-contas/fontes.ts`).
- Cada conta usa a SUA chave (`lib/copia-contas/tokens.ts`): `site:`/`wt:`/`funded:` → casa; `auto:` de cliente
  de equipa com chave → chave da equipa; `prov:` com `metaapi_chave_equipa=true` → chave da equipa (nunca cai
  na da casa). Um limite na chave de uma equipa pausa só essa equipa; nunca chega ao guarda de quota da casa.
- Destinos TradeLocker em `risco_pct`: valor do tick pelo detalhe do instrumento (tickCost/tickSize por faixa
  de preço; sem ticks, lotSize só na mesma moeda — senão recusa), lote arredondado para BAIXO ao passo;
  detalhe em cache 12 h por conta+instrumento, lista de instrumentos 6 h, sessão partilhada 10 min.
- Fonte de uma estratégia (084): `mtmauto_trocar_fonte_execucao` muda a estratégia E a `origem_chave` das rotas
  `prov:` no mesmo commit (só com `espelho_alinhado(slug)`). A posição da conta espelho usa a identidade da
  MESTRE (trigger lê `ideia_ref='espelho-provider:<slug>:<posição>'`), por isso as chaves deduplicam; o serviço
  relê por PK as rotas antes de publicar factos, e uma fonte antiga nunca escreve em rotas que já mudaram.
- Pedidos do cliente pela app MTM Auto (`/copytrading`): linhas `auto:`→`auto:` com `estado='pedido'`, inactivas,
  em sombra — aprovam-se aqui como os pedidos do site.

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

1. Aplicar `supabase/migrations/078_copia_contas.sql` (feito a 15/09), depois `083_copia_equipas_providers.sql` e
   `084_estrategias_fonte_e_apagar.sql` (a 082 do espelho provider é independente; sem ela a troca para
   `fonte_execucao='espelho'` é recusada).
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

## Copiador MTM Funded (068) → rotas novas (e retirar o mtm-funded-copier)

As linhas de `funded_copiers` passam a rotas `funded:` normais (o trigger 078/083 emite os eventos):

```bash
npx tsx scripts/copia-contas/migrar-funded-copiers.ts                 # SECO: mostra o plano
npx tsx scripts/copia-contas/migrar-funded-copiers.ts --aplicar       # cria as rotas (repetível: copia_rotas.migrada_de)
npx tsx scripts/copia-contas/migrar-funded-copiers.ts --aplicar --desligar-antigos   # e ativo=false no 068
```

Activo → `estado='aprovada'`, `ativa=true`; inactivo → `pedido`. SEMPRE `modo='shadow'`. Mesmo modo de lote,
valor, lote máximo, máximo de posições, SL/TP, símbolos. `perda_diaria_max` não tem equivalente (fica nas
notas). Copiadores com cópias REAIS abertas não se migram (ficavam órfãs numa rota em sombra). A vista
`copia_rotas_todas` deixa de mostrar em duplicado o que já foi migrado.

**Retirar o serviço antigo** (depois de `mtm-copia-contas` estar instalado e com `[pulso]` vivo):
1. correr o script em seco, depois `--aplicar --desligar-antigos`;
2. `ssh mtm-stream 'systemctl stop mtm-funded-copier && systemctl disable mtm-funded-copier'`;
3. confirmar em «Eventos» que as rotas migradas registam `sombra` a cada trade da conta MTM Funded;
4. passadas 2 semanas sem uso: apagar `/opt/mtm/funded-copier` e `/etc/systemd/system/mtm-funded-copier.service`.
O trigger `funded_copy_emitir` (068) continua a escrever `funded_copy_events` enquanto houver copiadores
activos; com todos desligados não escreve nada.
