import {gasRequire} from 'tgas-local'
import {test, vi} from 'vitest'

const gLib = gasRequire('../gas_files')
test('Testing plugin typeing', () => {
  gLib.UrlFetchApp.fetch = vi.fn()
  gLib.helloGas2(gLib.HELLO_WORLD)
  gLib.helloGas2(gLib.helloWorld())
  gLib.helloGas2('hello')
}) 
