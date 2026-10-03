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

/**
 * Cada par é «esta tabela» + «os ficheiros que escrevem nela». O CRM (30/09) entrou aqui no mesmo
 * dia em que nasceu: a tabela das conversas tem colunas com nomes parecidos com as do livro
 * (`ultima_entrada` vs `criado_em`, `telefone` nas duas) e é exactamente o tipo de proximidade que
 * produz o erro que esta guarda existe para apanhar.
 */
const PARES: Array<{ tabela: string; ficheiros: string[]; sonda: Record<string, string> }> = [
  {
    tabela: 'whatsapp_mensagens',
    ficheiros: ['lib/whatsapp-mensageiro.ts', 'app/api/admin/whatsapp/route.ts'],
    // `estado` tem CHECK: só 'recebida' | 'enviada' | 'recusada' | 'falhou'.
    sonda: { telefone: '+000000000000', direcao: 'entrada', estado: 'recebida' },
  },
  {
    tabela: 'whatsapp_conversas',
    ficheiros: ['lib/whatsapp/conversas.ts', 'app/api/admin/whatsapp/crm/route.ts'],
    sonda: { telefone: '+000000000001', estado: 'novo' },
  },
]

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) {
    console.warn('whatsapp/colunas: NÃO VERIFICADO — falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    return
  }

  const db = createClient(url, chave)
  const falhas: string[] = []
  const contagem: string[] = []

  for (const par of PARES) {
    const { tabela, ficheiros } = par

    /**
     * As colunas reais. Lê-se uma linha em vez de consultar o `information_schema` porque o
     * PostgREST não expõe esse esquema — e uma tabela vazia devolveria zero colunas, que é
     * indistinguível de «a tabela não existe». Por isso, com a tabela vazia, insere-se e apaga-se
     * uma linha de sonda, com valores que respeitam os CHECK da tabela: ela impõe as suas regras
     * mesmo a quem só a quer medir.
     */
    let colunas: string[] = []
    const { data } = await db.from(tabela).select('*').limit(1)
    if (data?.[0]) {
      colunas = Object.keys(data[0])
    } else {
      const { data: criada, error } = await db.from(tabela).insert(par.sonda).select().maybeSingle()
      if (error || !criada) {
        console.error(`whatsapp/colunas: não deu para ler as colunas de ${tabela}: ${error?.message ?? 'sem linha'}`)
        process.exit(1)
      }
      colunas = Object.keys(criada)
      await db.from(tabela).delete().eq('id', (criada as { id: string }).id)
    }

    const existentes = new Set(colunas)
    contagem.push(`${tabela}: ${colunas.length}`)

    for (const ficheiro of ficheiros) {
      const fonte = readFileSync(ficheiro, 'utf8')

      // As colunas usadas em filtros: .eq('x', …), .order('x'), .in('x', …)
      for (const m of fonte.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|in|order|ilike)\(\s*'([a-z_]+)'/g)) {
        const coluna = m[1]
        // Só interessa o que é filtro DESTA tabela; outras tabelas têm colunas próprias.
        if (!fonte.slice(Math.max(0, (m.index ?? 0) - 600), m.index).includes(tabela)) continue
        if (!existentes.has(coluna)) falhas.push(`${ficheiro}: filtra por «${coluna}», que ${tabela} não tem`)
      }

      // As colunas escritas: cada objecto de `.insert({...})`/`.update({...})` desta tabela.
      for (const verbo of ['insert', 'update']) {
        let de = 0
        for (;;) {
          const i = fonte.indexOf(`from('${tabela}').${verbo}({`, de)
          if (i < 0) break
          de = i + 1
          const fim = fonte.indexOf('})', i)
          if (fim < 0) break
          for (const m of fonte.slice(i, fim).matchAll(/^\s{4,}([a-z_]+):/gm)) {
            if (!existentes.has(m[1])) falhas.push(`${ficheiro}: escreve em «${m[1]}», que ${tabela} não tem`)
          }
        }
      }
    }

    // E as três que o defeito de 30/09 usou, explicitamente — para o caso de alguém as
    // reintroduzir por outro caminho que os padrões acima não apanhem.
    for (const proibida of ['numero', 'corpo', 'codigo']) {
      if (existentes.has(proibida)) continue
      for (const ficheiro of ficheiros) {
        const fonte = readFileSync(ficheiro, 'utf8')
        const i = fonte.indexOf(`from('${tabela}')`)
        if (i < 0) continue
        const janela = fonte.slice(i, i + 900)
        if (new RegExp(`(^|[^a-z_])${proibida}\\s*:`, 'm').test(janela)) {
          falhas.push(`${ficheiro}: voltou a usar «${proibida}» — foi exactamente o defeito de 30/09`)
        }
      }
    }
  }

  if (falhas.length) {
    console.error(`whatsapp/colunas: ${falhas.length} falha(s)`)
    for (const f of [...new Set(falhas)]) console.error('  · ' + f)
    process.exit(1)
  }
  console.log(`whatsapp/colunas: o código e as tabelas falam a mesma língua ✓ (${contagem.join(' · ')})`)
}

void main()
