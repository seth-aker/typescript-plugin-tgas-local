import * as ts from "typescript/lib/tsserverlibrary";
import fs from 'node:fs'
import path from "node:path";
import { Logger } from "./logger";
export interface ISymbolInfo {
  name: string,
  typeString: string,
  documentation: string,
  fileName: string,
  textSpan: ts.TextSpan,
  kind: ts.ScriptElementKind
}

export function getDirFileNames(dir: string, logger: Logger): string[] {
  try {
    const entries = fs.readdirSync(dir, {withFileTypes: true})
    const files = entries.flatMap(entry => {
      const fullPath = path.join(dir, entry.name)
      if(entry.isDirectory()) {
        return getDirFileNames(fullPath, logger)
      } else {
        return fullPath
      }
    }).filter(each => {
      const extention = path.extname(each)
      return extention === '.ts' || extention === '.js' || extention === '.gs'
    })
    return files
  } catch (err) {
    logger.info(`An error occured accessing directory: ${dir}. Error: ${err}`)
    return []
  }
}

export function getNodeAtPostition(sourceFile: ts.SourceFile, position: number) {
  function find(node: ts.Node): ts.Node | undefined {
    if(position >= node.getStart() && position < node.getEnd()) {
      return ts.forEachChild(node, find) || node
    }
  }
  return find(sourceFile)
}

export function populateSymbolMap(compilerOptions: ts.CompilerOptions, files: string[], symbolMap: Map<string, ISymbolInfo>, logger: Logger) {
  const host = ts.createCompilerHost(compilerOptions)
  const gasProgram = ts.createProgram(files, compilerOptions, host)
  const checker = gasProgram.getTypeChecker()
  function visit(node: ts.Node) {
    if(ts.isFunctionDeclaration(node)
    || ts.isVariableStatement(node)
    || ts.isClassDeclaration(node)) {
      logger.info(`node kind: ${node.kind.toString()}`)
      const declaration = ts.isVariableStatement(node) ? node.declarationList.declarations[0]: node
      
      if(!declaration?.name) return 
      const symbol = checker.getSymbolAtLocation(declaration.name)
      if(!symbol) return
      logger.info(`symbol: ${symbol.getName()}`)
      const name = symbol.getName()
      const type = checker.getTypeOfSymbolAtLocation(symbol, symbol.valueDeclaration!)
      const typeString = checker.typeToString(type)
      logger.info(`symbol typestring: ${typeString}`)
      const documentation = ts.displayPartsToString(symbol.getDocumentationComment(checker))
      logger.info(`documentation: ${documentation}`)
      const fileName = node.getSourceFile().fileName;
      logger.info(`fileName: ${fileName}`)
      const textSpan = ts.createTextSpan(declaration.getStart(), declaration.getWidth())
      let kind: ts.ScriptElementKind
      if(ts.isFunctionDeclaration(node)) {
        kind = ts.ScriptElementKind.functionElement
      } else if (ts.isVariableDeclaration(node)) {
        kind = ts.ScriptElementKind.variableElement
      } else {
        kind = ts.ScriptElementKind.classElement
      }

      symbolMap.set(name, { name, typeString, documentation, fileName, textSpan, kind })
    }
  }

  const programFiles = gasProgram.getSourceFiles()
  for(const sourceFile of programFiles) {
    const fileName = path.resolve(sourceFile.fileName)
    if(files.includes(fileName)) {
      logger.info(`Reading sourcefile: ${sourceFile.fileName}`)
      ts.forEachChild(sourceFile, visit)
    }
  }
}
export function isGasGlobalCompletion(node: ts.Node | undefined, checker: ts.TypeChecker): boolean {
  if(!node) return false
  let propertyAccessNode = node
  while(propertyAccessNode && !ts.isPropertyAccessExpression(propertyAccessNode)) {
    propertyAccessNode = propertyAccessNode.parent
  }
  if(!propertyAccessNode || !ts.isPropertyAccessExpression(propertyAccessNode)) {
    return false
  }
  const expression = propertyAccessNode.expression

  const type = checker.getTypeAtLocation(expression)

  const symbol = type.aliasSymbol ?? type.getSymbol()
  if(symbol?.name !== "GasGlobals") {
    return false
  }
  return true
}
