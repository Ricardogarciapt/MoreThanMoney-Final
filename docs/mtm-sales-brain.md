# MTM Sales Brain — memória + IA para fechar vendas (Claude + )

> Fonte única de verdade para o **enquadramento** de qualquer agente de vendas MTM (Claude,
>  AI, email, DM): o que se vende, por que ordem, com que tom, e o que nunca se diz.
>
> **Este documento não tem números.** Nem preços, nem prova. Os preços vivem em
> [`lib/escada-precos.ts`](../lib/escada-precos.ts); a prova vive em
> [`lib/pips-proof.ts`](../lib/pips-proof.ts), medida. Ver §9 — *Onde vivem os números*.
>
> Regra de ouro: **conteúdo educativo, NÃO é aconselhamento financeiro**; nunca prometer ganhos.

---

## 0. Como ler este documento (e porque é que não tem números)

Este ficheiro já foi a autoridade dos preços, escritos à mão numa tabela. A 2026-08-20 a tabela
passou a dizer que o pack de topo tinha sido **retirado da oferta** («não o oferecer nem o
mencionar»). A 2026-09-24 o dono repô-lo, e a reposição fez-se no código — em `lib/escada-precos.ts`
— que é de onde os quatro closers de IA lêem. Durante esse intervalo o código dizia *vende o topo* e
este documento dizia *não o menciones*: a próxima pessoa a escrever copy leria o documento.

Um documento e um módulo com o mesmo número em sítios diferentes divergem sempre; a única questão é
quando. Por isso a correcção não foi actualizar a tabela — foi **tirar-lhe os números**. O que aqui
fica é o que não é um número: a ordem da escada, o que cada degrau desbloqueia, o tom, as objecções,
e as regras que não se podem quebrar. Quem precisa de um valor vai buscá-lo à fonte.

Seis ficheiros de runtime citam este documento como autoridade
(`lib/telegram-lead-funnel.ts`, `lib/email-templates.ts`, `lib/escada-precos.ts`,
`app/api//closer/route.ts`, `app/api/telegram/webhook/route.ts`,
`app/api/cron/telegram-leads-content/route.ts`). É por isso que ele tem de estar certo — e é por
isso que não pode ser ele a guardar valores.

`lib/__tests__/escada-precos.check.ts` falha se voltar a aparecer aqui um preço escrito à mão, ou se
voltar a aparecer a instrução de não mencionar o degrau de topo.

---

## 1. Posicionamento (o pitch em 1 linha)
**MoreThanMoney** é o ecossistema português de **educação financeira + ferramentas de trading +
comunidade** — aprende, aplica e acompanha tudo pela **app** (iOS/Android). "Earn While You Learn /
Aprender de Verdade."

Persona ideal: PT/BR, quer aprender a investir/trading a sério, sem enganos, com comunidade e
acompanhamento. Dores típicas: já perdeu dinheiro sozinho, não sabe por onde começar, falta de
tempo, falta de método.

---

## 2. Prova — medida, nunca decorada

A prova que sai para um lead é **sempre lida no momento**, de `lib/pips-proof.ts`:

- `provaParaLead(p)` — a linha pronta para um closer. Devolve pips e período; **cala a taxa de
  acerto quando a amostra é curta** e acrescenta a ressalva legal. É isto que
  `lib/telegram-lead-funnel.ts` já usa.
- `linhaPips(p)`, `blocoPips(p)`, `factosParaCartao(p)`, `factoDoDia(p)` — as mesmas contas noutros
  formatos (flyers, cartões sociais, conteúdo).
- `notaViesPreco(p)` — a ressalva do defeito de preço de 24/09 (`FRONTEIRA_VIES_PRECO`). Quando a
  amostra atravessa essa fronteira, a nota **tem de ir junto com o número**. Nunca publicar o
  número sem ela.
- `publicavel(p)` — se devolver falso, **não há prova para publicar**. Nesse caso não se inventa um
  número nem se vai buscar um antigo: fala-se de método, de comunidade e de processo.

**Regras que não se quebram:**
- Prova em **pips e percentagem**, nunca em euros (decisão de 2026-08-26). O resultado em dinheiro
  só aparece como exemplo por lote, calculado, e sempre com a ressalva.
- Nenhum número de prova pode estar escrito num prompt, num email ou aqui. O trio «trades / win
  rate / resultado em euros» que esta secção já teve estava **congelado a 30/06** e as contas que o
  suportavam foram removidas a 15/07 — continuou a ser dito meses depois de deixar de ser verdade.
  Foi exactamente esse o defeito que a prova medida veio fechar.

**O que é seguro dizer sem ler a base:** o formato da prova (posições reais, com parciais, de uma
conta-espelho), o facto de ser auditável, e os testemunhos verbatim abaixo.

**Prints reais (public/email/):** `app-feed-performance.png` (feed com resumo das contas),
`app-trading-alerts.png` (alertas com gráfico inline), `app-scanner.png` (scanner MTM),
`app-sensei-chart.png` (sala Sensei). Os prints mostram o produto; os números que neles aparecem
são de quando foram tirados e **não se citam como prova actual**.

**Testemunhos reais (chat da comunidade, verbatim):**
- "Grato por estar na melhor comunidade, ecossistema de educação financeira do país."
- "Máquinas!!!! Vocês dão um up tão grande e uma força para que isto aconteça!! Obrigado 🙏"
- "Boas Maltinha. Fechei os Futuros que tinha em compra. Guardei lucros."
- "O melhor Resultado que podemos ter não é o Saldo das contas... mas sim o poder que ganhamos ao
  saber proteger capital."
- "Bora let's go, grato pela confiança."

---

## 3. A escada — o que cada degrau desbloqueia

Os preços estão em [`lib/escada-precos.ts`](../lib/escada-precos.ts) e saem prontos por
`escadaNumaLinha()` (prompts de IA) e `escadaEmLinhas()` (mensagens do bot). **Não os copiar para
aqui, nem para um prompt, nem para um email.**

| Degrau | Constante do preço | O que dá |
|---|---|---|
| **Membro** | `PRECO_MEMBRO` | A porta de entrada paga: app, salas base, comunidade, sinais base e formação. **SEM as funcionalidades do site** — é essa a diferença para o Premium. |
| **Premium** | `PRECO_PREMIUM` (1.º mês: `PRECO_PREMIUM_1O_MES`) | Tudo o do Membro **+ as funcionalidades do SITE** (Terminal MTM, MTM Alerts, Portefólios, Listas de Visualização das aulas, Planos de trading e rotas web-only que não existem na app) **+ Skool grátis** + Scanner, Trading Alerts, Tap to Trade, aulas e salas Premium. |
| **`NOME_DEGRAU_TOPO`** (hoje: **Elite**) | `PRECO_TOPO` (anual) | **O topo da escada, e está à venda.** Um ano inteiro de Premium com estatuto VIP (`member_category='vip'`), mais os perks Elite. Plano `elite_annual` no Stripe; compra-se em `TOPO_LINK_PAGAMENTO`. |
| **Rota PU Prime** | `MIN_DEPOSIT` (USD) | Cliente directo na PU Prime, conta aberta pelo nosso link, com o depósito mínimo: dá Premium + grupos grátis enquanto estiver financiado. **Vem sempre no fim** (§5). |
| **App MTM** | — grátis | Descarregar e entrar. Feed, comunidade, conteúdo base. **Nunca é a abertura** (§5). |
| **Comunidade Skool** | pagamento único (ver §9) | Entrada na Skool. Grátis para Premium. |

**Nome do degrau de topo.** Chama-se **Elite** — é assim que o produto se chama no Stripe. «Fundador»
está tomado pelos cupões e pelo cohort de acesso grátis concedido; «estatuto Fundador vitalício» é um
*perk dentro do Elite*, não o nome do pacote. Dois produtos com o mesmo nome e direitos diferentes é
vender uma coisa e entregar outra. Usar sempre `NOME_DEGRAU_TOPO`.

**Bónus PU Prime** (`BONUS_PUPRIME_TITULO`, `bonusNumaLinha()`, `bonusEmLinhas()`):
`BONUS_DEPOSITO_PCT`% sobre o depósito. Três regras, e só estas três:
1. **ACUMULA** — não substitui nem anula nada do que já existe. Quem tem direito às duas coisas fica
   com as duas.
2. Tem **dois caminhos, e só dois**: ser `NOME_DEGRAU_TOPO`, **ou** ser cliente directo na PU Prime
   (conta aberta pelo nosso link) com depósito mínimo de `MIN_DEPOSIT` $.
3. Fora destes dois casos **não há bónus**.

Não escrever «só para quem é Elite» (esconde metade de quem tem direito) nem «para toda a gente»
(promete a quem não tem). O bónus sai numa linha só sua, depois dos degraus: colado ao topo lê-se
como perk exclusivo dele, colado à rota da corretora lê-se como se bastasse depositar.

**Planos anuais** de Membro e Premium existem (`app_member_annual`, `premium_annual` no Stripe). Os
valores não estão em `escada-precos.ts` e por isso **não se anunciam** — quem precisar de os
anunciar acrescenta-os lá primeiro, não aqui.

*Notas:* IQONIC descontinuado — nenhuma comunicação o menciona. MTM Copy descontinuado como add-on
(`PLANOS_DESCONTINUADOS` em `lib/stripe-prices.ts`): quem já pagava mantém acesso, novos checkouts
são recusados e encaminhados para o MTM Auto.

- iOS: subscrição por **Apple IAP** (dentro da app). Web/Android: **Stripe** (`/upgrade`).
- Já pagou por Stripe? Faz login na app **sem pagar de novo** (entitlement unificado, sem dupla
  cobrança).

---

## 4. LINKS (usar consoante a plataforma do lead)
- **Descarregar app iOS:** https://apps.apple.com/pt/app/id6778558643
- **Descarregar app Android:** https://www.morethanmoney.pt/downloads/MoreThanMoney.apk
- **Site:** https://www.morethanmoney.pt
- **Planos / upgrade (Stripe, web/Android):** https://www.morethanmoney.pt/upgrade — é também onde
  se compra o degrau de topo (`TOPO_LINK_PAGAMENTO`).
- **Abrir conta corretora (PU Prime):** `PUPRIME_LINK` em `lib/telegram-broker-gate.ts` — o link
  roda por IB (ver `/abrir-conta`), por isso lê-se de lá em vez de se colar aqui.
- ⚠️ **No iOS/app nativa NUNCA enviar link de checkout Stripe** — a compra é por Apple IAP (regra
  Apple 3.1.1). No iOS remeter para "descarrega a app → subscreve dentro da app".

> Os *payment links* directos do Stripe (Fundador 50%, Membro) mudam com as campanhas e são
> geridos em `/admin` — não se fixam aqui. Um link de pagamento colado num documento sobrevive à
> campanha que o criou.

---

## 5. Funil — e a regra de não liderar com o grátis

**Não se lidera com o grátis.** A app grátis e a rota da corretora entram **depois** dos degraus
pagos, nunca a abrir. Quem entra por «é grátis» fica ancorado em zero e a subida passa a ser uma
discussão de preço. `escadaNumaLinha()` já sai por esta ordem, e
`lib/__tests__/escada-precos.check.ts` falha se alguém a trocar.

1. **Topo:** conteúdo IG/DM → keyword (ex.: "APP", "PREMIUM", "SISTEMA") → DM automática.
2. **Qualificar primeiro:** experiência, dor principal, disponibilidade → tag
   `MTM_lead_qualificado`. Uma pergunta de cada vez.
3. **Apresentar a escada paga:** Membro → Premium → `NOME_DEGRAU_TOPO`, por esta ordem, com o bónus
   PU Prime numa linha à parte.
4. **Fechar** no degrau que couber ao lead.
5. **Só então** as rotas sem mensalidade: app grátis para experimentar, e a rota PU Prime para quem
   prefere financiar conta a pagar mensalidade.
6. **Reter/mudar pack:** member-area → "Subscrição" (portal Stripe / App Store).

---

## 6. Objeções → respostas (fechar)

Os preços entram nestas respostas **por variável**, lidos de `escada-precos.ts`. Estão aqui como
`{}` de propósito: uma resposta com o preço escrito é uma resposta que envelhece sem avisar.

- **"É caro."** → "O Premium é {`PRECO_PREMIUM`}, mas o **1.º mês fica {`PRECO_PREMIUM_1O_MES`}**.
  Um único trade bem gerido paga meses. E tens comunidade + scanner + alertas + aulas incluídos."
  Se o lead quer compromisso e desconto por volume, é aqui que entra o {`NOME_DEGRAU_TOPO`}
  ({`PRECO_TOPO`}) — não é um pacote escondido.
- **"Não tenho tempo."** → "A app foi feita para isso: alertas prontos, salas gravadas para reveres,
  e o MTM Auto executa por ti."
- **"Já perdi dinheiro."** → "Foi por falta de método e gestão de risco. Aqui aprendes a **proteger
  capital** primeiro." Juntar a prova **medida** (`provaParaLead()`) — e só se `publicavel()`.
- **"Funciona mesmo?"** → prints do produto + testemunhos + prova medida com a ressalva. "Não
  prometemos lucro — mostramos processo real."
- **"Depois logo vejo."** → urgência só se for verdadeira: a oferta de 1.º mês e as campanhas em
  vigor. Não inventar prazos.
- **"E o bónus da corretora?"** → as três regras do §3, inteiras. Acumula, dois caminhos, mais nada.

---

## 7. Tom / regras do agente
- Português de Portugal, 3.ª pessoa, direto, confiante, sem jargão, como amigo que já chegou lá.
- Uma pergunta de cada vez. Nunca dumping de links.
- SEMPRE terminar com um CTA claro.
- Nunca prometer ganhos; enquadrar como educação. Ressalva sempre que falar de resultados.
- Detetar plataforma: se iOS → app + IAP; se Android/web → app + `/upgrade` (Stripe).
- **Nunca escrever um número de cabeça.** Preço → `escada-precos.ts`. Prova → `pips-proof.ts`. Se
  não houver fonte, não há número.

---

## 8. Prompt pronto para IA

O prompt de sistema dos closers **não se escreve à mão** — está montado em código, com os números
interpolados da fonte:

| Superfície | Ficheiro |
|---|---|
| DM do Instagram | `lib/instagram/dm-closer.ts` |
|  | `app/api//closer/route.ts` |
| Funil do Telegram | `lib/telegram-lead-funnel.ts` |
| Desenhador de funis (/admin/social) | `app/api/admin/social/funil-ia/route.ts` |

Os quatro importam `escadaNumaLinha()` e `bonusNumaLinha()`. Um prompt novo faz o mesmo. Colar um
prompt com preços dentro é reabrir a divergência que este documento existe para fechar.

Esqueleto (sem números, os números entram pelas funções):

```
És o closer de vendas da MoreThanMoney. Objetivo: qualificar e levar o prospeto ao degrau da escada
que lhe serve. Português de Portugal, 3ª pessoa, tom direto e confiante, uma pergunta de cada vez.
Qualifica primeiro: experiência, dor principal, disponibilidade.
- Escada: ${escadaNumaLinha()}
- ${bonusNumaLinha()}
Não lideres com o grátis: a app grátis e a rota da corretora vêm depois dos degraus pagos.
Prova: usa só a linha medida que te for dada; se não te for dada nenhuma, fala de método, não de
números. Trata objeções (§6). Fecha SEMPRE com CTA: iOS → "descarrega a app e subscreve lá dentro"
(App Store id6778558643); Android/web → app + /upgrade.
Nunca prometas lucros; é educação, não aconselhamento financeiro.
```

---

## 9. Onde vivem os números

| Número | Fonte |
|---|---|
| Membro, Premium, 1.º mês, degrau de topo, % do bónus | `lib/escada-precos.ts` |
| Depósito mínimo da corretora | `MIN_DEPOSIT` em `lib/telegram-broker-gate.ts` (reexportado pela escada) |
| Valores cobrados (a sério) | Stripe, por `STRIPE_PRICE_*` — mapa em `lib/stripe-prices.ts` |
| Prova (pips, %, período, ressalva do viés) | `lib/pips-proof.ts`, medido |
| Textos do funil editáveis | `lib/mensagens-funil.ts` + `/admin/social` (com variáveis, nunca valores) |

**Dívida conhecida:** o pagamento único da Skool ainda está escrito à mão em
`lib/i18n/messages/upgrade.ts` (`upgrade.premiumFeat6`). Não subiu para `escada-precos.ts` porque
esse módulo é server-only (arrasta `supabase-admin-client` via `telegram-broker-gate`) e as
mensagens i18n vão para o bundle do cliente. Quem o for corrigir tem primeiro de partir a escada em
duas — a parte dos valores, pura, e a parte que lê a base.
