import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'

import { routePaths } from '../../../app/routePaths'
import { ChatAvatar } from '../../chat/components/ChatAvatar'
import { ChatFullScreenPanel } from '../../chat/components/ChatFullScreenPanel'
import { createTenantMonogram } from '../../tenant/lib/tenantIdentityMetadata'
import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { ImageIcon } from '../../../shared/ui/icons'
import {
  getCurrentUserProfile,
  ProfileApiClientError,
  updateProfileAvatar,
  type UserProfile,
} from '../api/profileClient'

const PROFILE_AVATAR_MAX_BYTES = 15 * 1024 * 1024
const allowedAvatarTypes = new Set(['image/gif', 'image/jpeg', 'image/png'])

function getProfileErrorMessage(error: unknown) {
  if (error instanceof ProfileApiClientError) {
    return error.message
  }

  return 'Не удалось загрузить профиль. Попробуйте еще раз.'
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b border-slate-200/80 px-4 py-3 last:border-b-0">
      <dt className="shrink-0 text-[13px] leading-5 text-slate-500">{label}</dt>
      <dd className="min-w-0 max-w-[65%] break-words text-right text-[13px] font-medium leading-5 text-slate-900">
        {value}
      </dd>
    </div>
  )
}

export function UserProfilePage() {
  const navigate = useNavigate()
  const isMountedRef = useRef(false)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploadMessage, setUploadMessage] = useState<string | null>(null)

  async function loadProfile() {
    setIsLoading(true)
    setLoadError(null)

    try {
      const nextProfile = await getCurrentUserProfile()

      if (!isMountedRef.current) {
        return
      }

      setProfile(nextProfile)
      setLoadError(null)
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setLoadError(getProfileErrorMessage(error))
      setProfile(null)
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false)
      }
    }
  }

  useEffect(() => {
    isMountedRef.current = true

    async function loadInitialProfile() {
      try {
        const nextProfile = await getCurrentUserProfile()

        if (!isMountedRef.current) {
          return
        }

        setProfile(nextProfile)
        setLoadError(null)
      } catch (error) {
        if (!isMountedRef.current) {
          return
        }

        setLoadError(getProfileErrorMessage(error))
        setProfile(null)
      } finally {
        if (isMountedRef.current) {
          setIsLoading(false)
        }
      }
    }

    void loadInitialProfile()

    return () => {
      isMountedRef.current = false
    }
  }, [])

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]

    event.currentTarget.value = ''

    if (!file) {
      return
    }

    setUploadError(null)
    setUploadMessage(null)

    if (!allowedAvatarTypes.has(file.type)) {
      setUploadError('Можно загрузить JPEG, PNG или GIF.')
      return
    }

    if (file.size > PROFILE_AVATAR_MAX_BYTES) {
      setUploadError('Файл должен быть не больше 15 МБ.')
      return
    }

    setIsUploading(true)

    try {
      const response = await updateProfileAvatar(file)

      if (!isMountedRef.current) {
        return
      }

      setProfile((currentProfile) =>
        currentProfile
          ? {
              ...currentProfile,
              avatarUrl: response.avatarUrl,
              result: 'ready',
            }
          : currentProfile,
      )
      setUploadMessage('Аватар обновлен.')
    } catch (error) {
      if (!isMountedRef.current) {
        return
      }

      setUploadError(getProfileErrorMessage(error))
    } finally {
      if (isMountedRef.current) {
        setIsUploading(false)
      }
    }
  }

  const avatarActionLabel = profile?.avatarUrl
    ? 'Заменить аватар'
    : 'Загрузить аватар'
  const monogram = profile ? createTenantMonogram(profile.fullName) : 'ЛК'
  const isUnavailable = !isLoading && profile === null

  return (
    <ChatFullScreenPanel
      isLoading={isLoading}
      isUnavailable={isUnavailable}
      loadingMessage="Загружаем профиль."
      onBack={() => {
        navigate(routePaths.app.chat)
      }}
      onRetry={() => {
        void loadProfile()
      }}
      title="Профиль"
      unavailableMessage={loadError ?? 'Не удалось загрузить профиль.'}
    >
      {profile ? (
        <div className="mx-auto max-w-md">
          <section className="overflow-hidden rounded-lg border border-slate-200/90 bg-white">
            <div className="flex items-center gap-4 border-b border-slate-200/80 px-4 py-4">
              <ChatAvatar
                alt={profile.fullName}
                avatarUrl={profile.avatarUrl}
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-900 text-base font-semibold text-white"
                title={profile.fullName}
              >
                {monogram}
              </ChatAvatar>
              <div className="min-w-0 flex-1">
                <h2 className="text-[14px] font-semibold leading-5 text-slate-900">
                  Аватар
                </h2>
                <label
                  className={[
                    'mt-2 inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-700 transition hover:border-brand-200 hover:text-brand-900 focus-within:outline-none focus-within:ring-4 focus-within:ring-brand-100',
                    isUploading ? 'pointer-events-none opacity-70' : '',
                  ].join(' ')}
                >
                  <ImageIcon className="h-4 w-4" />
                  {isUploading ? 'Загружаем...' : avatarActionLabel}
                  <input
                    accept="image/gif,image/jpeg,image/png"
                    aria-label={avatarActionLabel}
                    className="sr-only"
                    disabled={isUploading}
                    onChange={(event) => {
                      void handleAvatarChange(event)
                    }}
                    type="file"
                  />
                </label>
              </div>
            </div>

            <dl>
              <DetailRow label="Имя" value={profile.fullName} />
              <DetailRow label="Email" value={profile.email} />
              <DetailRow
                label="Телефон"
                value={profile.phoneNumber ?? 'Не указан'}
              />
            </dl>
          </section>

          {profile.result === 'unavailable' ? (
            <div className="mt-4">
              <InlineAlert
                message="Данные контакта пока недоступны."
                tone="warning"
              />
            </div>
          ) : null}

          {uploadError ? (
            <div className="mt-4">
              <InlineAlert message={uploadError} tone="error" />
            </div>
          ) : null}

          {uploadMessage ? (
            <div className="mt-4">
              <InlineAlert message={uploadMessage} tone="success" />
            </div>
          ) : null}
        </div>
      ) : null}
    </ChatFullScreenPanel>
  )
}
