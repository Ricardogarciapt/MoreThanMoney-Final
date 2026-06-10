# MTMcopier — Vercel + @MoreThanMoney_aibot

Bot: [t.me/MoreThanMoney_aibot](https://t.me/MoreThanMoney_aibot)

## Modos de leitura de sinais

| Modo | Configuração | Comportamento |
|------|--------------|---------------|
| **Predefinição** | Campo canal vazio | Copia sinais de **todos os grupos/canais** onde o bot está (ou só os IDs em `TELEGRAM_MTMCOPY_DEFAULT_CHAT_IDS`) |
| **Canal externo** | `@canal` em `/mtmcopy` | Copia **apenas** desse sender — o bot tem de ser **administrador** |

## Rotas

| Rota | Quem |
|------|------|
| `/mtmcopy` | Cliente — config, verificar Telegram, histórico |
| `/admin/mtmcopy` | Admin — consola, MetaApi, todas as ligações |

## Variáveis Vercel

| Variável | Descrição |
|----------|-----------|
| `TELEGRAM_BOT_TOKEN` | Token do @MoreThanMoney_aibot (BotFather) |
| `TELEGRAM_BOT_USERNAME` | `MoreThanMoney_aibot` |
| `TELEGRAM_WEBHOOK_SECRET` | Secret na URL do webhook |
| `TELEGRAM_MTMCOPY_DEFAULT_CHAT_IDS` | Opcional: `-100123,@canal_mtm` — restringe o modo predefinição |
| `METAAPI_TOKEN` | Execução MT5 |

## Webhook (registar após novo token)

```bash
curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.morethanmoney.pt/api/telegram/webhook?secret=<SECRET>","allowed_updates":["message","channel_post","edited_channel_post"]}'
```

## Fluxo

```
Grupo/canal MTM (ou canal externo do cliente)
  → @MoreThanMoney_aibot
  → /api/telegram/webhook
  → lib/mtmcopy/processor.ts
  → MetaApi → MT5
```
