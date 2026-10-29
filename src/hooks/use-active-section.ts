import { useEffect, useState } from 'react'

/**
 * Id de la sección visible bajo el header y la barra de la carta. Si el navegador no tiene
 * IntersectionObserver (o en tests), devuelve null y ningún chip queda marcado.
 */
export function useActiveSection(ids: string[]): string | null {
  const [activeId, setActiveId] = useState<string | null>(null)
  const idsKey = ids.join('|')

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const sectionIds = idsKey.split('|').filter(Boolean)
    const visible = new Set<string>()

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id)
          else visible.delete(entry.target.id)
        }
        const first = sectionIds.find((id) => visible.has(id))
        if (first) setActiveId(first)
      },
      // Franja bajo la barra fija: la sección que la cruza es la activa.
      { rootMargin: '-190px 0px -55% 0px' },
    )

    for (const id of sectionIds) {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    }
    return () => observer.disconnect()
  }, [idsKey])

  return activeId
}
