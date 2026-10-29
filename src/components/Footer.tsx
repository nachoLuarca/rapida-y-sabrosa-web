import { business } from '../config/business'

export function Footer() {
  return (
    <footer className="bg-carbon text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-12 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="display text-4xl text-queso">{business.name}</p>
          <p className="mt-2 text-white/80">
            {business.branch}, {business.city}
          </p>
        </div>
        <a
          href={business.instagram.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline underline-offset-4 hover:text-queso"
        >
          Síguenos en Instagram: @{business.instagram.handle}
        </a>
      </div>
    </footer>
  )
}
