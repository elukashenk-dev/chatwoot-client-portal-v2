import type { ReactNode } from 'react'

import { cn } from '../../../../shared/lib/cn'

type ComposerSideControlProps = {
  children: ReactNode
  control: 'attachment' | 'emoji' | 'send' | 'voice'
  isCollapsed: boolean
}

export function ComposerSideControl({
  children,
  control,
  isCollapsed,
}: ComposerSideControlProps) {
  return (
    <div
      aria-hidden={isCollapsed || undefined}
      className={cn(
        'shrink-0 overflow-hidden transition-[width,opacity,transform,margin] duration-200 ease-out motion-reduce:transition-none',
        isCollapsed ? 'pointer-events-none w-0 opacity-0' : 'w-11 opacity-100',
        isCollapsed && control === 'attachment' ? '-mr-2 -translate-x-1' : null,
        isCollapsed && control !== 'attachment' ? '-mx-1 translate-x-1' : null,
      )}
      data-composer-side-control={control}
    >
      {children}
    </div>
  )
}
