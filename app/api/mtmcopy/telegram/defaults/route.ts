import { NextResponse } from 'next/server'
import { getDefaultSourceChatIds } from '@/lib/mtmcopy/sources'
import { MTMCOPY_BOT_USERNAME } from '@/lib/mtmcopy/telegram-bot'

export async function GET() {
  const allowlist = [...getDefaultSourceChatIds()]
  return NextResponse.json({
    bot_username: MTMCOPY_BOT_USERNAME(),
    mode: allowlist.length ? 'allowlist' : 'all_groups',
    default_chat_ids: allowlist,
    description:
      allowlist.length > 0
        ? 'Sinais apenas dos grupos/canais MTM configurados no servidor.'
        : 'Sinais de todos os grupos e canais onde @' + MTMCOPY_BOT_USERNAME() + ' está presente.',
  })
}
