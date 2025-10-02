import { jest } from '@jest/globals';
import { startReminderWorker } from '../workers/reminderWorker.js';
import { reminderQueue } from '../queues/reminderQueue.js';
import { reminderController } from '../../controllers/reminderController.js';
import { logger } from '../../utils/logger.js';

// Mock dependencies
jest.mock('../queues/reminderQueue.js');
jest.mock('../../controllers/reminderController.js');
jest.mock('../../utils/logger.js');

describe('ReminderWorker', () => {
  let mockProcess;
  let processorFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock queue.process
    mockProcess = jest.fn((jobName, processor) => {
      processorFunction = processor;
    });

    reminderQueue.queue = {
      process: mockProcess,
    };

    reminderController.sendReminder = jest.fn();
  });

  describe('startReminderWorker', () => {
    it('should register process handler for reminders', () => {
      startReminderWorker();

      expect(mockProcess).toHaveBeenCalledWith(
        'send-reminder',
        expect.any(Function)
      );
    });

    it('should log worker started', () => {
      startReminderWorker();

      expect(logger.info).toHaveBeenCalledWith('Reminder worker started');
    });

    it('should register exactly one processor', () => {
      startReminderWorker();

      expect(mockProcess).toHaveBeenCalledTimes(1);
    });
  });

  describe('processor function', () => {
    beforeEach(() => {
      startReminderWorker();
      reminderController.sendReminder.mockResolvedValue(true);
    });

    it('should process reminder job successfully', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-123',
          isSnoozed: false,
        },
      };

      const result = await processorFunction(mockJob);

      expect(result).toEqual({
        success: true,
        scheduleId: 'schedule-123',
      });
    });

    it('should extract scheduleId and isSnoozed from job data', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-456',
          isSnoozed: true,
        },
      };

      await processorFunction(mockJob);

      expect(reminderController.sendReminder).toHaveBeenCalledWith(
        'schedule-456'
      );
    });

    it('should log processing start with job details', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-789',
          isSnoozed: false,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        {
          scheduleId: 'schedule-789',
          isSnoozed: false,
        }
      );
    });

    it('should call reminder controller', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-111',
          isSnoozed: false,
        },
      };

      await processorFunction(mockJob);

      expect(reminderController.sendReminder).toHaveBeenCalledWith(
        'schedule-111'
      );
    });

    it('should handle snoozed reminders', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-snoozed',
          isSnoozed: true,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.objectContaining({
          isSnoozed: true,
        })
      );
    });

    it('should handle non-snoozed reminders', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-regular',
          isSnoozed: false,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.objectContaining({
          isSnoozed: false,
        })
      );
    });

    it('should return success result', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-success',
          isSnoozed: false,
        },
      };

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(true);
      expect(result.scheduleId).toBe('schedule-success');
    });

    it('should not include isSnoozed in result', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-test',
          isSnoozed: true,
        },
      };

      const result = await processorFunction(mockJob);

      expect(result).not.toHaveProperty('isSnoozed');
    });

    it('should handle controller errors', async () => {
      const error = new Error('Controller failed');
      reminderController.sendReminder.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-error',
          isSnoozed: false,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow('Controller failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Reminder worker error:',
        error
      );
    });

    it('should propagate errors for retry mechanism', async () => {
      const error = new Error('Temporary failure');
      reminderController.sendReminder.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-retry',
          isSnoozed: false,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow('Temporary failure');
    });

    it('should log error before throwing', async () => {
      const error = new Error('Test error');
      reminderController.sendReminder.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-log',
          isSnoozed: false,
        },
      };

      try {
        await processorFunction(mockJob);
      } catch (e) {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        'Reminder worker error:',
        error
      );
    });

    it('should handle missing scheduleId', async () => {
      const mockJob = {
        data: {
          isSnoozed: false,
        },
      };

      await processorFunction(mockJob);

      expect(reminderController.sendReminder).toHaveBeenCalledWith(undefined);
    });

    it('should handle missing isSnoozed', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-no-flag',
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.objectContaining({
          isSnoozed: undefined,
        })
      );
    });

    it('should handle empty job data', async () => {
      const mockJob = {
        data: {},
      };

      await processorFunction(mockJob);

      expect(reminderController.sendReminder).toHaveBeenCalledWith(undefined);
    });
  });

  describe('error scenarios', () => {
    beforeEach(() => {
      startReminderWorker();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection lost');
      reminderController.sendReminder.mockRejectedValue(dbError);

      const mockJob = {
        data: {
          scheduleId: 'schedule-db',
          isSnoozed: false,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Database connection lost'
      );
    });

    it('should handle WhatsApp API errors', async () => {
      const apiError = new Error('WhatsApp service unavailable');
      reminderController.sendReminder.mockRejectedValue(apiError);

      const mockJob = {
        data: {
          scheduleId: 'schedule-api',
          isSnoozed: false,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'WhatsApp service unavailable'
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Operation timeout');
      reminderController.sendReminder.mockRejectedValue(timeoutError);

      const mockJob = {
        data: {
          scheduleId: 'schedule-timeout',
          isSnoozed: false,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Operation timeout'
      );
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid schedule');
      reminderController.sendReminder.mockRejectedValue(validationError);

      const mockJob = {
        data: {
          scheduleId: 'invalid-schedule',
          isSnoozed: false,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Invalid schedule'
      );
    });

    it('should handle network errors', async () => {
      const networkError = new Error('Network unreachable');
      reminderController.sendReminder.mockRejectedValue(networkError);

      const mockJob = {
        data: {
          scheduleId: 'schedule-network',
          isSnoozed: false,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Network unreachable'
      );
    });
  });

  describe('integration tests', () => {
    beforeEach(() => {
      startReminderWorker();
      reminderController.sendReminder.mockResolvedValue(true);
    });

    it('should process multiple jobs sequentially', async () => {
      const jobs = [
        { data: { scheduleId: 'schedule-1', isSnoozed: false } },
        { data: { scheduleId: 'schedule-2', isSnoozed: true } },
        { data: { scheduleId: 'schedule-3', isSnoozed: false } },
      ];

      for (const job of jobs) {
        await processorFunction(job);
      }

      expect(reminderController.sendReminder).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure', async () => {
      reminderController.sendReminder
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(true);

      const jobs = [
        { data: { scheduleId: 'schedule-1', isSnoozed: false } },
        { data: { scheduleId: 'schedule-2', isSnoozed: false } },
        { data: { scheduleId: 'schedule-3', isSnoozed: false } },
      ];

      const result1 = await processorFunction(jobs[0]);
      expect(result1.success).toBe(true);

      await expect(processorFunction(jobs[1])).rejects.toThrow('Failed');

      const result3 = await processorFunction(jobs[2]);
      expect(result3.success).toBe(true);
    });

    it('should log all processing attempts', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-log-test',
          isSnoozed: false,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.any(Object)
      );
    });

    it('should maintain job data integrity', async () => {
      const jobData = {
        scheduleId: 'schedule-integrity',
        isSnoozed: true,
        additionalData: 'should be ignored',
      };

      const mockJob = {
        data: jobData,
      };

      const result = await processorFunction(mockJob);

      expect(result.scheduleId).toBe(jobData.scheduleId);
      expect(result).not.toHaveProperty('isSnoozed');
      expect(result).not.toHaveProperty('additionalData');
    });

    it('should handle both snoozed and regular reminders', async () => {
      const snoozedJob = {
        data: {
          scheduleId: 'schedule-snoozed',
          isSnoozed: true,
        },
      };

      const regularJob = {
        data: {
          scheduleId: 'schedule-regular',
          isSnoozed: false,
        },
      };

      await processorFunction(snoozedJob);
      await processorFunction(regularJob);

      expect(reminderController.sendReminder).toHaveBeenCalledTimes(2);
      expect(reminderController.sendReminder).toHaveBeenCalledWith('schedule-snoozed');
      expect(reminderController.sendReminder).toHaveBeenCalledWith('schedule-regular');
    });
  });

  describe('performance tests', () => {
    beforeEach(() => {
      startReminderWorker();
      reminderController.sendReminder.mockResolvedValue(true);
    });

    it('should process job quickly', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-perf',
          isSnoozed: false,
        },
      };

      const startTime = Date.now();
      await processorFunction(mockJob);
      const duration = Date.now() - startTime;

      // Should complete in reasonable time (< 100ms for mock)
      expect(duration).toBeLessThan(100);
    });

    it('should handle rapid successive jobs', async () => {
      const jobs = Array.from({ length: 10 }, (_, i) => ({
        data: {
          scheduleId: `schedule-${i}`,
          isSnoozed: i % 2 === 0,
        },
      }));

      const results = await Promise.all(
        jobs.map((job) => processorFunction(job))
      );

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should handle high volume of reminders', async () => {
      const jobs = Array.from({ length: 100 }, (_, i) => ({
        data: {
          scheduleId: `schedule-${i}`,
          isSnoozed: false,
        },
      }));

      for (const job of jobs) {
        await processorFunction(job);
      }

      expect(reminderController.sendReminder).toHaveBeenCalledTimes(100);
    });
  });

  describe('worker initialization', () => {
    it('should be idempotent - can be called multiple times', () => {
      startReminderWorker();
      startReminderWorker();
      startReminderWorker();

      // Each call registers a new processor
      expect(mockProcess).toHaveBeenCalledTimes(3);
    });

    it('should register correct job type', () => {
      startReminderWorker();

      const jobType = mockProcess.mock.calls[0][0];
      expect(jobType).toBe('send-reminder');
    });

    it('should provide async processor function', () => {
      startReminderWorker();

      const processor = mockProcess.mock.calls[0][1];
      expect(processor).toBeInstanceOf(Function);
      expect(processor.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('logging behavior', () => {
    beforeEach(() => {
      startReminderWorker();
    });

    it('should log processing start', async () => {
      reminderController.sendReminder.mockResolvedValue(true);

      const mockJob = {
        data: {
          scheduleId: 'schedule-logging',
          isSnoozed: false,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.any(Object)
      );
    });

    it('should include scheduleId in logs', async () => {
      reminderController.sendReminder.mockResolvedValue(true);

      const mockJob = {
        data: {
          scheduleId: 'schedule-with-id',
          isSnoozed: false,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.objectContaining({
          scheduleId: 'schedule-with-id',
        })
      );
    });

    it('should include isSnoozed flag in logs', async () => {
      reminderController.sendReminder.mockResolvedValue(true);

      const mockJob = {
        data: {
          scheduleId: 'schedule-123',
          isSnoozed: true,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.objectContaining({
          isSnoozed: true,
        })
      );
    });

    it('should log errors with full error object', async () => {
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';
      error.details = { additional: 'info' };

      reminderController.sendReminder.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-err',
          isSnoozed: false,
        },
      };

      try {
        await processorFunction(mockJob);
      } catch (e) {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        'Reminder worker error:',
        error
      );
    });

    it('should differentiate between snoozed and regular in logs', async () => {
      reminderController.sendReminder.mockResolvedValue(true);

      const snoozedJob = {
        data: {
          scheduleId: 'snoozed',
          isSnoozed: true,
        },
      };

      const regularJob = {
        data: {
          scheduleId: 'regular',
          isSnoozed: false,
        },
      };

      await processorFunction(snoozedJob);
      await processorFunction(regularJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.objectContaining({ isSnoozed: true })
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Processing reminder',
        expect.objectContaining({ isSnoozed: false })
      );
    });
  });

  describe('controller interaction', () => {
    beforeEach(() => {
      startReminderWorker();
      reminderController.sendReminder.mockResolvedValue(true);
    });

    it('should call controller with only scheduleId', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-test',
          isSnoozed: true,
        },
      };

      await processorFunction(mockJob);

      expect(reminderController.sendReminder).toHaveBeenCalledWith('schedule-test');
      expect(reminderController.sendReminder).not.toHaveBeenCalledWith(
        expect.any(String),
        expect.anything()
      );
    });

    it('should not pass isSnoozed to controller', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-123',
          isSnoozed: true,
        },
      };

      await processorFunction(mockJob);

      const callArgs = reminderController.sendReminder.mock.calls[0];
      expect(callArgs).toHaveLength(1);
      expect(callArgs[0]).toBe('schedule-123');
    });
  });
});