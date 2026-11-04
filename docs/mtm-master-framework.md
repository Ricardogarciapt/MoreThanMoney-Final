# MTM Master Framework — a forma de pensar da casa (04/11/2026)

> Pedido do Ricardo a 04/11/2026: actualizar a forma de pensar de todo o projecto (funis, conteúdo
> social, backoffice, IAs) com um contexto de memória unificado. **Sem mexer no frontend.**
>
> **Fonte em código:** [`lib/framework-mtm.ts`](../lib/framework-mtm.ts). É de lá que as IAs lêem.
> Este documento explica; não se cola daqui para um prompt.
> **Guarda:** `npx tsx lib/framework-mtm.check.ts`.

## 1. Identidade e modelo híbrido

Quatro rotas para a mesma casa. Os preços vivem em `lib/escada-precos.ts`; aqui só a lógica.

| Rota | O que é | Onde vive no código |
|---|---|---|
| **Rota corretora (PU Prime, IB)** | Conta própria aberta pelo nosso link, financiada com o depósito mínimo. O dinheiro é do cliente. Enquanto financiada, desbloqueia o Premium. | `MIN_DEPOSIT` (`lib/broker`), validação em `lib/telegram-broker-gate.ts`, `lib/acesso-estrategias.ts` |
| **Membro** | Subscrição directa, para quem quer manter a corretora actual. | `PRECO_MEMBRO`, `lib/entitlements.ts` |
| **Premium** | Acesso completo. Experimenta-se `TRIAL_DAYS` dias sem cartão no registo. | `PRECO_PREMIUM`, `lib/trial-access.ts` |
| **MTM Funded** | Desafios e torneios em conta **simulada**; o topo é um Patrocínio de Desempenho. **Não é prop firm**: a MTM não custodia nem executa capital de clientes. | `docs/mtm-funded-fase1-spec.md`, `/mtmfunded` |

O degrau anual (`NOME_DEGRAU_TOPO`, hoje Elite) continua na escada; o framework não o tira.

## 2. Camada tecnológica

- **MTM System / WebTrader** — motor próprio de análise e execução assistida. Não é copiador cego:
  os sinais passam por filtros e gestão de risco.
- **Scanners** — filtros algorítmicos (liquidez, order blocks, fair value gaps) com alertas por
  webhook JSON.
- **TrendShot by MTM** (TradingView) e **MTM Sensei EA** (preservação de capital, risco apertado).

## 3. Motor comercial

- **Setter** (DMs Instagram, WhatsApp, Telegram): triagem da dor do custo fixo → agenda a chamada
  de Onboarding (`lib/agenda/link.ts`). Não fecha venda.
- **Closer**: apresentação técnica do WebTrader → fecho em Rota Corretora ou Premium. Sem capital
  próprio → MTM Funded.
- **Ângulo anti-MLM**: fala-se do *modelo* (mensalidades de rede, pressão para recrutar), **nunca
  de empresas ou pessoas pelo nome**.

## 4. Directivas para as IAs

**A — Código (backoffice e site)**
1. Webhooks e alertas são o caminho quente: nada de IA, esperas síncronas ou chamadas lentas antes
   da entrega.
2. Acessos são permissões no servidor (`lib/entitlements.ts`, `lib/acesso-estrategias.ts`). Membro,
   Premium e Rota Corretora abrem capacidades por caminhos diferentes; funcionalidade nova = permissão
   nova, não produto novo.
3. IAs de apoio encaminham dúvidas de capital para o MTM Funded (`frameworkEncaminharCapital()`).
4. Toda a IA passa por `lib/ia/chamar.ts`: **grátis primeiro** (Groq, Gemini, Ollama), pagos só como
   reserva (`docs/ia-gratuita.md`).

**B — Conteúdo**
1. Tom científico, transparente, focado em dados, anti-pirâmide. Nunca prometer retornos.
2. Ganchos pelo custo de oportunidade.
3. Guiões curtos sobre a passagem de «vendedor de recrutamento» para «trader independente».

## 5. Onde está ligado

| Superfície | Bloco |
|---|---|
| Assistente do site/app, mentor | `blocoFramework('apoio')` |
| Setter Instagram, conversa de leads Telegram | `blocoFramework('setter')` |
| Closer DM, funil Telegram, desenhador de funis, playbook/material do backoffice | `blocoFramework('closer')` |
| Geradores de marketing, estúdio social, cartões, stories, Reels | `blocoFramework('conteudo')` |
| Dashboard de gestão (12 agentes), API de agentes, insights | `blocoFramework('backoffice')` |

Uma IA nova escolhe a superfície e cola o bloco. Mudar a forma de pensar é mudar `lib/framework-mtm.ts`.

## 6. O que ficou de fora do texto original, e porquê (decisão do Ricardo)

| Do texto original | O que se fez | Porquê |
|---|---|---|
| JIFU e IM Mastery Academy como «concorrência desleal» | Não entra em nenhum prompt; o ângulo anti-MLM fica genérico | Chamar «desleal» a uma empresa por nome em conteúdo automático é risco de difamação e de publicidade comparativa ilícita. A regra da casa já era não os citar. |
| «Falhas do antigo IQ Auto de Steve Mata» | Fica só «não é copiador cego» | Nomear uma pessoa de outra empresa pelas falhas dela é o mesmo risco. |
| «MTM Funded (Prop Firm) … capital simulado da mesa» | «Contas simuladas, Patrocínio de Desempenho, não é prop firm» | O spec diz que não é prop firm; prometer «capital da mesa» seria vender o que não existe. |
| «Educação de borla se validar a conta com depósito» | Mantém a regra já existente (rota corretora desbloqueia Premium; vem no fim da escada) | Condicionar formação a depósito numa corretora é o ponto mais sensível para a CMVM/ESMA (incentivo). Fica como está até o Ricardo decidir. |
| Gancho «as tuas ferramentas passam a ser grátis» | Reescrito: «esse dinheiro, numa conta tua, é capital teu — e as ferramentas vêm com ele» | A casa não lidera com o grátis (`docs/mtm-sales-brain.md` §5). |
| «Rede neural» nos scanners | «Filtros algorítmicos» | Os scanners são Pine/algoritmos; chamar-lhes rede neural em marketing é uma alegação que não se prova. |
| Scripts de activação PU Prime / Skool | Não feitos | Só se o Ricardo pedir. |
