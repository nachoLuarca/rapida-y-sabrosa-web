import { describe, expect, it } from 'vitest'
import { etagFor, matchesIfNoneMatch } from './etag.ts'

describe('etagFor', () => {
  it('es estable para el mismo contenido y distinto si cambia un byte', () => {
    expect(etagFor('{"a":1}')).toBe(etagFor('{"a":1}'))
    expect(etagFor('{"a":1}')).not.toBe(etagFor('{"a":2}'))
    expect(etagFor('x')).toMatch(/^"[\w-]+"$/)
  })
})

describe('matchesIfNoneMatch', () => {
  const etag = '"abc"'

  it('coincide con el mismo ETag, su forma débil, una lista o *', () => {
    expect(matchesIfNoneMatch('"abc"', etag)).toBe(true)
    expect(matchesIfNoneMatch('W/"abc"', etag)).toBe(true)
    expect(matchesIfNoneMatch('"x", "abc"', etag)).toBe(true)
    expect(matchesIfNoneMatch('*', etag)).toBe(true)
  })

  it('no coincide sin header o con otro ETag', () => {
    expect(matchesIfNoneMatch(undefined, etag)).toBe(false)
    expect(matchesIfNoneMatch('', etag)).toBe(false)
    expect(matchesIfNoneMatch('"abcd"', etag)).toBe(false)
    expect(matchesIfNoneMatch('abc', etag)).toBe(false)
  })
})
