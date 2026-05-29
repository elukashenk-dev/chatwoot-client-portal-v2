import { expect, type Page } from '@playwright/test'

const CONTROLLED_STORAGE_LOSS_TIMEOUT = { timeout: 12_000 } as const

export async function expectControlledStorageLossState(page: Page) {
  await expect(
    page.getByRole('heading', {
      name: /Нужно подключение к интернету\.|Нужно проверить сессию\./,
    }),
  ).toBeVisible(CONTROLLED_STORAGE_LOSS_TIMEOUT)
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeVisible()
  await expect(page.getByText('Личный чат')).toHaveCount(0)
}
