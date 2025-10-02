import dotenv from 'dotenv';
import { connectDB } from '../src/config/database.js';
import User from '../src/models/User.js';
import Medication from '../src/models/Medication.js';
import { logger } from '../src/utils/logger.js';

dotenv.config();

async function seed() {
  try {
    await connectDB();
    
    // Create test user
    const user = await User.create({
      phoneNumber: '+1234567890',
      whatsappId: 'whatsapp:+1234567890',
      name: 'Test User',
      language: 'en',
      timezone: 'America/New_York',
      state: 'active',
      flags: {
        hasCompletedOnboarding: true,
      },
    });
    
    // Create test medications
    const medications = [
      {
        userId: user._id,
        nickname: 'Morning pill',
        privacyLevel: 2,
        schedule: {
          times: [
            { time: '08:00', dose: '1', withFood: false },
          ],
          frequency: 'daily',
          duration: 30,
        },
        status: 'active',
      },
      {
        userId: user._id,
        nickname: 'Evening medicine',
        privacyLevel: 2,
        schedule: {
          times: [
            { time: '20:00', dose: '2', withFood: true },
          ],
          frequency: 'daily',
          duration: 30,
        },
        status: 'active',
      },
    ];
    
    for (const med of medications) {
      await Medication.create(med);
    }
    
    logger.info('Database seeded successfully');
    process.exit(0);
  } catch (error) {
    logger.error('Seed error:', error);
    process.exit(1);
  }
}

seed();