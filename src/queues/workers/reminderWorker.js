import { reminderQueue } from '../reminderQueue.js';
import { reminderController } from '../../controllers/reminderController.js';
import { logger } from '../../utils/logger.js';

export function startReminderWorker() {
  reminderQueue.queue.process('send-reminder', async (job) => {
    const { scheduleId, isSnoozed } = job.data;
    
    try {
      logger.info('Processing reminder', {
        scheduleId,
        isSnoozed,
      });
      
      await reminderController.sendReminder(scheduleId);
      
      return { success: true, scheduleId };
    } catch (error) {
      logger.error('Reminder worker error:', error);
      throw error;
    }
  });
  
  logger.info('Reminder worker started');
}