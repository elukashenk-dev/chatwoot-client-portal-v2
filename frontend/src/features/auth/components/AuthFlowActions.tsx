import type { ReactNode } from 'react'

import { cn } from '../../../shared/lib/cn'

type AuthFlowActionsProps = {
  children: ReactNode
  variant?: 'center' | 'split'
}

export const authFlowActionLinkClassName = 'auth-flow-action-link'
export const authFlowActionSecondaryLinkClassName =
  'auth-flow-action-link auth-flow-action-link--secondary'

export function AuthFlowActions({
  children,
  variant = 'center',
}: AuthFlowActionsProps) {
  return (
    <div
      className={cn(
        'auth-flow-actions',
        variant === 'split' && 'auth-flow-actions--split',
      )}
    >
      {children}
    </div>
  )
}
