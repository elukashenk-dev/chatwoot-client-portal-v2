import { CHAT_TEXT_MESSAGE_MAX_LENGTH } from '../../lib/messageContentLimits'

export const TEXT_LENGTH_FEEDBACK_ID = 'chat-message-composer-length-feedback'

type ComposerFeedbackProps = {
  errorMessage: string | null
  normalizedDraftLength: number
  shouldShowTextLengthCounter: boolean
  textLengthErrorMessage: string | null
}

export function ComposerFeedback({
  errorMessage,
  normalizedDraftLength,
  shouldShowTextLengthCounter,
  textLengthErrorMessage,
}: ComposerFeedbackProps) {
  return (
    <>
      {errorMessage ? (
        <div
          className="mt-2 rounded-[0.8rem] border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] leading-5 text-rose-700"
          id={textLengthErrorMessage ? TEXT_LENGTH_FEEDBACK_ID : undefined}
        >
          {errorMessage}
        </div>
      ) : null}
      {shouldShowTextLengthCounter ? (
        <div
          className="mt-1 text-right text-[11px] leading-4 text-slate-500 tabular-nums"
          id={TEXT_LENGTH_FEEDBACK_ID}
        >
          {normalizedDraftLength}/{CHAT_TEXT_MESSAGE_MAX_LENGTH}
        </div>
      ) : null}
    </>
  )
}
