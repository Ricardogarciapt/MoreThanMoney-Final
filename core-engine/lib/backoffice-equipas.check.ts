/**
 * GUARDA do modelo de equipas. Uma linha numa tabela de equipa dá a alguém o extracto de outro
 * alguém: a pergunta destas verificações não é «funciona?» é «o que é que abre sozinho quando
 * alguém mexer nisto?».
 *
 * O modo de falhar que interessa evitar é SEMPRE o mesmo, e é silencioso: a leitura da equipa
 * devolver gente a mais (ou devolver gente quando devia devolver nada) e no ecrã aparecerem linhas
 * de terceiros em vez de um erro.
 *
 *   npx tsx lib/backoffice-equipas.check.ts
 */
import { readFileSync } from 'node:fs'
import { capacidadesDe } from './backoffice-papeis'
import { ambitoDaEquipa, equipaDoMembro, equipasQueLidera, lideradosDe, membrosDasEquipas } from './backoffice-equipas'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }
const espera: Array<Promise<void>> = []
const testeAsync = (nome: string, correr: () => Promise<boolean>) => {
  espera.push(correr().then((ok) => { if (!ok) falhas.push(nome) }, () => { falhas.push(nome + ' (lançou)') }))
}

/**
 * Um duplo do PostgREST com o mínimo de cadeia que estas funções usam. Existe para o comportamento
 * de FECHAR poder ser testado sem base de dados: uma guarda que precisa de uma ligação viva não
 * corre em CI e, na prática, não corre nunca.
 */
function fake(tabelas: Record<string, Array<Record<string, unknown>>>, opts?: { erroEm?: string; rebenta?: boolean }) {
  return {
    from(tabela: string) {
      if (opts?.rebenta) throw new Error('base em baixo')
      const filtros: Array<(l: Record<string, unknown>) => boolean> = []
      const api: any = {
        select: () => api,
        eq: (c: string, v: unknown) => { filtros.push((l) => l[c] === v); return api },
        is: (c: string, v: unknown) => { filtros.push((l) => (v === null ? l[c] == null : l[c] === v)); return api },
        in: (c: string, vs: unknown[]) => { filtros.push((l) => vs.includes(l[c] as never)); return api },
        then: (resolver: (r: unknown) => unknown) =>
          Promise.resolve(resolver(resultado())),
        maybeSingle: () => {
          const r = resultado()
          return Promise.resolve({ data: (r.data as unknown[])[0] ?? null, error: r.error })
        },
      }
      function resultado() {
        if (opts?.erroEm === tabela) return { data: null, error: { message: 'boom' } }
        const linhas = (tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)))
        return { data: linhas, error: null }
      }
      return api
    },
  }
}

const EQUIPA = { id: 'e1', nome: 'Closers PT', lider_id: 'lider', criada_em: '2026-09-25', arquivada_em: null, nota: null }
const BASE = {
  backoffice_equipas: [EQUIPA],
  backoffice_equipa_membros: [
    { id: 'm1', equipa_id: 'e1', membro_id: 'ana', desde: '2026-09-25', ate: null, nota: null },
    { id: 'm2', equipa_id: 'e1', membro_id: 'bruno', desde: '2026-09-25', ate: null, nota: null },
    // Já saiu: não pode aparecer. Uma pertença fechada é histórico, nunca permissão.
    { id: 'm3', equipa_id: 'e1', membro_id: 'carla', desde: '2026-08-01', ate: '2026-09-01', nota: null },
  ],
}

// ── O caminho normal ─────────────────────────────────────────────────────────
testeAsync('lidera a sua equipa', async () => (await equipasQueLidera(fake(BASE), 'lider')).length === 1)
testeAsync('liderados são os activos', async () => {
  const ids = await lideradosDe(fake(BASE), 'lider')
  return ids.length === 2 && ids.includes('ana') && ids.includes('bruno')
})
testeAsync('quem já saiu NÃO aparece', async () => !(await lideradosDe(fake(BASE), 'lider')).includes('carla'))
testeAsync('quem não lidera nada não lê ninguém', async () => (await lideradosDe(fake(BASE), 'ana')).length === 0)

// ── Na dúvida, VAZIO. É a regra que impede uma avaria de virar fuga de dados. ──
testeAsync('erro a ler equipas → vazio', async () =>
  (await lideradosDe(fake(BASE, { erroEm: 'backoffice_equipas' }), 'lider')).length === 0)
testeAsync('erro a ler membros → vazio', async () =>
  (await lideradosDe(fake(BASE, { erroEm: 'backoffice_equipa_membros' }), 'lider')).length === 0)
testeAsync('excepção → vazio, não lança', async () =>
  (await lideradosDe(fake(BASE, { rebenta: true }), 'lider')).length === 0)
testeAsync('id vazio → vazio', async () => (await lideradosDe(fake(BASE), '')).length === 0)

// ── Equipa arquivada deixa de dar acesso NO MOMENTO em que é arquivada ───────
const ARQUIVADA = { ...BASE, backoffice_equipas: [{ ...EQUIPA, arquivada_em: '2026-09-25' }] }
testeAsync('equipa arquivada não dá liderados', async () => (await lideradosDe(fake(ARQUIVADA), 'lider')).length === 0)
testeAsync('equipa arquivada não é o responsável de ninguém', async () =>
  (await equipaDoMembro(fake(ARQUIVADA), 'ana')) === null)
testeAsync('o membro sabe a quem responde', async () =>
  (await equipaDoMembro(fake(BASE), 'ana'))?.equipa.liderId === 'lider')

// ── O âmbito: a capacidade manda, a equipa só fornece ───────────────────────
const lider = capacidadesDe(['team_leader'])
const closer = capacidadesDe(['closer'])

testeAsync('team leader vê-se a si + a equipa', async () => {
  const a = await ambitoDaEquipa(fake(BASE), { userId: 'lider', capacidades: lider }, 'extracto')
  return a.ids.length === 3 && a.ids.includes('lider') && a.ids.includes('ana') && !a.todos
})
// O caso que separa colegas: um closer que (por engano de dados) fosse líder de uma equipa não
// passa a ver ninguém, porque não tem a capacidade. A decisão é do modelo de papéis, não da tabela.
testeAsync('closer só se vê a si, mesmo liderando uma equipa', async () => {
  const a = await ambitoDaEquipa(fake(BASE), { userId: 'lider', capacidades: closer }, 'extracto')
  return a.ids.length === 1 && a.ids[0] === 'lider'
})
// E por família: quem tem equipa no extracto mas não nas leads não vê as leads dos outros. Aqui o
// team_leader tem as duas, por isso o teste é o inverso — que a família certa é consultada.
// Sem a capacidade não se PERGUNTA. Provar isto com uma base que rebenta não provava nada — o
// `catch` de `lideradosDe` devolvia `[]` e o teste passava mesmo com a verificação removida. Por
// isso conta-se quem tocou na tabela: é a única forma de a guarda morder se alguém tirar o
// pré-teste e ficar só com a defesa de `ambitoDeLeitura` a segurar tudo sozinha.
testeAsync('sem capacidade da família não vai sequer à base', async () => {
  const tocadas: string[] = []
  const espia = { from: (t: string) => { tocadas.push(t); return (fake(BASE) as any).from(t) } }
  const a = await ambitoDaEquipa(espia, { userId: 'lider', capacidades: closer }, 'leads')
  return a.ids.length === 1 && a.ids[0] === 'lider' && tocadas.length === 0
})
// E com a capacidade, pergunta — senão o teste de cima passava por a função não fazer nada.
testeAsync('com a capacidade, vai à base', async () => {
  const tocadas: string[] = []
  const espia = { from: (t: string) => { tocadas.push(t); return (fake(BASE) as any).from(t) } }
  await ambitoDaEquipa(espia, { userId: 'lider', capacidades: lider }, 'leads')
  return tocadas.includes('backoffice_equipas')
})
testeAsync('avaria da base → só se vê a si (não rebenta a página)', async () => {
  const a = await ambitoDaEquipa(fake(BASE, { rebenta: true }), { userId: 'lider', capacidades: lider }, 'extracto')
  return a.ids.length === 1 && a.ids[0] === 'lider'
})

// ── A PERTENÇA, para o ecrã da equipa ────────────────────────────────────────
//
// `lideradosDe` achata; esta devolve quem pertence a QUE equipa. Um líder com duas equipas tem de
// as ver separadas, e quem já saiu continua a não aparecer — histórico não é permissão.
testeAsync('os membros vêm com a equipa a que pertencem', async () => {
  const ms = await membrosDasEquipas(fake(BASE), ['e1'])
  return ms.length === 2 && ms.every((m) => m.equipaId === 'e1') && !ms.some((m) => m.membroId === 'carla')
})
testeAsync('sem equipas não se lê pertença nenhuma', async () => (await membrosDasEquipas(fake(BASE), [])).length === 0)
testeAsync('erro a ler pertenças → vazio', async () =>
  (await membrosDasEquipas(fake(BASE, { erroEm: 'backoffice_equipa_membros' }), ['e1'])).length === 0)
testeAsync('excepção a ler pertenças → vazio, não lança', async () =>
  (await membrosDasEquipas(fake(BASE, { rebenta: true }), ['e1'])).length === 0)

// ── COM EQUIPA LIGADA: o líder vê os liderados, o setter continua fechado ────
//
// Isto é a prova de que as duas peças se encontraram. Não chega o modelo estar certo: o que abre
// (ou não abre) o dinheiro de alguém é o âmbito que a página usa. As duas afirmações têm de ser
// verdade AO MESMO TEMPO, senão ou o líder não vê a equipa ou o setter vê a dos outros.
const setter = capacidadesDe(['setter'])
testeAsync('com equipa ligada, o team leader vê os liderados no âmbito', async () => {
  const a = await ambitoDaEquipa(fake(BASE), { userId: 'lider', capacidades: lider }, 'tarefas')
  return a.ids.includes('ana') && a.ids.includes('bruno') && a.ids.includes('lider') && !a.todos
})
testeAsync('e o setter, na mesma base, continua a ver só o dele', async () => {
  // O setter até é membro de uma equipa — ser liderado não dá acesso nenhum, só ser líder dá.
  const a = await ambitoDaEquipa(fake(BASE), { userId: 'ana', capacidades: setter }, 'pipeline')
  return a.ids.length === 1 && a.ids[0] === 'ana' && !a.todos
})
testeAsync('um setter que (por engano) liderasse uma equipa continuava fechado', async () => {
  const a = await ambitoDaEquipa(fake(BASE), { userId: 'lider', capacidades: setter }, 'pipeline')
  return a.ids.length === 1 && a.ids[0] === 'lider'
})

// ── UM NÍVEL, SEM CADEIA: o líder de líderes NÃO vê os netos ─────────────────
//
// Decisão explícita do dono (migração 131, decisão 2). É a regra mais fácil de atravessar sem
// querer — bastava expandir a lista em cinco linhas — e a que dá acesso a linhas de gente que o
// líder de cima nunca conheceu. Por isso tem guarda própria.
const CADEIA = {
  backoffice_equipas: [
    { id: 'e1', nome: 'Chefes', lider_id: 'chefe', criada_em: '2026-09-01', arquivada_em: null, nota: null },
    { id: 'e2', nome: 'Campo', lider_id: 'lider2', criada_em: '2026-09-01', arquivada_em: null, nota: null },
  ],
  backoffice_equipa_membros: [
    { id: 'm1', equipa_id: 'e1', membro_id: 'lider2', desde: '2026-09-01', ate: null, nota: null },
    { id: 'm2', equipa_id: 'e2', membro_id: 'neto', desde: '2026-09-01', ate: null, nota: null },
  ],
}
testeAsync('o chefe vê o líder abaixo dele', async () => {
  const ids = await lideradosDe(fake(CADEIA), 'chefe')
  return ids.length === 1 && ids[0] === 'lider2'
})
testeAsync('o chefe NÃO vê o neto (a cadeia não se atravessa)', async () =>
  !(await lideradosDe(fake(CADEIA), 'chefe')).includes('neto'))
testeAsync('nem pelo âmbito — que é o que a página usa', async () => {
  const a = await ambitoDaEquipa(fake(CADEIA), { userId: 'chefe', capacidades: lider }, 'extracto')
  return a.ids.length === 2 && a.ids.includes('chefe') && a.ids.includes('lider2') && !a.ids.includes('neto')
})
// A pertença NÃO atravessa a cadeia: pedir as equipas de cima não traz os membros das de baixo.
testeAsync('a pertença não traz os netos', async () => {
  const ms = await membrosDasEquipas(fake(CADEIA), ['e1'])
  return ms.length === 1 && ms[0].membroId === 'lider2'
})
testeAsync('e o líder do meio vê o SEU liderado, não o de cima', async () => {
  const a = await ambitoDaEquipa(fake(CADEIA), { userId: 'lider2', capacidades: lider }, 'extracto')
  return a.ids.length === 2 && a.ids.includes('lider2') && a.ids.includes('neto') && !a.ids.includes('chefe')
})

// ── O que a MIGRAÇÃO tem de continuar a garantir ─────────────────────────────
const sql = readFileSync('supabase/migrations/131_backoffice_equipas.sql', 'utf8')
teste('retirar é um facto, não um delete', /\bate\b[\s\S]*timestamptz/.test(sql) && !/delete from public\.backoffice_equipa_membros/i.test(sql))
teste('uma pessoa responde a um líder (índice global)', /uq_backoffice_equipa_membros_uma_equipa[\s\S]{0,200}\(membro_id\)[\s\S]{0,60}where ate is null/.test(sql))
teste('o líder não é membro da sua equipa', /backoffice_equipa_membro_valido/.test(sql))
teste('anon e authenticated não escrevem', /revoke all on public\.backoffice_equipa_membros from anon, authenticated/.test(sql))
teste('RLS ligada nas duas tabelas', /backoffice_equipas enable row level security/.test(sql) && /backoffice_equipa_membros enable row level security/.test(sql))
teste('a decisão de não haver recursão está escrita', /recurs/i.test(sql))

// ── E o admin tem de ter onde montar isto ───────────────────────────────────
const painel = readFileSync('components/admin/backoffice-equipa.tsx', 'utf8')
teste('o admin monta equipas', /equipas/i.test(painel))
const rota = readFileSync('app/api/admin/backoffice/equipas/route.ts', 'utf8')
teste('a rota das equipas exige admin', /verifyAdminAccess/.test(rota))

// E o backoffice tem de CONSUMIR isto. Enquanto `/api/backoffice/eu` chamava `ambitoDeLeitura` sem
// liderados, o modelo podia estar perfeito e um team leader continuava a ver-se só a si — uma
// avaria que não dá erro nenhum, só uma página com menos linhas do que devia.
const eu = readFileSync('app/api/backoffice/eu/route.ts', 'utf8')
teste('o backoffice lê o âmbito com a equipa', /ambitoDaEquipa\(/.test(eu))

// E as PÁGINAS também. A rota `/eu` estar ligada e as páginas não é exactamente o estado em que
// isto esteve: modelo aplicado, admin a montar equipas, e um team leader a ver-se só a si.
const ponte = readFileSync('lib/backoffice-equipa.ts', 'utf8')
teste('a ponte das páginas usa o âmbito das equipas', /ambitoDaEquipa\(/.test(ponte))
teste('a ponte não inventa liderados fora do âmbito', !/EQUIPA_POR_CONFIGURAR/.test(ponte))
const paginaEquipa = readFileSync('app/backoffice/equipa/page.tsx', 'utf8')
teste('a página da equipa lê os membros do modelo', /membrosDasEquipas\(/.test(paginaEquipa))
// O dono quis LINHAS, não totais: uma página que só somasse fechava a conversa antes de começar.
teste('a página da equipa mostra as linhas do extracto dos liderados', /extractoDoAmbito\(/.test(paginaEquipa))
teste('e mostra-as pelo âmbito, não por uma lista de ids solta', /ambitoDaPagina\(/.test(paginaEquipa))
// O texto de «ainda não existe modelo» não pode voltar: é uma mentira desde a migração 131.
teste('a página da equipa já não diz que a ligação não existe', !/ainda não está configurada/i.test(paginaEquipa))
for (const pagina of ['extracto', 'pipeline', 'tarefas']) {
  const src = readFileSync(`app/backoffice/${pagina}/page.tsx`, 'utf8')
  teste(`a página do ${pagina} filtra pelo âmbito da equipa`, /ambitoDaPagina\(/.test(src))
  // Uma página que voltasse a montar o âmbito à mão deixava de passar pela capacidade de equipa.
  teste(`a página do ${pagina} não monta o âmbito à mão`, !/ambitoDeLeitura\(/.test(src))
}

void (async () => {
  await Promise.all(espera)
  if (falhas.length) {
    console.error(`backoffice-equipas: ${falhas.length} falha(s)`)
    for (const f of falhas) console.error('  · ' + f)
    process.exit(1)
  }
  console.log('backoffice-equipas: liderados activos, avaria fecha, capacidade manda, histórico preservado ✓')
})()
