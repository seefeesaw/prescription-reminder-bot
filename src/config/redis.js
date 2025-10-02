import { createClient } from 'redis';
import { logger } from '../utils/logger.js';

let redisClient;

export async function initRedis() {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => {
          if (retries > 10) {
            logger.error('Redis: Max reconnection attempts reached');
            return new Error('Max reconnection attempts reached');
          }
          return Math.min(retries * 100, 3000);
        },
      },
    });
    
    redisClient.on('error', (err) => logger.error('Redis error:', err));
    redisClient.on('connect', () => logger.info('Redis connected'));
    redisClient.on('reconnecting', () => logger.warn('Redis reconnecting...'));
    
    await redisClient.connect();
    return redisClient;
  } catch (error) {
    logger.error('Redis initialization error:', error);
    throw error;
  }
}

export function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}

export default { initRedis, getRedisClient };