import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { LocalDeviceDataRemoval } from './LocalDeviceDataRemoval'

describe('LocalDeviceDataRemoval', () => {
  it('requires confirmation before removing local device data', () => {
    const onConfirm = vi.fn(async () => undefined)

    render(<LocalDeviceDataRemoval onConfirm={onConfirm} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Удалить сохраненные данные с этого устройства',
      }),
    )

    expect(screen.getByText(/Это удалит сохраненные чаты/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
  })

  it('can cancel confirmation', () => {
    const onConfirm = vi.fn(async () => undefined)

    render(<LocalDeviceDataRemoval onConfirm={onConfirm} />)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Удалить сохраненные данные с этого устройства',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(onConfirm).not.toHaveBeenCalled()
    expect(
      screen.getByRole('button', {
        name: 'Удалить сохраненные данные с этого устройства',
      }),
    ).toBeInTheDocument()
  })
})
