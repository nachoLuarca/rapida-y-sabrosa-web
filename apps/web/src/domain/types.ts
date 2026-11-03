// Tipos del dominio (docs/SPEC.md). Los precios son pesos chilenos enteros.

export interface Category {
  id: string
  name: string
  description?: string
}

export interface ProductVariant {
  id: string
  /** Texto visible, p. ej. "500 cc" o "1 litro". */
  label: string
  price: number
}

interface ProductBase {
  id: string
  categoryId: string
  name: string
  description?: string
  /** Etiquetas visibles, p. ej. "Para 2". */
  tags?: string[]
  /** Ruta en public/, p. ej. "/img/suprema.webp". */
  image?: string
}

/** Un producto tiene un precio único o variantes con su propio precio, nunca ambos. */
export type Product =
  | (ProductBase & { price: number; variants?: never })
  | (ProductBase & { variants: ProductVariant[]; price?: never })

export interface BuildPizzaConfig {
  productId: string
  name: string
  description: string
  basePrice: number
  promoPrice: number
  includedInPromo: number
}

export interface Ingredient {
  id: string
  name: string
  price: number
}

export interface Zone {
  id: string
  name: string
  fee: number
}

/** Todo lo que se necesita para armar y validar líneas del pedido. */
export interface Catalog {
  products: Product[]
  buildPizza: BuildPizzaConfig
  ingredients: Ingredient[]
}

/** Qué eligió el cliente: identifica una línea del pedido. */
export interface LineSelection {
  productId: string
  variantId?: string
  /** Solo en Arma tu pizza, en el orden en que se eligieron. */
  ingredientIds?: string[]
}

export interface CartLine extends LineSelection {
  /** Igual para el mismo producto, variante e ingredientes (en cualquier orden). */
  key: string
  name: string
  variantLabel?: string
  ingredientNames?: string[]
  unitPrice: number
  quantity: number
}

export type PaymentMethod = 'Efectivo' | 'Transferencia' | 'Tarjeta'

export type Fulfillment = { type: 'delivery'; zone: Zone; address: string } | { type: 'pickup' }

export interface OrderDetails {
  customerName: string
  /** Celular normalizado: 569XXXXXXXX. */
  phone: string
  fulfillment: Fulfillment
  payment: PaymentMethod
  comment?: string
}
