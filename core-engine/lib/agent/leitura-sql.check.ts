/**
 * A GUARDA DA LEITURA DO AIOS.
 *
 *   npx tsx lib/agent/leitura-sql.check.ts
 *
 * Isto decide o que um assistente de VOZ pode perguntar à base de produção. Entre o que o dono diz
 * e o que chega aqui há um microfone, um reconhecedor de fala e um modelo de linguagem — e nenhum
 * dos três tem culpa quando a frase sai outra. A guarda é o último sítio onde isso se trava.
 *
 * Quase tudo aqui é o caso mau. Uma consulta a mais que passe não dá erro nenhum.
 */
import { COLUNAS_PROIBIDAS, LIMITE_LINHAS, TABELAS_PROIBIDAS, validarLeitura } from './leitura-sql'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

// ── O que passa ─────────────────────────────────────────────────────────────
{
  const r = validarLeitura('select nome, email from vendas_negocios where estado = \'lead\'')
  teste('uma leitura normal passa', r.pode)
  teste('e ganha limite', r.sql?.includes(`LIMIT ${LIMITE_LINHAS}`) === true)

  const comLimite = validarLeitura('select id from profiles limit 10')
  teste('um limite pequeno mantém-se', comLimite.sql?.includes('limit 10') === true)

  const limiteGrande = validarLeitura('select id from profiles limit 99999')
  teste('um limite grande é cortado', limiteGrande.sql?.includes(`LIMIT ${LIMITE_LINHAS}`) === true)

  teste('ponto e vírgula no fim é tolerado', validarLeitura('select id from profiles;').pode)
  teste('um WITH legítimo passa', validarLeitura('with x as (select id from profiles) select id from x').pode)
}

/**
 * ── O CASO QUE PAGA ESTE FICHEIRO ───────────────────────────────────────────
 *
 * Começa por WITH, acaba em SELECT, e apaga a tabela toda. Uma validação que olhasse só para a
 * primeira palavra deixava passar isto.
 */
{
  const cavalo = validarLeitura('with x as (delete from profiles returning *) select id from x')
  teste('WITH … DELETE … SELECT é recusado', !cavalo.pode)
  teste('e o motivo nomeia o verbo', cavalo.porque.includes('delete'))

  teste('update escondido a meio é recusado',
    !validarLeitura('select id from profiles where id in (select id from (update profiles set is_active = false returning id) u)').pode)
}

// ── Escritas directas ───────────────────────────────────────────────────────
{
  for (const mau of [
    'delete from profiles',
    'drop table vendas_negocios',
    'update profiles set user_type = \'admin\'',
    'insert into profiles (id) values (1)',
    'truncate vendas_tarefas',
    'grant all on profiles to anon',
    'alter table profiles disable row level security',
    'create function x() returns void as $$ $$ language sql',
  ]) {
    teste(`«${mau.slice(0, 28)}…» é recusado`, !validarLeitura(mau).pode)
  }
}

// ── Encadear uma segunda instrução ──────────────────────────────────────────
{
  const duas = validarLeitura('select id from profiles; delete from profiles')
  teste('duas instruções são recusadas', !duas.pode)
  teste('e o motivo fala do ponto e vírgula', duas.porque.includes('ponto e vírgula'))
}

// ── Comentários a esconder o verbo ──────────────────────────────────────────
{
  /**
   * Os comentários são REMOVIDOS antes de se procurar o que quer que seja, e é isso que se prova
   * aqui pelos dois lados:
   *
   *  · uma palavra perigosa DENTRO de um comentário é inofensiva — não executa — e por isso a
   *    consulta passa. Recusá-la seria bloquear trabalho legítimo por causa de uma nota escrita;
   *  · uma instrução a seguir a um comentário de linha NÃO é inofensiva: o `--` só apaga até ao
   *    fim da linha, e o que vem na linha seguinte executa. Essa tem de cair.
   */
  teste('a palavra perigosa dentro de um comentário não bloqueia',
    validarLeitura('select id /* delete */ from profiles').pode)
  teste('mas uma instrução depois do comentário de linha cai',
    !validarLeitura('select id from profiles\n-- nada\n; delete from profiles').pode)
}

// ── Credenciais ─────────────────────────────────────────────────────────────
{
  for (const c of COLUNAS_PROIBIDAS.slice(0, 6)) {
    const r = validarLeitura(`select ${c} from mtm_trading_accounts`)
    teste(`«${c}» não sai`, !r.pode)
    teste(`e diz que é credencial (${c})`, r.porque.includes('credencial'))
  }
  for (const t of TABELAS_PROIBIDAS) {
    teste(`«${t}» não se lê`, !validarLeitura(`select id from ${t}`).pode)
  }
}

/**
 * ── O SELECT * ──────────────────────────────────────────────────────────────
 * Recusado não por estilo: um `*` traz as colunas que amanhã alguém acrescentar, incluindo uma
 * credencial nova numa tabela que hoje é inofensiva.
 */
{
  const estrela = validarLeitura('select * from profiles')
  teste('select * é recusado', !estrela.pode)
  teste('e explica porquê', estrela.porque.includes('ainda não existem'))
}

// ── Lixo ────────────────────────────────────────────────────────────────────
{
  teste('vazio não passa', !validarLeitura('').pode)
  teste('espaços não passam', !validarLeitura('    ').pode)
  teste('texto solto não passa', !validarLeitura('mostra-me os clientes').pode)
  teste('consulta gigante não passa', !validarLeitura('select id from x where ' + 'a=1 and '.repeat(600)).pode)
  teste('há sempre motivo escrito', validarLeitura('mostra-me os clientes').porque.length > 15)
}

if (falhas.length) {
  console.error(`agent/leitura-sql: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('agent/leitura-sql: só leitura, sem credenciais, e o WITH…DELETE…SELECT travado ✓')
