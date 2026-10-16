import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import { negociosDoAmbito, faltamColunasCrm } from '../backoffice-negocios'
assert.equal(faltamColunasCrm({code:'42703',message:'column vendas_negocios.crm_ai_score does not exist'}),true)
assert.equal(faltamColunasCrm({code:'42703',message:'column nome does not exist'}),false)
assert.equal(faltamColunasCrm({code:'42501',message:'crm_ai_score denied'}),false)
async function main() {
  const chamadas: Array<[string, unknown[]]> = []
  let colunas = ''
  const q: Record<string, unknown> = {}
  for (const m of ['select','order','range','or','eq','ilike']) q[m]=(...args:unknown[])=>{ chamadas.push([m,args]);if(m==='select')colunas=String(args[0]);return q }
  q.then=(resolve:(x:unknown)=>void)=>resolve(colunas.includes('crm_ai_score')?{data:null,error:{code:'42703',message:'column vendas_negocios.crm_ai_score does not exist'}}:{data:[{id:'ok',nome:'Ana'}],error:null})
  const db={from:()=>q} as unknown as SupabaseClient
  const id='00000000-0000-4000-8000-000000000001'
  const r=await negociosDoAmbito(db,{todos:false,ids:[id]},{estado:'lead',procura:'Ana'})
  assert.equal(r.linhas[0].id,'ok')
  assert.equal(chamadas.filter(([m])=>m==='select').length,2)
  assert.ok(String(chamadas.find(([m])=>m==='or')?.[1][0]).includes(id))
  assert.ok(chamadas.some(([m,a])=>m==='eq' && a[1]==='lead'))
  console.log('Pipeline: migração CRM pendente não bloqueia leitura; âmbito/filtros preservados OK')
}
main().catch(e=>{console.error(e);process.exitCode=1})
