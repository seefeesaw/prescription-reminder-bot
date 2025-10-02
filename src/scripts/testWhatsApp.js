import dotenv from 'dotenv';
import { whatsappService } from '../src/services/whatsappService.js';

dotenv.config();

async function test() {
  try {
    const testNumber = process.argv[2];
    
    if (!testNumber) {
      console.error('Usage: npm run test:whatsapp +1234567890');
      process.exit(1);
    }
    
    const result = await whatsappService.sendMessage(testNumber, {
      text: '🎉 WhatsApp connection successful!\n\nYour prescription reminder bot is ready.',
      quickReplies: ['Get started', 'Learn more'],
    });
    
    console.log('Message sent:', result.sid);
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

test();