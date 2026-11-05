// Punto de entrada de @rys/contracts: esquemas Zod de la API y sus tipos. Los usan la API (para validar) y
// la web y el panel (para tipar y, cuando conviene, validar respuestas). Solo depende de Zod y @rys/domain.

export * from './admin.ts'
export * from './common.ts'
export * from './errors.ts'
export * from './health.ts'
export * from './menu.ts'
export * from './openapi.ts'
export * from './orders.ts'
