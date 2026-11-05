/** Aviso sonoro de pedido nuevo. Los tests pasan uno de mentira. */
export interface Chime {
  /** Se llama desde el clic que activa el sonido: los navegadores solo dejan sonar audio después de un gesto. */
  unlock(): void
  play(): void
}

/** Dos notas cortas con Web Audio: no hace falta ningún archivo de sonido. */
export function createWebAudioChime(): Chime {
  let context: AudioContext | null = null
  const ensure = () => {
    if (typeof AudioContext === 'undefined') return null
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
    return context
  }

  return {
    unlock() {
      ensure()
    },
    play() {
      const audio = ensure()
      if (!audio) return
      const start = audio.currentTime
      for (const [index, frequency] of [880, 1320].entries()) {
        const oscillator = audio.createOscillator()
        const gain = audio.createGain()
        const at = start + index * 0.18
        oscillator.frequency.value = frequency
        gain.gain.setValueAtTime(0.0001, at)
        gain.gain.exponentialRampToValueAtTime(0.3, at + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16)
        oscillator.connect(gain).connect(audio.destination)
        oscillator.start(at)
        oscillator.stop(at + 0.18)
      }
    },
  }
}

export const SOUND_STORAGE_KEY = 'rys.admin.sound.v1'

/** ¿El sonido estaba activado? Si localStorage no está disponible, parte apagado. */
export function loadSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_STORAGE_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveSoundPreference(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_STORAGE_KEY, on ? 'on' : 'off')
  } catch {
    // Sin localStorage, la preferencia dura mientras la página esté abierta.
  }
}
