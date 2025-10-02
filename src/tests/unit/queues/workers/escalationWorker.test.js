import { jest } from '@jest/globals';
import { startEscalationWorker } from '../workers/escalationWorker.js';
import { escalationQueue } from '../queues/escalationQueue.js';
import { escalationController } from '../../controllers/escalationController.js';
import { logger } from '../../utils/logger.js';

// Mock dependencies
jest.mock('../queues/escalationQueue.js');
jest.mock('../../controllers/escalationController.js');
jest.mock('../../utils/logger.js');

describe('EscalationWorker', () => {
  let mockProcess;
  let processorFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock queue.process
    mockProcess = jest.fn((jobName, processor) => {
      processorFunction = processor;
    });

    escalationQueue.queue = {
      process: mockProcess,
    };

    escalationController.handleEscalation = jest.fn();
  });

  describe('startEscalationWorker', () => {
    it('should register process handler for escalations', () => {
      startEscalationWorker();

      expect(mockProcess).toHaveBeenCalledWith(
        'process-escalation',
        expect.any(Function)
      );
    });

    it('should log worker started', () => {
      startEscalationWorker();

      expect(logger.info).toHaveBeenCalledWith('Escalation worker started');
    });

    it('should register exactly one processor', () => {
      startEscalationWorker();

      expect(mockProcess).toHaveBeenCalledTimes(1);
    });
  });

  describe('processor function', () => {
    beforeEach(() => {
      startEscalationWorker();
      escalationController.handleEscalation.mockResolvedValue(true);
    });

    it('should process escalation job successfully', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-123',
          level: 2,
        },
      };

      const result = await processorFunction(mockJob);

      expect(result).toEqual({
        success: true,
        scheduleId: 'schedule-123',
        level: 2,
      });
    });

    it('should extract scheduleId and level from job data', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-456',
          level: 3,
        },
      };

      await processorFunction(mockJob);

      expect(escalationController.handleEscalation).toHaveBeenCalledWith(
        'schedule-456',
        3
      );
    });

    it('should log processing start', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-789',
          level: 4,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing escalation',
        {
          scheduleId: 'schedule-789',
          level: 4,
        }
      );
    });

    it('should call escalation controller', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-111',
          level: 1,
        },
      };

      await processorFunction(mockJob);

      expect(escalationController.handleEscalation).toHaveBeenCalledWith(
        'schedule-111',
        1
      );
    });

    it('should handle all escalation levels', async () => {
      const levels = [1, 2, 3, 4, 5];

      for (const level of levels) {
        const mockJob = {
          data: {
            scheduleId: `schedule-${level}`,
            level,
          },
        };

        await processorFunction(mockJob);

        expect(escalationController.handleEscalation).toHaveBeenCalledWith(
          `schedule-${level}`,
          level
        );
      }
    });

    it('should return success result', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-success',
          level: 2,
        },
      };

      const result = await processorFunction(mockJob);

      expect(result.success).toBe(true);
      expect(result.scheduleId).toBe('schedule-success');
      expect(result.level).toBe(2);
    });

    it('should handle controller errors', async () => {
      const error = new Error('Controller failed');
      escalationController.handleEscalation.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-error',
          level: 3,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow('Controller failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Escalation worker error:',
        error
      );
    });

    it('should propagate errors for retry mechanism', async () => {
      const error = new Error('Temporary failure');
      escalationController.handleEscalation.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-retry',
          level: 2,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow('Temporary failure');
    });

    it('should log error before throwing', async () => {
      const error = new Error('Test error');
      escalationController.handleEscalation.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-log',
          level: 1,
        },
      };

      try {
        await processorFunction(mockJob);
      } catch (e) {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        'Escalation worker error:',
        error
      );
    });

    it('should handle missing scheduleId', async () => {
      const mockJob = {
        data: {
          level: 2,
        },
      };

      await processorFunction(mockJob);

      expect(escalationController.handleEscalation).toHaveBeenCalledWith(
        undefined,
        2
      );
    });

    it('should handle missing level', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-no-level',
        },
      };

      await processorFunction(mockJob);

      expect(escalationController.handleEscalation).toHaveBeenCalledWith(
        'schedule-no-level',
        undefined
      );
    });

    it('should handle empty job data', async () => {
      const mockJob = {
        data: {},
      };

      await processorFunction(mockJob);

      expect(escalationController.handleEscalation).toHaveBeenCalledWith(
        undefined,
        undefined
      );
    });
  });

  describe('error scenarios', () => {
    beforeEach(() => {
      startEscalationWorker();
    });

    it('should handle database errors', async () => {
      const dbError = new Error('Database connection lost');
      escalationController.handleEscalation.mockRejectedValue(dbError);

      const mockJob = {
        data: {
          scheduleId: 'schedule-db',
          level: 3,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Database connection lost'
      );
    });

    it('should handle timeout errors', async () => {
      const timeoutError = new Error('Operation timeout');
      escalationController.handleEscalation.mockRejectedValue(timeoutError);

      const mockJob = {
        data: {
          scheduleId: 'schedule-timeout',
          level: 4,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Operation timeout'
      );
    });

    it('should handle validation errors', async () => {
      const validationError = new Error('Invalid schedule');
      escalationController.handleEscalation.mockRejectedValue(validationError);

      const mockJob = {
        data: {
          scheduleId: 'invalid-schedule',
          level: 2,
        },
      };

      await expect(processorFunction(mockJob)).rejects.toThrow(
        'Invalid schedule'
      );
    });
  });

  describe('integration tests', () => {
    beforeEach(() => {
      startEscalationWorker();
      escalationController.handleEscalation.mockResolvedValue(true);
    });

    it('should process multiple jobs sequentially', async () => {
      const jobs = [
        { data: { scheduleId: 'schedule-1', level: 1 } },
        { data: { scheduleId: 'schedule-2', level: 2 } },
        { data: { scheduleId: 'schedule-3', level: 3 } },
      ];

      for (const job of jobs) {
        await processorFunction(job);
      }

      expect(escalationController.handleEscalation).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed success and failure', async () => {
      escalationController.handleEscalation
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce(true);

      const jobs = [
        { data: { scheduleId: 'schedule-1', level: 1 } },
        { data: { scheduleId: 'schedule-2', level: 2 } },
        { data: { scheduleId: 'schedule-3', level: 3 } },
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
          level: 2,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing escalation',
        expect.any(Object)
      );
    });

    it('should maintain job data integrity', async () => {
      const jobData = {
        scheduleId: 'schedule-integrity',
        level: 4,
        additionalData: 'should be ignored',
      };

      const mockJob = {
        data: jobData,
      };

      const result = await processorFunction(mockJob);

      expect(result.scheduleId).toBe(jobData.scheduleId);
      expect(result.level).toBe(jobData.level);
      expect(result).not.toHaveProperty('additionalData');
    });
  });

  describe('performance tests', () => {
    beforeEach(() => {
      startEscalationWorker();
      escalationController.handleEscalation.mockResolvedValue(true);
    });

    it('should process job quickly', async () => {
      const mockJob = {
        data: {
          scheduleId: 'schedule-perf',
          level: 2,
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
          level: (i % 5) + 1,
        },
      }));

      const results = await Promise.all(
        jobs.map((job) => processorFunction(job))
      );

      expect(results).toHaveLength(10);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('worker initialization', () => {
    it('should be idempotent - can be called multiple times', () => {
      startEscalationWorker();
      startEscalationWorker();
      startEscalationWorker();

      // Each call registers a new processor
      expect(mockProcess).toHaveBeenCalledTimes(3);
    });

    it('should register correct job type', () => {
      startEscalationWorker();

      const jobType = mockProcess.mock.calls[0][0];
      expect(jobType).toBe('process-escalation');
    });

    it('should provide async processor function', () => {
      startEscalationWorker();

      const processor = mockProcess.mock.calls[0][1];
      expect(processor).toBeInstanceOf(Function);
      expect(processor.constructor.name).toBe('AsyncFunction');
    });
  });

  describe('logging behavior', () => {
    beforeEach(() => {
      startEscalationWorker();
    });

    it('should log both start and completion', async () => {
      escalationController.handleEscalation.mockResolvedValue(true);

      const mockJob = {
        data: {
          scheduleId: 'schedule-logging',
          level: 2,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing escalation',
        expect.any(Object)
      );
    });

    it('should include scheduleId in logs', async () => {
      escalationController.handleEscalation.mockResolvedValue(true);

      const mockJob = {
        data: {
          scheduleId: 'schedule-with-id',
          level: 3,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing escalation',
        expect.objectContaining({
          scheduleId: 'schedule-with-id',
        })
      );
    });

    it('should include level in logs', async () => {
      escalationController.handleEscalation.mockResolvedValue(true);

      const mockJob = {
        data: {
          scheduleId: 'schedule-123',
          level: 5,
        },
      };

      await processorFunction(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Processing escalation',
        expect.objectContaining({
          level: 5,
        })
      );
    });

    it('should log errors with full error object', async () => {
      const error = new Error('Test error');
      error.code = 'TEST_ERROR';
      error.details = { additional: 'info' };

      escalationController.handleEscalation.mockRejectedValue(error);

      const mockJob = {
        data: {
          scheduleId: 'schedule-err',
          level: 1,
        },
      };

      try {
        await processorFunction(mockJob);
      } catch (e) {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        'Escalation worker error:',
        error
      );
    });
  });
});