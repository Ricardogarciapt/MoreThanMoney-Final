/**
 * A GUARDA DAS PORTAS DO LIVRO DE VENDAS — nenhuma pode esquecer o código do agente.
 *
 *   npx tsx lib/agentes/portas-receita.check.ts
 *
 * ═══ O CASO MAU QUE ISTO EXISTE PARA APANHAR ═══════════════════════════════════════════════
 *
 * Cinco caminhos escrevem no livro de vendas. Se um deles não passar `agenteCodigo`:
 *
 *  · **não há erro.** O `insert` corre, a venda fica registada, o cliente recebe o que pagou;
 *  · a coluna fica nula, e `lib/agentes/receita.ts` lê nulo como «sem_codigo» — que em português
 *    quer dizer «não há como saber quem a trouxe». É indistinguível de uma venda que nenhum agente
 *    trouxe de facto;
 *  · a régua das 48 h (`lib/agentes/vida.ts`) julga o agente por receita menos gasto na janela, não
 *    encontra receita, e PÁRA-O. O motivo escrito na linha parece sólido a quem o ler meses depois.
 *
 * É literalmente o defeito de 01/10 outra vez (receita verdadeira, ZERO atribuído), visto de outro
 * sítio. E é um defeito que se instala por omissão: ninguém tem de escrever nada de errado — basta
 * uma porta nova, ou um refactor que largue o campo, e a medição desta porta desaparece calada.
 *
 * ═══ PORQUE É QUE ISTO LÊ O CÓDIGO-FONTE EM VEZ DE CORRER A FUNÇÃO ═════════════════════════
 *
 * Porque o que falha não é uma conta: é uma LIGAÇÃO que não foi feita. Nenhum teste de
 * comportamento apanha um argumento que ninguém passou — a função devolve exactamente o mesmo, só
 * com menos informação. O que se pode verificar é que cada porta nomeia o campo, e é isso que se
 * faz, pelo mesmo método que `lib/vendas/atribuicao.check.ts` já usa para garantir que as portas do
 * dinheiro procuram o negócio todas da mesma maneira.
 */
import { readFileSync } from 'node:fs'
import { normalizar, pareceCodigoDeAgente } from './atribuicao'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

/** O ficheiro sem comentários: um campo mencionado só num comentário não alimenta coluna nenhuma. */
const semComentarios = (caminho: string): string =>
  readFileSync(caminho, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

/**
 * AS CINCO PORTAS, como `docs/maquina-de-vendas-autonoma.md` §6 as enumerou.
 *
 * A lista está aqui à mão de propósito: é uma DECISÃO sobre o que conta como porta do dinheiro, e
 * uma lista descoberta por `grep` crescia sozinha com qualquer ficheiro de teste que mencionasse a
 * função. Uma porta nova tem de ser acrescentada por uma pessoa — e é nessa altura que alguém
 * pensa se ela também tem de medir.
 */
const PORTAS = [
  'app/api/stripe/webhook/route.ts',
  'app/api/apple/iap/validate/route.ts',
  'app/api/apple/iap/webhook/route.ts',
  'app/api/admin/vendas/vendas/route.ts',
  'lib/marketplace/venda-equipa.ts',
] as const

for (const porta of PORTAS) {
  const limpo = semComentarios(porta)
  // Esta é a confirmação de que a porta continua a ser uma porta: se deixar de registar vendas, a
  // lista acima está errada e tem de ser corrigida por alguém, não ignorada.
  teste(
    `${porta} continua a registar vendas no livro`,
    /registarVendaConfirmada\(|registarVendaDaEquipa\(/.test(limpo),
  )
  // E a que importa: nomeia o campo. Passar `null` explicitamente CONTA — é uma decisão escrita
  // (as renovações do Stripe e as notificações da Apple não têm código nenhum para passar, e isso
  // está declarado no sítio em vez de ficar por omissão).
  teste(`${porta} passa agenteCodigo ao livro`, /agenteCodigo\s*:/.test(limpo))
}

// ── TODAS as chamadas ao livro dentro de cada porta, não só a primeira ──
//
// O caso mau concreto: o webhook do Stripe tem QUATRO chamadas. Um `grep` que se contente com uma
// ocorrência dá verde com três delas a perder a medição.
{
  const fonte = semComentarios('app/api/stripe/webhook/route.ts')
  const chamadas = fonte.split('registarVendaDaEquipa({').length - 1
  teste('o webhook do Stripe tem mais do que uma chamada ao livro', chamadas > 1)
  // Cada chamada tem de ter um `agenteCodigo:` antes de a seguinte começar.
  const blocos = fonte.split('registarVendaDaEquipa({').slice(1)
  for (let i = 0; i < blocos.length; i++) {
    const bloco = blocos[i].slice(0, 1200)
    teste(`a ${i + 1}.ª chamada do webhook do Stripe leva agenteCodigo`, /agenteCodigo\s*:/.test(bloco))
  }
}

// ── O LIVRO GRAVA MESMO A COLUNA ──
//
// As portas podem passar o campo todas certinhas e o livro deitá-lo fora. Aí a medição falha uma
// só vez, em silêncio, para as cinco portas de uma vez — o pior de todos os casos.
{
  const livro = semComentarios('lib/vendas/livro.ts')
  teste('o livro recebe o campo', /agenteCodigo\?:\s*string/.test(readFileSync('lib/vendas/livro.ts', 'utf8')))
  teste('o livro escreve a coluna', /agente_codigo:/.test(livro))
  // E NORMALIZA antes de escrever: sem isto, um `?ag=BLACKFRIDAY50` que chegasse por qualquer
  // caminho creditava a receita de uma campanha de descontos a um agente que não fez nada. O CHECK
  // da coluna (migração 170) recusa-o — mas recusa a venda INTEIRA, e uma venda que não se registra
  // por causa da medição dela é exactamente a troca que esta casa não faz.
  teste(
    'o livro normaliza o código antes de o escrever',
    /agente_codigo:\s*normalizarCodigoDeAgente\(/.test(livro),
  )
}

// ── A LEITURA PREFERE A LIGAÇÃO FORTE ──
//
// A coluna da venda é exacta; o `profiles.coupon_code` é por pessoa e é sobrescrito pelo último
// código que ela usar. Se a ordem se invertesse, um código antigo do comprador roubava o crédito de
// uma venda que já traz o seu — e nada disso dá erro.
{
  const receita = semComentarios('lib/agentes/receita.ts')
  teste('a receita lê a coluna do livro', /agente_codigo/.test(receita))
  const i = receita.indexOf('const doLivro')
  const j = receita.indexOf('const doPerfil')
  teste('o código da venda é lido antes do do perfil', i > 0 && j > i)
  teste('e o da venda ganha', /doLivro\s*\|\|\s*doPerfil/.test(receita))
  teste('a ligação da coluna conta como exacta', /doLivro\s*\?\s*'na_compra'/.test(receita))
}

// ── O CHECK DA BASE E A FORMA DO CÓDIGO SÃO A MESMA REGRA ──
//
// Duas cópias do mesmo `regex` divergem. Se a migração aceitar formas que o código recusa, há
// códigos na base que a medição nunca lê; se recusar formas que o código aceita, o `insert` da
// venda REBENTA — e aí uma venda legítima não se registra por causa de um link mal copiado.
{
  const sql = readFileSync('supabase/migrations/170_livro_de_vendas_agente_codigo.sql', 'utf8')
  const m = sql.match(/agente_codigo\s*~\s*'([^']+)'/)
  teste('a migração tem o CHECK da forma', !!m)
  if (m) {
    const daBase = new RegExp(m[1].replace(/''/g, "'"))
    /**
     * A INVARIANTE NÃO É «OS DOIS REGEX SÃO IGUAIS» — e esta guarda apanhou-me a escrevê-la assim.
     *
     * `pareceCodigoDeAgente('ag-saas')` é VERDADE (ele passa a maiúsculas antes de testar) e o
     * CHECK da base recusa `ag-saas`, porque o `~` do Postgres distingue maiúsculas. Os dois
     * discordam, e está certo que discordem: entre eles está sempre `normalizar()`, que é quem
     * escreve.
     *
     * O que tem de ser verdade, e é isto que se prova:
     *
     *  · **tudo o que `normalizar()` devolve passa o CHECK.** Se não passasse, o `insert` da venda
     *    rebentava — e uma venda legítima deixava de se registar por causa da medição dela, que é
     *    a troca que esta casa não faz;
     *  · **o que `normalizar()` recusa nunca chega à base** (vai nulo), por isso o CHECK não tem de
     *    ter opinião sobre ele.
     */
    const casos = [
      'AG-SAAS', 'CEO-MTM', 'AG-X1', 'AG-FORMACAO', 'ag-saas', '  ag-saas  ', 'AG-SAAS.',
      'BLACKFRIDAY50', 'AG-', 'AG-A', 'XX-SAAS', '',
    ]
    for (const c of casos) {
      const escrito = normalizar(c)
      if (escrito === null) continue
      teste(`o que o código escreve passa o CHECK da base: «${c}» → «${escrito}»`, daBase.test(escrito))
    }
    // E o CHECK não é largo demais: o que ele aceita tem de ser reconhecido como código de agente,
    // senão a base deixava entrar à mão o que o código recusa — e `receita.ts` creditava-o.
    for (const c of ['AG-SAAS', 'CEO-MTM', 'BLACKFRIDAY50', 'XX-SAAS', 'AG-A']) {
      if (!daBase.test(c)) continue
      teste(`o que o CHECK aceita é código de agente: «${c}»`, pareceCodigoDeAgente(c))
    }
  }
  // E o lançamento dos 35 € ao CEO não pode pisar código legítimo de vendas futuras: sem o
  // `is null`, uma segunda passagem da migração tirava a receita a um filho e dava-a ao pai.
  teste('o lançamento ao CEO só toca em vendas sem código', /agente_codigo is null/.test(sql))
  teste('e não soma a receita dos filhos ao pai', /não|NÃO/.test(sql) && !/sum\(.*filho/i.test(sql))
}

// ── A NORMALIZAÇÃO NÃO DEIXA PASSAR O QUE NÃO É CÓDIGO DE AGENTE ──
// (A forma tem guarda própria em `atribuicao.check.ts`; aqui prova-se só o que o livro depende.)
teste('um cupão de desconto não é código de agente', normalizar('BLACKFRIDAY50') === null)
teste('um código de agente com ponto colado continua a valer', normalizar('AG-SAAS.') === 'AG-SAAS')
teste('minúsculas normalizam', normalizar('ag-saas') === 'AG-SAAS')
teste('nada não é nada', normalizar(null) === null && normalizar('') === null)

if (falhas.length) {
  console.error(`agentes/portas-receita: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'agentes/portas-receita: as cinco portas alimentam a coluna, o livro grava-a normalizada, e a ligação forte ganha ao perfil ✓',
)
