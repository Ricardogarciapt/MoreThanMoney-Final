/**
 * A GUARDA DO REFRESCO DA SESSÃO.
 *
 *   npx tsx lib/live/refresco-da-sessao.check.ts
 *
 * Quase tudo aqui é o CASO MAU, porque o defeito original não dava erro nenhum: a página
 * funcionava, os dados chegavam, e o sintoma — «o vídeo salta» — parecia da rede. Um ramo que lia
 * `window.__mtm_state`, um objecto inexistente, sobreviveu meses exactamente por isso.
 */
import { cadenciaDeRefresco, mudouOQueImporta, sessaoAGuardar } from './refresco-da-sessao'

let falhas = 0
function certo(condicao: boolean, oQue: string) {
  if (condicao) return
  falhas++
  console.error('  ✗ ' + oQue)
}

// ─── O CASO MAU PRINCIPAL: a gravação ────────────────────────────────────────────────────────
// Era este que interrompia o vídeo. Uma gravação não muda; perguntar por ela é só estorvar.
{
  certo(
    cadenciaDeRefresco({ aoVivo: false, temGravacao: true }) === null,
    'uma gravação NÃO se volta a perguntar — devolve null, não um número grande',
  )
}

// ─── A CADÊNCIA NÃO PODE VOLTAR A FICAR AO CONTRÁRIO ─────────────────────────────────────────
// O código antigo perguntava mais depressa quando NÃO estava ao vivo. Esta é a invariante.
{
  const vivo = cadenciaDeRefresco({ aoVivo: true, temGravacao: false })
  const espera = cadenciaDeRefresco({ aoVivo: false, temGravacao: false })
  certo(vivo !== null && espera !== null, 'ao vivo e à espera continuam a ser perguntados')
  certo(
    vivo !== null && espera !== null && vivo < espera,
    'ao vivo pergunta-se MAIS vezes do que a uma sala à espera — nunca o contrário',
  )
  certo(vivo !== null && vivo >= 10_000, 'mesmo ao vivo não se pergunta mais que uma vez por 10s')
}

// ─── AO VIVO GANHA À GRAVAÇÃO ────────────────────────────────────────────────────────────────
// Uma sessão ao vivo que JÁ tem gravação anterior continua a mudar: não pode cair no `null`.
{
  certo(
    cadenciaDeRefresco({ aoVivo: true, temGravacao: true }) !== null,
    'estar ao vivo ganha a ter gravação — não se deixa de perguntar a meio de uma emissão',
  )
}

// ─── O QUE NÃO PODE REMONTAR O LEITOR ────────────────────────────────────────────────────────
{
  const base = { id: 's1', is_live: false, playback_url: 'https://v/aula.m3u8', title: 'Aula 1' }
  // Um objecto NOVO com os mesmos valores — é isto que a API devolve a cada volta.
  const igualMasOutroObjecto = { ...base }
  certo(!mudouOQueImporta(base, igualMasOutroObjecto), 'objecto novo com os mesmos valores não é mudança')
  certo(
    sessaoAGuardar(base, igualMasOutroObjecto) === base,
    'guarda-se o objecto ANTIGO: a identidade mantém-se e o leitor não é tocado',
  )

  // Campos de ruído: contadores, datas de actualização, o que mais a API trouxer.
  const comRuido = { ...base, viewer_count: 42, updated_at: '2026-10-01T21:00:00Z' }
  certo(!mudouOQueImporta(base, comRuido), 'um contador de espectadores não remonta o leitor')
  certo(sessaoAGuardar(base, comRuido) === base, 'e o objecto guardado continua a ser o antigo')

  // `null` e `undefined` no mesmo campo são a MESMA ausência — tratá-los como diferentes fazia o
  // leitor remontar a cada volta, que é o defeito que este módulo fecha.
  const comNulo = { ...base, status: null }
  const comIndefinido = { ...base, status: undefined }
  certo(!mudouOQueImporta(comNulo, comIndefinido), 'null e undefined no mesmo campo não são mudança')
}

// ─── O QUE TEM MESMO DE MUDAR ────────────────────────────────────────────────────────────────
{
  const antes = { id: 's1', is_live: true, playback_url: '' }
  certo(mudouOQueImporta(antes, { ...antes, is_live: false }), 'a emissão terminar é mudança')
  certo(
    mudouOQueImporta(antes, { ...antes, playback_url: 'https://v/gravacao.m3u8' }),
    'aparecer a gravação é mudança',
  )
  certo(mudouOQueImporta(antes, { ...antes, id: 's2' }), 'trocar de sessão é mudança')
  certo(mudouOQueImporta(antes, { ...antes, title: 'Outro título' }), 'mudar o título é mudança')
  certo(sessaoAGuardar(antes, { ...antes, is_live: false }) !== antes, 'e aí guarda-se o NOVO')
}

// ─── APARECER E DESAPARECER ──────────────────────────────────────────────────────────────────
// Tem de ser decidido antes de se lerem campos, senão rebenta a ler de null.
{
  const s = { id: 's1', is_live: true }
  certo(mudouOQueImporta(null, s), 'a sessão aparecer é mudança')
  certo(mudouOQueImporta(s, null), 'a sessão desaparecer é mudança')
  certo(!mudouOQueImporta(null, null), 'de nada para nada não é mudança')
  certo(!mudouOQueImporta(null, undefined), 'null e undefined como sessão são a mesma ausência')
  certo(sessaoAGuardar(null, s) === s, 'quando aparece, guarda-se a que apareceu')
}

if (falhas) {
  console.error(`refresco-da-sessao: ${falhas} falha(s)`)
  process.exit(1)
}
console.log('refresco-da-sessao: uma gravação não se refresca, e o leitor não remonta por ruído ✓')
