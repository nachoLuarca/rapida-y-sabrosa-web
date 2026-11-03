import { describe, expect, it } from 'vitest'
import { EnvError, parseEnv } from './env.ts'

const base = { DATABASE_URL: 'postgres://rys:rys@localhost:5432/rys' }

function problemsOf(source: Record<string, string | undefined>): string[] {
  try {
    parseEnv(source)
  } catch (error) {
    if (error instanceof EnvError) return error.problems
    throw error
  }
  throw new Error('se esperaba un EnvError')
}

describe('parseEnv', () => {
  it('con solo DATABASE_URL usa los valores por defecto de la spec', () => {
    expect(parseEnv(base)).toEqual({
      ...base,
      NODE_ENV: 'development',
      PORT: 3000,
      DATABASE_URL_TEST: undefined,
      DEMO_MODE: false,
      DEMO_PASSWORD: undefined,
      ALLOWED_ORIGINS: ['http://localhost:5173', 'http://localhost:5174'],
      SESSION_TTL_HOURS: 12,
      LOG_LEVEL: 'info',
    })
  })

  it('convierte números, booleanos y la lista de orígenes', () => {
    const env = parseEnv({
      ...base,
      PORT: '4000',
      DEMO_MODE: 'true',
      DEMO_PASSWORD: 'una-clave-larga',
      ALLOWED_ORIGINS: ' http://localhost:5173 , http://192.168.1.20:5173 ',
      SESSION_TTL_HOURS: '8',
    })
    expect(env).toMatchObject({
      PORT: 4000,
      DEMO_MODE: true,
      ALLOWED_ORIGINS: ['http://localhost:5173', 'http://192.168.1.20:5173'],
      SESSION_TTL_HOURS: 8,
    })
  })

  it('trata las variables vacías del .env como no definidas', () => {
    expect(parseEnv({ ...base, DATABASE_URL_TEST: '', DEMO_PASSWORD: '', DEMO_MODE: '' })).toMatchObject({
      DATABASE_URL_TEST: undefined,
      DEMO_PASSWORD: undefined,
      DEMO_MODE: false,
    })
  })

  it('no arranca sin DATABASE_URL y dice dónde ver la plantilla', () => {
    expect(problemsOf({})).toEqual(['DATABASE_URL: falta (ver apps/api/.env.example).'])
  })

  it('explica cada valor inválido', () => {
    const problems = problemsOf({
      DATABASE_URL: 'mysql://localhost/rys',
      PORT: 'abc',
      DEMO_MODE: 'si',
      ALLOWED_ORIGINS: 'localhost:5173',
    })
    expect(problems).toHaveLength(4)
    expect(problems).toContain('DATABASE_URL: Debe ser una URL postgres://usuario:clave@host:puerto/base.')
    expect(problems).toContain('PORT: Debe ser un número de puerto.')
    expect(problems).toContain('DEMO_MODE: Usa true o false.')
    expect(problems.join('\n')).toContain('ALLOWED_ORIGINS: "localhost:5173" no es un origen válido')
  })

  it('en modo demo exige DEMO_PASSWORD de al menos 10 caracteres', () => {
    expect(problemsOf({ ...base, DEMO_MODE: 'true' })).toEqual(['DEMO_PASSWORD: Es obligatoria cuando DEMO_MODE=true.'])
    expect(problemsOf({ ...base, DEMO_MODE: 'true', DEMO_PASSWORD: 'corta' })).toEqual([
      'DEMO_PASSWORD: Debe tener al menos 10 caracteres.',
    ])
  })

  it('el mensaje completo lista un problema por línea', () => {
    expect(() => parseEnv({})).toThrow('Configuración inválida en apps/api/.env:\n  - DATABASE_URL: falta')
  })
})
