/**
 * A voz da casa (lib/voz) — guarda.
 *
 * O que estava em jogo: a voz clonada do Ricardo só existia dentro da dobragem do LMS,
 * devolvia `null` para tudo (um deploy sem FISH_API_KEY parecia falha de rede), não tinha
 * cache (a mesma frase pagava-se todas as vezes) e não tinha tecto de caracteres.
 *
 * O que fica trancado aqui:
 *  1. a VOZ é a do clone, sempre; uma voz diferente só passa por PORTA EXPLÍCITA
 *     (partir isto = a marca a falar com voz genérica sem ninguém notar);
 *  2. os erros são distinguíveis (configuração ≠ API ≠ texto);
 *  3. a chave de cache depende de texto+voz+modelo+formato e de mais nada
 *     (partir isto = pagar duas vezes a mesma frase, ou servir a voz errada);
 *  4. os limites: parte acima do tecto por pedido, RECUSA acima do tecto total.
 *
 * Nunca chama a API da Fish: o cliente é injectado.
 */
import {
  MAX_CARACTERES_PEDIDO,
  MAX_CARACTERES_TOTAL,
  VOZ_RICARDO,
  caminhoDeCache,
  falar,
  partirPorFrases,
  prepararTexto,
  resolverVoz,
  tipoDeConteudo,
  vozDoAmbiente,
  type ClienteVoz,
} from '../voz'

let ok = 0
let mau = 0
function eq(nome: string, a: unknown, b: unknown) {
  if (a === b) { ok++; return }
  mau++
  console.error(`✗ ${nome}\n   esperado: ${String(b)}\n   obtido:   ${String(a)}`)
}
function verdade(nome: string, v: boolean) { eq(nome, v, true) }

// ── 1. A regra da voz ──────────────────────────────────────────────────────
eq('voz canónica é o clone', VOZ_RICARDO, '1e0fa8b490c744acba94da72710e6db2')
const semPedido = resolverVoz()
verdade('sem voiceId resolve', semPedido.ok)
eq('sem voiceId → clone', semPedido.ok ? semPedido.voiceId : '', VOZ_RICARDO)
eq('clone explícito não é alternativa', resolverVoz({ voiceId: VOZ_RICARDO }).ok && !(resolverVoz({ voiceId: VOZ_RICARDO }) as any).alternativa, true)

const generica = resolverVoz({ voiceId: 'voz-generica-qualquer' })
eq('voz genérica sem porta é RECUSADA', generica.ok, false)
eq('motivo da recusa', generica.ok ? '' : generica.motivo, 'voz-nao-autorizada')
eq('porta vazia não abre', resolverVoz({ voiceId: 'outra', motivoVozAlternativa: '   ' }).ok, false)
const comPorta = resolverVoz({ voiceId: 'voz-do-educador', motivoVozAlternativa: 'dobragem: educador' })
verdade('porta explícita abre', comPorta.ok)
eq('porta devolve a voz pedida', comPorta.ok ? comPorta.voiceId : '', 'voz-do-educador')
eq('porta marca alternativa', comPorta.ok ? comPorta.alternativa : false, true)

// env: FISH_VOICE_ID diferente só vale com FISH_VOZ_ALTERNATIVA_OK=1
eq('env vazio → clone', vozDoAmbiente({}), VOZ_RICARDO)
eq('env = clone → clone', vozDoAmbiente({ FISH_VOICE_ID: VOZ_RICARDO }), VOZ_RICARDO)
eq('env genérico é IGNORADO', vozDoAmbiente({ FISH_VOICE_ID: 'voz-generica' }), VOZ_RICARDO)
eq('env genérico com porta passa', vozDoAmbiente({ FISH_VOICE_ID: 'voz-x', FISH_VOZ_ALTERNATIVA_OK: '1' }), 'voz-x')

// ── 2. Limites e partição ──────────────────────────────────────────────────
const curto = prepararTexto('  Bom dia.  ')
eq('texto curto = 1 parte', curto.ok ? curto.partes.length : -1, 1)
eq('texto curto vem trimado', curto.ok ? curto.partes[0] : '', 'Bom dia.')
eq('vazio é texto-invalido', prepararTexto('   ').ok ? '' : (prepararTexto('   ') as any).motivo, 'texto-invalido')
const longo = prepararTexto('a'.repeat(MAX_CARACTERES_TOTAL + 1))
eq('acima do tecto total RECUSA', longo.ok, false)
eq('motivo do tecto', longo.ok ? '' : longo.motivo, 'texto-longo')

const frase = 'Isto é uma frase de teste com tamanho razoável. '
const medio = prepararTexto(frase.repeat(80)) // ~3760 chars → parte, não recusa
verdade('entre tectos parte em vez de recusar', medio.ok)
verdade('parte em mais de 1 pedaço', medio.ok && medio.partes.length > 1)
verdade('nenhuma parte excede o tecto por pedido', medio.ok && medio.partes.every((p) => p.length <= MAX_CARACTERES_PEDIDO))
verdade('nenhuma parte vazia', medio.ok && medio.partes.every((p) => p.trim().length > 0))
eq('partição não perde caracteres', medio.ok ? medio.partes.join(' ').replace(/\s+/g, ' ') : '', frase.repeat(80).trim().replace(/\s+/g, ' '))
// uma "frase" única gigante tem de ser cortada por palavras, não recusada
const gigante = partirPorFrases(('palavra '.repeat(400)).trim(), 100)
verdade('frase sem pontuação é cortada', gigante.length > 1 && gigante.every((p) => p.length <= 100))

// ── 3. Chave de cache ──────────────────────────────────────────────────────
const base = { voiceId: VOZ_RICARDO, modelo: 'speech-1.6', formato: 'mp3' as const, texto: 'Olá' }
eq('mesma entrada, mesmo caminho', caminhoDeCache(base), caminhoDeCache({ ...base }))
eq('espaços à volta não contam', caminhoDeCache(base), caminhoDeCache({ ...base, texto: '  Olá  ' }))
verdade('texto diferente, caminho diferente', caminhoDeCache(base) !== caminhoDeCache({ ...base, texto: 'Olá!' }))
verdade('voz diferente, caminho diferente', caminhoDeCache(base) !== caminhoDeCache({ ...base, voiceId: 'outra' }))
verdade('modelo diferente, caminho diferente', caminhoDeCache(base) !== caminhoDeCache({ ...base, modelo: 's1' }))
verdade('formato diferente, caminho diferente', caminhoDeCache(base) !== caminhoDeCache({ ...base, formato: 'wav' }))
verdade('caminho é estável e prefixado', /^voz-cache\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{64}\.mp3$/.test(caminhoDeCache(base)))
eq('content-type mp3', tipoDeConteudo('mp3'), 'audio/mpeg')
eq('content-type wav', tipoDeConteudo('wav'), 'audio/wav')

// ── 4. falar(): erros distinguíveis e cliente injectado (NUNCA a Fish real) ─
const audio = (n = 500) => Buffer.alloc(n, 7)
let chamadas: string[] = []
const clienteFalso: ClienteVoz = async ({ texto }) => { chamadas.push(texto); return { ok: true, buffer: audio() } }
const clienteSemChave: ClienteVoz = async () => ({ ok: false, motivo: 'sem-configuracao', detalhe: 'FISH_API_KEY em falta' })
const clienteApiEmBaixo: ClienteVoz = async () => ({ ok: false, motivo: 'api-falhou', detalhe: 'Fish 503', status: 503 })

async function corre() {
  const bom = await falar('Bom dia.', { cliente: clienteFalso })
  verdade('falar ok', bom.ok)
  eq('voz usada é o clone', bom.ok ? bom.voiceId : '', VOZ_RICARDO)
  eq('1 pedido', bom.ok ? bom.pedidos : -1, 1)
  eq('sem supabase → cache off', bom.ok ? bom.cache : '', 'off')

  const semChave = await falar('Bom dia.', { cliente: clienteSemChave })
  eq('falta de chave é sem-configuracao', semChave.ok ? '' : semChave.motivo, 'sem-configuracao')
  const emBaixo = await falar('Bom dia.', { cliente: clienteApiEmBaixo })
  eq('API em baixo é api-falhou', emBaixo.ok ? '' : emBaixo.motivo, 'api-falhou')
  eq('status da API preservado', emBaixo.ok ? 0 : emBaixo.status, 503)
  verdade('configuração e rede são motivos DIFERENTES', (semChave.ok ? 'a' : semChave.motivo) !== (emBaixo.ok ? 'b' : emBaixo.motivo))
  const vazio = await falar('   ', { cliente: clienteFalso })
  eq('texto vazio é texto-invalido', vazio.ok ? '' : vazio.motivo, 'texto-invalido')
  const barrada = await falar('Bom dia.', { cliente: clienteFalso, voiceId: 'voz-generica' })
  eq('voz genérica não chega ao cliente', barrada.ok ? '' : barrada.motivo, 'voz-nao-autorizada')

  // texto longo: junta o áudio das partes e faz 1 pedido por parte
  chamadas = []
  const partido = await falar(frase.repeat(80), { cliente: clienteFalso })
  verdade('texto médio sintetiza', partido.ok)
  verdade('um pedido por parte', partido.ok && partido.pedidos === chamadas.length && chamadas.length > 1)
  eq('áudio concatenado', partido.ok ? partido.buffer.length : 0, 500 * chamadas.length)

  // ── cache: 2.ª vez não paga ──────────────────────────────────────────────
  const cofre = new Map<string, Buffer>()
  const supabaseFalso = {
    storage: {
      from: () => ({
        download: async (p: string) => {
          const b = cofre.get(p)
          return b ? { data: { arrayBuffer: async () => b }, error: null } : { data: null, error: { message: 'não existe' } }
        },
        upload: async (p: string, b: Buffer) => { cofre.set(p, b); return { error: null } },
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn.teste/${p}` } }),
      }),
    },
  }
  chamadas = []
  const primeira = await falar('Frase paga uma vez.', { cliente: clienteFalso, cache: supabaseFalso })
  eq('1.ª vez é miss', primeira.ok ? primeira.cache : '', 'miss')
  eq('1.ª vez chamou a Fish', chamadas.length, 1)
  const segunda = await falar('Frase paga uma vez.', { cliente: clienteFalso, cache: supabaseFalso })
  eq('2.ª vez é hit', segunda.ok ? segunda.cache : '', 'hit')
  eq('2.ª vez NÃO chamou a Fish', chamadas.length, 1)
  eq('2.ª vez sem pedidos', segunda.ok ? segunda.pedidos : -1, 0)
  eq('áudio da cache é o mesmo', segunda.ok ? segunda.buffer.length : -1, 500)
  // cache indisponível não pode impedir a fala
  const supabaseAvariado = { storage: { from: () => ({ download: async () => { throw new Error('storage em baixo') }, upload: async () => ({ error: { message: 'em baixo' } }), getPublicUrl: () => ({ data: null }) }) } }
  const apesarDaAvaria = await falar('Apesar da avaria.', { cliente: clienteFalso, cache: supabaseAvariado })
  verdade('storage avariado não impede a fala', apesarDaAvaria.ok)
}

corre().then(() => {
  console.log(mau === 0 ? `✓ ${ok} verificações passaram` : `${ok} ok, ${mau} FALHARAM`)
  process.exit(mau === 0 ? 0 : 1)
})
