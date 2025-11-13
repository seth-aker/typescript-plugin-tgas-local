import fs from 'node:fs'
import path from "node:path";
import * as ts from "typescript/lib/tsserverlibrary";
import { Logger } from "./logger";
export interface ISymbolInfo {
  name: string,
  typeString: string,
  documentation: string,
  fileName: string,
  textSpan: ts.TextSpan,
  kind: ts.ScriptElementKind
}

export class VirtualDTSFileManager {
  private _compilerOptions: ts.CompilerOptions
  private _gasProgram!: ts.Program
  private _checker!: ts.TypeChecker;
  private _logger: Logger
  private _gasFilesDir: string
  private _symbolMap: Map<string, ISymbolInfo>
  private _virtualDTSFilePath: string
  private _virtualFileVersion: number = 0;
  private _virtualFileContents: string = ""
  private _virtualFileSnapshot!: ts.IScriptSnapshot
  private _GLOBAL_MOCKS_KEYS: string[]
  private _usedMocksKeys: Set<string> = new Set<string>()

  constructor(compilerOptions: ts.CompilerOptions, gasFilesDir: string, virtualDTSFilePath: string, projectDir: string, logger: Logger) {
    this._compilerOptions = {...compilerOptions, allowJs: true};
    this._gasFilesDir = gasFilesDir
    this._logger = logger
    this._symbolMap = new Map<string, ISymbolInfo>()
    this._virtualDTSFilePath = virtualDTSFilePath
    this._GLOBAL_MOCKS_KEYS = this.getGlobalMocksKeys(projectDir)
    this._logger.info(`GlobalMocksKeys: ${this._GLOBAL_MOCKS_KEYS.join("\n")}`)
    this.updateFile()
  }
  updateFile() {
    const host = ts.createCompilerHost(this._compilerOptions)
    const files = this.getDirFileNames(this._gasFilesDir)
    this._logger.info(`GAS file found: ${files.join("\n")}`)
    this._gasProgram = ts.createProgram(files, this._compilerOptions, host)
    this._checker = this._gasProgram.getTypeChecker()

    this.populateSymbolMap()

    this._virtualFileContents = this.generateVirtualFileContents()
    this._virtualFileSnapshot = ts.ScriptSnapshot.fromString(this._virtualFileContents)
    this._virtualFileVersion++
    this._logger.info(`Virtual file updated to version ${this._virtualFileVersion}`);

    return this._virtualFileSnapshot
  }
  getVirtualDTSFileContents() {
    return this._virtualFileContents;
  }
  getVirtualFilePath() {
    return this._virtualDTSFilePath
  }
  getVirtualFileVersion() {
    return this._virtualFileVersion.toString()
  }
  getScriptSnapshot() {
    return this._virtualFileSnapshot
  }
  getSymbolMap() {
    return this._symbolMap
  }
  private populateSymbolMap() {
    this._symbolMap.clear()
    this._usedMocksKeys.clear()
    const programFiles = this._gasProgram.getSourceFiles()
    // TODO: Figure out how to get this caching so this isn't as expensive
    const files = this.getDirFileNames(this._gasFilesDir)
    for(const sourceFile of programFiles) {
      const fileName = path.resolve(sourceFile.fileName)
      if(files.includes(fileName)) {
        this._logger.info(`Reading sourceFile: ${sourceFile.fileName}`)
        ts.forEachChild(sourceFile, (node) => this._visit(node, this._checker))
      }
    }
  }
  private generateVirtualFileContents() {
    const indentJSDoc = (doc: string): string => {
      if(!doc) return ""
      const lines = doc.split("\n")
      return lines.map(line => `  ${line}`).join('\n')
    }
    const props: string[] = []
    this._symbolMap.forEach((symbolInfo) => {
      props.push(indentJSDoc(symbolInfo.documentation))
      props.push(`  ${symbolInfo.name}: ${symbolInfo.typeString}`)
    })
    const fileContent = `
// [tgas-local-plugin] This is a virtual file generated in-memory.
// It contains all top-level symbols from your Google Apps Script directory.

import type { IGasOptions, IGlobalMocksObject } from 'tgas-local';

/**
 * Augments the 'tgas-local' module to provide static types
 * for the dynamically constructed VM context.
 */
declare module 'tgas-local' {
  interface GasGlobals {
  ${props.join("\n")}
  }
  type IGasRequire = GasGlobals & Required<Pick<IGlobalMocksObject, "${Array.from(this._usedMocksKeys).join(" | ")}">>
  /**
   * Overrides the default 'gasRequire' function signature.
   * Instead of returning 'any', it now returns the strongly-typed
   * 'GasGlobals' interface, enabling full autocompletion and type-checking.
   *
   * @param path The path to the directory of GAS files.
   */
  function gasRequire(directory: string, globalMocks?: IGlobalMocksObject, options?: IGasOptions): IGasRequire
}
`
    this._logger.info(`Generated virtual file content: \n${fileContent}`)
    return fileContent
  }

  private _visit(node: ts.Node, checker: ts.TypeChecker) {
      if(ts.isFunctionDeclaration(node)
      || ts.isVariableStatement(node)
      || ts.isClassDeclaration(node)) {
        const declaration = ts.isVariableStatement(node) ? node.declarationList.declarations[0]: node
        
        if(!declaration?.name) return 

        const symbol = checker.getSymbolAtLocation(declaration.name)
        if(!symbol) return

        const name = symbol.getName()

        const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
        const typeString = checker.typeToString(type)
        
        const documentation = ts.displayPartsToString(symbol.getDocumentationComment(checker))
        const fileName = node.getSourceFile().fileName;
        
        const textSpan = ts.createTextSpan(declaration.getStart(), declaration.getWidth())
        
        let kind: ts.ScriptElementKind
        if(ts.isFunctionDeclaration(node)) {
          kind = ts.ScriptElementKind.functionElement
        } else if (ts.isVariableDeclaration(node)) {
          kind = ts.ScriptElementKind.variableElement
        } else {
          kind = ts.ScriptElementKind.classElement
        }
        this._symbolMap.set(name, { name, typeString, documentation, fileName, textSpan, kind })
      }
      // Check which IGlobalMocksObject keys are being used
      const nodeText = node.getText()
      this._GLOBAL_MOCKS_KEYS.forEach((key) => {
        if(nodeText.includes(key)) {
          this._usedMocksKeys.add(key)
        }
      })
    }
    private getDirFileNames(dir: string): string[] {
      try {
        const entries = fs.readdirSync(dir, {withFileTypes: true})
        const files = entries.flatMap(entry => {
          const fullPath = path.join(dir, entry.name)
          if(entry.isDirectory()) {
            return this.getDirFileNames(fullPath)
          } else {
            return fullPath
          }
        }).filter(each => {
          const extention = path.extname(each)
          return extention === '.ts' || extention === '.js' || extention === '.gs'
        })
        return files
      } catch (err) {
        this._logger.info(`An error occured accessing directory: ${dir}. Error: ${err}`)
        return []
      }
    }
    private getGlobalMocksKeys(projectDir: string): string[] {
      try {
        const globalMocksFile = fs.readFileSync(path.resolve(projectDir,"node_modules/tgas-local/lib/types/globalMocks.d.ts"), 'utf-8') 
        const globalMocksKeys: string[] = []

        const startIndex = globalMocksFile.indexOf("IGlobalMocksObject")
        if(startIndex === -1) {
          throw new Error("Could not find 'IGlobalMocksObject' in file")
        }
        const endIndex =  globalMocksFile.indexOf("}", startIndex);
        if(endIndex === -1) {
          throw new Error("Error: IGlobalMocksObject appears to be malformed")
        }
        for(const eachString of globalMocksFile.substring(startIndex, endIndex).split(":")) {
          const strings = eachString.split(" ")
          const key = strings[strings.length - 1]!
          if(key?.includes("?")) {
            globalMocksKeys.push(key.substring(0, key.length - 1))
          } else {
            globalMocksKeys.push(key)
          }
        }
        return globalMocksKeys
      } catch (err) {
        // bubble up to find it in node modules
        const keys = this.getGlobalMocksKeys(path.resolve(projectDir, ".."))
        if(keys.length > 0) {
          return keys
        }
        this._logger.info(`An error occured attempting to parse tgas-local file: globalMocks.d.ts. ${err}`)
        return []
      }
    }
}
