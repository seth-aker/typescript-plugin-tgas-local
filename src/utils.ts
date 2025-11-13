import * as ts from "typescript/lib/tsserverlibrary";
import fs from 'node:fs'
import path from "node:path";
export function getNodeAtPostition(sourceFile: ts.SourceFile, position: number) {
  function find(node: ts.Node): ts.Node | undefined {
    if(position >= node.getStart() && position < node.getEnd()) {
      return ts.forEachChild(node, find) || node
    }
  }
  return find(sourceFile)
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
