/**
 * A GUARDA DO LIVRO DAS MENSAGENS DOS AGENTES — pergunta às tabelas.
 *
 *   set -a; . ./.env.local; set +a
 *   npx tsx lib/agentes/mensagem-livro.check.ts
 *
 * ═══ PORQUE É QUE ISTO EXISTE, COM UM PRECEDENTE DESTA CASA ════════════════════════════════
 *
 * `lib/whatsapp-mensageiro.ts` escreveu durante MESES em colunas que não existem — `numero` em vez
 * de `telefone`, `corpo` em vez de `texto`, e um `codigo` que a tabela nunca teve. O insert falhava
 * a 100% e o `catch` mandava o erro para uma consola que ninguém lê. O livro do WhatsApp esteve
 * vazio durante meses sem uma única queixa, porque não havia nada a que se queixar: tudo respondia
 * 200. Só se descobriu porque a primeira mensagem real não apareceu na base.
 *
 * `lib/agentes/mensagem-livro.ts` tem exactamente a mesma forma de falhar — um `insert` dentro de
 * um `try` que engole, de propósito, para não deitar abaixo um webhook. A diferença entre isso ser
 * uma decisão e ser um defeito é esta guarda.
 *
 * Um typecheck não apanha nada disto: para o TypeScript o objecto passado ao `insert` é um objecto
 * qualquer. Só a tabela sabe.
 *
 * ═══ E PERGUNTA MAIS DUAS COISAS QUE O OUTRO NÃO PERGUNTAVA ════════════════════════════════
 *
 *  · Os CHECK da tabela aceitam os valores que o código escreve? Um `estado` ou um `agente_motivo`
 *    fora da lista é um insert que falha — e falha pelo mesmo caminho silencioso.
 *  · O CHECK da forma do código recusa um cupão de desconto? É a defesa de `pareceCodigoDeAgente`
 *    pela porta da base, e se ela não estiver lá, um `BLACKFRIDAY50` entra e credita a receita de
 *    uma campanha a um agente que não fez nada.
 *
 * ═══ SEM CREDENCIAIS, FALHA ALTO ═══════════════════════════════════════════════════════════
 *
 * Uma guarda que se cala quando não consegue verificar dá falsa confiança. Sem ambiente diz que
 * não verificou e devolve 0 — não bloqueia quem não tem as chaves — mas escreve-o em maiúsculas
 * para ninguém o confundir com «passou».
 */
import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

/** Cada par é «esta tabela» + «os ficheiros que escrevem nela» + uma sonda que respeita os CHECK. */
const PARES: Array<{ tabela: string; ficheiros: string[]; sonda: Record<string, unknown> }> = [
  {
    tabela: 'agentes_mensagens',
    ficheiros: ['lib/agentes/mensagem-livro.ts'],
    sonda: { canal: 'telegram', destino: '__sonda__', estado: 'recusada' },
  },
  {
    tabela: 'telegram_leads',
    ficheiros: ['lib/agentes/mensagem-livro.ts'],
    sonda: { chat_id: '__sonda_agentes__' },
  },
]

/** Os valores que o código escreve em colunas com CHECK. Escritos aqui porque é o que a tabela recusa. */
const VALORES_QUE_O_CODIGO_ESCREVE: Array<{ tabela: string; coluna: string; valores: string[]; fixos: Record<string, unknown> }> = [
  {
    tabela: 'agentes_mensagens',
    coluna: 'canal',
    valores: ['telegram', 'whatsapp', 'instagram'],
    fixos: { destino: '__sonda__', estado: 'enviada' },
  },
  {
    tabela: 'agentes_mensagens',
    coluna: 'estado',
    valores: ['enviada', 'recusada', 'falhou'],
    fixos: { canal: 'telegram', destino: '__sonda__' },
  },
  {
    tabela: 'agentes_mensagens',
    coluna: 'tipo',
    valores: ['texto', 'template', 'resposta_publica', 'dm'],
    fixos: { canal: 'telegram', destino: '__sonda__', estado: 'enviada' },
  },
  {
    /**
     * Os cinco motivos de `MotivoSemCodigoMensagem`. Se a tabela recusar um deles, o insert falha
     * exactamente nos casos em que a mensagem NÃO é atribuível — ou seja, perdia-se o registo das
     * mensagens cuja falta de dono é a coisa que se quer medir.
     */
    tabela: 'agentes_mensagens',
    coluna: 'agente_motivo',
    valores: ['funil_sem_agente', 'post_sem_dono', 'pilar_sem_agente', 'codigo_invalido', 'sem_link_nosso'],
    fixos: { canal: 'telegram', destino: '__sonda__', estado: 'recusada' },
  },
  {
    tabela: 'telegram_leads',
    coluna: 'agente_origem',
    valores: ['start', 'manual'],
    fixos: { chat_id: '__sonda_agentes__' },
  },
]

/** O que a forma do código TEM de recusar, e é a defesa de `pareceCodigoDeAgente` pela base. */
const CODIGOS_QUE_A_BASE_TEM_DE_RECUSAR = ['BLACKFRIDAY50', 'ag-saas', 'AG_SAAS', 'AG-', 'SAAS']
const CODIGOS_QUE_A_BASE_TEM_DE_ACEITAR = ['AG-SAAS', 'AG-SCANNER', 'CEO-MTM']

/**
 * Onde acaba a chamada que abre em `abre` (o índice do `(` do verbo).
 *
 * ═══ ISTO É UMA CORRECÇÃO DA PRÓPRIA GUARDA, E VALE A PENA CONTAR ══════════════════════════
 *
 * A primeira versão procurava o `'})'` mais próximo, copiado de `whatsapp-colunas.check.ts` — onde
 * funciona, porque lá os inserts são todos `insert({` … `})`. Aqui há um `upsert` com DOIS
 * argumentos:
 *
 *     .upsert(
 *       { chat_id, agente_codigo, agente_origem, updated_at },
 *       { onConflict: 'chat_id' },
 *     )
 *
 * Nenhum dos dois objectos acaba em `})`, por isso a procura saltava para o `})` da chamada
 * SEGUINTE e lia os campos de `agentes_mensagens` como se fossem de `telegram_leads`. Resultado:
 * três falhas inventadas («escreve em canal, que telegram_leads não tem») e, pior, as escritas
 * reais de `telegram_leads` deixavam de ser verificadas. Uma guarda que grita no sítio errado
 * ensina a ignorá-la.
 *
 * Contar parênteses é chato e é o que está certo. Devolve -1 se não fechar.
 */
function fimDaChamada(fonte: string, abre: number): number {
  let nivel = 0
  for (let i = abre; i < fonte.length; i++) {
    const c = fonte[i]
    if (c === '(') nivel++
    else if (c === ')') {
      nivel--
      if (nivel === 0) return i
    }
  }
  return -1
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !chave) {
    console.warn(
      'agentes/livro: NÃO VERIFICADO — falta NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY',
    )
    return
  }

  const db = createClient(url, chave)
  const falhas: string[] = []
  const feito: string[] = []

  // ── 1. O código e as tabelas falam a mesma língua? ─────────────────────────────────────────────
  for (const par of PARES) {
    /**
     * As colunas reais. Lê-se uma linha em vez de consultar o `information_schema` porque o
     * PostgREST não o expõe — e uma tabela vazia devolveria zero colunas, que é indistinguível de
     * «a tabela não existe». Com a tabela vazia, insere-se e apaga-se uma sonda que respeita os
     * CHECK: a tabela impõe as suas regras mesmo a quem só a quer medir.
     */
    let colunas: string[] = []
    let sondaId: string | null = null
    const { data } = await db.from(par.tabela).select('*').limit(1)
    if (data?.[0]) {
      colunas = Object.keys(data[0])
    } else {
      const { data: criada, error } = await db.from(par.tabela).insert(par.sonda).select().maybeSingle()
      if (error || !criada) {
        console.error(
          `agentes/livro: não deu para ler as colunas de ${par.tabela}: ${error?.message ?? 'sem linha'}`,
        )
        process.exit(1)
      }
      colunas = Object.keys(criada)
      sondaId = String((criada as Record<string, unknown>).id ?? (criada as Record<string, unknown>).chat_id)
    }

    const existentes = new Set(colunas)
    feito.push(`${par.tabela}: ${colunas.length} colunas`)

    for (const ficheiro of par.ficheiros) {
      const fonte = readFileSync(ficheiro, 'utf8')

      // Filtros: .eq('x', …), .order('x'), .in('x', …)
      for (const m of fonte.matchAll(/\.(?:eq|neq|gt|gte|lt|lte|in|order|ilike)\(\s*'([a-z_]+)'/g)) {
        if (!fonte.slice(Math.max(0, (m.index ?? 0) - 600), m.index).includes(par.tabela)) continue
        if (!existentes.has(m[1])) falhas.push(`${ficheiro}: filtra por «${m[1]}», que ${par.tabela} não tem`)
      }

      // Escritas: cada objecto de `.insert({...})` / `.update({...})` / `.upsert({...})`.
      for (const verbo of ['insert', 'update', 'upsert']) {
        let de = 0
        for (;;) {
          const i = fonte.indexOf(`from('${par.tabela}')`, de)
          if (i < 0) break
          de = i + 1
          const abre = fonte.indexOf(`.${verbo}(`, i)
          // Só conta se o verbo vem logo a seguir a esta tabela, e não a uma tabela mais à frente.
          if (abre < 0 || abre - i > 200) continue
          const fim = fimDaChamada(fonte, abre + verbo.length + 1)
          if (fim < 0) break
          for (const m of fonte.slice(abre, fim).matchAll(/^\s{4,}([a-z_]+):/gm)) {
            if (!existentes.has(m[1])) falhas.push(`${ficheiro}: escreve em «${m[1]}», que ${par.tabela} não tem`)
          }
        }
      }
    }

    if (sondaId) {
      const chave = par.tabela === 'telegram_leads' ? 'chat_id' : 'id'
      await db.from(par.tabela).delete().eq(chave, sondaId)
    }
  }

  // ── 2. Os CHECK aceitam o que o código escreve? ────────────────────────────────────────────────
  for (const v of VALORES_QUE_O_CODIGO_ESCREVE) {
    for (const valor of v.valores) {
      const linha = { ...v.fixos, [v.coluna]: valor }
      const { data, error } = await db.from(v.tabela).insert(linha).select().maybeSingle()
      if (error || !data) {
        falhas.push(
          `${v.tabela}.${v.coluna} RECUSA «${valor}», que o código escreve — o insert falha em ` +
            `silêncio exactamente nesse caso (${error?.message ?? 'sem linha'})`,
        )
        continue
      }
      const chave = v.tabela === 'telegram_leads' ? 'chat_id' : 'id'
      await db.from(v.tabela).delete().eq(chave, String((data as Record<string, unknown>)[chave]))
    }
    feito.push(`${v.tabela}.${v.coluna}: ${v.valores.length} valores aceites`)
  }

  // ── 3. A forma do código recusa um cupão de desconto? ──────────────────────────────────────────
  for (const mau of CODIGOS_QUE_A_BASE_TEM_DE_RECUSAR) {
    const { data, error } = await db
      .from('agentes_mensagens')
      .insert({ canal: 'telegram', destino: '__sonda__', estado: 'enviada', agente_codigo: mau })
      .select()
      .maybeSingle()
    if (!error && data) {
      falhas.push(
        `agentes_mensagens.agente_codigo ACEITOU «${mau}» — a base deixa de ser a última defesa, ` +
          'e a receita de uma campanha de descontos passa a creditar um agente que não fez nada',
      )
      await db.from('agentes_mensagens').delete().eq('id', String((data as { id: string }).id))
    }
  }
  for (const bom of CODIGOS_QUE_A_BASE_TEM_DE_ACEITAR) {
    const { data, error } = await db
      .from('agentes_mensagens')
      .insert({ canal: 'telegram', destino: '__sonda__', estado: 'enviada', agente_codigo: bom })
      .select()
      .maybeSingle()
    if (error || !data) {
      falhas.push(`agentes_mensagens.agente_codigo RECUSA «${bom}», que é um código válido desta casa`)
      continue
    }
    await db.from('agentes_mensagens').delete().eq('id', String((data as { id: string }).id))
  }
  feito.push(
    `forma do código: ${CODIGOS_QUE_A_BASE_TEM_DE_RECUSAR.length} recusados · ${CODIGOS_QUE_A_BASE_TEM_DE_ACEITAR.length} aceites`,
  )

  if (falhas.length) {
    console.error(`agentes/livro: ${falhas.length} falha(s)`)
    for (const f of [...new Set(falhas)]) console.error('  · ' + f)
    process.exit(1)
  }
  console.log(`agentes/livro: o código e as tabelas falam a mesma língua ✓ (${feito.join(' · ')})`)
}

void main()
