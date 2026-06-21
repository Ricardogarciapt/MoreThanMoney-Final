import { getSiteOrigin } from '@/lib/site-url'
import { getSupabaseAdmin } from '@/lib/supabase-admin-client'

const SOCIAL_URL = '/app-mobile?tab=social'

type PushPayload = {
  userId?: string
  userIds?: string[]
  all?: boolean
  excludeUserId?: string
  skipInApp?: boolean
  title: string
  body: string
  notificationType: string
  data?: Record<string, string>
  tag?: string
}

/** Fire-and-forget push + in-app via API central. */
export function dispatchSocialPush(payload: PushPayload): void {
  const siteUrl = getSiteOrigin()
  const data = {
    ...(payload.data ?? {}),
    type: payload.notificationType,
    url: SOCIAL_URL,
  }

  void fetch(`${siteUrl}/api/notifications/send-push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: payload.userId,
      userIds: payload.userIds,
      all: payload.all,
      excludeUserId: payload.excludeUserId,
      skipInApp: payload.skipInApp,
      title: payload.title,
      body: payload.body,
      url: SOCIAL_URL,
      data,
      tag: payload.tag,
    }),
  }).catch((err) => console.warn('[social-push-notify]', err))
}

export function notifyPostLike(params: {
  postAuthorId: string
  likerId: string
  likerName: string
  postId: string
}): void {
  if (params.postAuthorId === params.likerId) return

  dispatchSocialPush({
    userId: params.postAuthorId,
    title: '❤️ Novo like no teu post',
    body: `${params.likerName} gostou da tua publicação`,
    notificationType: 'social_interaction',
    data: {
      action: 'like',
      post_id: params.postId,
      actor_id: params.likerId,
    },
    tag: `social_like_${params.postId}`,
  })
}

export function notifyPostComment(params: {
  postAuthorId: string
  commenterId: string
  commenterName: string
  postId: string
  preview: string
}): void {
  const body =
    params.preview.length > 100 ? `${params.preview.substring(0, 100)}…` : params.preview

  if (params.postAuthorId !== params.commenterId) {
    dispatchSocialPush({
      userId: params.postAuthorId,
      title: '💬 Novo comentário no teu post',
      body: `${params.commenterName}: ${body}`,
      notificationType: 'social_interaction',
      data: {
        action: 'comment',
        post_id: params.postId,
        actor_id: params.commenterId,
      },
      tag: `social_comment_${params.postId}`,
    })
  }
}

export function notifySocialMentions(params: {
  mentionedUserIds: string[]
  authorId: string
  authorName: string
  preview: string
  postId: string
}): void {
  const body =
    params.preview.length > 100 ? `${params.preview.substring(0, 100)}…` : params.preview

  for (const userId of params.mentionedUserIds) {
    if (!userId || userId === params.authorId) continue
    dispatchSocialPush({
      userId,
      title: `💬 ${params.authorName} mencionou-te`,
      body,
      notificationType: 'social_mention',
      data: {
        post_id: params.postId,
        author_id: params.authorId,
      },
      tag: `social_mention_${params.postId}_${userId}`,
    })
  }
}

/** Novo post VIP/Admin — broadcast a membros activos (in-app + push). */
export async function notifyNewSocialPost(params: {
  authorId: string
  authorName: string
  postId: string
  content: string
  mentionedUserIds?: string[]
}): Promise<void> {
  const supabase = getSupabaseAdmin()
  const preview =
    params.content.length > 120 ? `${params.content.substring(0, 120)}…` : params.content
  const title = `📢 Novo post de ${params.authorName}`
  const body = preview || 'Publicação nova disponível.'

  const { data: activeUsers } = await supabase
    .from('profiles')
    .select('id')
    .eq('is_active', true)
    .neq('id', params.authorId)

  if (activeUsers?.length) {
    const { error } = await supabase.from('notifications').insert(
      activeUsers.map((u) => ({
        user_id: u.id,
        type: 'social_post',
        title,
        message: body,
        read: false,
        data: {
          post_id: params.postId,
          author_id: params.authorId,
          url: SOCIAL_URL,
        },
      })),
    )
    if (error) {
      console.warn('[social-push-notify] in-app new post:', error.message)
    }
  }

  dispatchSocialPush({
    all: true,
    excludeUserId: params.authorId,
    skipInApp: true,
    title,
    body,
    notificationType: 'social_post',
    data: {
      post_id: params.postId,
      author_id: params.authorId,
    },
    tag: `social_post_${params.postId}`,
  })

  if (params.mentionedUserIds?.length) {
    notifySocialMentions({
      mentionedUserIds: params.mentionedUserIds,
      authorId: params.authorId,
      authorName: params.authorName,
      preview: params.content,
      postId: params.postId,
    })
  }
}
