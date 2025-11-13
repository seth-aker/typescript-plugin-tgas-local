import { getDirFileNames, ISymbolInfo } from "./utils";
import fs from 'node:fs'
import path from "node:path";
import * as ts from "typescript/lib/tsserverlibrary";
import { Logger } from "./logger";

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

  constructor(compilerOptions: ts.CompilerOptions, gasFilesDir: string, virtualDTSFilePath: string, logger: Logger) {
    this._compilerOptions = {...compilerOptions, allowJs: true};
    this._gasFilesDir = gasFilesDir
    this._logger = logger
    this._symbolMap = new Map<string, ISymbolInfo>()
    this._virtualDTSFilePath = virtualDTSFilePath
    this.updateFile()
  }
  updateFile() {
    const host = ts.createCompilerHost(this._compilerOptions)
    const files = getDirFileNames(this._gasFilesDir, this._logger)
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
    const programFiles = this._gasProgram.getSourceFiles()
    // TODO: Figure out how to get this caching so this isn't as expensive
    const files = getDirFileNames(this._gasFilesDir, this._logger)
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

import type { IGasOptions, IGlobalMocksObject, PartialDeep as PD } from 'tgas-local';

/**
 * Augments the 'tgas-local' module to provide static types
 * for the dynamically constructed VM context.
 */
declare module 'tgas-local' {
  interface GasGlobals {
  ${props.join("\n")}
  }
  type IGasRequire = GasGlobals & IGlobalMocksObject
  type PartialDeep = PD
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
    }
}
