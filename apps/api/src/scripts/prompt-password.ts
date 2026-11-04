import { createInterface } from 'node:readline'

/**
 * Pide una contraseña por consola sin mostrarla. Si la entrada no es una terminal (por ejemplo, con un pipe), lee
 * la primera línea tal cual.
 */
export function promptPassword(question: string): Promise<string> {
  const { stdin, stdout } = process
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      const lines = createInterface({ input: stdin })
      lines.once('line', (line) => {
        lines.close()
        resolve(line)
      })
      lines.once('close', () => resolve(''))
    })
  }

  return new Promise((resolve, reject) => {
    stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let password = ''
    const finish = (error?: Error) => {
      stdin.setRawMode(false)
      stdin.pause()
      stdin.off('data', onData)
      stdout.write('\n')
      if (error) reject(error)
      else resolve(password)
    }
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') return finish()
        if (char === '\u0003') return finish(new Error('Cancelado.'))
        if (char === '\u007f' || char === '\b') password = password.slice(0, -1)
        else if (char >= ' ') password += char
      }
    }
    stdin.on('data', onData)
  })
}
