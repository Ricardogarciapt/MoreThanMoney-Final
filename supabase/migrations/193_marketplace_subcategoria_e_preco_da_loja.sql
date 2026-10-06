-- 193 — Marketplace: subcategoria (ex.: «Tech Crypto» dentro de «Produtos») e o preço que se
-- actualiza sozinho a partir da loja oficial (06/10: Solana Seeker + carteiras Ledger).
--
-- subcategoria       texto curto, livre; a lista que o site oferece vive em lib/marketplace/regras.ts.
-- preco_fonte_url    página da loja de onde o cron /api/cron/marketplace-precos lê o preço.
--                    NÃO é o link de compra (esse é checkout_externo_url, com o código de afiliado).
-- preco_lido_em      última leitura com sucesso.
-- preco_base_cents   o «antes» que a loja mostra quando há promoção (compare-at). Nulo = sem promoção.
-- preco_erro(_em)    última leitura falhada/recusada; o preço fica o último bom.
alter table public.marketplace_produtos
  add column if not exists subcategoria text,
  add column if not exists preco_fonte_url text,
  add column if not exists preco_lido_em timestamptz,
  add column if not exists preco_base_cents integer,
  add column if not exists preco_erro text,
  add column if not exists preco_erro_em timestamptz;

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_subcategoria_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_subcategoria_check
  check (subcategoria is null or char_length(subcategoria) between 1 and 40);

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_preco_fonte_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_preco_fonte_check
  check (preco_fonte_url is null or preco_fonte_url ~ '^https://');

alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_preco_base_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_preco_base_check
  check (preco_base_cents is null or preco_base_cents >= 0);

-- O primeiro produto da categoria: o Seeker passa a «Tech Crypto» e a ter fonte de preço.
-- A loja mostra 500 USD riscado e 250 USD (campanha de 50%); o preço vem do __NEXT_DATA__ da página.
update public.marketplace_produtos
   set subcategoria = 'Tech Crypto',
       preco_fonte_url = 'https://store.solanamobile.com',
       preco_base_cents = 50000
 where slug = 'solana-seeker';
