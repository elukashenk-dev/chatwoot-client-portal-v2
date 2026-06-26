type IconProps = {
  className?: string
}

const iconClassName = 'h-4 w-4 shrink-0'

export function GlobeIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4a12.3 12.3 0 0 1 3 8 12.3 12.3 0 0 1-3 8 12.3 12.3 0 0 1-3-8 12.3 12.3 0 0 1 3-8Z" />
    </svg>
  )
}

export function MessageCircleIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v6A2.5 2.5 0 0 1 17.5 16h-6l-4.5 3V16h-.5A2.5 2.5 0 0 1 4 13.5v-6Z" />
    </svg>
  )
}

export function PhoneIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.15 11.8 19.8 19.8 0 0 1 1.08 3.09 2 2 0 0 1 3.05.9h3a2 2 0 0 1 2 1.72l.5 3.3a2 2 0 0 1-.57 1.72l-1.36 1.36a16 16 0 0 0 6 6l1.36-1.36a2 2 0 0 1 1.72-.57l3.3.5A2 2 0 0 1 22 16.92Z" />
    </svg>
  )
}

export function PhoneFilledIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M6.63 10.79a15.1 15.1 0 0 0 6.58 6.58l2.2-2.2a1.5 1.5 0 0 1 1.54-.36 10.5 10.5 0 0 0 3.3.53A1.75 1.75 0 0 1 22 17.09v3.49a1.75 1.75 0 0 1-1.75 1.75A18.58 18.58 0 0 1 1.67 3.75 1.75 1.75 0 0 1 3.42 2h3.5a1.75 1.75 0 0 1 1.74 1.75 10.5 10.5 0 0 0 .53 3.3 1.5 1.5 0 0 1-.36 1.54l-2.2 2.2Z" />
    </svg>
  )
}

export function HeadphonesIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <path d="M4 14.5A2.5 2.5 0 0 1 6.5 12H8v7H6.5A2.5 2.5 0 0 1 4 16.5v-2Z" />
      <path d="M20 14.5A2.5 2.5 0 0 0 17.5 12H16v7h1.5a2.5 2.5 0 0 0 2.5-2.5v-2Z" />
      <path d="M20 17v1.5A2.5 2.5 0 0 1 17.5 21H12" />
      <path d="M12 21h-3" />
    </svg>
  )
}

export function EyeOpenIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export function EyeClosedIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="m3 3 18 18" />
      <path d="M10.58 10.58a2 2 0 1 0 2.83 2.83" />
      <path d="M9.36 5.37A11.8 11.8 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-4.2 5.13" />
      <path d="M6.23 6.23A17.1 17.1 0 0 0 2 12s3.5 7 10 7a11.6 11.6 0 0 0 5.05-1.17" />
    </svg>
  )
}

export function LockIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <rect height="11" rx="2.5" width="18" x="3" y="10" />
      <path d="M7 10V7a5 5 0 0 1 10 0v3" />
      <path d="M12 15.5v2" />
    </svg>
  )
}

export function UserPlusIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M15 19a6 6 0 0 0-10.5 0" />
      <circle cx="9" cy="8" r="3.5" />
      <path d="M19 8v6" />
      <path d="M16 11h6" />
    </svg>
  )
}

export function UserIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

export function InfoIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 7.5h.01" />
    </svg>
  )
}

export function BellIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M6 10.55A6 6 0 0 1 18 10.55V13l2 3H4l2-3v-2.45Z" />
      <path d="M9.75 19a2.5 2.5 0 0 0 4.5 0" />
    </svg>
  )
}

export function BellOffIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="m3 3 18 18" />
      <path d="M10.25 5.1A5.8 5.8 0 0 1 18 10.55V13l2 3H9.6" />
      <path d="M6 10.55V13l-2 3h8" />
      <path d="M9.75 19a2.5 2.5 0 0 0 4.5 0" />
    </svg>
  )
}

export function SettingsIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.37a1.7 1.7 0 0 0-1 .58 1.7 1.7 0 0 0-.4 1.05V21a2 2 0 0 1-4 0v-.08a1.7 1.7 0 0 0-.4-1.05 1.7 1.7 0 0 0-1-.58 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.63 15a1.7 1.7 0 0 0-.58-1 1.7 1.7 0 0 0-1.05-.4H3a2 2 0 0 1 0-4h.08a1.7 1.7 0 0 0 1.05-.4 1.7 1.7 0 0 0 .58-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.63a1.7 1.7 0 0 0 1-.58A1.7 1.7 0 0 0 10.4 3V3a2 2 0 0 1 4 0v.08a1.7 1.7 0 0 0 .4 1.05 1.7 1.7 0 0 0 1 .58 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.37 9c.1.36.3.7.58 1 .28.28.65.4 1.05.4H21a2 2 0 0 1 0 4h-.08a1.7 1.7 0 0 0-1.05.4 1.7 1.7 0 0 0-.47.2Z" />
    </svg>
  )
}

export function ImageIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <rect height="18" rx="2.5" width="18" x="3" y="3" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="m21 16-4.8-4.8a2 2 0 0 0-2.8 0L5 19" />
      <path d="m14 14 2 2" />
    </svg>
  )
}

export function UploadIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V16" />
    </svg>
  )
}

export function DownloadIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M12 4v12" />
      <path d="m7 11 5 5 5-5" />
      <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11A2.5 2.5 0 0 0 20 18.5V16" />
    </svg>
  )
}

export function TrashIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  )
}

export function MoreHorizontalIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <circle cx="6" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="18" cy="12" r="2" />
    </svg>
  )
}

export function SearchIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </svg>
  )
}

export function MailIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.45"
      viewBox="0 0 24 24"
    >
      <rect height="16" rx="2.5" width="20" x="2" y="4" />
      <path d="m22 7-8.95 5.7a2 2 0 0 1-2.1 0L2 7" />
    </svg>
  )
}

export function ShieldLockIcon({ className = iconClassName }: IconProps) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.25"
      viewBox="0 0 32 32"
    >
      <path
        d="M16 2 27.35 6.75v8.95c0 7.45-4.85 12.55-11.35 15-6.5-2.45-11.35-7.55-11.35-15V6.75L16 2Z"
        strokeWidth="1.8"
      />
      <path d="M13.65 16v-1.65A2.35 2.35 0 0 1 16 12a2.35 2.35 0 0 1 2.35 2.35V16" />
      <rect height="5.75" rx="1.2" width="6.9" x="12.55" y="15.45" />
      <path d="M16 18.05v1.25" />
    </svg>
  )
}

export {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronUpIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  LogOutIcon,
  MenuIcon,
  MicrophoneIcon,
  PaperclipIcon,
  RefreshIcon,
  ReplyIcon,
  SendIcon,
  XIcon,
} from './chatIcons'
