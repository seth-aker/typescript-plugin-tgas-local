import path from "node:path"
import * as ts from "typescript/lib/tsserverlibrary"
import { generateVirtualDTS } from "./virtualDTS"
import { getDirFileNames, ISymbolInfo, populateSymbolMap } from "./utils"
import { Logger } from "./logger"

const VIRTUAL_FILE_NAME = '__tgas-virtual.d.ts'
export function createLanguageServicePlugin(): ts.server.PluginModuleFactory {
  return function init(modules: {typescript: typeof ts}) {
    const { typescript: _ts } = modules
    const plugin: ts.server.PluginModule = {
      create(info) {
        const logger = new Logger(info.project.projectService.logger)
        logger.info("Plugin initializing!")
        const { project, languageService, languageServiceHost, config } = info;
        const compilerOptions = languageServiceHost.getCompilationSettings()
        const proxy: ts.LanguageService = Object.create(null);

        // setup a wrapper for the language service so that we can modify it.
        for(let key of Object.keys(languageService) as Array<keyof ts.LanguageService>) {
          const x = languageService[key]!
          // @ts-expect-error 
          proxy[key] = (...args: Array<{}>) => x.apply(languageService, args)
        }

        const gasDir = path.join(project.getCurrentDirectory(), config.gasDir)
        const gasFiles = getDirFileNames(gasDir, logger)
        logger.info(`GAS file found: ${gasFiles.join("\n")}`)
        const symbolMap = new Map<string, ISymbolInfo>()
        populateSymbolMap({...compilerOptions, allowJs: true}, gasFiles, symbolMap, logger)

        const virtualDTSFile = ts.server.toNormalizedPath(path.join(project.getCurrentDirectory(), VIRTUAL_FILE_NAME))
        const virtualFileContents = generateVirtualDTS(symbolMap)
        const virtualFileSnapshot = ts.ScriptSnapshot.fromString(virtualFileContents)
        logger.info(virtualFileContents)
        
        
        const origGetScriptSnapshot = languageServiceHost.getScriptSnapshot.bind(languageServiceHost);
        const origReadFile = languageServiceHost.readFile.bind(languageServiceHost);
        const origFileExists = languageServiceHost.fileExists.bind(languageServiceHost)
        const origGetScriptVersion = languageServiceHost.getScriptVersion.bind(languageServiceHost);
        const origGetScriptFileNames = languageServiceHost.getScriptFileNames.bind(languageServiceHost)

        languageServiceHost.getScriptSnapshot = (fileName) => {
          logger.info(`fileName ${fileName}, virtualFile: ${virtualDTSFile}`)
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFile) {
            logger.info(`getScriptSnapshot: matched fileName: ${fileName} to virtualFileName: ${virtualDTSFile}`)
            return virtualFileSnapshot
          } 
          return origGetScriptSnapshot(fileName)
        }
        languageServiceHost.readFile = (fileName) => {
          logger.info(`read file called: ${fileName}`)
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFile) {
            logger.info(`readFile: matched fileName: ${fileName} to virtualFileName: ${virtualDTSFile}`)
            return virtualFileContents
          } 
          return origReadFile(fileName)
        }
        languageServiceHost.fileExists = (fileName: string) => {
          logger.info(`File Exists called: ${fileName}`)
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFile) {
            logger.info(`fileExists matched, returning true, file: ${ts.server.toNormalizedPath(fileName)}, virtual: ${virtualDTSFile}`)
            return true
          } else {
            return origFileExists(fileName)
          }
        }
        languageServiceHost.getScriptVersion = (fileName) => {
          logger.info(`Get Script Version called: ${fileName}`)
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFile) {
            return '0'
          }
          return origGetScriptVersion(fileName)
        }
        languageServiceHost.getScriptFileNames = () => {
          const fileNames = origGetScriptFileNames()
          logger.info(`getScriptFileNames run. \n${fileNames.join("\n")}`)
          if(!fileNames.map(fileName => ts.server.toNormalizedPath(fileName)).includes(virtualDTSFile)) {
            logger.info(`virtualFile added to getScriptFileNames`)
            fileNames.push(virtualDTSFile)
          }
          return fileNames
        }
        // proxy.getCompletionsAtPosition = (fileName, position, options) => {
        //   const prior = languageService.getCompletionsAtPosition(fileName, position, options);
        //   if (!prior) return;

        //   const program = languageService.getProgram()
        //   if(!program) return prior

        //   const checker = program.getTypeChecker()
        //   const sourceFile = program.getSourceFile(fileName)

        //   if(!sourceFile) return prior

        //   const node = getNodeAtPostition(sourceFile, position)

        //   if(!node) return prior

          
        //   if(isGasGlobalCompletion(node, checker)) {
        //     prior.entries = prior.entries.map(entry => {
        //       if(symbolMap.has(entry.name)) {
        //         return {
        //           ...entry,
        //           source: "GAS Globals",
        //         }
        //       }
        //       return entry
        //     })
        //   }
        //   return prior
        // }

        // proxy.getCompletionEntryDetails = (fileName, position, entryName, formatOptions, source, preferences, data) => {
        //   const symbolInfo = symbolMap.get(entryName)
        //   if(!symbolInfo || symbolInfo.name !== entryName) {
        //     logger.info(`getCompletionEntryDetails was not a gas obect, entryName: ${entryName}, source: ${source}, data: ${data}`)
        //     return languageService.getCompletionEntryDetails(fileName, position, entryName, formatOptions, source, preferences, data)
        //   } else {
        //     const quickInfo = languageService.getQuickInfoAtPosition(fileName, position)
        //     return {
        //       name: symbolInfo.name,
        //       kind: symbolInfo.kind,
        //       kindModifiers: ts.ScriptElementKindModifier.none,
        //       documentation: quickInfo?.documentation,
        //       displayParts: quickInfo?.displayParts
        //     } as ts.CompletionEntryDetails
        //   }
        // }

        // proxy.getQuickInfoAtPosition = (fileName, position, maximumLength) => {
        //   const prior = languageService.getQuickInfoAtPosition(fileName, position, maximumLength)
        //   if(!prior) return

        //   const program = languageService.getProgram()
        //   if(!program) return prior

        //   const checker = program.getTypeChecker();
        //   const sourceFile = program.getSourceFile(fileName)
        //   if(!sourceFile) return prior
        //   const node = getNodeAtPostition(sourceFile, prior.textSpan.start)
        //   if(!node) return prior
        //   const symbol = checker.getSymbolAtLocation(node)
        //   if(symbol && symbolMap.has(symbol.name)) {
        //     const symbolInfo = symbolMap.get(symbol.name)
        //     return {
        //       kind: prior.kind,
        //       kindModifiers: prior.kindModifiers,
        //       textSpan: prior.textSpan,
        //       displayParts: prior.displayParts,
        //       documentation: [
        //         {text: symbolInfo?.documentation, kind: "text"}
        //       ],
        //       tags: prior.tags
        //     } as ts.QuickInfo
        //   }
        //   return prior
        // }

        return proxy
      },
      getExternalFiles(project: ts.server.Project) {
        const virtualDTSFile = ts.server.toNormalizedPath(path.resolve(project.getCurrentDirectory(), VIRTUAL_FILE_NAME))
        
        loadFile(project, virtualDTSFile)

        return [virtualDTSFile]
      }
    }
    function loadFile(project: ts.server.Project, fileName: ts.server.NormalizedPath) {
      const logger = new Logger(project.projectService.logger)
      if(project.containsFile(fileName)) {
        logger.info(`Virtual file is already in project.`);
        return
      }
      const scriptInfo = project.projectService.getOrCreateScriptInfoForNormalizedPath(
        fileName,
        true,
        project.readFile(fileName)
      );
      if(!scriptInfo) {
        logger.info(`FAILED to get or create ScriptInfo for virtual file.`);
        return;
      }
      if(project.getRootFiles().length > 0) {
        project.addRoot(scriptInfo)
        logger.info(`Successfully added virtual file as project root.`);
      } else {
        logger.info(`Project has no projectRootPath, skipping addRoot.`);
      }
    }
    return plugin
  }
}
