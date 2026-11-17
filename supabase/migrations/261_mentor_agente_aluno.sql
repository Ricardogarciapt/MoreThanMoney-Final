-- 261 · Mentor MTM como agente pessoal de cada aluno (17/11, revisão pedida pelo Ricardo).
--
-- · mentor_profiles ganha o que o Mentor sabe do aluno (objetivo, tempo, fase, língua, memória).
--   As colunas de network marketing (target_rank, current_rank, pe_*, cv_*) ficam por agora para não
--   partir apps antigas, mas já ninguém as escreve nem lê. Remover numa migração futura.
-- · mentor_mensagens: a conversa (o aluno lê e apaga a sua; só o servidor escreve).
-- · mentor_sinais: o que a gestão usa (dúvidas para as reuniões de educação, bloqueios para
--   follow-up, interesse em upgrade, pedidos de testemunho). Só servidor/admin.
-- · mentor_teste_populacao: o teste de ~1200 personas sintéticas contra o prompt do Mentor.
--
-- RGPD: base legal = execução do serviço (acompanhamento) + interesse legítimo (melhorar a
-- formação); o aluno é informado no ecrã do Mentor e pode apagar tudo. Retenção: 12 meses
-- (limpeza em `mentor_limpar_antigos()`). Testemunhos só com consentiu = true e confirmação humana.

alter table public.mentor_profiles
  add column if not exists objetivo text,
  add column if not exists tempo_diario text,
  add column if not exists fase_trading text,
  add column if not exists idioma text,
  add column if not exists memoria text,
  add column if not exists ultima_conversa_em timestamptz;

alter table public.mentor_profiles alter column target_rank drop not null;
alter table public.mentor_profiles alter column target_rank drop default;
alter table public.mentor_profiles alter column current_rank drop not null;
alter table public.mentor_profiles alter column current_rank drop default;

create table if not exists public.mentor_mensagens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  idioma text,
  por_botao boolean not null default false,
  fornecedor text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mentor_mensagens_user on public.mentor_mensagens(user_id, created_at desc);

alter table public.mentor_mensagens enable row level security;
drop policy if exists mentor_mensagens_select_own on public.mentor_mensagens;
create policy mentor_mensagens_select_own on public.mentor_mensagens
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists mentor_mensagens_delete_own on public.mentor_mensagens;
create policy mentor_mensagens_delete_own on public.mentor_mensagens
  for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.mentor_sinais (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mensagem_id uuid references public.mentor_mensagens(id) on delete set null,
  tipo text not null check (tipo in ('duvida_educativa','bloqueio','emocao','risco','interesse_upgrade',
    'pedido_humano','resultado','testemunho_possivel','feedback_produto')),
  tema text,
  resumo text,
  consentiu boolean,
  idioma text,
  tratado boolean not null default false,
  tratado_por text,
  created_at timestamptz not null default now()
);
create index if not exists idx_mentor_sinais_tipo on public.mentor_sinais(tipo, created_at desc);
create index if not exists idx_mentor_sinais_user on public.mentor_sinais(user_id, created_at desc);
alter table public.mentor_sinais enable row level security; -- sem políticas: só service role

create table if not exists public.mentor_teste_populacao (
  id uuid primary key default gen_random_uuid(),
  lote text not null,
  persona jsonb not null,
  conversa jsonb,
  avaliacao jsonb,
  estado text not null default 'pendente' check (estado in ('pendente','feito','falhou')),
  erro text,
  created_at timestamptz not null default now(),
  feito_em timestamptz
);
create index if not exists idx_mentor_teste_lote on public.mentor_teste_populacao(lote, estado);
alter table public.mentor_teste_populacao enable row level security; -- só service role

create or replace function public.mentor_limpar_antigos() returns void
language sql security definer set search_path = public as $$
  delete from public.mentor_mensagens where created_at < now() - interval '12 months';
  delete from public.mentor_sinais where created_at < now() - interval '12 months' and coalesce(consentiu, false) = false;
$$;
revoke all on function public.mentor_limpar_antigos() from public, anon, authenticated;
