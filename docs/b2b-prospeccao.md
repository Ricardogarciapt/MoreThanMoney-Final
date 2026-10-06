# Prospeção B2B por email profissional

**Base legal.** Lei 41/2004, art. 13.º-A, n.º 2: o regime de opt-out aplica-se às pessoas colectivas. Cada mensagem identifica a MTM e traz uma forma de sair; quem sai entra na exclusão global (`contacto_exclusao`) e nenhum canal volta a contactá-lo. Cada decisão grava-se em `b2b_envios` com `base_legal = 'b2b_pessoa_colectiva'`.

## Peças

| O quê | Onde |
|---|---|
| Tabelas `b2b_prospectos`, `b2b_envios`, `contacto_exclusao` (RLS fechado, só service role) | `supabase/migrations/187_b2b_prospeccao.sql` |
| Validador puro: domínio de empresa, caixa genérica ou endereço comercial publicado, pessoa colectiva, URL de origem, exclusão | `lib/b2b/validador.ts` |
| Sequências de 3 toques por segmento (pt-PT/pt-BR) e a validação da mensagem (saída + `?ag=` + identificação) | `lib/b2b/sequencias.ts` |
| Decisão e envio: tecto, primeiro lote, regra do motor (`decidirContacto`) e transporte do site | `lib/b2b/envio.ts` |
| Recolha a partir da página de contacto, com robots.txt e ritmo lento, sem LinkedIn | `lib/b2b/recolha.ts` (`POST /api/admin/b2b {action:'recolher'}`) |
| Cron diário, dias úteis às 10:30 UTC (`?ensaio=1` decide sem enviar) | `app/api/cron/b2b-prospeccao` |
| Link de saída assinado (GET e POST one-click) | `app/api/b2b/sair` |
| Painel | `/admin/sales-machine` → «Prospeção B2B» |
| Guardas | `npx tsx lib/b2b/b2b.check.ts` |

**Configuração** (`site_settings.b2b_prospeccao`): `ligado`, `tecto_dia` (20 por omissão, máximo 50), `intervalo_seg` (12), `primeiro_lote` (10), `dias_entre_toques` ([0, 4, 7]).

**Ambiente.**
- `B2B_IDENTIFICACAO` é a linha legal da assinatura: denominação, sede/morada e NIPC. Por omissão é «More Than Money (MTM) · Portugal · www.morethanmoney.pt». **Falta pôr aqui a morada e o NIPC.**
- `B2B_ASSINANTE` tem por omissão «Ricardo Garcia».
- `B2B_SAIR_SEGREDO` assina os links de saída. Se não estiver definido, usa-se o `CRON_SECRET`. Trocar este segredo invalida os links que já foram enviados.

## Respostas: como ligar a caixa

Ainda não há leitura da caixa de email no site. Por agora, a resposta marca-se à mão no painel com o botão «Respondeu», que também avisa o dono no Telegram. Pela API: `POST /api/admin/b2b {action:'estado', id, estado:'respondeu'}` com `Authorization: Bearer CRON_SECRET`, que é a forma de o AIOS ou o agente marcarem a resposta.

Para automatizar:
1. Escolher a caixa de onde sai o correio. Hoje é o Gmail (`GMAIL_USER`/`GMAIL_APP_PASSWORD`). Quando passar a SMTP no domínio, usa-se a caixa `MAIL_SMTP_USER`.
2. Juntar `imapflow` e criar um cron, por exemplo a cada 30 minutos, que leia a INBOX por IMAP (Gmail: `imap.gmail.com:993`, com a mesma password de aplicação). O cron pega nas mensagens recentes cujo `From` esteja em `b2b_prospectos.email`, ou cujo domínio coincida com o de um prospecto contactado. A esses chama o mesmo `estado: 'respondeu'`, que trata do aviso ao dono.
3. Se o corpo da mensagem for «SAIR», «STOP», «remover» ou «descadastrar», chama `excluir()` em vez de marcar resposta.

## O que falta para ter volume

- **Fornecedor de email no domínio.** Hoje o envio sai pelo Gmail do site, que tem limites diários e mistura reputações. Para passar de 20/dia é preciso uma caixa ou subdomínio próprio (por exemplo `parcerias@morethanmoney.pt` ou `mail.morethanmoney.pt`) num fornecedor SMTP (Google Workspace, Zoho, Postmark/SES para transaccional), configurado nas variáveis `MAIL_SMTP_*`. Depois aquece-se aos poucos: 10/dia → 20 → 40.
- **SPF, DKIM e DMARC** do domínio de envio. Sem isto, o correio frio cai no spam.
