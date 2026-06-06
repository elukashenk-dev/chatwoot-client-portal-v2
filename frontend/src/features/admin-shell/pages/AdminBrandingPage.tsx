import { useState } from 'react'

import { InlineAlert } from '../../../shared/ui/InlineAlert'
import { LogOutIcon } from '../../../shared/ui/icons'
import { useAdminSession } from '../../admin-auth/lib/adminSessionContext'

const brandingGroups = [
  {
    controls: ['Название портала', 'Загрузить логотип'],
    description: 'Название портала, логотип и PWA identity.',
    id: 'main',
    title: 'Основное',
  },
  {
    controls: ['Основной цвет'],
    description: 'Основной цвет, кнопки, focus states и исходящие сообщения.',
    id: 'colors',
    title: 'Цвета',
  },
  {
    controls: ['Фон auth-экранов', 'Фон чата'],
    description: 'Auth-фоны, фон чата, фон шапки чата и controlled overlays.',
    id: 'backgrounds',
    title: 'Фоны и изображения',
  },
  {
    controls: ['Label поддержки'],
    description: 'Auth заголовки, help/welcome copy и label поддержки.',
    id: 'texts',
    title: 'Тексты',
  },
  {
    controls: ['Пустое состояние чата'],
    description:
      'Шапка, пустое состояние, недоступность и читаемость сообщений.',
    id: 'chat',
    title: 'Чат',
  },
  {
    controls: ['Страница информации о чате'],
    description: 'Информация о чате, профиль, настройки и уведомления.',
    id: 'portal-pages',
    title: 'Страницы портала',
  },
]

export function AdminBrandingPage() {
  const { admin, signOut } = useAdminSession()
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  async function handleLogout() {
    setLogoutError(null)
    setIsSigningOut(true)

    try {
      await signOut()
    } catch (error) {
      setLogoutError(
        error instanceof Error ? error.message : 'Не удалось выйти.',
      )
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <main className="min-h-full bg-slate-100 text-slate-950">
      <section className="lg:hidden flex min-h-full flex-col justify-center px-6 py-16 text-center">
        <div className="mx-auto max-w-sm space-y-4">
          <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
            Админ-консоль
          </p>
          <h1 className="text-2xl font-semibold">
            Админ-консоль доступна с широкого экрана
          </h1>
          <p className="text-sm leading-6 text-slate-600">
            Настройки и предпросмотр требуют desktop ширину.
          </p>
          <button
            className="mx-auto inline-flex items-center gap-2 rounded-[0.6rem] bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm ring-1 ring-slate-200"
            disabled={isSigningOut}
            onClick={() => {
              void handleLogout()
            }}
            type="button"
          >
            <LogOutIcon className="h-4 w-4" />
            Выйти
          </button>
          <InlineAlert message={logoutError} tone="error" />
        </div>
      </section>

      <section className="hidden min-h-full grid-cols-[15rem_minmax(0,1fr)_22rem] lg:grid">
        <aside className="border-r border-slate-200 bg-white px-5 py-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
              Админ-консоль
            </p>
            <h1 className="mt-2 text-2xl font-semibold">Брендинг</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              {admin?.email ?? 'Администратор портала'}
            </p>
          </div>

          <nav aria-label="Разделы админки" className="mt-8 space-y-2">
            {brandingGroups.map((group) => (
              <a
                className="block rounded-[0.6rem] px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
                href={`#${group.id}`}
                key={group.title}
              >
                {group.title}
              </a>
            ))}
          </nav>

          <div className="mt-8 space-y-3">
            <InlineAlert message={logoutError} tone="error" />
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-[0.6rem] border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
              disabled={isSigningOut}
              onClick={() => {
                void handleLogout()
              }}
              type="button"
            >
              <LogOutIcon className="h-4 w-4" />
              Выйти
            </button>
          </div>
        </aside>

        <section className="overflow-y-auto px-6 py-6">
          <div className="mx-auto max-w-4xl">
            <div className="mb-5">
              <p className="text-sm font-medium text-slate-500">
                Будущие настройки
              </p>
              <h2 className="mt-1 text-3xl font-semibold tracking-normal">
                Настройки брендинга
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Первый проход показывает структуру будущих настроек. Сохранение,
                загрузка assets и preview реальных компонентов будут в следующем
                branding slice.
              </p>
            </div>

            <div className="grid gap-3">
              {brandingGroups.map((group) => (
                <section
                  className="rounded-[0.6rem] border border-slate-200 bg-white p-4 shadow-sm"
                  id={group.id}
                  key={group.title}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-semibold">{group.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {group.description}
                      </p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
                      только просмотр
                    </span>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {group.controls.map((controlName) => (
                      <button
                        className="rounded-[0.6rem] border border-slate-200 bg-slate-100 px-3 py-2 text-sm font-medium text-slate-400"
                        disabled
                        key={controlName}
                        type="button"
                      >
                        {controlName}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </section>

        <aside className="border-l border-slate-200 bg-white px-5 py-6">
          <p className="text-xs font-semibold uppercase tracking-normal text-brand-700">
            Предпросмотр
          </p>
          <h2 className="mt-2 text-xl font-semibold">Копия портала</h2>
          <div className="mt-5 rounded-[0.6rem] border border-slate-200 bg-slate-50 p-4">
            <div className="rounded-[0.6rem] bg-white p-4 shadow-sm">
              <p className="text-sm font-semibold text-slate-900">
                Центр поддержки
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Здесь появится предпросмотр реальных экранов портала: auth, чат,
                шапка чата и страницы вроде информации о чате.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </main>
  )
}
