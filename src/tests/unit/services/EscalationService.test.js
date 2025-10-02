import { jest } from '@jest/globals';
import { escalationService } from '../services/EscalationService.js';
import { escalationQueue } from '../queues/escalationQueue.js';
import Escalation from '../models/Escalation.js';
import Schedule from '../models/Schedule.js';
import { logger } from '../utils/logger.js';

// Mock dependencies
jest.mock('../queues/escalationQueue.js');
jest.mock('../models/Escalation.js');
jest.mock('../models/Schedule.js');
jest.mock('../utils/logger.js');
jest.mock('../config/constants.js', () => ({
  CONSTANTS: {},
}));

describe('EscalationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('scheduleEscalation', () => {
    const scheduleId = 'schedule-123';

    it('should schedule level 1 escalation with 30 minute delay', async () => {
      escalationQueue.addEscalation = jest.fn().mockResolvedValue(true);

      await escalationService.scheduleEscalation(scheduleId, 1);

      expect(escalationQueue.addEscalation).toHaveBeenCalledWith({
        scheduleId,
        level: 1,
        scheduledFor: new Date(Date.now() + 30 * 60 * 1000),
      });

      expect(logger.info).toHaveBeenCalledWith(
        'Escalation scheduled',
        {
          scheduleId,
          level: 1,
          delay: 30 * 60 * 1000,
        }
      );
    });

    it('should schedule level 2 escalation with 15 minute delay', async () => {
      escalationQueue.addEscalation = jest.fn().mockResolvedValue(true);

      await escalationService.scheduleEscalation(scheduleId, 2);

      expect(escalationQueue.addEscalation).toHaveBeenCalledWith({
        scheduleId,
        level: 2,
        scheduledFor: new Date(Date.now() + 15 * 60 * 1000),
      });
    });

    it('should schedule level 3 escalation with 15 minute delay', async () => {
      escalationQueue.addEscalation = jest.fn().mockResolvedValue(true);

      await escalationService.scheduleEscalation(scheduleId, 3);

      expect(escalationQueue.addEscalation).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 3,
          scheduledFor: new Date(Date.now() + 15 * 60 * 1000),
        })
      );
    });

    it('should schedule level 4 escalation with 10 minute delay', async () => {
      escalationQueue.addEscalation = jest.fn().mockResolvedValue(true);

      await escalationService.scheduleEscalation(scheduleId, 4);

      expect(escalationQueue.addEscalation).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 4,
          scheduledFor: new Date(Date.now() + 10 * 60 * 1000),
        })
      );
    });

    it('should schedule level 5 escalation with 5 minute delay', async () => {
      escalationQueue.addEscalation = jest.fn().mockResolvedValue(true);

      await escalationService.scheduleEscalation(scheduleId, 5);

      expect(escalationQueue.addEscalation).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 5,
          scheduledFor: new Date(Date.now() + 5 * 60 * 1000),
        })
      );
    });

    it('should use default delay for unknown escalation level', async () => {
      escalationQueue.addEscalation = jest.fn().mockResolvedValue(true);

      await escalationService.scheduleEscalation(scheduleId, 99);

      expect(escalationQueue.addEscalation).toHaveBeenCalledWith(
        expect.objectContaining({
          scheduledFor: new Date(Date.now() + 30 * 60 * 1000),
        })
      );
    });

    it('should handle scheduling errors', async () => {
      const error = new Error('Queue error');
      escalationQueue.addEscalation = jest.fn().mockRejectedValue(error);

      await expect(
        escalationService.scheduleEscalation(scheduleId, 1)
      ).rejects.toThrow('Queue error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error scheduling escalation:',
        error
      );
    });

    it('should log scheduling information', async () => {
      escalationQueue.addEscalation = jest.fn().mockResolvedValue(true);

      await escalationService.scheduleEscalation(scheduleId, 3);

      expect(logger.info).toHaveBeenCalledWith(
        'Escalation scheduled',
        expect.objectContaining({
          scheduleId,
          level: 3,
          delay: expect.any(Number),
        })
      );
    });
  });

  describe('getEscalationDelay', () => {
    it('should return correct delay for level 1', () => {
      const delay = escalationService.getEscalationDelay(1);
      expect(delay).toBe(30 * 60 * 1000);
    });

    it('should return correct delay for level 2', () => {
      const delay = escalationService.getEscalationDelay(2);
      expect(delay).toBe(15 * 60 * 1000);
    });

    it('should return correct delay for level 3', () => {
      const delay = escalationService.getEscalationDelay(3);
      expect(delay).toBe(15 * 60 * 1000);
    });

    it('should return correct delay for level 4', () => {
      const delay = escalationService.getEscalationDelay(4);
      expect(delay).toBe(10 * 60 * 1000);
    });

    it('should return correct delay for level 5', () => {
      const delay = escalationService.getEscalationDelay(5);
      expect(delay).toBe(5 * 60 * 1000);
    });

    it('should return default delay for invalid level', () => {
      const delay = escalationService.getEscalationDelay(10);
      expect(delay).toBe(30 * 60 * 1000);
    });

    it('should return default delay for zero level', () => {
      const delay = escalationService.getEscalationDelay(0);
      expect(delay).toBe(30 * 60 * 1000);
    });

    it('should return default delay for null level', () => {
      const delay = escalationService.getEscalationDelay(null);
      expect(delay).toBe(30 * 60 * 1000);
    });
  });

  describe('cancelEscalation', () => {
    const scheduleId = 'schedule-456';

    beforeEach(() => {
      escalationQueue.removeByScheduleId = jest.fn().mockResolvedValue(true);
      Escalation.updateMany = jest.fn().mockResolvedValue({ 
        modifiedCount: 2 
      });
    });

    it('should remove escalation from queue', async () => {
      await escalationService.cancelEscalation(scheduleId);

      expect(escalationQueue.removeByScheduleId).toHaveBeenCalledWith(
        scheduleId
      );
    });

    it('should update pending escalations to cancelled', async () => {
      await escalationService.cancelEscalation(scheduleId);

      expect(Escalation.updateMany).toHaveBeenCalledWith(
        {
          scheduleId,
          status: 'pending',
        },
        {
          status: 'cancelled',
          'resolution.resolved': true,
          'resolution.resolvedAt': expect.any(Date),
          'resolution.resolvedBy': 'user',
        }
      );
    });

    it('should log cancellation', async () => {
      await escalationService.cancelEscalation(scheduleId);

      expect(logger.info).toHaveBeenCalledWith(
        'Escalation cancelled',
        { scheduleId }
      );
    });

    it('should handle queue removal errors', async () => {
      const error = new Error('Queue removal error');
      escalationQueue.removeByScheduleId = jest.fn().mockRejectedValue(error);

      await expect(
        escalationService.cancelEscalation(scheduleId)
      ).rejects.toThrow('Queue removal error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error cancelling escalation:',
        error
      );
    });

    it('should handle database update errors', async () => {
      const error = new Error('Database error');
      Escalation.updateMany = jest.fn().mockRejectedValue(error);

      await expect(
        escalationService.cancelEscalation(scheduleId)
      ).rejects.toThrow('Database error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error cancelling escalation:',
        error
      );
    });
  });

  describe('getEscalationHistory', () => {
    const userId = 'user-789';

    beforeEach(() => {
      const mockFind = jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          sort: jest.fn().mockResolvedValue([
            {
              _id: 'esc1',
              userId,
              level: 2,
              createdAt: new Date('2024-01-10T10:00:00Z'),
            },
            {
              _id: 'esc2',
              userId,
              level: 3,
              createdAt: new Date('2024-01-05T10:00:00Z'),
            },
          ]),
        }),
      });
      
      Escalation.find = mockFind;
    });

    it('should retrieve escalations for last 30 days by default', async () => {
      await escalationService.getEscalationHistory(userId);

      const expectedStartDate = new Date('2024-01-15T10:00:00Z');
      expectedStartDate.setDate(expectedStartDate.getDate() - 30);

      expect(Escalation.find).toHaveBeenCalledWith({
        userId,
        createdAt: { $gte: expectedStartDate },
      });
    });

    it('should retrieve escalations for custom days', async () => {
      await escalationService.getEscalationHistory(userId, 7);

      const expectedStartDate = new Date('2024-01-15T10:00:00Z');
      expectedStartDate.setDate(expectedStartDate.getDate() - 7);

      expect(Escalation.find).toHaveBeenCalledWith({
        userId,
        createdAt: { $gte: expectedStartDate },
      });
    });

    it('should populate medicationId', async () => {
      const mockSort = jest.fn().mockResolvedValue([]);
      const mockPopulate = jest.fn().mockReturnValue({
        sort: mockSort,
      });
      const mockFind = jest.fn().mockReturnValue({
        populate: mockPopulate,
      });
      
      Escalation.find = mockFind;

      await escalationService.getEscalationHistory(userId);

      expect(mockPopulate).toHaveBeenCalledWith('medicationId');
    });

    it('should sort by createdAt descending', async () => {
      const mockSort = jest.fn().mockResolvedValue([]);
      const mockPopulate = jest.fn().mockReturnValue({
        sort: mockSort,
      });
      Escalation.find = jest.fn().mockReturnValue({
        populate: mockPopulate,
      });

      await escalationService.getEscalationHistory(userId);

      expect(mockSort).toHaveBeenCalledWith({ createdAt: -1 });
    });

    it('should return escalation history', async () => {
      const history = await escalationService.getEscalationHistory(userId);

      expect(history).toHaveLength(2);
      expect(history[0]._id).toBe('esc1');
      expect(history[1]._id).toBe('esc2');
    });
  });

  describe('analyzeEscalationPatterns', () => {
    const userId = 'user-999';

    it('should analyze basic escalation statistics', async () => {
      const mockEscalations = [
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Morning Pill' },
          caregiver: { notified: false },
          createdAt: new Date('2024-01-01T08:00:00Z'),
          resolution: { resolved: true, resolvedAt: new Date('2024-01-01T08:30:00Z') },
        },
        {
          userId,
          level: 2,
          medicationId: { toString: () => 'med1', nickname: 'Morning Pill' },
          caregiver: { notified: true },
          createdAt: new Date('2024-01-02T08:00:00Z'),
          resolution: { resolved: true, resolvedAt: new Date('2024-01-02T09:00:00Z') },
        },
        {
          userId,
          level: 3,
          medicationId: { toString: () => 'med2', nickname: 'Evening Pill' },
          caregiver: { notified: false },
          createdAt: new Date('2024-01-03T08:00:00Z'),
          resolution: { resolved: false },
        },
      ];

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.totalEscalations).toBe(3);
      expect(analysis.byLevel[1]).toBe(1);
      expect(analysis.byLevel[2]).toBe(1);
      expect(analysis.byLevel[3]).toBe(1);
      expect(analysis.caregiverInterventions).toBe(1);
    });

    it('should analyze escalations by medication', async () => {
      const mockEscalations = [
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: false },
          createdAt: new Date(),
          resolution: { resolved: false },
        },
        {
          userId,
          level: 2,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: false },
          createdAt: new Date(),
          resolution: { resolved: false },
        },
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med2', nickname: 'Med B' },
          caregiver: { notified: false },
          createdAt: new Date(),
          resolution: { resolved: false },
        },
      ];

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.byMedication.med1.count).toBe(2);
      expect(analysis.byMedication.med1.name).toBe('Med A');
      expect(analysis.byMedication.med2.count).toBe(1);
      expect(analysis.byMedication.med2.name).toBe('Med B');
    });

    it('should calculate average resolution time in minutes', async () => {
      const mockEscalations = [
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: false },
          createdAt: new Date('2024-01-01T08:00:00Z'),
          resolution: { 
            resolved: true, 
            resolvedAt: new Date('2024-01-01T08:30:00Z') 
          },
        },
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: false },
          createdAt: new Date('2024-01-01T09:00:00Z'),
          resolution: { 
            resolved: true, 
            resolvedAt: new Date('2024-01-01T09:10:00Z') 
          },
        },
      ];

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      // (30 + 10) / 2 = 20 minutes average
      expect(analysis.averageResolutionTime).toBe(20);
    });

    it('should handle zero resolved escalations', async () => {
      const mockEscalations = [
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: false },
          createdAt: new Date(),
          resolution: { resolved: false },
        },
      ];

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.averageResolutionTime).toBe(0);
    });

    it('should identify high frequency severe escalation pattern', async () => {
      const mockEscalations = Array.from({ length: 15 }, (_, i) => ({
        userId,
        level: i < 6 ? 4 : 1,
        medicationId: { toString: () => 'med1', nickname: 'Med A' },
        caregiver: { notified: false },
        createdAt: new Date(),
        resolution: { resolved: false },
      }));

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.patterns).toContain(
        'High frequency of severe escalations - consider medication review'
      );
    });

    it('should identify critical level 5 escalation pattern', async () => {
      const mockEscalations = Array.from({ length: 12 }, (_, i) => ({
        userId,
        level: i < 4 ? 5 : 1,
        medicationId: { toString: () => 'med1', nickname: 'Med A' },
        caregiver: { notified: false },
        createdAt: new Date(),
        resolution: { resolved: false },
      }));

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.patterns).toContain(
        'High frequency of severe escalations - consider medication review'
      );
    });

    it('should identify problem medication pattern', async () => {
      const mockEscalations = Array.from({ length: 15 }, (_, i) => ({
        userId,
        level: 1,
        medicationId: { 
          toString: () => i < 10 ? 'med1' : 'med2', 
          nickname: i < 10 ? 'Problem Med' : 'Other Med' 
        },
        caregiver: { notified: false },
        createdAt: new Date(),
        resolution: { resolved: false },
      }));

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.patterns).toContain(
        'Problem Med accounts for >30% of escalations'
      );
    });

    it('should not identify patterns with few escalations', async () => {
      const mockEscalations = Array.from({ length: 5 }, () => ({
        userId,
        level: 4,
        medicationId: { toString: () => 'med1', nickname: 'Med A' },
        caregiver: { notified: false },
        createdAt: new Date(),
        resolution: { resolved: false },
      }));

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.patterns).toHaveLength(0);
    });

    it('should count caregiver interventions correctly', async () => {
      const mockEscalations = [
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: true },
          createdAt: new Date(),
          resolution: { resolved: false },
        },
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: true },
          createdAt: new Date(),
          resolution: { resolved: false },
        },
        {
          userId,
          level: 1,
          medicationId: { toString: () => 'med1', nickname: 'Med A' },
          caregiver: { notified: false },
          createdAt: new Date(),
          resolution: { resolved: false },
        },
      ];

      Escalation.find = jest.fn().mockResolvedValue(mockEscalations);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis.caregiverInterventions).toBe(2);
    });

    it('should return complete analysis structure', async () => {
      Escalation.find = jest.fn().mockResolvedValue([]);

      const analysis = await escalationService.analyzeEscalationPatterns(userId);

      expect(analysis).toHaveProperty('totalEscalations');
      expect(analysis).toHaveProperty('byLevel');
      expect(analysis).toHaveProperty('byMedication');
      expect(analysis).toHaveProperty('averageResolutionTime');
      expect(analysis).toHaveProperty('caregiverInterventions');
      expect(analysis).toHaveProperty('patterns');
      expect(Array.isArray(analysis.patterns)).toBe(true);
    });
  });
});