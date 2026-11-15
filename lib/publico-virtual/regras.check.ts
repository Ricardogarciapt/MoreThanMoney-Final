/**
 * Guarda do público virtual (lado do site).   npx tsx lib/publico-virtual/regras.check.ts
 */
import { ALVOS, limparPessoais, urlPublica, validarPedidoPV, RONDAS_TECTO } from './regras'

let falhas = 0
const ok = (c: boolean, n: string) => { console.log((c ? '  ok  ' : '  XX  ') + n); if (!c) falhas++ }

ok(urlPublica('/agendar') === 'https://www.morethanmoney.pt/agendar', 'caminho relativo')
ok(urlPublica('https://evil.example/') === null, 'domínio alheio recusado')
ok(urlPublica('http://www.morethanmoney.pt/') === null, 'http recusado')
for (const p of ['/admin', '/admin/social', '/backoffice/x', '/api/cron/a', '/aios', '/dashboard-gestao', '/member-area'])
  ok(urlPublica(p) === null, 'área fechada: ' + p)
ok(Object.values(ALVOS).every((u) => u === null || urlPublica(u) !== null), 'todo o catálogo é público')
const l = limparPessoais('joao@gmail.com +351 912 666 699 PT50 0002 0123 1234 5678 9015 4 em 2026')
ok(!l.includes('@') && !l.includes('912') && !l.includes('PT50') && l.includes('2026'), 'limpa dados pessoais: ' + l)
const v = validarPedidoPV({ alvo: 'funil:agendar', rondas: 999 })
ok(v.ok && v.pedido.rondas === RONDAS_TECTO && v.pedido.url!.endsWith('/agendar'), 'rondas com tecto')
ok(!validarPedidoPV({ alvo: 'xpto' }).ok, 'alvo desconhecido')
ok(!validarPedidoPV({ alvo: 'conteudo:texto', texto: 'curto' }).ok, 'texto obrigatório')
ok(!validarPedidoPV({ alvo: 'site:home', url: 'https://outro.pt' }).ok, 'URL alheia')
const t = validarPedidoPV({ alvo: 'dm:texto', texto: 'Olá! Liga-me para 912666699 e marca a tua chamada de onboarding.' })
ok(t.ok && !t.pedido.texto!.includes('912666699'), 'texto limpo')

console.log(falhas ? `\n${falhas} FALHA(S)` : '\nTUDO VERDE')
process.exit(falhas ? 1 : 0)
