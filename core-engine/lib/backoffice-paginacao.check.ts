/**
 * GUARDA da paginação e dos filtros do backoffice.
 *
 * O defeito que isto impede é um limite que MENTE: uma lista com `.limit(500)` e sem paginação
 * mostra 500 linhas na linha 501 com o mesmo aspecto de estar completa, e o negócio que falta não
 * dá erro nenhum. Prova-se aqui que:
 *
 *  · se pede sempre UMA LINHA A MAIS do que se mostra, e é ela que responde «há mais?»;
 *  · a linha extra não se mostra (senão a última página tinha uma linha a mais que as outras);
 *  · `?por_pagina=100000` não passa a ser a maneira de descarregar a base;
 *  · o filtro NÃO se perde ao virar a página;
 *  · o «até» de um dia inclui o dia inteiro;
 *  · o texto de procura não leva caracteres com significado nos filtros do PostgREST.
 *
 *   npx tsx lib/backoffice-paginacao.check.ts
 */
import {
  POR_PAGINA,
  POR_PAGINA_MAX,
  descreverPagina,
  enderecoDaPagina,
  fatiar,
  fimDoDia,
  inicioDoDia,
  lerDia,
  lerDoCatalogo,
  lerPagina,
  lerProcura,
} from './backoffice-paginacao'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => {
  if (!ok) falhas.push(nome)
}

// ── A página pedida ─────────────────────────────────────────────────────────
{
  const p1 = lerPagina(undefined)
  teste('sem endereço, é a primeira página', p1.pagina === 1 && p1.desde === 0)
  teste('⭐ pede-se uma linha a mais do que se mostra', p1.ate - p1.desde === p1.porPagina)
  teste('por omissão são POR_PAGINA linhas', p1.porPagina === POR_PAGINA)

  const p3 = lerPagina({ pagina: '3', por_pagina: '10' })
  teste('a terceira página de 10 começa na linha 20', p3.desde === 20 && p3.ate === 30)

  teste('página 0 ou negativa é a primeira', lerPagina({ pagina: '0' }).pagina === 1 && lerPagina({ pagina: '-4' }).pagina === 1)
  teste('lixo no endereço não parte nada', lerPagina({ pagina: 'ontem', por_pagina: 'muitas' }).pagina === 1)
  teste('⭐ por_pagina tem tecto', lerPagina({ por_pagina: '100000' }).porPagina === POR_PAGINA_MAX)
  teste('por_pagina não pode ser zero', lerPagina({ por_pagina: '0' }).porPagina === 1)
}

// ── A linha extra ───────────────────────────────────────────────────────────
{
  const pagina = lerPagina({ por_pagina: '3' })
  const cheia = fatiar([1, 2, 3, 4], pagina)
  teste('⭐ com a linha extra, há mais', cheia.haMais)
  teste('⭐ e a linha extra não se mostra', cheia.linhas.length === 3)

  const ultima = fatiar([1, 2, 3], pagina)
  teste('sem a linha extra, é tudo', !ultima.haMais && ultima.linhas.length === 3)
  teste('uma lista vazia não inventa mais páginas', !fatiar([], pagina).haMais)

  teste('o texto diz o intervalo e se falta ver', descreverPagina(pagina, 3, true).includes('1–3') && descreverPagina(pagina, 3, true).includes('Há mais'))
  teste('e diz quando é tudo', descreverPagina(pagina, 2, false).includes('É tudo'))
  teste('uma página vazia depois da primeira explica-se', descreverPagina(lerPagina({ pagina: '9' }), 0, false).includes('já não tem linhas'))
}

// ── O filtro não se perde ao virar a página ─────────────────────────────────
{
  const params = { estado: 'marcado', procura: 'joão', pagina: '2' }
  const seguinte = enderecoDaPagina('/backoffice/pipeline', params, 3)
  teste('⭐ virar a página mantém o filtro', seguinte.includes('estado=marcado') && seguinte.includes('procura=jo'))
  teste('e muda a página', seguinte.includes('pagina=3'))
  teste('a primeira página não carrega `pagina=1` no endereço', !enderecoDaPagina('/x', params, 1).includes('pagina='))
  teste('sem filtros nem página, o endereço fica limpo', enderecoDaPagina('/x', {}, 1) === '/x')
}

// ── Dias ────────────────────────────────────────────────────────────────────
{
  teste('um dia é AAAA-MM-DD', lerDia('2026-09-25') === '2026-09-25')
  teste('um instante não é um dia', lerDia('2026-09-25T14:00') === null)
  teste('uma data impossível não é um dia', lerDia('2026-13-45') === null)
  teste('lixo não é um dia', lerDia('ontem') === null && lerDia(undefined) === null)
  teste('o dia começa à meia-noite', inicioDoDia('2026-09-25') === '2026-09-25T00:00:00.000Z')
  // A regra que faz o filtro não «perder» linhas: até ao dia 25 inclui o dia 25 todo.
  teste('⭐ o «até» inclui o dia inteiro', String(fimDoDia('2026-09-25')).startsWith('2026-09-25T23:59:59'))
  teste('sem dia não há limite', inicioDoDia(null) === null && fimDoDia(null) === null)
}

// ── Procura e catálogos ─────────────────────────────────────────────────────
{
  teste('a procura passa o texto normal', lerProcura('  João Silva ') === 'João Silva')
  teste('⭐ a procura não leva caracteres de filtro', lerProcura('%*,()\\') === null)
  teste('e limpa-os do meio do texto', !String(lerProcura('jo%ão')).includes('%'))
  teste('procura vazia é nenhuma procura', lerProcura('   ') === null && lerProcura(undefined) === null)
  teste('a procura tem tecto de tamanho', String(lerProcura('a'.repeat(500))).length === 60)

  const catalogo = ['lead', 'ganho'] as const
  teste('um valor do catálogo passa', lerDoCatalogo('ganho', catalogo) === 'ganho')
  teste('⭐ o que não está no catálogo não filtra nada', lerDoCatalogo('fechadinho', catalogo) === null)
}

if (falhas.length) {
  console.error(`backoffice/paginacao: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice/paginacao: pede-se sempre uma linha a mais, o tecto aguenta, e o filtro não se perde a virar a página ✓')
