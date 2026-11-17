# Desenho de interfaces e AIOS

> Movido do CLAUDE.md a 17/11/2026 para poupar tokens: só se lê quando a tarefa precisa.

## Desenho de interfaces — as skills mandam, a marca manda mais

Qualquer trabalho que alguém vá OLHAR — uma página, um ecrã da app, um painel de admin, o AIOS, um
email com aspecto — carrega a skill antes de escrever código:

| quando | skill |
|---|---|
| Ponto de partida de qualquer UI nova ou redesenho | `ui-ux-pro-max` |
| Páginas públicas onde o aspecto É o produto (landings, /agendar, /marketplace) | `design-taste-frontend` |
| Animação, transições, micro-interacções, ou auditar motion que já existe | `design-motion-principles` |
| Mexer num ecrã que já funciona sem lho partir | `redesign-existing-projects` |
| Tokens, identidade, sistema de design | `design-system`, `brand` |

Referências visuais em `~/claude-library/awesome-claude-design`.

### O que NUNCA se troca por gosto de uma skill

· **Ouro sobre carvão**: `#D2A63C` (ouro), `#E9C46A` (ouro claro), fundo quase preto. A paleta do
  AIOS é a mesma família com o fundo mais frio (`#050810`). Uma skill que sugira creme e terracota
  está a sugerir outra marca.
· **Nenhum número de desempenho inventado.** A prova desta casa mede-se em pips e tem origem
  declarada — ver `docs/mtm-sales-brain.md`.
· **O que o projecto já tem ganha à skill**: procura tokens e componentes antes de criar novos.
· **Não se nomeia a plataforma** onde vivem os cursos nas páginas públicas.

### O AIOS, em concreto

`app/aios/page.tsx` são 60 linhas que só verificam se és admin e desenham um **iframe** para
`public/aios/index.html` — 551 linhas de HTML solto, a valer por aplicação inteira. Duas coisas a
saber antes de lhe tocar:

· **Não é React.** Nenhuma skill que gere componentes serve aqui sem primeiro decidir se o AIOS
  passa a ser React ou continua HTML. Decidir isso a meio de um redesenho é como se parte o que
  funciona.
· **Vive em `public/`**, ou seja o ficheiro é servido cru. O `middleware.ts` fecha `/aios` a
  admins, mas `/aios/index.html` é um ficheiro estático — qualquer alteração que lhe meta dados
  sensíveis lá dentro fica ao alcance de quem souber o endereço.


