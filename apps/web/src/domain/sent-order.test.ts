import { describe, expect, it } from 'vitest'
import { createLine, type CartLine, type LineSelection } from '@rys/domain'
import { catalog } from '../data/catalog'
import {
  cartFingerprint,
  isSentMarkExpired,
  parseSentMark,
  SENT_ORDER_TTL_MS,
  serializeSentMark,
  type SentMark,
  type SentOrder,
} from './sent-order'

const mark: SentMark = { sentAt: 1_000_000_000, cart: 'suprema||*2' }

const line = (selection: LineSelection, quantity = 1) => createLine(catalog, selection, quantity) as CartLine

describe('cartFingerprint', () => {
  const suprema = line({ productId: 'suprema' })
  const mango = line({ productId: 'jugo-mango', variantId: 'jugo-mango-1l' })

  it('no depende del orden de las líneas', () => {
    expect(cartFingerprint([suprema, mango])).toBe(cartFingerprint([mango, suprema]))
  })

  it('cambia con las cantidades y con los productos', () => {
    const base = cartFingerprint([suprema])
    expect(cartFingerprint([line({ productId: 'suprema' }, 2)])).not.toBe(base)
    expect(cartFingerprint([suprema, mango])).not.toBe(base)
  })
})

describe('serializeSentMark', () => {
  it('deja fuera el mensaje aunque venga en el pedido', () => {
    const sent: SentOrder = { ...mark, details: { message: 'Cliente: Ana', copied: true } }
    expect(JSON.parse(serializeSentMark(sent))).toEqual(mark)
  })
})

describe('parseSentMark', () => {
  it('recupera lo guardado con serializeSentMark', () => {
    expect(parseSentMark(serializeSentMark(mark))).toEqual(mark)
  })

  it.each([
    ['nada guardado', null],
    ['vacío', ''],
    ['JSON roto', '{roto'],
    ['null', 'null'],
    ['una lista', '[]'],
    ['sin carrito', JSON.stringify({ sentAt: 1 })],
    ['carrito vacío', JSON.stringify({ sentAt: 1, cart: '' })],
    ['carrito que no es texto', JSON.stringify({ sentAt: 1, cart: 2 })],
    ['fecha de texto', JSON.stringify({ sentAt: 'ayer', cart: 'a' })],
    ['fecha negativa', JSON.stringify({ sentAt: -1, cart: 'a' })],
    ['campos de más', JSON.stringify({ sentAt: 1, cart: 'a', nombre: 'Ana' })],
    ['la marca vieja con el mensaje', JSON.stringify({ message: 'Cliente: Ana', copied: false, sentAt: 1 })],
  ])('devuelve null con %s', (_name, raw) => {
    expect(parseSentMark(raw)).toBeNull()
  })
})

describe('isSentMarkExpired', () => {
  it('sigue vigente justo antes de las 2 horas', () => {
    expect(isSentMarkExpired(mark, mark.sentAt + SENT_ORDER_TTL_MS - 1)).toBe(false)
  })

  it('vence a las 2 horas', () => {
    expect(isSentMarkExpired(mark, mark.sentAt + SENT_ORDER_TTL_MS)).toBe(true)
  })

  it('vence si la fecha guardada está muy en el futuro', () => {
    expect(isSentMarkExpired(mark, mark.sentAt - SENT_ORDER_TTL_MS)).toBe(true)
  })
})
