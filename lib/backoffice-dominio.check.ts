/**
 * GUARDA do subdomínio do backoffice.
 *
 * O que se parte aqui não dá erro: dá uma página em branco, ou um 404, ou — pior — uma porta que
 * ficou aberta. As duas avarias que estas verificações existem para impedir:
 *
 *   1. Fechar por engano o `/login` ou as `/api/*` no subdomínio, e ficar com uma porta sem chave.
 *   2. Prefixar duas vezes (`/backoffice/backoffice/...`), que dá 404 na segunda navegação e não na
 *      primeira — o género de avaria que se demora uma tarde a perceber.
 *
 *   npx tsx lib/backoffice-dominio.check.ts
 */
import { readFileSync } from 'node:fs'
import {
  CAMINHO_ENTRADA_BACKOFFICE,
  caminhoInternoBackoffice,
  dispensaPapeis,
  ehAnfitriaoBackoffice,
  ehPedidoBackoffice,
  passaDireto,
  devolverAoSitePrincipal,
  urlNoSitePrincipal,
  SECCOES_BACKOFFICE,
} from './backoffice-dominio'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

// ── Que anfitriões é que são o backoffice ───────────────────────────────────
teste('o subdomínio é reconhecido', ehAnfitriaoBackoffice('backoffice.morethanmoney.pt'))
teste('com porta também', ehAnfitriaoBackoffice('backoffice.localhost:3001'))
teste('maiúsculas não enganam', ehAnfitriaoBackoffice('Backoffice.MoreThanMoney.PT'))
teste('o site normal NÃO é backoffice', !ehAnfitriaoBackoffice('www.morethanmoney.pt'))
teste('o domínio nu não é backoffice', !ehAnfitriaoBackoffice('morethanmoney.pt'))
teste('sem host não se adivinha', !ehAnfitriaoBackoffice(null) && !ehAnfitriaoBackoffice(''))
// Um anfitrião que só CONTENHA o nome não conta — senão `backoffice.morethanmoney.pt.atacante.com`
// entrava por aqui dentro.
teste('sufixo alheio não passa', !ehAnfitriaoBackoffice('backoffice.morethanmoney.pt.atacante.com'))
teste('prefixo alheio não passa', !ehAnfitriaoBackoffice('nao-backoffice.morethanmoney.pt'))

// ── A porta tem de ter chave: login e APIs passam tal e qual ────────────────
for (const p of ['/login', '/login?redirect=%2F', '/auth/callback', '/api/profile', '/_next/static/x.js']) {
  teste(`${p} passa direto`, passaDireto(p))
  teste(`${p} não é reescrito`, caminhoInternoBackoffice(p) === null)
}
teste('reset de password passa', passaDireto('/reset-password'))
// E um caminho que só COMEÇA pelas mesmas letras não passa por engano.
teste('/loginfalso não passa direto', !passaDireto('/loginfalso'))
teste('/apifake não passa direto', !passaDireto('/apifake'))

// ── A raiz do subdomínio é a entrada ────────────────────────────────────────
teste('a raiz vai para a entrada', caminhoInternoBackoffice('/') === '/backoffice')
teste('a entrada não leva barra final', caminhoInternoBackoffice('/') === CAMINHO_ENTRADA_BACKOFFICE)
teste('um caminho normal leva prefixo', caminhoInternoBackoffice('/extracto') === '/backoffice/extracto')
teste('caminhos fundos levam prefixo', caminhoInternoBackoffice('/equipa/ana') === '/backoffice/equipa/ana')

// ── Nunca prefixar duas vezes ───────────────────────────────────────────────
teste('quem já tem prefixo não leva outro', caminhoInternoBackoffice('/backoffice') === null)
teste('nem nos caminhos de dentro', caminhoInternoBackoffice('/backoffice/extracto') === null)
// `/backoffice-antigo` NÃO é `/backoffice/` — e, não sendo uma secção, também não é do backoffice:
// volta ao site principal. Antes era prefixado às cegas, que é o mesmo defeito que engolia `/admin`.
teste('prefixo parcial não se confunde com o real', caminhoInternoBackoffice('/backoffice-antigo') === null)

// ── O SUBDOMÍNIO SÓ SERVE O QUE É DELE (25/09) ──────────────────────────────
//
// Os atalhos do site ficavam em `backoffice.morethanmoney.pt/admin`, que por dentro virava
// `/backoffice/admin` e dava 404. Quem clicava num link conhecido caía no sítio errado.
{
  const SUB = 'backoffice.morethanmoney.pt'
  for (const fora of ['/admin', '/mtm', '/member-area', '/upgrade', '/faq', '/admin/backoffice']) {
    teste(`${fora} volta ao site principal`, devolverAoSitePrincipal(SUB, fora))
    teste(`${fora} não é reescrito para dentro`, caminhoInternoBackoffice(fora) === null)
  }
  for (const dentro of ['/', '/extracto', '/pipeline', '/tarefas', '/equipa', '/material', '/backoffice', '/backoffice/extracto']) {
    teste(`${dentro} fica no backoffice`, !devolverAoSitePrincipal(SUB, dentro))
  }
  // Caminhos de dentro de uma secção continuam a ser do backoffice.
  teste('/pipeline/3 fica no backoffice', !devolverAoSitePrincipal(SUB, '/pipeline/3'))
  // O que passa direto nunca é devolvido: o login no próprio subdomínio tem de funcionar, e as
  // APIs são as mesmas do site.
  for (const passa of ['/login', '/api/backoffice/eu', '/_next/static/x.js']) {
    teste(`${passa} não é devolvido`, !devolverAoSitePrincipal(SUB, passa))
  }
  // E no domínio normal nada disto se aplica.
  teste('no www nada é devolvido', !devolverAoSitePrincipal('www.morethanmoney.pt', '/admin'))
  // O destino leva o caminho e a query, para um link com parâmetros não os perder pelo caminho.
  teste('o destino mantém caminho e query',
    urlNoSitePrincipal('/admin/backoffice', '?tab=equipa') === 'https://www.morethanmoney.pt/admin/backoffice?tab=equipa')
}

// A lista de secções tem de bater certo com o menu do layout — uma secção nova no menu e esquecida
// na lista manda a pessoa para o `www` a meio do backoffice.
{
  const layout = readFileSync('app/backoffice/layout.tsx', 'utf8')
  for (const s of SECCOES_BACKOFFICE) {
    teste(`o menu conhece /${s}`, layout.includes(`/backoffice/${s}`))
  }
  for (const m of layout.matchAll(/href: '\/backoffice\/([a-z-]+)'/g)) {
    teste(`a lista conhece /${m[1]}`, (SECCOES_BACKOFFICE as readonly string[]).includes(m[1]))
  }
}

// ── Quem é pedido do backoffice ─────────────────────────────────────────────
teste('subdomínio + caminho normal', ehPedidoBackoffice('backoffice.morethanmoney.pt', '/extracto'))
teste('subdomínio + raiz', ehPedidoBackoffice('backoffice.morethanmoney.pt', '/'))
teste('site normal + /backoffice', ehPedidoBackoffice('www.morethanmoney.pt', '/backoffice/extracto'))
teste('site normal + resto do site NÃO', !ehPedidoBackoffice('www.morethanmoney.pt', '/member-area'))
// O login no subdomínio não é pedido do backoffice: é o login do site, e tem de ser servido como tal.
teste('login no subdomínio não é backoffice', !ehPedidoBackoffice('backoffice.morethanmoney.pt', '/login'))
teste('api no subdomínio não é backoffice', !ehPedidoBackoffice('backoffice.morethanmoney.pt', '/api/x'))

// ── Só a entrada dispensa papéis ────────────────────────────────────────────
// Se esta lista crescer sem ninguém pensar, passa a haver páginas do backoffice abertas a estranhos.
teste('a entrada dispensa papéis', dispensaPapeis('/backoffice'))
teste('o extracto NÃO dispensa papéis', !dispensaPapeis('/backoffice/extracto'))
teste('a equipa NÃO dispensa papéis', !dispensaPapeis('/backoffice/equipa'))
teste('o pipeline NÃO dispensa papéis', !dispensaPapeis('/backoffice/pipeline'))

// ── E o middleware usa mesmo isto ───────────────────────────────────────────
// Uma regra bem escrita e não ligada é pior do que regra nenhuma: dá a sensação de estar protegida.
const mw = readFileSync('middleware.ts', 'utf8')
teste('o middleware conhece o subdomínio', /ehPedidoBackoffice/.test(mw))
teste('o middleware reescreve, não redirecciona', /NextResponse\.rewrite/.test(mw))
teste('o middleware exige bo.entrar', /pode\(capacidades, "bo\.entrar"\)/.test(mw))
// A leitura TEM de vir do ficheiro só-leitura: `backoffice-sessao` importa `next/headers`, que não
// existe no edge. Se alguém trocar o import, a build rebenta longe daqui — apanha-se aqui primeiro.
teste('o middleware lê pelo ficheiro do edge', /backoffice-papeis-leitura/.test(mw))
teste('o middleware NÃO importa backoffice-sessao', !/from "@\/lib\/backoffice-sessao"/.test(mw))
// Sem `if (isAdmin)` à solta: ser dono passa por `capacidadesDe`, como tudo o resto.
teste('o dono passa pelo mesmo caminho', /capacidadesDe\(/.test(mw))
// A restrição de áreas do site está ligada, e reescreve para uma página que explica.
teste('a restrição de áreas está ligada', /areaDoCaminho\(pathname\)/.test(mw))
teste('a recusa de área tem página', /acesso-restrito/.test(mw))

const leitura = readFileSync('lib/backoffice-papeis-leitura.ts', 'utf8')
// A procura é pelo IMPORT, não pelo nome: o ficheiro fala de `next/headers` num comentário, a
// explicar por que razão não o pode usar, e um teste que confundisse as duas coisas obrigava a
// apagar a explicação para passar.
teste('a leitura do edge não importa next/headers', !/from ['"]next\/headers['"]/.test(leitura))
teste('a leitura do edge não usa service role', !/getSupabaseAdmin/.test(leitura))
// Falha de leitura devolve vazio em vez de lançar: no middleware um `throw` dava 500 em TODO o site,
// e um erro que abre a porta é o único resultado inaceitável.
teste('a leitura falha fechada', /catch \{\s*return \[\]/.test(leitura))

if (falhas.length) {
  console.error(`backoffice-dominio: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('backoffice-dominio: o subdomínio reescreve, o login fica com chave, e só a entrada dispensa papéis ✓')
