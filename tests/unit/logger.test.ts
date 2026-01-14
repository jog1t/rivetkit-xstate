import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/utils/logger';

describe('Logger', () => {
  let consoleSpy: {
    log: ReturnType<typeof vi.spyOn>;
    error: ReturnType<typeof vi.spyOn>;
    warn: ReturnType<typeof vi.spyOn>;
    info: ReturnType<typeof vi.spyOn>;
  };

  beforeEach(() => {
    consoleSpy = {
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('when debug is enabled', () => {
    it('should log messages', () => {
      const logger = new Logger(true);
      logger.log('test message');

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[rivetkit-xstate]',
        'test message'
      );
    });

    it('should log errors', () => {
      const logger = new Logger(true);
      const error = new Error('test error');
      logger.error('error occurred', error);

      expect(consoleSpy.error).toHaveBeenCalledWith(
        '[rivetkit-xstate]',
        'error occurred',
        error
      );
    });

    it('should log warnings', () => {
      const logger = new Logger(true);
      logger.warn('warning message');

      expect(consoleSpy.warn).toHaveBeenCalledWith(
        '[rivetkit-xstate]',
        'warning message'
      );
    });

    it('should log info', () => {
      const logger = new Logger(true);
      logger.info('info message');

      expect(consoleSpy.info).toHaveBeenCalledWith(
        '[rivetkit-xstate]',
        'info message'
      );
    });

    it('should use custom prefix', () => {
      const logger = new Logger(true, '[custom]');
      logger.log('test');

      expect(consoleSpy.log).toHaveBeenCalledWith('[custom]', 'test');
    });

    it('should handle multiple arguments', () => {
      const logger = new Logger(true);
      logger.log('msg', 1, { key: 'value' }, [1, 2, 3]);

      expect(consoleSpy.log).toHaveBeenCalledWith(
        '[rivetkit-xstate]',
        'msg',
        1,
        { key: 'value' },
        [1, 2, 3]
      );
    });
  });

  describe('when debug is disabled', () => {
    it('should not log messages', () => {
      const logger = new Logger(false);
      logger.log('test message');

      expect(consoleSpy.log).not.toHaveBeenCalled();
    });

    it('should not log errors', () => {
      const logger = new Logger(false);
      logger.error('error message');

      expect(consoleSpy.error).not.toHaveBeenCalled();
    });

    it('should not log warnings', () => {
      const logger = new Logger(false);
      logger.warn('warning message');

      expect(consoleSpy.warn).not.toHaveBeenCalled();
    });

    it('should not log info', () => {
      const logger = new Logger(false);
      logger.info('info message');

      expect(consoleSpy.info).not.toHaveBeenCalled();
    });
  });
});
