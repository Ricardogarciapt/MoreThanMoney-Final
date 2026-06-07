# Copygram Engine

Motor de copy-trading **Telegram → MT5** para o addon **Copygram** da MoreThanMoney
(+20€/mês, gerido em `/mtmcopy` no site). Este é um **serviço autónomo**, separado
do site Next.js/Vercel — corre em segundo plano, 24/7, num processo Node de longa
duração.

## Arquitetura, em resumo

```
Canal de sinais (Telegram)
        │   bot @MoreThanMoney_aibot escuta as mensagens
        ▼
 telegram-listener.ts  →  signal-parser.ts (extrai símbolo/direção/SL/TP)
        │
        ▼
 lot-sizing.ts (calcula o lote conforme as preferências do utilizador)
        │
        ▼
 metaapi-bridge.ts  →  MetaApi.cloud  →  conta MT5 do utilizador
        │
        ▼
 supabase-client.ts (regista o sinal e actualiza o estado da ligação)
```

A configuração de cada utilizador (canal a copiar, modo/valor de lote, copiar
SL/TP, inverter sinais, etc.) é feita por ele próprio em `/mtmcopy` no site, e
fica guardada na tabela `mtmcopy_connections` do Supabase. Este motor lê essa
tabela periodicamente (`POLL_INTERVAL_MS`) e mantém-se sincronizado.

## ⚠️ Onboarding manual de cada utilizador (obrigatório)

Por segurança, **o formulário web nunca pede a password da conta MT5** — só pede
o servidor e os últimos 4 dígitos do login (apenas para referência visual do
utilizador). Isto significa que a ligação real entre a conta MT5 e o MetaApi tem
de ser **provisionada manualmente pela equipa**, em canal seguro:

1. O utilizador preenche o formulário em `/mtmcopy` (canal Telegram, servidor MT5,
   últimos 4 dígitos, preferências de lote). Isto dispara um email de notificação
   para `morethanmoneypt@gmail.com` (via `sendCopygramSetupNotification`).
2. A equipa contacta o utilizador **fora do site** (ex: chamada, email dedicado,
   ou um campo seguro só visível à equipa) para obter o **login completo e a
   password** da conta MT5 — nunca por chat do Telegram ou formulário público.
3. A equipa cria/regista a conta no painel do [MetaApi](https://metaapi.cloud)
   (Dashboard → Add MetaTrader account), introduzindo essas credenciais
   directamente na plataforma MetaApi (que as encripta e nunca as expõe de volta).
4. O MetaApi devolve um `accountId`. Esse valor é gravado manualmente na coluna
   `metaapi_account_id` da linha correspondente em `mtmcopy_connections`
   (via Supabase Studio ou uma query SQL simples com a service_role key).
5. A partir daí, o motor deteta a conta provisionada (`metaapi_account_id`
   preenchido), liga-se a ela autonomamente e começa a copiar os sinais.

> Sem este passo manual, o motor regista os sinais recebidos (`status: 'received'`
> em `mtmcopy_signal_log`) mas **não executa ordens** — fica à espera da
> provisão da conta. Isto é intencional: garante que nenhuma credencial MT5
> passa pelo site ou pelo Telegram.

## Bot do Telegram

Este motor usa o bot **@MoreThanMoney_aibot** (Bot API, `node-telegram-bot-api`),
o mesmo que já está em uso no chat da app-mobile. Limitação importante da Bot API:

> Um bot só recebe mensagens de canais/grupos onde foi **adicionado como
> administrador**. Para cada canal de sinais que um utilizador queira copiar,
> o bot tem de lá ser adicionado — normalmente pelo dono do canal ou pelo
> próprio utilizador (se for admin).

Se no futuro for preciso copiar canais fechados de terceiros que não permitem
adicionar bots, a alternativa é um *userbot* (Telethon/GramJS — autenticação
por número de telefone). É uma arquitectura bastante diferente (não usa Bot
API/token, usa sessão de utilizador) — não está implementada aqui.

> 🔐 **Nota de segurança sobre o token deste bot**: o token de API do
> `@MoreThanMoney_aibot` é uma credencial sensível — quem o tiver pode controlar
> o bot por completo. Nunca o cole em chats, emails ou capturas de ecrã. Se
> alguma vez for partilhado em texto simples nalgum canal, deve ser **revogado
> e substituído imediatamente** via [@BotFather](https://t.me/BotFather) →
> `/mybots` → o bot → API Token → "Revoke current token" — e o novo valor
> actualizado apenas na variável de ambiente `TELEGRAM_BOT_TOKEN` (nunca em código).

## Configuração

```bash
cp .env.example .env
```

Preenche no `.env`:

| Variável | Onde obter |
|---|---|
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) → `/mybots` → @MoreThanMoney_aibot → API Token |
| `SUPABASE_URL` | já preenchido (`https://iwscxotvmtkphajmasof.supabase.co`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API → `service_role` (secret) |
| `METAAPI_TOKEN` | [MetaApi Dashboard](https://app.metaapi.cloud) → API Tokens → criar token |
| `POLL_INTERVAL_MS` | opcional, default `30000` (30s) |
| `NODE_ENV` | `production` em produção |

**Nunca** commitar o `.env` real — só o `.env.example` (já protegido por
`.gitignore`).

## Instalação e arranque

```bash
npm install

# desenvolvimento (recarrega ao gravar)
npm run dev

# produção
npm run build
npm start
```

## Onde alojar este serviço

Este processo precisa de correr **continuamente** (não é serverless/Vercel —
a Vercel teria timeouts e não mantém ligações persistentes ao Telegram/MetaApi).
Opções, por ordem de simplicidade:

1. **Railway / Render / Fly.io** (recomendado) — deploy directo a partir do
   repositório, plano gratuito ou ~5$/mês, reinício automático em caso de falha,
   logs e variáveis de ambiente geridos na plataforma. Não precisa de Windows
   nem de terminal MT5 instalado, porque o **MetaApi trata da ligação ao MT5
   na cloud** — é exactamente por isso que esta opção foi escolhida.

2. **VPS Windows existente** — também funciona como alternativa: basta instalar
   o [Node.js](https://nodejs.org) (LTS) e correr `npm run build && npm start`
   (idealmente com um gestor de processos como [pm2](https://pm2.keymetrics.io/)
   para reiniciar automaticamente). A vantagem do MetaApi mantém-se: não é
   preciso ter o MetaTrader aberto nesse VPS — o motor só precisa de Node e de
   acesso à internet para falar com o Telegram, o Supabase e o MetaApi.

3. **VPS Linux genérico** — qualquer máquina com Node 20+ serve.

## Estrutura do código

| Ficheiro | Responsabilidade |
|---|---|
| `src/index.ts` | Ponto de entrada — arranca o listener e trata encerramento limpo |
| `src/telegram-listener.ts` | Liga ao bot, escuta canais configurados, orquestra o pipeline sinal → execução |
| `src/signal-parser.ts` | Extrai símbolo/direção/entrada/SL/TP de texto livre; filtra updates de gestão |
| `src/lot-sizing.ts` | Calcula o lote (`fixed` / `multiplier` / `risk_percent`) conforme as preferências do utilizador |
| `src/metaapi-bridge.ts` | Encapsula a ligação MetaApi.cloud → MT5 (`placeMarketOrder`, `checkAccountHealth`) |
| `src/supabase-client.ts` | Lê `mtmcopy_connections`, escreve estado e regista sinais em `mtmcopy_signal_log` |

## Notas finais

- Os regex em `signal-parser.ts` cobrem formatos comuns (Forex/Ouro/Cripto), mas
  cada canal de sinais tem o seu "estilo" — vale a pena ajustá-los assim que se
  souber exactamente que canais vão ser copiados (testar com mensagens reais).
- `risk_percent` precisa do saldo da conta para calcular o lote — actualmente
  usa um fallback seguro (`0.01`) quando não o tem; para activar o cálculo real,
  basta obter o saldo via MetaApi (`account.getAccountInformation()`) antes de
  chamar `computeLotSize`.
- Tudo o que envolve dinheiro real de utilizadores (execução de ordens) passa
  exclusivamente por `metaapi-bridge.ts` — qualquer alteração aí deve ser
  testada primeiro numa conta demo.
