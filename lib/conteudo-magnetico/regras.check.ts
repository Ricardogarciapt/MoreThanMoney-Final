/**
 * Guarda do MTM Conteúdo Magnético: `npx tsx lib/conteudo-magnetico/regras.check.ts`.
 * Prova, sem rede, que as regras do dono apanham o que têm de apanhar e que o guião da
 * especificação original (Magnetic.IA PRO MAX) entra no nosso formato sem perder nada.
 */
import assert from 'node:assert/strict'
import { verificarTexto, verificarObjecto } from './regras'
import { normalizarGuiao } from './guiao'
import { marcasPermitidas, resolverMarca } from './marcas'

const tem = (t: string, tipo: string) => verificarTexto(t).some((p) => p.tipo === tipo)

// nomes proibidos
assert.ok(tem('Saí da Jifu e encontrei isto', 'nome_proibido'))
assert.ok(tem('melhor que a golden era', 'nome_proibido'))
assert.ok(tem('O KILLSHOT não presta', 'nome_proibido'))
assert.ok(tem('trendwave', 'nome_proibido'))
// taxas de acerto
assert.ok(tem('87% de acerto no ouro', 'taxa_acerto'))
assert.ok(tem('win rate de 92 %', 'taxa_acerto'))
assert.ok(tem('Taxa de acerto: 80%', 'taxa_acerto'))
// promessas
assert.ok(tem('Lucro garantido todos os meses', 'promessa'))
assert.ok(tem('ganha 500€ por mês', 'promessa'))
assert.ok(tem('trading sem risco', 'promessa'))
// o que é legítimo passa
assert.equal(verificarTexto('O stop não é derrota. É gestão de risco. Conteúdo educativo.').length, 0)
assert.equal(verificarTexto('Estive ocupado 14 anos e não trouxe nada de futuro').length, 0)
assert.equal(verificarTexto('Arrisca no máximo 1% da conta por operação').length, 0)

// o JSON da especificação original normaliza-se para o nosso
const especificacao = {
  metadata: { nicho: 'Estética Avançada' },
  audio_mastering: { musica_pesquisa_termo: 'cinematic hip hop slow' },
  timeline_segments: [
    { segmento_id: 1, texto_fala: 'Este é o maior erro.', tipo_visual: 'avatar_talking', config_visual: { camera_zoom: 'normal', b_roll_busca: null }, efeito_sonoro: 'dramatic_boom.mp3', legenda_estilo: 'atencao_impacto_vermelho' },
    { segmento_id: 2, texto_fala: 'Ficas a publicar fotos.', tipo_visual: 'b_roll_overlay', config_visual: { camera_zoom: 'zoom_in', b_roll_busca: 'luxury clinic' }, efeito_sonoro: 'whoosh_transition.mp3', legenda_estilo: 'word_by_word_green' },
    { segmento_id: 3, texto_fala: 'Clica no link da bio.', tipo_visual: 'avatar_talking', config_visual: { camera_zoom: 'close_up' }, efeito_sonoro: 'click_notificacao.mp3', legenda_estilo: 'padrao_branco' },
  ],
}
const g = normalizarGuiao(especificacao, { formato: 'reel', marca: 'morethanmoney', nicho: 'x', objectivo: 'conversao', tom: 'autoridade' })
assert.equal(g.reel?.segmentos.length, 3)
assert.deepEqual(g.reel?.segmentos.map((s) => s.visual), ['apresentador', 'b_roll', 'apresentador'])
assert.deepEqual(g.reel?.segmentos.map((s) => s.sfx), ['boom', 'whoosh', 'click'])
assert.deepEqual(g.reel?.segmentos.map((s) => s.legenda_estilo), ['impacto', 'palavra_a_palavra', 'simples'])
assert.equal(g.reel?.segmentos[1].b_roll_busca, 'luxury clinic')
assert.equal(g.reel?.musica_termo, 'cinematic hip hop slow')
assert.equal(g.laminas.length, 1)

// b_roll sem busca cai no cartão; carrossel é cortado a 10
const g2 = normalizarGuiao(
  { laminas: Array.from({ length: 14 }, (_, i) => ({ titulo: `l${i}` })), reel: { segmentos: [{ fala: 'a', visual: 'b_roll' }] } },
  { formato: 'carrossel', marca: 'propria', nicho: 'x', objectivo: 'atracao', tom: 'educativo' },
)
assert.equal(g2.laminas.length, 10)
assert.equal(g2.laminas[0].papel, 'capa')
assert.equal(g2.laminas[9].papel, 'fim')
assert.equal(g2.reel, null)

// verificarObjecto vê o guião inteiro
assert.equal(verificarObjecto({ a: ['ok', { b: 'lucro garantido' }] }).length, 1)

// marcas da casa só para admins
assert.deepEqual(marcasPermitidas(false), ['propria'])
assert.ok(marcasPermitidas(true).includes('ricardo-garcia'))
assert.equal(resolverMarca('propria', { arroba: 'ana', cor: '#ff0000' }).arroba, '@ana')
assert.equal(resolverMarca('propria', { cor: 'vermelho' }).destaque, '#D2A63C')

console.log('conteudo-magnetico: regras ok')
