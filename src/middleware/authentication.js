import twilio from 'twilio';
import { logger } from '../utils/logger.js';

export function authentication(req, res, next) {
  // Verify Twilio webhook signature
  const twilioSignature = req.headers['x-twilio-signature'];
  
  if (!twilioSignature) {
    logger.warn('Missing Twilio signature');
    return res.status(401).send('Unauthorized');
  }
  
  const url = `${process.env.SERVER_URL}${req.originalUrl}`;
  const params = req.body;
  
  const isValid = twilio.validateRequest(
    process.env.TWILIO_AUTH_TOKEN,
    twilioSignature,
    url,
    params
  );
  
  if (!isValid) {
    logger.warn('Invalid Twilio signature');
    return res.status(401).send('Unauthorized');
  }
  
  next();
}