-- Fila de qualificação. O interruptor nasce desligado: activar só depois do ensaio e credenciais.
begin;
insert into public.site_settings(key,value) values('crm_bots_ligado','false'::jsonb) on conflict(key) do nothing;
create table if not exists public.crm_bots_fila (
  id uuid primary key default gen_random_uuid(),
  evento text not null unique,
  entrada jsonb not null,
  estado text not null default 'pendente' check(estado in ('pendente','processando','feito','revisao','morto')),
  tentativas integer not null default 0,
  disponivel_em timestamptz not null default now(),
  lease uuid,
  lease_ate timestamptz,
  resultado jsonb,
  erro_codigo text,
  criado_em timestamptz not null default now(),
  concluido_em timestamptz
);
alter table public.crm_bots_fila enable row level security;
revoke all on public.crm_bots_fila from public,anon,authenticated;
grant all on public.crm_bots_fila to service_role;
create index if not exists crm_bots_fila_prontos on public.crm_bots_fila(estado,disponivel_em);

-- Recebe só mensagens de entrada persistidas pelos bots existentes; nenhuma mensagem é enviada.
create or replace function public.crm_bot_capturar() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  j jsonb := to_jsonb(new);
  conversa text;
  texto text;
  canal text;
  v_evento text;
  contacto jsonb;
begin
  if not exists(select 1 from public.site_settings where key='crm_bots_ligado' and value='true'::jsonb) then return new; end if;
  if tg_table_name = 'ig_dm_log' then
    canal := 'instagram'; conversa := (j->>'account_id') || ':' || (j->>'sender_id');
    texto := j->>'message'; v_evento := 'ig:' || (j->>'mid');
    contacto := jsonb_build_object('instagram_id',conversa);
  elsif tg_table_name = 'whatsapp_mensagens' then
    if j->>'direcao' <> 'entrada' or j->>'estado' <> 'recebida' then return new; end if;
    canal := 'whatsapp'; conversa := coalesce(j->>'numero',j->>'telefone');
    texto := coalesce(j->>'texto',j->>'corpo');
    v_evento := 'wa:' || coalesce(j->>'wa_message_id',j->>'id');
    -- Não transformar utilizadores registados em leads frios. Igualdade do número completo,
    -- nunca um sufixo de nove dígitos que possa ser de outra pessoa noutro país.
    if exists(select 1 from public.profiles p where
      regexp_replace(coalesce(to_jsonb(p)->>'phone',''),'[^0-9]','','g') = regexp_replace(conversa,'[^0-9]','','g')
      or regexp_replace(coalesce(to_jsonb(p)->>'whatsapp',''),'[^0-9]','','g') = regexp_replace(conversa,'[^0-9]','','g')) then return new; end if;
    contacto := jsonb_build_object('phone',conversa);
  else return new;
  end if;
  if texto is null or length(trim(texto))=0 or conversa is null or v_evento is null then return new; end if;
  insert into public.crm_bots_fila(evento,entrada)
    values(v_evento,jsonb_build_object('channel',canal,'name',coalesce(nullif(j->>'first_name',''),nullif(j->>'nome',''),'Contacto ' || canal),
      'text',left(texto,4000),'contact',contacto)) on conflict(evento) do nothing;
  return new;
end $$;
revoke all on function public.crm_bot_capturar() from public,anon,authenticated;

-- As tabelas são pré-requisitos reais, não supostos serviços novos.
drop trigger if exists crm_capturar_instagram on public.ig_dm_log;
create trigger crm_capturar_instagram after insert on public.ig_dm_log for each row execute function public.crm_bot_capturar();
drop trigger if exists crm_capturar_whatsapp on public.whatsapp_mensagens;
create trigger crm_capturar_whatsapp after insert on public.whatsapp_mensagens for each row execute function public.crm_bot_capturar();

-- Telegram entra no webhook autenticado, antes de depender do funil/fornecedor de IA.
create or replace function public.crm_bot_telegram(p_evento text,p_chat text,p_nome text,p_texto text)
returns void language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from public.site_settings where key='crm_bots_ligado' and value='true'::jsonb) then return; end if;
  if exists(select 1 from public.site_settings where key='telegram_admin_chat_id' and value->>'chat_id'=p_chat) then return; end if;
  if p_chat !~ '^[0-9]{1,20}$' or coalesce(p_texto,'')='' or p_evento !~ '^tg:[0-9]+$' then raise exception 'Entrada inválida'; end if;
  insert into public.crm_bots_fila(evento,entrada) values(p_evento,jsonb_build_object(
    'channel','telegram','name',left(coalesce(nullif(p_nome,''),'Contacto Telegram'),160),'text',left(p_texto,4000),'contact',jsonb_build_object('telegram_id',p_chat)))
    on conflict(evento) do nothing;
end $$;
revoke all on function public.crm_bot_telegram(text,text,text,text) from public,anon,authenticated;
grant execute on function public.crm_bot_telegram(text,text,text,text) to service_role;

create or replace function public.crm_bot_reservar() returns setof public.crm_bots_fila
language plpgsql security invoker set search_path=public as $$
begin
  if not exists(select 1 from public.site_settings where key='crm_bots_ligado' and value='true'::jsonb) then return; end if;
  -- Recupera crashes até ao limite; nunca deixa o último lease num ciclo infinito.
  update public.crm_bots_fila set estado='morto',erro_codigo='lease_expirado',lease=null,lease_ate=null
    where estado='processando' and lease_ate<now() and tentativas>=5;
  return query
  with escolhido as (
    select id from public.crm_bots_fila where tentativas<5 and
      ((estado='pendente' and disponivel_em<=now()) or (estado='processando' and lease_ate<now()))
    order by criado_em limit 1 for update skip locked
  )
  update public.crm_bots_fila f set estado='processando',tentativas=tentativas+1,lease=gen_random_uuid(),lease_ate=now()+interval '5 minutes'
    from escolhido e where f.id=e.id returning f.*;
end $$;

-- Fencing: um worker que perdeu o lease já não pode gravar nem distribuir o lead.
create or replace function public.crm_bot_concluir(p_id uuid,p_lease uuid,p_hash text,p_lead jsonb)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare f public.crm_bots_fila%rowtype; r jsonb;
begin
  select * into f from public.crm_bots_fila where id=p_id for update;
  if not found or f.lease is distinct from p_lease or f.estado<>'processando' or f.lease_ate<now() then raise exception 'Lease inválido'; end if;
  r := public.crm_ingerir_lead('bot:' || f.id::text,p_hash,p_lead);
  update public.crm_bots_fila set estado='feito',resultado=r,concluido_em=now(),lease=null,lease_ate=null where id=f.id;
  return r;
end $$;
create or replace function public.crm_bot_falhar(p_id uuid,p_lease uuid,p_codigo text,p_revisao boolean default false)
returns void language sql security invoker set search_path=public as $$
  update public.crm_bots_fila set estado=case when p_revisao then 'revisao' when tentativas>=5 then 'morto' else 'pendente' end,
    erro_codigo=left(p_codigo,60),disponivel_em=now()+make_interval(secs=>least(3600,60*(2^tentativas)::integer)),lease=null,lease_ate=null
  where id=p_id and lease=p_lease and estado='processando' and lease_ate>now();
$$;
revoke all on function public.crm_bot_reservar(),public.crm_bot_concluir(uuid,uuid,text,jsonb),public.crm_bot_falhar(uuid,uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.crm_bot_reservar(),public.crm_bot_concluir(uuid,uuid,text,jsonb),public.crm_bot_falhar(uuid,uuid,text,boolean) to service_role;
commit;
