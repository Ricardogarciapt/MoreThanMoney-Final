import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { chamarIA } from '@/lib/ia/chamar'
import { processarBot } from './worker'
async function main() {
  const calls: Array<{nome:string;args?:Record<string,unknown>}> = []
  let concluirErro: {code:string}|null = null
  const db = {rpc: async (nome:string,args?:Record<string,unknown>) => {
    calls.push({nome,args})
    if (nome==='crm_bot_reservar') return {data:[{id:'job',lease:'lease',entrada:{channel:'telegram',name:'Ana',text:'Quero uma reunião',contact:{telegram_id:'12345'}}}],error:null}
    return {data:{},error:nome==='crm_bot_concluir'?concluirErro:null}
  }} as unknown as SupabaseClient
  const ia = async () => ({texto:JSON.stringify({score:'A',summary:'Pedido explícito de reunião.',evidence:'Quero uma reunião',confidence:0.99,wants_human:true,review:false}),fornecedor:'groq',modelo:'test',custoCents:0,emReserva:false,tentativas:[]})
  assert.equal((await processarBot(db,ia as typeof chamarIA)).estado,'feito')
  assert.equal(calls.at(-1)?.nome,'crm_bot_concluir')
  assert.equal((calls.at(-1)?.args?.p_lead as {telegram_id:string}).telegram_id,'12345')
  assert.equal((await processarBot(db,async()=>{throw Error('timeout')})).estado,'retry')
  assert.equal(calls.at(-1)?.args?.p_codigo,'ia_indisponivel')
  assert.equal((await processarBot(db,(async()=>({...await ia(),texto:'{}'})) as typeof chamarIA)).estado,'revisao')
  concluirErro={code:'P0001'}
  assert.equal((await processarBot(db,ia as typeof chamarIA)).estado,'revisao')
  assert.equal(calls.at(-1)?.args?.p_codigo,'conflito_ou_lease')
  console.log('CRM worker: sucesso, erro IA, contrato inválido e conflito sem envios OK')
}
main().catch(e=>{console.error(e);process.exitCode=1})
