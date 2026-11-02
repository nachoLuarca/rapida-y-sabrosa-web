type Menu = typeof import('../data/menu')

/**
 * Carta con los pocos productos reales que usan los flujos del pedido. Renderizar los 87 productos
 * hace que cada consulta por rol tarde segundos en jsdom, y con varios workers los tests pasan de 5 s.
 */
export function smallMenu(menu: Menu): Menu {
  const products = menu.products.filter(
    (product) => product.id === 'suprema' || product.id === 'jugo-mango' || product.categoryId === 'arma-tu-pizza',
  )
  const categories = menu.categories.filter(
    (category) => category.id === 'arma-tu-pizza' || products.some((product) => product.categoryId === category.id),
  )
  return { ...menu, products, categories }
}
