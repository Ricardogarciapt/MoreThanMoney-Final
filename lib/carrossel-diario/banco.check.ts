/**
 * Guarda do carrossel diário: `npx tsx lib/carrossel-diario/banco.check.ts`.
 * Prova, sem rede, que todo o banco cumpre as regras do dono (nomes proibidos, promessas, taxas
 * de acerto, brasileirismos), que cabe no desenho, que os ids não se repetem, que as palavras-chave
 * da MTM são de automações que existem, e que a IA mal comportada é recusada.
 */
import assert from 'node:assert/strict'
import { verificarObjecto } from '@/lib/conteudo-magnetico/regras'
import { BANCO } from './banco'
import { TEMAS } from './temas'
import { normalizar } from './gerar'
import { autorizadoNaPessoal, isAutoPublishBlocked, IG_PERSONAL_ID } from '@/lib/instagram/publish'

// Palavras das automações de comentário activas a 06/11/2026 (mtm_automacoes, canal instagram_comentario).
const PALAVRAS_ACTIVAS = new Set(
  'ESTRATEGIA,ESTRATÉGIA,GUIA,CRIAR,MUNDO,DISCIPLINA,PREMIUM,APP,TRIAL,QUERO,COMEÇAR,BORA,CRIPTO,DCA,SINAIS,COPY,GRUPO'.split(','),
)

const ids = new Set<string>()
for (const perfil of ['ricardo', 'mtm'] as const) {
  for (const c of BANCO[perfil]) {
    assert.equal(c.perfil, perfil, `${c.id}: perfil errado`)
    assert.ok(!ids.has(c.id), `${c.id}: id repetido`)
    ids.add(c.id)
    assert.deepEqual(verificarObjecto(c), [], `${c.id}: falha as regras`)
    assert.ok(c.laminas.length >= 6 && c.laminas.length <= 10, `${c.id}: ${c.laminas.length} lâminas`)
    c.laminas.forEach((l, i) => {
      assert.ok(l.linha.length <= 44, `${c.id}#${i}: linha longa (${l.linha.length})`)
      assert.ok(l.titulo.length <= 34, `${c.id}#${i}: título longo (${l.titulo.length})`)
      assert.ok((l.corpo || '').length <= 230, `${c.id}#${i}: corpo longo`)
      if (i > 0) assert.ok(l.corpo, `${c.id}#${i}: lâmina sem corpo`)
    })
    assert.ok(c.legenda.includes('Conteúdo educativo'), `${c.id}: legenda sem aviso`)
    assert.ok(c.legenda.length <= 2200, `${c.id}: legenda acima do limite do Instagram`)
    if (perfil === 'mtm') assert.ok(c.palavraChave && PALAVRAS_ACTIVAS.has(c.palavraChave), `${c.id}: palavra-chave sem automação`)
    else assert.equal(c.palavraChave, undefined, `${c.id}: a conta pessoal não tem funil de comentários`)
  }
}
for (const t of TEMAS.mtm) assert.ok(t.palavraChave && PALAVRAS_ACTIVAS.has(t.palavraChave) && t.oQue, `tema ${t.slug}: palavra-chave sem automação`)
assert.equal(new Set(TEMAS.ricardo.map((t) => t.slug)).size, TEMAS.ricardo.length)
assert.equal(new Set(TEMAS.mtm.map((t) => t.slug)).size, TEMAS.mtm.length)

// A IA: formato curto é recusado; formato certo passa com CTA e aviso postos por nós.
const tema = TEMAS.mtm[0]
assert.ok(normalizar({ laminas: [{ linha: 'a', titulo: 'b' }] }, 'mtm', tema, 'x').motivo)
const ok = normalizar(
  {
    gancho: 'Gancho de teste.',
    resumo: ['um', 'dois', 'três'],
    laminas: Array.from({ length: 7 }, (_, i) => ({ linha: `Linha ${i}`, titulo: `Título ${i}`, corpo: `Texto ${i}.` })),
  },
  'mtm',
  tema,
  'ia-teste',
)
assert.ok(ok.carrossel)
assert.equal(ok.carrossel!.laminas[0].corpo, '')
assert.ok(ok.carrossel!.legenda.includes(`«${tema.palavraChave}»`))
assert.ok(ok.carrossel!.legenda.includes('Conteúdo educativo'))

// A conta pessoal: só o carrossel diário do Ricardo passa; tudo o resto continua bloqueado.
assert.ok(isAutoPublishBlocked(IG_PERSONAL_ID))
assert.ok(autorizadoNaPessoal({ created_by: 'carrossel-diario:ricardo', media_type: 'CAROUSEL' }))
assert.ok(!autorizadoNaPessoal({ created_by: 'carrossel-diario:ricardo', media_type: 'IMAGE' }))
assert.ok(!autorizadoNaPessoal({ created_by: 'agente:AG-SOCIAL', media_type: 'CAROUSEL' }))
assert.ok(!autorizadoNaPessoal({ created_by: 'content-repost', media_type: 'CAROUSEL' }))

console.log(`carrossel-diario: OK (${BANCO.ricardo.length} Ricardo + ${BANCO.mtm.length} MTM no banco, ${TEMAS.ricardo.length + TEMAS.mtm.length} temas)`)
