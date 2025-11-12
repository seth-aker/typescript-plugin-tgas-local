import * as ts from 'typescript/lib/tsserverlibrary'
export class Logger {
  private _tsLogger: ts.server.Logger;
  constructor(tsLogger: ts.server.Logger) {
    this._tsLogger = tsLogger
  }

  public info(msg: string) {
    this._tsLogger.info(`[TGAS-LOCAL-PLUGIN] ${msg}`)
  }
  

}
