import * as ts from 'typescript/lib/tsserverlibrary'
export class Logger implements ts.server.Logger {
  private _tsLogger: ts.server.Logger;
  constructor(tsLogger: ts.server.Logger) {
    this._tsLogger = tsLogger
  }
  hasLevel(level: ts.server.LogLevel): boolean {
    return this._tsLogger.hasLevel(level)
  }
  loggingEnabled(): boolean {
    return this._tsLogger.loggingEnabled()
  }
  perftrc(s: string): void {
    this._tsLogger.perftrc(s)
  }
  startGroup(): void {
    this._tsLogger.startGroup()
  }
  endGroup(): void {
    this._tsLogger.endGroup()
  }
  msg(s: string, type?: ts.server.Msg): void {
    this._tsLogger.msg(`[TGAS-LOCAL-PLUGIN] ${s}`, type)
  }
  getLogFileName(): string | undefined {
    return this._tsLogger.getLogFileName()
  }
  info(msg: string) {
    this._tsLogger.info(`[TGAS-LOCAL-PLUGIN] ${msg}`)
  }
  close(): void {
    this._tsLogger.close()
  }
}
