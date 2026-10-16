import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { ESQUEMA_TESTE } from './teste-esquema'
import { contratoLead, parametrosLead } from './contrato'
async function main() {
  const db = new PGlite()
  await db.exec(ESQUEMA_TESTE)
  await db.exec(`
    create table site_settings(key text primary key,value jsonb);
    create table ig_dm_log(mid text primary key,account_id text,sender_id text,message text,status text);
    create table whatsapp_mensagens(id uuid default gen_random_uuid(),numero text,direcao text,estado text,texto text,wa_message_id text);
  `)
  for (const nome of ['203_crm_omnicanal.sql','204_crm_bots_fila.sql','204_crm_bots_fila.sql']) {
    await db.exec(readFileSync(new URL(`../../supabase/migrations/${nome}`, import.meta.url),'utf8'))
  }
  const count = async () => (await db.query<{ n: number }>('select count(*)::integer n from crm_bots_fila')).rows[0].n
  await db.exec(`insert into ig_dm_log values('off','123','456','Olá','received')`)
  assert.equal(await count(), 0)
  await db.exec(`update site_settings set value='true';
    insert into ig_dm_log values('mid1','123','456','Quero conhecer o produto','received');
    update ig_dm_log set status='replied';
    insert into whatsapp_mensagens(numero,direcao,estado,texto,wa_message_id) values('+351910000001','entrada','recebida','Olá','wa1'),('+351910000001','saida','enviada','Resposta','wa2');
    select crm_bot_telegram('tg:1','12345','Ana','Quero uma reunião');
    select crm_bot_telegram('tg:1','12345','Ana','Quero uma reunião');`)
  assert.equal(await count(), 3)
  await db.exec(`alter table profiles add column phone text;
    insert into profiles(id,phone) values(gen_random_uuid(),'+351910000099');
    insert into whatsapp_mensagens(numero,direcao,estado,texto,wa_message_id) values('+351910000099','entrada','recebida','Cliente','wa-cliente');
    insert into site_settings values('telegram_admin_chat_id','{"chat_id":"999"}'::jsonb);
    select crm_bot_telegram('tg:999','999','Admin','Operação interna');`)
  assert.equal(await count(), 3)
  const reserva = async () => (await db.query<{id:string;lease:string;entrada:unknown}>('select * from crm_bot_reservar()')).rows[0]
  const a = await reserva(), b = await reserva(), c = await reserva()
  assert.equal(new Set([a.id,b.id,c.id]).size, 3)
  assert.equal(await reserva(), undefined)
  // Lease expirado não distribui nem conclui. Outro worker pode recuperar.
  await db.query('update crm_bots_fila set lease_ate=now()-interval \'1 minute\' where id=$1',[a.id])
  const p = parametrosLead(contratoLead.parse({name:'Ana',instagram_id:'123:456',channel:'instagram',aiScore:'B',aiSummary:'Interesse confirmado no produto.',stage:'QUALIFIED_SETTER'}))
  await assert.rejects(db.query('select crm_bot_concluir($1,$2,$3,$4::jsonb)',[a.id,a.lease,'hash',JSON.stringify(p)]), /Lease inválido/)
  const recuperado = await reserva()
  assert.equal(recuperado.id, a.id)
  assert.notEqual(recuperado.lease, a.lease)
  await db.query('select crm_bot_concluir($1,$2,$3,$4::jsonb)',[a.id,recuperado.lease,'hash',JSON.stringify(p)])
  assert.equal((await db.query<{estado:string}>('select estado from crm_bots_fila where id=$1',[a.id])).rows[0].estado,'feito')
  assert.equal((await db.query<{crm_instagram_id:string}>('select crm_instagram_id from vendas_negocios')).rows[0].crm_instagram_id,'123:456')
  await db.query('select crm_bot_falhar($1,$2,$3,$4)',[b.id,b.lease,'teste',false])
  const retry = (await db.query<{estado:string;espera:boolean}>('select estado,disponivel_em>now() espera from crm_bots_fila where id=$1',[b.id])).rows[0]
  assert.equal(retry.estado,'pendente'); assert.equal(retry.espera,true)
  await db.query('select crm_bot_falhar($1,$2,$3,$4)',[c.id,c.lease,'revisao',true])
  assert.equal((await db.query<{estado:string}>('select estado from crm_bots_fila where id=$1',[c.id])).rows[0].estado,'revisao')
  await db.query(`update crm_bots_fila set estado='processando',tentativas=5,lease_ate=now()-interval '1 minute' where id=$1`,[b.id])
  await reserva()
  assert.equal((await db.query<{estado:string}>('select estado from crm_bots_fila where id=$1',[b.id])).rows[0].estado,'morto')
  const permissao = (await db.query<{ok:boolean}>(`select has_function_privilege('anon','crm_bot_telegram(text,text,text,text)','execute') ok`)).rows[0]
  assert.equal(permissao.ok,false)
  await db.close()
  console.log('CRM fila: interruptor, canais, dedup, lease, fencing, retries, revisão e permissões OK')
}
main().catch(e => { console.error(e);process.exitCode=1 })
