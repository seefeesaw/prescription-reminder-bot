import Queue from 'bull';
import { logger } from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class ReminderQueue {
  constructor() {
    this.queue = new Queue('reminders', REDIS_URL, {
      defaultJobOptions: {
        removeOnComplete: 100,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.queue.on('error', (error) => {
      logger.error('Reminder queue error:', error);
    });
    
    this.queue.on('failed', (job, error) => {
      logger.error('Reminder job failed', {
        jobId: job.id,
        scheduleId: job.data.scheduleId,
        error: error.message,
      });
    });
    
    this.queue.on('completed', (job) => {
      logger.info('Reminder job completed', {
        jobId: job.id,
        scheduleId: job.data.scheduleId,
      });
    });
  }
  
  async addReminder({ scheduleId, scheduledTime, isSnoozed = false }) {
    const delay = scheduledTime.getTime() - Date.now();
    
    if (delay < 0) {
      logger.warn('Attempted to schedule reminder in the past', {
        scheduleId,
        scheduledTime,
      });
      return null;
    }
    
    const job = await this.queue.add(
      'send-reminder',
      {
        scheduleId,
        isSnoozed,
        scheduledTime: scheduledTime.toISOString(),
      },
      {
        delay,
        jobId: `reminder-${scheduleId}-${Date.now()}`,
      }
    );
    
    logger.info('Reminder queued', {
      jobId: job.id,
      scheduleId,
      delay: Math.floor(delay / 1000) + 's',
    });
    
    return job;
  }
  
  async removeByScheduleId(scheduleId) {
    const jobs = await this.queue.getJobs(['delayed', 'waiting']);
    const toRemove = jobs.filter(job => job.data.scheduleId === scheduleId);
    
    for (const job of toRemove) {
      await job.remove();
    }
    
    logger.info('Removed reminder jobs', {
      scheduleId,
      count: toRemove.length,
    });
    
    return toRemove.length;
  }
  
  async removeByMedicationId(medicationId) {
    // Implementation would require storing medicationId in job data
    logger.info('Removing reminders by medication ID', { medicationId });
  }
  
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.queue.getWaitingCount(),
      this.queue.getActiveCount(),
      this.queue.getCompletedCount(),
      this.queue.getFailedCount(),
      this.queue.getDelayedCount(),
    ]);
    
    return {
      waiting,
      active,
      completed,
      failed,
      delayed,
      total: waiting + active + delayed,
    };
  }
  
  async clearQueue() {
    await this.queue.empty();
    logger.warn('Reminder queue cleared');
  }
}

export const reminderQueue = new ReminderQueue();
export default reminderQueue;