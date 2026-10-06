-- 192 — Marketplace: categoria «Produtos» (tipo 'produto'), para produtos físicos de terceiros com
-- checkout externo (06/10: Solana Seeker, vendedor MoreThanMoney).
alter table public.marketplace_produtos drop constraint if exists marketplace_produtos_tipo_check;
alter table public.marketplace_produtos add constraint marketplace_produtos_tipo_check
  check (tipo = any (array['curso','mentoria','masterclass','ea','servico','personalizavel','merchandise',
                           'produto','aplicacao','subscricao','ebook','comunidade','outro']));
