-- O LIVRO DE VENDAS PASSA A SABER QUEM TROUXE A VENDA.
--
-- ═══ O DEFEITO, MEDIDO ═══════════════════════════════════════════════════════════════════════
--
-- A 01/10 a primeira passagem real da equipa de agentes mediu receita VERDADEIRA e atribuiu ZERO.
--
--   select (select count(*) from marketplace_compras) compras,   -- 0
--          (select count(*) from vendas_vendas)       vendas,    -- 2
--          (select sum(valor_cents)/100.0 from vendas_vendas) eur; -- 35.00
--
-- `lib/agentes/receita.ts` lê duas fontes. `marketplace_compras.agente_codigo` traz o código NA
-- LINHA DA COMPRA — ligação exacta — e está VAZIA. `vendas_vendas` é o livro canónico, tem a
-- receita toda, e **não tinha coluna de código nenhuma**: o código tinha de ser adivinhado pelo
-- `profiles.coupon_code` do comprador, que é por PESSOA, é sobrescrito pelo último código que ela
-- usar, e nos 135 perfis só existe em 12 — todos cupões de DESCONTO, que a forma de um código de
-- agente recusa de propósito.
--
-- Ou seja: o caminho forte estava vazio e o caminho fraco não servia. Toda a receita real caía em
-- «sem_codigo», e a régua das 48 h (`lib/agentes/vida.ts`) preparava-se para parar a equipa
-- inteira — por falta de MEDIÇÃO, não de trabalho. O motivo escrito em cada linha ia parecer
-- perfeitamente sólido a quem o lesse meses depois. Levantado em
-- `docs/maquina-de-vendas-autonoma.md` §2.8 e §6, recomendação nº 1.
--
-- ═══ PORQUE É QUE ISTO É UMA COLUNA PRÓPRIA E NÃO O CAMPO DO CUPÃO ═══════════════════════════
--
-- Pela mesma razão que já está escrita em `lib/agentes/atribuicao.ts`, e que custa dinheiro a quem
-- compra: o checkout aceita UM cupão e vale o maior desconto. Um código de agente vale 0% de
-- desconto; se ocupasse o campo do cupão, quem tivesse um desconto a sério ficava sem ele e pagava
-- o preço inteiro por ter entrado por um link de agente. Medição não se troca por margem do
-- cliente.
--
-- ═══ CINCO PORTAS, E UMA ESQUECIDA PERDE RECEITA EM SILÊNCIO ═════════════════════════════════
--
-- A coluna não vale nada sozinha. Quem escreve no livro são cinco caminhos
-- (`registarVendaConfirmada`, em `lib/vendas/livro.ts`):
--
--   1. app/api/stripe/webhook/route.ts        — o site
--   2. app/api/apple/iap/validate/route.ts    — a app a confirmar a compra
--   3. app/api/apple/iap/webhook/route.ts     — as notificações da Apple
--   4. app/api/admin/vendas/vendas/route.ts   — o lançamento manual
--   5. lib/marketplace/venda-equipa.ts        — o marketplace
--
-- Uma porta que não passe o código não dá erro: dá uma venda com `agente_codigo` nulo, que se lê
-- como «não houve agente nenhum». É o MESMO defeito de §4 do documento, visto de outro sítio. Por
-- isso a guarda `lib/agentes/portas-receita.check.ts` lê as cinco e falha quando uma delas deixa
-- de alimentar a coluna.
--
-- ═══ O QUE ESTA MIGRAÇÃO NÃO FAZ ═════════════════════════════════════════════════════════════
--
-- Não escreve código nenhum em vendas futuras (isso é das portas) e não adivinha donos de vendas
-- antigas. A única excepção é o lançamento de atribuição no fim deste ficheiro, que é uma DECISÃO
-- DO DONO declarada e não uma inferência do código.

alter table public.vendas_vendas
  add column if not exists agente_codigo text;

-- A forma é a mesma de toda a casa (`pareceCodigoDeAgente`, em `lib/agentes/atribuicao.ts`, e o
-- mesmo CHECK da migração 168 em `social_scheduled_posts`). Sem isto, um `agente_codigo =
-- 'BLACKFRIDAY50'` entrava pela base e creditava a receita de uma campanha de descontos a um
-- agente que não fez nada — e a régua de vida salvava-o com dinheiro que não era dele.
alter table public.vendas_vendas
  drop constraint if exists vendas_vendas_agente_codigo_forma;
alter table public.vendas_vendas
  add constraint vendas_vendas_agente_codigo_forma
  check (agente_codigo is null or agente_codigo ~ '^(AG|CEO)-[A-Z0-9]{2,24}$');

-- A pergunta do painel e do cron é sempre «quanto é que este código trouxe desde quando». Parcial
-- porque a esmagadora maioria das linhas não tem código e não há nada a indexar nelas.
create index if not exists vendas_vendas_agente_codigo_idx
  on public.vendas_vendas (agente_codigo, pago_em desc)
  where agente_codigo is not null;

comment on column public.vendas_vendas.agente_codigo is
  'Código do agente que trouxe esta venda (lib/agentes/atribuicao.ts). Ligação FORTE: está na linha da venda. NULL = por atribuir, e lê-se como «sem código» — nunca cai no CEO por omissão. Alimentada pelas cinco portas de registarVendaConfirmada; guarda em lib/agentes/portas-receita.check.ts.';

-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- OS 35 € EXISTENTES FICAM DO CEO — DECISÃO DO DONO, 01/10
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Palavras dele: «decido que ele [o CEO] tem a receita de 35€». Isto é um lançamento de
-- atribuição, assumido por uma pessoa, e não uma dedução do código: ninguém sabe nem pode saber
-- que link trouxe estas duas vendas, porque não existia link de agente nenhum quando elas
-- aconteceram. É exactamente a diferença que `lib/agentes/receita.ts` defende no cabeçalho —
-- receita que não é atribuível não se inventa NEM SE DIVIDE; o que se pode é um humano decidir de
-- quem ela é, por escrito e com rasto.
--
-- Só as vendas ANTERIORES a esta migração, e só as que não têm já código. Sem o `is null` e sem o
-- limite de data, uma segunda passagem desta migração pisava o código legítimo de vendas futuras —
-- e isso é receita roubada a um filho e dada ao pai.
--
-- E NÃO se soma a receita dos filhos ao pai: já foi rejeitado, porque contá-la duas vezes faz o
-- topo parecer rentável com dinheiro de outros e salva-o com uma conta falsa. `CEO-MTM` recebe só
-- o que é declaradamente dele.
update public.vendas_vendas
set agente_codigo = 'CEO-MTM'
where agente_codigo is null
  and estornada_em is null
  and pago_em < now();

-- O rasto da decisão, no livro dos agentes. Um lançamento humano sem registo é indistinguível de
-- um número que o código inventou — e seis meses depois ninguém sabe qual dos dois foi.
--
-- Tipo `avaliado` e NÃO `receita`, de propósito: os eventos de tipo `receita` são o que a janela
-- das 48 h soma (`lib/agentes/motor.ts`, `somarJanela`), e são escritos pelo cron com a DIFERENÇA
-- que ele próprio mediu. Um evento `receita` escrito aqui contava o mesmo dinheiro duas vezes
-- dentro da janela e dava ao CEO lucro que não existe. O dinheiro entra pela coluna da venda; esta
-- linha é só a explicação de quem decidiu e porquê.
insert into public.agentes_eventos (agente_id, tipo, detalhe)
select e.id,
       'avaliado',
       'Atribuição lançada à mão pelo dono (01/10/2026): a receita que já existia no livro de '
       || 'vendas passa a ser do CEO. Não foi medida por nenhum link — não existia link de agente '
       || 'quando essas vendas aconteceram. Fica assim declarado em vez de ficar «por atribuir», '
       || 'porque a decisão é do dono; o que o código NÃO faz é inferir isto sozinho, nem somar a '
       || 'receita dos filhos ao pai.'
  from public.agentes_equipa e
 where e.nome = 'CEO';
