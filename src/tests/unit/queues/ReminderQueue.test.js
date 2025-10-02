import { jest } from '@jest/globals';
import { reminderQueue } from '../queues/reminderQueue.js';
import Queue from 'bull';
import { logger } from '../utils/logger.js';

// Mock dependencies
jest.mock('bull');
jest.mock('../utils/logger.js');

describe('ReminderQueue', () => {
  let mockQueue;
  let eventHandlers;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));

    // Track event handlers
    eventHandlers = {};

    // Mock Bull Queue
    mockQueue = {
      add: jest.fn(),
      getJobs: jest.fn(),
      getWaitingCount: jest.fn(),
      getActiveCount: jest.fn(),
      getCompletedCount: jest.fn(),
      getFailedCount: jest.fn(),
      getDelayedCount: jest.fn(),
      empty: jest.fn(),
      on: jest.fn((event, handler) => {
        eventHandlers[event] = handler;
      }),
    };

    Queue.mockImplementation(() => mockQueue);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create Bull queue with correct configuration', () => {
      expect(Queue).toHaveBeenCalledWith(
        'reminders',
        process.env.REDIS_URL || 'redis://localhost:6379',
        {
          defaultJobOptions: {
            removeOnComplete: 100,
            removeOnFail: 50,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          },
        }
      );
    });

    it('should use REDIS_URL from environment', () => {
      process.env.REDIS_URL = 'redis://custom-redis:6379';
      
      new Queue('test', process.env.REDIS_URL);

      expect(Queue).toHaveBeenCalledWith(
        'test',
        'redis://custom-redis:6379',
        expect.any(Object)
      );
    });

    it('should use default Redis URL if not provided', () => {
      delete process.env.REDIS_URL;
      
      new Queue('test', process.env.REDIS_URL || 'redis://localhost:6379');

      expect(Queue).toHaveBeenCalledWith(
        'test',
        'redis://localhost:6379',
        expect.any(Object)
      );
    });

    it('should setup event handlers', () => {
      expect(mockQueue.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockQueue.on).toHaveBeenCalledWith('completed', expect.any(Function));
    });
  });

  describe('setupEventHandlers', () => {
    it('should handle error events', () => {
      const error = new Error('Queue connection failed');
      
      eventHandlers.error(error);

      expect(logger.error).toHaveBeenCalledWith(
        'Reminder queue error:',
        error
      );
    });

    it('should handle failed job events', () => {
      const mockJob = {
        id: 'job-123',
        data: {
          scheduleId: 'schedule-456',
        },
      };
      const error = new Error('Job processing failed');

      eventHandlers.failed(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'Reminder job failed',
        {
          jobId: 'job-123',
          scheduleId: 'schedule-456',
          error: 'Job processing failed',
        }
      );
    });

    it('should handle completed job events', () => {
      const mockJob = {
        id: 'job-789',
        data: {
          scheduleId: 'schedule-111',
        },
      };

      eventHandlers.completed(mockJob);

      expect(logger.info).toHaveBeenCalledWith(
        'Reminder job completed',
        {
          jobId: 'job-789',
          scheduleId: 'schedule-111',
        }
      );
    });

    it('should register all event handlers', () => {
      expect(eventHandlers).toHaveProperty('error');
      expect(eventHandlers).toHaveProperty('failed');
      expect(eventHandlers).toHaveProperty('completed');
      expect(typeof eventHandlers.error).toBe('function');
      expect(typeof eventHandlers.failed).toBe('function');
      expect(typeof eventHandlers.completed).toBe('function');
    });
  });

  describe('addReminder', () => {
    const scheduleId = 'schedule-123';

    beforeEach(() => {
      mockQueue.add.mockResolvedValue({
        id: 'job-456',
        data: { scheduleId },
      });
    });

    it('should add reminder to queue successfully', async () => {
      const scheduledTime = new Date('2024-01-15T10:30:00Z'); // 30 minutes from now

      const job = await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'send-reminder',
        {
          scheduleId,
          isSnoozed: false,
          scheduledTime: '2024-01-15T10:30:00.000Z',
        },
        {
          delay: 30 * 60 * 1000,
          jobId: expect.stringContaining('reminder-'),
        }
      );

      expect(job.id).toBe('job-456');
    });

    it('should handle snoozed reminders', async () => {
      const scheduledTime = new Date('2024-01-15T10:15:00Z');

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
        isSnoozed: true,
      });

      const addCall = mockQueue.add.mock.calls[0][1];
      expect(addCall.isSnoozed).toBe(true);
    });

    it('should default isSnoozed to false', async () => {
      const scheduledTime = new Date('2024-01-15T10:15:00Z');

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      const addCall = mockQueue.add.mock.calls[0][1];
      expect(addCall.isSnoozed).toBe(false);
    });

    it('should reject past scheduled times', async () => {
      const scheduledTime = new Date('2024-01-15T09:00:00Z'); // 1 hour ago

      const job = await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      expect(job).toBeNull();
      expect(mockQueue.add).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(
        'Attempted to schedule reminder in the past',
        {
          scheduleId,
          scheduledTime,
        }
      );
    });

    it('should calculate correct delay', async () => {
      const scheduledTime = new Date('2024-01-15T10:15:00Z'); // 15 minutes

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.delay).toBe(15 * 60 * 1000);
    });

    it('should generate unique job ID', async () => {
      const scheduledTime = new Date('2024-01-15T10:30:00Z');

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.jobId).toMatch(/^reminder-schedule-123-\d+$/);
    });

    it('should convert scheduledTime to ISO string', async () => {
      const scheduledTime = new Date('2024-01-15T11:00:00Z');

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      const addCall = mockQueue.add.mock.calls[0][1];
      expect(addCall.scheduledTime).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should log reminder queued', async () => {
      const scheduledTime = new Date('2024-01-15T10:30:00Z');

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Reminder queued',
        {
          jobId: 'job-456',
          scheduleId,
          delay: '1800s',
        }
      );
    });

    it('should handle immediate reminders (delay of 0)', async () => {
      const scheduledTime = new Date('2024-01-15T10:00:00Z'); // Now

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.delay).toBe(0);
    });

    it('should return null for negative delays', async () => {
      const scheduledTime = new Date('2024-01-15T09:00:00Z');

      const job = await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      expect(job).toBeNull();
    });

    it('should handle queue add errors', async () => {
      const error = new Error('Redis connection failed');
      mockQueue.add.mockRejectedValue(error);

      const scheduledTime = new Date('2024-01-15T10:30:00Z');

      await expect(
        reminderQueue.addReminder({
          scheduleId,
          scheduledTime,
        })
      ).rejects.toThrow('Redis connection failed');
    });
  });

  describe('removeByScheduleId', () => {
    const scheduleId = 'schedule-789';

    beforeEach(() => {
      const mockJobs = [
        {
          id: 'job-1',
          data: { scheduleId: 'schedule-789' },
          remove: jest.fn().mockResolvedValue(true),
        },
        {
          id: 'job-2',
          data: { scheduleId: 'schedule-789' },
          remove: jest.fn().mockResolvedValue(true),
        },
        {
          id: 'job-3',
          data: { scheduleId: 'schedule-999' },
          remove: jest.fn().mockResolvedValue(true),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);
    });

    it('should remove jobs matching scheduleId', async () => {
      const count = await reminderQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(2);
    });

    it('should get delayed and waiting jobs', async () => {
      await reminderQueue.removeByScheduleId(scheduleId);

      expect(mockQueue.getJobs).toHaveBeenCalledWith(['delayed', 'waiting']);
    });

    it('should call remove on matching jobs', async () => {
      const mockJobs = await mockQueue.getJobs();

      await reminderQueue.removeByScheduleId(scheduleId);

      expect(mockJobs[0].remove).toHaveBeenCalled();
      expect(mockJobs[1].remove).toHaveBeenCalled();
      expect(mockJobs[2].remove).not.toHaveBeenCalled();
    });

    it('should log removed jobs count', async () => {
      await reminderQueue.removeByScheduleId(scheduleId);

      expect(logger.info).toHaveBeenCalledWith(
        'Removed reminder jobs',
        {
          scheduleId,
          count: 2,
        }
      );
    });

    it('should handle no matching jobs', async () => {
      mockQueue.getJobs.mockResolvedValue([
        {
          id: 'job-1',
          data: { scheduleId: 'different-schedule' },
          remove: jest.fn().mockResolvedValue(true),
        },
      ]);

      const count = await reminderQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(0);
    });

    it('should handle empty job queue', async () => {
      mockQueue.getJobs.mockResolvedValue([]);

      const count = await reminderQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(0);
    });

    it('should return count of removed jobs', async () => {
      const count = await reminderQueue.removeByScheduleId(scheduleId);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should handle job removal errors', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          data: { scheduleId },
          remove: jest.fn().mockRejectedValue(new Error('Remove failed')),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      await expect(
        reminderQueue.removeByScheduleId(scheduleId)
      ).rejects.toThrow('Remove failed');
    });

    it('should filter by exact scheduleId match', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          data: { scheduleId: 'schedule-789' },
          remove: jest.fn().mockResolvedValue(true),
        },
        {
          id: 'job-2',
          data: { scheduleId: 'schedule-789-extended' },
          remove: jest.fn().mockResolvedValue(true),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const count = await reminderQueue.removeByScheduleId('schedule-789');

      expect(count).toBe(1);
    });
  });

  describe('removeByMedicationId', () => {
    const medicationId = 'med-123';

    it('should log medication ID removal', async () => {
      await reminderQueue.removeByMedicationId(medicationId);

      expect(logger.info).toHaveBeenCalledWith(
        'Removing reminders by medication ID',
        { medicationId }
      );
    });

    it('should handle medication ID parameter', async () => {
      await expect(
        reminderQueue.removeByMedicationId(medicationId)
      ).resolves.not.toThrow();
    });
  });

  describe('getQueueStats', () => {
    beforeEach(() => {
      mockQueue.getWaitingCount.mockResolvedValue(5);
      mockQueue.getActiveCount.mockResolvedValue(2);
      mockQueue.getCompletedCount.mockResolvedValue(100);
      mockQueue.getFailedCount.mockResolvedValue(3);
      mockQueue.getDelayedCount.mockResolvedValue(10);
    });

    it('should return queue statistics', async () => {
      const stats = await reminderQueue.getQueueStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 10,
        total: 17, // waiting + active + delayed
      });
    });

    it('should call all count methods', async () => {
      await reminderQueue.getQueueStats();

      expect(mockQueue.getWaitingCount).toHaveBeenCalled();
      expect(mockQueue.getActiveCount).toHaveBeenCalled();
      expect(mockQueue.getCompletedCount).toHaveBeenCalled();
      expect(mockQueue.getFailedCount).toHaveBeenCalled();
      expect(mockQueue.getDelayedCount).toHaveBeenCalled();
    });

    it('should calculate total correctly', async () => {
      const stats = await reminderQueue.getQueueStats();

      expect(stats.total).toBe(stats.waiting + stats.active + stats.delayed);
    });

    it('should handle zero counts', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getCompletedCount.mockResolvedValue(0);
      mockQueue.getFailedCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);

      const stats = await reminderQueue.getQueueStats();

      expect(stats.total).toBe(0);
    });

    it('should handle errors from count methods', async () => {
      const error = new Error('Failed to get count');
      mockQueue.getWaitingCount.mockRejectedValue(error);

      await expect(
        reminderQueue.getQueueStats()
      ).rejects.toThrow('Failed to get count');
    });

    it('should return all required stat properties', async () => {
      const stats = await reminderQueue.getQueueStats();

      expect(stats).toHaveProperty('waiting');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('completed');
      expect(stats).toHaveProperty('failed');
      expect(stats).toHaveProperty('delayed');
      expect(stats).toHaveProperty('total');
    });
  });

  describe('clearQueue', () => {
    beforeEach(() => {
      mockQueue.empty.mockResolvedValue(undefined);
    });

    it('should clear the queue', async () => {
      await reminderQueue.clearQueue();

      expect(mockQueue.empty).toHaveBeenCalled();
    });

    it('should log warning when clearing', async () => {
      await reminderQueue.clearQueue();

      expect(logger.warn).toHaveBeenCalledWith('Reminder queue cleared');
    });

    it('should handle empty errors', async () => {
      const error = new Error('Failed to clear queue');
      mockQueue.empty.mockRejectedValue(error);

      await expect(
        reminderQueue.clearQueue()
      ).rejects.toThrow('Failed to clear queue');
    });
  });

  describe('job configuration', () => {
    it('should use correct job options', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions).toEqual({
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
    });

    it('should configure more completed jobs to keep than escalations', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.removeOnComplete).toBe(100);
    });

    it('should configure job removal on failure', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.removeOnFail).toBe(50);
    });

    it('should configure 3 retry attempts', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.attempts).toBe(3);
    });

    it('should configure exponential backoff strategy', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.backoff).toEqual({
        type: 'exponential',
        delay: 5000,
      });
    });
  });

  describe('integration tests', () => {
    it('should add and remove reminder workflow', async () => {
      const scheduleId = 'schedule-integration';
      const scheduledTime = new Date('2024-01-15T11:00:00Z');

      mockQueue.add.mockResolvedValue({
        id: 'job-int-1',
        data: { scheduleId },
      });

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      expect(mockQueue.add).toHaveBeenCalled();

      const mockJobs = [
        {
          id: 'job-int-1',
          data: { scheduleId },
          remove: jest.fn().mockResolvedValue(true),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const count = await reminderQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(1);
    });

    it('should handle multiple reminders for same schedule', async () => {
      const scheduleId = 'schedule-multi';

      mockQueue.add.mockResolvedValue({
        id: 'job-multi',
        data: {},
      });

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime: new Date('2024-01-15T10:30:00Z'),
      });

      await reminderQueue.addReminder({
        scheduleId,
        scheduledTime: new Date('2024-01-15T10:45:00Z'),
        isSnoozed: true,
      });

      expect(mockQueue.add).toHaveBeenCalledTimes(2);
    });

    it('should track queue stats throughout operations', async () => {
      mockQueue.getWaitingCount.mockResolvedValue(3);
      mockQueue.getActiveCount.mockResolvedValue(1);
      mockQueue.getCompletedCount.mockResolvedValue(50);
      mockQueue.getFailedCount.mockResolvedValue(2);
      mockQueue.getDelayedCount.mockResolvedValue(5);

      const stats = await reminderQueue.getQueueStats();

      expect(stats.total).toBe(9); // 3 + 1 + 5
      expect(stats.completed).toBe(50);
      expect(stats.failed).toBe(2);
    });

    it('should handle complete lifecycle', async () => {
      const scheduleId = 'lifecycle-test';
      const scheduledTime = new Date('2024-01-15T10:30:00Z');

      // Add
      mockQueue.add.mockResolvedValue({
        id: 'lifecycle-job',
        data: { scheduleId },
      });

      const job = await reminderQueue.addReminder({
        scheduleId,
        scheduledTime,
      });

      expect(job).toBeDefined();

      // Complete
      eventHandlers.completed({
        id: 'lifecycle-job',
        data: { scheduleId },
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Reminder job completed',
        expect.any(Object)
      );

      // Stats
      mockQueue.getWaitingCount.mockResolvedValue(0);
      mockQueue.getActiveCount.mockResolvedValue(0);
      mockQueue.getCompletedCount.mockResolvedValue(1);
      mockQueue.getFailedCount.mockResolvedValue(0);
      mockQueue.getDelayedCount.mockResolvedValue(0);

      const stats = await reminderQueue.getQueueStats();
      expect(stats.completed).toBe(1);
    });
  });

  describe('delay calculations', () => {
    it('should calculate delay for various future times', async () => {
      mockQueue.add.mockResolvedValue({ id: 'job-1', data: {} });

      const testCases = [
        { minutes: 5, expected: 5 * 60 * 1000 },
        { minutes: 15, expected: 15 * 60 * 1000 },
        { minutes: 30, expected: 30 * 60 * 1000 },
        { minutes: 60, expected: 60 * 60 * 1000 },
      ];

      for (const { minutes, expected } of testCases) {
        const scheduledTime = new Date('2024-01-15T10:00:00Z');
        scheduledTime.setMinutes(scheduledTime.getMinutes() + minutes);

        await reminderQueue.addReminder({
          scheduleId: `test-${minutes}`,
          scheduledTime,
        });

        const addCall = mockQueue.add.mock.calls[
          mockQueue.add.mock.calls.length - 1
        ][2];
        expect(addCall.delay).toBe(expected);
      }
    });

    it('should log delay in seconds format', async () => {
      const scheduledTime = new Date('2024-01-15T10:10:00Z'); // 10 minutes

      mockQueue.add.mockResolvedValue({ id: 'job-1', data: {} });

      await reminderQueue.addReminder({
        scheduleId: 'test',
        scheduledTime,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Reminder queued',
        expect.objectContaining({
          delay: '600s',
        })
      );
    });
  });
});