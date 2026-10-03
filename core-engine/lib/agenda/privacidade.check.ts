/**
 * A GUARDA DA PRIVACIDADE DA AGENDA.
 *
 *   npx tsx lib/agenda/privacidade.check.ts
 *
 * ═══ A REGRA, EM UMA FRASE ═════════════════════════════════════════════════════════════════
 *
 * Quem marca uma chamada vê as horas LIVRES. Nunca vê o que está na agenda de quem atende — nem o
 * título de um evento, nem com quem é, nem sequer que as 16h estão ocupadas. Vê que as 16h não
 * aparecem, e isso não diz nada sobre a vida de ninguém.
 *
 * ═══ PORQUE É QUE ISTO É UM FICHEIRO E NÃO UM COMENTÁRIO ═══════════════════════════════════
 *
 * Porque a maneira mais fácil de partir isto é uma «melhoria» bem-intencionada. O `freeBusy` do
 * Google devolve só intervalos; o `events.list` devolve os eventos inteiros, com `summary`,
 * `attendees` e `description`. Um dia alguém precisa de saber a que horas acaba mesmo uma reunião,
 * troca uma chamada pela outra, e a agenda privada do dono passa a atravessar o servidor — a dois
 * `JSON.stringify` de distância de aparecer numa resposta pública. O erro não dá erro.
 *
 * Por isso a regra vive aqui, a ler o código-fonte: se alguém puser `events.list` no caminho da
 * disponibilidade, ou mandar os intervalos ocupados para a rota pública, isto falha.
 */
import { readFileSync } from 'fs'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => { if (!condicao) falhas.push(nome) }

/** Tira comentários, para as regras serem sobre CÓDIGO e não sobre o que está escrito a explicá-lo. */
const semComentarios = (caminho: string): string =>
  readFileSync(caminho, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

// ── 1. A leitura da agenda é por freeBusy, e só por freeBusy ────────────────
{
  const google = semComentarios('lib/agenda/google.ts')

  teste('a disponibilidade lê-se pelo freeBusy', /calendar\/v3\/freeBusy/.test(google))

  // `events.list` (um GET a /events sem id) traria a agenda inteira com títulos e convidados.
  // O que é legítimo é criar (POST a /events) e apagar (DELETE a /events/<id>) o NOSSO evento.
  const listaEventos = /fetch\(\s*[`'"][^`'"]*\/events(\?[^`'"]*)?[`'"]\s*(,\s*\{[^}]*method:\s*['"]GET['"])?\s*\)/
  teste(
    'não se lista a agenda de ninguém',
    !listaEventos.test(google) || /method:\s*'POST'/.test(google),
  )

  // Os campos que o `events.list` traria e que não podem entrar no caminho da disponibilidade.
  for (const campo of ['summary', 'attendees', 'description', 'hangoutLink', 'organizer']) {
    const dentroDoOcupado = new RegExp(`ocupadoNoGoogle[\\s\\S]*?${campo}[\\s\\S]*?\\n\\}`, 'm')
    teste(`«${campo}» não é lido na função que calcula o ocupado`, !dentroDoOcupado.test(google.slice(google.indexOf('export async function ocupadoNoGoogle'), google.indexOf('export async function criarEventoNoGoogle'))))
  }

  // O que a função devolve tem de ser SÓ tempo.
  const corpoOcupado = google.slice(
    google.indexOf('export async function ocupadoNoGoogle'),
    google.indexOf('export async function criarEventoNoGoogle'),
  )
  teste('o ocupado é só início e fim', /inicio:\s*new Date\(b\.start\)/.test(corpoOcupado) && /fim:\s*new Date\(b\.end\)/.test(corpoOcupado))
}

// ── 2. A rota pública devolve horas livres, e mais nada ─────────────────────
{
  const rota = semComentarios('app/api/agenda/horas/route.ts')
  for (const proibido of ['ocupado', 'busy', 'bloqueios', 'agenda_marcacoes', 'google_refresh_token']) {
    teste(`a rota pública das horas não menciona «${proibido}»`, !new RegExp(proibido).test(rota))
  }

  const servidor = semComentarios('lib/agenda/servidor.ts')
  // `horasDoTipo` é o que a rota pública chama. O que ela devolve por anfitrião são as horas livres
  // e o mínimo para as desenhar — nunca a lista de ocupações que usou para as calcular.
  const corpo = servidor.slice(servidor.indexOf('export async function horasDoTipo'), servidor.indexOf('export type ResultadoMarcacao'))
  teste('horasDoTipo devolve horas livres', /horas:\s*horasLivres\(/.test(corpo))
  teste('horasDoTipo não devolve o ocupado', !/ocupado:\s/.test(corpo.replace(/ocupado:\s*await ocupadoDoAnfitriao/g, '')))
}

// ── 3. Os tokens do Google não saem do servidor ─────────────────────────────
{
  const painel = semComentarios('app/api/admin/agenda/route.ts')
  teste(
    'o painel do admin retira o refresh_token antes de responder',
    /const \{ google_refresh_token, \.\.\.resto \}/.test(painel),
  )
  // E nenhuma rota PÚBLICA pode sequer nomear a coluna.
  for (const publica of [
    'app/api/agenda/tipos/route.ts',
    'app/api/agenda/horas/route.ts',
    'app/api/agenda/marcar/route.ts',
    'app/api/agenda/gerir/route.ts',
  ]) {
    teste(`${publica} não toca no refresh_token`, !/google_refresh_token/.test(semComentarios(publica)))
    teste(`${publica} não devolve a tabela de anfitriões em bruto`, !/from\(['"]agenda_anfitrioes['"]\)[\s\S]{0,80}select\(['"]\*/.test(semComentarios(publica)))
  }
}

// ── 4. A rota de cancelar não devolve dados de contacto ─────────────────────
{
  const gerir = semComentarios('app/api/agenda/gerir/route.ts')
  const select = /\.select\(([^)]*)\)/.exec(gerir)?.[1] ?? ''
  for (const campo of ['email', 'telefone', 'respostas', 'utm']) {
    teste(`quem tem o link de cancelar não recebe «${campo}»`, !new RegExp(`\\b${campo}\\b`).test(select))
  }
}

if (falhas.length) {
  console.error(`agenda/privacidade: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log('agenda/privacidade: só freeBusy, só horas livres, tokens e contactos não saem ✓')
