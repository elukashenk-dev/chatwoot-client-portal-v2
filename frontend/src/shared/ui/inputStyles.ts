import { cn } from '../lib/cn'

export const authFieldClassName =
  'h-[52px] rounded-auth-control bg-[color:var(--portal-auth-control-background,rgb(248_250_252_/_0.86))] text-[17px] placeholder:text-[color:var(--portal-auth-muted-text-color,#64748b)]'

export const authFieldIconClassName = 'h-6 w-6'

export const authSecondaryLinkClassName =
  'auth-muted-text rounded-auth-link font-normal underline-offset-4 transition hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'

export const authPrimaryLinkClassName =
  'rounded-auth-link font-normal text-brand-700 underline-offset-4 transition hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'

export function inputClassName(hasError: boolean, isFilled = false) {
  return cn(
    'auth-input auth-text block h-16 w-full appearance-none rounded-auth-control border bg-[color:var(--portal-auth-control-background,rgb(255_255_255_/_0.92))] px-5 text-[17px] placeholder:text-[color:var(--portal-auth-muted-text-color,#64748b)] transition focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-[color:var(--portal-auth-control-border-color,#cbd5e1)] disabled:bg-[color:var(--portal-auth-control-background,rgb(248_250_252_/_0.86))] disabled:text-[color:var(--portal-auth-muted-text-color,#64748b)]',
    !hasError &&
      !isFilled &&
      'border-[color:var(--portal-auth-control-border-color,#cbd5e1)] focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    !hasError &&
      isFilled &&
      'border-[color:var(--portal-auth-control-border-color,#cbd5e1)] shadow-auth-filled focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    hasError &&
      'border-rose-200 bg-rose-50/30 focus:border-rose-300 focus:ring-4 focus:ring-rose-50/80',
  )
}
