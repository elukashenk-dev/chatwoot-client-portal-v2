import { cn } from '../lib/cn'

export const authFieldClassName =
  'h-[50px] rounded-[10px] bg-transparent text-[15px] placeholder:text-[#B4BAC4]'

export const authFieldIconClassName = 'h-[21px] w-[21px]'

export const authSecondaryLinkClassName =
  'auth-muted-text rounded-auth-link font-normal underline-offset-4 transition hover:text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'

export const authPrimaryLinkClassName =
  'rounded-auth-link font-normal text-brand-700 underline-offset-4 transition hover:text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-100'

export function inputClassName(hasError: boolean, isFilled = false) {
  return cn(
    'auth-input auth-text block h-[50px] w-full appearance-none rounded-[10px] border bg-transparent px-5 text-[15px] placeholder:text-[#B4BAC4] transition focus:outline-none focus-visible:outline-none disabled:cursor-not-allowed disabled:border-[#DDDFE4] disabled:bg-transparent disabled:text-[#B4BAC4]',
    !hasError &&
      !isFilled &&
      'border-[#DDDFE4] focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    !hasError &&
      isFilled &&
      'border-[#DDDFE4] shadow-auth-filled focus:border-brand-700 focus:ring-4 focus:ring-brand-100',
    hasError &&
      'border-rose-200 bg-rose-50/30 focus:border-rose-300 focus:ring-4 focus:ring-rose-50/80',
  )
}
