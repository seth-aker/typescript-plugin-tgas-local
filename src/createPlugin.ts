import path from "node:path"
import fs from 'node:fs'
import * as ts from "typescript/lib/tsserverlibrary"
import { VirtualDTSFileManager } from "./virtualDTS"
import { Logger } from "./logger"

const VIRTUAL_FILE_NAME = '__tgas-virtual.d.ts'
const DEBOUNCE_MS = 500
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

        const gasDir = path.join(project.getCurrentDirectory(), config.apps_script_directory)
        const virtualDTSFilePath = ts.server.toNormalizedPath(path.join(project.getCurrentDirectory(), VIRTUAL_FILE_NAME))
        const virtualFileManager = new VirtualDTSFileManager(compilerOptions, gasDir, virtualDTSFilePath, project.getCurrentDirectory(), logger)
        
        const origGetScriptSnapshot = languageServiceHost.getScriptSnapshot.bind(languageServiceHost);
        const origReadFile = languageServiceHost.readFile.bind(languageServiceHost);
        const origFileExists = languageServiceHost.fileExists.bind(languageServiceHost)
        const origGetScriptVersion = languageServiceHost.getScriptVersion.bind(languageServiceHost);
        const origGetScriptFileNames = languageServiceHost.getScriptFileNames.bind(languageServiceHost)

        languageServiceHost.getScriptSnapshot = (fileName) => {
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFilePath) {
            logger.info(`getScriptSnapshot: matched fileName: ${fileName} to virtualFileName: ${virtualDTSFilePath}`)
            return virtualFileManager.getScriptSnapshot()
          } 
          return origGetScriptSnapshot(fileName)
        }
        languageServiceHost.readFile = (fileName) => {
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFilePath) {
            logger.info(`readFile: matched fileName: ${fileName} to virtualFileName: ${virtualDTSFilePath}`)
            return virtualFileManager.getVirtualDTSFileContents()
          } 
          return origReadFile(fileName)
        }
        languageServiceHost.fileExists = (fileName: string) => {
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFilePath) {
            logger.info(`fileExists matched, returning true, file: ${ts.server.toNormalizedPath(fileName)}, virtual: ${virtualDTSFilePath}`)
            return true
          } else {
            return origFileExists(fileName)
          }
        }
        languageServiceHost.getScriptVersion = (fileName) => {
          if(ts.server.toNormalizedPath(fileName) === virtualDTSFilePath) {
            const version = virtualFileManager.getVirtualFileVersion()
            logger.info(`sending script version for virtualDTSFile: ${version}`)
            return version
          }
          return origGetScriptVersion(fileName)
        }
        languageServiceHost.getScriptFileNames = () => {
          const fileNames = origGetScriptFileNames()
          if(!fileNames.map(fileName => ts.server.toNormalizedPath(fileName)).includes(virtualDTSFilePath)) {
            logger.info(`virtualFile added to getScriptFileNames`)
            fileNames.push(virtualDTSFilePath)
          }
          return fileNames
        }

        let debounceTimer: NodeJS.Timeout | null = null
        try {
          fs.watch(gasDir, { recursive: true }, (eventType, fileName) => {
            if(!fileName) return
            
            logger.info(`Change detected in ${gasDir}: ${eventType} on ${fileName}`)
            if(debounceTimer) {
              clearTimeout(debounceTimer)
            }
            debounceTimer = setTimeout(() => {
              logger.info('Reloading project...')
              virtualFileManager.updateFile()
              const scriptInfo = project.projectService.getScriptInfo(virtualDTSFilePath)
              if(scriptInfo) {
                logger.info(`Reloading script: ${scriptInfo.fileName}`)
                scriptInfo.reloadFromFile()
              }
              logger.info('Project reloaded')
            }, DEBOUNCE_MS)  
          })  
        } catch (err: any) {
          logger.info(`Failed to start file watcher on ${gasDir}: ${err.message}`);
        }

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
        project.readFile(fileName),
        ts.ScriptKind.TS
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
