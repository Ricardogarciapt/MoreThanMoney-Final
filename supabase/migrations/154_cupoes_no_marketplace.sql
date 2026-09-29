-- OS CUPÕES DA CASA PASSAM A VALER NO MARKETPLACE.
--
-- ── O QUE FOI MEDIDO ANTES DE ESCREVER ISTO ───────────────────────────────────────────────
--
-- `public.coupons` tem 32 linhas vivas e já serve QUATRO negócios: packs do site, MTM Funded
-- (`plan_override = 'mtmfunded'`), ofertas de parceria (`type = 'partnership'`, 5 linhas, 3 delas a
-- dar VIP) e as ofertas do Apple IAP (`apple_offer_id`). O consumo é registado em
-- **`public.coupon_usages`** — e não em `coupon_redemptions`, que NÃO EXISTE nesta base de dados
-- (nem como tabela nem como vista; está confirmado no catálogo). Quem for atrás desse nome não
-- encontra nada.
--
-- Isto é uma EXTENSÃO dessa tabela, não um sistema ao lado. O `plan_override = 'marketplace'` segue
-- exactamente o caminho que o MTM Funded já abriu com `'mtmfunded'`.
--
-- ── O QUE FALTAVA, E PORQUE É COLUNA E NÃO CONVENÇÃO ──────────────────────────────────────
--
-- 1. ÂMBITO DE PRODUTO. `plan_override` é um texto único a fazer de âmbito para quatro negócios;
--    não consegue dizer «20% NESTE curso». Sem isto, um cupão de marketplace vale em TODOS os
--    produtos de TODOS os educadores — e um educador a criar um cupão de 90% que desconta o produto
--    de outro não é um bug de configuração, é dinheiro tirado a uma pessoa.
--
--    Dois níveis, porque são duas perguntas reais: «só neste produto» e «em tudo o que é deste
--    educador» (a segunda é a campanha que um educador quer fazer à loja dele).
--
-- 2. O DESCONTO SAI DA VENDA. Decidido pelo dono, e por isso NÃO é uma coluna.
--
--    Um produto de 100 € com 95% para o educador e um cupão de 20%: o cliente paga 80, a base da
--    partilha é 80, e o educador recebe 95% de 80 = 76. A casa fica com 4. A casa não cobre a
--    diferença.
--
--    Houve a tentação de pôr aqui uma coluna `desconto_suportado_por` com 'venda' e 'casa'. Ficou
--    fora, e é melhor dizer porquê do que deixar a ideia voltar: com uma partilha de 95%, a casa só
--    tem 5% de margem. Um desconto de 20% suportado pela casa daria 95 ao educador sobre uma venda
--    de 80 — ou seja, `parte_casa_cents` = −15. A coluna tem `check (>= 0)`, logo a linha nem se
--    grava: a base de dados recusa a venda inteira, e o comprador paga sem receber. Um regime que
--    só funciona enquanto o desconto for menor que 5% não é um regime — é uma armadilha.
--
--    Por isso há UM caminho, o que fecha sempre. Se um dia o dono quiser a casa a suportar
--    descontos, o que tem de mudar primeiro é aquele `check`, e isso é uma decisão de contabilidade.
--
--    O que a compra passa a GRAVAR é o preço de tabela e o desconto, para o extracto do educador
--    poder explicar porque é que ele recebeu 76 e não 95 — sem isso, a única leitura possível da
--    linha é «a casa pagou-me menos do que devia».
--
-- 3. QUEM CRIOU O CUPÃO. `created_by` aponta para `profiles`, e um educador NÃO é um perfil do site
--    (tem sessão própria, e `lms_educators.profile_id` está preenchido em 1 dos 5). Sem uma coluna
--    própria, um cupão criado por um educador ficava sem autor identificável — e é precisamente o
--    autor que a guarda precisa de conhecer para impedir que ele desconte o produto de outro.
--
-- ── O QUE NÃO SE ALTERA ───────────────────────────────────────────────────────────────────
--
-- Nem uma linha das 32 existentes. Todas as colunas novas nascem nulas ou com o valor que reproduz
-- o comportamento de hoje, e o `check` do `plan_override` NÃO é tocado (a coluna em produção já não
-- tem o `check` da 037: aceita 'mtmfunded' e 'any', que a 037 não previa).
--
-- `used_count` continua a não mandar em nada. Está partido desde 25/09 — o contador nunca foi
-- incrementado, e há rotas vivas que ainda o lêem. O marketplace conta linhas em `coupon_usages`,
-- como o `lib/cupoes-usos.ts` decidiu.

-- ── Âmbito ────────────────────────────────────────────────────────────────────────────────

alter table public.coupons
  -- Null nos dois = vale em todo o marketplace (só para cupões com plan_override='marketplace').
  add column if not exists marketplace_produto_id uuid
    references public.marketplace_produtos(id) on delete cascade,
  add column if not exists marketplace_educator_id uuid
    references public.lms_educators(id) on delete cascade,
  -- Quem o criou, quando foi um educador. Null = foi a casa (e aí `created_by` diz quem).
  add column if not exists criado_por_educador uuid
    references public.lms_educators(id) on delete set null;

comment on column public.coupons.marketplace_produto_id is
  'Cupão restrito a UM produto do marketplace. Null = não restrito a um produto.';
comment on column public.coupons.marketplace_educator_id is
  'Cupão restrito aos produtos DESTE educador. É o que impede um educador de descontar o de outro.';

-- Um cupão de educador TEM de estar preso a alguém ou a um produto. Um cupão criado por um educador
-- sem âmbito nenhum é um cupão dele a descontar a loja toda — exactamente o caso que esta migração
-- existe para impedir. A guarda está no código (`lib/marketplace/cupoes.ts`) e fica também aqui,
-- porque uma guarda que vive só na aplicação é uma guarda que a próxima rota esquece.
alter table public.coupons drop constraint if exists coupons_educador_tem_ambito;
alter table public.coupons add constraint coupons_educador_tem_ambito
  check (
    criado_por_educador is null
    or marketplace_produto_id is not null
    or marketplace_educator_id is not null
  );

-- A pergunta do checkout é sempre «este código, para este produto». Sem índice, é uma varredura.
create index if not exists coupons_marketplace_produto_idx
  on public.coupons (marketplace_produto_id)
  where marketplace_produto_id is not null;
create index if not exists coupons_marketplace_educador_idx
  on public.coupons (marketplace_educator_id)
  where marketplace_educator_id is not null;

-- ── O consumo ─────────────────────────────────────────────────────────────────────────────
--
-- `coupon_usages` tem UNIQUE(coupon_id, user_id) — um cupão por pessoa. Serve como está e não se
-- mexe: é o que já garante que ninguém usa o mesmo código duas vezes.
--
-- O que falta é saber A QUE COMPRA um uso corresponde, para o dia em que um educador perguntar
-- «quantas das minhas vendas foram com desconto». O `context` já existe e é texto livre (a rota do
-- MTM Funded escreve 'mtmfunded_desafio' lá); o marketplace escreve 'marketplace' e guarda a compra
-- na coluna nova.

alter table public.coupon_usages
  add column if not exists marketplace_compra_id uuid
    references public.marketplace_compras(id) on delete set null;

create index if not exists coupon_usages_marketplace_compra_idx
  on public.coupon_usages (marketplace_compra_id)
  where marketplace_compra_id is not null;

-- ── A campanha automática do produto continua a existir, e não é a mesma coisa ─────────────
--
-- A 153 pôs `campanha_pct` no produto: um desconto AUTOMÁTICO, sem código, para quem tem um tier
-- (é o «preço de membro», que aparece já descontado). Um cupão é o contrário: um CÓDIGO que alguém
-- escreve. São duas interacções diferentes e o dono pediu as duas ("campanhas de desconto para
-- membro de x%" e "integra com as nossas políticas de cupões").
--
-- NÃO SE SOMAM. Quando as duas se aplicam à mesma compra, vale a MAIOR e a outra é ignorada — nunca
-- 20% + 30% = 50%. É a mesma doutrina do MTM Funded, que recusa empilhar cupão sobre um programa em
-- campanha. A regra vive em `lib/marketplace/cupoes.ts` e está presa por guarda.

-- ── A compra passa a explicar-se ──────────────────────────────────────────────────────────
--
-- «Grava na compra o bruto, o desconto e a base — para o extracto do educador mostrar porque é que
-- recebeu 76 e não 95.» É isto.
--
-- `bruto_cents` já existe e é o que o cliente PAGOU (80). O que faltava era o contexto: sem o preço
-- de tabela e o desconto na mesma linha, a única leitura possível de uma venda descontada é «a casa
-- pagou-me menos do que devia» — e o educador não tem como descobrir que houve um cupão.
--
-- O código do cupão fica como TEXTO e não só como chave estrangeira. Um cupão apagado não pode
-- apagar a explicação de uma venda antiga: é a mesma razão por que `parte_educador_pct` é copiada
-- para a linha em vez de ser lida do acordo actual.

alter table public.marketplace_compras
  -- O preço de tabela no momento da venda. Igual a `bruto_cents` quando não houve desconto.
  add column if not exists preco_tabela_cents integer not null default 0
    check (preco_tabela_cents >= 0),
  add column if not exists desconto_cents integer not null default 0
    check (desconto_cents >= 0),
  add column if not exists desconto_pct numeric(5,2) not null default 0
    check (desconto_pct >= 0 and desconto_pct <= 90),
  add column if not exists cupao_id uuid references public.coupons(id) on delete set null,
  add column if not exists cupao_codigo text,
  -- Quem indicou a venda. `profiles` e não texto: a comissão paga-se a uma pessoa, e um username
  -- que muda não pode desligar uma comissão do seu beneficiário.
  add column if not exists referral_id uuid references public.profiles(id) on delete set null,
  add column if not exists referral_codigo text,
  -- Escrita pelo trigger mais abaixo quando ele tem de limpar um referral indevido. Sem ela, a
  -- limpeza era silenciosa e ninguém percebia porque é que a comissão não apareceu.
  add column if not exists nota_referral text;

comment on column public.marketplace_compras.preco_tabela_cents is
  'O preço sem desconto. bruto_cents e o que foi pago. A diferenca esta em desconto_cents.';
comment on column public.marketplace_compras.referral_id is
  'Quem indicou a venda, se alguem. NUNCA pode ser o educador do proprio produto: e auto-pagamento.';

create index if not exists marketplace_compras_referral_idx
  on public.marketplace_compras (referral_id, pago_em desc)
  where referral_id is not null;

-- ── O EDUCADOR NÃO PODE SER REFERRAL DE SI PRÓPRIO ────────────────────────────────────────
--
-- Regra do dono, e fica presa no esquema e não só no código.
--
-- PORQUE: o educador já recebe 95% da venda pela partilha. Somar-lhe a comissão de referral era
-- pagar-lhe duas vezes pela mesma venda — e, ao contrário de um erro de arredondamento, este
-- escalava: bastava ele pôr o próprio código em todas as compras dos alunos dele.
--
-- A comparação é entre `referral_id` (um perfil do site) e o educador da venda. Como um educador não
-- é um perfil — tem sessão própria, e `lms_educators.profile_id` só está preenchido em 1 dos 5 — a
-- ligação faz-se pela coluna `profile_id` desse educador, e é por isso que isto é um trigger e não
-- um `check` (um `check` não pode consultar outra tabela).
--
-- A guarda do código (`lib/marketplace/referral.ts`) recusa ANTES de cobrar, que é onde a pessoa
-- ainda pode ser avisada. Isto aqui é a rede por baixo: se um caminho novo esquecer a verificação,
-- a venda não fica gravada com auto-pagamento — fica gravada sem referral.

create or replace function public.marketplace_referral_nao_e_o_proprio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  perfil_do_educador uuid;
begin
  if new.referral_id is null or new.educator_id is null then
    return new;
  end if;

  select profile_id into perfil_do_educador
  from public.lms_educators
  where id = new.educator_id;

  if perfil_do_educador is not null and perfil_do_educador = new.referral_id then
    -- Limpa em vez de rebentar: a venda é real e o dinheiro entrou. Recusar a linha aqui deixava o
    -- comprador a pagar sem receber, por causa de um código mal posto. O que se perde é a comissão
    -- indevida, e fica a nota escrita na própria linha.
    new.referral_id := null;
    new.nota_referral := 'Referral removido: o educador não pode ser referral de si próprio.';
  end if;

  return new;
end;
$$;

drop trigger if exists marketplace_compras_referral_proprio on public.marketplace_compras;
create trigger marketplace_compras_referral_proprio
  before insert or update on public.marketplace_compras
  for each row execute function public.marketplace_referral_nao_e_o_proprio();

-- Esta função é `security definer` porque lê `lms_educators`, que está fechada a `authenticated`.
-- `search_path` fixado, e EXECUTE revogado ao público — a lição das funções definer que estavam
-- abertas a `PUBLIC` e davam admin a quem as chamasse (migrações 141/143 de Setembro).
revoke all on function public.marketplace_referral_nao_e_o_proprio() from public, anon, authenticated;
