import { ISymbolInfo } from "./utils";
import fs from 'node:fs'
import path from "node:path";
export function generateVirtualDTS(symbolMap: Map<string, ISymbolInfo>): string {
  const indentJSDoc = (doc: string): string => {
    if(!doc) return ""
    const lines = doc.split("\n")
    return lines.map(line => `  ${line}`).join('\n')
  }
  let props: string[] = []
  symbolMap.forEach((symbolInfo) => {
    props.push(indentJSDoc(symbolInfo.documentation))
    props.push(`  ${symbolInfo.name}: ${symbolInfo.typeString}`)
  })
  try {
    fs.readFileSync(path.resolve('tgas-local/lib/index.js'))
  } catch (err) {

  }
  props.push()

  const fileContent = `
// [tgas-local-plugin] This is a virtual file generated in-memory.
// It contains all top-level symbols from your Google Apps Script directory.

import type { IGasOptions, IGlobalMocksObject, PartialDeep as PD } from 'tgas-local';

/**
 * Augments the 'tgas-local' module to provide static types
 * for the dynamically constructed VM context.
 */
declare module 'tgas-local' {
  interface GasGlobals {
  ${props.join('\n')}
  }
  type PartialDeep = PD
  /**
   * Overrides the default 'gasRequire' function signature.
   * Instead of returning 'any', it now returns the strongly-typed
   * 'GasGlobals' interface, enabling full autocompletion and type-checking.
   *
   * @param path The path to the directory of GAS files.
   */
  function gasRequire(directory: string, globalMocks?: IGlobalMocksObject, options?: IGasOptions): GasGlobals & IGlobalMocksObject
}
`
  return fileContent
}
