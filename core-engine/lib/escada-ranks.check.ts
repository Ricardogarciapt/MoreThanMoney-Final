/**
 * GUARDA da escada de ranks. Isto diz a uma pessoa quanto vai ganhar: não pode voltar a mentir.
 *
 * 25/09: a escada prometia valores FIXOS por mês — 500 € no Distribuidor, até 20 000 € no
 * Embaixador — que davam cerca de metade da receita das pernas que os qualificam, em cima dos 50%
 * já pagos aos patrocinadores. Somado, passava dos 100% da receita. Passou a percentagem do volume
 * da perna menor, com diferencial.
 *
 *   npx tsx lib/escada-ranks.check.ts
 */
import { readFileSync } from 'node:fs'

const falhas: string[] = []
const teste = (nome: string, ok: boolean) => { if (!ok) falhas.push(nome) }

const migracao = readFileSync('supabase/migrations/130_escada_ranks_percentagem.sql', 'utf8')

// As percentagens aprovadas pelo dono. Se alguém as mudar, que seja de propósito.
for (const [slug, pct] of [['distribuidor', 6], ['lider', 9], ['gestor', 12], ['diretor', 15], ['embaixador', 18]] as const) {
  teste(`${slug} paga ${pct}%`, new RegExp(`residual_pct\\s*=\\s*${pct}\\b[\\s\\S]{0,60}'${slug}'`).test(migracao))
}

// O diferencial é o que põe tecto ao custo: sem ele a mesma subscrição paga a toda a linha acima.
teste('o diferencial está explicado na migração', /diferencial/i.test(migracao))

// As colunas antigas NÃO se apagam: são elas que pagam os nós «da casa», e apagar o valor com que
// alguém entrou é perder a prova do que lhe foi prometido.
teste('não apaga as colunas antigas', !/drop column\s+(monthly_residual|rank_bonus)/i.test(migracao))
teste('marca quem fica na escada antiga', /casa_valor_fixo/.test(migracao))
teste('o plano fica gravado no nó, não numa data', /plano_rank/.test(migracao))

// O que a pessoa LÊ tem de ser o plano dela, e nunca os dois somados.
const ecra = readFileSync('components/mobile/mlm-dashboard-tab.tsx', 'utf8')
teste('o ecrã do membro conhece a percentagem', /residual_pct/.test(ecra))
teste('a percentagem manda sobre o valor fixo', /residual_pct\s*\?\?\s*0\)\s*>\s*0\s*\?/.test(ecra))

// E o admin tem de conseguir mexer nela sem deploy.
const painel = readFileSync('components/admin/mlm-manager.tsx', 'utf8')
teste('o admin edita a percentagem', /residual_pct/.test(painel))
teste('o admin edita o bónus único', /bonus_unico/.test(painel))
const rota = readFileSync('app/api/admin/mlm/ranks/route.ts', 'utf8')
teste('a rota grava os campos novos', /residual_pct/.test(rota) && /bonus_unico/.test(rota))

// O ecrã tem de dizer a VERDADE sobre o campo que se está a editar. A etiqueta «Bónus Rank (€)»
// estava em cima do campo da percentagem: quem editasse a escada escrevia euros onde a base guarda
// %, e o erro só aparecia no extracto de alguém.
teste('a etiqueta do campo da % não diz euros', !/Bónus Rank \(€\)[\s\S]{0,200}residual_pct/.test(painel))
teste('a coluna da % não se chama «Bónus Rank»', !/'Bónus Rank'/.test(painel))

// Duas pessoas com o mesmo rank podem ser pagas de forma diferente. Se o admin não mostrar qual é a
// escada de cada uma, o dono não tem como responder a «porque é que recebi menos do que ele».
teste('o admin mostra quem está na escada antiga', /plano_rank/.test(painel) && /casa_valor_fixo/.test(painel))
const rotaRede = readFileSync('app/api/admin/mlm/affiliates/route.ts', 'utf8')
teste('a rede entrega o plano de cada pessoa', /plano_rank/.test(rotaRede))

if (falhas.length) {
  console.error(`escada-ranks: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('escada-ranks: percentagens aprovadas, diferencial, «casa» preservada, e o membro vê o SEU plano ✓')
