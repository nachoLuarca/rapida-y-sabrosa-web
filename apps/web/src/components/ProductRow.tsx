import { lineKey, quantityInCart } from '../domain/cart'
import { formatClp } from '../domain/format'
import type { Product, ProductVariant } from '../domain/types'
import { useCart } from '../store/use-cart'
import { AddButton } from './ui/AddButton'
import { QuantityControl } from './ui/QuantityControl'

interface ProductRowProps {
  product: Product
}

function DottedLeader() {
  return <span aria-hidden="true" className="mb-1.5 min-w-4 flex-1 self-end border-b-2 border-dotted border-tinta/35" />
}

/** Botón Agregar o, si ya está en el pedido, el control − cantidad +. */
function ProductControl({ product, variant }: { product: Product; variant?: ProductVariant }) {
  const { lines, addItem, setQuantity } = useCart()
  const selection = { productId: product.id, variantId: variant?.id }
  const quantity = quantityInCart(lines, product.id, variant?.id)
  const itemName = variant ? `${product.name} (${variant.label})` : product.name

  if (quantity > 0) {
    return (
      <QuantityControl
        quantity={quantity}
        itemName={itemName}
        onChange={(next) => setQuantity(lineKey(selection), next)}
      />
    )
  }
  return <AddButton itemName={itemName} onClick={() => addItem(selection)} />
}

export function ProductRow({ product }: ProductRowProps) {
  const titleId = `producto-${product.id}`

  return (
    <article aria-labelledby={titleId} className="flex gap-4 py-5">
      {product.image && (
        <img
          src={product.image}
          alt=""
          loading="lazy"
          width={96}
          height={96}
          className="size-20 shrink-0 rounded-xl object-cover sm:size-24"
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <h4 id={titleId} className="text-lg leading-snug font-semibold">
            {product.name}
          </h4>
          {product.tags?.map((tag) => (
            <span
              key={tag}
              className="shrink-0 rounded-full bg-queso-claro px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap"
            >
              {tag}
            </span>
          ))}
          {product.price !== undefined && (
            <>
              <DottedLeader />
              <span className="font-bold whitespace-nowrap tabular-nums">{formatClp(product.price)}</span>
            </>
          )}
        </div>

        {product.variants ? (
          <>
            {product.description && <p className="mt-1 text-sm text-tinta">{product.description}</p>}
            <ul className="mt-3 flex flex-col gap-2">
              {product.variants.map((variant) => (
                <li key={variant.id} className="flex items-center gap-2">
                  <span>{variant.label}</span>
                  <DottedLeader />
                  <span className="font-bold whitespace-nowrap tabular-nums">{formatClp(variant.price)}</span>
                  <span className="ml-2 shrink-0">
                    <ProductControl product={product} variant={variant} />
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="mt-1 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-6">
            {product.description ? <p className="text-sm text-tinta">{product.description}</p> : <span />}
            <span className="shrink-0 self-end">
              <ProductControl product={product} />
            </span>
          </div>
        )}
      </div>
    </article>
  )
}
