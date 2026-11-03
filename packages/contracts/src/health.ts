import { z } from 'zod'

/** GET /health: 200 con todo "ok"; 503 con `db: "error"` si la base no responde. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'error']),
  db: z.enum(['ok', 'error']),
})

export type HealthResponse = z.infer<typeof healthResponseSchema>
