import Queue from 'bull';
import { logger } from '../utils/logger.js';

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

class EscalationQueue {
  constructor() {
    this.queue = new Queue('escalations', REDIS_URL, {
      defaultJobOptions: {
        removeOnComplete: 50,
        removeOnFail: 25,
        attempts: 2,
        backoff: {
          type: 'fixed',
          delay: 30000, // 30 seconds
        },
      },
    });
    
    this.setupEventHandlers();
  }
  
  setupEventHandlers() {
    this.queue.on('error', (error) => {
      logger.error('Escalation queue error:', error);
    });
    
    this.queue.on('failed', (job, error) => {
      logger.error('Escalation job failed', {
        jobId: job.id,
        scheduleId: job.data.scheduleId,
        level: job.data.level,
        error: error.message,
      });
    });
  }
  
  async addEscalation({ scheduleId, level, scheduledFor }) {
    const delay = scheduledFor.getTime() - Date.now();
    
    const job = await this.queue.add(
      'process-escalation',
      {
        scheduleId,
        level,
        scheduledFor: scheduledFor.toISOString(),
      },
      {
        delay,
        jobId: `escalation-${scheduleId}-${level}-${Date.now()}`,
      }
    );
    
    logger.info('Escalation queued', {
      jobId: job.id,
      scheduleId,
      level,
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
    
    logger.info('Removed escalation jobs', {
      scheduleId,
      count: toRemove.length,
    });
    
    return toRemove.length;
  }
}

export const escalationQueue = new EscalationQueue();
export default escalationQueue;