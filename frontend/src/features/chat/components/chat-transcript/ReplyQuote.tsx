import type { ChatMessage } from '../../types'

import { getReplyPreviewText } from './utils'

type ReplyQuoteProps = {
  isOutgoing: boolean
  replyTo: NonNullable<ChatMessage['replyTo']>
}

export function ReplyQuote({ isOutgoing, replyTo }: ReplyQuoteProps) {
  return (
    <div
      className={
        isOutgoing
          ? 'mb-3 rounded-[0.8rem] border border-white/10 bg-white/10 px-3 py-2 text-[13px] leading-5 text-white/85'
          : 'mb-3 rounded-[0.8rem] border border-slate-200 bg-slate-50/90 px-3 py-2 text-[13px] leading-5 text-slate-500'
      }
    >
      <div
        className={
          isOutgoing
            ? 'mb-1 font-medium text-white'
            : 'mb-1 font-medium text-brand-800'
        }
      >
        Ответ на сообщение {replyTo.authorName}
      </div>
      <div className="line-clamp-2">{getReplyPreviewText(replyTo)}</div>
    </div>
  )
}
