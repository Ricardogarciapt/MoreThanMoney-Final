/**
 * CRIAR UM AFILIADO DE RAIZ — alguém que ainda não é membro, e que passa a ter login para o
 * backoffice e mais nada.
 *
 * PORQUÊ UMA ROTA SÓ PARA ISTO
 * Dar um papel a quem já tem conta é mexer numa lista (`/api/admin/backoffice/papeis`). Isto CRIA
 * uma conta de autenticação, que é uma operação com consequências diferentes. Juntar as duas numa
 * rota só significava que um nome de campo trocado criava um login que ninguém pediu.
 *
 * O QUE ESTA CONTA É, E O QUE NÃO É
 * É um login. Não é um cliente: nasce com `user_type: 'pending'` e `is_active: false`, que é
 * exactamente o que o `isRegisteredMember` já recusa — por isso não abre o /member-area, nem os
 * sinais, nem a app. O acesso ao backoffice vem dos PAPÉIS, que é outro portão. É por os dois serem
 * separados que dar um papel não dá produto pago, e tirar um papel não tira o que alguém pagou.
 *
 * SEM PASSWORDS AQUI
 * Não se recebe nem se inventa password nenhuma. A conta nasce sem ela e devolve-se um link de
 * definição de password para o Ricardo entregar à pessoa. Uma password que passa por um corpo de
 * pedido fica em registos de servidor, e uma password inventada por nós fica escrita no painel.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin, isValidEmail, sanitizeString, verifyAdminAccess } from '@/lib/admin-api-helpers'
import { ehPapel, type Papel } from '@/lib/backoffice-papeis'
import { normalizarAreas } from '@/lib/backoffice-acessos-site'

export async function POST(request: NextRequest) {
  const auth = await verifyAdminAccess()
  if (!auth.isAdmin || !auth.userId) {
    return NextResponse.json({ error: auth.error || 'Acesso negado' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: 'Corpo inválido' }, { status: 400 })
  }

  const email = sanitizeString(String(body.email ?? '')).toLowerCase()
  const fullName = sanitizeString(String(body.full_name ?? ''))
  const username = sanitizeString(String(body.username ?? ''))

  if (!isValidEmail(email)) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  if (!fullName) return NextResponse.json({ error: 'Falta o nome' }, { status: 400 })

  // Papéis pedidos; sem nenhum, fica `afiliado` — é o caso para que esta rota existe. Uma conta
  // criada com zero papéis era um login que não abre nada e que ninguém percebia para que servia.
  const pedidos = Array.isArray(body.papeis) ? body.papeis : [body.papel ?? 'afiliado']
  const papeis: Papel[] = [...new Set(pedidos.filter(ehPapel))]
  if (papeis.length === 0) {
    return NextResponse.json({ error: 'Nenhum papel válido indicado' }, { status: 400 })
  }

  const areas = normalizarAreas(body.areas)
  const supabase = getSupabaseAdmin()

  // Email repetido para-se AQUI, antes de criar nada. Criar o auth user primeiro e falhar no perfil
  // deixava uma conta de autenticação órfã que ninguém via no painel e que impedia a segunda
  // tentativa de funcionar — um beco sem saída sem mensagem nenhuma.
  const { data: existente } = await supabase
    .from('profiles')
    .select('id, email, user_type')
    .eq('email', email)
    .maybeSingle()

  if (existente) {
    return NextResponse.json(
      {
        error: 'Já existe conta com este email',
        detalhe: 'Usa /api/admin/backoffice/papeis para lhe dar o papel — não se cria uma segunda conta à mesma pessoa.',
        user_id: existente.id,
      },
      { status: 409 },
    )
  }

  if (username) {
    const { data: usernameUsado } = await supabase
      .from('profiles')
      .select('id')
      .eq('username', username)
      .maybeSingle()
    if (usernameUsado) return NextResponse.json({ error: 'Username já está em uso' }, { status: 409 })
  }

  const { data: criado, error: erroAuth } = await supabase.auth.admin.createUser({
    email,
    // Confirmado porque foi o dono a criar: não há inbox a validar quando a criação é manual.
    email_confirm: true,
    user_metadata: { full_name: fullName, username: username || null, backoffice_only: true },
  })

  if (erroAuth || !criado?.user) {
    return NextResponse.json({ error: erroAuth?.message || 'Não foi possível criar o login' }, { status: 500 })
  }

  const userId = criado.user.id

  const { error: erroPerfil } = await supabase.from('profiles').upsert(
    {
      id: userId,
      email,
      full_name: fullName,
      username: username || null,
      // NÃO é cliente. Ver o cabeçalho: é o `isRegisteredMember` que fecha o site a estas contas.
      user_type: 'pending',
      is_active: false,
      is_verified: true,
      // A marca que faz o painel distinguir «afiliado sem produto» de «membro que não pagou». Sem
      // ela, estas contas apareciam nas auditorias de bloqueados e alguém ia tentar «corrigi-las».
      profile_data: { backoffice_only: true, criado_por: auth.userId },
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  )

  if (erroPerfil) {
    // Desfaz-se o login: melhor não existir do que existir sem perfil. É o mesmo cuidado que a rota
    // `/api/admin/create-user` já tem, e pela mesma razão.
    await supabase.auth.admin.deleteUser(userId)
    return NextResponse.json({ error: 'Login criado sem perfil — desfeito. ' + erroPerfil.message }, { status: 500 })
  }

  const { error: erroPapeis } = await supabase.from('backoffice_papeis').insert(
    papeis.map((papel) => ({ user_id: userId, papel, atribuido_por: auth.userId })),
  )

  if (erroPapeis) {
    // A conta FICA (já tem perfil válido) mas avisa-se alto: uma conta sem papéis não entra no
    // backoffice, e devolver sucesso aqui dava um login que não abre nada sem ninguém saber porquê.
    return NextResponse.json(
      { error: 'Conta criada mas SEM papéis: ' + erroPapeis.message, user_id: userId },
      { status: 500 },
    )
  }

  if (areas.length > 0) {
    await supabase.from('backoffice_acessos_site').upsert(
      { user_id: userId, areas, definido_por: auth.userId, atualizado_at: new Date().toISOString() },
      { onConflict: 'user_id' },
    )
  }

  /**
   * O link para a pessoa definir a password. Gerado, não enviado: enviar emails é outra decisão, com
   * outro texto e outro remetente, e não se toma dentro de uma rota que cria contas.
   *
   * Se falhar, a conta continua boa — a pessoa usa o «esqueci-me da password» normal. Por isso a
   * falha é reportada e não deitada fora, mas também não desfaz nada.
   */
  let linkPassword: string | null = null
  let avisoLink: string | null = null
  try {
    const { data: link, error } = await supabase.auth.admin.generateLink({ type: 'recovery', email })
    if (error) avisoLink = error.message
    else linkPassword = link?.properties?.action_link ?? null
  } catch (e) {
    avisoLink = e instanceof Error ? e.message : 'falha ao gerar link'
  }

  return NextResponse.json({
    success: true,
    user_id: userId,
    email,
    papeis,
    areas,
    link_password: linkPassword,
    aviso_link: avisoLink
      ? `Conta criada. O link de password falhou (${avisoLink}) — a pessoa pode usar «esqueci-me da password».`
      : null,
  })
}
