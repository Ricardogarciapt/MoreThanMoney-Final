# NOTAS-WIP — funded-textos-emails (2026-09-17)

Estado: INVESTIGAÇÃO FEITA, NENHUM CÓDIGO ALTERADO AINDA. Worktree criada a partir de origin/main
(3d79ba82), node_modules e .env.local em symlink. Nada enviado, nada aplicado na base.
(Apagar este ficheiro antes do commit final.)

## Modelo de dados (lido na BD, só leitura)
- `mtm_trading_accounts.tipo` ∈ desafio | financiada | torneio | provider. Estados: ativa, quebrada,
  cancelada, expirada, aprovada, pedida (+ `pausada_em`).
- A fase vive em `metricas.fase` (sem ela = 1). O nº de fases vem de `mtm_funded_programs.fases` (via `program_id`).
- O tamanho vem de `saldo_inicial` (fallback: `mtm_funded_programs.saldo`).
- Oferta: gratidão = `metricas.oferta='gratificacao-2026-09'`; renovação = `mtm_funded_purchases.estado='oferta'`
  (sem marca nas métricas — não a acrescentar, mexe no «um de cada vez»).
- Contagem hoje: 124 desafios (120 da oferta, F1 10K 2f), 22 financiadas (quase todas 1K sem_regras/segue
  estratégia/casa, programa «1K · 1 fase»; 4 da casa 10K e 1 de 3K sem programa), 8 provider, 5 torneio.
- `tipoCurto('provider')` devolve 'F1' (lib/mtmfunded/etiquetas.ts) — as contas mestre aparecem como F1.

## Pedido 1 — onde está o texto
- components/funded/funded-webtrader.tsx:254 (desktop) e :268 (telemóvel, versão curta). É a única ocorrência
  da frase. O mesmo componente serve /webtrader e a app-mobile (Scanner › Web trader).
- Variantes: app/webtrader/layout.tsx:12 (metadata), components/webtrader/entrar-credenciais.tsx:54,
  components/funded/um-clique.tsx:36 (TEXTO_AVISO_UM_CLIQUE), components/funded/funded-estatisticas.tsx:149,
  app/api/mtmfunded/simulado/motor/route.ts:133 (nota do alerta de preço).
- iOS nativo e Android: sem ocorrências. i18n: lib/i18n/messages/mtmfunded.ts só tem pt+en; os 21 idiomas estão
  em lib/i18n/config.ts; `useT()` de components/i18n-provider.tsx (provider na raiz); chave em falta → PT.

### Plano
1. `lib/mtmfunded/aviso-conta.ts` (puro): `avisoDaConta({tipo?, etiqueta?, estado?, estadoCurto?})` →
   avaliacao | funded | torneio | avaliacao_concluida | avaliacao_terminada | funded_encerrada | mestre | geral,
   e o mapa para as chaves i18n `mtmfunded.aviso.*`.
   - desafio activo/pausado/pendente → «Conta simulada educativa · MTM Funded · Encontras-te em Avaliação»
   - financiada activa/pausada → «Conta · MTM Funded · contém negociação real»
   - quebrada/cancelada/expirada/aprovada, torneio, provider, sem conta → textos próprios (relatar ao dono)
2. Passar `tipo`/`estado` em lib/webtrader/seletor.ts (FundedDoUtilizador, SessaoFunded, EntradaSeletor) e
   em components/funded/api.ts (SessaoConta + entrarComCredenciais — o GET de /entrar já devolve tipo/estado).
3. funded-webtrader.tsx: trocar as 2 linhas por `t(CHAVE_AVISO[avisoDaConta(atual)])`. Tocar SÓ nessas linhas
   (há outra frente a mexer no WebTrader para o separador MTM Auto).
4. Chaves `mtmfunded.aviso.*` nos 21 idiomas (acrescentar objectos por idioma a MTMFUNDED_MESSAGES).
5. Variantes: metadata e entrar-credenciais → texto neutro; estatísticas/um-clique → decidir pela conta se o
   componente a tiver, senão neutro.
6. Teste `lib/mtmfunded/__tests__/aviso-conta.check.ts`.

## Pedido 2 — o que está errado nos emails
- O caminho actual (contas `motor='sim'`) é lib/mtmfunded/credenciais-servico.ts → email-credenciais.ts.
  Chamado por compra.ts ('criacao'), ofertas.ts ('criacao'), ciclo-de-vida.ts (F2 'fase'; financiada 'fase'
  (linha ~718); renovação da financiada 'criacao'), admin, regenerar, pedido, backfill.
- ERRO REAL: `emitirContaFinanciada` envia com motivo 'fase' → a conta Funded recebe «A tua nova conta MTM Funded
  (fase seguinte)» / «Nova fase, nova conta» / «Passaste de fase e abrimos a conta seguinte».
- ERRO REAL (enviado a 15/09 19:33, backfill): financiadas 1K (logins 77940649, 77720210, 77745532, 77753138,
  77170533, 77240432, 77943387) receberam cabeçalho «Conta Funded · 1K · 1 fase» e linha «Programa: 1K · 1 fase»
  (nome de desafio numa Funded), nenhuma linha de tamanho, e o aviso «Conta simulada educativa: a negociação
  não é real». O tamanho só existe dentro do nome do programa; financiadas sem programa (3K, 10K da casa) não
  mostram tamanho nenhum. O assunto é igual para todos os tipos. Só PT.
- email-conta.ts (caminho MT5 — agent/route.ts, admin conta_reenviar, cron vespera): em desafios `nomeProva`
  = nome do TORNEIO ou 'MTM Funded' → «O teu desafio MTM Funded está activo»; sem fase; regras só de torneio;
  `saldo_inicial ?? 0` → podia sair «0 USD». Só PT.
- email-oferta-clientes.ts: assunto «…de 10K», «10K · 2 fases» e «F1 · Fase 1 de 2» ESCRITOS À MÃO (o saldo da
  tabela vem de `d.saldo`, mas o assunto não). Tem EN.
- ofertas.ts `enviarEmailDaOferta` (renovação): diz «a conta está a ser emitida… código QR… não é imediato»
  mesmo quando o motor é `sim` (já activa) — e a seguir sai ainda o email das credenciais: 2 emails.
- A restrição da 091 só aceita motivos criacao|fase|regeneracao|reenvio|backfill|pedido → NÃO criar motivos
  novos (seria migração); o tipo real decide o texto.

### Plano
1. `lib/mtmfunded/email-tipo-conta.ts` (puro, pt/en): `tipoDeEntrega` (desafio|funded|torneio|oferta|mestre),
   `tamanhoDaConta` (saldo_inicial → programa.saldo → null, NUNCA defeito), `tamanhoCurto` (10K),
   `tamanhoLongo` (pt «10 000 USD», en «10,000 USD»), `textosDaEntrega(conta, motivo, idioma)` → assunto,
   cabeçalho, frase, linhas (Tipo de conta / Tamanho / Fase), aviso.
2. email-credenciais.ts: `DadosEmailCredenciais` ganha `conta` + `idioma`; sem password (manter a garantia).
3. credenciais-servico.ts: ler fases/saldo do programa, oferta (métricas + compra 'oferta'), nome do torneio,
   idioma do perfil (`idiomaDoCliente` de oferta-clientes.ts; colunas preferred_language, detected_language,
   country, phone, timezone).
4. email-conta.ts + 3 chamadas: fase/fases/programa/tamanho reais; pt/en.
5. email-oferta-clientes.ts: assunto/presente/tipo a partir de saldo/fases/fase dos dados.
6. ofertas.ts: com motor `sim` não enviar o email «a ser emitida» (o das credenciais já diz que é oferta).
7. Pré-visualizações em tmp/previews-emails/ (desafio 1f, 2f F1, F2, funded, torneio, oferta, + en) com um
   script em scripts/ ou no próprio check; testes `lib/mtmfunded/__tests__/email-tipo-conta.check.ts`
   (tipo → assunto/texto; tamanho vindo da conta) + actualizar credenciais-link.check.ts e oferta-clientes.check.ts.
8. `npm run build`, correr os checks, commit, apagar `.next` e este ficheiro.
