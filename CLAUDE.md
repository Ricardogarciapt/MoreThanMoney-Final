# MoreThanMoney · Claude Code

> Ficheiro curto de propósito (17/11/2026): entra em todas as sessões, por isso só leva o essencial.
> O detalhe está em `docs/claude/` e lê-se apenas quando a tarefa precisa.

## Projeto

- Site https://www.morethanmoney.pt · Next.js 15 App Router · TypeScript · Tailwind · Supabase (`iwscxotvmtkphajmasof`, eu-north-1) · Vercel.
- Repo principal `origin` (MoreThanMoney-Final, auto-deploy Vercel); espelho `secundario` (SITE-MORETHANMONEY-FINAL): `git push origin main && git push secundario main`.
- Typecheck: `./node_modules/.bin/tsc --noEmit`. Dev: `npm run dev`.
- Social próprio (sem ManyChat desde 04/10/2026): Instagram Graph API (`lib/instagram/**`), WhatsApp Cloud API (`lib/whatsapp-*`), Telegram bot próprio (`app/api/telegram/webhook`). Agenda própria em `/agendar` (`lib/agenda/link.ts`).

## MTM Master Framework (regras de todas as IAs)

Fonte `lib/framework-mtm.ts`, explicado em `docs/mtm-master-framework.md`. Prompts novos colam `blocoFramework('apoio'|'setter'|'closer'|'conteudo'|'backoffice')`.

- Modelo híbrido: Rota corretora PU Prime · Membro · Premium (trial `TRIAL_DAYS`) · MTM Funded (contas SIMULADAS, Patrocínio de Desempenho, **não é prop firm**).
- Tom científico e transparente, anti-pirâmide. Nunca prometer retornos; nunca nomear empresas nem pessoas no ângulo anti-MLM.
- Acessos são permissões no servidor (`lib/entitlements.ts`, `lib/acesso-estrategias.ts`). IA via `lib/ia/chamar.ts`, grátis primeiro. Webhooks e alertas sem nada lento antes da entrega.
- MetaApi é secundário: nada interno pode depender dele.

## Marca e escrita

- PT-PT, «tu», informal; «ecrã», «telemóvel». Emojis moderados.
- Ouro sobre carvão: `#D2A63C`, `#E9C46A`, fundo quase preto. Nenhum número de desempenho inventado (prova em pips com origem, `docs/mtm-sales-brain.md`). Disclaimer educativo em conteúdo de trading. Não nomear a plataforma dos cursos em páginas públicas.

## Poupança de tokens

- Sub-agentes sempre com `model: haiku`. Ler só as partes dos ficheiros de que precisas.
- `/clear` entre tarefas sem relação; `/compact` no fim de cada fase, nunca a meio de uma implementação.
- As skills de uso diário estão em `.claude/skills/` (42). As outras 472 estão em `biblioteca-skills/`: copia uma para `.claude/skills/` só quando fizer falta.

## Onde está o resto (ler só quando preciso)

| Tema | Ficheiro |
|---|---|
| 12 agentes do Dashboard Gestão e Dispatch | `docs/claude/agentes-ia.md` |
| UI, skills de design e AIOS (iframe em `public/aios`, não é React) | `docs/claude/design-ui.md` |
| WhatsApp Business (IDs, token de sistema, o que falta) | `docs/claude/whatsapp.md` |
| Variáveis de ambiente, tabelas Supabase, URLs, métricas | `docs/claude/ambiente-metricas.md` |
| Pendentes e doutrinas de set.–nov. 2026 (VPS, MTM Funded, T2T, flyer semanal) | `docs/claude/pendentes-historico.md` |
