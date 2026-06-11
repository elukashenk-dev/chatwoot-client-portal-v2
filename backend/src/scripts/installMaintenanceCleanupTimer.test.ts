import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

import { describe, expect, it } from 'vitest'

const execFileAsync = promisify(execFile)
const scriptPath = path.resolve(
  process.cwd(),
  '..',
  'scripts',
  'install-maintenance-cleanup-timer.sh',
)

describe('install-maintenance-cleanup-timer.sh', () => {
  it('renders a production cleanup service that runs inside portal-backend', async () => {
    const { stdout } = await execFileAsync('bash', [
      scriptPath,
      '--print-service',
      '--app-path=/opt/chatwoot-client-portal-v2',
      '--docker=/usr/bin/docker',
    ])

    expect(stdout).toContain('WorkingDirectory=/opt/chatwoot-client-portal-v2')
    expect(stdout).toContain(
      'ExecStart=/usr/bin/docker compose --env-file /opt/chatwoot-client-portal-v2/.env.production -f /opt/chatwoot-client-portal-v2/infra/production/compose.yaml exec -T portal-backend node backend/dist/scripts/cleanup-maintenance-data.js',
    )
    expect(stdout).toContain('Restart=on-failure')
    expect(stdout).toContain('RestartSec=5min')
    expect(stdout).not.toContain('--dry-run')
  })

  it('renders a persistent daily timer with randomized delay', async () => {
    const { stdout } = await execFileAsync('bash', [
      scriptPath,
      '--print-timer',
      '--schedule=*-*-* 03:20:00',
      '--randomized-delay=20m',
    ])

    expect(stdout).toContain('OnCalendar=*-*-* 03:20:00')
    expect(stdout).toContain('Persistent=true')
    expect(stdout).toContain('RandomizedDelaySec=20m')
    expect(stdout).toContain(
      'Unit=chatwoot-client-portal-v2-maintenance-cleanup.service',
    )
  })
})
