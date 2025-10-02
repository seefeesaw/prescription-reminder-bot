import { startReminderWorker } from './reminderWorker.js';
import { startEscalationWorker } from './escalationWorker.js';
import { logger } from '../../utils/logger.js';

export function startWorkers() {
  try {
    startReminderWorker();
    startEscalationWorker();
    logger.info('All background workers started successfully');
  } catch (error) {
    logger.error('Failed to start workers:', error);
    throw error;
  }
}
