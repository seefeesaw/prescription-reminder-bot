import { jest } from '@jest/globals';
import { escalationQueue } from '../queues/escalationQueue.js';
import Queue from 'bull';
import { logger } from '../utils/logger.js';

// Mock dependencies
jest.mock('bull');
jest.mock('../utils/logger.js');

describe('EscalationQueue', () => {
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
        'escalations',
        process.env.REDIS_URL || 'redis://localhost:6379',
        {
          defaultJobOptions: {
            removeOnComplete: 50,
            removeOnFail: 25,
            attempts: 2,
            backoff: {
              type: 'fixed',
              delay: 30000,
            },
          },
        }
      );
    });

    it('should use REDIS_URL from environment', () => {
      process.env.REDIS_URL = 'redis://custom-redis:6379';
      
      // Recreate to use new env variable
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
    });
  });

  describe('setupEventHandlers', () => {
    it('should handle error events', () => {
      const error = new Error('Queue connection failed');
      
      eventHandlers.error(error);

      expect(logger.error).toHaveBeenCalledWith(
        'Escalation queue error:',
        error
      );
    });

    it('should handle failed job events', () => {
      const mockJob = {
        id: 'job-123',
        data: {
          scheduleId: 'schedule-456',
          level: 3,
        },
      };
      const error = new Error('Job processing failed');

      eventHandlers.failed(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'Escalation job failed',
        {
          jobId: 'job-123',
          scheduleId: 'schedule-456',
          level: 3,
          error: 'Job processing failed',
        }
      );
    });

    it('should register error handler', () => {
      expect(eventHandlers).toHaveProperty('error');
      expect(typeof eventHandlers.error).toBe('function');
    });

    it('should register failed handler', () => {
      expect(eventHandlers).toHaveProperty('failed');
      expect(typeof eventHandlers.failed).toBe('function');
    });
  });

  describe('addEscalation', () => {
    const scheduleId = 'schedule-123';
    const level = 2;

    beforeEach(() => {
      mockQueue.add.mockResolvedValue({
        id: 'job-456',
        data: { scheduleId, level },
      });
    });

    it('should add escalation to queue successfully', async () => {
      const scheduledFor = new Date('2024-01-15T10:30:00Z'); // 30 minutes from now

      const job = await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      expect(mockQueue.add).toHaveBeenCalledWith(
        'process-escalation',
        {
          scheduleId,
          level,
          scheduledFor: '2024-01-15T10:30:00.000Z',
        },
        {
          delay: 30 * 60 * 1000, // 30 minutes in ms
          jobId: expect.stringContaining('escalation-'),
        }
      );

      expect(job.id).toBe('job-456');
    });

    it('should calculate correct delay', async () => {
      const scheduledFor = new Date('2024-01-15T10:15:00Z'); // 15 minutes from now

      await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.delay).toBe(15 * 60 * 1000); // 15 minutes in ms
    });

    it('should generate unique job ID', async () => {
      const scheduledFor = new Date('2024-01-15T10:30:00Z');

      await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.jobId).toMatch(/^escalation-schedule-123-2-\d+$/);
    });

    it('should convert scheduledFor to ISO string', async () => {
      const scheduledFor = new Date('2024-01-15T11:00:00Z');

      await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      const addCall = mockQueue.add.mock.calls[0][1];
      expect(addCall.scheduledFor).toBe('2024-01-15T11:00:00.000Z');
    });

    it('should log escalation queued', async () => {
      const scheduledFor = new Date('2024-01-15T10:30:00Z');

      await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Escalation queued',
        {
          jobId: 'job-456',
          scheduleId,
          level,
          delay: '1800s', // 30 minutes in seconds
        }
      );
    });

    it('should handle different escalation levels', async () => {
      const scheduledFor = new Date('2024-01-15T10:10:00Z');
      const levels = [1, 2, 3, 4, 5];

      for (const lvl of levels) {
        mockQueue.add.mockResolvedValue({
          id: `job-${lvl}`,
          data: { scheduleId, level: lvl },
        });

        await escalationQueue.addEscalation({
          scheduleId,
          level: lvl,
          scheduledFor,
        });
      }

      expect(mockQueue.add).toHaveBeenCalledTimes(5);
    });

    it('should handle immediate execution (delay of 0)', async () => {
      const scheduledFor = new Date('2024-01-15T10:00:00Z'); // Now

      await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.delay).toBe(0);
    });

    it('should handle negative delay (past time)', async () => {
      const scheduledFor = new Date('2024-01-15T09:00:00Z'); // 1 hour ago

      await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.delay).toBe(-60 * 60 * 1000); // Negative delay
    });

    it('should return job object', async () => {
      const scheduledFor = new Date('2024-01-15T10:30:00Z');

      const job = await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor,
      });

      expect(job).toHaveProperty('id');
      expect(job).toHaveProperty('data');
    });

    it('should handle queue add errors', async () => {
      const error = new Error('Redis connection failed');
      mockQueue.add.mockRejectedValue(error);

      const scheduledFor = new Date('2024-01-15T10:30:00Z');

      await expect(
        escalationQueue.addEscalation({
          scheduleId,
          level,
          scheduledFor,
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
          data: { scheduleId: 'schedule-789', level: 1 },
          remove: jest.fn().mockResolvedValue(true),
        },
        {
          id: 'job-2',
          data: { scheduleId: 'schedule-789', level: 2 },
          remove: jest.fn().mockResolvedValue(true),
        },
        {
          id: 'job-3',
          data: { scheduleId: 'schedule-999', level: 1 },
          remove: jest.fn().mockResolvedValue(true),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);
    });

    it('should remove jobs matching scheduleId', async () => {
      const count = await escalationQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(2); // job-1 and job-2
    });

    it('should get delayed and waiting jobs', async () => {
      await escalationQueue.removeByScheduleId(scheduleId);

      expect(mockQueue.getJobs).toHaveBeenCalledWith(['delayed', 'waiting']);
    });

    it('should call remove on matching jobs', async () => {
      const mockJobs = await mockQueue.getJobs();

      await escalationQueue.removeByScheduleId(scheduleId);

      expect(mockJobs[0].remove).toHaveBeenCalled();
      expect(mockJobs[1].remove).toHaveBeenCalled();
      expect(mockJobs[2].remove).not.toHaveBeenCalled();
    });

    it('should log removed jobs count', async () => {
      await escalationQueue.removeByScheduleId(scheduleId);

      expect(logger.info).toHaveBeenCalledWith(
        'Removed escalation jobs',
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
          data: { scheduleId: 'different-schedule', level: 1 },
          remove: jest.fn().mockResolvedValue(true),
        },
      ]);

      const count = await escalationQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Removed escalation jobs',
        {
          scheduleId,
          count: 0,
        }
      );
    });

    it('should handle empty job queue', async () => {
      mockQueue.getJobs.mockResolvedValue([]);

      const count = await escalationQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(0);
    });

    it('should return count of removed jobs', async () => {
      const count = await escalationQueue.removeByScheduleId(scheduleId);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should handle job removal errors', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          data: { scheduleId, level: 1 },
          remove: jest.fn().mockRejectedValue(new Error('Remove failed')),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      await expect(
        escalationQueue.removeByScheduleId(scheduleId)
      ).rejects.toThrow('Remove failed');
    });

    it('should filter jobs by exact scheduleId match', async () => {
      const mockJobs = [
        {
          id: 'job-1',
          data: { scheduleId: 'schedule-789', level: 1 },
          remove: jest.fn().mockResolvedValue(true),
        },
        {
          id: 'job-2',
          data: { scheduleId: 'schedule-789-extended', level: 1 },
          remove: jest.fn().mockResolvedValue(true),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const count = await escalationQueue.removeByScheduleId('schedule-789');

      expect(count).toBe(1);
      expect(mockJobs[0].remove).toHaveBeenCalled();
      expect(mockJobs[1].remove).not.toHaveBeenCalled();
    });

    it('should handle getJobs errors', async () => {
      const error = new Error('Failed to get jobs');
      mockQueue.getJobs.mockRejectedValue(error);

      await expect(
        escalationQueue.removeByScheduleId(scheduleId)
      ).rejects.toThrow('Failed to get jobs');
    });
  });

  describe('integration tests', () => {
    it('should add and remove escalation workflow', async () => {
      const scheduleId = 'schedule-integration';
      const scheduledFor = new Date('2024-01-15T11:00:00Z');

      // Add escalation
      mockQueue.add.mockResolvedValue({
        id: 'job-int-1',
        data: { scheduleId, level: 1 },
      });

      await escalationQueue.addEscalation({
        scheduleId,
        level: 1,
        scheduledFor,
      });

      expect(mockQueue.add).toHaveBeenCalled();

      // Remove escalation
      const mockJobs = [
        {
          id: 'job-int-1',
          data: { scheduleId, level: 1 },
          remove: jest.fn().mockResolvedValue(true),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const count = await escalationQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(1);
      expect(mockJobs[0].remove).toHaveBeenCalled();
    });

    it('should handle multiple escalations for same schedule', async () => {
      const scheduleId = 'schedule-multi';
      
      mockQueue.add.mockResolvedValue({
        id: 'job-multi',
        data: {},
      });

      // Add multiple escalations
      await escalationQueue.addEscalation({
        scheduleId,
        level: 1,
        scheduledFor: new Date('2024-01-15T10:30:00Z'),
      });

      await escalationQueue.addEscalation({
        scheduleId,
        level: 2,
        scheduledFor: new Date('2024-01-15T10:45:00Z'),
      });

      expect(mockQueue.add).toHaveBeenCalledTimes(2);

      // Remove all
      const mockJobs = [
        {
          id: 'job-1',
          data: { scheduleId, level: 1 },
          remove: jest.fn().mockResolvedValue(true),
        },
        {
          id: 'job-2',
          data: { scheduleId, level: 2 },
          remove: jest.fn().mockResolvedValue(true),
        },
      ];

      mockQueue.getJobs.mockResolvedValue(mockJobs);

      const count = await escalationQueue.removeByScheduleId(scheduleId);

      expect(count).toBe(2);
    });

    it('should handle error event during operation', async () => {
      const error = new Error('Connection lost');
      
      // Simulate error event
      eventHandlers.error(error);

      expect(logger.error).toHaveBeenCalledWith(
        'Escalation queue error:',
        error
      );
    });

    it('should handle failed job during processing', async () => {
      const mockJob = {
        id: 'job-fail',
        data: {
          scheduleId: 'schedule-fail',
          level: 5,
        },
      };
      const error = new Error('Processing timeout');

      // Simulate failed event
      eventHandlers.failed(mockJob, error);

      expect(logger.error).toHaveBeenCalledWith(
        'Escalation job failed',
        expect.objectContaining({
          jobId: 'job-fail',
          scheduleId: 'schedule-fail',
          level: 5,
        })
      );
    });
  });

  describe('job configuration', () => {
    it('should use correct job options', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions).toEqual({
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 30000,
        },
      });
    });

    it('should configure job removal on completion', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.removeOnComplete).toBe(50);
    });

    it('should configure job removal on failure', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.removeOnFail).toBe(25);
    });

    it('should configure retry attempts', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.attempts).toBe(2);
    });

    it('should configure fixed backoff strategy', () => {
      const queueCall = Queue.mock.calls[0];
      const options = queueCall[2];

      expect(options.defaultJobOptions.backoff).toEqual({
        type: 'fixed',
        delay: 30000,
      });
    });
  });

  describe('delay calculations', () => {
    it('should calculate delay for 1 hour future', async () => {
      const scheduledFor = new Date('2024-01-15T11:00:00Z');

      mockQueue.add.mockResolvedValue({ id: 'job-1', data: {} });

      await escalationQueue.addEscalation({
        scheduleId: 'test',
        level: 1,
        scheduledFor,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.delay).toBe(60 * 60 * 1000); // 1 hour
    });

    it('should calculate delay for 5 minutes future', async () => {
      const scheduledFor = new Date('2024-01-15T10:05:00Z');

      mockQueue.add.mockResolvedValue({ id: 'job-1', data: {} });

      await escalationQueue.addEscalation({
        scheduleId: 'test',
        level: 1,
        scheduledFor,
      });

      const addCall = mockQueue.add.mock.calls[0][2];
      expect(addCall.delay).toBe(5 * 60 * 1000); // 5 minutes
    });

    it('should log delay in seconds', async () => {
      const scheduledFor = new Date('2024-01-15T10:10:00Z'); // 10 minutes

      mockQueue.add.mockResolvedValue({ id: 'job-1', data: {} });

      await escalationQueue.addEscalation({
        scheduleId: 'test',
        level: 1,
        scheduledFor,
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Escalation queued',
        expect.objectContaining({
          delay: '600s',
        })
      );
    });
  });
});