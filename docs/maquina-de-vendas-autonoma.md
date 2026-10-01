# A máquina de vendas autónoma — o mapa real

> Levantado a 2026-10-01 por leitura do repositório e consulta à base de produção
> (`iwscxotvmtkphajmasof`). Cada afirmação traz a prova: ficheiro e linha, ou a consulta que a
> produziu. **Onde não houve prova, está escrito que não houve.**

O pedido era: «a máquina de vendas, e tudo o que esteja interligado — pipelines, conteúdo social,
bot Telegram, agentes — devem aprender a trabalhar em conjunto e autonomamente».

Este documento não descreve o que se quer. Descreve o que **está lá**, em três colunas: ligado,
ligado mas parado, e inexistente. A ordem importa: metade do que parecia faltar já existe e
funciona, e uma das peças que parecia funcionar não media nada.

---

## 0. As peças, e onde vivem de facto

Duas correcções ao mapa de partida, porque confundem quem for procurar:

| Procurava-se | Está em |
|---|---|
| `lib/sales-machine/` (pasta) | `lib/sales-machine.ts` — **um ficheiro**, 14,5 KB |
| `app/api/sales-machine/` | `app/api/sales-machine/route.ts` — um só `route.ts` |

O hub é `app/api/sales-machine/route.ts:1-38`: `GET` devolve o estado, `POST` corre um comando.
Autoriza por sessão de admin **ou** `Bearer CRON_SECRET`, para o AIOS local poder entrar
(`route.ts:14-19`). O núcleo partilhado é `lib/sales-machine.ts` — `buildSalesState()` e
`runSalesCommand()` — e é o mesmo que `/api/agent/v1/business` usa, para as três pontas (admin,
AIOS do site, AIOS local) verem o mesmo número.

---

## 1. LIGADO — existe, corre, e tem efeito medido

### 1.1 Telegram → pipeline do backoffice

**Funciona, e a 01/10 está a 100%.** Era a dúvida nº 1 do pedido.

São tabelas diferentes, ligadas por uma ponte batch:

- os leads do bot vivem em `telegram_leads` (`lib/telegram-lead-funnel.ts:242`, upsert por `chat_id`);
- o pipeline lê **só** `vendas_negocios` (`lib/backoffice-negocios.ts:151-152`);
- a ponte é `doTelegram` em `lib/backoffice-dia-ingestao.ts:192-226`, que escreve candidatos com
  `chave_origem: 'telegram:<chat_id>'` (`:206`) e `origem: 'telegram'` (`:220`);
- corre no cron `backoffice-dia`, `0 7 * * 1-5` (`vercel.json:231-234`), via
  `lib/backoffice-dia-motor.ts:349`.

Prova de que a ponte está a passar:

```sql
select (select count(*) from telegram_leads)                                  leads,
       (select count(*) from vendas_negocios where chave_origem like 'telegram:%') no_pipeline;
-- → leads 3, no_pipeline 3
```

E o interruptor que a governa está **ligado**:

```sql
select value from site_settings where key = 'backoffice_motor_dia_ligado';  -- → true
```

Isto desmente o sintoma que o próprio código documenta
(`lib/telegram-lead-funnel.ts:358-369`, «o grupo ter 62 membros e o pipeline não conhecer
nenhum»): esse era o estado antigo. Hoje passa. **O que resta do defeito está em 2.1.**

### 1.2 A cadeia da atribuição dos agentes

Estava inteira, do clique ao livro — **excepto a primeira peça**, que é o que este trabalho fechou
(ver §4):

| Passo | Onde | Estado |
|---|---|---|
| apanhar `?ag=` em qualquer página | `components/agentes/captura-atribuicao.tsx:23-40`, montado em `app/layout.tsx:93` | ligado |
| guardar 30 dias no browser | `lib/agentes/atribuicao.ts:41-49` (`JANELA_DIAS = 30`) | ligado |
| ler no checkout | `app/api/marketplace/checkout/route.ts:314` | ligado |
| gravar na compra | `marketplace_compras.agente_codigo` (`checkout/route.ts:392`) | ligado |
| ler para a receita | `lib/agentes/receita.ts:290` | ligado |
| **emitir um link com `?ag=`** | **ninguém** | **era o buraco — ver §4** |

A decisão de não usar o campo do cupão está escrita em `lib/agentes/atribuicao.ts:16-28`, e tem
razão de cliente: o checkout só aceita um cupão, e um código de agente (0% de desconto) a ocupá-lo
tirava o desconto a quem tivesse um a sério.

### 1.3 A regra de vida dos agentes

`lib/agentes/vida.ts:1-30` — um agente mantém-se vivo enquanto se pagar a si próprio em 48 h
(`JANELA_HORAS = 48`, `ORCAMENTO_INICIAL = 10`, `CARENCIA_HORAS = JANELA_HORAS`). **Pára, não se
apaga**, por três razões escritas no cabeçalho, e a primeira é a que este documento confirma: *«a
medição vai errar»*.

A janela soma-se de `agentes_eventos`, não do acumulado em `agentes_equipa.receita`
(`lib/agentes/motor.ts:21-27`) — é a diferença entre a regra existir e existir só no comentário.
Corre no cron `agentes`, `0 6 * * *` (`vercel.json:240-242`). Há 14 linhas em `agentes_eventos`,
logo já correu.

### 1.4 Receita não atribuível não se reparte

`lib/agentes/receita.ts:1-40`. A regra: *«receita que não é atribuível não se inventa nem se
divide»* — fica por atribuir, com o motivo escrito. O cabeçalho enumera, com honestidade, as
quatro ligações possíveis e a força de cada uma: `marketplace_compras.cupao_codigo` é a única
forte; `profiles.coupon_code` é por pessoa e sobrescrito, e **o painel diz que é fraco**
(`ForcaDaLigacao`, `receita.ts:43-47`).

### 1.5 O gate de rascunho — existe, com estados nomeados

O pedido dizia «procura como a máquina de vendas já faz isso e segue-o». Faz, em três formas
diferentes, e só uma é um gate a sério:

| Superfície | Mecanismo | Prova |
|---|---|---|
| Conteúdo social | `status in ('draft','approved','processing')`; aprovar só a partir de `draft` | `lib/sales-machine.ts:23-28`, `:250-263` |
| Setter do Instagram | `ig_setter_rascunhos.estado in ('rascunho','aprovado','enviado','descartado','encerrado')` | `supabase/migrations/144_ig_setter_rascunhos.sql:70-71` |
| Backoffice | `vendas_tarefas.rascunho` — texto para **a pessoa copiar**, sem caminho de envio | `supabase/migrations/137_backoffice_dia_rascunho.sql:9`; declarado em `lib/backoffice-dia-mensagem.ts:16-20` |

O mais parecido com o pedido é o do Instagram: três interruptores separados (`redigir`,
`enviar_publica`, `enviar_dm`), **false por omissão** (`lib/instagram/setter.ts:43-53`).

### 1.6 Os crons

59 entradas em `vercel.json`. Os que tocam esta máquina:

| Cron | Horário | Prova |
|---|---|---|
| `content-draft` | `20 4 * * *` | `vercel.json:212-213` |
| `agentes` | `0 6 * * *` | `vercel.json:240-241` |
| `backoffice-dia` | `0 7 * * 1-5` | `vercel.json:232-233` |
| `bot-responder` | `* * * * *` | `vercel.json:175-178` |
| `funis` | `* * * * *` | `vercel.json:183-186` |
| `ig-funnel` | `*/30 * * * *` | `vercel.json:15-18` |

---

## 2. LIGADO MAS PARADO — o código existe e não produz efeito

### 2.1 O lead entra no pipeline e depois congela

`lib/backoffice-dia-ingestao.ts:172` — `upsert(..., { ignoreDuplicates: true })`. Depois da
primeira cópia, **nada propaga**: um lead que passou a `pending_review` no Telegram, ou que deu o
`broker_uid`, continua `lead` no pipeline para sempre. Não há UPDATE em sítio nenhum.

Dois travões a mais, menores: tecto de 15/dia (`:33-41`, aplicado em `:182-184`) e só dias úteis
(`lib/backoffice-dia-motor.ts:346`).

### 2.2 O bot não sabe o que o closer escreveu — sentido inverso inexistente

Este é o ponto 1 do pedido, na metade que **não** está feita. Prova negativa: `vendas_negocios` e
`vendas_tarefas` não aparecem em `lib/telegram-lead-funnel.ts`, `lib/telegram-lead-followup.ts`,
`lib/automacoes.ts` nem `app/api/telegram/webhook/route.ts` — zero ocorrências.

O prompt do bot recebe apenas: o `history` do próprio lead (`lib/telegram-lead-funnel.ts:131-135`),
`getProofStats()` (`:139`) e `site_settings.pips_proof` (`:159`). A nota do closer fica em
`vendas_negocios.nota` (`app/api/backoffice/negocios/[id]/route.ts:246-247`, UI em
`app/backoffice/pipeline/trabalhar.tsx:50,128`) e é lida **só por humanos** e pelo redactor de
rascunhos (`lib/backoffice-dia-mensagem.ts:43-53`).

Consequência concreta: o bot pode re-qualificar, do zero, um lead que o closer já trabalhou — e
contradizer o que a pessoa ouviu ontem.

### 2.3 `lib/factos-da-casa.ts` — a fonte única, usada em exactamente 4 prompts

`contextoDaCasa()` em `lib/factos-da-casa.ts:204-206`. Os quatro:

1. `lib/telegram-lead-funnel.ts:52` — o closer IA em DM do Telegram
2. `lib/telegram-lead-followup.ts:35` — o SDR de reactivação
3. `lib/automacoes.ts:182` — as automações IA
4. `lib/agent-site-api.ts:330` — o agente/AIOS do site

Está ligada e correcta. O que falta é o **estado por-lead** (§2.2): os factos da casa são iguais
para todos, e é isso que eles são.

### 2.4 Rotas de cron órfãs — existem e nada as chama

| Rota | Comentário no código | Em `vercel.json` |
|---|---|---|
| `app/api/cron/lead-followup/route.ts:16` | `:6` diz «correr a cada ~2h» | **ausente** |
| `app/api/cron/sales-digest/route.ts:26` | — | **ausente** (só à mão, `lib/sales-machine.ts:292`) |
| `app/api/cron/content-repost/route.ts` | — | **ausente** (só à mão, `:290`) |

A mais caro é a primeira: `lib/telegram-lead-funnel.ts:253` escreve `followup_count: 0` em cada
lead, à espera de uma sequência de três toques **que nunca corre**.

### 2.5 O motor de funis está desligado por omissão — e está desligado

`lib/funis-bracos.ts:20-35`: falhar a ler a flag conta como desligado. A chave não existe:

```sql
select key from site_settings where key = 'funis_motor_ligado';  -- → 0 linhas
```

Verificado em `app/api/cron/funis/route.ts:23`. O cron corre ao minuto (`vercel.json:183-186`) e
não faz nada.

### 2.6 O estado `'aprovado'` do setter está declarado e não é implementado

O CHECK aceita-o (`migrations/144_...sql:70-71`), mas nenhum código o escreve: o fluxo vai de
`'rascunho'` direito a `'enviado'` (`lib/instagram/setter.ts:266,289`). **O degrau de aprovação
humana existe no esquema e não existe no caminho.**

> ⚠️ **A assinalar ao dono, não corrigido aqui.** O pedido diz «nada envia mensagens a clientes sem
> aprovação humana». Em produção, hoje:
> ```sql
> select value from site_settings where key = 'ig_setter_persona';
> -- → {"redigir": true, "enviar_dm": true, "enviar_publica": true}
> ```
> Com `enviar_dm: true` e sem ninguém a escrever `'aprovado'`, **o setter do Instagram envia DMs
> sem passar por uma pessoa**. Os interruptores são uma decisão do dono e não se mexem sem ele; o
> que se faz aqui é dizer que o estado da produção não corresponde ao limite escrito.

### 2.7 No Telegram não há gate nenhum

Ao contrário do Instagram e do conteúdo social, o Telegram envia directo:

- funil do bot: `app/api/telegram/webhook/route.ts:948-959` — resposta da IA e `sendMessage` a
  seguir, nada no meio;
- automações: `app/api/cron/bot-responder/route.ts:42-57` — `fetch(.../sendMessage)` directo. A
  `mtm_conversa_fila` é um atraso de ~8 s (`lib/automacoes.ts:217-231`), **não é aprovação**;
- follow-up: `lib/telegram-lead-followup.ts:112-120`.

### 2.8 A receita real não é medível pela ligação forte

O ponto mais importante desta secção, e a razão da recomendação em §6.

```sql
select (select count(*) from marketplace_compras) compras,     -- → 0
       (select count(*) from vendas_vendas)       vendas,      -- → 2
       (select sum(valor_cents)/100.0 from vendas_vendas) eur; -- → 35.00
```

`receita.ts` lê as duas fontes (`lib/agentes/receita.ts:270-277`): `marketplace_compras` traz o
código **na compra** (ligação exacta) e `vendas_vendas` **não tem coluna de código nenhuma** — o
código vem do perfil do comprador, e é fraco. Hoje: toda a receita está no livro, e o caminho
forte está vazio.

E o caminho fraco também não serve: 12 dos 135 perfis têm `coupon_code`, e são cupões de desconto,
que `pareceCodigoDeAgente` recusa de propósito (`lib/agentes/atribuicao.ts:51-65`).

**Os 35 € de 01/10 continuam, legitimamente, por atribuir.** Não por defeito de contabilidade: por
não ter existido um link de agente antes deles.

---

## 3. INEXISTENTE — não há código

| O que | Prova de ausência |
|---|---|
| Qualquer leitura backoffice → bot | grep de `vendas_negocios\|vendas_tarefas` nos 4 ficheiros do bot: zero |
| `UPDATE` de um negócio a partir do lead do Telegram | `ignoreDuplicates: true`, `lib/backoffice-dia-ingestao.ts:172` |
| Gate de aprovação para mensagens de Telegram | §2.7 |
| Coluna de código de agente no livro de vendas | `vendas_vendas` não a tem (esquema em §2.8) |
| Agente dono do MTM Funded ou dos criadores | `agentes_equipa` tem 7 linhas; nenhuma |
| Qualquer execução de ordens por um agente | **e é de propósito** — a conta do trader é de PAPEL (`lib/agentes/trader.ts`) |

---

## 4. A ligação que se fechou: o conteúdo passa a poder ser medido

### O buraco, medido antes

```sql
select count(*) total, count(*) filter (where caption ilike '%?ag=%') com_ag
  from social_scheduled_posts;
-- → total 200, com_ag 0   (181 já publicados)

select count(*) from social_scheduled_posts where caption ~* 'morethanmoney\.pt';
-- → 39 legendas levam um link nosso, nenhuma leva código
```

Os sete agentes estavam todos `vivo` com `receita = 0`. A cadeia de §1.2 estava inteira e **nunca
começava**: ninguém emitia um link com `?ag=`. Com receita zero para todos, a regra das 48 h
preparava-se para parar a equipa inteira — **por falta de medição, não de trabalho** — e o motivo
escrito em cada linha (`sem_codigo`) ia parecer sólido a quem o lesse depois.

### O que se fez

**`lib/agentes/marca-conteudo.ts`** (novo, puro) — põe o código do agente nos links nossos de uma
legenda, e diz quem é o dono de cada pilar. `marcarLegenda` e `marcarConteudo` não leem nem
escrevem nada.

**`lib/agentes/marca-conteudo.check.ts`** (novo) — `npx tsx lib/agentes/marca-conteudo.check.ts`.
Quatro casos maus, nenhum dá erro e todos custam dinheiro. As URL dos testes são as que estavam
**realmente** na base, incluindo `morethanmoney.pt/register.` com o ponto colado.

> A guarda pagou-se na primeira execução: apanhou três falhas reais no meu padrão —
> `instagram.com/morethanmoney.pt` (o nosso nome no caminho de outro site),
> `nao-morethanmoney.pt` e `morethanmoney.pt.evil.com` estavam todos a ser marcados como nossos.

**`lib/agentes/atribuicao.ts`** — `normalizar()` passa a descolar a pontuação final. O caso mau:
o código vai no fim do endereço, o endereço está dentro de uma frase que acaba em ponto, e quem
auto-liga o texto pode levar o ponto para dentro da ligação. A página abre (o caminho está certo),
`ag` chega como `AG-SAAS.`, a forma falha, e a atribuição **desaparece sem erro**. Cortar a
pontuação não afrouxa a guarda — o teste continua ancorado e continua a recusar `BLACKFRIDAY50`,
e isso está provado nos dois ficheiros `.check.ts`.

**`supabase/migrations/168_social_posts_atribuicao_agente.sql`** (aplicada) —
`agente_codigo`, `agente_motivo`, `agente_links_marcados` em `social_scheduled_posts`, com CHECK
na forma do código (a mesma de `pareceCodigoDeAgente`) e nos motivos.

**`app/api/cron/content-draft/route.ts`** — marca a legenda do modelo antes de lhe colar o bloco
interno (o brief nunca é publicado, logo um link marcado lá não media nada), escreve as três
colunas, e põe no bloco interno a linha `📊 Agente:` para quem revê ver se o post mede alguma
coisa **antes** de aprovar.

**`app/api/cron/content-repost/route.ts`** — o repost herda o código do original por
`codigoExplicito`, não pelo pilar (o pilar de um repost é `repost:<uuid>` e nunca estará no mapa).
O crédito de um repost é de quem escreveu o original.

**`lib/sales-machine.ts`** — `SalesState.atribuicao` (`AtribuicaoConteudo`): total, com dono, a
medir, `porAtribuir` **por motivo**, e por agente. Sem isto o trabalho era invisível, e não havia
onde ver a diferença entre um agente que não trabalhou e um que trabalhou e não foi medido.

### As duas regras que isto respeita, e porquê

**Não se inventa um dono.** `AGENTE_POR_PILAR` está deliberadamente incompleto: `cta:desafio`
(MTM Funded), `cta:criar`, `resultados` e `prova` não têm agente, porque **não há hoje agente dono
desses produtos**. O reflexo — cair no CEO — dava ao topo receita que ninguém ganhou, e a regra de
vida salvava-o com dinheiro que não era dele. Fica `null` com `motivo: 'pilar_sem_agente'`.

**Um post com dono mas sem link nosso também não mede nada**, e tem de se saber: é o caso da
maioria dos 200 posts. «AG-SAAS, 0 €» parece um agente mau; «AG-SAAS, sem link nosso onde medir» é
a verdade. Daí `agente_links_marcados` e o motivo `'sem_link_nosso'` ao lado do código.

### Quando é que isto passa a produzir

`content_autopilot` está **`{"ricardo": true, "morethanmoney": true}`**, e `content-draft` corre às
`20 4 * * *`. Os próximos posts saem marcados sem ninguém fazer nada. **Os 181 já publicados não
se corrigem** — a legenda de um post publicado é a que lá ficou.

---

## 5. O que compete a cada agente, e o que não compete

Por escrito, porque o ponto 3 do pedido o exige e porque um limite que não está escrito não é um
limite.

| Pode, sozinho | Não pode, nunca |
|---|---|
| Escrever rascunhos de conteúdo (`content-draft`) | Executar ordens de trading ou mexer em dinheiro — a conta do trader é de **papel** de propósito (`lib/agentes/trader.ts`) |
| Marcar os próprios links com o seu código (§4) | Enviar mensagem a um cliente sem aprovação humana |
| Propor; pedir orçamento | Decidir preço, campanha ou pacote |
| Ser medido e parado pela regra das 48 h (`vida.ts`) | **Apagar-se** — pára, com motivo registado (`vida.ts:9-23`) |
| Publicar quando o dono ligou o autopilot da conta | Ligar o seu próprio autopilot |
| Herdar o código do original num repost | Sobrepor-se a um código que já lá estava (provado no `.check.ts`) |

E o que o próprio código recusa fazer: inventar um número. `receita.ts` deixa por atribuir com o
motivo; `marca-conteudo.ts` não dá dono a um pilar que não o tem; `vida.ts` não apaga. As três são
a mesma decisão vista de três sítios.

---

## 6. O que recomendo a seguir, por ordem de valor

**1. Pôr o código do agente no livro de vendas.** É o que falta para a medição valer alguma coisa:
hoje a ligação forte só existe em `marketplace_compras`, que está **vazia**, e toda a receita real
está em `vendas_vendas`, que não tem coluna (§2.8). Uma coluna `agente_codigo` em `vendas_vendas`
e um campo em `VendaConfirmada` (`lib/vendas/livro.ts:229`) chegam — mas há **cinco portas** a
alimentar, e cada uma tem de trazer o código no metadata para ele chegar ao servidor:
`app/api/stripe/webhook/route.ts:933`, `app/api/apple/iap/validate/route.ts:229`,
`app/api/apple/iap/webhook/route.ts:179`, `app/api/admin/vendas/vendas/route.ts:77` e
`lib/marketplace/venda-equipa.ts:75`. Faz-se com guarda, porque uma porta esquecida é receita que
se perde em silêncio — exactamente o defeito de §4.

**2. Dar ao bot o estado do lead no pipeline** (§2.2). É o ponto 1 do pedido na metade que falta, e
é o mais barato dos grandes: `lib/telegram-lead-funnel.ts:131-135` já monta o contexto; falta
juntar-lhe `vendas_negocios.estado` + `nota` do negócio com `chave_origem = 'telegram:<chat_id>'`.
Sem isto o bot contradiz o closer, e é a pessoa que ouve as duas versões.

**3. Fazer a ponte actualizar, não só inserir** (§2.1). Trocar `ignoreDuplicates: true` por um
UPDATE das colunas que mudam. Com guarda: o caso mau é um UPDATE a pisar o trabalho do closer — o
que o Telegram sabe não pode apagar o que uma pessoa escreveu.

**4. Decidir o `lead-followup`** (§2.4): ou entra no `vercel.json`, ou sai do repositório. Código
que parece correr e não corre é pior do que código que não existe, porque ninguém o vai procurar.

**5. Implementar o `'aprovado'` do setter** (§2.6), que é o único sítio onde o limite «nada envia
sem aprovação humana» está declarado e não cumprido — e está com `enviar_dm: true`.

### Dívida vizinha que não é deste trabalho

`npx tsc --noEmit` fecha com **2 erros**, ambos em `components/mobile/live-sessions-mobile.tsx`
(`PastaAcademia`, `ChevronLeft`). Esse ficheiro está a ser mexido em paralelo por outro trabalho
(sessões/academias) e **não foi tocado aqui**. Zero erros nos ficheiros desta entrega.
