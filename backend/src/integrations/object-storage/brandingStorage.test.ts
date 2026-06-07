import { Readable } from 'node:stream'

import { describe, expect, it, vi } from 'vitest'

import {
  createBrandingObjectStorage,
  createDisabledBrandingObjectStorage,
} from './brandingStorage.js'

describe('branding object storage', () => {
  it('fails closed when storage is disabled', async () => {
    const storage = createDisabledBrandingObjectStorage()

    await expect(
      storage.putObject({
        body: Buffer.from('x'),
        contentLength: 1,
        contentType: 'image/png',
        key: 'tenants/1/branding/logo/hash/logo.png',
      }),
    ).rejects.toMatchObject({ code: 'BRANDING_ASSET_STORAGE_UNAVAILABLE' })
  })

  it('sends bucket-scoped put/get/delete commands through the S3 client', async () => {
    const send = vi.fn().mockResolvedValue({
      Body: {
        transformToWebStream: () =>
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([120]))
              controller.close()
            },
          }),
      },
      ContentLength: 1,
      ContentType: 'image/png',
    })
    const storage = createBrandingObjectStorage({
      bucket: 'portal-branding-assets',
      send,
    })

    await storage.putObject({
      body: Buffer.from('x'),
      contentLength: 1,
      contentType: 'image/png',
      key: 'tenants/1/branding/logo/hash/logo.png',
    })
    const object = await storage.getObject({
      key: 'tenants/1/branding/logo/hash/logo.png',
    })
    await storage.deleteObject({ key: 'tenants/1/branding/logo/hash/logo.png' })

    expect(object).toMatchObject({
      contentLength: 1,
      contentType: 'image/png',
    })
    expect(object.body).toBeInstanceOf(Readable)
    expect(send).toHaveBeenCalledTimes(3)
    expect(send.mock.calls[0]?.[0].input).toMatchObject({
      Bucket: 'portal-branding-assets',
      ContentLength: 1,
      ContentType: 'image/png',
      Key: 'tenants/1/branding/logo/hash/logo.png',
    })
    expect(send.mock.calls[1]?.[0].input).toMatchObject({
      Bucket: 'portal-branding-assets',
      Key: 'tenants/1/branding/logo/hash/logo.png',
    })
    expect(send.mock.calls[2]?.[0].input).toMatchObject({
      Bucket: 'portal-branding-assets',
      Key: 'tenants/1/branding/logo/hash/logo.png',
    })
  })
})
