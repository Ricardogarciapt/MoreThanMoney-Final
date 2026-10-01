# O backoffice, como está mesmo (01/10/2026)

Briefing para quem for melhorar `backoffice.morethanmoney.pt/backoffice`. Os números abaixo foram
medidos na base de produção neste dia, não estimados.

## O retrato que muda as prioridades

| | |
|---|---|
| Negócios | **111** — e **106 ainda em «lead»** (95%) |
| Movidos | 1 contactado · 1 qualificado · 1 no-show · 2 ganhos |
| Tarefas | **301** — 278 abertas, **todas atrasadas**, 4 feitas, 19 canceladas |
| Tarefas por papel | prospector 269 · closer 30 · setter 2 |
| Equipas | `backoffice_equipas` e `backoffice_equipa_membros` **vazias** |
| Atribuições | **0 negócios com closer**, 2 com setter |
| Comissões | `vendas_comissoes` **vazia** |

**A leitura honesta:** o backoffice não falha por falta de funcionalidades. Falha porque o trabalho
é criado e não é feito. 278 tarefas abertas criadas entre 26/09 e 01/10, **todas** fora do prazo, e
quatro concluídas. Acrescentar ecrãs a este estado acrescenta sítios onde não se faz nada.

Três coisas valem mais do que qualquer funcionalidade nova:

1. **Por que é que 278 tarefas nascem atrasadas?** Ou os prazos são irrealistas (nascem com prazo
   no próprio dia) ou ninguém abre o ecrã. São problemas opostos com soluções opostas — medir antes
   de desenhar.
2. **Ninguém tem dono.** Zero closers atribuídos em 111 negócios. Um pipeline sem dono é uma lista.
3. **As equipas não existem na base.** «Gerir com os team leaders» não tem onde assentar: as duas
   tabelas estão a zero.

## O gargalo físico: só 13% têm telefone

| Canal | Quantos dos 111 |
|---|---|
| Email | 100 |
| **Telefone** | **15** |
| Telegram | 3 |
| Instagram | 1 |
| Sem contacto nenhum | 1 |

Qualquer desenho assente em «o closer liga ao lead» está a falar de 15 pessoas. O canal que existe
é o email — e um pipeline de email trabalha-se de outra maneira (sequências, não chamadas).

Se o objectivo é pôr os closers ao telefone, o trabalho a montante é **recolher telefones**, e isso
decide-se nos formulários e no funil, não neste painel.

## O que já existe (não reconstruir)

**Páginas** — `app/backoffice/`:
`page.tsx` (o dia), `pipeline/` (page, novo, mover, pegar, trabalhar, historico), `equipa/`,
`extracto/`, `ib/`, `material/`, e `_partes/` (navegar, o-meu-dia, blocos, acesso, copiar, telegram).

**Rotas** — `app/api/backoffice/`: `eu`, `ib`, `material`, `negocios`, `tarefas`, `telegram`.

**Decisões puras já escritas e provadas** — `lib/vendas/`:
`atribuicao` (quem fica com o negócio), `exclusividade`, `calculo` e `escada-ranks` (comissões),
`extracto`, `regras`, `livro`, `fecho-ranks`. Cada uma tem `.check.ts`. **Usa-as; não escrevas
segundas versões** — a regra duplicada é a que diverge e manda no caso difícil.

**Papéis**: `lib/backoffice-papeis.ts` + `backoffice_papeis` (4 linhas). A fechadura é do servidor:
lê o negócio, compara as cinco atribuições com o âmbito da pessoa e responde 404 a quem não
participa. O que o ecrã mostra ou esconde é só para não clicar no que vai ser recusado.

## O que preparei para ser usado (01/10)

### `lib/vendas/abordagem.ts` + `abordagem.check.ts`

A decisão que falta em cada negócio aberto: **por onde falo com esta pessoa e o que digo?**

- `caminhos(pessoa)` — todos os canais que **existem** para aquela pessoa, por ordem de quem
  responde mais. A ordem segue a origem do lead: quem veio do Instagram responde no Instagram e
  ignora emails. O WhatsApp vem antes da chamada — a mensagem espera, a chamada interrompe.
- `proximoPasso(pessoa)` — a acção, o canal, o motivo escrito e uma urgência de 0 a 1000 para
  ordenar o dia. Quem **respondeu** passa à frente de quem nunca foi tocado; insistir antes de 2
  dias devolve «Esperar», com a razão; ao fim de 4 tentativas devolve «Última mensagem e arquivar».
  Sem canal nenhum devolve «Encontrar um contacto antes de mais» em vez de uma sugestão impossível.
- `OBJECCOES` e `objeccaoDe(texto)` — oito objeções com **o que está por trás** e **o que fazer**.
  Nenhuma resposta sugere inventar números: a da confiança obriga a dar a prova com origem
  declarada e em pips, e a do risco proíbe prometer que não se perde. O check falha se alguma
  resposta prometer ganhos.

Tudo puro: sem base de dados e sem rede, para o teu ecrã poder chamá-las do servidor ou do browser.

## Regras da casa que se aplicam a este trabalho

- **Nunca inventar números.** Nem no ecrã, nem nas sugestões de resposta, nem em gráficos de
  previsão. A prova desta casa é em pips e com origem declarada.
- **Decisões que erram em silêncio vão para um módulo puro com `.check.ts`.** Ordenar uma lista de
  trabalho pela regra errada não dá erro — dá leads que não fecham.
- **Ouro `#D2A63C` sobre carvão.** A paleta não é escolha de cada ecrã.
- Português de Portugal em tudo o que a equipa lê.
- Antes de propor «IA sempre presente»: a IA que sugere tem de dizer **de onde tirou** o que diz. Um
  painel que afirma sem mostrar a fonte ensina a equipa a não confiar nele — e aí deixa de ser lido.

## Onde não mexer sem avisar

`lib/vendas/*.ts` já existentes (têm guardas e são usados pelo extracto e pelas comissões),
`lib/backoffice-papeis.ts` (é a fechadura), e as migrações de `supabase/migrations/127..141`, que
são o modelo de papéis, equipas e comissões.
