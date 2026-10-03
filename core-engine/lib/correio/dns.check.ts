/**
 * O ESTADO REAL DO CORREIO DO DOMÍNIO.
 *
 *   npx tsx lib/correio/dns.check.ts
 *   npx tsx lib/correio/dns.check.ts morethanmoney.pt
 *
 * Pergunta ao DNS, não à documentação. Existe porque a 30/09/2026 o site publicava seis endereços
 * `@morethanmoney.pt` — em `/faq`, nos termos, nas páginas legais do MTM Funded e no rodapé — e o
 * domínio NÃO TINHA MX. Toda a gente que escreveu para `suporte@` nesses meses levou bounce, e do
 * lado de dentro não havia sinal nenhum: o site não envia por esses endereços, logo nada falhava
 * visivelmente. Só uma consulta ao DNS mostra isto.
 *
 * Corre-se depois de colar os registos, para confirmar com factos em vez de «deve estar bom».
 */
import { promises as dns } from 'dns'
import type { MxRecord } from 'dns'

const DOMINIO = process.argv[2] ?? 'morethanmoney.pt'

/** Os endereços que o site publica a clientes. Vieram da varredura de 30/09. */
const PUBLICADOS = ['suporte', 'support', 'funded', 'geral']

async function main() {
  const problemas: string[] = []
  const notas: string[] = []

  // ── MX: sem isto, nada do que o site publica recebe ───────────────────────
  let mx: MxRecord[] = []
  try {
    mx = await dns.resolveMx(DOMINIO)
  } catch {
    mx = []
  }
  if (mx.length === 0) {
    problemas.push(
      `${DOMINIO} não tem MX — nenhum dos endereços publicados recebe correio ` +
      `(${PUBLICADOS.map((p) => `${p}@`).join(' ')}). Quem escrever leva bounce.`,
    )
  } else {
    notas.push('MX: ' + mx.sort((a, b) => a.priority - b.priority).map((r) => `${r.priority} ${r.exchange}`).join(' · '))
  }

  // ── SPF: um só, e o certo ─────────────────────────────────────────────────
  let txt: string[][] = []
  try {
    txt = await dns.resolveTxt(DOMINIO)
  } catch {
    txt = []
  }
  const spf = txt.map((p) => p.join('')).filter((v) => v.toLowerCase().startsWith('v=spf1'))
  if (spf.length === 0) {
    problemas.push('Sem SPF. O correio que sair em nome do domínio será tratado como suspeito.')
  } else if (spf.length > 1) {
    // Este é o erro que se comete ao adicionar um segundo provedor: a norma diz que mais de um
    // registo SPF invalida a verificação toda — é PIOR do que não ter nenhum.
    problemas.push(`${spf.length} registos SPF. Mais do que um invalida a verificação toda — juntar num só.`)
  } else {
    notas.push('SPF: ' + spf[0])
  }

  // ── DMARC: não é obrigatório, mas a falta dele é o que deixa qualquer um
  //    enviar em nome do domínio sem consequência ────────────────────────────
  try {
    const d = (await dns.resolveTxt(`_dmarc.${DOMINIO}`)).map((p) => p.join(''))
    notas.push('DMARC: ' + (d[0] ?? '(vazio)'))
  } catch {
    notas.push('DMARC: em falta — recomendado `v=DMARC1; p=none; rua=mailto:geral@' + DOMINIO + '`')
  }

  for (const n of notas) console.log('  ' + n)

  if (problemas.length) {
    console.error(`\ncorreio/dns: ${problemas.length} problema(s) em ${DOMINIO}`)
    for (const p of problemas) console.error('  · ' + p)
    process.exit(1)
  }
  console.log(`\ncorreio/dns: ${DOMINIO} recebe correio e tem SPF ✓`)
}

void main()
