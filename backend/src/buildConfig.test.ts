import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

describe('backend production build config', () => {
  it('uses a production tsconfig that excludes test artifacts from Docker output', async () => {
    const tsconfigBuild = JSON.parse(
      await readFile('tsconfig.build.json', 'utf8'),
    ) as {
      exclude?: string[]
      extends?: string
    }
    const packageJson = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts?: Record<string, string>
    }
    const dockerfile = await readFile('Dockerfile', 'utf8')

    expect(tsconfigBuild.extends).toBe('./tsconfig.json')
    expect(tsconfigBuild.exclude).toEqual(
      expect.arrayContaining(['src/**/*.test.ts', 'src/test/**']),
    )
    expect(packageJson.scripts?.['build:prod']).toBe(
      'rm -rf dist && tsc -p tsconfig.build.json',
    )
    expect(dockerfile).toContain('pnpm --dir backend build:prod')
  })
})
