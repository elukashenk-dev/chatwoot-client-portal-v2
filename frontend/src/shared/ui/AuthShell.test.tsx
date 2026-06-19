import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AuthShell } from './AuthShell'

describe('AuthShell', () => {
  it('keeps long auth pages scrollable in the auth viewport', () => {
    render(
      <AuthShell description="Описание страницы" title="Вход">
        <div>Форма входа</div>
      </AuthShell>,
    )

    const canvas = document.querySelector('.auth-canvas-background')

    expect(canvas).toHaveClass('shrink-0')
    expect(canvas).not.toHaveClass('overflow-hidden')
  })
})
