import { describe, expect, it } from 'vitest'

import {
  COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
  COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
  resizeComposerTextarea,
} from './utils'

function createTextarea({
  scrollHeight,
  value,
}: {
  scrollHeight: number
  value: string
}) {
  const textarea = document.createElement('textarea')

  textarea.value = value

  Object.defineProperty(textarea, 'scrollHeight', {
    configurable: true,
    value: scrollHeight,
  })

  return textarea
}

describe('resizeComposerTextarea', () => {
  it('keeps an empty composer at the single-line minimum height', () => {
    const textarea = createTextarea({
      scrollHeight: 72,
      value: '',
    })

    resizeComposerTextarea(textarea)

    expect(textarea.style.height).toBe(`${COMPOSER_TEXTAREA_MIN_HEIGHT_PX}px`)
    expect(textarea.style.overflowY).toBe('hidden')
  })

  it('grows non-empty composer content up to the max height', () => {
    const textarea = createTextarea({
      scrollHeight: 180,
      value: 'Очень длинное сообщение',
    })

    resizeComposerTextarea(textarea)

    expect(textarea.style.height).toBe(`${COMPOSER_TEXTAREA_MAX_HEIGHT_PX}px`)
    expect(textarea.style.overflowY).toBe('auto')
  })
})
