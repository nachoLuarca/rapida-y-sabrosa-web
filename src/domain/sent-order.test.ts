import { describe, expect, it } from 'vitest'
import { isSentOrderExpired, parseSentOrder, SENT_ORDER_TTL_MS, serializeSentOrder, type SentOrder } from './sent-order'

const sent: SentOrder = { message: '*Nuevo pedido*', copied: false, sentAt: 1_000_000_000 }

describe('parseSentOrder', () => {
  it('recupera lo guardado con serializeSentOrder', () => {
    expect(parseSentOrder(serializeSentOrder(sent))).toEqual(sent)
  })

  it.each([
    ['nada guardado', null],
    ['vacío', ''],
    ['JSON roto', '{roto'],
    ['null', 'null'],
    ['una lista', '[]'],
    ['sin mensaje', JSON.stringify({ copied: false, sentAt: 1 })],
    ['mensaje vacío', JSON.stringify({ message: '', copied: false, sentAt: 1 })],
    ['copied que no es booleano', JSON.stringify({ message: 'a', copied: 'no', sentAt: 1 })],
    ['fecha de texto', JSON.stringify({ message: 'a', copied: false, sentAt: 'ayer' })],
    ['fecha negativa', JSON.stringify({ message: 'a', copied: false, sentAt: -1 })],
  ])('devuelve null con %s', (_name, raw) => {
    expect(parseSentOrder(raw)).toBeNull()
  })
})

describe('isSentOrderExpired', () => {
  it('sigue vigente justo antes de las 2 horas', () => {
    expect(isSentOrderExpired(sent, sent.sentAt + SENT_ORDER_TTL_MS - 1)).toBe(false)
  })

  it('vence a las 2 horas', () => {
    expect(isSentOrderExpired(sent, sent.sentAt + SENT_ORDER_TTL_MS)).toBe(true)
  })

  it('vence si la fecha guardada está muy en el futuro', () => {
    expect(isSentOrderExpired(sent, sent.sentAt - SENT_ORDER_TTL_MS)).toBe(true)
  })
})
