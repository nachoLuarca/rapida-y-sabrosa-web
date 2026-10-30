import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

// jsdom no implementa showModal/close de <dialog>. Este reemplazo mínimo imita lo que usa la app:
// abre, enfoca el primer elemento enfocable, cierra con Esc (evento cancel) y emite "close".
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  const focusable = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

  const onKeyDown = (event: KeyboardEvent) => {
    const dialog = event.currentTarget as HTMLDialogElement
    if (event.key !== 'Escape') return
    const cancel = new Event('cancel', { cancelable: true })
    if (dialog.dispatchEvent(cancel)) dialog.close()
  }

  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '')
    this.addEventListener('keydown', onKeyDown)
    this.querySelector<HTMLElement>(focusable)?.focus()
  }

  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return
    this.removeAttribute('open')
    this.removeEventListener('keydown', onKeyDown)
    this.dispatchEvent(new Event('close'))
  }
}
