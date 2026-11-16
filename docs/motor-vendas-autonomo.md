# Motor de vendas autónomo (16/11/2026)

Regras do Ricardo, aplicadas no código. Memória do projeto: `comercial-regras-vendas`.

## Quem fecha

| Oferta | Quem fecha | Onde |
|---|---|---|
| Membro 35 €/mês | agente (DM) | `/register?plano=membro` |
| Premium 65 €/mês | agente (DM) | `/register` / `/upgrade` |
| Elite 597 €/ano (anuais) | agente (DM) | `/upgrade` |
| Rota Corretora (PU Prime, depósito mín. 350 $) | agente (DM) + validação do UID no Telegram | `/abrir-conta` → @MoreThanMoney_aibot |
| ≥ 1.200 € ou à medida | Ricardo (mais tarde: closers humanos) | `/agendar?t=fecho-alto-valor` |
| Sem capital | ninguém vende: MTM Funded (conta simulada) | `/mtmfunded` |

Código: `lib/vendas/regras-fecho.ts` (puro, com guarda), `lib/framework-mtm.ts` (`frameworkCloser`),
`lib/instagram/dm-closer.ts` (prompt + histórico das últimas 6 trocas). O closer do Telegram
(`lib/telegram-lead-funnel.ts`) herda o `blocoFramework('closer')`.

**Ordem do fecho:** Rota Corretora primeiro (produto nº 1) para quem tem capital que pode arriscar
e quer o acesso completo; Membro/Premium para quem fica na corretora que já tem; anual para quem
quer o ano. Nunca se lidera com «grátis».

**Fecho ético:** confirmar preço e cancelamento antes do link; dizer o risco; sem pressão nem
prazos inventados; quem pede uma pessoa ou tem um caso sensível passa ao Ricardo; se perguntarem
se é IA, diz-se a verdade.

## Seguimento: 4 toques

No dia (4 h de silêncio), +24 h, +48 h, +72 h (`lib/vendas/cadencia-seguimento.ts`). Depois, email
só com consentimento ou se já for cliente (Lei 41/2004), pelo executor do pipeline.

- **Telegram:** a cadência corre inteira (`lib/telegram-lead-followup.ts`). Os toques passam pela
  passagem legal de sempre antes de sair.
- **Instagram e WhatsApp:** a Meta só deixa texto livre até 24 h depois da última mensagem da
  pessoa. Os toques de +48 h e +72 h só saem aí se ela voltar a escrever; senão o seguimento
  continua no Telegram (opt-in) ou no email (consentimento).

## Agenda do Ricardo (`/agendar`)

Segunda a sexta 15h00–18h30; 21h30–22h00 **só** para o tipo `fecho-alto-valor`. Nada antes das
10h30 nem depois das 22h00. As aulas ao vivo dele (`lms_educador_id`) e as duas agendas Google
(PR #240) contam como ocupado. Migração `252_agenda_fecho_alto_valor.sql`; lógica em
`lib/agenda/horas.ts` (`janelasDoTipo`) e `lib/agenda/servidor.ts`.

## Áudios na voz do Ricardo

`lib/vendas/audio-dm.ts`: depois da resposta de texto na DM do Instagram, um áudio com o clone Fish
(`lib/voz`), só quando a resposta leva um link de fecho, com tecto diário e a linha «voz gerada por
IA» (AI Act, art. 50.º). Interruptor `site_settings.vendas_audio_dm` = `{"ligado": true, "tecto_dia": 30}`;
nasce desligado.

## Funis por oferta e teste de público

Três funis separados (Conduta v2): Rota Corretora, Educação (Membro/Premium), MTM Funded. A
migração `253_publico_virtual_funis_oferta.sql` põe na fila do MiroFish um teste por funil, com a
copy real e a pergunta «qual pega mais». Corre no Mac (até 3 por dia). O MiroFish gera as personas
a partir da semente (dezenas, não 1.200, no Mac de 16 GB). O relatório é uma simulação, não uma
medição.
