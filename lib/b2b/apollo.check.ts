/**
 * A GUARDA DA FONTE APOLLO (15/11).   npx tsx lib/b2b/apollo.check.ts
 *
 * Puro, sem rede: a chave nunca aparece no código, os domínios limpam-se bem, cada segmento tem
 * palavras e o país certo, e as páginas tentadas são só as da própria empresa (máx. 2).
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { limparDominio, paraEmpresa } from '../apollo/cliente'
import { filtrosDoSegmento, paginasDeContacto } from './apollo'
import { SEGMENTOS } from './sequencias'

const falhas: string[] = []
const teste = (n: string, ok: boolean) => { if (!ok) falhas.push(n) }

// A chave vive só no ambiente.
for (const f of [join(__dirname, '../apollo/cliente.ts'), join(__dirname, 'apollo.ts')]) {
  const src = readFileSync(f, 'utf8')
  teste(`${f}: lê a chave do ambiente`, !f.endsWith('cliente.ts') || src.includes('process.env.APOLLO_API_KEY'))
  teste(`${f}: sem chave escrita`, !/x-api-key['"]?\s*:\s*['"][A-Za-z0-9]{16,}/.test(src) && !/APOLLO_API_KEY\s*=\s*['"]?[A-Za-z0-9]{16,}/.test(src))
}

teste('domínio com https e www', limparDominio('https://www.exemplo.pt/contactos') === 'exemplo.pt')
teste('domínio vazio', limparDominio('') === null)
teste('domínio lixo', limparDominio('não é domínio') === null)

const e = paraEmpresa({ id: 'o1', name: ' Escola X ', primary_domain: 'escolax.pt', estimated_num_employees: '12', keywords: ['a'] })
teste('empresa mapeada', !!e && e.nome === 'Escola X' && e.dominio === 'escolax.pt' && e.site === 'https://escolax.pt' && e.funcionarios === 12)
teste('empresa sem nome recusada', paraEmpresa({ id: 'o2' }) === null)

for (const s of SEGMENTOS) {
  const pt = filtrosDoSegmento(s, 'PT')
  const br = filtrosDoSegmento(s, 'BR')
  teste(`${s}: tem palavras`, pt.palavras.length > 0)
  teste(`${s}: PT → Portugal`, pt.locais[0] === 'Portugal')
  teste(`${s}: BR → Brazil`, br.locais[0] === 'Brazil')
}

const pag = paginasDeContacto('https://www.exemplo.pt/algo', 'PT')
teste('páginas: 2 e do próprio site', pag.length === 2 && pag.every((u) => u.startsWith('https://www.exemplo.pt/')))
teste('páginas BR usam /contato', paginasDeContacto('exemplo.com.br', 'BR')[0] === 'https://exemplo.com.br/contato')
teste('páginas: site inválido → nada', paginasDeContacto('::', 'PT').length === 0)

if (falhas.length) {
  console.error(`✗ ${falhas.length} falha(s):\n - ` + falhas.join('\n - '))
  process.exit(1)
}
console.log('✓ apollo.check: tudo certo')
