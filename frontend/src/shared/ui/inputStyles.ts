import { cn } from '../lib/cn'

export function inputClassName(hasError: boolean, isFilled = false) {
  return cn(
    'auth-input block h-16 w-full rounded-[0.6rem] border bg-white px-5 text-[17px] text-slate-900 placeholder:text-slate-400 transition focus:outline-none disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500',
    !hasError &&
      !isFilled &&
      'border-slate-300 focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    !hasError &&
      isFilled &&
      'border-brand-300 shadow-[0_6px_14px_rgba(15,45,87,0.06)] focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    hasError &&
      'border-rose-200 bg-rose-50/30 focus:border-rose-300 focus:ring-4 focus:ring-rose-50/80',
  )
}
