import { existsSync } from 'node:fs'
import { z } from 'zod'

// Variables de entorno de la API (docs/BACKEND-SPEC.md → Configuración). Se validan al arrancar: si falta
// algo o es inválido, la API no arranca y dice qué corregir.

const postgresUrl = z.url({ protocol: /^postgres(ql)?$/, error: 'Debe ser una URL postgres://usuario:clave@host:puerto/base.' })

const booleanFlag = z
  .enum(['true', 'false', ''], { error: 'Usa true o false.' })
  .default('false')
  .transform((value) => value === 'true')

const originList = z
  .string()
  .default('http://localhost:5173,http://localhost:5174')
  .transform((value, ctx) => {
    const origins = value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
    for (const origin of origins) {
      if (!URL.canParse(origin) || new URL(origin).origin !== origin) {
        ctx.addIssue({ code: 'custom', message: `"${origin}" no es un origen válido (ej. http://localhost:5173).` })
        return z.NEVER
      }
    }
    return origins
  })

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value)

export const envSchema = z
  .object({
    NODE_ENV: z
      .enum(['development', 'test', 'production'], { error: 'Usa development, test o production.' })
      .default('development'),
    PORT: z.coerce.number({ error: 'Debe ser un número de puerto.' }).int().min(1).max(65_535).default(3000),
    DATABASE_URL: postgresUrl,
    DATABASE_URL_TEST: z.preprocess(emptyAsUndefined, postgresUrl.optional()),
    DEMO_MODE: booleanFlag,
    DEMO_PASSWORD: z.preprocess(
      emptyAsUndefined,
      z.string().min(10, { error: 'Debe tener al menos 10 caracteres.' }).optional(),
    ),
    ALLOWED_ORIGINS: originList,
    SESSION_TTL_HOURS: z.coerce
      .number({ error: 'Debe ser un número de horas.' })
      .int()
      .min(1, { error: 'Debe ser al menos 1.' })
      .max(720, { error: 'Debe ser a lo más 720 (30 días).' })
      .default(12),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'], {
        error: 'Usa fatal, error, warn, info, debug, trace o silent.',
      })
      .default('info'),
  })
  .superRefine((env, ctx) => {
    if (env.DEMO_MODE && !env.DEMO_PASSWORD) {
      ctx.addIssue({ code: 'custom', path: ['DEMO_PASSWORD'], message: 'Es obligatoria cuando DEMO_MODE=true.' })
    }
  })

export type Env = z.output<typeof envSchema>

export class EnvError extends Error {
  readonly problems: string[]

  constructor(problems: string[]) {
    super(`Configuración inválida en apps/api/.env:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`)
    this.name = 'EnvError'
    this.problems = problems
  }
}

/** Valida las variables. Lanza EnvError con un problema por línea ("DATABASE_URL: falta…"). */
export function parseEnv(source: Record<string, string | undefined> = process.env): Env {
  const result = envSchema.safeParse(source)
  if (result.success) return result.data
  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.') || 'entorno'
    const missing = issue.code === 'invalid_type' && source[name] === undefined
    return `${name}: ${missing ? 'falta (ver apps/api/.env.example).' : issue.message}`
  })
  throw new EnvError(problems)
}

/**
 * Carga apps/api/.env si existe. No pisa las variables que ya vienen del entorno (así CI y la línea de
 * comandos mandan sobre el archivo).
 */
export function loadEnvFile(path: URL = new URL('../../.env', import.meta.url)): void {
  if (existsSync(path)) process.loadEnvFile(path)
}
