type EmptyTranscriptStateProps = {
  body?: string
  title?: string
}

export function EmptyTranscriptState({
  body = 'В этой переписке пока нет сообщений, доступных клиентскому порталу.',
  title,
}: EmptyTranscriptStateProps) {
  return (
    <div className="chat-muted-text rounded-[1.25rem] border border-white/65 bg-white/70 px-5 py-8 text-center text-[14px] leading-6 shadow-sm shadow-slate-900/[0.04] backdrop-blur-md">
      {title ? (
        <h2 className="chat-text text-[16px] font-semibold">{title}</h2>
      ) : null}
      <p className={title ? 'mt-1' : undefined}>{body}</p>
    </div>
  )
}
