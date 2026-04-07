type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: any;
  stack?: string;
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';
  private logHistory: LogEntry[] = [];
  private maxHistorySize = 100;

  private createLogEntry(
    level: LogLevel,
    category: string,
    message: string,
    data?: any,
    error?: Error
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
      stack: error?.stack
    };
  }

  private addToHistory(entry: LogEntry) {
    this.logHistory.push(entry);
    if (this.logHistory.length > this.maxHistorySize) {
      this.logHistory.shift();
    }
  }

  private formatMessage(entry: LogEntry): string {
    const emoji = {
      debug: '🔍',
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌'
    };
    return `${emoji[entry.level]} [${entry.category}] ${entry.message}`;
  }

  debug(category: string, message: string, data?: any) {
    const entry = this.createLogEntry('debug', category, message, data);
    this.addToHistory(entry);
    if (this.isDevelopment) {
      console.log(this.formatMessage(entry), data || '');
    }
  }

  info(category: string, message: string, data?: any) {
    const entry = this.createLogEntry('info', category, message, data);
    this.addToHistory(entry);
    console.info(this.formatMessage(entry), data || '');
  }

  warn(category: string, message: string, data?: any) {
    const entry = this.createLogEntry('warn', category, message, data);
    this.addToHistory(entry);
    console.warn(this.formatMessage(entry), data || '');
  }

  error(category: string, message: string, error?: Error, data?: any) {
    const entry = this.createLogEntry('error', category, message, data, error);
    this.addToHistory(entry);
    console.error(this.formatMessage(entry), error || '', data || '');
    
    // Store critical errors
    this.persistError(entry);
  }

  private persistError(entry: LogEntry) {
    try {
      const errors = JSON.parse(localStorage.getItem('app_errors') || '[]');
      errors.push(entry);
      localStorage.setItem('app_errors', JSON.stringify(errors.slice(-50)));
    } catch (e) {
      console.error('Failed to persist error:', e);
    }
  }

  getHistory(): LogEntry[] {
    return [...this.logHistory];
  }

  clearHistory() {
    this.logHistory = [];
  }

  exportLogs(): string {
    return JSON.stringify(this.logHistory, null, 2);
  }
}

export const logger = new Logger();
export default logger;
