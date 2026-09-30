/**
 * A GUARDA DOS NOMES DAS COLUNAS DO LIVRO DO WHATSAPP.
 *
 *   set -a; . ./.env.local; set +a
 *   npx tsx lib/whatsapp-colunas.check.ts
 *
 * ═══ PORQUE É QUE ISTO EXISTE ══════════════════════════════════════════════════════════════
 *
 * Porque `lib/whatsapp-mensageiro.ts` escreveu durante meses em colunas que não existem —
 * `numero` em vez de `telefone`, `corpo` em vez de `texto`, e um `codigo` que a tabela nunca teve.
 * O insert falhava a 100% e o `catch` mandava o erro para uma consola que ninguém lê. A leitura
 * tinha o mesmo defeito: filtrava por `numero`, não encontrava nada, e concluía «nunca escreveu» —
 * ou seja, fechava a janela de 24 horas a quem tinha acabado de nos escrever.
 *
 * Nada disto dava erro. Tudo respondia 200. Só se descobriu porque a primeira mensagem real não
 * apareceu na base — e sem essa mensagem podia ter ficado lá mais uns meses.
 *
 * Um typecheck não apanha isto: para o TypeScript, o objecto passado ao `insert` é um objecto
 * qualquer. Só a tabela sabe. Por isso esta guarda PERGUNTA À TABELA.
 *
 * ═══ SEM CREDENCIAIS, FALHA ALTO ═══════════════════════════════════════════════════════════
 *
 * Uma guarda que se cala quando não consegue verificar é uma guarda que dá falsa confiança. Sem
 * ambiente, esta diz que não verificou e devolve código de saída 0 — não bloqueia quem não tem as
 * chaves — mas escreve-o em maiúsculas para ninguém o confundir com «passou».
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

const TABELA = 'whatsapp_mensagens'
const FICHEIROS = ['lib/whatsapp-mensageiro.ts', 'app/api/admin/whatsapp/route.ts']

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) {
    console.warn('whatsapp/colunas: NÃO VERIFICADO — falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    return
  }

  const db = createClient(url, chave)

  /**
   * As colunas reais. Lê-se uma linha em vez de consultar o `information_schema` porque o PostgREST
   * não expõe esse esquema — e uma tabela vazia devolveria zero colunas, que é indistinguível de
   * «a tabela não existe». Por isso, com a tabela vazia, insere-se e apaga-se uma linha de sonda.
   */
  let colunas: string[] = []
  const { data } = await db.from(TABELA).select('*').limit(1)
  if (data?.[0]) {
    colunas = Object.keys(data[0])
  } else {
    // `estado` tem CHECK: só 'recebida' | 'enviada' | 'recusada' | 'falhou'. A sonda usa um valor
    // legítimo — a tabela impõe as suas regras mesmo a quem só a quer medir.
    const sonda = { telefone: '+000000000000', direcao: 'entrada', estado: 'recebida' }
    const { data: criada, error } = await db.from(TABELA).insert(sonda).select().maybeSingle()
    if (error || !criada) {
      console.error(`whatsapp/colunas: não deu para ler as colunas de ${TABELA}: ${error?.message ?? 'sem linha'}`)
      process.exit(1)
    }
    colunas = Object.keys(criada)
    await db.from(TABELA).delete().eq('id', (criada as { id: string }).id)
  }

  const existentes = new Set(colunas)
  const falhas: string[] = []

  for (const ficheiro of FICHEIROS) {
    const fonte = readFileSync(ficheiro, 'utf8')

    // As colunas usadas em filtros: .eq('x', …), .order('x'), .in('x', …)
    for (const m of fonte.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|in|order|ilike)\(\s*'([a-z_]+)'/g)) {
      const coluna = m[1]
      // Só interessa o que é filtro DESTA tabela; outras tabelas têm colunas próprias.
      if (!fonte.slice(Math.max(0, m.index - 600), m.index).includes(TABELA)) continue
      if (!existentes.has(coluna)) falhas.push(`${ficheiro}: filtra por «${coluna}», que ${TABELA} não tem`)
    }

    // As colunas escritas: o objecto do .insert({...}) que se segue à tabela.
    const i = fonte.indexOf(`from('${TABELA}').insert({`)
    if (i >= 0) {
      const corpo = fonte.slice(i, fonte.indexOf('})', i))
      for (const m of corpo.matchAll(/^\s{4,}([a-z_]+):/gm)) {
        if (!existentes.has(m[1])) falhas.push(`${ficheiro}: escreve em «${m[1]}», que ${TABELA} não tem`)
      }
    }
  }

  // E as três que o defeito de 30/09 usou, explicitamente — para o caso de alguém as reintroduzir
  // por outro caminho que os padrões acima não apanhem.
  for (const proibida of ['numero', 'corpo', 'codigo']) {
    if (existentes.has(proibida)) continue
    for (const ficheiro of FICHEIROS) {
      const fonte = readFileSync(ficheiro, 'utf8')
      const i = fonte.indexOf(`from('${TABELA}')`)
      if (i < 0) continue
      const janela = fonte.slice(i, i + 900)
      if (new RegExp(`(^|[^a-z_])${proibida}\\s*:`, 'm').test(janela)) {
        falhas.push(`${ficheiro}: voltou a usar «${proibida}» — foi exactamente o defeito de 30/09`)
      }
    }
  }

  if (falhas.length) {
    console.error(`whatsapp/colunas: ${falhas.length} falha(s)`)
    for (const f of [...new Set(falhas)]) console.error('  · ' + f)
    process.exit(1)
  }
  console.log(`whatsapp/colunas: o código e a tabela ${TABELA} falam a mesma língua ✓ (${colunas.length} colunas)`)
}

void main()
