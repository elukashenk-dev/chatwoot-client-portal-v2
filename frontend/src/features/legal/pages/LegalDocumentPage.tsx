import { Link } from 'react-router-dom'

import { AuthFrame } from '../../../app/layouts/AuthFrame'
import { routePaths } from '../../../app/routePaths'
import { legalDocuments, type LegalDocumentId } from '../legalDocuments'

export function LegalDocumentPage({
  document,
}: {
  document: LegalDocumentId
}) {
  const content = legalDocuments[document]

  return (
    <AuthFrame>
      <article className="mx-auto flex min-h-full w-full max-w-[390px] flex-col px-7 py-10 text-slate-900">
        <Link
          className="mb-8 text-sm font-medium text-[#00438d]"
          to={routePaths.auth.login}
        >
          Вернуться ко входу
        </Link>

        <h1 className="text-2xl font-semibold leading-tight text-[#15486b]">
          {content.title}
        </h1>

        <p className="mt-2 text-sm text-slate-500">
          Версия документа: {content.version}
        </p>

        <div className="mt-8 space-y-4 text-base leading-7 text-slate-700">
          {content.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </article>
    </AuthFrame>
  )
}
