export function ChatLoadingState() {
  return (
    <section
      aria-label="Загрузка чата"
      className="flex-1 overflow-hidden px-4 py-5 sm:px-6 sm:py-6"
    >
      <div className="mx-auto flex h-full w-full max-w-[620px] flex-col justify-end gap-3">
        <p className="sr-only">Загружаем чат.</p>
        <div className="h-16 w-[72%] animate-pulse rounded-[1rem] border border-white/55 bg-white/45 shadow-sm" />
        <div className="h-12 w-[54%] animate-pulse rounded-[1rem] border border-white/55 bg-white/35 shadow-sm" />
        <div className="ml-auto h-14 w-[64%] animate-pulse rounded-[1rem] border border-brand-200/50 bg-brand-100/45 shadow-sm" />
      </div>
    </section>
  )
}
