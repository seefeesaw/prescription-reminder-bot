import { escalationQueue } from '../escalationQueue.js';
import { escalationController } from '../../controllers/escalationController.js';
import { logger } from '../../utils/logger.js';

export function startEscalationWorker() {
  escalationQueue.queue.process('process-escalation', async (job) => {
    const { scheduleId, level } = job.data;
    
    try {
      logger.info('Processing escalation', {
        scheduleId,
        level,
      });
      
      await escalationController.handleEscalation(scheduleId, level);
      
      return { success: true, scheduleId, level };
    } catch (error) {
      logger.error('Escalation worker error:', error);
      throw error;
    }
  });
  
  logger.info('Escalation worker started');
}