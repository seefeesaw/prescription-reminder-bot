import OpenAI from 'openai';
import vision from '@google-cloud/vision';
import { logger } from '../utils/logger.js';

// OpenAI configuration
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Google Vision configuration
const visionClient = new vision.ImageAnnotatorClient({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
  projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
});

export { openai, visionClient };

// Test connections
export async function testAIServices() {
  try {
    // Test OpenAI
    const completion = await openai.chat.completions.create({
      messages: [{ role: 'user', content: 'Say "OK" if you can hear me' }],
      model: process.env.OPENAI_MODEL || 'gpt-4',
      max_tokens: 10,
    });
    logger.info('OpenAI connection successful');
    
    return true;
  } catch (error) {
    logger.error('AI service test failed:', error);
    return false;
  }
}