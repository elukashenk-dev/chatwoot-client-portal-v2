import { CalendarIcon, ClockIcon } from '../../../shared/ui/icons'

function SkeletonLine({ className }: { className: string }) {
  return <div className={`app-skeleton ${className}`} />
}

export function ChatPlaceholderPage() {
  return (
    <>
      <div className="border-b border-slate-200/70 px-5 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[0.7rem] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-400"
            disabled
            type="button"
          >
            <CalendarIcon />
            Календарь сообщений
          </button>

          <span className="rounded-full border border-brand-100 bg-brand-50 px-2.5 py-1 text-[12px] font-medium text-brand-700">
            Переписка не подключена
          </span>
        </div>
      </div>

      <section className="flex-1 overflow-hidden px-4 py-5 sm:px-6 sm:py-6">
        <div className="mx-auto flex h-full w-full max-w-[620px] flex-col">
          <div className="mb-6 rounded-[1rem] border border-slate-200 bg-slate-50/90 px-5 py-5">
            <div className="flex items-start gap-4">
              <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[0.8rem] bg-brand-100 text-brand-800">
                <ClockIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <h2 className="text-[16px] font-semibold text-slate-800">
                  Чат пока готовится
                </h2>
                <p className="mt-1 text-[14px] leading-6 text-slate-500">
                  Вход выполнен. Переписка появится здесь, когда обращение будет
                  подключено к клиентскому порталу.
                </p>
              </div>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-hidden">
            <div className="flex justify-start">
              <div className="max-w-[78%] space-y-2">
                <SkeletonLine className="h-3 w-24 rounded-full" />
                <SkeletonLine className="h-[88px] rounded-[1rem] rounded-tl-[0.45rem]" />
                <SkeletonLine className="h-[72px] w-[88%] rounded-[1rem] rounded-tl-[0.7rem]" />
              </div>
            </div>

            <div className="flex justify-end">
              <div className="max-w-[78%] space-y-2">
                <SkeletonLine className="ml-auto h-3 w-20 rounded-full" />
                <SkeletonLine className="h-[108px] rounded-[1rem] rounded-tr-[0.45rem]" />
                <SkeletonLine className="h-[122px] rounded-[1rem] rounded-tr-[0.7rem]" />
              </div>
            </div>

            <div className="flex justify-start">
              <div className="max-w-[72%] space-y-2">
                <SkeletonLine className="h-3 w-28 rounded-full" />
                <SkeletonLine className="h-[76px] rounded-[1rem] rounded-tl-[0.45rem]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200/90 bg-white/95 px-4 py-4 backdrop-blur-sm sm:px-6">
        <div className="mx-auto w-full max-w-[620px]">
          <div className="rounded-[1rem] border border-slate-200 bg-slate-50/90 p-2">
            <div className="flex items-end gap-2">
              <div className="h-11 w-11 shrink-0 rounded-[0.7rem] bg-slate-200/70" />
              <div className="flex h-11 flex-1 items-center rounded-[0.8rem] border border-slate-200 bg-white px-3 text-[13px] text-slate-400">
                Сообщения станут доступны после подключения чата
              </div>
              <div className="h-11 w-11 shrink-0 rounded-[0.7rem] bg-slate-200/70" />
            </div>
          </div>
        </div>
      </footer>
    </>
  )
}
