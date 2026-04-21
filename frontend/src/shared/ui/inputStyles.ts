import { cn } from '../lib/cn'

export function inputClassName(hasError: boolean) {
  return cn(
    'block h-16 w-full rounded-[1rem] border bg-white px-5 text-[17px] text-slate-900 placeholder:text-slate-400 transition focus:outline-none disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500',
    hasError
      ? 'border-rose-400 focus:border-rose-500 focus:ring-4 focus:ring-rose-100'
      : 'border-slate-300 focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
  )
}
