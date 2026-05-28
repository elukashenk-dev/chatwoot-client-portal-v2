import { useState } from 'react'

import { PrimaryButton } from '../../shared/ui/PrimaryButton'

export function LocalDeviceDataRemoval({
  disabled,
  onConfirm,
}: {
  disabled?: boolean
  onConfirm: () => Promise<void>
}) {
  const [isConfirming, setIsConfirming] = useState(false)

  if (!isConfirming) {
    return (
      <button
        className="text-sm font-medium text-rose-700 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:no-underline"
        disabled={disabled}
        onClick={() => setIsConfirming(true)}
        type="button"
      >
        Удалить сохраненные данные с этого устройства
      </button>
    )
  }

  return (
    <div className="space-y-3 rounded-[0.8rem] border border-rose-200 bg-rose-50 p-3 text-left">
      <p className="text-sm leading-5 text-rose-800">
        Это удалит сохраненные чаты и неотправленные локальные сообщения для
        текущего пользователя на этом устройстве.
      </p>
      <div className="flex gap-2">
        <PrimaryButton
          onClick={() => {
            void onConfirm()
          }}
          type="button"
        >
          Удалить
        </PrimaryButton>
        <button
          className="text-sm font-medium text-slate-700"
          onClick={() => setIsConfirming(false)}
          type="button"
        >
          Отмена
        </button>
      </div>
    </div>
  )
}
