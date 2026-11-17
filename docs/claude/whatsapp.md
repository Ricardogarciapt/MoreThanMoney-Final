# WhatsApp Business

> Movido do CLAUDE.md a 17/11/2026 para poupar tokens: só se lê quando a tarefa precisa.

## WhatsApp Business — o que está ligado (30/09/2026)

| | |
|---|---|
| Número | **+351 923 533 741** · nome «MoreThanMoney» · CLOUD_API · VERIFIED |
| `WHATSAPP_PHONE_NUMBER_ID` | `1310013118861820` |
| WABA | `1090379237043440` |
| App | **WPP** `1774823420127674` (NÃO a «Agente de Conteudo», que é a do Instagram) |
| Token | utilizador de sistema «Sistema Ricardo Pessoal», **sem prazo**, com `whatsapp_business_messaging` + `whatsapp_business_management` |
| Webhook | `/api/whatsapp/webhook`, com `WHATSAPP_VERIFY_TOKEN` |
| Número de teste | +1 555 141-1201 · `1373299159196669` (só fala com até 5 números registados) |

**O PIN de registo do número está fora daqui**, num gestor de palavras-passe. É ele que permite
voltar a registar o número; sem ele é suporte da Meta.

### Três coisas que se aprenderam a custo e não se repetem

· **O token tem de vir do UTILIZADOR DE SISTEMA, não do Graph API Explorer.** Um token do Explorer
  parece igual (começa por `EAA…`) mas é do tipo `USER`, é da app errada e expira no mesmo dia.
  Verifica-se com `debug_token`: tem de dizer `SYSTEM_USER`, app `1774823420127674` e
  `expires_at: 0`.
· **Um número com WhatsApp activo não pode ser usado pela API.** O primeiro número escolhido tinha
  conta pessoal e a Meta recusou; foi preciso apagá-la e esperar ~3 minutos.
· **A Meta não vende números.** Não há «claim» de um número português — regista-se um que já se
  tenha. O número de teste gratuito é sempre +1 e não se escolhe o país.

### O que ainda NÃO está feito

· **App por publicar e negócio por verificar** — enquanto isso, os webhooks só entregam mensagens de
  administradores e testadores. Clientes reais não entram.
· **Sem método de pagamento** — responder dentro das 24 h é grátis; iniciar conversa é pago.
· **Zero consentimentos em `captacao_consentimento`** — o `decidirEnvio` recusa tudo o que for
  campanha. Ver `lib/whatsapp-envio.ts`.


