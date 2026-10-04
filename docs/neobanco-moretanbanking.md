# Neobanco «MoreThanBanking» — o que a Whop é, o que a MTM já tem, e o desenho que não fere o Stripe

> Estado: investigação + desenho (2026-10-04). Não há código alterado por este documento.
> Pergunta do dono, textual: **«com a aplicação do neo banking, como posso no sistema da
> MoreThanMoney, sem prejudicar as receitas Stripe e vendas de cashout Stripe?»**
> Contexto: o dono criou `https://morethanbanking.whop.site/account/biz_cwC4frUlNMcRlP` na Whop e
> quer o conceito «MTM Payouts»: o membro fecha um trade ou ganha uma comissão e, minutos depois,
> paga um café com esse dinheiro num cartão.
>
> Regra deste documento: nada é afirmado sem fonte. O que não se conseguiu confirmar está escrito
> como **não confirmado**. Os números de custo são os que as fontes publicam; o resto é «a pedir
> cotação».

---

## 1. O que a Whop É — e o que não é

Resumo em uma frase: **a Whop é um marketplace de produtos digitais com pagamentos próprios e,
desde 2026, uma camada de «finanças» (saldo, cartão Visa, stablecoins) — mas essa camada é da Whop,
construída sobre parceiros licenciados, e os cartões estão hoje limitados aos EUA.** Não é um
banco, não é nossa, e não é embebível no nosso site como se fosse um módulo.

| Capacidade | O que a documentação diz | Fonte | Estado |
|---|---|---|---|
| Aceitar pagamentos (cartão, métodos locais) | «Accept payments globally with local payment methods»; cartão 2,7 % + 0,30 $ (doméstico), +1,5 % internacional, +1 % conversão de moeda | docs.whop.com (início); docs.whop.com/fees | Confirmado |
| Payout a quem VENDE na Whop (o criador) | «payouts to your bank account, mobile wallet, or crypto wallet in over 200 countries»; ACH next-day 2,50 $, RTP 4 % + 1 $, cripto 5 % + 1 $, Venmo 5 % + 1 $, wire 23 $, «International local banks: varies by country»; «Standard payouts take up to 5 business days» | docs.whop.com/fees; docs.whop.com/manage-your-business/manage-payouts/payout-methods | Confirmado. **SEPA/EUR não aparece listado** — a tarifa europeia é «varia por país», sem número publicado |
| Payout a UTILIZADORES de uma plataforma (os nossos membros) via «connected accounts» | «Pay out users worldwide»; connected accounts para «affiliates and partners» e «team members or contractors»; «Each connected account may need to complete identity verification before receiving payouts»; o SDK tem `BalanceElement` (saldo disponível) e `ActivityElement` («Lists the account's ledger movements, payouts included») | docs.whop.com/developer/platforms/quickstart; docs.whop.com/manage-your-business/manage-payouts/connected-accounts | Confirmado que existe. **Países, moedas (EUR?), KYC detalhado e taxas para connected accounts: não confirmados** — a documentação pública não os lista |
| Cartões Visa, Apple/Google Wallet | «Whop Cards» físico e virtual, Visa, «Add your Whop Card to Apple Wallet or Google Wallet»; gasta o saldo Whop incluindo o pendente; emissor Third National sob regras do programa da Rain; «Platforms can issue cards for their users via API» | docs.whop.com/whop-finance/cards; lex.substack.com (análise); businesswire 2026-05-27 | Confirmado que existe. **Regiões: consumidores em 31 estados dos EUA, empresas em 41 estados dos EUA. Portugal e UE NÃO estão listados como suportados** (docs.whop.com/whop-finance/supported-regions). Há uns «Intl Card Consumer Terms» (whop.com/intl-card-consumer-terms) para não-cidadãos dos EUA, com colateral em activos digitais numa blockchain — é um cartão colateralizado por stablecoin, não uma conta em euros; lista de países elegíveis **não confirmada** |
| Saldos/contas para MEMBROS (não só para o criador) | Só via connected accounts (ver acima). Os saldos vivem em «pooled FBO accounts»; «Neither balance is FDIC insured»; fundos internacionais em ClearBank, JP Morgan ou Bank Frick | lex.substack.com/p/analysis-whop-theres-your-neobank (análise independente dos termos da Whop) | Parcialmente confirmado (fonte secundária). **Não há IBAN próprio por membro confirmado** |
| IBAN em nome do membro | Nenhuma referência na documentação lida | — | **Não confirmado** (muito provavelmente não existe) |
| Conversão cripto → euro | A Whop converte dólares em USDT (Tether) numa wallet self-custodial Privy; payout em cripto custa 5 % + 1 $. Conversão para EURO não aparece | lex.substack.com; docs.whop.com/fees | **Não confirmado** para EUR |
| API de ledger | `BalanceElement` / `ActivityElement` no SDK de plataformas; «Manual Payouts» com gestão de KYC | docs.whop.com/developer/platforms/quickstart | Confirmado como componentes de UI/SDK; API de ledger programática completa **não confirmada** |
| Licença própria | «licensed partners move the money» — Whop não é banco; depende de Cross River, Rain, ClearBank/JP Morgan, Privy, Tether | lex.substack.com (citando termos da Whop) | Confirmado por fonte secundária |

**O que está por trás do `morethanbanking.whop.site`:** a página é a montra genérica do produto
«neobank» da Whop («Send money. Get paid.» / «Your new home for finance» / «Join now»). Não lista
produtos, preços nem funcionalidades. É um nome de montra sobre a conta Whop do dono — não é um
banco em marca branca da MTM.

**Conclusão da secção:** a Whop resolve o problema da Whop (pagar criadores e deixá-los gastar nos
EUA). O problema do dono — um membro português com uma comissão da MTM a pagar um café em Lisboa com
cartão — **não é resolvido pela Whop hoje**: sem cartão na UE, sem IBAN, sem EUR confirmado, e com a
cobrança a passar pela Whop (2,7 % + 0,30 $ e perda da atribuição `?ag=`, ver §4.4).

---

## 2. O que existe hoje na MTM (lido do código a 2026-10-04, commit `68d893fa`)

### 2.1 Dinheiro que ENTRA (cobrança)

| Fluxo | Onde | Notas |
|---|---|---|
| Checkout de packs (Membro 35 €/mês, Premium 65 €/mês com 1.º mês 34,99 €, Elite 597 €/ano) | `lib/escada-precos.ts:28-33` (fonte única dos preços); `app/api/stripe/create-checkout-session/route.ts:53,127` | Stripe Checkout, `mode: subscription` ou `payment` (vitalício) |
| Registo + pagamento no mesmo checkout | `app/api/stripe/register-checkout/route.ts`, `app/api/stripe/oauth-register-checkout/route.ts` | Ambos passam `agente_codigo` no metadata |
| Scanner, marketplace, MTM Funded (desafios/torneios) | `app/api/stripe/scanner-checkout/route.ts`; `app/api/marketplace/checkout/route.ts`; `app/api/mtmfunded/checkout/route.ts` | Tudo Stripe |
| Apple IAP (app iOS) | `app/api/apple/iap/validate/route.ts:228-230`; `app/api/apple/iap/webhook/route.ts:179` | Também escreve no livro |
| **O livro de vendas** (`vendas_vendas`) | `lib/vendas/livro.ts` — `registarVendaConfirmada`; fonte `check (fonte in ('stripe','apple','manual'))` em `supabase/migrations/128_vendas_equipa_pipeline_comissoes.sql:200` | Doutrina escrita no ficheiro: «uma comissão só nasce de um pagamento confirmado» e «nada aqui paga» |
| **Atribuição por agente** (construída esta semana) | cookie `mtm_ag` ← `?ag=` (`lib/agentes/atribuicao.ts:41,72`, janela 30 dias `:37`); lido no checkout `app/api/stripe/create-checkout-session/route.ts:91-110`; gravado pelo webhook `app/api/stripe/webhook/route.ts:215,299,529` → coluna `vendas_vendas.agente_codigo` (`supabase/migrations/170_livro_de_vendas_agente_codigo.sql`) | **Vive no metadata da sessão de checkout do Stripe.** Cinco portas alimentam a coluna e uma guarda (`lib/agentes/portas-receita.check.ts`) falha se uma deixar de o fazer. Qualquer venda que saia do Stripe sai da medição |
| Renovações | `app/api/stripe/webhook/route.ts:129-146` (`invoice.payment_succeeded`, `billing_reason === 'subscription_cycle'`, `amount_paid > 0`) → `renovarLicencaDaSubscricao`, MLM residual (`:878-897`), livro (`:906-921`) | **Só escuta `invoice.payment_succeeded`; não escuta `invoice.paid`.** Importa para §4.3 |
| Devoluções / disputas | `app/api/stripe/webhook/route.ts:161-172` → `estornarVenda` (`lib/vendas/livro.ts`) | Janela de estorno total 30 dias (`livro.ts:39`) |

### 2.2 Dinheiro que SAI (pagamentos a membros)

| Fluxo | Como se paga hoje | Onde |
|---|---|---|
| **Comissões MLM binário** (`mlm_commissions`: `direct_referral` 20 % por omissão, `monthly_residual`, `rank_bonus`, `rank_residual`) | **Stripe Connect Express** — `stripe.transfers.create` para `profiles.stripe_connect_account_id` quando `stripe_connect_status === 'complete'`; senão marca `payout_status: 'manual'` | `lib/mlm-commission-payout.ts:42-91`; `lib/mlm-checkout-commission.ts:53`; conta Connect criada em `app/api/affiliate/stripe-connect/route.ts:113-137` (`type: 'express'`, `country: 'PT'`, `business_type: 'individual'`, capability `transfers`); widget no `/app-mobile` em `components/mobile/mlm-dashboard-tab.tsx:58-151` |
| **Comissões da equipa de vendas** (`vendas_comissoes`: afiliado/setter/closer/prospector/team_leader) | **Acto humano no admin**: `aprovar` → `pagar` com `pagamento_ref` obrigatória («transferência, MB Way, nota de crédito»); nenhuma transferência automática | `app/api/admin/vendas/comissoes/route.ts:116-150`; tabela em `supabase/migrations/128_...sql:235-260` |
| **Payouts do MTM Funded** (75/25, almofada 3 %) | O trader pede; o dono paga **como depósito na conta PU Prime do trader, em USDC na rede Solana**, com UID + comprovativo; aprovação/pagamento no admin ou bot | `app/api/mtmfunded/levantamentos/route.ts:12-26,98-200`; fórmula em `lib/mtmfunded/contrato.ts:110-142` (`QUOTA_TRADER = 0.75`, `almofadaUsd`, `levantavelUsd`); estados em `lib/mtmfunded/admin-conta-accoes.ts:285-335` (`aprovado`/`pago`, renova a conta ao pagar); tabela `mtm_funded_withdrawals` (índice em `supabase/migrations/079_mtmfunded_admin_conta.sql:116`) |
| **Partilha com educadores do marketplace** (50–80 %, padrão 80 %) | Regista-se em `marketplace_payouts` («Não paga nada: regista»); campo `transferencia_stripe` para o id da transferência quando se paga | `lib/marketplace/regras.ts:118-122`; `supabase/migrations/151_marketplace_educadores.sql:159-175`; `marketplace_educadores.stripe_connect_account_id` (`:60`) |

**Leitura do estado actual:** a MTM já tem **quatro livros de dívida a membros** (`mlm_commissions`,
`vendas_comissoes`, `mtm_funded_withdrawals`, `marketplace_payouts`), cada um com o seu ciclo
pendente → aprovado → pago, **e dois carris de saída**: Stripe Connect (automático, só MLM) e
pagamento manual fora do sistema (transferência/MB Way/USDC). Não há hoje um sítio único onde o
membro veja «quanto é que a MTM me deve».

### 2.3 O que o Stripe Connect custa hoje à MTM

Preçário Stripe Connect para Portugal: «0.25% + €0.10 per payout sent», «€2 per monthly active
account», Instant Payouts «1% of payout volume» (stripe.com/en-pt/connect/pricing).

---

## 3. A fronteira legal, sem rodeios

A MTM é um **ENI (empresário em nome individual)** em Portugal. O regime aplicável é o
**Decreto-Lei n.º 91/2018, de 12 de novembro (RJSPME)**, que transpõe a PSD2.

O que a lei diz (pgdlisboa.pt, DL 91/2018):

- **Art. 4.º** — são «serviços de pagamento», entre outros: execução de operações de pagamento,
  **emissão de instrumentos de pagamento** (cartões), transferências de fundos, depósitos/levantamentos
  em contas de pagamento.
- **Art. 11.º** — só podem prestar esses serviços instituições de crédito, instituições de pagamento,
  instituições de moeda electrónica (e equivalentes da UE), etc.
- **Art. 18.º, n.º 2, al. a)** — uma instituição de pagamento/moeda electrónica tem de «adotar a forma
  de sociedade anónima ou por quotas». **Um ENI não pode ser autorizado como IP/IME.**
- **Arts. 49.º e 55.º** — capital mínimo de 20 000 € a 350 000 € consoante os serviços (Banco de
  Portugal: a autorização é «caso a caso»; o regime de isenção exige 50 000 € de capital, Portaria
  239/2019). Nenhum destes caminhos é compatível com um ENI sem constituir sociedade.
- **Art. 31.º e 34.º** — um **agente** é «pessoa singular ou colectiva que presta serviços de pagamento
  em nome de uma instituição de pagamento ou de moeda electrónica», com **registo no Banco de
  Portugal** feito pela instituição (nome, morada, mecanismos de controlo interno AML, idoneidade dos
  responsáveis). Este é o único caminho em que um ENI aparece legalmente a «distribuir» um produto de
  pagamento — e é a instituição licenciada que o registra e responde por ele.

Tradução para a MTM:

| Acto | Quem pode | O que exige |
|---|---|---|
| **Registar num ledger interno o que a MTM deve a cada membro** (comissões, payouts Funded, prémios) e mostrá-lo na app | **A MTM sozinha.** É contabilidade de dívida comercial, não serviço de pagamento. Já o faz hoje em quatro tabelas | Nada de novo legalmente. Facturação/recibo a cada pagamento como hoje |
| **Pagar essa dívida** por Stripe Connect, transferência, MB Way, USDC para a corretora | **A MTM sozinha**, como hoje. Quem move o dinheiro é o Stripe/o banco | Nada de novo |
| **Guardar dinheiro de membros** (saldo que o membro carregou e pode pedir de volta), **emitir um cartão**, **dar IBAN**, **converter cripto↔euro** | **Só uma IP/IME/banco** ou a MTM como **agente registado** de uma | Parceiro licenciado em marca branca, KYC/AML do membro feito pelo parceiro, contrato, registo da MTM como agente no Banco de Portugal (ou constituição de sociedade e licença própria — fora de escala) |
| **Lucros de trading dos clientes** | Vivem na **corretora (PU Prime)**, nunca na MTM. A MTM não os toca | Permanece assim. «Fechou um trade → pagou um café» só é possível se o CARTÃO estiver ligado à corretora ou se o cliente levantar da corretora para a conta/cartão do parceiro — não há atalho pela MTM |
| **Payouts do MTM Funded** | São **dinheiro da MTM** (patrocínio de desempenho, ver `docs/mtm-funded-fase1-spec.md` §1) | Podem entrar no ledger como crédito ao membro. Hoje paga-se em USDC para a PU Prime |

### 3.1 Parceiros europeus de marca branca que existem e operam na UE

Verificados a 2026-10-04 (sites próprios + imprensa especializada). Nenhum publica o que exige a um
ENI português em concreto — isso só com pedido comercial.

| Parceiro | O que é | O que oferece | O que publica sobre custo/exigências |
|---|---|---|---|
| **Swan** (França) | Instituição de moeda electrónica autorizada pela **ACPR** (REGAFI 86245) | Contas com IBAN (FR, DE, ES, NL, IT — **PT não listado**), cartões, SEPA instantâneo, integração via API/marca branca | «Sandbox: Free»; «Swan on Demand: Starting from 2990€/m»; Enterprise sob consulta; «Dedicated Implementation Manager» no Enterprise; fundos protegidos até 100 000 € pelo FGDR (swan.io/pricing) |
| **Treezor** (França, grupo Société Générale) | IME autorizada pela **ACPR**, «licenses are passported across Europe» (25 países segundo o próprio site) | IBAN locais e virtuais, programas de cartão (físico, virtual, uso único), X-Pay (Apple/Google Pay), acquiring. Clientes: Qonto, Shine, Swile, Lydia | **Sem preços publicados**; «Contact our experts» (treezor.com) |
| **Weavr** (Reino Unido, licença UE em Malta) | IME autorizada pela **MFSA** (Malta) desde 2024; na UE as contas e cartões Mastercard são emitidos pela **Paynetics AD** (IME, Banco Nacional da Bulgária) | Contas com IBAN em EUR/GBP para consumidores e empresas, cartões Mastercard; «does not require your business to get its own licence» | Preço de entrada reportado por terceiros «from £1,947.00/month» (appadvisoryplus.com) — **não confirmado no site da Weavr** |
| **Solaris** (Alemanha) — referência, não recomendação | Instituição de crédito com licença plena BaFin/BCE; maioria adquirida pela SBI em 2025 | Cartões, IBAN, crédito | Virado a grandes parceiros (ADAC, Boerse Stuttgart); **sem preços publicados**; dimensão desadequada para a MTM |
| **Stripe Issuing** (já é o nosso fornecedor) | Emissão de cartões Visa/Mastercard; **local issuing disponível em PT** (lista de 22 países em docs.stripe.com/issuing/global) | Cartões virtuais/físicos, Apple/Google Pay, funcionamento com Connect (`card_issuing` capability em contas Custom), spending controls | **Restrição decisiva:** «Stripe Issuing currently only supports commercial use cases in the US, the UK and countries in the EU»; «Cardholders can only use the Card Program for commercial purposes … not for personal, family, or household purposes»; cartões só para «European incorporated companies or sole traders»; marketing não pode sugerir «Personal Account» (stripe.com/gb/legal/issuing/commercial-card; stripe.com/legal/restricted-businesses). **O café do membro é uso de consumo — proibido no Stripe Issuing europeu.** Preços não publicados para PT (página 404; «contact sales») |

**Nota sobre a Whop como «parceiro»:** a Whop não é uma IME europeia e os cartões dela não estão
disponíveis na UE (§1). Não serve de parceiro de cartões para membros portugueses hoje.

---

## 4. O desenho que não fere o Stripe

### 4.1 O princípio

**O Stripe continua a ser o carril de COBRANÇA. O «banco» (ledger + parceiro) é o carril de
PAGAMENTO e de GASTO.** Entre os dois, um livro só: a **carteira MTM**.

```
  COBRANÇA (não muda)                 LEDGER (novo, nosso)                 PAGAMENTO/GASTO
  ───────────────────                 ─────────────────────                ─────────────────
  Stripe Checkout ──webhook──▶ vendas_vendas (+agente_codigo)
                                │
                                ├─▶ vendas_comissoes  ─┐
                                ├─▶ mlm_commissions   ─┤   crédito      ┌─▶ Stripe Connect (hoje)
  MTM Funded (dinheiro MTM) ────┼─▶ mtm_funded_withdr.─┼─▶ carteira_mtm ─┼─▶ IBAN / MB Way (hoje, manual)
  Marketplace ──────────────────┴─▶ marketplace_payouts┘   movimentos    ├─▶ USDC → PU Prime (hoje)
                                                            saldo         ├─▶ pagar a mensalidade (Fase 0, §4.3)
                                                                          └─▶ cartão do parceiro (Fase 1)
```

A carteira **não guarda dinheiro**: regista dívida da MTM ao membro e o destino que ele escolheu.
Enquanto o dinheiro sai pelos carris de hoje, nada muda legalmente. Quando um dia passar a sair para
um cartão, é o parceiro licenciado que custodia e emite.

### 4.2 O ledger `carteira_mtm` (esboço, para a Fase 0)

Uma tabela de movimentos imutáveis e uma vista de saldo. Nenhuma linha se apaga; corrige-se com
linha contrária — a mesma disciplina que o Stripe usa no customer balance («You can only undo a
transaction by creating a corresponding, reversing transaction», docs.stripe.com/billing/customer/balance)
e que `vendas_comissoes_historico` já segue.

```
carteira_movimentos
  id, user_id, moeda ('EUR' | 'USD'),
  tipo       : 'credito' | 'debito'
  origem     : 'vendas_comissao' | 'mlm_comissao' | 'funded_payout' | 'marketplace_payout'
             | 'premio' | 'estorno' | 'ajuste_admin'
  destino    : null | 'stripe_connect' | 'iban' | 'mbway' | 'usdc_corretora'
             | 'saldo_stripe' (pagar mensalidade) | 'cartao_parceiro' (Fase 1)
  estado     : 'por_atribuir' | 'disponivel' | 'reservado' | 'pago' | 'estornado'
  valor_cents, referencia_origem (id da linha de origem — idempotência), referencia_pagamento,
  criado_em, criado_por, nota
```

- **por_atribuir** = a comissão existe mas ainda não foi aprovada (espelha `pendente`).
- **disponível** = aprovada; o membro pode escolher destino.
- **reservado** = pedido de levantamento em curso.
- **pago** = saiu, com `referencia_pagamento` (transfer Stripe, comprovativo, hash USDC).
- As quatro tabelas de origem **continuam a mandar** — a carteira é uma projecção delas, escrita no
  mesmo instante por quem já escreve lá (o livro, o MLM, o admin do Funded, o marketplace). Não se
  migra nada; ligam-se as portas.

Moedas: as comissões são EUR; os payouts Funded são USD (`valor_usd`). A carteira mostra os dois sem
converter — converter é serviço de pagamento (§3). «Saldo em EUR» e «saldo em USD», lado a lado.

### 4.3 Como isto AUMENTA a receita Stripe em vez de a canibalizar

**1. Retenção: pagar a mensalidade com saldo da carteira — sem sair do Stripe.**

O Stripe tem o mecanismo exacto: o **customer invoice balance**. «Every customer in Stripe Billing has
an invoice balance that you can issue credit and debit adjustments against … The invoice balance
automatically applies to the next invoice finalized for the customer»; «Negative values are treated as
a credit» (docs.stripe.com/billing/customer/balance). Criar um crédito é uma chamada:
`POST /v1/customers/{id}/balance_transactions` com `amount` negativo.

Fluxo: o membro tem 35 € disponíveis na carteira e escolhe «usar na próxima mensalidade» →
movimento `debito`/destino `saldo_stripe`/estado `reservado` → a MTM cria o crédito de −3500 no
customer balance do Stripe → na renovação o Stripe aplica o crédito e a factura fica paga sem cobrar o
cartão → webhook → carteira passa a `pago` com `referencia_pagamento = invoice.id`.

O que isto faz à receita: a mensalidade **continua a ser uma factura Stripe, com o preço cheio, no
cliente Stripe de sempre, na subscrição de sempre**. A MTM pagou a comissão que devia (dinheiro que ia
sair de qualquer forma) e recebeu-a de volta como mensalidade. Um membro que paga com saldo é um
membro que **não cancela** nesse mês.

**Três coisas a corrigir no código para isto funcionar — e são exactamente o que o Stripe documenta:**

- «You receive the `invoice.payment_succeeded` event only when an invoice-related PaymentIntent is
  created and completes successfully … An invoice can transition to `paid` without an associated
  PaymentIntent succeeding if … It has an `amount_due` covered by a customer's credit balance … In
  these cases, you receive the `invoice.paid` event, but no `invoice.payment_succeeded` event»
  (docs.stripe.com/invoicing/overview). **O nosso webhook só escuta `invoice.payment_succeeded`**
  (`app/api/stripe/webhook/route.ts:129`). Uma renovação paga a 100 % com saldo **não renovaria a
  licença nem entraria no livro**. Tem de se escutar também `invoice.paid` (com deduplicação pela
  `invoice.id`, que o livro já faz pela `referencia`).
- As renovações só registam venda e comissões se `invoice.amount_paid > 0` (`:137`, `:878`). Uma
  factura paga com saldo tem `amount_paid` menor (ou zero). O livro deve registar a venda pelo
  **`invoice.total`** com nota «pago com saldo da carteira: X €» — porque a receita existiu (saiu
  da dívida da MTM) e porque é isso que mantém a medição honesta. Decisão do dono: se o residual MLM e
  o residual da equipa se pagam sobre o `total` ou sobre o `amount_paid`. Recomendação: sobre o
  `total` — a comissão foi ganha quando o cliente renovou, não quando o cartão foi passado.
- Limitações a respeitar: «The invoice balance and the invoice currencies must match» (só EUR→EUR, por
  isso os USD do Funded não pagam mensalidades sem o membro levantar primeiro); «The invoice balance
  doesn't apply to invoices created by Checkout Sessions with `invoice_creation` enabled» — serve para
  **renovações**, não para a primeira compra via Checkout.

**2. Reinvestimento: saldo da carteira → produtos da casa.** Com o mesmo crédito no customer balance,
um membro pode usar comissões para subir de degrau (Membro → Premium: o Stripe aplica o crédito à
primeira factura da nova subscrição). Mesma receita Stripe, mesmo livro, agente da venda = o que o
cookie disser (ou nulo).

**3. Mais Connect activo.** Quem vê o saldo na app pede levantamento; quem pede levantamento liga o
Connect (o widget já existe, `mlm-dashboard-tab.tsx:58`). Cada payout por Connect custa 0,25 % +
0,10 € + 2 €/mês por conta activa — é o custo que a MTM já aceitou para o MLM. Nada novo.

### 4.4 O que NÃO fazer

- **Não mover subscrições para a Whop.** Custo directo: 2,7 % + 0,30 $ por transacção, +1 %
  conversão de moeda, +1,5 % cartão internacional (docs.whop.com/fees) — contra a tarifa Stripe que a
  MTM já paga. Custo indirecto e maior: **a atribuição `?ag=` → `mtm_ag` → metadata do checkout →
  `vendas_vendas.agente_codigo` vive no Stripe** (§2.1). A Whop não lê o nosso cookie nem escreve no
  nosso livro; cada venda na Whop seria «sem código», e a régua de vida dos agentes
  (`lib/agentes/vida.ts`, referida na migração 170) mataria agentes por falta de medição, não de
  trabalho. Também se perdem: o webhook de estornos (`estornarVenda`), o cálculo de comissões da
  equipa (`lib/vendas/calculo.ts`), o MLM, as licenças por subscrição.
- **Não fazer da Whop um segundo carril de payout.** Pagar comissões via Whop connected accounts põe
  os membros a fazer KYC noutra plataforma, com taxas por país «não confirmadas» para a UE, e com o
  dinheiro a passar por FBO accounts da Whop fora da nossa contabilidade. O Connect já faz isto em
  euros, com recibo, e está ligado ao livro.
- **Não guardar saldo carregado pelo membro.** A carteira só regista o que a MTM DEVE. No dia em que
  um membro puder «carregar 50 €» na carteira, a MTM passa a custodiar fundos de terceiros — é moeda
  electrónica (art. 4.º/11.º do RJSPME) e exige IME ou parceiro.
- **Não converter USD↔EUR dentro da carteira.** Mostra-se cada moeda como está. Converter é serviço
  de pagamento e a taxa de câmbio é uma promessa que a MTM não pode fazer.
- **Não prometer «paga o café com o lucro do trade».** O lucro está na PU Prime. A promessa honesta
  da Fase 0 é «vê e levanta tudo o que a MTM te deve num sítio só; paga a mensalidade com isso».

### 4.5 Como a montra `morethanbanking.whop.site` pode servir sem partir nada

Como **página de captação** (Whop é também um marketplace com tráfego próprio): produto grátis ou
freebie na Whop que leva o lead para `morethanmoney.pt/register?ag=<código>` — o checkout acontece
no Stripe, o livro fica inteiro, o agente é medido. Vender lá dentro, não.

---

## 5. Fases

### Fase 0 — sem parceiro, sem licença (pode começar amanhã)

**O que se constrói**

1. Tabela `carteira_movimentos` + vista `carteira_saldos` (por utilizador e moeda). RLS: o membro lê só
   o seu; escrita só por chave de serviço. Migração nova (`supabase/migrations/17x_carteira_mtm.sql`).
2. Ligar as quatro portas de origem para escreverem na carteira no mesmo passo em que mudam de estado:
   - `lib/vendas/livro.ts` (criar → `por_atribuir`) e `app/api/admin/vendas/comissoes/route.ts`
     (aprovar → `disponivel`; pagar → `pago` com `pagamento_ref`; estorno → linha contrária);
   - `lib/mlm-checkout-commission.ts`, `lib/mlm-renewal-commission.ts`, `lib/mlm-commission-payout.ts`;
   - `lib/mtmfunded/admin-conta-accoes.ts:285-335` e `app/api/mtmfunded/levantamentos/route.ts`;
   - `lib/marketplace/servidor.ts` / `marketplace_payouts`.
   Carga inicial: um script que projecta o histórico existente das quatro tabelas para a carteira,
   idempotente pela `referencia_origem`.
3. Rota `GET /api/carteira` (saldo por moeda: por atribuir / disponível / reservado / pago; histórico)
   e `POST /api/carteira/levantar` (escolhe destino entre os rails de hoje: Connect se
   `stripe_connect_status === 'complete'`, senão IBAN/MB Way com pedido para o admin, ou USDC→PU Prime
   nos payouts Funded). Reutiliza `payApprovedCommissions` e o fluxo de levantamentos do Funded.
4. Separador **«Carteira»** no `/app-mobile` (`components/mobile/mobile-sidebar.tsx`, ao lado de
   `mlm`/`portfolio`) e página `/carteira` no site: saldo por moeda, três números (por atribuir,
   disponível, já pago), histórico, botão «Levantar» e, quando em EUR, «Usar na próxima mensalidade».
   Ouro sobre carvão, como o resto da casa; os números são os do ledger, nunca estimativas.
5. «Pagar a mensalidade com saldo»: crédito no customer balance do Stripe (§4.3) + webhook a escutar
   `invoice.paid` + livro a registar pelo `total` com nota. Teste obrigatório em modo de teste do
   Stripe antes de ligar.
6. Painel admin `/admin/carteira`: dívida total por moeda, por origem, pedidos de levantamento
   pendentes, exportação. É o número que o dono precisa de ver antes de pagar.

**O que custa**

- Stripe: zero fixo. Payouts Connect 0,25 % + 0,10 € + 2 €/conta activa/mês (stripe.com/en-pt/connect/pricing),
  como hoje. Customer balance: sem custo adicional publicado.
- Desenvolvimento: trabalho interno; sem número a citar.

**Risco**

- Baixo legal: é contabilidade de dívida comercial que já existe em quatro tabelas.
- Técnico: o ponto frágil é o webhook (`invoice.paid`) e a semântica de `amount_paid` vs `total` no
  livro — se se fizer mal, renovações pagas com saldo ficam sem licença ou sem comissões. Por isso o
  teste em sandbox é obrigatório, e a guarda `portas-receita.check.ts` deve ganhar um caso para o
  caminho «pago com saldo».
- Fiscal: quando um membro usa saldo de comissão para pagar a mensalidade, há duas operações
  (pagamento de comissão + venda) e não uma compensação silenciosa. Recibo de ambas, como hoje. A
  confirmar com o contabilista do dono.

### Fase 1 — parceiro de cartões (exige decisão e contrato do dono)

**O que se constrói**

- Contrato com uma IME europeia de marca branca (Swan, Treezor ou Weavr/Paynetics — §3.1) que faça
  KYC do membro, abra conta em nome dele (IBAN) e emita cartão com Apple/Google Pay.
- A MTM regista-se como **agente/distribuidor** dessa IME junto do Banco de Portugal (art. 31.º/34.º
  RJSPME) — é a IME que submete o registo e que responde pelo AML.
- Na carteira, novo destino `cartao_parceiro`: «levantar» passa a ser uma transferência SEPA da MTM
  para o IBAN do membro na IME (saída igual à de hoje por IBAN, só que o destino é a conta do
  parceiro). Para o membro, parece «minutos depois está no cartão»; para a MTM, continua a ser um
  pagamento de dívida por transferência. **A MTM nunca custodia.**
- Opcional, e só com o parceiro: o membro liga o seu IBAN da PU Prime à conta do parceiro para
  receber levantamentos da corretora — aí sim, «fechou o trade → café», mas é o cliente a levantar da
  corretora para a sua própria conta; a MTM não entra nesse fluxo.

**O que custa (só o que está publicado)**

- Swan: «Starting from 2990€/m» no plano on-demand; Enterprise sob consulta (swan.io/pricing). IBAN
  português **não listado** — pedir confirmação.
- Treezor: sem preços publicados — pedir cotação.
- Weavr: «from £1,947.00/month» segundo terceiros — **não confirmado**; pedir cotação.
- Stripe Issuing: **não serve** para uso de consumo na UE (§3.1), por isso não é opção para o café do
  membro; só serviria para cartões a sole traders com uso comercial.

Ordem de grandeza honesta: um custo fixo mensal de parceiro na casa dos **milhares de euros**
antes de qualquer cartão. Com a receita real medida em `vendas_vendas` (35 € a 01/10 segundo a
migração 170), a Fase 1 só faz sentido quando a dívida mensal a membros justificar o custo fixo.
Esse número sai da Fase 0 — é mais uma razão para a fazer primeiro.

**Risco**

- Legal/regulatório: alto se mal enquadrado (ENI a parecer banco). Mitiga-se com o parceiro a ser o
  prestador e a MTM como agente registado; exige advogado de regulação financeira.
- Comercial: lock-in ao parceiro; KYC do membro cai numa plataforma externa (atrito).
- Marca: «MoreThanBanking» não pode usar «banco/conta bancária» sem ser verdade; os parceiros exigem
  wording aprovado (Stripe publica guias de marketing para a UE; os outros também os têm).

### Fase 2 — (apenas para registo) licença própria

Sociedade por quotas ou anónima + autorização do Banco de Portugal como IP/IME (capital 20 000–350 000 €,
arts. 18.º, 49.º, 55.º RJSPME). Fora de escala para a MTM actual; fica escrito para não se voltar a
perguntar.

---

## 6. Fontes

- Whop: docs.whop.com (início), docs.whop.com/fees, docs.whop.com/developer/platforms/quickstart,
  docs.whop.com/manage-your-business/manage-payouts/payout-methods, …/connected-accounts,
  docs.whop.com/whop-finance/cards, docs.whop.com/whop-finance/supported-regions,
  whop.com/intl-card-consumer-terms, businesswire.com (2026-05-27, «Whop Announces Launch of
  Business-Native Card»), lex.substack.com/p/analysis-whop-theres-your-neobank, morethanbanking.whop.site.
- Stripe: docs.stripe.com/billing/customer/balance, docs.stripe.com/invoicing/overview,
  docs.stripe.com/issuing/global, docs.stripe.com/issuing/connect, stripe.com/en-pt/connect/pricing,
  stripe.com/gb/legal/issuing/commercial-card, stripe.com/legal/restricted-businesses.
- Lei: Decreto-Lei n.º 91/2018 (pgdlisboa.pt; diariodarepublica.pt), bportugal.pt (autorização de IP/IME;
  Portaria 239/2019 via resultados de pesquisa — página directa devolveu 403 nesta leitura).
- Parceiros: swan.io/pricing, treezor.com, weavr.io + thepaypers.com/finextra (licença MFSA 2024),
  appadvisoryplus.com (preço Weavr, não confirmado), thepaypers.com/fintechfutures (Solaris/SBI).
- Código MTM: ficheiros e linhas citados em §2 (commit `68d893fa`, 2026-10-04).

---

## Em 8 linhas

1. **A Whop é** um marketplace com pagamentos próprios e payouts a criadores; o «neobank» dela é saldo + cartão Visa + stablecoins, construído sobre parceiros (Rain, Cross River, ClearBank, Privy/Tether) — **cartões só nos EUA, sem IBAN, EUR não confirmado**. O `morethanbanking.whop.site` é uma montra genérica.
2. **Resposta curta ao dono:** o Stripe fica a cobrar tudo (é lá que vive a atribuição `?ag=` e o livro); o «banco» é só o carril de pagar e gastar. Nenhuma venda sai do Stripe.
3. A peça que falta é um **ledger `carteira_mtm`**: tudo o que a MTM deve a cada membro (comissões MLM e de equipa, payouts Funded, partilha de educador) num sítio, com saldo por atribuir/disponível/pago, por moeda.
4. **Aumenta a receita Stripe** porque o saldo paga a mensalidade **via customer balance do Stripe** (a factura continua a ser Stripe, ao preço cheio) — retenção; exige escutar `invoice.paid` e registar pelo `total`.
5. **Fase 0, amanhã, sem licença:** migração da carteira, ligar as 4 portas, `/api/carteira`, separador «Carteira» no `/app-mobile` e no site, levantamento pelos rails de hoje (Connect/IBAN/MB Way/USDC), «usar na mensalidade». Custo fixo zero.
6. **Não fazer:** mover subscrições ou payouts para a Whop (2,7 % + 0,30 $, +1 % FX, perda do `agente_codigo`), guardar saldo carregado por membros, converter moedas, prometer «café com o lucro do trade» (o lucro está na PU Prime).
7. **Exige decisão/contrato do dono (Fase 1):** escolher e contratar uma IME europeia em marca branca (Swan ≥ 2 990 €/mês publicado; Treezor e Weavr sob cotação), registo da MTM como agente no Banco de Portugal, advogado de regulação. Stripe Issuing **não** serve: proíbe uso de consumo na UE.
8. **O ENI não pode ser banco** (RJSPME art. 18.º: só SA ou Lda; capital 20–350 mil €). Pode, sozinho, registar e pagar dívida — que é tudo o que a Fase 0 precisa.
