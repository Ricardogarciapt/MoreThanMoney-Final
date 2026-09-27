# WhatsApp — ligar o canal (guia para o Ricardo)

**Estado a 27/09/2026: o código está pronto e o canal está DESLIGADO.** Nenhuma das variáveis
(`WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`) existe no `.env.local`
(verificado: 123 variáveis, zero com «whats»). Enquanto faltarem, o sistema **recusa cada envio e
grava a recusa** com o código `sem_credenciais` — não tenta e falha em silêncio.

O que falta é do lado da Meta e **só tu podes fazer**: envolve a tua identidade, o teu número e a
tua conta de negócio. Nenhum destes passos se faz por código.

> **Regra que atravessa este guia:** um número de WhatsApp Business marcado como spam pela Meta não
> se recupera com um deploy. Tudo o que aqui está escrito a dizer «não faças» está escrito porque a
> alternativa é perder o número — e com ele o canal.

---

## Antes de começares: as duas paredes da Meta

Não são opções nossas, são regras deles. O código já as impõe, mas tens de as conhecer para
entenderes o que estás a configurar.

**1. A janela de 24 horas.** Cada vez que uma pessoa te escreve, abrem-se 24 horas. Dentro delas
podes responder o que quiseres, em texto livre. Passadas as 24 horas, **só passa um *template*
aprovado** — texto livre é recusado pela Meta. É por isso que o passo dos templates (passo 6) não é
opcional: sem templates, só consegues falar com quem te escreveu nas últimas 24 horas.

**2. Quem te deu o número.** Ter o número não é ter permissão. O sistema só escreve a alguém que (a)
te escreveu primeiro, ou (b) tem uma linha no livro do consentimento
(`captacao_consentimento`, canal `whatsapp`). Importar uma lista de números e mandar mensagens é o
caminho directo para o número ser denunciado. O código recusa-o (`sem_origem`) e isso é deliberado.

---

## Passo 1 — Conta de negócio na Meta

1. Vai a **business.facebook.com** e confirma que existe um Business Manager para a MoreThanMoney.
   Pela memória do sistema já existe a Página «More Than Money» ligada a `@morethanmoney.pt` — usa
   **esse** Business Manager e não crie outro. Duas contas de negócio para a mesma marca é o tipo de
   confusão que depois impede a verificação.
2. **Verificação do negócio** (*Business verification*): em **Definições do negócio → Centro de
   segurança**, confirma o estado. Enquanto o negócio não estiver verificado, os limites de envio são
   baixos e algumas coisas não ficam disponíveis. Pede documentos da empresa (certidão, comprovativo
   de endereço) — *o ecrã exacto e a lista de documentos: confirmar no painel*, que a Meta muda isto
   com frequência.

**Não avances para o passo 3 sem a verificação submetida.** Podes fazer os passos seguintes com o
número de teste enquanto ela corre, mas não ligues o número real antes.

## Passo 2 — App e produto WhatsApp

1. **developers.facebook.com → Minhas Apps → Criar app**. Tipo: **Business** (empresa).
2. Liga a app ao Business Manager do passo 1 (a app pede isso na criação ou nas definições).
3. No painel da app, **Adicionar produto → WhatsApp → Configurar**.
4. Fica na página **WhatsApp → Introdução à API** (*API Setup*). É aqui que a Meta te mostra:
   - um **número de teste** dela (serve para experimentar, só escreve para números que registares);
   - um **token temporário** (dura ~24 horas — **não o uses em produção**, é a razão do passo 5);
   - o **Phone number ID** e o **WhatsApp Business Account ID**.

> **O valor que interessa é o `Phone number ID`, não o número de telefone.** É um número comprido de
> dígitos, e é o que vai para `WHATSAPP_PHONE_NUMBER_ID`. Confundi-lo com o WABA ID (que está na
> mesma página, logo ao lado) dá erros da Meta que não dizem o que está errado.

## Passo 3 — O número real

1. Na mesma página, **Adicionar número de telefone**.
2. O número **não pode estar em uso no WhatsApp normal nem no WhatsApp Business (a app)**. Se o
   número que queres usar já tem WhatsApp, tens de apagar essa conta primeiro — e isso apaga o
   histórico de conversas desse número. Decide isto antes, não a meio.
3. A Meta pede nome de exibição do negócio, categoria e fuso horário, e verifica o número por **SMS
   ou chamada**. O nome de exibição passa por aprovação.
4. Depois de verificado, o número tem um **Phone number ID próprio** — é esse que usas, não o do
   número de teste.

**Sugestão prática:** usa um número novo, só para isto. Ligar o teu número pessoal significa perder
o WhatsApp pessoal desse número e passar a ter as conversas do negócio na mesma caixa.

## Passo 4 — Ligar o webhook

Esta é a parte que faz as mensagens chegarem ao site.

1. Inventa um **verify token**: uma cadeia longa e aleatória, só tua. Gera-a assim no terminal:
   ```bash
   openssl rand -hex 32
   ```
   Guarda-a. Vai ser usada em dois sítios e **têm de ser iguais** — é só isso que ela faz: a Meta
   manda-a e o nosso código compara.

2. Põe-na na Vercel **antes** de configurar na Meta (senão a verificação falha, porque o site ainda
   não sabe o token):
   ```
   Vercel → projecto site-morethanmoney-final → Settings → Environment Variables
   WHATSAPP_VERIFY_TOKEN = <a cadeia do openssl>      (Production)
   ```
   Depois de gravar, **faz um novo deploy** — variáveis novas só entram em vigor no deploy seguinte.

3. Na app da Meta: **WhatsApp → Configuração** (*Configuration*) → secção **Webhook** → **Editar**:
   - **Callback URL:** `https://www.morethanmoney.pt/api/whatsapp/webhook`
   - **Verify token:** a mesma cadeia
   - **Verificar e guardar**

   Se der erro de verificação, é quase sempre uma de três coisas: a variável não está na Vercel, o
   deploy ainda não foi feito, ou a cadeia tem um espaço a mais. Não é o URL.

4. Ainda na secção Webhook, **subscreve o campo `messages`**. Sem esta subscrição a verificação passa
   e não chega mensagem nenhuma — e é o erro mais chato de diagnosticar, porque parece que está tudo
   bem. *Se houver mais campos que te pareçam úteis (estados de entrega, etc.): confirmar no painel —
   o nosso código hoje só trata `messages`.*

## Passo 5 — O token permanente (system user)

O token da página de introdução dura 24 horas. Para produção precisas de um que não expire, e esse
faz-se com um **utilizador do sistema**.

1. **business.facebook.com → Definições do negócio → Utilizadores → Utilizadores do sistema**.
2. **Adicionar** → dá-lhe um nome claro (ex.: `mtm-whatsapp`) → função **Administrador**.
3. **Adicionar activos** (*Assign assets*): atribui-lhe **a app** do passo 2 **e a conta de WhatsApp
   Business** (WABA) do passo 3, com **controlo total** nos dois. Falhar isto é o que faz um token
   válido devolver «permissão negada» a enviar mensagens.
4. **Gerar novo token** → escolhe a app → permissões:
   - `whatsapp_business_messaging` (enviar e receber)
   - `whatsapp_business_management` (gerir templates e o número)
   - Na expiração, escolhe a opção **«Nunca»** / *Never* — *o nome exacto do campo: confirmar no
     painel*.
5. **Copia o token na hora.** Não volta a ser mostrado. Se o perderes, gera outro e o anterior deixa
   de servir.

Põe-no na Vercel:
```
WHATSAPP_TOKEN            = <o token do system user>
WHATSAPP_PHONE_NUMBER_ID  = <o Phone number ID do número REAL, passo 3>
```
Novo deploy depois de gravar.

> **Este token dá acesso a enviar mensagens em nome da MTM.** Não o ponhas num ficheiro do
> repositório, não o mandes por chat, não o coles num sítio partilhado. Se ele sair, alguém fala com
> os nossos clientes como se fôssemos nós.
>
> **Cuidado com `vercel env pull`:** já aconteceu nesta casa (tokens do Instagram) sobrescrever o
> `.env.local` e levar horas a perceber porquê. Se correres o `pull`, faz cópia do `.env.local` antes.

## Passo 6 — Templates (o que te deixa falar fora das 24 horas)

Sem isto, só respondes a quem te escreveu há menos de um dia. Cada template é submetido e aprovado
(pode levar de minutos a um dia).

1. **business.facebook.com → WhatsApp Manager → Modelos de mensagens** (*Message templates*) →
   **Criar modelo**.
2. Escolhe a **categoria** com honestidade, porque é ela que define o preço e o que é permitido:
   - **Utility** (utilidade) — sobre algo que a pessoa já tem: renovação, acesso, aviso de sessão a
     que se inscreveu.
   - **Marketing** — venda, conteúdo, reactivação. **Exige opt-in** e é o mais caro.
   - **Authentication** — códigos. Não usamos.

   Marcar uma mensagem de venda como «Utility» para pagar menos é o caminho mais rápido para os
   templates serem todos reprovados e o número ficar limitado. Não vale a pena.
3. **Idioma:** cria em `pt_PT`. O código do idioma tem de bater **exactamente** com o que passas no
   código (`idioma: 'pt_PT'`) — `pt_BR` é outro template e a Meta recusa.
4. **Corpo** com parâmetros numerados `{{1}}`, `{{2}}`, pela ordem em que os passas.

**Três templates para começar** (o texto é uma proposta, ajusta à tua voz):

| Nome sugerido | Categoria | Corpo |
|---|---|---|
| `mtm_retomar_conversa` | Utility | `Olá {{1}}, ficámos a meio da conversa aqui no WhatsApp. Queres que continue a explicar-te {{2}}?` |
| `mtm_aviso_sessao` | Utility | `Olá {{1}}, a sessão de hoje é às {{2}}. Entras pelo link da área de membro.` |
| `mtm_novidade` | Marketing | `Olá {{1}}, temos novidades na MoreThanMoney: {{2}}. Se não quiseres receber mais, diz só "parar".` |

5. Depois de aprovados, **diz-me os nomes exactos** — o código recebe-os como parâmetro e não os tem
   fixos em sítio nenhum, por isso não é preciso mexer em código para os usar.

## Passo 7 — A migração da base

Uma coisa do meu lado que precisa de uma ordem tua: aplicar
`supabase/migrations/146_whatsapp_mensagens.sql`. Cria a tabela `whatsapp_mensagens` (o livro das
mensagens) e a vista `whatsapp_janela`.

**Sem esta migração o canal não funciona**, e não é por zelo: é a última mensagem *dela* que define a
janela das 24 horas. Sem sítio onde guardar as entradas, o sistema acha que a janela está sempre
fechada e recusa responder a quem acabou de escrever.

## Passo 8 — Confirmar que está vivo (sem mandar spam a ninguém)

1. **Escreve tu ao número** do WhatsApp Business, do teu telefone pessoal. Isto abre a janela de
   forma legítima e é o único teste que não incomoda ninguém.
2. Vê se chegou: uma linha em `whatsapp_mensagens` com `direcao = 'entrada'` e
   `estado = 'recebida'`.
3. Vê a resposta: uma linha com `direcao = 'saida'`. Se estiver `estado = 'recusada'`, a coluna
   `motivo` diz exactamente porquê, em português. Se estiver `falhou`, o `motivo` tem a resposta
   literal da Meta.

```sql
select criado_em, direcao, estado, codigo, motivo, left(corpo, 80) as corpo
from whatsapp_mensagens
order by criado_em desc
limit 20;
```

**Nunca testes escrevendo primeiro a um número que não te escreveu.** O sistema recusa
(`sem_origem`), mas a razão pela qual recusa é a mesma pela qual não se deve tentar.

---

## Resumo das variáveis

| Variável | De onde vem | Onde se põe |
|---|---|---|
| `WHATSAPP_VERIFY_TOKEN` | inventas com `openssl rand -hex 32` | Vercel **e** no ecrã do webhook da Meta (iguais) |
| `WHATSAPP_TOKEN` | token do system user (passo 5) | Vercel, Production |
| `WHATSAPP_PHONE_NUMBER_ID` | *Phone number ID* do número real (passo 3) | Vercel, Production |
| `WHATSAPP_RELAY_URL` | opcional — relay nosso no VPS | Vercel, só se existir |
| `CRON_SECRET` | já existe | usado só com o relay |

O `WHATSAPP_RELAY_URL` serve para mandar os envios por um serviço nosso no VPS em vez de falar
directamente com a Meta, para o token viver num sítio só. **Não muda nenhuma regra**: a janela e os
templates são da Meta, e o relay acaba a falar com a mesma API. Se não existir, deixa a variável
vazia — não é preciso para nada funcionar.

## Onde isto vive no código

| Ficheiro | O que faz |
|---|---|
| `lib/whatsapp-envio.ts` | A decisão, pura: normalizar o número, a janela, se pode enviar e se exige template |
| `lib/whatsapp-envio.check.ts` | As guardas (`npx tsx lib/whatsapp-envio.check.ts`) |
| `lib/whatsapp-mensageiro.ts` | Lê o estado, decide, fala com a Meta, grava no livro |
| `app/api/whatsapp/webhook/route.ts` | Recebe, registra a entrada, responde pelo funil do Telegram |
| `supabase/migrations/146_whatsapp_mensagens.sql` | O livro `whatsapp_mensagens` + vista `whatsapp_janela` |
| `lib/captacao-consentimento.ts` | O canal `whatsapp` no livro do consentimento |

## O que ainda não existe (e é preciso dizer)

- **Não há ecrã no admin** para escreveres a alguém pelo WhatsApp. O motor está feito
  (`enviarWhatsApp`), a interface não. É o passo natural a seguir, quando o canal estiver vivo.
- **Não se pede consentimento dentro da conversa.** O texto do pedido já existe
  (`PONTOS_DE_CAPTURA`, canal `whatsapp`) e a rota que o registra também
  (`POST /api/captacao/consentimento`), mas o funil ainda não faz a pergunta nem lê a resposta. Sem
  isso, cada pessoa só pode ser contactada dentro das 24 horas em que escreveu.
- **Preços e limites de envio** mudam e não os invento aqui: *confirmar no painel* da Meta, em
  **WhatsApp Manager → Informação** / *Insights*.
