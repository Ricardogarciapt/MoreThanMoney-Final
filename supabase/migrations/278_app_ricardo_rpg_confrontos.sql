-- RPG «Operação Liberdade»: confrontos por turnos com os inimigos interiores (um por semana) e troféus na ficha.
create table if not exists rg_app_rpg_confrontos (
  membro_id uuid not null references rg_app_membros(id) on delete cascade,
  boss_id text not null, semana text not null,
  estado jsonb, tentativas int not null default 0, vitorias int not null default 0, xp int not null default 0,
  atualizado timestamptz not null default now(),
  primary key (membro_id, boss_id, semana)
);
alter table rg_app_rpg_confrontos enable row level security;
alter table rg_app_rpg_fichas add column if not exists trofeus text[] not null default '{}';
