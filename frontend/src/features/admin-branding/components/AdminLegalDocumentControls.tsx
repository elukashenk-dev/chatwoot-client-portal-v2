import type { ChangeEvent } from 'react'

import type {
  AdminLegalDocumentSummary,
  AdminLegalDocumentType,
} from '../api/adminBrandingClient'
import { UploadIcon } from '../../../shared/ui/icons'

const LEGAL_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
const legalDocumentAccept =
  '.pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain'
const allowedLegalDocumentExtensions = new Set(['docx', 'pdf', 'txt'])

const legalDocumentSlots = [
  {
    actionName: 'пользовательское соглашение',
    documentType: 'terms',
    title: 'Пользовательское соглашение',
  },
  {
    actionName: 'политику обработки персональных данных',
    documentType: 'privacy',
    title: 'Политика обработки персональных данных',
  },
] satisfies Array<{
  actionName: string
  documentType: AdminLegalDocumentType
  title: string
}>

export type AdminLegalDocumentControlsProps = {
  busyDocumentType: AdminLegalDocumentType | null
  disabled: boolean
  documents: Record<AdminLegalDocumentType, AdminLegalDocumentSummary | null>
  onUpload: (documentType: AdminLegalDocumentType, file: File) => void
  onValidationError: (message: string) => void
}

function formatUploadedAt(value: string) {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(value))
}

function formatDocumentDetails(document: AdminLegalDocumentSummary) {
  return [
    `Файл: ${document.sourceFileName}`,
    `Версия: ${document.version}`,
    `Загружен: ${formatUploadedAt(document.activatedAt)}`,
    `Текст: ${document.bodyCharacterCount.toLocaleString('ru-RU')} знаков`,
  ].join(' · ')
}

function getFileExtension(fileName: string) {
  return fileName.split('.').pop()?.toLowerCase() ?? ''
}

function getUploadLabel({
  actionName,
  document,
  isBusy,
}: {
  actionName: string
  document: AdminLegalDocumentSummary | null
  isBusy: boolean
}) {
  if (isBusy) {
    return `Загружаем ${actionName}`
  }

  return document ? `Заменить ${actionName}` : `Загрузить ${actionName}`
}

function getUploadButtonText({
  document,
  isBusy,
}: {
  document: AdminLegalDocumentSummary | null
  isBusy: boolean
}) {
  if (isBusy) {
    return 'Загружаем'
  }

  return document ? 'Заменить' : 'Загрузить'
}

export function AdminLegalDocumentControls({
  busyDocumentType,
  disabled,
  documents,
  onUpload,
  onValidationError,
}: AdminLegalDocumentControlsProps) {
  function handleFileChange(
    documentType: AdminLegalDocumentType,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.currentTarget.files?.[0]

    event.currentTarget.value = ''

    if (!file) {
      return
    }

    if (!allowedLegalDocumentExtensions.has(getFileExtension(file.name))) {
      onValidationError('Можно загрузить PDF, DOCX или TXT.')
      return
    }

    if (file.size > LEGAL_DOCUMENT_MAX_BYTES) {
      onValidationError('Юридический документ должен быть не больше 10 МБ.')
      return
    }

    onUpload(documentType, file)
  }

  return (
    <div className="grid gap-3">
      {legalDocumentSlots.map((slot) => {
        const document = documents[slot.documentType]
        const isBusy = busyDocumentType === slot.documentType
        const uploadLabel = getUploadLabel({
          actionName: slot.actionName,
          document,
          isBusy,
        })
        const uploadButtonText = getUploadButtonText({ document, isBusy })

        return (
          <div
            className="rounded-[0.6rem] border border-slate-200 bg-slate-50/70 p-3"
            key={slot.documentType}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-900">
                  {slot.title}
                </h4>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  {document
                    ? formatDocumentDetails(document)
                    : 'Документ еще не загружен.'}
                </p>
              </div>

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
                  accept={legalDocumentAccept}
                  aria-label={uploadLabel}
                  className="sr-only"
                  disabled={disabled}
                  onChange={(event) => {
                    handleFileChange(slot.documentType, event)
                  }}
                  type="file"
                />
              </label>
            </div>
          </div>
        )
      })}
    </div>
  )
}
