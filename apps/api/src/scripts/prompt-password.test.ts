import { Readable } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { promptPassword } from './prompt-password.ts'

describe('promptPassword', () => {
  it('sin terminal (con un pipe) lee la primera línea tal cual', async () => {
    expect(await promptPassword('> ', Readable.from(['clave-de-prueba\n', 'otra línea\n']))).toBe('clave-de-prueba')
  })

  it('sin nada que leer devuelve vacío', async () => {
    expect(await promptPassword('> ', Readable.from([]))).toBe('')
  })
})
