import twilio from 'twilio';
import axios from 'axios';
import { logger } from '../utils/logger.js';

class WhatsAppService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  }
  
  async sendMessage(to, { text, quickReplies, mediaUrl }) {
    try {
      const messageOptions = {
        from: this.fromNumber,
        to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        body: text,
      };
      
      // Add media if provided
      if (mediaUrl) {
        messageOptions.mediaUrl = [mediaUrl];
      }
      
      // Format quick replies
      if (quickReplies && quickReplies.length > 0) {
        messageOptions.body += '\n\n' + quickReplies.map((reply, index) => 
          `${index + 1}. ${reply}`
        ).join('\n');
      }
      
      const message = await this.client.messages.create(messageOptions);
      
      logger.info('WhatsApp message sent', {
        messageId: message.sid,
        to,
      });
      
      return message;
    } catch (error) {
      logger.error('Failed to send WhatsApp message:', error);
      throw error;
    }
  }
  
  async sendVoiceNote(to, audioUrl) {
    try {
      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        mediaUrl: [audioUrl],
      });
      
      logger.info('Voice note sent', {
        messageId: message.sid,
        to,
      });
      
      return message;
    } catch (error) {
      logger.error('Failed to send voice note:', error);
      throw error;
    }
  }
  
  async sendTemplate(to, templateName, params) {
    try {
      // For approved WhatsApp templates (production)
      const message = await this.client.messages.create({
        from: this.fromNumber,
        to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        contentSid: templateName,
        contentVariables: JSON.stringify(params),
      });
      
      return message;
    } catch (error) {
      logger.error('Failed to send template:', error);
      throw error;
    }
  }
  
  async downloadMedia(mediaUrl) {
    try {
      const response = await axios.get(mediaUrl, {
        responseType: 'arraybuffer',
        auth: {
          username: process.env.TWILIO_ACCOUNT_SID,
          password: process.env.TWILIO_AUTH_TOKEN,
        },
      });
      
      return Buffer.from(response.data);
    } catch (error) {
      logger.error('Failed to download media:', error);
      throw error;
    }
  }
  
  async sendBulkMessages(recipients, message) {
    const results = [];
    
    for (const recipient of recipients) {
      try {
        const result = await this.sendMessage(recipient, message);
        results.push({ success: true, recipient, messageId: result.sid });
      } catch (error) {
        logger.error(`Failed to send to ${recipient}:`, error);
        results.push({ success: false, recipient, error: error.message });
      }
    }
    
    return results;
  }
  
  formatPhoneNumber(phoneNumber) {
    // Remove any non-digit characters
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code if missing
    if (!cleaned.startsWith('1') && cleaned.length === 10) {
      return `+1${cleaned}`; // US numbers
    }
    
    return `+${cleaned}`;
  }
  
  isValidWhatsAppNumber(phoneNumber) {
    // Basic validation
    const pattern = /^\+[1-9]\d{1,14}$/;
    return pattern.test(phoneNumber);
  }
}

export const whatsappService = new WhatsAppService();
export default whatsappService;