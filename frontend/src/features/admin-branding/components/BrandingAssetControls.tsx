import type {
  BrandingAsset,
  BrandingAssetKind,
  BrandingAssets,
} from '../api/adminBrandingClient'
import { ImageIcon, TrashIcon, UploadIcon } from '../../../shared/ui/icons'

const BRANDING_ASSET_MAX_BYTES = 5 * 1024 * 1024
const brandingAssetAccept = 'image/gif,image/jpeg,image/png,image/webp'
const allowedBrandingAssetTypes = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
])

const brandingAssetSlots = [
  { actionName: 'логотип', kind: 'logo', title: 'Логотип' },
  {
    actionName: 'иконку приложения',
    kind: 'pwa_icon',
    title: 'Иконка приложения',
  },
  {
    actionName: 'верхнее изображение экрана входа',
    kind: 'auth_header_image',
    title: 'Вход: верхнее изображение',
  },
  {
    actionName: 'нижнее изображение экрана входа',
    kind: 'auth_footer_image',
    title: 'Вход: нижнее изображение',
  },
  {
    actionName: 'общий фон экрана входа',
    kind: 'auth_background_image',
    title: 'Вход: общий фон',
  },
  {
    actionName: 'фон чата',
    kind: 'chat_background_image',
    title: 'Чат: общий фон',
  },
  {
    actionName: 'фон шапки чата',
    kind: 'chat_header_background_image',
    title: 'Чат: фон шапки',
  },
] satisfies Array<{
  actionName: string
  kind: BrandingAssetKind
  title: string
}>

export type BrandingAssetControlsProps = {
  assets: BrandingAssets
  busyKind: BrandingAssetKind | null
  disabled: boolean
  onDelete: (kind: BrandingAssetKind) => void
  onUpload: (kind: BrandingAssetKind, file: File) => void
  onValidationError: (message: string) => void
}

function formatAssetDetails(asset: BrandingAsset) {
  const typeLabel = asset.contentType.replace(/^image\//u, '').toUpperCase()

  if (asset.width && asset.height) {
    return `${typeLabel}, ${asset.width} x ${asset.height}`
  }

  return typeLabel
}

function getUploadLabel({
  actionName,
  asset,
  isBusy,
}: {
  actionName: string
  asset?: BrandingAsset
  isBusy: boolean
}) {
  if (isBusy) {
    return `Загружаем ${actionName}`
  }

  return asset ? `Заменить ${actionName}` : `Загрузить ${actionName}`
}

function getUploadButtonText({
  asset,
  isBusy,
}: {
  asset?: BrandingAsset
  isBusy: boolean
}) {
  if (isBusy) {
    return 'Загружаем'
  }

  return asset ? 'Заменить' : 'Загрузить'
}

export function BrandingAssetControls({
  assets,
  busyKind,
  disabled,
  onDelete,
  onUpload,
  onValidationError,
}: BrandingAssetControlsProps) {
  function handleFileChange(
    kind: BrandingAssetKind,
    event: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0]

    event.currentTarget.value = ''

    if (!file) {
      return
    }

    if (!allowedBrandingAssetTypes.has(file.type)) {
      onValidationError('Можно загрузить PNG, JPG, GIF или WebP.')
      return
    }

    if (file.size > BRANDING_ASSET_MAX_BYTES) {
      onValidationError('Файл брендинга должен быть не больше 5 МБ.')
      return
    }

    onUpload(kind, file)
  }

  return (
    <div className="grid gap-3">
      {brandingAssetSlots.map((slot) => {
        const asset = assets[slot.kind]
        const isBusy = busyKind === slot.kind
        const uploadLabel = getUploadLabel({
          actionName: slot.actionName,
          asset,
          isBusy,
        })
        const uploadButtonText = getUploadButtonText({ asset, isBusy })

        return (
          <div
            className="grid gap-3 rounded-[0.6rem] border border-slate-200 bg-slate-50/70 p-3 md:grid-cols-[7rem_minmax(0,1fr)]"
            key={slot.kind}
          >
            <div className="flex h-24 items-center justify-center overflow-hidden rounded-[0.55rem] border border-slate-200 bg-white text-slate-400">
              {asset ? (
                <img
                  alt={slot.title}
                  className="h-full w-full object-cover"
                  src={asset.publicUrl}
                />
              ) : (
                <ImageIcon className="h-6 w-6" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-slate-900">
                    {slot.title}
                  </h4>
                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    {asset
                      ? `Загружен ${formatAssetDetails(asset)}`
                      : 'Файл еще не загружен.'}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <label
                  className={[
                    'inline-flex min-h-9 items-center gap-2 rounded-[0.55rem] border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-brand-200 hover:text-brand-900 focus-within:outline-none focus-within:ring-4 focus-within:ring-brand-100',
                    disabled
                      ? 'pointer-events-none opacity-60'
                      : 'cursor-pointer',
                  ].join(' ')}
                >
                  <UploadIcon className="h-4 w-4" />
                  {uploadButtonText}
                  <input
                    accept={brandingAssetAccept}
                    aria-label={uploadLabel}
                    className="sr-only"
                    disabled={disabled}
                    onChange={(event) => {
                      handleFileChange(slot.kind, event)
                    }}
                    type="file"
                  />
                </label>

                {asset ? (
                  <button
                    aria-label={`Удалить ${slot.actionName}`}
                    className="inline-flex min-h-9 items-center gap-2 rounded-[0.55rem] border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-rose-200 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={disabled}
                    onClick={() => {
                      onDelete(slot.kind)
                    }}
                    type="button"
                  >
                    <TrashIcon className="h-4 w-4" />
                    Удалить
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
