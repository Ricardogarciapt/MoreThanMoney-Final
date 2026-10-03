/**
 * O QUE O AIOS PODE PERGUNTAR À BASE — a decisão, sem base de dados e sem rede.
 *
 * ═══ PORQUE É QUE ISTO EXISTE ══════════════════════════════════════════════════════════════
 *
 * O AIOS é um assistente de VOZ. Entre o que o dono diz e o que chega aqui há um microfone, um
 * reconhecedor de fala e um modelo de linguagem — três sítios onde «mostra-me os clientes» se pode
 * transformar noutra coisa qualquer. Dar-lhe uma ligação livre à base de produção é dar essa
 * cadeia inteira a quem guarda os dados de clientes reais.
 *
 * Por isso a regra não é «confiar no modelo»: é **só passar o que for inequivocamente uma
 * leitura**. Tudo o resto é recusado com o motivo escrito, e quem precisar de escrever usa os
 * caminhos que já existem e que pedem confirmação em voz alta.
 *
 * ═══ O QUE ISTO TRAVA, E PORQUE É QUE NÃO SE VÊ ════════════════════════════════════════════
 *
 * Nada aqui rebenta quando está mal. Uma consulta a mais que passe não dá erro nenhum: dá dados que
 * não deviam sair, ou uma escrita que ninguém pediu. O caso que assusta é o do `WITH`:
 *
 *     WITH x AS (DELETE FROM profiles RETURNING *) SELECT * FROM x
 *
 * Começa por `WITH`, acaba em `SELECT`, e apaga a tabela toda. Uma validação que só olhasse para a
 * primeira palavra deixava passar isto — e por isso é que a primeira palavra não chega.
 */

/** Quanto se devolve, no máximo. Uma resposta falada não lê mil linhas. */
export const LIMITE_LINHAS = 200

/**
 * As colunas que NUNCA saem, mesmo numa leitura legítima.
 *
 * Não é paranoia: `mt5_password_cifrada` e `mt5_investor_cifrada` são credenciais de contas de
 * trading com dinheiro, e `password_hash` é o que permite entrar como outra pessoa. Uma resposta
 * falada que as leia em voz alta numa sala com gente é a pior forma possível de as perder.
 */
export const COLUNAS_PROIBIDAS = [
  'password', 'password_hash', 'mt5_password_cifrada', 'mt5_investor_cifrada',
  'service_role', 'secret', 'api_key', 'access_token', 'refresh_token', 'client_secret',
  'encrypted_password', 'token_cifrado',
]

/** Tabelas inteiras que não se leem por aqui — guardam segredos e nada mais. */
export const TABELAS_PROIBIDAS = [
  'auth.users', 'vault.secrets', 'backoffice_telegram_codigos',
]

export interface Veredicto {
  pode: boolean
  codigo: string
  /** Em português, para ser dito em voz alta a quem perguntou. */
  porque: string
  /** A consulta já com o limite aplicado, quando passa. */
  sql?: string
}

/** Tira comentários e espaços a mais: é neles que se escondem as palavras que não queremos ver. */
function limpar(sql: string): string {
  return String(sql ?? '')
    .replace(/--[^\n]*/g, ' ')        // comentário de linha
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // comentário de bloco
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * As palavras que mudam o mundo. Procuram-se como PALAVRA INTEIRA em qualquer parte da consulta,
 * e não só no início: o perigo do `WITH … DELETE … SELECT` está no meio, não na ponta.
 */
const ESCREVE = [
  'insert', 'update', 'delete', 'drop', 'truncate', 'alter', 'create', 'grant', 'revoke',
  'comment', 'copy', 'vacuum', 'analyze', 'reindex', 'cluster', 'refresh', 'call', 'do',
  'set', 'reset', 'listen', 'notify', 'lock', 'prepare', 'execute', 'deallocate', 'discard',
  'security', 'definer', 'pg_read_file', 'pg_write', 'lo_import', 'lo_export', 'dblink',
]

export function validarLeitura(bruto: string): Veredicto {
  const sql = limpar(bruto)
  if (!sql) return { pode: false, codigo: 'vazia', porque: 'Não veio consulta nenhuma.' }
  if (sql.length > 4000) {
    return { pode: false, codigo: 'longa', porque: 'A consulta é demasiado longa para ser uma pergunta.' }
  }

  const minusc = sql.toLowerCase()

  // Começar por SELECT ou WITH é necessário, mas longe de ser suficiente.
  if (!/^(select|with)\b/.test(minusc)) {
    return { pode: false, codigo: 'nao_e_leitura', porque: 'Só se consultam dados: a consulta tem de começar por SELECT.' }
  }

  /**
   * UMA INSTRUÇÃO SÓ. Um `;` a meio permite encadear uma segunda — e é a segunda que faz o
   * estrago. O `;` final é tolerado porque toda a gente o escreve por hábito.
   */
  const semFinal = minusc.replace(/;\s*$/, '')
  if (semFinal.includes(';')) {
    return { pode: false, codigo: 'varias', porque: 'Uma consulta de cada vez — o ponto e vírgula a meio permitia encadear outra.' }
  }

  for (const p of ESCREVE) {
    if (new RegExp(`(^|[^a-z_])${p}([^a-z_]|$)`, 'i').test(semFinal)) {
      return {
        pode: false,
        codigo: 'escreve',
        porque: `A consulta tem «${p}», que muda ou expõe coisas. Por aqui só se lê — escrever faz-se pelos caminhos que pedem confirmação.`,
      }
    }
  }

  for (const t of TABELAS_PROIBIDAS) {
    if (semFinal.includes(t.toLowerCase())) {
      return { pode: false, codigo: 'tabela_fechada', porque: `«${t}» guarda segredos e não se lê por aqui.` }
    }
  }

  for (const c of COLUNAS_PROIBIDAS) {
    if (new RegExp(`(^|[^a-z_])${c}([^a-z_]|$)`, 'i').test(semFinal)) {
      return {
        pode: false,
        codigo: 'coluna_fechada',
        porque: `«${c}» é uma credencial. Não sai por aqui, nem para ser lida em voz alta.`,
      }
    }
  }

  /**
   * O `SELECT *` é recusado de propósito, e não por estilo: num assistente que fala, um `*` traz
   * colunas que ninguém pediu — incluindo as que estão na lista acima, se um dia alguém
   * acrescentar uma coluna nova a uma tabela já lida. Nomear as colunas é a única forma de o
   * resultado não mudar sozinho quando a base muda.
   */
  if (/select\s+\*/i.test(semFinal)) {
    return {
      pode: false,
      codigo: 'estrela',
      porque: 'Diz que colunas queres. Um SELECT * traz colunas que ninguém pediu, e amanhã traz as que ainda não existem.',
    }
  }

  // O limite entra sempre, mesmo quando já lá está um maior.
  const temLimite = /\blimit\s+(\d+)/i.exec(semFinal)
  let final = sql.replace(/;\s*$/, '')
  if (temLimite) {
    const n = Number(temLimite[1])
    if (n > LIMITE_LINHAS) final = final.replace(/\blimit\s+\d+/i, `LIMIT ${LIMITE_LINHAS}`)
  } else {
    final = `${final} LIMIT ${LIMITE_LINHAS}`
  }

  return { pode: true, codigo: 'ok', porque: 'Leitura aceite.', sql: final }
}
