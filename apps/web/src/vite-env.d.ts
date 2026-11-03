/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Número que recibe los pedidos: solo dígitos con código país, p. ej. 56974314602. */
  readonly VITE_WHATSAPP_NUMBER?: string
  /** 'true' en demos: el pedido no se envía al local, solo se muestra y se copia. */
  readonly VITE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
