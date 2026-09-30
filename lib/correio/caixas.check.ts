/**
 * A GUARDA DAS CAIXAS.
 *
 *   npx tsx lib/correio/caixas.check.ts
 *
 * O teste que mais importa aqui é o do CICLO: reencaminhar um endereço da casa para outro endereço
 * da casa. Não dá erro nenhum no dia em que se faz, e passadas umas horas o domínio está a copiar
 * cada mensagem em volta até um servidor cortar — e servidores que cortam ciclos marcam o domínio.
 */
import {
  DOMINIO, JA_EXISTEM, NOMES_DE_SISTEMA, ehDoDominio, localValido, normalizar, parteLocal,
  podeCriar, podeReencaminhar, quemFaltaCaixa, sugerirEndereco,
} from './caixas'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

// ── Normalizar ──────────────────────────────────────────────────────────────
{
  teste('acrescenta o domínio', normalizar('suporte') === `suporte@${DOMINIO}`)
  teste('não o acrescenta duas vezes', normalizar(`suporte@${DOMINIO}`) === `suporte@${DOMINIO}`)
  teste('maiúsculas caem', normalizar('  SuPoRtE  ') === `suporte@${DOMINIO}`)
  teste('endereço de fora fica como está', normalizar('x@gmail.com') === 'x@gmail.com')
  teste('parte local', parteLocal(`ceo@${DOMINIO}`) === 'ceo')
  teste('é da casa', ehDoDominio('geral') && !ehDoDominio('x@gmail.com'))
}

// ── A parte antes do @ ──────────────────────────────────────────────────────
{
  teste('nome simples passa', localValido('suporte').pode)
  teste('com ponto passa', localValido('ricardo.garcia').pode)
  teste('vazio não passa', !localValido('').pode)
  teste('espaço não passa', !localValido('a b').pode)
  teste('acento não passa', !localValido('joão').pode)
  teste('não pode começar com ponto', !localValido('.x').pode)
  teste('não pode acabar em hífen', !localValido('x-').pode)
  teste('dois pontos seguidos não passam', !localValido('a..b').pode)
  teste('há sempre motivo', localValido('').porque.length > 10)
}

// ── Criar ───────────────────────────────────────────────────────────────────
{
  teste('novo alias passa', podeCriar({ local: 'vendas', tipo: 'alias', existentes: JA_EXISTEM }).pode)

  const repetido = podeCriar({ local: 'suporte', tipo: 'alias', existentes: JA_EXISTEM })
  teste('repetido não passa', !repetido.pode)
  teste('e diz que já existe', repetido.porque.includes('já existe'))

  // O erro nº 2: criar uma caixa com o nome de um valor de sistema.
  for (const n of NOMES_DE_SISTEMA) {
    teste(`«${n}@» é recusado`, !podeCriar({ local: n, tipo: 'caixa', existentes: [] }).pode)
  }
  teste(
    'e o motivo explica porquê',
    podeCriar({ local: 'sistema', tipo: 'caixa', existentes: [] }).porque.includes('código'),
  )

  // O erro nº 3: pedir uma caixa sem licença livre.
  const semLicenca = podeCriar({ local: 'ruben', tipo: 'caixa', existentes: [], licencas: { total: 1, usadas: 1 } })
  teste('caixa sem licença livre é recusada', !semLicenca.pode)
  teste('e o motivo mostra a contagem', semLicenca.porque.includes('1/1'))
  teste('e sugere o alias, que não gasta licença', semLicenca.porque.includes('alias'))

  // Um ALIAS passa mesmo com as licenças esgotadas — é o ponto todo dos aliases.
  teste(
    'alias passa sem licenças livres',
    podeCriar({ local: 'ruben', tipo: 'alias', existentes: [], licencas: { total: 1, usadas: 1 } }).pode,
  )
}

/**
 * ── O CICLO ─────────────────────────────────────────────────────────────────
 * O erro que este ficheiro existe sobretudo para travar.
 */
{
  const bom = podeReencaminhar({ de: 'geral', para: 'morethanmoneypt@gmail.com' })
  teste('para fora passa', bom.pode)
  teste('e diz o que vai acontecer', bom.porque.includes('morethanmoneypt@gmail.com'))

  const ciclo = podeReencaminhar({ de: 'suporte', para: `geral@${DOMINIO}` })
  teste('para o próprio domínio NÃO passa', !ciclo.pode)
  teste('e o motivo fala do ciclo', ciclo.porque.includes('ciclo') || ciclo.porque.includes('volta'))

  teste('para si próprio não passa', !podeReencaminhar({ de: 'geral', para: `geral@${DOMINIO}` }).pode)
  teste('destino vazio não passa', !podeReencaminhar({ de: 'geral', para: '' }).pode)
  teste('destino sem @ não passa', !podeReencaminhar({ de: 'geral', para: 'gmail.com' }).pode)
  teste('destino sem domínio de topo não passa', !podeReencaminhar({ de: 'geral', para: 'x@gmail' }).pode)
  // Maiúsculas no destino não podem servir para contornar a regra do domínio.
  teste(
    'MAIÚSCULAS não contornam a regra',
    !podeReencaminhar({ de: 'suporte', para: `GERAL@${DOMINIO.toUpperCase()}` }).pode,
  )
}

// ── Sugerir ─────────────────────────────────────────────────────────────────
{
  teste('primeiro nome', sugerirEndereco('Ruben Pereira') === 'ruben')
  teste('acentos caem', sugerirEndereco('João Antônio') === 'joao')
  teste('se o primeiro está tomado, junta o apelido', sugerirEndereco('Ruben Pereira', ['ruben']) === 'ruben.pereira')
  teste('sem nome, sem sugestão', sugerirEndereco('') === '')
  teste('sem apelido e tomado, não inventa número', sugerirEndereco('Ruben', ['ruben']) === '')
}

// ── Quem falta ──────────────────────────────────────────────────────────────
{
  const pessoas = [
    { id: 'a', nome: 'Ruben Pereira', email: 'imrubenfp@gmail.com' },
    { id: 'b', nome: 'MTM Mindset', email: `mindset@${DOMINIO}` },
    { id: 'c', nome: 'Ricardo Garcia', email: 'x@proton.me' },
  ]
  const caixas = [{ endereco: `geral@${DOMINIO}`, tipo: 'caixa' as const, user_id: 'c' }]
  const faltam = quemFaltaCaixa(pessoas, caixas)

  teste('quem já tem caixa ligada não aparece', !faltam.some((f) => f.id === 'c'))
  teste('quem não tem aparece', faltam.length === 2)
  teste('sugere pelo nome', faltam.find((f) => f.id === 'a')?.sugestao === 'ruben')

  /**
   * O caso que se descobriu a 30/09: educadores com email `@morethanmoney.pt` gravado na base
   * (`mindset@`) sem que esse endereço alguma vez tenha existido no servidor. Tem de ser marcado,
   * senão ninguém percebe que o login daquele educador nunca recebeu nada.
   */
  const mindset = faltam.find((f) => f.id === 'b')
  teste('marca quem já usa endereço da casa', mindset?.jaTemDoDominio === true)
  teste('e propõe esse mesmo endereço', mindset?.sugestao === 'mindset')
  teste('quem usa email de fora não é marcado', faltam.find((f) => f.id === 'a')?.jaTemDoDominio === false)
}

if (falhas.length) {
  console.error(`correio/caixas: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('correio/caixas: ciclos travados, nomes de sistema recusados, licenças contadas ✓')
