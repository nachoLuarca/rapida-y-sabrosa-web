import type { MenuResponse } from '@rys/contracts'

/**
 * Respuesta de GET /api/menu con pocos productos reales (los mismos de small-menu.ts): Suprema, el jugo de mango
 * y Arma tu pizza. Cada test la copia y cambia lo que necesita (agotados, precios, horario).
 */
export function apiMenu(): MenuResponse {
  return {
    categories: [
      {
        id: 'pizzas-carnes',
        name: 'Pizzas de mechada y charcutería',
        description: null,
        kind: 'regular',
        products: [
          {
            id: 'suprema',
            name: 'Suprema',
            description: 'Carne mechada, papas fritas artesanales, salsa de queso, mozzarella y salsa de tomate.',
            price: 13000,
            variants: [],
            tags: [],
            imageUrl: null,
            available: true,
          },
        ],
      },
      {
        id: 'arma-tu-pizza',
        name: 'Arma tu pizza',
        description: 'Elige tus ingredientes. Los 3 primeros van incluidos en la promoción.',
        kind: 'build_pizza',
        products: [],
      },
      {
        id: 'jugos',
        name: 'Jugos naturales',
        description: 'Botella de 500 cc o de 1 litro.',
        kind: 'regular',
        products: [
          {
            id: 'jugo-mango',
            name: 'Mango',
            description: null,
            price: null,
            variants: [
              { id: 'jugo-mango-500', label: '500 cc', price: 3500 },
              { id: 'jugo-mango-1l', label: '1 litro', price: 7000 },
            ],
            tags: [],
            imageUrl: null,
            available: true,
          },
        ],
      },
    ],
    ingredients: [
      { id: 'tocino', name: 'Tocino', price: 1500, available: true },
      { id: 'choclo', name: 'Choclo', price: 1500, available: true },
    ],
    zones: [
      { id: 'isla-centro', name: 'Isla Centro', fee: 2000 },
      { id: 'islita', name: 'Islita', fee: 2000 },
    ],
    buildPizza: {
      productId: 'arma-tu-pizza',
      name: 'Arma tu pizza',
      description: 'Salsa de tomates frescos, mozzarella, nuestra masa y orégano.',
      basePrice: 10900,
      promoPrice: 13000,
      includedInPromo: 3,
      available: true,
    },
    business: {
      name: 'Rápida y Sabrosa',
      whatsappNumber: '56974314602',
      pickupAddress: null,
      openingHours: null,
      isOpen: true,
      nextOpening: null,
      ordersPaused: false,
    },
  }
}
