import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadEnvFile } from 'node:process'

import { loadEnv } from '../../../backend/src/config/env.ts'

let hasLoadedEnvFile = false

export function loadE2eEnv() {
  if (!hasLoadedEnvFile) {
    const envFilePath = resolve(process.cwd(), '.env')

    if (existsSync(envFilePath)) {
      loadEnvFile(envFilePath)
    }

    hasLoadedEnvFile = true
  }

  return loadEnv()
}

export function getRequiredRawEnv(name: string) {
  loadE2eEnv()

  const value = process.env[name]?.trim()

  if (!value) {
    throw new Error(`${name} is required for this e2e test.`)
  }

  return value
}
