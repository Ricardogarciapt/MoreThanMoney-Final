-- 266 · Cupões: fechar a leitura pública, repor usos em falta e manter o contador certo (19/11/2026)
--
-- 1. A política `service_read_coupons` (SELECT, roles public, USING true) deixava QUALQUER pessoa
--    com a chave anónima do site listar todos os cupões — incluindo MTMFOUNDER (100 % para sempre)
--    e os códigos de uso único MTM-APP-*. O service role não precisa dela (ignora o RLS), e
--    nenhum código do browser lê a tabela: toda a validação passa por /api/coupons/validate.
drop policy if exists service_read_coupons on public.coupons;

-- A vista de resgates junta nome e email: só admins (pelo RLS das tabelas) e nunca a chave anónima.
revoke select on public.v_coupon_redemptions from anon;

-- 2. Usos que nunca foram gravados: quem pagou com cupão no Stripe ou na Apple ficava com
--    `profiles.coupon_code` mas sem linha em `coupon_usages` (17 perfis com cupão, 4 usos).
--    Os limites de usos contam `coupon_usages` — sem isto, um cupão de uso único já gasto
--    parecia novo.
insert into public.coupon_usages (coupon_id, user_id, used_at, context)
select c.id, p.id, coalesce(p.created_at, now()), 'reposto_19_11'
from public.profiles p
join public.coupons c on c.code = upper(regexp_replace(p.coupon_code, '\s+', '', 'g'))
join auth.users u on u.id = p.id
where coalesce(p.coupon_code, '') <> ''
  and not exists (
    select 1 from public.coupon_usages x where x.coupon_id = c.id and x.user_id = p.id
  );

-- 3. `used_count` passa a ser um espelho de `coupon_usages` (nunca subia sozinho). Quem manda
--    continua a ser a contagem — o contador só serve para o painel e relatórios lerem.
create or replace function public.cupoes_atualizar_used_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  alvo uuid := coalesce(new.coupon_id, old.coupon_id);
begin
  update public.coupons
     set used_count = (select count(*) from public.coupon_usages where coupon_id = alvo)
   where id = alvo;
  return null;
end;
$$;

revoke all on function public.cupoes_atualizar_used_count() from public, anon, authenticated;

drop trigger if exists trg_cupoes_used_count on public.coupon_usages;
create trigger trg_cupoes_used_count
after insert or delete or update of coupon_id on public.coupon_usages
for each row execute function public.cupoes_atualizar_used_count();

update public.coupons c
   set used_count = (select count(*) from public.coupon_usages u where u.coupon_id = c.id);

-- 4. Cupões com data de fim passada deixam de estar ativos (o cron diário mantém isto).
update public.coupons
   set is_active = false, updated_at = now()
 where is_active and valid_until is not null and valid_until < now();
