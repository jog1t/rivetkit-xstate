/**
 * Simple logger utility for debug mode
 */
export class Logger {
  constructor(
    private enabled: boolean,
    private prefix: string = '[rivetkit-xstate]'
  ) {}

  log(...args: unknown[]): void {
    if (this.enabled) {
      console.log(this.prefix, ...args);
    }
  }

  error(...args: unknown[]): void {
    if (this.enabled) {
      console.error(this.prefix, ...args);
    }
  }

  warn(...args: unknown[]): void {
    if (this.enabled) {
      console.warn(this.prefix, ...args);
    }
  }

  info(...args: unknown[]): void {
    if (this.enabled) {
      console.info(this.prefix, ...args);
    }
  }
}
