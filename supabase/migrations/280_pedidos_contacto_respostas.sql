-- Respostas do formulário de um íman de leads (ex.: e-book grátis «O Método Frio»).
alter table public.pedidos_contacto add column if not exists respostas jsonb;
