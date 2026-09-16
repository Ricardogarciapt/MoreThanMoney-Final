-- 101 — QUEM OPERA A SALA «INTRODUÇÃO» (sem ser o educador dela)
--
-- A sala «Introdução» nasceu de propósito SEM educador: não há ninguém a dar a aula, há uma
-- playlist. Só que a operação de uma sala (ligar/desligar, chave do OBS) estava toda presa a
-- `educator_id` — e por isso ninguém a conseguia ligar.
--
-- A correção separa duas coisas que estavam coladas numa coluna só:
--   • QUEM APARECE — `educator_id`. É o formador mostrado no cartão da sala, no lobby e na app.
--     Na «Introdução» continua a null, como o dono pediu.
--   • QUEM OPERA — `operador_educator_id` (novo). Pode ligar a sala e ver a chave de ingestão,
--     sem passar a constar como formador em lado nenhum.
--
-- Nas salas normais fica a null e nada muda: quem opera continua a ser o educador da sala.
--
-- Aditiva e idempotente. NÃO APLICAR sem rever — a CHECK do fim recusa linhas que hoje não
-- existem, mas é uma recusa a sério (ver secção 3).
--
-- Carga (Supabase frágil): nada aqui é escrito por render. A coluna nova é lida na mesma query
-- que já traz a sala, e a marca de gravação muda uma vez por gravação.

begin;

-- ── 1. quem opera a sala ─────────────────────────────────────────────────────
alter table public.lms_streams
  add column if not exists operador_educator_id uuid references public.lms_educators(id) on delete set null,
  -- Estado que o studio mostra a quem opera uma sala de gravação. NÃO é «ao vivo»: é «a gravar».
  -- Vive numa coluna própria de propósito — se reaproveitássemos `live_started_at`, qualquer
  -- cliente que leia a tabela em bruto (a app iOS lê) podia interpretar a sala como uma sessão
  -- a decorrer, que é exactamente o que esta sala nunca pode parecer.
  add column if not exists gravacao_iniciada_em timestamptz;

-- Só se pergunta «que salas é que esta pessoa opera?»: índice parcial, minúsculo.
create index if not exists lms_streams_operador_idx
  on public.lms_streams (operador_educator_id) where operador_educator_id is not null;

comment on column public.lms_streams.operador_educator_id is
  'Quem pode ligar/desligar esta sala sem ser o educador dela (ex.: sala «Introdução», que não tem formador). Null nas salas normais.';
comment on column public.lms_streams.gravacao_iniciada_em is
  'Sala de gravação a gravar desde quando (null = parada). Nunca confundir com is_live — estas salas não vão ao ar.';

-- ── 2. a sala «Introdução» ───────────────────────────────────────────────────
-- O operador é o dono, pelo email do registo de educador (o id é estável, mas o email é que se
-- lê numa revisão). Se a conta não existir, o update não faz nada — não inventa operador.
--
-- `ingest_provider` passa a MTM direto: uma sala de gravação tem de publicar no NOSSO servidor
-- (SRS), porque é de lá que o DVR tira o ficheiro. Por Restream, o ficheiro nunca chegaria cá.
update public.lms_streams s
   set operador_educator_id = e.id,
       ingest_provider = 'mtm_direct'
  from public.lms_educators e
 where s.chave_sistema = 'introducao'
   and lower(e.email) = 'ricardogarciapt@proton.me'
   and s.operador_educator_id is distinct from e.id;

-- ── 3. a trava, agora também na base ─────────────────────────────────────────
-- As rotas já recusam ligar estas salas, mas as rotas são código nosso e a app iOS nativa lê a
-- tabela directamente. Isto fecha o último caminho que restava: uma escrita à mão na consola.
-- Uma sala de gravação com `is_live = true` deixa de ser possível, ponto.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'lms_streams_gravacao_nunca_ao_vivo') then
    alter table public.lms_streams
      add constraint lms_streams_gravacao_nunca_ao_vivo check (not (nunca_ao_vivo and is_live));
  end if;
end $$;

commit;

-- O cliente JS do Supabase (service role) não vê colunas novas sem isto.
notify pgrst, 'reload schema';
