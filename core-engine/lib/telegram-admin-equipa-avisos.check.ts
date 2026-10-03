/**
 * GUARDA dos avisos da equipa.
 *
 * O QUE ESTE TESTE TRAVA:
 *
 *  1. O VIGIA NÃO GRITA NA PRIMEIRA CORRIDA. Um vigia novo encontra o mundo inteiro por avisar; se
 *     mandasse tudo, a primeira coisa que o dono via era uma parede de mensagens sobre coisas
 *     antigas — e desligava-o. A primeira corrida de cada família semeia em silêncio.
 *
 *  2. O VIGIA NÃO SE REPETE. Cada aviso tem uma chave, e uma chave já dada nunca volta a sair. A
 *     excepção é de propósito: um negócio parado volta a incomodar UMA vez por semana de paragem,
 *     porque um negócio esquecido há um mês que só avisou uma vez adormece para sempre.
 *
 *  3. O VIGIA NÃO INUNDA. Os avisos vão agregados, com uma amostra de nomes e um «e mais N».
 *
 *  4. O VIGIA NÃO AGE. Este é o que justifica ele poder correr sozinho, sem ninguém confirmar: o
 *     ficheiro da rota não escreve em comissões, negócios nem ranks. Só lê, manda frases, e aponta
 *     na sua própria memória o que já disse.
 *
 *  5. A MEMÓRIA GRAVA-SE DEPOIS DE A MENSAGEM SAIR. Marcar antes de enviar cala um aviso PARA
 *     SEMPRE quando o Telegram falha — fica «já dado» sem nunca ter chegado.
 *
 *   npx tsx lib/telegram-admin-equipa-avisos.check.ts
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  NOMES_POR_AVISO,
  TIPOS_DE_AVISO,
  chaveComissao,
  chaveNegocioParado,
  chaveRank,
  decidirAvisos,
  semanasParadas,
  textoComissoesNovas,
  textoNegociosParados,
  textoRanksSubidos,
  type Candidato,
} from './telegram-admin-equipa-avisos'

const RAIZ = join(__dirname, '..')
const ROTA = readFileSync(join(RAIZ, 'app/api/cron/equipa-vigia/route.ts'), 'utf8')
const MIGRACAO = readFileSync(join(RAIZ, 'supabase/migrations/132_bot_avisos_enviados.sql'), 'utf8')

let ok = 0
const falhas: string[] = []
const sim = (nome: string, cond: unknown) => {
  if (cond) ok++
  else falhas.push(nome)
}

const cand = (n: number): Candidato[] =>
  Array.from({ length: n }, (_, i) => ({ chave: `c:${i}`, linha: `pessoa ${i}`, valorCents: 1000 }))

// ════════════════ 1. A PRIMEIRA CORRIDA SEMEIA ════════════════
{
  const d = decidirAvisos({ candidatos: cand(50), jaAvisadas: new Set(), jaVistoAlgumaVez: false })
  sim('a primeira corrida não manda nada', d.aAvisar.length === 0)
  sim('a primeira corrida diz que semeou', d.semeou === true)
  sim('a primeira corrida marca tudo o que encontrou', d.aMarcar.length === 50)
  // E a SEGUNDA corrida, com o mesmo mundo, continua calada — foi tudo marcado.
  const d2 = decidirAvisos({ candidatos: cand(50), jaAvisadas: new Set(d.aMarcar), jaVistoAlgumaVez: true })
  sim('a segunda corrida não repete o que semeou', d2.aAvisar.length === 0)
  sim('a segunda corrida não marca nada de novo', d2.aMarcar.length === 0)
}

// ════════════════ 2. NÃO SE REPETE ════════════════
{
  const jaAvisadas = new Set(['c:0', 'c:1'])
  const d = decidirAvisos({ candidatos: cand(4), jaAvisadas, jaVistoAlgumaVez: true })
  sim('só sai o que ainda não saiu', d.aAvisar.map((c) => c.chave).join(',') === 'c:2,c:3')
  sim('só se marca o que ainda não estava marcado', d.aMarcar.join(',') === 'c:2,c:3')
  sim('não semeou (já tinha corrido)', d.semeou === false)
  sim('mundo vazio não manda nada', decidirAvisos({ candidatos: [], jaAvisadas, jaVistoAlgumaVez: true }).aAvisar.length === 0)

  // Chaves: cada família tem a sua, e não se cruzam.
  sim('a comissão tem chave por id', chaveComissao('abc') === 'comissao_nova:abc')
  sim('o rank tem chave por pessoa e rank', chaveRank('u1', 4) === 'rank_subiu:u1:4')
  sim('as três chaves são de famílias diferentes', new Set([chaveComissao('x').split(':')[0], chaveNegocioParado('x', 1).split(':')[0], chaveRank('x', 1).split(':')[0]]).size === 3)
  sim('as famílias das chaves são as declaradas', [chaveComissao('x'), chaveNegocioParado('x', 1), chaveRank('x', 1)].every((c) => (TIPOS_DE_AVISO as readonly string[]).includes(c.split(':')[0])))

  // A excepção deliberada: um negócio parado volta a incomodar por SEMANA de paragem.
  sim('o negócio parado tem chave por semana', chaveNegocioParado('n1', 3) === 'negocio_parado:n1:s3')
  sim('semanas diferentes são avisos diferentes', chaveNegocioParado('n1', 1) !== chaveNegocioParado('n1', 2))
  const agora = Date.parse('2026-09-25T12:00:00Z')
  sim('6 dias ainda não é uma semana', semanasParadas('2026-09-19T12:00:00Z', agora) === 0)
  sim('8 dias é uma semana', semanasParadas('2026-09-17T12:00:00Z', agora) === 1)
  sim('22 dias são três semanas', semanasParadas('2026-09-03T12:00:00Z', agora) === 3)
  sim('sem data não conta como parado', semanasParadas(null, agora) === 0)
  sim('data inválida não conta como parado', semanasParadas('não é data', agora) === 0)
}

// ════════════════ 3. NÃO INUNDA ════════════════
{
  const muitos = cand(40)
  for (const [nome, texto] of [
    ['comissões', textoComissoesNovas(muitos)],
    ['parados', textoNegociosParados(muitos)],
    ['ranks', textoRanksSubidos(muitos)],
  ] as const) {
    const linhas = texto.split('\n').filter((l) => l.startsWith('• '))
    sim(`${nome}: mostra no máximo ${NOMES_POR_AVISO} nomes`, linhas.length === NOMES_POR_AVISO)
    sim(`${nome}: diz quantos ficaram de fora`, texto.includes(`e mais ${40 - NOMES_POR_AVISO}`))
    sim(`${nome}: diz o total de quantos são`, texto.includes('40'))
  }
  // Com poucos, não há «e mais».
  sim('com poucos não inventa um «e mais»', !textoComissoesNovas(cand(2)).includes('e mais'))
  // As comissões dizem o dinheiro, que é o número que decide se ele pára o que está a fazer —
  // e dizem em voz alta que ninguém pagou nada.
  sim('as comissões dizem o total em euros', textoComissoesNovas(cand(3)).includes('30,00'))
  sim('as comissões avisam que ninguém pagou', /Ninguém pagou nada/.test(textoComissoesNovas(cand(1))))
}

// ════════════════ 4. O VIGIA NÃO AGE ════════════════
{
  // Um cron que aprovasse, pagasse ou movesse um negócio sozinho era o contrário da regra da casa.
  // A única escrita permitida é na sua própria memória.
  for (const proibido of [
    /from\('vendas_comissoes'\)[\s\S]{0,200}\.update\(/,
    /from\('vendas_negocios'\)[\s\S]{0,200}\.update\(/,
    /from\('mlm_commissions'\)[\s\S]{0,200}\.update\(/,
    /from\('mlm_nodes'\)[\s\S]{0,200}\.update\(/,
    /\.delete\(\)/,
    /estado:\s*'aprovada'/,
    /estado:\s*'paga'/,
  ]) {
    sim(`o vigia não faz ${proibido.source.slice(0, 40)}`, !proibido.test(ROTA))
  }
  // O único `upsert`/`insert` é o da memória.
  const escritas = [...ROTA.matchAll(/from\((TABELA|'[a-z_]+')\)[\s\S]{0,80}?\.(insert|upsert|update|delete)\(/g)]
  sim('só há uma escrita, e é na memória dos avisos', escritas.length === 1 && escritas[0][1] === 'TABELA')
  // E a autorização do cron é a da casa — um vigia aberto a toda a gente dava a lista de quem
  // ganha quanto a quem soubesse o URL.
  sim('o vigia exige autorização de cron', /isCronAuthorized\(request\)/.test(ROTA))
  sim('sem autorização responde 401', /status: 401/.test(ROTA))
  // Só escreve para o chat do dono, e esse vem do ambiente (a mesma fonte do `ehChatDeAdmin`).
  sim('manda só para o chat do ambiente', /chatDeAdminDoAmbiente\(\)/.test(ROTA))
  sim('não vai buscar o chat a site_settings', !/telegram_admin_chat_id/.test(ROTA))
}

// ════════════════ 5. MARCA DEPOIS DE ENVIAR ════════════════
{
  const corpo = ROTA.slice(ROTA.indexOf('const tratar'))
  const envio = corpo.indexOf('sendTelegramChannelMessage')
  const marca = corpo.indexOf('marcar.push')
  sim('o envio vem antes de marcar', envio > 0 && marca > envio)
  sim('um envio falhado sai sem marcar', /if \(!r\.ok\) \{[\s\S]{0,160}return\n/.test(corpo))
  // E sem memória o vigia CALA-SE, em vez de repetir para sempre.
  sim('sem a tabela dos avisos, cala-se', /calado: true/.test(ROTA))
  sim('e diz porquê', /migração 132/.test(ROTA))
}

// ════════════════ 6. A MIGRAÇÃO ════════════════
{
  sim('a migração cria a tabela', /create table if not exists public\.bot_avisos_enviados/.test(MIGRACAO))
  sim('a chave do aviso é a chave primária', /chave\s+text\s+primary key/.test(MIGRACAO))
  sim('a tabela tem RLS ligada', /enable row level security/.test(MIGRACAO))
  sim('a tabela está fechada a anon', /revoke all on public\.bot_avisos_enviados from anon, authenticated/.test(MIGRACAO))
  // Uma policy `using (true)` aqui reabria o que a migração fecha.
  sim('não abre policy nenhuma a anon', !/create policy[\s\S]*using \(true\)/i.test(MIGRACAO))
  sim('a rota e a migração falam da mesma tabela', /const TABELA = 'bot_avisos_enviados'/.test(ROTA))
  // E o cron está registado, senão nunca corre.
  const vercel = readFileSync(join(RAIZ, 'vercel.json'), 'utf8')
  sim('o vigia está registado na Vercel', /\/api\/cron\/equipa-vigia/.test(vercel))
  const extra = readFileSync(join(RAIZ, 'lib/telegram-admin-extra.ts'), 'utf8')
  sim('o vigia corre-se também à mão pelo painel', /rota: 'equipa-vigia'/.test(extra))
}

if (falhas.length) {
  console.error(`❌ ${falhas.length} falha(s):`)
  for (const f of falhas) console.error(`   · ${f}`)
}
assert.equal(falhas.length, 0, `${falhas.length} invariante(s) dos avisos partida(s)`)
console.log(`✅ avisos da equipa: ${ok} verificações passaram`)
