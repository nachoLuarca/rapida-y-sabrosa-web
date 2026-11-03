import type { Catalog, Zone } from '../types.ts'

/**
 * Datos de prueba con los mismos productos y precios de la carta real que usa el ejemplo de mensaje de
 * docs/SPEC.md. La carta real vive en apps/web y un test de allá verifica que siga dando ese mensaje.
 */
export const catalog: Catalog = {
  products: [
    { id: 'suprema', categoryId: 'pizzas', name: 'Suprema', price: 13000 },
    {
      id: 'jugo-mango',
      categoryId: 'jugos',
      name: 'Mango',
      variants: [
        { id: 'jugo-mango-500', label: '500 cc', price: 3500 },
        { id: 'jugo-mango-1l', label: '1 litro', price: 7000 },
      ],
    },
  ],
  buildPizza: {
    productId: 'arma-tu-pizza',
    name: 'Arma tu pizza',
    description: 'Base',
    basePrice: 10900,
    promoPrice: 13000,
    includedInPromo: 3,
  },
  ingredients: [
    { id: 'tocino', name: 'Tocino', price: 1500 },
    { id: 'choclo', name: 'Choclo', price: 1500 },
    { id: 'camaron', name: 'Camarón', price: 2500 },
  ],
}

export const zones: Zone[] = [
  { id: 'isla-centro', name: 'Isla Centro', fee: 2000 },
  { id: 'islita', name: 'Islita', fee: 2000 },
]
