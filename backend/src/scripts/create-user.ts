import { loadEnv } from '../config/env.js'
import { createDatabaseClient } from '../db/client.js'
import { runDatabaseMigrations } from '../db/migrate.js'
import { normalizeEmail } from '../lib/email.js'
import { hashPassword } from '../lib/password.js'
import {
  createPortalUsersRepository,
  PortalUserConflictError,
} from '../modules/portal-users/repository.js'

type ParsedArgs = {
  email: string | null
  fullName: string | null
  help: boolean
  isActive: boolean
  password: string | null
  passwordFromStdin: boolean
}

function printHelp() {
  console.log(`Usage:
  pnpm --dir backend user:create -- --email=<email> [--full-name="Portal User"] [--password=<password>]
  printf 'PortalPass123!\\n' | pnpm --dir backend user:create -- --email=<email> --password-stdin

Options:
  --email             Required portal user email
  --full-name         Optional display name
  --password          Password passed directly in the command
  --password-stdin    Read password from stdin
  --inactive          Create the user as inactive
  --help              Show this help
`)
}

function readFlagValue(argv: string[], index: number, flag: string) {
  const current = argv[index]

  if (!current) {
    return null
  }

  if (current.startsWith(`${flag}=`)) {
    return current.slice(flag.length + 1)
  }

  if (current === flag) {
    return argv[index + 1] ?? null
  }

  return null
}

function parseArgs(argv: string[]): ParsedArgs {
  let email: string | null = null
  let fullName: string | null = null
  let password: string | null = null
  let passwordFromStdin = false
  let isActive = true
  let help = false

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index]

    if (current === '--help') {
      help = true
      continue
    }

    if (current === '--') {
      continue
    }

    if (current === '--password-stdin') {
      passwordFromStdin = true
      continue
    }

    if (current === '--inactive') {
      isActive = false
      continue
    }

    const emailValue = readFlagValue(argv, index, '--email')

    if (emailValue !== null) {
      email = emailValue

      if (current === '--email') {
        index += 1
      }

      continue
    }

    const fullNameValue = readFlagValue(argv, index, '--full-name')

    if (fullNameValue !== null) {
      fullName = fullNameValue

      if (current === '--full-name') {
        index += 1
      }

      continue
    }

    const passwordValue = readFlagValue(argv, index, '--password')

    if (passwordValue !== null) {
      password = passwordValue

      if (current === '--password') {
        index += 1
      }

      continue
    }

    throw new Error(`Unknown argument: ${current}`)
  }

  return {
    email,
    fullName,
    help,
    isActive,
    password,
    passwordFromStdin,
  }
}

async function readPasswordFromStdin() {
  const chunks: Buffer[] = []

  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }

  return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '')
}

async function resolvePassword(parsedArgs: ParsedArgs) {
  if (parsedArgs.password && parsedArgs.passwordFromStdin) {
    throw new Error('Use either --password or --password-stdin, not both.')
  }

  if (parsedArgs.passwordFromStdin) {
    const password = await readPasswordFromStdin()

    if (!password) {
      throw new Error('Password from stdin cannot be empty.')
    }

    return password
  }

  if (!parsedArgs.password) {
    throw new Error('Password is required. Use --password or --password-stdin.')
  }

  return parsedArgs.password
}

const parsedArgs = parseArgs(process.argv.slice(2))

if (parsedArgs.help) {
  printHelp()
  process.exit(0)
}

if (!parsedArgs.email) {
  printHelp()
  throw new Error('Email is required.')
}

const env = loadEnv()
const database = createDatabaseClient({
  connectionString: env.DATABASE_URL,
})

try {
  await runDatabaseMigrations(database.db)

  const password = await resolvePassword(parsedArgs)
  const repository = createPortalUsersRepository(database.db)

  const createdUser = await repository.create({
    email: normalizeEmail(parsedArgs.email),
    fullName: parsedArgs.fullName,
    isActive: parsedArgs.isActive,
    passwordHash: await hashPassword(password),
  })

  console.log(
    JSON.stringify(
      {
        created: true,
        user: createdUser,
      },
      null,
      2,
    ),
  )
} catch (error) {
  if (error instanceof PortalUserConflictError) {
    console.error(error.message)
    process.exit(1)
  }

  console.error(error)
  process.exit(1)
} finally {
  await database.close()
}
