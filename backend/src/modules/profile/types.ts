export type PublicUserProfile = {
  avatarUrl: string | null
  email: string
  fullName: string | null
  phoneNumber: string | null
  reason?: 'contact_unavailable'
  result: 'ready' | 'unavailable'
}

export type ProfileAvatarUpload = {
  data: Buffer
  fileName: string
  mimeType: string
  size: number
}
