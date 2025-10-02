import { escalationQueue } from '../queues/escalationQueue.js';
import Escalation from '../models/Escalation.js';
import Schedule from '../models/Schedule.js';
import { logger } from '../utils/logger.js';
import { CONSTANTS } from '../config/constants.js';

class EscalationService {
  async scheduleEscalation(scheduleId, level) {
    try {
      const delay = this.getEscalationDelay(level);
      
      await escalationQueue.addEscalation({
        scheduleId,
        level,
        scheduledFor: new Date(Date.now() + delay),
      });
      
      logger.info('Escalation scheduled', {
        scheduleId,
        level,
        delay,
      });
    } catch (error) {
      logger.error('Error scheduling escalation:', error);
      throw error;
    }
  }
  
  getEscalationDelay(level) {
    const delays = {
      1: 30 * 60 * 1000,    // 30 minutes
      2: 15 * 60 * 1000,    // 15 minutes
      3: 15 * 60 * 1000,    // 15 minutes
      4: 10 * 60 * 1000,    // 10 minutes
      5: 5 * 60 * 1000,     // 5 minutes
    };
    
    return delays[level] || 30 * 60 * 1000;
  }
  
  async cancelEscalation(scheduleId) {
    try {
      await escalationQueue.removeByScheduleId(scheduleId);
      
      // Mark any pending escalations as cancelled
      await Escalation.updateMany(
        {
          scheduleId,
          status: 'pending',
        },
        {
          status: 'cancelled',
          'resolution.resolved': true,
          'resolution.resolvedAt': new Date(),
          'resolution.resolvedBy': 'user',
        }
      );
      
      logger.info('Escalation cancelled', { scheduleId });
    } catch (error) {
      logger.error('Error cancelling escalation:', error);
      throw error;
    }
  }
  
  async getEscalationHistory(userId, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const escalations = await Escalation.find({
      userId,
      createdAt: { $gte: startDate },
    })
    .populate('medicationId')
    .sort({ createdAt: -1 });
    
    return escalations;
  }
  
  async analyzeEscalationPatterns(userId) {
    const escalations = await Escalation.find({ userId });
    
    const analysis = {
      totalEscalations: escalations.length,
      byLevel: {},
      byMedication: {},
      averageResolutionTime: 0,
      caregiverInterventions: 0,
      patterns: [],
    };
    
    // Analyze by level
    for (const escalation of escalations) {
      if (!analysis.byLevel[escalation.level]) {
        analysis.byLevel[escalation.level] = 0;
      }
      analysis.byLevel[escalation.level]++;
      
      // Analyze by medication
      const medId = escalation.medicationId.toString();
      if (!analysis.byMedication[medId]) {
        analysis.byMedication[medId] = {
          count: 0,
          name: escalation.medicationId.nickname,
        };
      }
      analysis.byMedication[medId].count++;
      
      // Count caregiver interventions
      if (escalation.caregiver.notified) {
        analysis.caregiverInterventions++;
      }
    }
    
    // Calculate average resolution time
    const resolved = escalations.filter(e => e.resolution.resolved);
    if (resolved.length > 0) {
      const totalTime = resolved.reduce((sum, e) => {
        const time = e.resolution.resolvedAt - e.createdAt;
        return sum + time;
      }, 0);
      analysis.averageResolutionTime = Math.floor(totalTime / resolved.length / 60000); // in minutes
    }
    
    // Identify patterns
    if (analysis.totalEscalations > 10) {
      if (analysis.byLevel[4] > 5 || analysis.byLevel[5] > 3) {
        analysis.patterns.push('High frequency of severe escalations - consider medication review');
      }
      
      // Check for problem medications
      Object.values(analysis.byMedication).forEach(med => {
        if (med.count > analysis.totalEscalations * 0.3) {
          analysis.patterns.push(`${med.name} accounts for >30% of escalations`);
        }
      });
    }
    
    return analysis;
  }
}

export const escalationService = new EscalationService();
export default escalationService;