import { describe, expect, it } from 'vitest'
import { parseAnonymizeArgs } from './anonymize-args.ts'

describe('parseAnonymizeArgs', () => {
  it('lee --older-than en días, con o sin =, y --dry-run', () => {
    expect(parseAnonymizeArgs(['--older-than', '90d'])).toEqual({ days: 90, dryRun: false })
    expect(parseAnonymizeArgs(['--older-than=30D', '--dry-run'])).toEqual({ days: 30, dryRun: true })
    expect(parseAnonymizeArgs(['--dry-run', '--older-than', '1d'])).toEqual({ days: 1, dryRun: true })
  })

  it('exige --older-than', () => {
    expect(() => parseAnonymizeArgs([])).toThrow(/Falta --older-than/)
    expect(() => parseAnonymizeArgs(['--dry-run'])).toThrow(/Falta --older-than/)
    expect(() => parseAnonymizeArgs(['--older-than'])).toThrow(/Falta --older-than/)
  })

  it.each(['90', '0d', '-5d', '2.5d', '3651d', '3m', 'noventa'])('rechaza --older-than %s', (value) => {
    expect(() => parseAnonymizeArgs(['--older-than', value])).toThrow(/entre 1 y 3650/)
  })

  it('rechaza las opciones que no conoce', () => {
    expect(() => parseAnonymizeArgs(['--older-than', '90d', '--force'])).toThrow(/No conozco la opción "--force"/)
  })
})
