import { cn } from '../lib/cn'

export const authFieldClassName =
  'h-[52px] rounded-auth-control bg-slate-50/80 text-[17px] placeholder:text-slate-400'

export const authFieldIconClassName = 'h-6 w-6'

export const authSecondaryLinkClassName =
  'rounded-auth-link font-normal text-slate-500 underline-offset-4 transition hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'

export const authPrimaryLinkClassName =
  'rounded-auth-link font-normal text-brand-700 underline-offset-4 transition hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'

export function inputClassName(hasError: boolean, isFilled = false) {
  return cn(
    'auth-input block h-16 w-full rounded-auth-control border bg-white px-5 text-[17px] text-slate-900 placeholder:text-slate-400 transition focus:outline-none disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500',
    !hasError &&
      !isFilled &&
      'border-slate-300 focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    !hasError &&
      isFilled &&
      'border-brand-300 shadow-auth-filled focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    hasError &&
      'border-rose-200 bg-rose-50/30 focus:border-rose-300 focus:ring-4 focus:ring-rose-50/80',
  )
}
