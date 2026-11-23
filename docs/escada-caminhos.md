# A escada de produtos e os três caminhos (23/11/2026)

Fonte do código: `lib/escada-caminhos.ts` (caminhos e passo seguinte) e `lib/escada-precos.ts` (preços).

## O que os dados mostraram

| Medida (produção, 23/11) | Valor |
|---|---|
| Leads no CRM (`vendas_negocios`) | 4.190 |
| Contactados / qualificados / ganhos | 10 / 3 / 2 |
| Contas no site | 141 (6 nos últimos 30 dias) |
| Compras no marketplace | 0 |

O problema não está no topo da escada (Premium, Elite). Está no primeiro pagamento: o único caminho
era saltar do grátis para uma mensalidade.

## O que estava partido

1. **Seis escadas diferentes.** O mesmo lead ouvia coisas diferentes consoante o canal:
   Telegram «começa no Membro, não lideres com o grátis», DMs «começa pelo Premium 3 dias», freebies
   «Premium e depois Membro», GoldKiller «30 dias e depois Membro», follow-up «Membro e depois
   corretora».
2. **«Premium 3 dias sem cartão» em 9 textos**, mas o trial pede o cartão desde 16/11
   (`TRIAL_PEDE_CARTAO`). Quem chega ao checkout e vê o cartão sente-se enganado e sai.
3. **Nenhum degrau de pagamento único** entre o grátis e a mensalidade, apesar de já existirem
   dois produtos baratos que cobram: «O Método Frio» + 7 dias (5 €) e o Desafio MTM Funded Launch
   10K em conta simulada (10 €). O concorrente líder em PT faz grátis → 37 €.

## O que mudou

| Perfil | Íman | 1.º passo pago | Depois | Topo |
|---|---|---|---|---|
| **Aprender** (começa do zero, já perdeu) | O Primeiro Passo | Método Frio + 7 dias, 5 € | Premium com trial (recusa o cartão → Membro) | Elite |
| **Ferramentas** (já opera) | GoldKiller 30 dias | Membro 35 €/mês, mantém o GoldKiller (recusa → Desafio simulado 10 €) | Premium | Elite |
| **Capital** (tem 350 $) | Como funciona a rota | Rota Corretora (hesita → Desafio simulado 10 €) | — | Elite |

- `/caminho`: as três portas numa página, ligada a partir de `/gratis` e do ecrã de sucesso de
  cada freebie.
- O ecrã de sucesso dos guias grátis mostra o passo seguinte do perfil (era Premium + Membro para
  toda a gente).
- Os emails do pipeline (padrão e GoldKiller) acabam com o degrau de entrada para quem recusa a
  mensalidade, em vez de só «fico por aqui».
- O closer das DMs e o funil do Telegram recebem `caminhosNumaLinha()` e a condição real do trial.
- O trial diz-se sempre por `TRIAL_CURTO` / `TRIAL_CONDICAO`, que seguem o `TRIAL_PEDE_CARTAO`.
- Guarda: `npx tsx lib/__tests__/escada-caminhos.check.ts`.

## O que fica para o público virtual (MiroFish)

Corre em paralelo e afina, não bloqueia. Testes na fila (`publico_virtual_testes`):
`fa0e12a4` (os três desenhos da escada), `5628e3c4` (35 € vs 65 €), `99b8b5c3` (rota corretora).
Quando chegarem os relatórios, a ordem dos caminhos muda em `CAMINHO_DO_PERFIL`, num sítio só.

Preços de produtos pagos existentes não foram alterados.
