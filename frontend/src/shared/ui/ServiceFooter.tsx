import { GlobeIcon, MessageCircleIcon, PhoneIcon } from './icons'

export function ServiceFooter() {
  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-[1rem] border border-slate-200/90 bg-slate-50/88 px-4 py-3 shadow-footer backdrop-blur-sm">
        <div className="flex items-center justify-between gap-3">
          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-[0.7rem] px-2.5 text-[13px] font-medium text-slate-500 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
            href="https://provgroup.ru"
            rel="noreferrer"
            target="_blank"
          >
            <GlobeIcon />
            <span>Сайт</span>
          </a>

          <div className="h-5 w-px bg-slate-200" />

          <span
            aria-label="Контакты поддержки будут подключены позже"
            className="inline-flex min-h-10 items-center gap-2 rounded-[0.7rem] px-2.5 text-[13px] font-medium text-slate-400"
            role="status"
          >
            <MessageCircleIcon />
            <span>Поддержка</span>
          </span>

          <div className="h-5 w-px bg-slate-200" />

          <a
            className="inline-flex min-h-10 items-center gap-2 rounded-[0.7rem] px-2.5 text-[13px] font-medium text-slate-600 transition hover:text-brand-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100"
            href="tel:+78000000000"
          >
            <PhoneIcon />
            <span>Позвонить</span>
          </a>
        </div>
      </div>
    </div>
  )
}
