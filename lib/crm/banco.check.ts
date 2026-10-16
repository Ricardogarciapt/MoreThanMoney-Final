/** PostgreSQL real em WASM, isolado: não lê .env nem contacta o Supabase. */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { contratoLead, parametrosLead } from './contrato'

async function main() {
  const db = new PGlite()
  await db.exec(`
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
  `)
  const migration = readFileSync(new URL('../../supabase/migrations/203_crm_omnicanal.sql', import.meta.url), 'utf8')
  await db.exec(migration)
  await db.exec(migration) // reaplicação aditiva
  const a = '00000000-0000-4000-8000-000000000001'
  const b = '00000000-0000-4000-8000-000000000002'
  await db.query<Record<string, unknown>>(`insert into backoffice_papeis(user_id,papel) values ($1,'closer'),($2,'closer')`, [a, b])
  let numero = 0
  async function ingerir(overrides: Record<string, unknown> = {}, evento?: string, hash = 'hash') {
    numero++
    const p = parametrosLead(contratoLead.parse({ name: 'Ana', phone: `+35191000${String(numero).padStart(4, '0')}`, channel: 'whatsapp', aiScore: 'A', aiSummary: 'Qualificada', stage: 'QUALIFIED_SETTER', ...overrides }))
    const r = await db.query<{ r: { negocio_id: string; replayed: boolean; assigned_agent_id: string | null } }>('select crm_ingerir_lead($1,$2,$3::jsonb) r', [evento ?? `evento-${numero}`, hash, JSON.stringify(p)])
    return r.rows[0].r
  }
  const primeiro = await ingerir({ phone: '+351910000001' }, 'primeiro')
  const segundo = await ingerir()
  assert.notEqual(primeiro.assigned_agent_id, segundo.assigned_agent_id)
  assert.equal((await ingerir({ phone: '+351910000001' }, 'primeiro')).replayed, true)
  await assert.rejects(ingerir({}, 'primeiro', 'outro-hash'), /Evento reutilizado/)
  const dedup = await ingerir({ phone: '+351910000001' })
  assert.equal(dedup.negocio_id, primeiro.negocio_id)
  await db.query<Record<string, unknown>>(`update vendas_negocios set nota='Nota humana',estado='apresentado' where id=$1`, [primeiro.negocio_id])
  await ingerir({ phone: '+351910000001', aiScore: 'C', stage: 'NEW_LEAD' })
  const humano = (await db.query<Record<string, unknown>>('select * from vendas_negocios where id=$1', [primeiro.negocio_id])).rows[0]
  assert.equal(humano.estado, 'apresentado')
  assert.equal(humano.nota, 'Nota humana')
  assert.equal(humano.closer_id, primeiro.assigned_agent_id)
  await db.query<Record<string, unknown>>(`update vendas_negocios set estado='ganho' where id=$1`, [primeiro.negocio_id])
  await ingerir({ phone: '+351910000001', aiScore: 'B' })
  assert.equal((await db.query<Record<string, unknown>>('select estado from vendas_negocios where id=$1', [primeiro.negocio_id])).rows[0].estado, 'ganho')
  await db.query<Record<string, unknown>>(`insert into vendas_negocios(nome,telefone) values ('Duplicado','+351910000001')`)
  await assert.rejects(ingerir({ phone: '+351910000001' }), /Identidade ambígua/)
  await db.exec(`update backoffice_papeis set retirado_at=now()`)
  const bolsa = await ingerir({ email: 'agenda@example.test' })
  assert.equal(bolsa.assigned_agent_id, null)
  await db.query<Record<string, unknown>>(`update vendas_negocios set nota='Preservar' where id=$1`, [bolsa.negocio_id])
  const m = '00000000-0000-4000-8000-000000000003'
  await db.query<Record<string, unknown>>(`insert into agenda_tipos(id,pipeline_estado,pack_previsto) values ($1,'marcado','premium')`, [m])
  await db.query<Record<string, unknown>>(`insert into agenda_marcacoes(tipo_id,id,estado,nome,email) values ($1,$1,'marcada','Ana','agenda@example.test')`, [m])
  await db.query<Record<string, unknown>>(`select crm_ligar_marcacao($1)`, [m])
  await db.query<Record<string, unknown>>(`select crm_ligar_marcacao($1)`, [m])
  const agenda = (await db.query<Record<string, unknown>>('select * from vendas_negocios where id=$1', [bolsa.negocio_id])).rows[0]
  assert.equal(agenda.estado, 'marcado')
  assert.equal(agenda.nota, 'Preservar')
  assert.equal((await db.query<Record<string, unknown>>('select negocio_id from agenda_marcacoes where id=$1', [m])).rows[0].negocio_id, bolsa.negocio_id)
  const nova = '00000000-0000-4000-8000-000000000004'
  await db.query<Record<string, unknown>>(`insert into agenda_marcacoes(tipo_id,id,estado,nome,email) values ($1,$2,'marcada','Novo','novo@example.test')`, [m, nova])
  await db.query<Record<string, unknown>>(`select crm_ligar_marcacao($1)`, [nova])
  const novo = (await db.query<Record<string, unknown>>("select * from vendas_negocios where email='novo@example.test'")).rows[0]
  assert.equal(novo.estado, 'marcado')
  assert.equal(novo.pack_previsto, 'premium')
  // Não reabre o ganho se o cliente marcar outra chamada.
  await db.query<Record<string, unknown>>(`update vendas_negocios set estado='ganho' where id=$1`, [novo.id])
  const outra = '00000000-0000-4000-8000-000000000005'
  await db.query<Record<string, unknown>>(`insert into agenda_marcacoes(tipo_id,id,estado,nome,email) values ($1,$2,'marcada','Novo','novo@example.test')`, [m, outra])
  await db.query<Record<string, unknown>>(`select crm_ligar_marcacao($1)`, [outra])
  assert.equal((await db.query<Record<string, unknown>>('select estado from vendas_negocios where id=$1', [novo.id])).rows[0].estado, 'ganho')
  // Nenhuma função disponível ao browser; recibos protegidos por RLS.
  const grants = (await db.query<Record<string, unknown>>(`select has_function_privilege('anon','crm_ingerir_lead(text,text,jsonb)','execute') allowed`)).rows[0]
  assert.equal(grants.allowed, false)
  const antes = (await db.query<Record<string, unknown>>('select count(*) n from crm_eventos_recebidos')).rows[0].n
  await db.exec(`begin; select crm_ingerir_lead('rollback','h','{"chave":"rollback","nome":"Teste","estado":"lead","papel":"setter","score":"B"}'); rollback;`)
  assert.equal((await db.query<Record<string, unknown>>('select count(*) n from crm_eventos_recebidos')).rows[0].n, antes)
  await db.close()
  console.log('CRM: migração, replay, conflitos, distribuição, protecção humana, agenda e permissões OK')
}
main().catch(e => { console.error(e); process.exitCode = 1 })
