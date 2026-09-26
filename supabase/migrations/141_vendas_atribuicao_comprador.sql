-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- LIGAR OS NEGÓCIOS AO COMPRADOR — para um pagamento voltar a encontrar quem o trabalhou.
--
-- O QUE ESTAVA MAL
-- A 26/09 havia 97 negócios em `vendas_negocios` e `comprador_id` estava a NULL em todos os 97 —
-- incluindo 80 cuja `chave_origem` é `perfil:<uuid>`, ou seja, com o id do perfil escrito por
-- extenso na própria linha. As duas portas do dinheiro (o livro das comissões e a regra da
-- exclusividade) procuravam o negócio do comprador SÓ por essa coluna. Resultado: nenhum pagamento
-- encontrava a equipa que o tinha trabalhado, e ninguém recebia.
--
-- O QUE ISTO FAZ E O QUE NÃO FAZ
-- Preenche IDENTIDADE: diz quem é o comprador daquele negócio. Não toca em `prospector_id`,
-- `setter_id`, `closer_id`, `team_leader_id` nem `afiliado_id` — não inventa vendedor nenhum, não
-- cria nem altera comissões, não recalcula nada (à data desta migração `vendas_vendas` e
-- `vendas_comissoes` estão as duas vazias, portanto não há histórico a reescrever).
--
-- E não é adivinhação: o uuid do perfil está literalmente na chave de origem, e no caso do email a
-- correspondência só é feita quando há EXACTAMENTE um negócio e EXACTAMENTE um perfil com aquele
-- email. Com dois candidatos não se escolhe — fica a NULL e vai a uma pessoa, porque escolher ao
-- palpite paga à pessoa errada e tira à outra, e isso não se desfaz com um deploy.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────

-- 1) O caminho certo: o id está na chave de origem.
update vendas_negocios n
set comprador_id = p.id
from profiles p
where n.comprador_id is null
  and n.chave_origem like 'perfil:%'
  and p.id::text = lower(substring(n.chave_origem from 8));

-- 2) O caminho do email, e só quando não há dúvida nenhuma dos dois lados.
--
-- O `not exists` gémeo é o que garante o «um para um»: se dois negócios abertos têm o mesmo email,
-- ou se duas contas do site têm o mesmo email, nenhum dos dois é ligado. Preferir o mais recente
-- seria uma decisão de quem recebe, e essa não é do SQL.
update vendas_negocios n
set comprador_id = p.id
from profiles p
where n.comprador_id is null
  and n.email is not null
  and n.estado <> 'perdido'
  and lower(btrim(p.email)) = lower(btrim(n.email))
  and not exists (
    select 1 from vendas_negocios o
    where o.id <> n.id
      and o.estado <> 'perdido'
      and lower(btrim(o.email)) = lower(btrim(n.email))
  )
  and not exists (
    select 1 from profiles q
    where q.id <> p.id
      and lower(btrim(q.email)) = lower(btrim(n.email))
  );

-- 3) Os índices das três procuras que a atribuição faz a cada pagamento.
--
-- Sem eles, cada compra faz três varreduras da tabela no caminho quente do webhook do Stripe — e um
-- webhook lento é um webhook que a Stripe repete.
create index if not exists idx_vendas_negocios_comprador on vendas_negocios (comprador_id) where comprador_id is not null;
create index if not exists idx_vendas_negocios_chave_origem on vendas_negocios (chave_origem);
create index if not exists idx_vendas_negocios_email_lower on vendas_negocios (lower(email)) where email is not null;

-- 4) A vista que mostra o que se está a perder, para deixar de se perder às escuras.
--
-- Uma venda sem negócio é dinheiro que entrou sem ninguém identificado para receber. Pode ser
-- legítimo (compra directa pelo site, e nesse caso paga o MLM binário) ou pode ser uma falha de
-- atribuição. A diferença lê-se na `nota`/aviso e no email: se existe um negócio aberto com o email
-- do comprador e a venda continua sem negócio, é porque houve ambiguidade — e há alguém à espera.
-- `security_invoker` mais o `revoke` abaixo não são zelo a mais: uma vista no schema `public` é
-- servida pelo PostgREST, e esta traz emails e nomes. Sem isto, a chave anon do site lia a lista de
-- clientes — foi exactamente assim que as funções `SECURITY DEFINER` abertas ao público expuseram a
-- base antes. Só o service role (o admin e os webhooks) precisa de a ler.
create or replace view vendas_sem_atribuicao with (security_invoker = true) as
select
  v.id                as venda_id,
  v.fonte,
  v.referencia,
  v.pack,
  v.valor_cents,
  v.moeda,
  v.tipo,
  v.pago_em,
  v.comprador_id,
  p.email             as comprador_email,
  p.full_name         as comprador_nome,
  -- Quantos negócios abertos batem no email deste comprador. 0 = ninguém o trabalhou (o binário
  -- paga, está tudo bem). 2 ou mais = ambiguidade, e é aqui que uma pessoa tem de decidir.
  (
    select count(*) from vendas_negocios n
    where n.estado <> 'perdido'
      and n.email is not null
      and lower(btrim(n.email)) = lower(btrim(p.email))
  )                   as negocios_candidatos
from vendas_vendas v
left join profiles p on p.id = v.comprador_id
where v.negocio_id is null
  and v.estornada_em is null;

comment on view vendas_sem_atribuicao is
  'Vendas confirmadas sem negócio associado: dinheiro que entrou sem vendedor identificado. negocios_candidatos > 1 significa ambiguidade a precisar de decisão humana.';

revoke all on vendas_sem_atribuicao from anon, authenticated;
