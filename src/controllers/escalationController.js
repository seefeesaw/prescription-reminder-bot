import { whatsappService } from '../services/whatsappService.js';
import { voiceService } from '../services/voiceService.js';
import Schedule from '../models/Schedule.js';
import Medication from '../models/Medication.js';
import User from '../models/User.js';
import Escalation from '../models/Escalation.js';
import { logger } from '../utils/logger.js';
import { CONSTANTS } from '../config/constants.js';
import twilio from 'twilio';

class EscalationController {
  async handleEscalation(scheduleId, level) {
    try {
      const schedule = await Schedule.findById(scheduleId)
        .populate('userId')
        .populate('medicationId');
      
      if (!schedule || schedule.status !== 'sent') {
        logger.info('Schedule no longer needs escalation', { scheduleId });
        return;
      }
      
      const user = schedule.userId;
      const medication = schedule.medicationId;
      
      // Create escalation record
      const escalation = await Escalation.create({
        userId: user._id,
        medicationId: medication._id,
        scheduleId: schedule._id,
        level,
        type: this.getEscalationType(level),
        metadata: {
          criticalMedication: medication.medical.criticalMedication,
          adherenceRate: medication.adherence.rate,
        },
      });
      
      logger.info('Starting escalation', {
        escalationId: escalation._id,
        level,
        userId: user._id,
      });
      
      switch (level) {
        case 1:
          await this.sendUrgentReminder(user, medication, schedule);
          break;
        case 2:
          await this.sendVoiceReminder(user, medication, schedule);
          break;
        case 3:
          await this.makeVoiceCall(user, medication, schedule);
          break;
        case 4:
          await this.alertCaregiver(user, medication, schedule, escalation);
          break;
        case 5:
          await this.alertClinic(user, medication, schedule, escalation);
          break;
        default:
          logger.warn('Unknown escalation level', { level });
      }
      
      // Update schedule escalation info
      schedule.escalation.level = level;
      schedule.escalation.lastEscalatedAt = new Date();
      await schedule.save();
      
      // Schedule next escalation if no response
      if (level < CONSTANTS.LIMITS.MAX_ESCALATION_LEVEL) {
        setTimeout(() => {
          this.checkAndEscalate(scheduleId, level + 1);
        }, CONSTANTS.TIMEOUTS.ESCALATION_DELAY);
      }
      
    } catch (error) {
      logger.error('Escalation error:', error);
      throw error;
    }
  }
  
  async sendUrgentReminder(user, medication, schedule) {
    const displayName = medication.getDisplayName();
    const message = `🚨 *URGENT REMINDER*\n\n${displayName} was due ${this.getTimeAgo(schedule.scheduledTime)}.\n\nPlease take it now or let me know if you're skipping today.`;
    
    await whatsappService.sendMessage(user.whatsappId, {
      text: message,
      quickReplies: ['✅ Taking now', '⏰ In 15 mins', '❌ Skip today'],
    });
    
    logger.info('Urgent reminder sent', {
      userId: user._id,
      scheduleId: schedule._id,
    });
  }
  
  async sendVoiceReminder(user, medication, schedule) {
    if (!user.settings.voiceReminders) {
      // Fall back to urgent text
      return this.sendUrgentReminder(user, medication, schedule);
    }
    
    const displayName = medication.getDisplayName();
    const message = `Urgent reminder: Your ${displayName} was due ${this.getTimeAgo(schedule.scheduledTime)}. Please take it now.`;
    
    // Generate voice message in user's language
    const audioUrl = await voiceService.generateAudio(message, user.language);
    
    await whatsappService.sendVoiceNote(user.whatsappId, audioUrl);
    
    // Follow with text options
    await whatsappService.sendMessage(user.whatsappId, {
      text: "Please respond:",
      quickReplies: ['✅ Taken', '⏰ Taking soon', '❌ Skip'],
    });
    
    logger.info('Voice reminder sent', {
      userId: user._id,
      scheduleId: schedule._id,
    });
  }
  
  async makeVoiceCall(user, medication, schedule) {
    if (!process.env.ENABLE_VOICE_CALLS === 'true') {
      return this.sendVoiceReminder(user, medication, schedule);
    }
    
    try {
      const client = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      
      const displayName = medication.getDisplayName();
      const twiml = `
        <Response>
          <Say voice="alice" language="${this.getTwilioLanguage(user.language)}">
            This is your medication reminder. 
            Your ${displayName} was due ${this.getTimeAgo(schedule.scheduledTime)}.
            Please take it as soon as possible.
            Press 1 if you've taken it, 2 to snooze, or 3 to skip.
          </Say>
          <Gather numDigits="1" action="${process.env.SERVER_URL}/webhook/voice-response">
            <Say>Press 1 for taken, 2 to snooze, or 3 to skip.</Say>
          </Gather>
        </Response>
      `;
      
      const call = await client.calls.create({
        twiml,
        to: user.phoneNumber,
        from: process.env.TWILIO_WHATSAPP_NUMBER.replace('whatsapp:', ''),
      });
      
      logger.info('Voice call initiated', {
        userId: user._id,
        callSid: call.sid,
      });
      
    } catch (error) {
      logger.error('Voice call failed:', error);
      // Fall back to voice note
      await this.sendVoiceReminder(user, medication, schedule);
    }
  }
  
  async alertCaregiver(user, medication, schedule, escalation) {
    if (!user.caregivers || user.caregivers.length === 0) {
      logger.warn('No caregivers to alert', { userId: user._id });
      return;
    }
    
    const caregiver = user.caregivers[0]; // Alert primary caregiver
    const displayName = medication.getDisplayName();
    
    const message = `🚨 *Caregiver Alert*\n\n${user.name} hasn't taken their ${displayName} which was due ${this.getTimeAgo(schedule.scheduledTime)}.\n\nThis is ${caregiver.relationship ? `their ${caregiver.relationship}` : 'their caregiver'}.\n\nCan you please check on them?`;
    
    try {
      await whatsappService.sendMessage(caregiver.phoneNumber, {
        text: message,
        quickReplies: ['I\'ll check now', 'Call them', 'Already taken'],
      });
      
      // Update escalation record
      escalation.caregiver = {
        notified: true,
        phoneNumber: caregiver.phoneNumber,
        relationship: caregiver.relationship,
        notifiedAt: new Date(),
      };
      await escalation.save();
      
      // Update schedule
      schedule.escalation.caregiverAlerted = true;
      schedule.escalation.caregiverAlertedAt = new Date();
      await schedule.save();
      
      logger.info('Caregiver alerted', {
        userId: user._id,
        caregiverId: caregiver.phoneNumber,
      });
      
    } catch (error) {
      logger.error('Failed to alert caregiver:', error);
    }
  }
  
  async alertClinic(user, medication, schedule, escalation) {
    if (!user.subscription.clinicId) {
      logger.warn('No clinic associated with user', { userId: user._id });
      return;
    }
    
    // In production, integrate with clinic's system
    logger.info('Clinic alert would be sent', {
      userId: user._id,
      clinicId: user.subscription.clinicId,
      medicationId: medication._id,
    });
    
    // For now, send a final urgent message to user
    const message = `⚠️ *CRITICAL ALERT*\n\nYou've missed your ${medication.getDisplayName()} for over 2 hours.\n\n${medication.medical.criticalMedication ? 'This is a critical medication. ' : ''}Please take it immediately or contact your healthcare provider.`;
    
    await whatsappService.sendMessage(user.whatsappId, {
      text: message,
    });
  }
  
  getEscalationType(level) {
    const types = {
      1: 'urgent',
      2: 'voice_reminder',
      3: 'voice_call',
      4: 'caregiver',
      5: 'clinic',
    };
    return types[level] || 'unknown';
  }
  
  getTimeAgo(date) {
    const minutes = Math.floor((Date.now() - date) / 60000);
    
    if (minutes < 60) {
      return `${minutes} minutes ago`;
    } else if (minutes < 120) {
      return 'over an hour ago';
    } else {
      return `${Math.floor(minutes / 60)} hours ago`;
    }
  }
  
  getTwilioLanguage(language) {
    const languages = {
      en: 'en-US',
      zu: 'en-ZA',
      hi: 'hi-IN',
      ha: 'en-NG',
      sw: 'sw-KE',
      pt: 'pt-BR',
      es: 'es-MX',
    };
    return languages[language] || 'en-US';
  }
  
  async checkAndEscalate(scheduleId, nextLevel) {
    const schedule = await Schedule.findById(scheduleId);
    
    if (!schedule || schedule.status !== 'sent') {
      logger.info('Schedule resolved, canceling escalation', { scheduleId });
      return;
    }
    
    await this.handleEscalation(scheduleId, nextLevel);
  }
}

export const escalationController = new EscalationController();
export default escalationController; 