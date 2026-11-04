/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Número que recibe los pedidos: solo dígitos con código país, p. ej. 56974314602. */
  readonly VITE_WHATSAPP_NUMBER?: string
  /** 'true' en demos: el pedido no se envía al local, solo se muestra y se copia. */
  readonly VITE_DEMO?: string
  /** 'api' pide la carta y envía los pedidos a la API; cualquier otro valor usa la carta del bundle. */
  readonly VITE_DATA_SOURCE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
