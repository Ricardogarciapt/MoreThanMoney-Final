/**
 * Guardas dos três funis de publicidade. Correr: `npx tsx lib/funis-publicidade.check.ts`.
 *
 * O texto destes funis vai para anúncios pagos. Uma promessa de lucro ou um «gerimos o teu
 * dinheiro» num anúncio de produto financeiro é um problema de conformidade (CMVM, políticas da
 * Meta), não de gosto. Estas guardas apanham-no antes de chegar a produção.
 */
import assert from 'node:assert/strict'
import {
  AVISO_GERAL, FUNIS, FUNIS_PUBLICIDADE, funilDaOrigem, linkDoAnuncio, origemDoFunil,
} from '@/lib/funis-publicidade'
import { limparOrigem } from '@/lib/pedido-contacto'
import { INTERESSES } from '@/lib/pedido-contacto-textos'
// As mesmas chaves de `vendas_negocios.funil` (lib/backoffice-funis.ts, PR #262).
const FUNIS_CRM = ['educacao', 'corretora', 'funded', 'b2b'] as const

const textoDe = (f: (typeof FUNIS)[keyof typeof FUNIS]) =>
  [
    f.seo.titulo, f.seo.descricao, f.titulo, f.subtitulo, f.formulario.titulo, f.formulario.subtitulo,
    f.atalho.texto, ...f.pontos.flatMap((p) => [p.titulo, p.texto]), ...f.passos.flatMap((p) => [p.titulo, p.texto]),
  ].join(' \n ')

const PROIBIDO: Array<[RegExp, string]> = [
  [/garant(id|e|o)/i, 'promessa de garantia'],
  [/lucro|rendimento|retorno|enriquec|ganha(r)? dinheiro|renda passiva|por m[eê]s de lucro/i, 'promessa de retorno'],
  [/\d+\s?%/, 'percentagem (número de desempenho)'],
  [/sem risco|risco zero/i, '«sem risco»'],
  [/gerimos|gest[aã]o de carteira|gest[aã]o da tua conta|investimos por ti/i, 'gestão de carteira (somos IB)'],
  [/—|–/, 'travessão no texto visível'],
  [/voc[eê]/i, '«você» (tratamos por tu)'],
]

for (const chave of FUNIS_PUBLICIDADE) {
  const f = FUNIS[chave]
  assert.equal(f.chave, chave, `${chave}: chave desalinhada`)
  assert.ok(f.interesse in INTERESSES, `${chave}: interesse ${f.interesse} não existe no formulário`)
  assert.ok((FUNIS_CRM as readonly string[]).includes(chave), `${chave}: não existe no CRM (backoffice-funis)`)
  assert.equal(f.pontos.length, 3, `${chave}: três pontos`)
  assert.equal(f.passos.length, 3, `${chave}: três passos`)
  assert.ok(f.subtitulo.split(/\s+/).length <= 20, `${chave}: subtítulo com mais de 20 palavras`)

  const t = textoDe(f)
  for (const [re, porque] of PROIBIDO) {
    // «gerimos» só é permitido negado («Não gerimos carteiras»), que é exactamente o aviso que queremos.
    const limpo = t.replace(/n[aã]o gerimos carteiras/gi, '').replace(/nós não tocamos/gi, '')
    assert.ok(!re.test(limpo), `${chave}: ${porque} → ${re}`)
  }
  // «prop firm» só para dizer que não é.
  for (const m of t.matchAll(/prop firm/gi)) {
    const antes = t.slice(Math.max(0, (m.index ?? 0) - 8), m.index)
    assert.ok(/n[aã]o [eé] $/i.test(antes), `${chave}: «prop firm» sem ser negado`)
  }
  for (const a of f.avisos) assert.ok(!/—|–/.test(a), `${chave}: travessão no aviso`)

  // A origem passa no filtro do servidor, com e sem UTM.
  const o1 = origemDoFunil(chave)
  const o2 = origemDoFunil(chave, { utm_source: 'meta', utm_campaign: 'T1 Rota/Corretora!', utm_content: 'gancho-a' })
  assert.equal(limparOrigem(o1), o1, `${chave}: origem sem UTM recusada`)
  assert.equal(limparOrigem(o2), o2, `${chave}: origem com UTM recusada (${o2})`)
  assert.equal(funilDaOrigem(o2), chave)
  assert.ok(linkDoAnuncio(chave, { campanha: 't1' }).includes(`/f/${chave}?utm_source=meta&utm_medium=paid&utm_campaign=t1`))
}

assert.ok(/não constitui consultoria/i.test(AVISO_GERAL))
assert.match(FUNIS.corretora.avisos.join(' '), /Introducing Broker/)
assert.match(FUNIS.corretora.avisos.join(' '), /CFD/)
assert.match(FUNIS.funded.avisos.join(' '), /simulad/)
assert.equal(funilDaOrigem('pagina:/ligar'), null)
assert.equal(funilDaOrigem('funil:b2b'), null)

console.log('funis-publicidade: ok')
