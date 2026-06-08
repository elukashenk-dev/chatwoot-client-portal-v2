type EmptyTranscriptStateProps = {
  body?: string
  title?: string
}

export function EmptyTranscriptState({
  body = 'В этой переписке пока нет сообщений, доступных клиентскому порталу.',
  title,
}: EmptyTranscriptStateProps) {
  return (
    <div className="chat-muted-text rounded-[1rem] border border-dashed border-slate-200 bg-slate-50/80 px-5 py-8 text-center text-[14px] leading-6">
      {title ? (
        <h2 className="chat-text text-[16px] font-semibold">{title}</h2>
      ) : null}
      <p className={title ? 'mt-1' : undefined}>{body}</p>
    </div>
  )
}
