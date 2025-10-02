import twilio from 'twilio';
import { logger } from '../utils/logger.js';

let twilioClient;

export async function initWhatsApp() {
  try {
    twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    // Verify connection by fetching account details
    const account = await twilioClient.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    logger.info(`WhatsApp initialized for account: ${account.friendlyName}`);
    
    return twilioClient;
  } catch (error) {
    logger.error('WhatsApp initialization error:', error);
    throw error;
  }
}

export function getTwilioClient() {
  if (!twilioClient) {
    throw new Error('Twilio client not initialized');
  }
  return twilioClient;
}

export default { initWhatsApp, getTwilioClient };