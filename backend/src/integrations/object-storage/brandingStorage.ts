import { Readable } from 'node:stream'
import type { ReadableStream as NodeReadableStream } from 'node:stream/web'

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3'

import type { AppEnv } from '../../config/env.js'
import { ApiError } from '../../lib/errors.js'

type StorageSender = {
  send: S3Client['send']
}

export type BrandingStoredObject = {
  body: Readable | null
  contentLength: number | null
  contentType: string | null
}

export type BrandingObjectStorage = {
  deleteObject(input: { key: string }): Promise<void>
  getObject(input: { key: string }): Promise<BrandingStoredObject>
  putObject(input: {
    body: Buffer
    contentLength: number
    contentType: string
    key: string
  }): Promise<void>
}

export function createDisabledBrandingObjectStorage(): BrandingObjectStorage {
  const fail = (): never => {
    throw new ApiError(
      503,
      'BRANDING_ASSET_STORAGE_UNAVAILABLE',
      'Хранилище файлов брендинга сейчас недоступно.',
    )
  }

  return {
    async deleteObject() {
      return fail()
    },
    async getObject() {
      return fail()
    },
    async putObject() {
      return fail()
    },
  }
}

export function createBrandingObjectStorage({
  bucket,
  send,
}: {
  bucket: string
  send: StorageSender['send']
}): BrandingObjectStorage {
  return {
    async deleteObject({ key }) {
      await send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
    },
    async getObject({ key }) {
      const response = await send(
        new GetObjectCommand({ Bucket: bucket, Key: key }),
      )
      const responseBody = response.Body as
        | { transformToWebStream?: () => NodeReadableStream<Uint8Array> }
        | undefined
      const body = responseBody?.transformToWebStream
        ? Readable.fromWeb(responseBody.transformToWebStream())
        : null

      return {
        body,
        contentLength: response.ContentLength ?? null,
        contentType: response.ContentType ?? null,
      }
    },
    async putObject({ body, contentLength, contentType, key }) {
      await send(
        new PutObjectCommand({
          Body: body,
          Bucket: bucket,
          ContentLength: contentLength,
          ContentType: contentType,
          Key: key,
        }),
      )
    },
  }
}

export function createBrandingObjectStorageFromEnv(
  env: Pick<
    AppEnv,
    | 'BRANDING_ASSET_STORAGE_ACCESS_KEY_ID'
    | 'BRANDING_ASSET_STORAGE_BUCKET'
    | 'BRANDING_ASSET_STORAGE_ENDPOINT'
    | 'BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE'
    | 'BRANDING_ASSET_STORAGE_REGION'
    | 'BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY'
  >,
) {
  if (
    !env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID ||
    !env.BRANDING_ASSET_STORAGE_BUCKET ||
    !env.BRANDING_ASSET_STORAGE_ENDPOINT ||
    !env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY
  ) {
    return createDisabledBrandingObjectStorage()
  }

  const config: S3ClientConfig = {
    credentials: {
      accessKeyId: env.BRANDING_ASSET_STORAGE_ACCESS_KEY_ID,
      secretAccessKey: env.BRANDING_ASSET_STORAGE_SECRET_ACCESS_KEY,
    },
    endpoint: env.BRANDING_ASSET_STORAGE_ENDPOINT,
    forcePathStyle: env.BRANDING_ASSET_STORAGE_FORCE_PATH_STYLE,
    region: env.BRANDING_ASSET_STORAGE_REGION,
  }
  const client = new S3Client(config)

  return createBrandingObjectStorage({
    bucket: env.BRANDING_ASSET_STORAGE_BUCKET,
    send: client.send.bind(client),
  })
}
