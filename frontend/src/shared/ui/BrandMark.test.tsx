import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { BrandMark } from './BrandMark'

describe('BrandMark', () => {
  it('renders an uploaded logo as the mark itself instead of inside the fallback square', () => {
    const { container } = render(
      <BrandMark
        logoHeight={126}
        logoUrl="/logo.png"
        logoWidth={126}
        name="ProvGroup"
      />,
    )

    const mark = container.querySelector('.brand-mark-logo')
    const image = screen.getByRole('img', { name: 'Логотип ProvGroup' })

    expect(mark).toHaveClass('brand-mark-logo--uploaded')
    expect(mark).not.toHaveClass('bg-brand-900')
    expect(mark).not.toHaveClass('shadow-sm')
    expect(image).toHaveClass('brand-mark-image')
    expect(image).not.toHaveClass('h-full')
    expect(image).not.toHaveClass('w-full')
    expect(image).toHaveAttribute('width', '126')
    expect(image).toHaveAttribute('height', '126')
    expect(image).not.toHaveStyle({ width: '126px' })
    expect(image).not.toHaveStyle({ height: '126px' })
  })
})
