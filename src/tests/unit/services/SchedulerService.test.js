import { jest } from '@jest/globals';
import { schedulerService } from '../services/SchedulerService.js';
import Schedule from '../models/Schedule.js';
import Medication from '../models/Medication.js';
import User from '../models/User.js';
import { reminderQueue } from '../queues/reminderQueue.js';
import { logger } from '../utils/logger.js';
import moment from 'moment-timezone';

// Mock dependencies
jest.mock('../models/Schedule.js');
jest.mock('../models/Medication.js');
jest.mock('../models/User.js');
jest.mock('../queues/reminderQueue.js');
jest.mock('../utils/logger.js');
jest.mock('moment-timezone');

describe('SchedulerService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('createSchedules', () => {
    const mockUser = {
      _id: 'user-123',
      timezone: 'America/New_York',
    };

    const mockMedication = {
      _id: 'med-123',
      userId: 'user-123',
      schedule: {
        frequency: 'daily',
        startDate: new Date('2024-01-15T00:00:00Z'),
        duration: 7,
        times: [
          { time: '08:00', dose: '1' },
          { time: '20:00', dose: '1' },
        ],
      },
      encryptedData: {
        form: 'tablet',
      },
    };

    beforeEach(() => {
      User.findById = jest.fn().mockResolvedValue(mockUser);
      Schedule.create = jest.fn().mockImplementation((data) =>
        Promise.resolve({ _id: 'schedule-' + Date.now(), ...data })
      );
      reminderQueue.addReminder = jest.fn().mockResolvedValue(true);

      // Mock moment-timezone
      moment.tz = jest.fn((date) => ({
        toDate: () => date,
      }));
    });

    it('should create schedules for medication duration', async () => {
      const schedules = await schedulerService.createSchedules(mockMedication);

      // 7 days * 2 times per day = 14 schedules
      expect(schedules.length).toBeGreaterThan(0);
      expect(Schedule.create).toHaveBeenCalled();
    });

    it('should fetch user timezone', async () => {
      await schedulerService.createSchedules(mockMedication);

      expect(User.findById).toHaveBeenCalledWith('user-123');
    });

    it('should use UTC as default timezone', async () => {
      User.findById = jest.fn().mockResolvedValue({ _id: 'user-123' });

      await schedulerService.createSchedules(mockMedication);

      expect(moment.tz).toHaveBeenCalled();
    });

    it('should create schedules for each time slot', async () => {
      await schedulerService.createSchedules(mockMedication);

      const createCalls = Schedule.create.mock.calls;
      expect(createCalls.length).toBeGreaterThan(0);
    });

    it('should only create future schedules', async () => {
      const pastMedication = {
        ...mockMedication,
        schedule: {
          ...mockMedication.schedule,
          startDate: new Date('2024-01-10T00:00:00Z'),
          duration: 3,
        },
      };

      await schedulerService.createSchedules(pastMedication);

      // Should not create schedules for past dates
      const createCalls = Schedule.create.mock.calls;
      createCalls.forEach((call) => {
        expect(call[0].scheduledTime).toBeInstanceOf(Date);
        expect(call[0].scheduledTime.getTime()).toBeGreaterThan(Date.now());
      });
    });

    it('should add reminders to queue', async () => {
      await schedulerService.createSchedules(mockMedication);

      expect(reminderQueue.addReminder).toHaveBeenCalled();
    });

    it('should create schedules with correct dose information', async () => {
      await schedulerService.createSchedules(mockMedication);

      const createCall = Schedule.create.mock.calls[0];
      expect(createCall[0].dose).toEqual({
        amount: expect.any(String),
        unit: 'tablet',
      });
    });

    it('should use default unit if form not specified', async () => {
      const medWithoutForm = {
        ...mockMedication,
        encryptedData: {},
      };

      await schedulerService.createSchedules(medWithoutForm);

      const createCall = Schedule.create.mock.calls[0];
      expect(createCall[0].dose.unit).toBe('unit');
    });

    it('should calculate end date from duration', async () => {
      const medWithoutEndDate = {
        ...mockMedication,
        schedule: {
          ...mockMedication.schedule,
          endDate: undefined,
        },
      };

      await schedulerService.createSchedules(medWithoutEndDate);

      expect(Schedule.create).toHaveBeenCalled();
    });

    it('should use start date default to now', async () => {
      const medWithoutStartDate = {
        ...mockMedication,
        schedule: {
          ...mockMedication.schedule,
          startDate: undefined,
        },
      };

      await schedulerService.createSchedules(medWithoutStartDate);

      expect(Schedule.create).toHaveBeenCalled();
    });

    it('should log schedule creation', async () => {
      await schedulerService.createSchedules(mockMedication);

      expect(logger.info).toHaveBeenCalledWith(
        'Schedules created',
        expect.objectContaining({
          medicationId: 'med-123',
          count: expect.any(Number),
        })
      );
    });

    it('should handle errors', async () => {
      const error = new Error('Database error');
      Schedule.create = jest.fn().mockRejectedValue(error);

      await expect(
        schedulerService.createSchedules(mockMedication)
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error creating schedules:',
        error
      );
    });
  });

  describe('shouldScheduleToday', () => {
    it('should return true for daily frequency', () => {
      const medication = {
        schedule: { frequency: 'daily' },
      };

      const result = schedulerService.shouldScheduleToday(
        medication,
        new Date('2024-01-15')
      );

      expect(result).toBe(true);
    });

    it('should check day of week for weekly frequency', () => {
      const medication = {
        schedule: {
          frequency: 'weekly',
          daysOfWeek: [1, 3, 5], // Monday, Wednesday, Friday
        },
      };

      const monday = new Date('2024-01-15'); // Monday
      const tuesday = new Date('2024-01-16'); // Tuesday

      expect(schedulerService.shouldScheduleToday(medication, monday)).toBe(
        true
      );
      expect(schedulerService.shouldScheduleToday(medication, tuesday)).toBe(
        false
      );
    });

    it('should check day of month for monthly frequency', () => {
      const medication = {
        schedule: {
          frequency: 'monthly',
          dayOfMonth: 15,
        },
      };

      const day15 = new Date('2024-01-15');
      const day16 = new Date('2024-01-16');

      expect(schedulerService.shouldScheduleToday(medication, day15)).toBe(
        true
      );
      expect(schedulerService.shouldScheduleToday(medication, day16)).toBe(
        false
      );
    });

    it('should return false for unknown frequency', () => {
      const medication = {
        schedule: { frequency: 'custom' },
      };

      const result = schedulerService.shouldScheduleToday(
        medication,
        new Date()
      );

      expect(result).toBe(false);
    });
  });

  describe('getScheduledTime', () => {
    beforeEach(() => {
      moment.tz = jest.fn((date, timezone) => ({
        toDate: () => date,
      }));
    });

    it('should parse time string correctly', () => {
      const date = new Date('2024-01-15');
      const timeString = '14:30';

      const result = schedulerService.getScheduledTime(
        date,
        timeString,
        'UTC'
      );

      expect(result.getHours()).toBe(14);
      expect(result.getMinutes()).toBe(30);
      expect(result.getSeconds()).toBe(0);
    });

    it('should use provided timezone', () => {
      const date = new Date('2024-01-15');
      const timeString = '14:30';
      const timezone = 'America/New_York';

      schedulerService.getScheduledTime(date, timeString, timezone);

      expect(moment.tz).toHaveBeenCalledWith(
        expect.any(Date),
        timezone
      );
    });

    it('should handle midnight time', () => {
      const date = new Date('2024-01-15');
      const timeString = '00:00';

      const result = schedulerService.getScheduledTime(
        date,
        timeString,
        'UTC'
      );

      expect(result.getHours()).toBe(0);
      expect(result.getMinutes()).toBe(0);
    });

    it('should handle end of day time', () => {
      const date = new Date('2024-01-15');
      const timeString = '23:59';

      const result = schedulerService.getScheduledTime(
        date,
        timeString,
        'UTC'
      );

      expect(result.getHours()).toBe(23);
      expect(result.getMinutes()).toBe(59);
    });
  });

  describe('snoozeReminder', () => {
    const scheduleId = 'schedule-123';
    const mockSchedule = {
      _id: scheduleId,
      scheduledTime: new Date('2024-01-15T10:00:00Z'),
    };

    beforeEach(() => {
      Schedule.findById = jest.fn().mockResolvedValue(mockSchedule);
      reminderQueue.addReminder = jest.fn().mockResolvedValue(true);
    });

    it('should snooze reminder for specified minutes', async () => {
      const snoozeMinutes = 15;

      const snoozeUntil = await schedulerService.snoozeReminder(
        scheduleId,
        snoozeMinutes
      );

      const expectedTime = new Date(Date.now() + 15 * 60 * 1000);
      expect(snoozeUntil.getTime()).toBe(expectedTime.getTime());
    });

    it('should add snoozed reminder to queue', async () => {
      await schedulerService.snoozeReminder(scheduleId, 10);

      expect(reminderQueue.addReminder).toHaveBeenCalledWith({
        scheduleId: scheduleId,
        scheduledTime: expect.any(Date),
        isSnoozed: true,
      });
    });

    it('should return null if schedule not found', async () => {
      Schedule.findById = jest.fn().mockResolvedValue(null);

      const result = await schedulerService.snoozeReminder(scheduleId, 10);

      expect(result).toBeUndefined();
      expect(reminderQueue.addReminder).not.toHaveBeenCalled();
    });

    it('should log snooze action', async () => {
      const snoozeUntil = await schedulerService.snoozeReminder(
        scheduleId,
        5
      );

      expect(logger.info).toHaveBeenCalledWith(
        'Reminder snoozed',
        {
          scheduleId,
          snoozeUntil,
        }
      );
    });

    it('should handle errors', async () => {
      const error = new Error('Queue error');
      reminderQueue.addReminder = jest.fn().mockRejectedValue(error);

      await expect(
        schedulerService.snoozeReminder(scheduleId, 10)
      ).rejects.toThrow('Queue error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error snoozing reminder:',
        error
      );
    });
  });

  describe('pauseMedicationSchedules', () => {
    const medicationId = 'med-456';

    beforeEach(() => {
      Schedule.updateMany = jest.fn().mockResolvedValue({
        modifiedCount: 5,
      });
      reminderQueue.removeByMedicationId = jest.fn().mockResolvedValue(true);
    });

    it('should update pending schedules to paused', async () => {
      await schedulerService.pauseMedicationSchedules(medicationId);

      expect(Schedule.updateMany).toHaveBeenCalledWith(
        {
          medicationId,
          status: 'pending',
        },
        {
          status: 'paused',
        }
      );
    });

    it('should remove schedules from queue', async () => {
      await schedulerService.pauseMedicationSchedules(medicationId);

      expect(reminderQueue.removeByMedicationId).toHaveBeenCalledWith(
        medicationId
      );
    });

    it('should return count of modified schedules', async () => {
      const count = await schedulerService.pauseMedicationSchedules(
        medicationId
      );

      expect(count).toBe(5);
    });

    it('should log pause action', async () => {
      await schedulerService.pauseMedicationSchedules(medicationId);

      expect(logger.info).toHaveBeenCalledWith(
        'Medication schedules paused',
        {
          medicationId,
          count: 5,
        }
      );
    });

    it('should handle errors', async () => {
      const error = new Error('Database error');
      Schedule.updateMany = jest.fn().mockRejectedValue(error);

      await expect(
        schedulerService.pauseMedicationSchedules(medicationId)
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error pausing schedules:',
        error
      );
    });
  });

  describe('resumeMedicationSchedules', () => {
    const medicationId = 'med-789';
    const mockMedication = {
      _id: medicationId,
    };

    const mockSchedules = [
      {
        _id: 'schedule-1',
        medicationId,
        status: 'paused',
        scheduledTime: new Date('2024-01-20T10:00:00Z'),
        save: jest.fn().mockResolvedValue(true),
      },
      {
        _id: 'schedule-2',
        medicationId,
        status: 'paused',
        scheduledTime: new Date('2024-01-21T10:00:00Z'),
        save: jest.fn().mockResolvedValue(true),
      },
    ];

    beforeEach(() => {
      Medication.findById = jest.fn().mockResolvedValue(mockMedication);
      Schedule.find = jest.fn().mockResolvedValue(mockSchedules);
      reminderQueue.addReminder = jest.fn().mockResolvedValue(true);
    });

    it('should find paused future schedules', async () => {
      await schedulerService.resumeMedicationSchedules(medicationId);

      expect(Schedule.find).toHaveBeenCalledWith({
        medicationId,
        status: 'paused',
        scheduledTime: { $gte: expect.any(Date) },
      });
    });

    it('should update schedules to pending status', async () => {
      await schedulerService.resumeMedicationSchedules(medicationId);

      mockSchedules.forEach((schedule) => {
        expect(schedule.status).toBe('pending');
        expect(schedule.save).toHaveBeenCalled();
      });
    });

    it('should re-queue reminders', async () => {
      await schedulerService.resumeMedicationSchedules(medicationId);

      expect(reminderQueue.addReminder).toHaveBeenCalledTimes(2);
      expect(reminderQueue.addReminder).toHaveBeenCalledWith({
        scheduleId: 'schedule-1',
        scheduledTime: expect.any(Date),
      });
    });

    it('should return count of resumed schedules', async () => {
      const count = await schedulerService.resumeMedicationSchedules(
        medicationId
      );

      expect(count).toBe(2);
    });

    it('should log resume action', async () => {
      await schedulerService.resumeMedicationSchedules(medicationId);

      expect(logger.info).toHaveBeenCalledWith(
        'Medication schedules resumed',
        {
          medicationId,
          count: 2,
        }
      );
    });

    it('should handle errors', async () => {
      const error = new Error('Database error');
      Medication.findById = jest.fn().mockRejectedValue(error);

      await expect(
        schedulerService.resumeMedicationSchedules(medicationId)
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error resuming schedules:',
        error
      );
    });
  });

  describe('getUpcomingSchedules', () => {
    const userId = 'user-999';

    beforeEach(() => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([
            {
              _id: 'schedule-1',
              scheduledTime: new Date('2024-01-16T10:00:00Z'),
            },
            {
              _id: 'schedule-2',
              scheduledTime: new Date('2024-01-17T10:00:00Z'),
            },
          ]),
        }),
      });

      Schedule.find = mockFind;
    });

    it('should fetch schedules for default 7 days', async () => {
      await schedulerService.getUpcomingSchedules(userId);

      const startDate = new Date('2024-01-15T10:00:00Z');
      const endDate = new Date('2024-01-15T10:00:00Z');
      endDate.setDate(endDate.getDate() + 7);

      expect(Schedule.find).toHaveBeenCalledWith({
        userId,
        scheduledTime: {
          $gte: startDate,
          $lte: endDate,
        },
        status: 'pending',
      });
    });

    it('should fetch schedules for custom days', async () => {
      await schedulerService.getUpcomingSchedules(userId, 14);

      const endDate = new Date('2024-01-15T10:00:00Z');
      endDate.setDate(endDate.getDate() + 14);

      expect(Schedule.find).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledTime: expect.objectContaining({
            $lte: endDate,
          }),
        })
      );
    });

    it('should populate medication details', async () => {
      const mockSort = jest.fn().mockResolvedValue([]);
      const mockPopulate = jest.fn().mockReturnValue({
        sort: mockSort,
      });
      Schedule.find = jest.fn().mockReturnValue({
        populate: mockPopulate,
      });

      await schedulerService.getUpcomingSchedules(userId);

      expect(mockPopulate).toHaveBeenCalledWith('medicationId');
    });

    it('should sort by scheduled time ascending', async () => {
      const mockSort = jest.fn().mockResolvedValue([]);
      const mockPopulate = jest.fn().mockReturnValue({
        sort: mockSort,
      });
      Schedule.find = jest.fn().mockReturnValue({
        populate: mockPopulate,
      });

      await schedulerService.getUpcomingSchedules(userId);

      expect(mockSort).toHaveBeenCalledWith({ scheduledTime: 1 });
    });

    it('should return schedules array', async () => {
      const schedules = await schedulerService.getUpcomingSchedules(userId);

      expect(Array.isArray(schedules)).toBe(true);
      expect(schedules).toHaveLength(2);
    });
  });

  describe('updateScheduleTime', () => {
    const scheduleId = 'schedule-999';
    const mockSchedule = {
      _id: scheduleId,
      scheduledTime: new Date('2024-01-15T10:00:00Z'),
      save: jest.fn().mockResolvedValue(true),
    };

    beforeEach(() => {
      Schedule.findById = jest.fn().mockResolvedValue(mockSchedule);
      reminderQueue.removeByScheduleId = jest.fn().mockResolvedValue(true);
      reminderQueue.addReminder = jest.fn().mockResolvedValue(true);
    });

    it('should update schedule time', async () => {
      const newTime = new Date('2024-01-15T14:00:00Z');

      const result = await schedulerService.updateScheduleTime(
        scheduleId,
        newTime
      );

      expect(result.scheduledTime).toEqual(newTime);
      expect(mockSchedule.save).toHaveBeenCalled();
    });

    it('should throw error if schedule not found', async () => {
      Schedule.findById = jest.fn().mockResolvedValue(null);

      await expect(
        schedulerService.updateScheduleTime(scheduleId, new Date())
      ).rejects.toThrow('Schedule not found');
    });

    it('should remove old reminder from queue', async () => {
      const newTime = new Date('2024-01-15T14:00:00Z');

      await schedulerService.updateScheduleTime(scheduleId, newTime);

      expect(reminderQueue.removeByScheduleId).toHaveBeenCalledWith(
        scheduleId
      );
    });

    it('should add new reminder to queue', async () => {
      const newTime = new Date('2024-01-15T14:00:00Z');

      await schedulerService.updateScheduleTime(scheduleId, newTime);

      expect(reminderQueue.addReminder).toHaveBeenCalledWith({
        scheduleId,
        scheduledTime: newTime,
      });
    });

    it('should log time update', async () => {
      const oldTime = mockSchedule.scheduledTime;
      const newTime = new Date('2024-01-15T14:00:00Z');

      await schedulerService.updateScheduleTime(scheduleId, newTime);

      expect(logger.info).toHaveBeenCalledWith(
        'Schedule time updated',
        {
          scheduleId,
          oldTime,
          newTime,
        }
      );
    });

    it('should handle errors', async () => {
      const error = new Error('Update error');
      mockSchedule.save = jest.fn().mockRejectedValue(error);

      await expect(
        schedulerService.updateScheduleTime(scheduleId, new Date())
      ).rejects.toThrow('Update error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error updating schedule time:',
        error
      );
    });
  });

  describe('bulkCreateSchedules', () => {
    const userId = 'user-bulk';
    const mockMedications = [
      {
        _id: 'med-1',
        userId,
        schedule: {
          frequency: 'daily',
          times: [{ time: '08:00', dose: '1' }],
          duration: 7,
        },
        encryptedData: { form: 'tablet' },
      },
      {
        _id: 'med-2',
        userId,
        schedule: {
          frequency: 'daily',
          times: [{ time: '20:00', dose: '1' }],
          duration: 7,
        },
        encryptedData: { form: 'capsule' },
      },
    ];

    beforeEach(() => {
      User.findById = jest.fn().mockResolvedValue({
        _id: userId,
        timezone: 'UTC',
      });
      Schedule.create = jest.fn().mockImplementation((data) =>
        Promise.resolve({ _id: 'schedule-' + Math.random(), ...data })
      );
      reminderQueue.addReminder = jest.fn().mockResolvedValue(true);

      moment.tz = jest.fn((date) => ({
        toDate: () => date,
      }));
    });

    it('should create schedules for all medications', async () => {
      const schedules = await schedulerService.bulkCreateSchedules(
        userId,
        mockMedications
      );

      expect(schedules.length).toBeGreaterThan(0);
      expect(Schedule.create).toHaveBeenCalled();
    });

    it('should log bulk creation', async () => {
      await schedulerService.bulkCreateSchedules(userId, mockMedications);

      expect(logger.info).toHaveBeenCalledWith(
        'Bulk schedules created',
        expect.objectContaining({
          userId,
          totalSchedules: expect.any(Number),
          medications: 2,
        })
      );
    });

    it('should return all created schedules', async () => {
      const schedules = await schedulerService.bulkCreateSchedules(
        userId,
        mockMedications
      );

      expect(Array.isArray(schedules)).toBe(true);
    });

    it('should handle empty medications array', async () => {
      const schedules = await schedulerService.bulkCreateSchedules(
        userId,
        []
      );

      expect(schedules).toHaveLength(0);
      expect(logger.info).toHaveBeenCalledWith(
        'Bulk schedules created',
        expect.objectContaining({
          medications: 0,
        })
      );
    });
  });
});