import { createHash } from 'node:crypto'

import type { AppEnv } from '../../config/env.js'

export type VapidConfig = {
  keyId: string
  privateKey: string
  publicKey: string
  publicKeyFingerprint: string
  subject: string
}

export function createVapidConfig(
  env: Pick<
    AppEnv,
    | 'PUSH_VAPID_KEY_ID'
    | 'PUSH_VAPID_PRIVATE_KEY'
    | 'PUSH_VAPID_PUBLIC_KEY'
    | 'PUSH_VAPID_SUBJECT'
  >,
): VapidConfig | null {
  if (
    !env.PUSH_VAPID_PUBLIC_KEY ||
    !env.PUSH_VAPID_PRIVATE_KEY ||
    !env.PUSH_VAPID_SUBJECT
  ) {
    return null
  }

  const fingerprint = createHash('sha256')
    .update(env.PUSH_VAPID_PUBLIC_KEY)
    .digest('hex')

  return {
    keyId: env.PUSH_VAPID_KEY_ID ?? `sha256-${fingerprint.slice(0, 16)}`,
    privateKey: env.PUSH_VAPID_PRIVATE_KEY,
    publicKey: env.PUSH_VAPID_PUBLIC_KEY,
    publicKeyFingerprint: `sha256-${fingerprint}`,
    subject: env.PUSH_VAPID_SUBJECT,
  }
}
