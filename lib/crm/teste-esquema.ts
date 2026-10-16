/** Esquema mínimo isolado para testes SQL; não representa migrações de produção. */
export const ESQUEMA_TESTE = `
    create role anon; create role authenticated; create role service_role;
    create table profiles(id uuid primary key);
    create table vendas_negocios(
      id uuid primary key default gen_random_uuid(), nome text, email text, telefone text, telegram_id text,
      instagram_handle text, pack_previsto text, origem text, chave_origem text unique, estado text default 'lead',
      prospector_id uuid, setter_id uuid, closer_id uuid, team_leader_id uuid, afiliado_id uuid,
      nota text, atualizado_em timestamptz default now()
    );
    create table vendas_negocio_eventos(id bigserial, negocio_id uuid, de text, para text, nota text);
    create table backoffice_papeis(user_id uuid, papel text, atribuido_at timestamptz default now(), retirado_at timestamptz);
    create table agenda_tipos(id uuid primary key, pipeline_estado text, pack_previsto text);
    create table agenda_marcacoes(tipo_id uuid, id uuid primary key, negocio_id uuid, estado text, nome text, email text, telefone text);
 `
