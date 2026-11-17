# Pendentes e doutrinas (setembro a novembro de 2026)

> Movido do CLAUDE.md a 17/11/2026 para poupar tokens: só se lê quando a tarefa precisa.

## PENDENTES (memória entre sessões)

### 📋 CHECKLIST DO RICARDO — Mac mini, 2026-09-22 (apagar quando concluído)
**1. VPS · motor novo (fonte nula + Binance + WS + watchdogs) — ~10 min**
```bash
cd "/Users/ricardogarcia/Documents/Repositório SITE/SITE-MORETHANMONEY-FINAL-39aae3022258dec0b1e9cce3dc39489035c05b36"
git pull origin main && npm install   # npm install: dependência nova "ws"
node_modules/.bin/esbuild services/funded-motor/motor.ts --bundle --platform=node --target=node18 --outfile=/tmp/motor.js
scp /tmp/motor.js deploy/vps-stream/nginx-mtm-stream-https.conf.example deploy/vps-stream/funded-motor/mtm-funded-motor.service ubuntu@13.62.134.34:/tmp/
ssh ubuntu@13.62.134.34
  systemctl list-units | grep -i -E 'funded|motor'      # confirmar o NOME real do serviço
  sudo cp /tmp/motor.js /opt/mtm/funded-motor/motor.js
  sudo cp /tmp/mtm-funded-motor.service /etc/systemd/system/  # garante Restart=always
  sudo cp /tmp/nginx-mtm-stream-https.conf.example /etc/nginx/sites-available/mtm-stream  # novo bloco /precos
  sudo nginx -t && sudo systemctl reload nginx
  # OPCIONAL forex sem MetaApi — acrescentar ao /etc/mtm-funded-motor.env:
  #   ESPELHO_FEED_TL=1  ESPELHO_FEED_TL_RECURSO=1
  #   TL_FEED_EMAIL=…  TL_FEED_PASSWORD=…  TL_FEED_SERVER=…  TL_FEED_ENV=demo  TL_FEED_ACCOUNT_ID=…  TL_FEED_ACCNUM=…
  sudo systemctl daemon-reload && sudo systemctl restart mtm-funded-motor funded-copier
  journalctl -u mtm-funded-motor -f   # esperar: "[binance] feed cripto ligado" + "[ws-precos] a ouvir na porta 8788"  # 8787 é do mtm-dialogos, não mexer
  # A porta é 8788, não 8787: a 8787 está ocupada pela ponte do conector MT5 (ver
  # deploy/vps-stream/nginx-mtm-stream.conf e WS_PRECOS_PORTA em /etc/mtm-funded-motor.env).
  journalctl -u mtm-funded-motor -f   # esperar: "[binance] feed cripto ligado" + "[ws-precos] a ouvir na porta 8788"
```
**2. Vercel — env do WebTrader→WS**: Settings → Environment Variables → `NEXT_PUBLIC_FUNDED_WS_URL=wss://stream.morethanmoney.pt/precos` (Production) → Redeploy.
**3. ~~gmi-relay GOLD DID~~ — TERMINADO (decisão do dono 21/09)**: o relay correcto é o do Signal Master Elite (rota única `signal-master-elite` → Premium, já activa no `/opt/gmi-relay/.env`, `GMI_DRY_RUN=0`). As posições Premium da sessão de Londres abrem na conta-mestre MTM Funded (espelho Premium 10K, `1c6a3789`) e o motor propaga aos clientes. Não configurar a rota gold-did.
**4. MetaApi (quando decidires)**: créditos em app.metaapi.cloud → verificar contas DEPLOYED → o streaming reassume sozinho como fonte principal. Aproveitar e apagar no painel a conta órfã 111c8463/estratégia YMEE (resto do Golden Moves).
**5. Ulisses (se ainda não feito)**: abrir logado como admin: `https://www.morethanmoney.pt/api/admin/mtmfunded/conta-emitir-credenciais?account=4e2978b7-75c5-4954-90e5-d2275c1672e5` → gera credenciais e envia o email oficial (esperado: `{"ok":true,"emailAoDono":true}`).
**6. Verificação final**: WebTrader com preços a mexer (cripto já; forex se TL configurado ou MetaApi com créditos); alerta/recuperação do vigia no Telegram; `servicos_pulso` no admin com `wsClientes` e `binance`.
**7. Instalações no Mac (o container é efémero — repetir localmente, na pasta do repo)**:
```bash
npx skills add DietrichGebert/ponytail --skill ponytail --agent claude-code
npx skills add addyosmani/agent-skills --agent claude-code   # 25 skills
npm install -g omniroute                                      # router de IA (352 providers)
uv tool install graphifyy && graphify install --platform claude  # 2 y no pacote; dá graphify + graphify-mcp
```
(As skills vão para `.claude/skills/`, que está no .gitignore — instalação local por máquina, por decisão de segurança: skills de terceiros correm com permissões totais.)

### ⚖️ DOUTRINA — MetaApi é SECUNDÁRIO (ordem do Ricardo, 2026-09-21)
- **As mestres são as contas MTM Funded (sim)**: sinais abrem lá, e o NOSSO motor gere (trailing, auto-BE, parciais) ao nosso preço. A cópia mestre→slaves (MT5 via MetaApi, TradeLocker via API) sai de `copia_rotas` (078, sombra→live por interruptor; escritores mt5+TL implementados).
- **MetaApi serve APENAS**: (1) slaves MT5 de clientes como destino de cópia; (2) fonte de preços preferencial — substituída automaticamente por Binance (cripto, `fonte-binance.ts`) e TradeLocker (`ESPELHO_FEED_TL_RECURSO=1`) quando falha; o motor arranca sem MetaApi (fonte nula). NUNCA voltar a desenhar nada que dependa do MetaApi para o sistema interno funcionar.
- Feed aos browsers: WS do motor (`wss://stream.morethanmoney.pt/precos`, `ws-precos.ts` + `NEXT_PUBLIC_FUNDED_WS_URL`); Supabase fora do caminho quente (o poll por cliente esgotou o egress a 19/09). Vigia Vercel `funded-precos-vigia` (1 min) alerta o admin por Telegram e escreve preços degradados (MetaApi→Binance fallback).

### 🏆 MTM FUNDED — Fase 1 aprovada em conceito (2026-09-13)
- **Spec completo: `docs/mtm-funded-fase1-spec.md`** — motor de contas SIMULADAS (desafios/torneios) + WebTrader próprio no app-mobile. NÃO é prop firm: fase "funded" = **Patrocínio de Desempenho MTM** (recompensa p/ aluno abrir conta própria na PU Prime regulada; MTM nunca custodia nem executa real por clientes).
- Estratégia de custos: MetaApi fica SÓ no MTM Auto + T2T (assinatura cobre a ligação); desafios simulados = custo marginal ~0/conta (um feed de ticks serve todas — providers streaming já pagos). Roadmap geral anti-MetaApi: (0) fechar 7 bypasses REST + interface TradingDriver; (1) MTM Funded próprio; (2) driver TradeLocker direto (API pública grátis — app TradeLocker exigiria brand partnership, rejeitado p/ Fase 1); (3) piloto MT5 self-hosted no mtmcopy-engine (bridge de 80 linhas, fala só via Supabase); (4) CopyFactory própria (últimO — maior risco; custódia de credenciais tem de ser resolvida antes). White label MT5 rejeitado ($7.5k-25k setup + $2.7k-11k/mês + licença de corretora).
- Mapa de dependência MetaApi: superfície real = 13 ficheiros (~3.200 linhas): núcleo `lib/mtmcopy/{metaapi,copyfactory,metaapi-provision,metaapi-admin,system-sync}.ts` + `mtmcopy-engine/src/metaapi-bridge.ts` + 7 bypasses REST (`lib/mtm-auto-bridge.ts`, `lib/accounts-daily-report.ts`, `lib/mtmcopy/provider-metrics.ts`, `app/api/admin/mtmcopy/{repair-subscriber,add-rg-slave,risk-audit,fontes-vivas}`, `app/api/mtm-auto/historico`). 48 consumidores ficam intactos se as assinaturas de `metaapi.ts` se mantiverem.

### 🎛️ CONTROLO ADMIN T2T/MTM COPY (2026-09-04)
- **App-mobile → T2T → Estratégias**: secção "Controlo Admin" (só `user_type='admin'`) com interruptores no estilo Seguir: pausa/liga CÓPIA por estratégia (route.enabled + removeProviderStrategy + resync + espelho em `mtmauto_providers.ativo` — a app MTM Auto lê a MESMA tabela) e liga/desliga FONTES T2T (route.tap_to_trade + `t2t_extra_channels`). API: `/api/admin/mtmcopy/t2t-controls`.
- Fonte desligada → some do feed T2T dos clientes E o botão dos chats desaparece (chat-channels consulta `/api/mtmcopy/tap-to-trade/providers`).
- **Subscritores**: admin Subscribers tab tem Pausar/Retomar por ligação (is_active + unsubscribe/sync CopyFactory; o reconcile respeita is_active). GET inclui pausadas.
- **Rotas provider**: conta mestre pode ser "— (nenhuma)" (account_id '', sobrevive ao repair por match de id; sem execução/CopyFactory, sinais continuam p/ chat+T2T). PUT telegram-sources já NÃO apaga `app_channel`/`signal_source`/`t2t_extra_channels` (bug corrigido).
- **Perps/Aurum Flow**: perps-gate é só de EXECUÇÃO — a entrega (chat cripto-perps + Telegram "Ideias de Perpétuos Cripto" −1004363723837 + T2T) publica sempre; bloqueio fica em trade_status='filtered'. Botão nos perps = **TAP to Copy** (modal com copy por campo: par, direção, entrada, SL, exits — components/mobile/tap-to-copy-modal.tsx). 'cripto-perps' ativo em t2t_extra_channels.
- 34744057 ("Copy PU · Premium") NÃO é mestre CopyFactory: é subscritora espelho da MxsR; o trailing/BE chega-lhe por replicação CopyFactory do mestre 530d2e07 (motor premium-price-monitor gere o mestre; premium_subscriber_exits espelha saídas).

### 🔁 ROTINA SEMANAL — Flyer "Resultados da Semana" (desde 2026-08-22)
- **Ordem permanente do Ricardo:** todas as semanas criar o flyer com resultados reais, enviar-lhe por Telegram e publicar como Story no @morethanmoney.pt. Branding MTM: dourado `#efb810` sobre preto, logo `public/logo-mtm-transparent.png`, CTA WhatsApp +351 912 666 699 + morethanmoney.pt/scanners, disclaimer educativo obrigatório.
- **Automatizado:** cron `/api/cron/weekly-flyer` (sábado 10:00 UTC, vercel.json) → calcula stats canónicas (`lib/mtm-flyer/weekly-stats.ts`: exit_N→TP N, loss→SL, be→entrada; pips 0.0001 forex/0.01 JPY/0.1 XAU, pontos índices; sanidade |12%|/trade) → Telegram sendPhoto ao admin → agenda STORY `approved` na fila `social_scheduled_posts` (ig-publish publica em <5 min). Imagem live: `/api/flyer/weekly?w=YYYY-MM-DD&lang=pt|en` (next/og, 1080×1920).
- **SEMPRE dois flyers separados — PT e EN — e win rate visível em TODOS os cartões** (pedido 2026-08-22). O cron envia/agenda ambos; números formatados por língua (23.900 / 23,900).
- **Funil Telegram:** aos sábados o cron `telegram-leads-content` (11:00/18:00 UTC) publica os DOIS flyers no grupo de leads MTM System (`telegram_leads_group_id`, −1004352255256) com CTAs Testar grátis + DM; dedup semanal em `site_settings.weekly_flyer_leads_posted`.
- **Premium vem do GOLD DID** (relay → chat premium-ideas), NUNCA do TradingView: preferir resumos diários "Total Net : N PIPS"; dias sem resumo → marcos "HIT TP3 +N PIPS" e −50/SL. Fontes no flyer: Premium, MTM Scanner V3.4, Sensei X, GoldKiller (Aurum Perps fora por decisão de 2026-08-22).
- Simulação lote mínimo: ≈$0,10/pip a 0.01 (forex/ouro) e ≈$0,10/ponto a 0.1 (índices).

### ✅ RESOLVIDO 2026-08-20 — Deep-link T2T nas apps nativas (commit b82e4b6)
- A notificação de sinal T2T abre `/app-mobile?tab=tap-to-trade&signal=<msgId>` e o feed abre DE IMEDIATO o modal de confirmação (aceitação 1 clique; guard 1× por sinal — commit 295ceb3).
- **Cobertura por shell (sem rebuild nativo — as shells carregam o site ao vivo):**
  - Web/PWA/Android: service worker `notificationclick` navega com o URL (incl. cold start via openWindow); ação "Fechar" já não abre a app.
  - Capacitor: tap trata `data.url`; cold start recuperado com `App.getLaunchUrl()`.
  - **iOS WKWebView (APNs nativo, código Swift fora do repo)**: RESGATE server-side — ao abrir/retomar sem `?signal`, a app procura a notificação in-app T2T não-lida (<3 min), navega para o `data.url` e marca-a lida. O tap na push funciona de facto mesmo sem a shell entregar o URL.
- Rebuild nativo é OPCIONAL (só para entrega direta do URL no Swift; o resgate já cobre o fluxo).
- Regras de visibilidade em vigor: botão T2T visível em ideias válidas/pendentes até resolução (ENTRY HIT/TP/SL/BE/fecho/descarte, por símbolo E direção); sinais terminados escondidos dos feeds T2T/Alertas MTM (só BD; `?includeClosed=1` devolve tudo).
