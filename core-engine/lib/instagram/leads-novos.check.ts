/**
 * A GUARDA DE QUEM É LEAD E QUEM É NOSSO.
 *
 *   npx tsx lib/instagram/leads-novos.check.ts
 *
 * O caso real que deu origem a isto está nos testes: nove comentários, uma pessoa, e essa pessoa
 * era um MEMBRO — o @ruipaulo.fxcripto é o Rui Rodrigues. O painel dizia «9 leads» e não havia
 * nenhum. Metade destes testes existe para que o número volte a ser gente, e para que um cliente
 * nunca receba a mensagem de captação.
 */
import { aQuemResponder, contarLeads, ehDaCasa, handlesDoPerfil, normalizarHandle } from './leads-novos'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

// ── Handles ─────────────────────────────────────────────────────────────────
teste('tira o @', normalizarHandle('@Fulano') === 'fulano')
teste('tira espaços', normalizarHandle('  Fulano  ') === 'fulano')
teste('vazio é vazio', normalizarHandle(null) === '')

{
  const p = { username: 'ruicr', social_media: { instagram: '@ruipaulo.fxcripto' } }
  teste('lê o instagram do social_media', handlesDoPerfil(p).includes('ruipaulo.fxcripto'))
  teste('e o username também', handlesDoPerfil(p).includes('ruicr'))

  teste('aceita um endereço completo', handlesDoPerfil({ social_media: { instagram: 'https://instagram.com/fulano?igsh=abc' } }).includes('fulano'))
  teste('aceita social_media em texto solto', handlesDoPerfil({ social_media: 'instagram.com/beltrano/' }).includes('beltrano'))
  // A COLUNA É TEXTO, não jsonb: as linhas reais chegam como a cadeia `{"instagram":"…"}`. Tratá-la
  // como texto solto dava o JSON inteiro por handle — e o funil continuava a contar um membro
  // como lead depois de a ligação já estar escrita no perfil.
  teste('JSON guardado como TEXTO é lido', handlesDoPerfil({ social_media: '{"instagram":"ruipaulo.fxcripto"}' }).includes('ruipaulo.fxcripto'))
  teste('e não devolve o JSON inteiro como handle', !handlesDoPerfil({ social_media: '{"instagram":"x.y"}' }).some((h) => h.includes('{')))
  teste('handles curtos de mais não contam', !handlesDoPerfil({ username: 'ab' }).includes('ab'))
  teste('perfil vazio não dá handles', handlesDoPerfil({}).length === 0)
}

// ── O CASO REAL ─────────────────────────────────────────────────────────────
//
// Nove comentários do @ruipaulo.fxcripto, que é o Rui Rodrigues, membro activo. Antes de o handle
// ser escrito no perfil dele, NADA ligava os dois — e o funil contava nove leads.
{
  const rui = { full_name: 'Rui Rodrigues', email: 'rui.pmcr@gmail.com', social_media: { instagram: 'ruipaulo.fxcripto' } }
  const outros = [{ full_name: 'Outra Pessoa', email: 'x@y.pt', social_media: null }]
  const perfis = [rui, ...outros]

  const comentarios = ['MUNDO', 'SINAIS', 'COPY', 'DESAFIO', 'PREMIUM', 'DESAFIO', 'MUNDO', 'QUERO', 'MUNDO']
    .map((kw, i) => ({ commenter: 'ruipaulo.fxcripto', keyword: kw, created_at: new Date(Date.now() - i * 3_600_000).toISOString() }))

  const c = contarLeads(comentarios, perfis)
  teste('nove comentários continuam a ser nove', c.comentarios === 9)
  teste('mas são UMA pessoa', c.pessoas === 1)
  teste('e ZERO leads novos, porque é membro', c.novas === 0)
  teste('e diz-se quem era', c.jaNossas.includes('ruipaulo.fxcripto'))

  teste('não se lhe responde como a um desconhecido', aQuemResponder(comentarios, perfis).length === 0)

  // E sem a ligação no perfil — o estado anterior a 30/09 — ele contava como lead. É esta
  // diferença que mostra porque é que a ligação teve de ser escrita à mão.
  const semLigacao = contarLeads(comentarios, [{ full_name: 'Rui Rodrigues', email: 'rui.pmcr@gmail.com', social_media: null }])
  teste('sem o handle no perfil, passava por lead', semLigacao.novas === 1)
}

// ── Um lead a sério ─────────────────────────────────────────────────────────
{
  const perfis = [{ full_name: 'Rui Rodrigues', social_media: { instagram: 'ruipaulo.fxcripto' } }]
  const comentarios = [
    { commenter: 'desconhecido.trader', keyword: 'SINAIS', created_at: new Date().toISOString() },
    { commenter: 'ruipaulo.fxcripto', keyword: 'COPY', created_at: new Date().toISOString() },
  ]
  const c = contarLeads(comentarios, perfis)
  teste('duas pessoas, um lead novo', c.pessoas === 2 && c.novas === 1)
  const responder = aQuemResponder(comentarios, perfis)
  teste('só se responde ao desconhecido', responder.length === 1 && responder[0].commenter === 'desconhecido.trader')
}

// ── A janela de 7 dias da Meta ──────────────────────────────────────────────
{
  const agora = new Date('2026-09-30T12:00:00Z')
  const comentarios = [
    { commenter: 'a.dentro', created_at: '2026-09-28T12:00:00Z' },
    { commenter: 'b.limite', created_at: '2026-09-23T13:00:00Z' },  // 6d23h
    { commenter: 'c.fora', created_at: '2026-09-20T12:00:00Z' },    // 10 dias
  ]
  const r = aQuemResponder(comentarios, [], agora).map((x) => x.commenter)
  teste('dentro da janela responde-se', r.includes('a.dentro'))
  teste('mesmo no limite ainda se responde', r.includes('b.limite'))
  teste('fora da janela não', !r.includes('c.fora'))
  teste('sem data não se arrisca', aQuemResponder([{ commenter: 'sem.data' }], [], agora).length === 0)
}

// ── Uma pessoa, uma mensagem ────────────────────────────────────────────────
{
  const comentarios = Array.from({ length: 5 }, (_, i) => ({
    commenter: 'mesma.pessoa',
    keyword: `KW${i}`,
    created_at: new Date(Date.now() - i * 60_000).toISOString(),
  }))
  const r = aQuemResponder(comentarios, [])
  teste('cinco comentários dão UMA resposta', r.length === 1)
  teste('e é ao comentário mais recente', r[0].keyword === 'KW0')
}

if (falhas.length) {
  console.error(`instagram/leads-novos: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('instagram/leads-novos: pessoas e não comentários, quem é da casa fica de fora, janela de 7 dias ✓')
