# Receita hoje — 06/10/2026

> Mapa do dinheiro mais perto, lido da base (Supabase `iwscxotvmtkphajmasof`) a 06/10.
> Preços de `lib/escada-precos.ts` (Membro 35€/mês, Premium 65€/mês, 1.º mês Premium 34,99€,
> Elite 597€/ano) e de `mtm_funded_programs`. Nenhum número de prova nem de lucro.
> Os contactos (emails, telefones) não estão aqui: estão nos rascunhos e no perfil de cada pessoa.

---

## 1. O mapa

«Valor potencial» = preço mensal real do pack que a mensagem propõe. Não é previsão: é o máximo
que aquela linha factura se a pessoa disser que sim.

| Seg. | O que é | Pessoas | Valor potencial | Base legal para contactar | Estado |
|---|---|---|---|---|---|
| **a1** | Pagamento recusado pelo banco → subscrição cancelada (churn involuntário) | **6** (Amiltom, Micaela, Fábio Freitas, Mauro Monteiro, Victor Wanyoike, Nuno Fernandes `njorsefer`) | **285€/mês** | Cliente / quem iniciou checkout → email de serviço sobre o pagamento dele | 6 rascunhos |
| **a2** | Pagou e cancelou | 1 (Aanssi Kushwah) | 65€/mês | Ex-cliente → aviso de renovação (regra do dono) | 1 rascunho |
| **a3** | Acesso concedido (migração IQONIC/VXA, comunidade) que terminou a 18–24/09 e nunca pagou à MTM | 41 (23 ex-Premium, 16 ex-comunidade, 2 ex-Membro) | 2 125€/mês | Ex-utilizador com conta → aviso de renovação. **Já levaram 2 emails** (aviso 17/09 + ativação 27/09) | 41 rascunhos (3.º e último toque) |
| **b** | Expira nos próximos 7 dias | 4 | 240€/mês | Clientes | 1 rascunho; 3 renovam sozinhos no Stripe |
| **c** | `conversion_deadline` próximo / trials | **0** (todos os prazos eram 31/08; 0 trials activos) | — | — | nada a fazer |
| **d** | Leads Telegram/IG/WhatsApp com mensagem nos últimos 14 dias | Telegram 3 (1 é o dono, 1 já levou os 3 toques, 1 entrou no grupo sem escrever) · Instagram 1 pessoa (7 comentários) · WhatsApp 0 | — | Quem iniciou → resposta | 0 rascunhos (ver §4) |
| **e** | Checkouts abandonados | 1 real (Fábio Rodrigues, add-on descontinuado) + 12 no marketplace que são **todos testes do dono** | — | — | coberto pelo rascunho de b |
| **f** | Subir na escada | 3 Membros pagantes → Premium (+30€/mês cada = 90€/mês) · 5 Premium pagantes → Elite (597€ cada) · membros pagantes com UID da corretora por validar (Rui, Lucas, Sandra, Christine, Fábio Henriques) | até 90€/mês + 2 985€ | Clientes, mas **upsell é campanha → sem consentimento não vai por email**. Vai por chamada/mensagem 1-a-1 | lista de chamadas em §3 |
| **g** | Fila `aios_tasks` `envio:*` antes de hoje | **0** | — | — | — |

**Consentimento de marketing:** `captacao_consentimento` tem **0 linhas**. Ninguém nesta base pode
receber uma campanha. Tudo o que foi para a fila é email de serviço/renovação a quem tem ou teve
conta; o resto (upsell, leads frios) é 1-a-1.

### Detalhe de b (expira até 13/10)

| Pessoa | Pack | Expira | Renova sozinho? | Acção |
|---|---|---|---|---|
| Fábio Rodrigues | Premium por cupão CONCEICAO | 09/10 | **Não** | rascunho (65€/mês) |
| Sandra Oliveira | Premium + add-on cópia | 11/10 | Sim (Stripe) | nada; o cron `subscription-expiry` avisa 2 dias antes |
| Lucas | Membro | 12/10 | Sim (Stripe) | nada |
| Rúben Sousa | Membro + add-on cópia | 13/10 | Sim (Stripe) | nada |

Nota: a Sandra tem `inactive_reason = payment_failed` antigo (falhas de julho/agosto), mas pagou a
07/09 e 18/09. Não há nada para recuperar ali.

---

## 2. Os rascunhos (49, na fila de aprovação)

**Onde se aprovam:** `/admin/social/leads` → bloco «Envios por aprovar» (lê `aios_tasks`
`kind like 'envio:%'`, `status = 'pendente'`). Aprovar = sai por email nesse momento; rejeitar =
nunca sai. Todos têm `created_by = 'agente:receita-hoje'` e `chave = receita-hoje-2026-10-06:<user_id>`.

**Porque o `kind` é `envio:email_recuperacao_checkout`:** é o único kind de email que
`lib/envios-fila.ts` sabe enviar hoje. Criar um kind novo (`envio:email_servico`) obrigava a deploy
antes de se poder aprovar — e o objectivo é facturar hoje. O caminho de envio só lê
`payload.email/assunto/texto`; o `payload.origem = 'receita_hoje_2026_10_06'` separa estes dos
lembretes de checkout. Dívida: criar o kind próprio depois (ver §5).

Cada rascunho tem: nome, o que tinha, a data em que terminou, o motivo real (falha do banco,
cancelamento, fim do acesso concedido), o preço, o link assinado e uma saída honesta («diz-me e não
volto a escrever»). Sem prova numérica: a prova medida (`lib/pips-proof.ts`) não entrou porque não
há forma de garantir que `publicavel()` é verdadeiro no momento do envio.

### Ordem por valor esperado

| # | Pessoa | Segmento | Valor | Agente | Link |
|---|---|---|---|---|---|
| 1 | Amiltom Carlos Gomes Pires | a1 · 10 débitos recusados, acesso **termina hoje** | 65€/mês | AG-EMAIL | `/upgrade?ag=AG-EMAIL` |
| 2 | Micaela Pimentel | a1 · 9 recusas 18/09–02/10, nunca arrancou | 65€/mês | AG-EMAIL | `/upgrade?ag=AG-EMAIL` |
| 3 | Fábio Rúben Freitas Ferreira | a1 · pagou 34,99€ em agosto, renovação recusada 10× | 65€/mês | AG-EMAIL | `/upgrade?ag=AG-EMAIL` |
| 4 | Nuno Fernandes (`njorsefer`) | a1 · conta **ainda aberta**, subscrição `unpaid` desde 06/09 | 20€/mês (valor que pagava) | AG-EMAIL | `/member-area?tab=subscription&ag=AG-EMAIL` |
| 5 | Mauro Monteiro | a1 · Membro desde 04/08, renovação recusada | 35€/mês | AG-FORMACAO | `/upgrade?ag=AG-FORMACAO` |
| 6 | Victor Wanyoike (EN) | a1 · 2 recusas, nunca arrancou | 35€/mês | AG-FORMACAO | `/upgrade?ag=AG-FORMACAO` |
| 7 | Aanssi Kushwah (EN) | a2 · pagou e cancelou, terminou 20/09 | 65€/mês | AG-EMAIL | `/upgrade?ag=AG-EMAIL` |
| 8 | Fábio Rodrigues | b · cupão termina 09/10, sem renovação | 65€/mês | AG-EMAIL | `/upgrade?ag=AG-EMAIL` |
| 9–31 | 23 ex-Premium concedidos (8 em inglês: nomes dos Balcãs/estrangeiros) | a3 · terminou 18 ou 20/09 | 65€/mês cada (1 495€) | AG-EMAIL | `/upgrade?ag=AG-EMAIL` |
| 32–47 | 16 ex-comunidade | a3 · terminou 20/09 | 35€/mês cada (560€) | AG-FORMACAO | `/upgrade?ag=AG-FORMACAO` |
| 48–49 | 2 ex-Membro concedidos | a3 · terminou 24/09 | 35€/mês cada (70€) | AG-FORMACAO | `/upgrade?ag=AG-FORMACAO` |
| | **Total** | | **2 540€/mês** | | |

Os de topo (1–8) estão com `priority = 'alta'`.

**Excluídos de propósito (8):** Alcy Landim (parceiro/provider Gold Did, não é venda);
contas duplicadas cuja pessoa já tem outra conta activa ou recebe pela outra — LUKAS STARK
(`lucasstark28`, é o Lucas que paga Membro), Fábio Henriques (`allyks6`, migrado para a conta activa),
Suzana Petrovic (2.ª conta), Adilson Araujo (2.ª conta), Gonçalo Brito (2 de 3 contas) e Carlos
Vieira (2.ª conta). Se alguma destas for outra pessoa, acrescenta-se à mão.

### Um exemplo de cada tipo (o texto completo está em cada rascunho)

**a1 — pagamento recusado (Amiltom):**
> O pagamento do teu Premium falhou várias vezes desde 5 de setembro e a subscrição acabou por ser
> cancelada. O acesso termina hoje, 6 de outubro. Quase sempre é o cartão (…) São 65€/mês e
> cancelas quando quiseres. (…) Se a ideia era mesmo sair, responde só com o porquê, numa linha.

**a3 — ex-Premium concedido:**
> O teu acesso Premium terminou a 18 de setembro e a conta ficou em pausa. Não se apagou nada (…)
> Premium, 65€/mês (…) Membro, 35€/mês (…) Se não for altura, responde a dizer e não volto a
> escrever sobre isto.

### A questão legal que o dono tem de decidir ao aprovar o a3

O dono disse: «clientes e ex-clientes podem receber email de serviço/renovação». O código é mais
apertado: `podeReceber(p, 'servico')` em `lib/captacao-consentimento.ts` só aceita **cliente
pagante agora**. Os 41 do a3 nunca pagaram à MTM (tinham acesso concedido) e **já receberam dois
emails** sobre isto. Os rascunhos estão escritos como último toque, com saída explícita. Se o dono
achar que isto é campanha, rejeita o bloco a3 inteiro e aprova só os 8 de cima — que são onde está
a maior parte da probabilidade de pagar hoje.

---

## 3. As 3 acções de 15 minutos para facturar hoje

1. **Aprovar os 8 de topo em `/admin/social/leads`** (ordem 1–8, prioridade alta). São seis pessoas
   que quiseram pagar e o banco recusou, uma que pagou e saiu, e um acesso que acaba na quinta.
   Até 415€/mês em jogo, e são as mais prováveis de dizer sim. Depois decidir o bloco a3 (41) com
   a nota legal acima.

2. **Ligar a 5 clientes** (telefone no perfil, `/admin/members`). Upsell não pode ir por email sem
   consentimento; por telefone, 1-a-1, pode:
   - **Amiltom** e **Fábio Freitas** — têm telefone; o email chega, mas uma chamada a dizer «o teu
     cartão falhou, queres que te mande o link?» fecha mais depressa.
   - **Rúben Sousa**, **Rui Rodrigues**, **Lucas** — pagam Membro (35€). A diferença para o Premium
     são as ferramentas do site (Terminal MTM, MTM Alerts, portefólios, planos de trading). +30€/mês
     cada. O Rui e o Lucas já mandaram o UID da corretora e **não estão validados**: perguntar se
     depositaram — é o caminho da escada (depósito validado → Premium incluído, receita por rebate).
   - Guião curto: «Vi que estás no Membro há X meses. Usas o Terminal ou os alertas do site? É o que
     o Premium acrescenta. Queres que te mande o link para mudares?» Link: `/upgrade?ag=AG-FORMACAO`.

3. **Publicar na comunidade (chat/grupos, não email) a oferta MTM Funded Launch** — 10K de 2 fases
   por **10€, um por pessoa** (`launch-10k-2f`, activa, preço Stripe criado). Só 3 contas a
   receberam até hoje, e todas como oferta a 0€. Uma publicação no chat dos membros activos não é
   campanha de email, e o produto já existe. Texto sugerido:
   > «O MTM Funded abriu. Para quem já está cá dentro: o desafio de 10K em duas fases custa 10€,
   > um por pessoa. Regras completas na página do programa. Educação, não aconselhamento
   > financeiro.»

   Alternativa se o dono preferir valor maior: ligar aos 5 Premium que pagam (Tiago Pedrosa, Mohit
   Mahemy, Christine Barbuscia, Ivo Loureiro, Sandra Oliveira) e propor o **Elite (597€/ano)** — mas
   confirmar primeiro que `STRIPE_PRICE_ELITE_ANNUAL` está na Vercel, senão o checkout responde
   «preço não configurado».

---

## 4. O que bloqueia mais receita, e como desbloquear

1. **Zero consentimento registado.** `captacao_consentimento` = 0 linhas, por isso nenhum lead ou
   cliente pode receber campanha, nem upsell por email. A caixa já está escrita
   (`TEXTO_CAIXA_CHECKOUT`, `PONTOS_DE_CAPTURA`). Desbloquear: confirmar que a caixa está viva no
   `/register`, `/upgrade` e marketplace e que grava no livro; e pedir o consentimento aos
   membros activos dentro da app (um banner «queres receber as novidades por email?»), não por email.

2. **Pagamentos recusados sem recuperação.** 6 pessoas foram perdidas por cartão recusado em
   setembro/outubro: o Stripe tentou 9–12 vezes em silêncio e cancelou. Não há email «o teu cartão
   falhou, actualiza aqui» ao primeiro falhanço. Desbloquear: no webhook `invoice.payment_failed`,
   criar um rascunho `envio:` na mesma fila (ou ligar os emails de recuperação de pagamentos do
   próprio Stripe em Settings → Billing → Customer emails, que é zero código). Há ainda o caso do
   **Nuno Fernandes (`njorsefer`)**: `is_active = true` com subscrição `unpaid` desde 06/09 — tem
   acesso sem pagar. Não mexi (regra: não alterar dados de clientes); o dono decide.

3. **DMs do Instagram falham todas.** `ig_leads`: 11 de 11 com `dm_status = public_fallback` e o
   erro «Unsupported post request… missing permissions» na private reply. Quem comenta «APP»,
   «PREMIUM», «SINAIS» só recebe a resposta pública. Há uma pessoa (`ruipaulo.fxcripto`) que
   comentou 7 vezes entre 24/09 e 03/10 com palavras de compra e nunca recebeu DM. Desbloquear:
   rever a permissão `instagram_manage_messages` / o token de Página em `/admin/social → Ligações`;
   e hoje, à mão, o dono manda uma DM a essa pessoa.

4. **O topo do funil está vazio.** 3 leads no Telegram em 14 dias (um deles é o dono), 0 no
   WhatsApp. Não há leads mornos à espera — os rascunhos de hoje vivem todos da base antiga. A
   receita de amanhã depende de voltar a entrar gente: o conteúdo e o radar do Instagram têm de
   trazer pessoas ao bot (`t.me/MoreThanMoney_aibot?start=lead`).

---

## 5. Dívida deixada por esta corrida

- Os 49 rascunhos usam `kind = envio:email_recuperacao_checkout` porque é o único email que a fila
  sabe enviar. Criar `envio:email_servico` em `lib/envios-aprovacao.ts` + ramo de envio em
  `lib/envios-fila.ts` + rótulo em `components/admin/envios-por-aprovar.tsx`, para o painel não
  chamar «checkout» a uma renovação.
- `MEMORY`/sales brain: a regra «ex-cliente pode receber renovação» do dono e a regra do código
  (`podeReceber('servico')` só para cliente activo) divergem. Decidir uma e pôr a outra igual.
