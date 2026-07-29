import { describe, expect, it } from 'vitest'

import { createChatAttachmentUploadAdmission } from './attachmentUploadAdmission.js'

describe('chat attachment upload admission', () => {
  it('rejects excess active uploads and admits another after release', () => {
    const admission = createChatAttachmentUploadAdmission({
      maxActiveUploads: 2,
    })

    const releaseFirst = admission.tryAcquire()
    const releaseSecond = admission.tryAcquire()

    expect(releaseFirst).toBeTypeOf('function')
    expect(releaseSecond).toBeTypeOf('function')
    expect(admission.tryAcquire()).toBeNull()

    releaseFirst?.()
    const releaseNext = admission.tryAcquire()

    expect(releaseNext).toBeTypeOf('function')

    releaseFirst?.()
    expect(admission.tryAcquire()).toBeNull()

    releaseSecond?.()
    releaseNext?.()
  })
})
