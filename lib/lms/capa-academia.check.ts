/**
 * A GUARDA DA CAPA DA ACADEMIA.
 *
 *   npx tsx lib/lms/capa-academia.check.ts
 *
 * Prova sobretudo o CASO MAU — as três formas de isto falhar calado: um upload falhado deixar a
 * capa antiga como se tivesse trocado, um URL gravado que aponta para nada, e uma capa que não é
 * 16:9 e deforma a secção sem ninguém ser avisado.
 */
import {
  RACIO_CAPA,
  avaliarRacio,
  caminhoNoStorage,
  decidirCapa,
  normalizarCapa,
  validarCapa,
} from './capa-academia'

const falhas: string[] = []
const teste = (nome: string, condicao: boolean) => {
  if (!condicao) falhas.push(nome)
}

const ANTIGA = 'https://x.supabase.co/storage/v1/object/public/lms-assets/academies/a/1.jpg'
const NOVA = 'https://x.supabase.co/storage/v1/object/public/lms-assets/academies/a/2.jpg'

// ── O UPLOAD FALHOU: NÃO SE GRAVA, E DIZ-SE ─────────────────────────────────
{
  /**
   * O CASO MAU NÚMERO UM. O admin escolheu imagem nova, o upload rebentou, e o formulário ainda
   * tem o URL antigo em mão. Gravar o antigo por cima do antigo com um «guardado» verde é a
   * forma mais limpa de mentir a quem está a trabalhar.
   */
  const d = decidirCapa({ capaAtual: ANTIGA, capaEscolhida: ANTIGA, uploadFalhou: true })
  teste('upload falhado não grava', !d.gravar)
  teste('e diz porquê', typeof d.motivo === 'string' && d.motivo.length > 0)
  teste('e o motivo diz que a capa NÃO foi trocada', (d.motivo || '').includes('NÃO foi trocada'))

  // Mesmo sem capa antiga nenhuma: um upload falhado não cria uma academia «com capa».
  const semAntiga = decidirCapa({ capaAtual: null, capaEscolhida: NOVA, uploadFalhou: true })
  teste('upload falhado não grava nem na criação', !semAntiga.gravar)
  teste('e não inventa a capa que não subiu', semAntiga.valor === null)
}

// ── URLs QUE APONTAM PARA NADA ──────────────────────────────────────────────
{
  /**
   * O CASO MAU NÚMERO DOIS. Nada disto dá erro na base — dá uma academia que jura ter capa e
   * mostra um rectângulo vazio.
   */
  teste('string vazia é «sem capa», não capa vazia', normalizarCapa('') === null)
  teste('só espaços é «sem capa»', normalizarCapa('    ') === null)
  teste('a string literal "undefined" não é capa', normalizarCapa('undefined') === null)
  teste('nem "null"', normalizarCapa('null') === null)
  teste('nem "[object Object]"', normalizarCapa('[object Object]') === null)
  teste('e nem um número que apareça por engano', normalizarCapa(42) === null)

  // `null` é um resultado VÁLIDO: tirar a capa é um gesto legítimo, não um erro.
  const semCapa = validarCapa('   ')
  teste('sem capa é válido (tirar a capa pode)', semCapa.ok && semCapa.url === null)

  // javascript: num `src` vindo do painel é um buraco, não uma capa.
  teste('javascript: é recusado', !validarCapa('javascript:alert(1)').ok)
  teste('data: é recusado', !validarCapa('data:image/png;base64,AAAA').ok)
  teste('texto solto é recusado', !validarCapa('capa da academia').ok)
  teste('protocol-relative é recusado', !validarCapa('//evil.example/x.jpg').ok)

  const https = validarCapa(`  ${NOVA}  `)
  teste('https passa e vem já aparado', https.ok && https.url === NOVA)
  const local = validarCapa('/images/forex.jpg')
  teste('um caminho da casa passa', local.ok && local.url === '/images/forex.jpg')
}

// ── O CAMINHO NO STORAGE, PARA SE PODER IR CONFIRMAR ────────────────────────
{
  /**
   * Sem isto, apagar o ficheiro no bucket deixa a academia a apontar para um 404 — e um 404 numa
   * imagem não dá erro em sítio nenhum. É este caminho que deixa a rota ir ver se existe.
   */
  const c = caminhoNoStorage(NOVA)
  teste('tira o bucket do URL público', c?.bucket === 'lms-assets')
  teste('e o caminho do objecto', c?.path === 'academies/a/2.jpg')

  // Query string e fragmento não fazem parte do caminho do objecto.
  teste('ignora ?token e #ancora',
    caminhoNoStorage(`${NOVA}?t=1#x`)?.path === 'academies/a/2.jpg')
  teste('descodifica espaços no nome do ficheiro',
    caminhoNoStorage('https://x.supabase.co/storage/v1/object/public/lms-assets/a/foto%20final.jpg')?.path ===
      'a/foto final.jpg')

  // Uma imagem de fora não é nossa para confirmar — e NÃO se recusa por isso.
  teste('imagem externa não tem caminho nosso', caminhoNoStorage('https://cdn.exemplo.com/a.jpg') === null)
  teste('caminho local não tem caminho nosso', caminhoNoStorage('/images/forex.jpg') === null)
  teste('sem capa não tem caminho nosso', caminhoNoStorage(null) === null)
  teste('URL do storage sem ficheiro não conta',
    caminhoNoStorage('https://x.supabase.co/storage/v1/object/public/lms-assets') === null)
}

// ── 16:9: AVISA, NÃO BLOQUEIA ───────────────────────────────────────────────
{
  /**
   * O CASO MAU NÚMERO TRÊS. Uma imagem quadrada num espaço 16:9 sai esticada ou cortada ao meio,
   * e tecnicamente está tudo bem — por isso é que nunca aparece erro nenhum.
   */
  const quadrada = avaliarRacio(1000, 1000)
  teste('uma capa quadrada é apanhada', !quadrada.aceitavel)
  teste('e o aviso diz o que recortar', (quadrada.aviso || '').includes('16:9'))

  const vertical = avaliarRacio(1080, 1920)
  teste('uma capa vertical é apanhada', !vertical.aceitavel)
  const quatroPorTres = avaliarRacio(1024, 768)
  teste('4:3 é apanhado', !quatroPorTres.aceitavel)

  const certa = avaliarRacio(1920, 1080)
  teste('1920×1080 passa', certa.aceitavel)
  teste('e não aparece aviso a quem acertou', certa.aviso === null)
  teste('1280×720 passa', avaliarRacio(1280, 720).aceitavel)
  // Recortes à mão ficam a um pixel do rácio: punir isso era punir imagens boas.
  teste('1920×1081 (recorte à mão) passa', avaliarRacio(1920, 1081).aceitavel)
  teste('o rácio devolvido é o da imagem', Math.abs(avaliarRacio(1920, 1080).racio - RACIO_CAPA) < 1e-9)

  /**
   * Sem medidas NÃO se inventa veredicto. Um `aceitavel: false` aqui punia o que não se conseguiu
   * medir — e o browser falha a ler as dimensões de imagens perfeitamente válidas.
   */
  teste('dimensões a zero não dão veredicto', avaliarRacio(0, 0).aceitavel && avaliarRacio(0, 0).aviso === null)
  teste('dimensões ilegíveis não dão veredicto', avaliarRacio(undefined, null).aceitavel)
  teste('negativos não dão veredicto', avaliarRacio(-16, -9).aceitavel)
}

// ── GRAVAR O QUE MUDOU, E SÓ O QUE MUDOU ────────────────────────────────────
{
  const troca = decidirCapa({ capaAtual: ANTIGA, capaEscolhida: NOVA })
  teste('capa nova grava', troca.gravar && troca.valor === NOVA)

  // Tirar a capa é um gesto legítimo e tem de chegar à base como `null`.
  const tirar = decidirCapa({ capaAtual: ANTIGA, capaEscolhida: '' })
  teste('tirar a capa grava null', tirar.gravar && tirar.valor === null)

  // Igual ao que já lá está: não é erro, é não haver trabalho. Sem motivo, para não dar alarme a
  // quem não fez nada de mal.
  const igual = decidirCapa({ capaAtual: ANTIGA, capaEscolhida: `  ${ANTIGA}  ` })
  teste('capa igual não grava', !igual.gravar)
  teste('e não é tratada como erro', igual.motivo === null)

  // Já sem capa e continua sem capa: também não há nada a gravar.
  const nadaParaNada = decidirCapa({ capaAtual: null, capaEscolhida: '  ' })
  teste('sem capa para sem capa não grava', !nadaParaNada.gravar && nadaParaNada.motivo === null)

  // URL inválido recusa com motivo e deixa a capa atual intacta.
  const mau = decidirCapa({ capaAtual: ANTIGA, capaEscolhida: 'javascript:alert(1)' })
  teste('URL inválido não grava', !mau.gravar)
  teste('e explica-se', typeof mau.motivo === 'string' && mau.motivo.length > 0)
  teste('e não mexe na capa atual', mau.valor === ANTIGA)
}

if (falhas.length) {
  console.error(`lms/capa-academia: ${falhas.length} falha(s)`)
  for (const f of falhas) console.error('  · ' + f)
  process.exit(1)
}
console.log(
  'lms/capa-academia: upload falhado não mente, URLs de lixo não entram, e o 16:9 avisa sem bloquear ✓',
)
