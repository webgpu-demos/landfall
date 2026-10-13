import { test } from 'node:test'
import assert from 'node:assert/strict'
import { whereLine } from '../src/lib/where.ts'

test('NHC distance lines read as plain English and Spanish', () => {
  assert.deepEqual(whereLine(['ABOUT 425 MI...685 KM E OF THE LEEWARD ISLANDS'], false), ['425 mi (685 km) east of the Leeward Islands'])
  assert.deepEqual(whereLine(['ABOUT 80 MI...130 KM SE OF PONCE PUERTO RICO'], false), ['80 mi (130 km) southeast of Ponce, Puerto Rico'])
  assert.deepEqual(whereLine(['ABOUT 135 MI...215 KM SE OF ST. CROIX'], true), ['215 km (135 mi) al sudeste de St. Croix'])
  assert.deepEqual(whereLine(['LOCATION...16.3N 55.4W'], false), [])
})
