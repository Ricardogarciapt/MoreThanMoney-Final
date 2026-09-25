/**
 * A CONTA MESTRE DO MTM SCANNER — a única estratégia que não tinha uma.
 *
 * As outras seis (Premium, Sensei, Aurum Flow, GoldKiller, Edge, King, Wolf) têm cada uma a sua
 * conta MTM Funded simulada de 10 000 USD, `tipo = 'provider'`, ligada em
 * `mtmauto_providers.funded_account_id` e com linha em `mestres_estrategias`. O `mtm-scanner`
 * ficou de fora: tinha provider (desligado) e nenhuma mestre — e é da mestre que as seguidoras
 * copiam, por isso a conta de 1 000 USD que o segue nunca receberia nada.
 *
 * Pedido do dono a 24/09: «faz a conta nova para o mtm scanner então».
 *
 * ELA NASCE DESLIGADA, DE PROPÓSITO. Ficam por mexer as três fechaduras que o próprio dono
 * fechou e que ninguém deve abrir de lado nenhum a não ser ele:
 *   1. `mtmauto_providers.ativo = false` — o scanner não está no catálogo;
 *   2. `mestres_estrategias.modo = 'sombra'` — a mestre regista, não executa (foi assim que o
 *      Aurum Flow entrou a 23/09);
 *   3. `canExecuteProvider` exclui `mtmscanner` por escrito desde 18/08 («só PUBLICA + alimenta
 *      o T2T»), e o canal `trade-ideas-setup` saiu do mapa T2T a 27/08 porque dava ~115 entradas
 *      por dia — seis vezes o resto do sistema junto.
 *
 * Ou seja: isto fecha o grafo (estratégia → mestre → seguidora) e deixa tudo pronto. Ligar é
 * decisão de negócio, não de script.
 *
 *   npx tsx scripts/mestre-mtm-scanner-24-09.ts              → mostra o plano, não escreve
 *   npx tsx scripts/mestre-mtm-scanner-24-09.ts --escrever   → cria (precisa da MTMFUNDED_CRED_KEY)
 *
 * Idempotente: se a mestre já existir, não cria outra. Nunca imprime passwords.
 */
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
try { process.loadEnvFile(join(RAIZ, '.env.local')) } catch { /* usa o ambiente */ }

const escrever = process.argv.includes('--escrever')
const SLUG = 'mtm-scanner'
const NOME = 'MTM Auto Scanner'
const DONO = 'ricardogarciapt@proton.me'

async function main() {
  const { getSupabaseAdmin } = await import('../lib/supabase-admin-client')
  const { criarContaPlaneada, SALDO_CASA } = await import('../lib/mtmfunded/estrategias-sinais/contas')
  const db = getSupabaseAdmin()

  const { data: prov, error } = await db.from('mtmauto_providers')
    .select('id, slug, nome, ativo, funded_account_id').eq('slug', SLUG).maybeSingle()
  if (error || !prov) { console.error(`provider ${SLUG} não encontrado: ${error?.message ?? 'sem linha'}`); process.exit(2) }
  console.log(`provider ${prov.slug} · ${prov.ativo ? 'LIGADO' : 'desligado'} · mestre ${prov.funded_account_id ?? '— (por criar)'}`)

  const { data: mestre } = await db.from('mestres_estrategias').select('*').eq('slug', SLUG).maybeSingle()
  console.log(`mestres_estrategias: ${mestre ? `existe (modo ${mestre.modo})` : '— (por criar)'}`)

  if (prov.funded_account_id && mestre) { console.log('\nnada a fazer: já tem mestre e linha.'); return }

  console.log(`\nCRIAR  Casa · ${NOME} · ${SALDO_CASA} USD · provider · conta da casa · sem regras`)
  console.log(`CRIAR  mestres_estrategias ${SLUG} em modo SOMBRA (regista, não executa)`)
  if (!escrever) { console.log('\nsó leitura. --escrever para criar.'); return }
  if (!(process.env.MTMFUNDED_CRED_KEY && process.env.MTMFUNDED_CRED_KEY.length >= 32)) { console.error('falta a MTMFUNDED_CRED_KEY local'); process.exit(2) }

  const { data: dono } = await db.from('profiles').select('id').ilike('email', DONO).maybeSingle()
  if (!dono) { console.error(`dono ${DONO} não encontrado`); process.exit(2) }

  let contaId = prov.funded_account_id as string | null
  if (!contaId) {
    const r = await criarContaPlaneada(String(dono.id), {
      papel: 'casa', slug: SLUG, rotulo: `Casa · ${NOME}`, saldo: SALDO_CASA, tipo: 'provider',
      ligarNasApps: false, subscrever: false,
      // aceita_t2t a false: uma aceitação à mão abriria uma segunda posição na mestre e falsearia
      // tudo o que ela mede. A mestre recebe do motor, e só do motor.
      colunas: { provider_slug: SLUG, segue_estrategia: null, aceita_t2t: false, sem_regras: true, conta_casa: true, recolhe_todos_sinais: false },
    }, 'script:mestre-mtm-scanner-24-09')
    if (r.erro || !r.accountId) { console.error(`  ERRO conta: ${r.erro}`); process.exit(1) }
    contaId = r.accountId
    console.log(`  ok   conta ${contaId} · login ${r.login}`)
    // A etiqueta é a que o cliente lê no seletor do WebTrader — as outras seis dizem «Mestre · …».
    await db.from('mtm_trading_accounts').update({ etiqueta: `Mestre · ${NOME}` }).eq('id', contaId)
    const { error: e1 } = await db.from('mtmauto_providers').update({ funded_account_id: contaId }).eq('id', prov.id)
    console.log(e1 ? `  ERRO ligar ao provider: ${e1.message}` : '  ok   ligada em mtmauto_providers.funded_account_id')
  }

  if (!mestre) {
    const { error: e2 } = await db.from('mestres_estrategias').insert({
      provider_id: prov.id, slug: SLUG, conta_mestre_id: contaId,
      modo: 'sombra', sinal_modo: 'desligado', t2t_modo: 'sombra', incluir_mtmauto: true,
      max_atraso_abertura_s: 30,
      notas: 'criada 24/09 para fechar o grafo; nasce em SOMBRA — o scanner não executa (canExecuteProvider exclui mtmscanner desde 18/08) e o canal saiu do mapa T2T a 27/08',
    })
    console.log(e2 ? `  ERRO mestres_estrategias: ${e2.message}` : '  ok   mestres_estrategias em sombra')
  }
  console.log('\nPronto. Continua DESLIGADA: ligar é `ativo = true` no provider e o modo no admin.')
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
