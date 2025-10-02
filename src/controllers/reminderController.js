import { whatsappService } from '../services/whatsappService.js';
import { voiceService } from '../services/voiceService.js';
import { escalationService } from '../services/escalationService.js';
import Schedule from '../models/Schedule.js';
import Medication from '../models/Medication.js';
import User from '../models/User.js';
import { logger } from '../utils/logger.js';
import { CONSTANTS } from '../config/constants.js';

class ReminderController {
  async sendReminder(scheduleId) {
    try {
      const schedule = await Schedule.findById(scheduleId)
        .populate('userId')
        .populate('medicationId');
      
      if (!schedule || schedule.status !== 'pending') {
        return;
      }
      
      const user = schedule.userId;
      const medication = schedule.medicationId;
      
      // Check quiet hours
      if (this.isQuietHours(user)) {
        logger.info('Skipping reminder during quiet hours', {
          userId: user._id,
          scheduleId,
        });
        return;
      }
      
      // Build reminder message
      const displayName = medication.getDisplayName();
      const message = this.buildReminderMessage(displayName, schedule.dose);
      
      // Send based on user preferences
      if (user.settings.voiceReminders && user.isSubscribed()) {
        await this.sendVoiceReminder(user, message);
      } else {
        await this.sendTextReminder(user, message, medication);
      }
      
      // Update schedule status
      schedule.status = 'sent';
      schedule.reminders.push({
        sentAt: new Date(),
        type: 'initial',
        delivered: true,
      });
      await schedule.save();
      
      // Schedule escalation if needed
      if (user.settings.escalationEnabled) {
        await escalationService.scheduleEscalation(scheduleId, 1);
      }
      
      logger.info('Reminder sent', {
        userId: user._id,
        medicationId: medication._id,
        scheduleId,
      });
      
    } catch (error) {
      logger.error('Error sending reminder:', error);
      throw error;
    }
  }
  
  async sendTextReminder(user, message, medication) {
    const quickReplies = medication.settings.snoozeEnabled
      ? ['✅ Taken', '⏰ Snooze 30min', '❌ Skip']
      : ['✅ Taken', '❌ Skip'];
    
    await whatsappService.sendMessage(user.whatsappId, {
      text: message,
      quickReplies,
    });
  }
  
  async sendVoiceReminder(user, message) {
    // Generate voice message
    const audioUrl = await voiceService.generateAudio(message, user.language);
    
    // Send voice note
    await whatsappService.sendVoiceNote(user.whatsappId, audioUrl);
    
    // Follow up with text buttons
    await whatsappService.sendMessage(user.whatsappId, {
      text: "Reply with:",
      quickReplies: ['✅ Taken', '⏰ Snooze', '❌ Skip'],
    });
  }
  
  buildReminderMessage(medicationName, dose) {
    const messages = [
      `⏰ Time for your ${medicationName}!\n\n${dose.amount} ${dose.unit}`,
      `💊 Medication reminder: ${medicationName}\n\nPlease take ${dose.amount} ${dose.unit}`,
      `🔔 Don't forget: ${medicationName}\n\n${dose.amount} ${dose.unit}`,
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  isQuietHours(user) {
    if (!user.settings.quietHours.enabled) return false;
    
    const now = new Date();
    const currentHour = now.getHours();
    const start = parseInt(user.settings.quietHours.start.split(':')[0]);
    const end = parseInt(user.settings.quietHours.end.split(':')[0]);
    
    if (start <= end) {
      return currentHour >= start && currentHour < end;
    } else {
      return currentHour >= start || currentHour < end;
    }
  }
  
  async handleReminderResponse(userId, response) {
    try {
      const schedule = await Schedule.findOne({
        userId,
        status: 'sent',
      }).sort({ scheduledTime: -1 });
      
      if (!schedule) {
        logger.warn('No pending schedule found for response', { userId, response });
        return;
      }
      
      const medication = await Medication.findById(schedule.medicationId);
      
      switch (response.toLowerCase()) {
        case 'taken':
        case '✅':
        case 'done':
          await this.handleTaken(schedule, medication);
          break;
          
        case 'snooze':
        case '⏰':
        case 'later':
          await this.handleSnooze(schedule, medication);
          break;
          
        case 'skip':
        case '❌':
        case 'no':
          await this.handleSkip(schedule, medication);
          break;
          
        default:
          logger.warn('Unknown reminder response', { userId, response });
      }
    } catch (error) {
      logger.error('Error handling reminder response:', error);
      throw error;
    }
  }
  
  async handleTaken(schedule, medication) {
    schedule.status = 'taken';
    schedule.actualTime = new Date();
    schedule.userResponse = {
      action: 'taken',
      timestamp: new Date(),
      method: 'whatsapp',
    };
    await schedule.save();
    
    // Update adherence
    medication.adherence.taken++;
    medication.adherence.lastTaken = new Date();
    medication.adherence.streak++;
    medication.updateAdherenceRate();
    
    // Update supply if tracked
    if (medication.supply.remainingQuantity > 0) {
      medication.supply.remainingQuantity--;
      
      // Check if refill needed
      if (medication.needsRefill()) {
        await this.sendRefillReminder(medication);
      }
    }
    
    await medication.save();
    
    logger.info('Medication marked as taken', {
      scheduleId: schedule._id,
      medicationId: medication._id,
    });
  }
  
  async handleSnooze(schedule, medication) {
    const snoozeMinutes = 30;
    
    schedule.status = 'snoozed';
    schedule.snooze.count++;
    schedule.snooze.until = new Date(Date.now() + snoozeMinutes * 60 * 1000);
    schedule.userResponse = {
      action: 'snoozed',
      timestamp: new Date(),
      method: 'whatsapp',
    };
    await schedule.save();
    
    // Update adherence
    medication.adherence.snoozed++;
    await medication.save();
    
    // Reschedule reminder
    await schedulerService.snoozeReminder(schedule._id, snoozeMinutes);
    
    logger.info('Reminder snoozed', {
      scheduleId: schedule._id,
      snoozeUntil: schedule.snooze.until,
    });
  }
  
  async handleSkip(schedule, medication) {
    schedule.status = 'skipped';
    schedule.userResponse = {
      action: 'skipped',
      timestamp: new Date(),
      method: 'whatsapp',
    };
    await schedule.save();
    
    // Update adherence
    medication.adherence.missed++;
    medication.adherence.streak = 0; // Reset streak
    medication.updateAdherenceRate();
    await medication.save();
    
    logger.info('Medication skipped', {
      scheduleId: schedule._id,
      medicationId: medication._id,
    });
  }
  
  async sendRefillReminder(medication) {
    const user = await User.findById(medication.userId);
    const daysRemaining = Math.floor(
      medication.supply.remainingQuantity / medication.schedule.times.length
    );
    
    const message = `📦 *Refill Reminder*\n\nYour ${medication.nickname} will run out in ${daysRemaining} days.\n\nWould you like me to remind you again later?`;
    
    await whatsappService.sendMessage(user.whatsappId, {
      text: message,
      quickReplies: ['Remind tomorrow', 'Remind in 3 days', 'Don\'t remind'],
    });
  }
}

export const reminderController = new ReminderController();
export default reminderController;