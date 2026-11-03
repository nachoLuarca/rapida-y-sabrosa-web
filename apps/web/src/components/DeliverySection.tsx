import { business } from '../config/business'
import { zones } from '../data/zones'
import { groupZonesByFee } from '../domain/delivery'
import { formatClp } from '../domain/format'

const listFormat = new Intl.ListFormat('es', { type: 'conjunction' })
const disjunction = new Intl.ListFormat('es', { type: 'disjunction' })

export function DeliverySection() {
  const groups = groupZonesByFee(zones)

  return (
    <section id="despacho" aria-labelledby="despacho-titulo" className="bg-fondo">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div>
          <h2 id="despacho-titulo" className="display text-6xl sm:text-7xl">
            Despacho
          </h2>
          <p className="mt-4 max-w-lg text-tinta">
            Llevamos tu pedido a estos sectores de {business.city}. El costo se suma al total cuando eliges tu
            sector.
          </p>
          <ul className="mt-8 divide-y divide-linea border-y border-linea">
            {groups.map((group) => (
              <li key={group.fee} className="grid gap-1 py-4 sm:grid-cols-[6rem_minmax(0,1fr)] sm:gap-6">
                <span className="font-bold text-rojo tabular-nums">{formatClp(group.fee)}</span>
                <span>{listFormat.format(group.zones.map((zone) => zone.name))}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex flex-col gap-8 md:pt-24">
          <div>
            <h3 className="text-xl font-bold">Retiro en el local</h3>
            <p className="mt-2 text-tinta">
              Sin costo de despacho.
              {business.pickupAddress && <> Te esperamos en {business.pickupAddress}.</>}
            </p>
          </div>
          <div>
            <h3 className="text-xl font-bold">Formas de pago</h3>
            <p className="mt-2 text-tinta">
              {disjunction.format(business.paymentMethods)}. Pagas al recibir o al retirar.
            </p>
          </div>
          {business.openingHours && (
            <div>
              <h3 className="text-xl font-bold">Horario</h3>
              <ul className="mt-2 text-tinta">
                {business.openingHours.map((slot) => (
                  <li key={slot.days}>
                    {slot.days}: {slot.hours}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
