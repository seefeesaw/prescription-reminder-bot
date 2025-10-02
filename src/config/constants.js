export const CONSTANTS = {
  // User states
  USER_STATES: {
    NEW: 'new',
    ONBOARDING: 'onboarding',
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  },
  
  // Message types
  MESSAGE_TYPES: {
    TEXT: 'text',
    IMAGE: 'image',
    VOICE: 'voice',
    LOCATION: 'location',
  },
  
  // Medication privacy levels
  PRIVACY_LEVELS: {
    ANONYMOUS: 1,      // "Your medication"
    SHAPE_COLOR: 2,    // "White round pill"
    TIMING: 3,         // "Morning medication"
    PURPOSE_HINT: 4,   // "Sugar pill"
    GENERIC_NAME: 5,   // "Metformin"
    FULL_CONTEXT: 6,   // "Metformin 500mg for diabetes"
  },
  
  // Escalation levels
  ESCALATION_LEVELS: {
    REMINDER: 1,       // Simple reminder
    URGENT: 2,         // Urgent reminder with sound
    VOICE_CALL: 3,     // Voice call
    CAREGIVER: 4,      // Alert caregiver
    CLINIC: 5,         // Alert clinic
  },
  
  // Time constants (in milliseconds)
  TIMEOUTS: {
    REMINDER_SNOOZE: 30 * 60 * 1000,        // 30 minutes
    ESCALATION_DELAY: 15 * 60 * 1000,       // 15 minutes
    RESPONSE_TIMEOUT: 60 * 60 * 1000,       // 1 hour
    SESSION_TIMEOUT: 24 * 60 * 60 * 1000,   // 24 hours
  },
  
  // Limits
  LIMITS: {
    MAX_MEDICATIONS: 20,
    MAX_REMINDERS_PER_DAY: 10,
    MAX_CAREGIVERS: 3,
    MAX_IMAGE_SIZE: 10 * 1024 * 1024, // 10MB
    MAX_NICKNAME_LENGTH: 50,
  },
  
  // Default nicknames
  DEFAULT_NICKNAMES: [
    'Morning medicine',
    'Evening medicine',
    'White pill',
    'Blue pill',
    'Daily vitamin',
    'Doctor\'s orders',
    'Health helper',
    'My medication',
  ],
  
  // Quick replies
  QUICK_REPLIES: {
    CONFIRMATION: ['✅ Taken', '⏰ Snooze 30min', '❌ Skip today'],
    YES_NO: ['Yes', 'No'],
    PRIVACY: ['Keep it private', 'Use real name'],
  },
  
  // Supported languages
  LANGUAGES: {
    en: 'English',
    zu: 'isiZulu',
    hi: 'Hindi',
    ha: 'Hausa',
    sw: 'Swahili',
    pt: 'Portuguese',
    es: 'Spanish',
  },
};

export default CONSTANTS;