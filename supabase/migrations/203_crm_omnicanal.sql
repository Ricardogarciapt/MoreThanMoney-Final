-- Ponte para integrações externas: usa o pipeline e os papéis humanos existentes.
-- Não cria um segundo CRM, não envia mensagens, não toca em comissões.
begin;
alter table public.vendas_negocios
  add column if not exists crm_instagram_id text,
  add column if not exists crm_ai_score text check (crm_ai_score in ('A','B','C')),
  add column if not exists crm_ai_resumo text,
  add column if not exists crm_ai_qualificacao jsonb;

create table if not exists public.crm_eventos_recebidos (
  evento text primary key,
  payload_hash text not null,
  negocio_id uuid not null references public.vendas_negocios(id),
  recebido_em timestamptz not null default now()
);
alter table public.crm_eventos_recebidos enable row level security;
revoke all on public.crm_eventos_recebidos from public, anon, authenticated;
grant select, insert on public.crm_eventos_recebidos to service_role;

create or replace function public.crm_ingerir_lead(p_evento text, p_hash text, p_lead jsonb)
returns jsonb language plpgsql security invoker set search_path = public as $$
declare
  anterior public.crm_eventos_recebidos%rowtype;
  negocio public.vendas_negocios%rowtype;
  ids uuid[];
  pessoa uuid;
  tem_humano boolean;
  novo boolean := false;
begin
  if coalesce(p_lead->>'papel','') not in ('setter','closer') or coalesce(p_lead->>'estado','') not in ('lead','contactado','qualificado')
     or coalesce(p_lead->>'score','') not in ('A','B','C') or coalesce(p_lead->>'nome','') = ''
     or coalesce(p_evento,'') = '' or coalesce(p_hash,'') = '' then
    raise exception 'Contrato inválido' using errcode = '22023';
  end if;
  -- Serializa a ponte inteira: deduplicação e medição/atribuição pertencem à mesma transacção.
  -- Não há contadores incrementados antes de um INSERT que pode falhar.
  perform pg_advisory_xact_lock(203, 1);
  select * into anterior from public.crm_eventos_recebidos where evento = p_evento;
  if found then
    if anterior.payload_hash <> p_hash then raise exception 'Evento reutilizado'; end if;
    return jsonb_build_object('negocio_id', anterior.negocio_id, 'replayed', true);
  end if;

  select array_agg(id) into ids from public.vendas_negocios
  where chave_origem = p_lead->>'chave'
    or (p_lead->>'instagram_id' is not null and crm_instagram_id = p_lead->>'instagram_id')
    or (p_lead->>'email' is not null and lower(email) = p_lead->>'email')
    or (p_lead->>'telefone' is not null and regexp_replace(telefone, '[^+0-9]', '', 'g') = p_lead->>'telefone')
    or (p_lead->>'telegram_id' is not null and telegram_id = p_lead->>'telegram_id')
    or (p_lead->>'instagram_handle' is not null and lower(ltrim(instagram_handle, '@')) = p_lead->>'instagram_handle');
  -- Nunca escolher arbitrariamente entre negócios existentes, incluindo fechados.
  if cardinality(ids) > 1 then raise exception 'Identidade ambígua'; end if;
  if cardinality(ids) = 1 then
    select * into negocio from public.vendas_negocios where id = ids[1] for update;
  else
    insert into public.vendas_negocios (nome, email, telefone, telegram_id, instagram_handle, crm_instagram_id, origem, chave_origem, estado)
    values (p_lead->>'nome', p_lead->>'email', p_lead->>'telefone', p_lead->>'telegram_id',
      p_lead->>'instagram_handle', p_lead->>'instagram_id', p_lead->>'origem', p_lead->>'chave', p_lead->>'estado') returning * into negocio;
    novo := true;
  end if;

  tem_humano := negocio.prospector_id is not null or negocio.setter_id is not null
    or negocio.closer_id is not null or negocio.team_leader_id is not null or negocio.afiliado_id is not null;

  if negocio.estado not in ('ganho','perdido') then
    -- Colunas IA separadas da nota humana. Não regride etapa nem altera decisões humanas.
    update public.vendas_negocios set
      crm_instagram_id = coalesce(crm_instagram_id, p_lead->>'instagram_id'),
      crm_ai_score = p_lead->>'score', crm_ai_resumo = p_lead->>'resumo',
      crm_ai_qualificacao = p_lead->'qualificacao',
      email = coalesce(nullif(email,''), p_lead->>'email'),
      telefone = coalesce(nullif(telefone,''), p_lead->>'telefone'),
      telegram_id = coalesce(nullif(telegram_id,''), p_lead->>'telegram_id'),
      instagram_handle = coalesce(nullif(instagram_handle,''), p_lead->>'instagram_handle'),
      estado = case when not tem_humano and estado in ('lead','contactado') and p_lead->>'estado' = 'qualificado' then 'qualificado'
        when not tem_humano and estado = 'lead' and p_lead->>'estado' = 'contactado' then 'contactado' else estado end,
      atualizado_em = now()
    where id = negocio.id;

    -- Só atribui negócios sem nenhum humano. Não rouba a carteira já trabalhada.
    if not tem_humano then
      select bp.user_id into pessoa from public.backoffice_papeis bp
      where bp.papel = p_lead->>'papel' and bp.retirado_at is null
      order by (select count(*) from public.vendas_negocios n
        where n.estado not in ('ganho','perdido') and
          case when bp.papel = 'closer' then n.closer_id = bp.user_id else n.setter_id = bp.user_id end),
        bp.atribuido_at, bp.user_id
      limit 1 for update of bp;
      if pessoa is not null then
        update public.vendas_negocios set
          closer_id = case when p_lead->>'papel' = 'closer' then pessoa else closer_id end,
          setter_id = case when p_lead->>'papel' = 'setter' then pessoa else setter_id end
        where id = negocio.id;
      end if;
    end if;
    insert into public.vendas_negocio_eventos(negocio_id, de, para, nota)
    select id, case when novo then null else negocio.estado end, estado,
      'Qualificação omnicanal recebida. Score ' || (p_lead->>'score') || case when pessoa is null then '; sem nova atribuição.' else '; atribuído a ' || pessoa::text end
    from public.vendas_negocios where id = negocio.id;
  end if;
  insert into public.crm_eventos_recebidos(evento, payload_hash, negocio_id) values (p_evento, p_hash, negocio.id);
  return jsonb_build_object('negocio_id', negocio.id, 'created', novo, 'replayed', false, 'assigned_agent_id', pessoa);
end;
$$;
revoke all on function public.crm_ingerir_lead(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.crm_ingerir_lead(text,text,jsonb) to service_role;
-- Só uma marcação REAL da agenda pode avançar para «marcado». Não confia num URL ou no LLM.
create or replace function public.crm_ligar_marcacao(p_marcacao uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare
  m public.agenda_marcacoes%rowtype;
  t public.agenda_tipos%rowtype;
  n public.vendas_negocios%rowtype;
  ids uuid[];
begin
  perform pg_advisory_xact_lock(203, 1);
  select * into m from public.agenda_marcacoes where id = p_marcacao for update;
  if not found or m.estado <> 'marcada' then return; end if;
  if m.negocio_id is not null then return; end if;
  select * into strict t from public.agenda_tipos where id = m.tipo_id;
  select array_agg(id) into ids from public.vendas_negocios
    where lower(email) = lower(m.email)
      or (m.telefone is not null and regexp_replace(telefone, '[^+0-9]', '', 'g') = regexp_replace(m.telefone, '[^+0-9]', '', 'g'));
  if cardinality(ids) > 1 then raise exception 'Identidade ambígua na marcação'; end if;
  if cardinality(ids) = 1 then
    select * into n from public.vendas_negocios where id = ids[1] for update;
    if t.pipeline_estado = 'marcado' and n.estado in ('lead','contactado','qualificado','no_show') then
      update public.vendas_negocios set estado = 'marcado', atualizado_em = now() where id = n.id;
      insert into public.vendas_negocio_eventos(negocio_id, de, para, nota)
        values(n.id, n.estado, 'marcado', 'Marcação confirmada na agenda própria.');
    end if;
  else
    insert into public.vendas_negocios(nome,email,telefone,estado,pack_previsto,origem,chave_origem)
      values(m.nome,lower(m.email),m.telefone,t.pipeline_estado,t.pack_previsto,'agenda','agenda:' || m.id::text) returning * into n;
    insert into public.vendas_negocio_eventos(negocio_id, de, para, nota)
      values(n.id, null, n.estado, 'Marcação confirmada na agenda própria.');
  end if;
  update public.agenda_marcacoes set negocio_id = n.id where id = m.id;
end;
$$;
revoke all on function public.crm_ligar_marcacao(uuid) from public, anon, authenticated;
grant execute on function public.crm_ligar_marcacao(uuid) to service_role;
commit;
