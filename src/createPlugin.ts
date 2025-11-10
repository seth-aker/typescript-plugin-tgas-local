import path from "node:path"
import * as ts from "typescript/lib/tsserverlibrary"
import { generateVirtualDTS } from "./virtualDTS"
import { getDirFileNames, getNodeAtPostition, isGasGlobalCompletion, ISymbolInfo, populateSymbolMap } from "./utils"

const VIRTUAL_FILE_NAME = '__tgas-virtual.d.ts'
export function createLanguageServicePlugin(): ts.server.PluginModuleFactory {
  return function init(modules: {typescript: typeof ts}) {
    const {typescript: _ts} = modules
    const plugin: ts.server.PluginModule = {
      create(info) {
        const logger = (msg: string) => info.project.projectService.logger.info(`[TGAS-LOCAL-PLUGIN] ${msg}`)
        logger("Plugin initializing!")
        const { project, languageService, languageServiceHost, config } = info;
        const compilerOptions = languageServiceHost.getCompilationSettings()
        const proxy: ts.LanguageService = Object.create(null);

        // setup a wrapper for the language service so that we can modify it.
        for(let key of Object.keys(languageService) as Array<keyof ts.LanguageService>) {
          const x = languageService[key]!
          // @ts-expect-error 
          proxy[key] = (...args: Array<{}>) => x.apply(info.languageService, args)
        }
        const gasDir = path.join(process.cwd(), config.gasDir)
        const gasFiles = getDirFileNames(gasDir, logger)
        const symbolMap = new Map<string, ISymbolInfo>()
        populateSymbolMap({...compilerOptions, allowJs: true}, gasFiles, symbolMap)
        const virtualDTSFile = path.resolve(project.getCurrentDirectory(), VIRTUAL_FILE_NAME)
        const virtualFileContents = generateVirtualDTS(symbolMap)

        const scriptSnapshot = ts.ScriptSnapshot.fromString(virtualFileContents)
        
        const origGetScriptSnapshot = info.languageServiceHost.getScriptSnapshot.bind(languageServiceHost);
        const origReadFile = info.languageServiceHost.readFile.bind(languageServiceHost);

        languageServiceHost.getScriptSnapshot = (fileName) => {
          if(fileName === virtualDTSFile) {
            return scriptSnapshot
          } else {
            return origGetScriptSnapshot(fileName)
          }
        }
        languageServiceHost.readFile = (fileName) => {
          if(fileName === virtualDTSFile) {
            return virtualFileContents
          } 
          return origReadFile(fileName)
        }

        proxy.getCompletionsAtPosition = (fileName, position, options) => {
          const prior = info.languageService.getCompletionsAtPosition(fileName, position, options);
          if (!prior) return;

          const program = languageService.getProgram()
          if(!program) return prior

          const checker = program.getTypeChecker()
          const sourceFile = program.getSourceFile(fileName)

          if(!sourceFile) return prior

          const node = getNodeAtPostition(sourceFile, position)

          if(!node) return prior

          
          if(isGasGlobalCompletion(node, checker)) {
            prior.entries = prior.entries.map(entry => {
              if(symbolMap.has(entry.name)) {
                return {
                  ...entry,
                  source: "GAS Globals",
                }
              }
              return entry
            })
          }
          return prior
        }

        proxy.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => {
          const symbolInfo = symbolMap.get(entryName)
          if(!symbolInfo || symbolInfo.name !== entryName) {
            logger(`getCompletionEntryDetails was not a gas obect, entryName: ${entryName}, source: ${source}, data: ${data}`)
            return languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data)
          } else {
            const quickInfo = languageService.getQuickInfoAtPosition(fileName, position)
            return {
              name: symbolInfo.name,
              kind: symbolInfo.kind,
              kindModifiers: ts.ScriptElementKindModifier.none,
              documentation: quickInfo?.documentation,
              displayParts: quickInfo?.displayParts
            } as ts.CompletionEntryDetails
          }
        }

        proxy.getQuickInfoAtPosition = (fileName, position, maximumLength) => {
          const prior = languageService.getQuickInfoAtPosition(fileName, position, maximumLength)
          if(!prior) return

          const program = languageService.getProgram()
          if(!program) return prior

          const checker = program.getTypeChecker();
          const sourceFile = program.getSourceFile(fileName)
          if(!sourceFile) return prior
          const node = getNodeAtPostition(sourceFile, prior.textSpan.start)
          if(!node) return prior
          const symbol = checker.getSymbolAtLocation(node)
          if(symbol && symbolMap.has(symbol.name)) {
            const symbolInfo = symbolMap.get(symbol.name)
            return {
              kind: prior.kind,
              kindModifiers: prior.kindModifiers,
              textSpan: prior.textSpan,
              displayParts: prior.displayParts,
              documentation: [
                {text: symbolInfo?.documentation, kind: "text"}
              ],
              tags: prior.tags
            } as ts.QuickInfo
          }
          return prior
        }

        return proxy
      },
      getExternalFiles(project: ts.server.Project) {
        const virtualDTSFile = path.resolve(project.getCurrentDirectory(), VIRTUAL_FILE_NAME)
        return [virtualDTSFile]
      }
    }
    return plugin
  }
}