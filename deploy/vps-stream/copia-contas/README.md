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

## Mestres nossas (migração 116) — o motor envia directamente para as contas dos clientes

Decisão do dono (18/09): a mestre de cada estratégia é uma conta **SIM da casa** (MTM Funded, motor `sim`) e
este serviço envia cada facto dela — abrir, parcial, SL/BE/trailing, fechar — para as contas dos clientes
(MT4/MT5 por REST `/trade`, TradeLocker por API), **sem CopyFactory**. Regras em `lib/mestres/`; o motor é o
da cópia (`lib/copia-contas/motor.ts`) com ganchos. Rotas `copia_rotas.mestres=true` (tipo `estrategia` ou `t2t`).

```
sinal (TradingView GK/Sensei · pv-relay Edge/King/Wolf) ──▶ mestre SIM (funded_positions, gestão sinais_config)
                                                             │ trigger 083 → copia_eventos (1 por facto × conta)
T2T aceite (/api/mtmcopy/tap-to-trade) ── evento «open:aceite» ┤
                                                             ▼
             mtm-copia-contas: kill-switch → decisão (global×estratégia×conta×escrita×CF cortada)
                → guardas de ABERTURA (pausa, exposição, atraso, duplicado entre caminhos, T2T aceite)
                → 1 escrita/conta, ceil(n/5)/servidor → corretora → re-ancora SL/TP na entrada REAL
                → mestres_ordens (pedido/resposta/latência) · falhas → mestres_alertas (+Telegram)
```

### Fechaduras (todas começam fechadas)
1. `site_settings.mestres_motor = {"ligado":false,"kill":false,"live_desbloqueado":false}` — relido de 2 em 2 s.
2. `mestres_estrategias.modo` / `t2t_modo` / `sinal_modo`: `desligado | sombra | live` (nascem desligados).
3. `mestres_contas.modo`: `sombra | live` (conta sem linha = sombra).
4. `MESTRES_ESCRITA=1` em `/etc/mtm-copia-contas.env`.
5. Para `modo='live'` a base exige `copyfactory_cortado_em` (script de corte) e, com `incluir_mtmauto`, `mtmauto_cortado_em`.

**Kill-switch** (≤ 2 s; nada é enviado, nem saídas; eventos ficam na fila): `npx tsx scripts/mestres/kill.ts on`
ou `update site_settings set value = jsonb_set(value,'{kill}','true') where key='mestres_motor';`.
Levantar: `... kill.ts off` — aberturas mais velhas do que `max_atraso_abertura_s` (30 s) são recusadas; saídas seguem.

### Variáveis novas — `/etc/mtm-copia-contas.env`
```
MESTRES_ESCRITA=0              # 1 só na semana do corte (sem isto, tudo é sombra)
# opcionais
# MESTRES_SONDAGEM_MS=1000     # fila das mestres sondada de 1 em 1 s enquanto o motor está ligado
# MESTRES_FALHAS_ALERTA=3      # falhas técnicas seguidas numa conta → alerta
# MESTRES_FALHAS_BLOQUEIO=6    # → deixa de ABRIR nessa conta (saídas continuam); 0 = nunca
# TELEGRAM_BOT_TOKEN=… TELEGRAM_ADMIN_CHAT_ID=…   # alertas também para o Telegram do admin
```

### Construir / instalar (substitui o mesmo serviço)
```bash
node_modules/.bin/esbuild services/copia-contas/servico.ts --bundle --platform=node --target=node18 \
  --format=cjs --minify-syntax --legal-comments=none --external:bufferutil --external:utf-8-validate \
  --outfile=deploy/vps-stream/copia-contas/dist/servico.js
npx tsx lib/mestres/__tests__/mestres.check.ts && npx tsx lib/copia-contas/__tests__/copia-contas.check.ts
npx tsx lib/mestres/__tests__/integracao-sombra.check.ts        # base real, só leitura
scp deploy/vps-stream/copia-contas/dist/servico.js mtm-stream:/tmp/
ssh mtm-stream 'sudo mv /tmp/servico.js /opt/mtm/copia-contas/ && sudo systemctl restart mtm-copia-contas'
ssh mtm-stream 'journalctl -u mtm-copia-contas -f'   # arranque: «mestres: escrita=0 (sombra)»; [pulso] com "mestres":{…}
```

### Sombra (antes de qualquer live)
1. Aplicar `116_mestres_nossas.sql`; deploy do site (Vercel) e do serviço.
2. `npx tsx scripts/mestres/sincronizar-rotas.ts` (seco) → rever → `--aplicar`.
3. `update site_settings set value = jsonb_set(value,'{ligado}','true') where key='mestres_motor';`
   `update mestres_estrategias set modo='sombra', t2t_modo='sombra' where slug in ('Goldkiller','sensei','mtm-auto-edge','mtm-auto-king','mtm-auto-wolf');`
   GK/Sensei: `sinal_modo='sombra'` (regista em `mestres_sinais` o que a SIM abriria pelo sinal directo).
4. Ler: `select estrategia, tipo, estado, count(*), percentile_cont(.95) within group (order by latencia_total_ms) from mestres_ordens where criado_em > now()-interval '24 hours' group by 1,2,3;`

### Corte para live — por estratégia (começar por UMA conta de teste)
1. **Sombra limpa ≥ 1 semana**: `mestres_ordens` sem `erro` por explicar; lotes e SL/TP (em pips) certos por conta.
2. **Sinal directo (só GK/Sensei)**: espelho provider desligado para a estratégia
   (`update mtmauto_providers set espelho_provider_ativo=false where slug='Goldkiller'`) e `sinal_modo='live'` — a
   partir daqui o webhook abre na SIM e NÃO manda ordem para a mestre MT5. (Edge/King/Wolf já nascem assim.)
3. **CopyFactory**: `npx tsx scripts/mestres/cortar-copyfactory.ts --estrategia Goldkiller` (seco) → `--aplicar`
   (com `--mtmauto` se `incluir_mtmauto`). Só grava `copyfactory_cortado_em` depois de RELER todos os subscritores.
4. `update site_settings set value = jsonb_set(value,'{live_desbloqueado}','true') where key='mestres_motor';`
   `MESTRES_ESCRITA=1` no env + `systemctl restart mtm-copia-contas` (o log diz `escrita=1 (LIVE PERMITIDO)`).
5. Conta a conta: `insert into mestres_contas (conta_chave, conta_ref, modo) values ('mt:<login>@<servidor>', 'site:<id>', 'live') on conflict (conta_chave) do update set modo='live';`
6. `update mestres_estrategias set modo='live' where slug='Goldkiller';` (e `t2t_modo='live'` quando o T2T também).
7. Verificar a 1.ª trade: `mestres_ordens` `abrir:enviando→ok` (+ `modificar:ok` com sufixo `:reancorar`), posição na
   corretora com o SL em pips certos, e nada na CopyFactory (`scripts/mestres/cortar-copyfactory.ts` seco = 0 a cortar).

**Rollback** (qualquer um basta; do mais rápido ao mais lento):
- `kill.ts on` (≤ 2 s, pára tudo) → depois `update mestres_estrategias set modo='sombra' where slug=…`.
- Conta: `update mestres_contas set modo='sombra' where conta_chave=…`.
- Processo: `MESTRES_ESCRITA=0` + restart.
- Voltar à CopyFactory: `modo='sombra'`, `update mestres_estrategias set copyfactory_cortado_em=null where slug=…`
  (a re-sincronização do site volta a poder subscrever), e re-subscrever pelo admin «MTM Auto · Cópia › Estratégias»
  (Re-sync com releitura). GK/Sensei: `sinal_modo='desligado'` + `espelho_provider_ativo=true` repõe a mestre MT5.
  As posições abertas pelo motor continuam a ser geridas enquanto o motor não estiver `kill`/desligado — fechá-las
  à mão ou deixar o motor em sombra só depois de fecharem.

### Premium pela mestre SIM (18/09)

Mestre = `1c6a3789` (espelho Premium 10K, SIM da casa). Sinal: Signal Master Elite → gmi-relay → `/api/telegram/relay-post`
→ processador → `lib/mestres/servidor/premium.ts` (só ouro, 08–22 Londres, limite diário de SL, não abre sem a anterior em
BE + 1.º parcial) → `sinal-mestre.ts`. Gestão na mestre = `sinais_config` do `premium-ouro`. O chat/Telegram continuam com o
literal (o relay-post não mudou). Com `sinal_modo='live'` NADA do legado executa: processador (MT5 a21178c2/CopyFactory
Hvmg, execução directa por grupo Telegram, gestão por mensagem), monitor de preço, espelho de saídas aos subscritores,
pendentes de zona, master-poll, motor-real (Premium/subscritores/provider) e o espelho MT5→SIM do funded-motor.

```bash
psql … -f scripts/mestres/premium-ligar.sql                                   # linha em sombra (ou colar no SQL editor)
npx tsx scripts/mestres/sincronizar-rotas.ts --estrategia premium-ouro         # SECO → rever → --aplicar
npx tsx lib/mestres/__tests__/premium.check.ts
# próximo sinal: select * from mestres_sinais where estrategia='premium-ouro' order by criado_em desc limit 5;
npx tsx scripts/mestres/cortar-copyfactory.ts --estrategia premium-ouro        # SECO → --aplicar (Hvmg/MxsR/9gsL)
# live: bloco (A) no fim de scripts/mestres/premium-ligar.sql · rollback: bloco (B)
```
