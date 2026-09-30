# O correio de `morethanmoney.pt`

## O que se descobriu (30/09/2026)

O site publica seis endereços `@morethanmoney.pt` a clientes e **o domínio não tinha MX nenhum**.
Nem SPF, nem DMARC. O DNS está nos nameservers da Vercel (`ns1.vercel-dns.com`) e nunca foi
configurado para correio.

Ou seja: **tudo o que foi escrito para `suporte@`, `funded@` ou `geral@` levou bounce.** E do lado
de dentro não havia sinal nenhum — o site não envia por esses endereços, por isso nada falhava
visivelmente. Só se vê perguntando ao DNS:

```bash
npx tsx lib/correio/dns.check.ts
```

## Os endereços, e o que cada um é

Vieram de uma varredura ao repositório inteiro. A coluna que importa é a última: **só os publicados
a clientes precisam de receber.**

| Endereço | Onde aparece | Precisa de receber? |
|---|---|---|
| `suporte@` | o mais usado (34x): `/faq`, `/terms`, `/success`, `/upgrade`, app móvel, apagar conta | **Sim** |
| `support@` | versão inglesa: `/privacidade`, `/legal` — é a que a Apple e a Google leem | **Sim** |
| `funded@` | MTM Funded: FAQ + termos, reembolsos, risco, privacidade + rodapé | **Sim** |
| `geral@` | rodapé do site e página do incidente 10/09 | **Sim** |
| `admin@` | identidade das acções de admin nas rotas internas | Sim (bounces) |
| `noreply@` | **código morto** — só num bloco comentado de Resend em `app/api/admin/notify-registration/route.ts`. Não envia nada hoje | Opcional |
| `adilson@`, `liliana@`, `ricardo@` | manifesto de educadores e docs | Só se quiseres dar email de marca |

**Não criar** — são identificadores internos que nunca saem para fora:

- `sistema@`, `system@` — o utilizador de sistema do chat
- `sem-email@` — placeholder para perfis sem email (`lib/mtmfunded/ciclo-de-vida.ts`)
- `…-credenciais@` — é um **UID de evento iCal** dos torneios, não é um email
- `info@` — só num SQL de 2026 (`003_admin_tables.sql`), nunca publicado
- `design@` — só num relatório de entrega

## Quem envia hoje

Tudo sai por **Gmail** (`morethanmoneypt@gmail.com`), por nodemailer, a partir de um único
ficheiro: `lib/mail-transport.ts`. Usam-no ~12 rotas — campanhas, agenda, recuperação de password,
avisos do MTM Funded, formulários.

Nada envia em nome de `@morethanmoney.pt`. O `noreply@` que aparece no código está comentado.

## Os registos a colar na Vercel

Vercel → Domains → `morethanmoney.pt` → DNS Records → **Add**.

> **Não apagar nada do que já lá está.** Os registos `A` (`216.150.16.65`, `216.150.16.129`) são o
> site. Acrescentam-se registos novos; não se substitui a zona.

### Zoho Mail (caixas verdadeiras — o caminho escolhido)

| Tipo | Name | Valor | Prioridade |
|---|---|---|---|
| MX | *(vazio / @)* | `mx.zoho.eu` | 10 |
| MX | *(vazio / @)* | `mx2.zoho.eu` | 20 |
| MX | *(vazio / @)* | `mx3.zoho.eu` | 50 |
| TXT | *(vazio / @)* | `v=spf1 include:zohomail.com ~all` | — |

Servidores **`.eu`** porque a conta é criada na região europeia. A documentação do Zoho é
explícita: o domínio de topo dos MX **muda com o centro de dados** da conta, e só os valores que
aparecem no *Admin Console → Tools & Configurations* são os certos. **Usa os que o painel te
mostrar**, não estes — estes são o caso europeu e servem para saberes o que esperar.

O SPF, ao contrário dos MX, é o mesmo em todas as regiões: `include:zohomail.com`. É um nome que
já inclui todos os IPs de envio do Zoho.

O Zoho pede ainda um **TXT de verificação do domínio** (um valor único, do tipo
`zoho-verification=zb…`) e depois um **TXT de DKIM**. Ambos aparecem no painel dele; cola-os na
Vercel da mesma maneira.

### DMARC (depois de o correio já funcionar)

| Tipo | Name | Valor |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:geral@morethanmoney.pt` |

`p=none` só observa, não rejeita. É o que se põe primeiro; passa-se a `quarantine` semanas depois,
quando os relatórios mostrarem que tudo o que envia legítimo já está a passar.

### O erro a não cometer

**Nunca dois registos SPF.** Ao juntar um segundo provedor, a tentação é acrescentar outra linha
`v=spf1`. A norma diz que mais do que um registo SPF invalida a verificação **toda** — fica pior do
que não ter nenhum. Junta-se num só:

```
v=spf1 include:zohomail.com include:_spf.google.com ~all
```

O `dns.check.ts` apanha este caso e falha alto.

## Passar o site a enviar pelo domínio

Está pronto. Assim que a caixa existir, três variáveis na Vercel:

```
MAIL_SMTP_HOST=smtp.zoho.eu
MAIL_SMTP_USER=geral@morethanmoney.pt
MAIL_SMTP_PASSWORD=<password de aplicação do Zoho>
MAIL_SMTP_PORT=465        # opcional; 465 por omissão
MAIL_FROM=geral@morethanmoney.pt   # opcional; por omissão é a própria caixa
```

Não há código para mudar. A decisão vive em `lib/correio/remetente.ts` (pura, coberta por
`remetente.check.ts`) e o `mail-transport.ts` limita-se a obedecer.

Duas coisas que essa decisão protege, e que valem a pena saber:

1. **Meia configuração não se usa.** Host preenchido e password esquecida davam um transporte que
   falhava em *todos* os emails do site ao mesmo tempo — incluindo a recuperação de password, que é
   a única forma de alguém voltar a entrar na conta. Nesse caso volta ao Gmail e grita a variável
   que falta nos registos.
2. **O `From` é a própria caixa autenticada**, por omissão. O Zoho e o Google recusam uma mensagem
   cujo `From` não seja a caixa nem um alias dela — e recusam-na no servidor, não no nosso código,
   o que a torna muito mais difícil de encontrar. `MAIL_FROM` existe para os aliases (`suporte@` a
   partir de `geral@`), mas é escolha explícita.

O Zoho **grátis não tem SMTP nem IMAP** (só webmail e app). O envio pelo domínio exige o
**Mail Lite**, ~1 $/caixa/mês.

## As campanhas em massa são outro problema

Não devem sair nem por Gmail nem por SMTP de caixa normal. O Gmail corta aos ~500/dia e o Zoho tem
limites parecidos; passar disso faz o domínio ser marcado como spam — e aí deixam de chegar também
os emails que importam, como a recuperação de password.

Envio em massa quer um remetente dedicado (Resend, Brevo) com o domínio verificado por DKIM, à
parte das caixas. São duas coisas separadas: **caixas para falar com pessoas, remetente para
enviar campanhas.** Hoje não existe nenhuma conta dessas configurada — o `.env.local` só tem
`GMAIL_USER` e `GMAIL_APP_PASSWORD`.

## Confirmar

```bash
npx tsx lib/correio/dns.check.ts        # MX, SPF (um só), DMARC
npx tsx lib/correio/remetente.check.ts  # a decisão do remetente
```

E, no fim, o teste que conta: mandar um email para `suporte@morethanmoney.pt` de fora e ver se cai
na caixa.
