-- 22/11/2026, Ricardo: técnica «rascunho duplicado». Cada reel sai primeiro como reel de teste; a cópia
-- fica guardada como «reserva» (status 'reserva', reserva_de = id do teste). Se o teste viralizar, a
-- reserva publica-se normal, para os seguidores. lib/instagram/teste-reserva.ts
alter table social_scheduled_posts add column if not exists reserva_de uuid references social_scheduled_posts(id) on delete set null;
create index if not exists social_posts_reserva_de on social_scheduled_posts(reserva_de) where reserva_de is not null;
