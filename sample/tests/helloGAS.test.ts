import {gasRequire} from 'tgas-local'
import {test, vi} from 'vitest'

const gLib = gasRequire('../gas_files')
test('Testing plugin typeing', () => {
  gLib.UrlFetchApp.fetch = vi.fn()
  gLib.HELLO_WORLD
}) 
