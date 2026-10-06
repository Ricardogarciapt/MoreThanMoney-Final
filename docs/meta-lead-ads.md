# Meta Lead Ads → lista de contacto com consentimento

Estado a 06/10/2026: o lado do site está feito. **A Meta (formulário, subscrição do webhook,
campanha e orçamento) é do dono.** Nada aqui foi criado, gasto ou alterado na app Meta.

## Como funciona

1. Alguém preenche o formulário instantâneo de um anúncio.
2. A Meta chama `POST https://www.morethanmoney.pt/api/webhooks/meta-leadgen` (campo `leadgen`).
3. O site verifica `X-Hub-Signature-256` com o **segredo da app** (o mesmo guardado em
   `/admin/social` → Ligações; reserva: variável `META_APP_SECRET`). Assinatura inválida → 401.
4. Vai buscar o lead pela Graph API com o **token de Página** já guardado (os mesmos tokens do
   Instagram em `/admin/social` → Ligações; reserva: `META_LEADS_PAGE_TOKEN`).
5. Lê as caixas de consentimento do formulário. **Só as caixas marcadas pela pessoa** viram linhas
   em `captacao_consentimento` (uma por canal), com o texto da caixa como prova.
   Uma caixa que o formulário mostre já marcada é ignorada.
6. Cria a tarefa de contacto imediato para o setter (`aios_tasks`, kind `envio:contacto_imediato`)
   e avisa o dono no Telegram de admin — exactamente como o formulário «Quero que me liguem» do site.

Código: `app/api/webhooks/meta-leadgen/route.ts`, `lib/pedido-contacto.ts`,
`lib/pedido-contacto-registo.ts`. Guardas: `npx tsx lib/pedido-contacto.check.ts`.

## 1. O formulário instantâneo recomendado

**Tipo:** «Mais volume» chega para começar. Se entrar muito lixo, passar a «Maior intenção»
(acrescenta um ecrã de revisão antes de enviar).

**Introdução**
- Título: «Queres que te liguemos?»
- Texto: «Formação, sinais, MTM Funded ou a EA Sensei. Diz-nos o que te interessa e quando dá
  jeito. Contactamos só pelos canais que marcares.»

**Perguntas pré-preenchidas** (a Meta preenche com os dados do perfil; a pessoa pode corrigir)
- Nome completo (`full_name`)
- Número de telefone (`phone_number`)
- Email (`email`) — opcional não existe nos pré-preenchidos; se se quiser opcional, deixar de fora
  e pedir só quem marcar a caixa de email.

**Perguntas personalizadas** (escolha múltipla; o nome do campo é o que o site lê)
- `interesse` — «O que te interessa?»: Formação · Sinais / copy · MTM Funded · EA Sensei · Outro
- `melhor_hora` — «Qual a melhor hora para falarmos?»: Manhã (9h-12h) · Hora de almoço (12h-14h) ·
  Tarde (14h-19h) · Noite (19h-21h) · Qualquer hora

**Política de privacidade:** `https://www.morethanmoney.pt/privacidade`

**Aviso legal personalizado** (Custom disclaimer) com **três caixas OPCIONAIS e desmarcadas**.
O texto do aviso:

> Quem te contacta é a MoreThanMoney (morethanmoney.pt), por uma pessoa da equipa ou por um
> assistente automático em nosso nome. Para sair basta dizeres «não quero ser contactado» na
> chamada, responderes SAIR a qualquer mensagem ou usares a ligação de saída em qualquer email.

As caixas (pôr a **chave** indicada quando a Meta o permitir; se não permitir, o site reconhece a
caixa pelo texto — «telefon/ligue», «WhatsApp», «email»):

| Chave              | Texto da caixa |
|--------------------|----------------|
| `consent_chamada`  | Aceito que a MoreThanMoney me telefone para o número indicado, sobre o tema que escolhi. Posso pedir para não voltarem a ligar a qualquer momento. |
| `consent_whatsapp` | Aceito que a MoreThanMoney me envie mensagens por WhatsApp para o número indicado. Saio quando quiser, respondendo SAIR. |
| `consent_email`    | Aceito receber emails da MoreThanMoney sobre o tema que escolhi e novidades relacionadas. Saio quando quiser, pela ligação em cada email. |

Regras que não se dobram:
- **Nenhuma caixa obrigatória e nenhuma pré-marcada.** Uma caixa obrigatória não é consentimento
  livre; uma pré-marcada é ignorada pelo site.
- São as mesmas frases do formulário do site (`lib/pedido-contacto-textos.ts`). Se mudarem lá,
  mudam aqui.

**Ecrã final:** «Obrigado. Contactamos-te só pelos canais que marcaste.» Botão: «Ver o site» →
`https://www.morethanmoney.pt/ligar?ag=AG-SOCIAL`.

## 2. Subscrever o campo `leadgen` (passos do dono)

1. **Permissões do token de Página** — o token guardado em `/admin/social` → Ligações tem de ter
   `leads_retrieval`, `pages_manage_metadata`, `pages_show_list` e `pages_read_engagement`. Se faltar
   `leads_retrieval`, gerar de novo no Graph API Explorer (escolher as duas Páginas) e colar em
   Ligações: o painel refaz a cadeia até ao token de Página que não expira.
2. **Webhook na app Meta** (developers.facebook.com → app «Agente de Conteudo» → Webhooks):
   - Objecto: **Page**
   - URL de retorno: `https://www.morethanmoney.pt/api/webhooks/meta-leadgen`
   - Verify token: o mesmo dos webhooks do Instagram (`IG_WEBHOOK_VERIFY_TOKEN`, ou
     `META_LEADGEN_VERIFY_TOKEN` se se quiser um próprio)
   - Subscrever o campo **`leadgen`**.
3. **Ligar a Página à app** (uma vez):
   `POST /{page-id}/subscribed_apps?subscribed_fields=leadgen` com o token da Página.
4. **Gestor de Leads / CRM**: em Business Suite → Definições da Página → Acesso a leads, dar acesso
   à app «Agente de Conteudo». Sem isto a Graph API devolve erro ao ler o lead.
5. **Testar** com a ferramenta oficial: `developers.facebook.com/tools/lead-ads-testing` → escolher a
   Página e o formulário → «Criar lead». O lead deve aparecer em `pedidos_contacto` (fonte
   `meta_lead_ads`) e a tarefa em `aios_tasks` (kind `envio:contacto_imediato`), com aviso no Telegram.
6. Se a app ainda estiver em modo de desenvolvimento, só leads de administradores da app chegam.
   Para receber leads reais a app tem de estar em modo **Live** com `leads_retrieval` aprovado.
   O portfólio MoreThanMoney ainda está «Unverified» no Business Manager: pode ser preciso
   verificar a empresa antes da revisão da app.

## 3. Proposta de campanha (não criada)

| | |
|---|---|
| **Objectivo** | Leads (formulário instantâneo, o de cima) |
| **Público** | Portugal e Brasil · 25-55 anos · interesses: trading, Forex, mercado financeiro, investimento, finanças pessoais, criptomoedas, MetaTrader |
| **Estrutura** | 2 conjuntos de anúncios, um por país (custos e idioma diferentes: PT-PT para Portugal, PT-BR para o Brasil) |
| **Colocações** | Advantage+ (Feed e Reels do Instagram e do Facebook, Stories) |
| **Criativos** | 3 por conjunto: um vídeo curto do Ricardo a explicar a chamada, um carrossel do que se aprende, uma imagem do MTM Funded. Ouro sobre carvão. Prova só em pips, com origem declarada; nada de euros ganhos nem percentagens de retorno prometidas |
| **Orçamento sugerido** | Teste de 7 dias com 10 €/dia por conjunto (≈140 € no total). Depois, manter só o conjunto com o custo por lead que deu chamadas atendidas, e subir no máximo 20 % a cada 3 dias |
| **Medida que decide** | Não o custo por lead: a percentagem de leads com caixa de chamada marcada e a percentagem de chamadas atendidas. Um lead sem nenhuma caixa marcada não entra na lista dos agentes |

Avisos de conformidade a ter presentes na Meta:
- Anúncios de serviços financeiros e trading podem cair na categoria especial «Serviços
  financeiros» em alguns países, que restringe idade e segmentação. Escolher a categoria se a Meta
  a pedir.
- Nada de promessas de rendimento no texto do anúncio (políticas da Meta e da CMVM/CVM).
- Incluir o aviso de risco no texto principal: «Negociar com alavancagem implica risco de perda do
  capital investido.»
