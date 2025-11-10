import * as ts from "typescript/lib/tsserverlibrary"

export function createLanguageServicePlugin(): ts.server.PluginModuleFactory {
  return function init(modules: {typescript: typeof ts}) {
    const {typescript: _ts} = modules
    const plugin: ts.server.PluginModule = {
      create(info) {
        info.project.projectService.logger.info("[TGAS-LOCAL] Hello World")
        return info.languageService
      }
    }
    return plugin
  }
}
