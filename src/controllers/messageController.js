import { whatsappService } from '../services/whatsappService.js';
import { ocrService } from '../services/ocrService.js';
import { aiParserService } from '../services/aiParserService.js';
import { schedulerService } from '../services/schedulerService.js';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';
import Medication from '../models/Medication.js';
import { CONSTANTS } from '../config/constants.js';

class MessageController {
  async handleTextMessage(user, message) {
    const lowerMessage = message.toLowerCase().trim();
    
    // Check user state
    if (user.state === CONSTANTS.USER_STATES.NEW) {
      return this.handleOnboarding(user, message);
    }
    
    // Handle common commands
    if (lowerMessage === 'help') {
      return this.sendHelpMessage(user);
    }
    
    if (lowerMessage === 'status') {
      return this.sendStatusMessage(user);
    }
    
    if (lowerMessage.startsWith('add')) {
      return this.handleAddMedication(user, message);
    }
    
    // Check if it's a reminder response
    if (['taken', 'done', '✅'].includes(lowerMessage)) {
      return this.handleMedicationTaken(user);
    }
    
    if (['snooze', '⏰'].includes(lowerMessage)) {
      return this.handleSnooze(user);
    }
    
    // Default response
    await whatsappService.sendMessage(user.whatsappId, {
      text: "I didn't understand that. Send 'help' for options or upload a prescription photo.",
    });
  }
  
  async handleImageMessage(user, mediaUrl, contentType) {
    try {
      // Send processing message
      await whatsappService.sendMessage(user.whatsappId, {
        text: "📸 Got your prescription! Let me read that for you...",
      });
      
      // Download and process image
      const imageBuffer = await whatsappService.downloadMedia(mediaUrl);
      
      // Extract text using OCR
      const ocrResult = await ocrService.extractText(imageBuffer);
      
      if (!ocrResult.text) {
        return whatsappService.sendMessage(user.whatsappId, {
          text: "I couldn't read the prescription clearly. Can you take another photo with better lighting?",
        });
      }
      
      // Parse prescription with AI
      const prescription = await aiParserService.parsePrescription(ocrResult.text, user._id);
      
      // Create medication entries
      for (const med of prescription.medications) {
        // Ask user for nickname
        await whatsappService.sendMessage(user.whatsappId, {
          text: `I found: ${med.description}\n\nWhat would you like me to call this medication?`,
          quickReplies: [
            med.suggestedNickname,
            `${med.color} pill`,
            'Morning medicine',
            'Use real name',
          ],
        });
        
        // Store medication with temporary nickname
        const medication = new Medication({
          userId: user._id,
          nickname: med.suggestedNickname,
          visual: {
            color: med.color,
            shape: med.shape,
            imageUrl: mediaUrl,
          },
          schedule: med.schedule,
          privacyLevel: user.settings.defaultPrivacyLevel,
          status: 'active',
        });
        
        // Encrypt actual medication name
        if (med.actualName) {
          medication.encryptedData.actualName = medication.encryptSensitiveData({
            name: med.actualName,
            dosage: med.dosage,
          });
        }
        
        await medication.save();
        
        // Create schedules
        await schedulerService.createSchedules(medication);
        
        logger.info('Medication created from image', {
          userId: user._id,
          medicationId: medication._id,
        });
      }
      
      // Update user flags
      user.flags.hasUploadedPrescription = true;
      user.stats.totalMedications = await Medication.countDocuments({
        userId: user._id,
        status: 'active',
      });
      await user.save();
      
      // Send confirmation
      await whatsappService.sendMessage(user.whatsappId, {
        text: `✅ All set! I'll remind you to take your medications on time.\n\nYou can always:\n• Send 'status' to check your medications\n• Send 'help' for more options`,
      });
      
    } catch (error) {
      logger.error('Error processing image:', error);
      await whatsappService.sendMessage(user.whatsappId, {
        text: "Sorry, I had trouble processing that image. Please try again or type your medication details.",
      });
    }
  }
  
  async handleOnboarding(user, message) {
    const step = user.onboardingStep || 0;
    
    switch (step) {
      case 0:
        // Welcome message
        await whatsappService.sendMessage(user.whatsappId, {
          text: `Welcome! 👋 I'm your medication reminder assistant.\n\nI can help you remember to take your medications on time.\n\nWhat should I call you?`,
        });
        user.onboardingStep = 1;
        break;
        
      case 1:
        // Save name
        user.name = message.trim();
        user.onboardingStep = 2;
        await whatsappService.sendMessage(user.whatsappId, {
          text: `Nice to meet you, ${user.name}!\n\nWhat timezone are you in?\n\nExamples:\n• Johannesburg (GMT+2)\n• Lagos (GMT+1)\n• London (GMT)\n• New Delhi (GMT+5:30)`,
        });
        break;
        
      case 2:
        // Save timezone
        user.timezone = message.trim(); // In production, validate timezone
        user.onboardingStep = 3;
        await whatsappService.sendMessage(user.whatsappId, {
          text: `Great! Now you can:\n\n📸 Send a photo of your prescription\n✍️ Type your medication details\n\nWhich would you prefer?`,
          quickReplies: ['Upload photo', 'Type details', 'Skip for now'],
        });
        break;
        
      case 3:
        // Complete onboarding
        user.state = CONSTANTS.USER_STATES.ACTIVE;
        user.flags.hasCompletedOnboarding = true;
        await whatsappService.sendMessage(user.whatsappId, {
          text: `Perfect! You're all set up.\n\nYou can start by:\n• Sending a prescription photo\n• Typing "add [medication name]"\n• Sending "help" for all options\n\nI'm here whenever you need me! 💊`,
        });
        break;
    }
    
    await user.save();
  }
  
  async handleMedicationTaken(user) {
    // Find most recent pending reminder
    const schedule = await Schedule.findOne({
      userId: user._id,
      status: 'sent',
    }).sort({ scheduledTime: -1 });
    
    if (!schedule) {
      return whatsappService.sendMessage(user.whatsappId, {
        text: "Great! But I don't see any pending medications right now.",
      });
    }
    
    // Mark as taken
    schedule.recordResponse('taken');
    await schedule.save();
    
    // Update medication adherence
    const medication = await Medication.findById(schedule.medicationId);
    medication.adherence.taken++;
    medication.adherence.streak++;
    medication.updateAdherenceRate();
    await medication.save();
    
    // Send confirmation
    await whatsappService.sendMessage(user.whatsappId, {
      text: `✅ Great job! ${medication.nickname} marked as taken.\n\nStreak: ${medication.adherence.streak} days 🔥`,
    });
  }
  
  async handleSnooze(user) {
    const schedule = await Schedule.findOne({
      userId: user._id,
      status: 'sent',
    }).sort({ scheduledTime: -1 });
    
    if (!schedule) {
      return whatsappService.sendMessage(user.whatsappId, {
        text: "No pending medications to snooze right now.",
      });
    }
    
    // Snooze for 30 minutes
    schedule.recordResponse('snoozed');
    await schedule.save();
    
    // Reschedule reminder
    await schedulerService.snoozeReminder(schedule._id, 30);
    
    await whatsappService.sendMessage(user.whatsappId, {
      text: "⏰ I'll remind you again in 30 minutes.",
    });
  }
  
  async sendHelpMessage(user) {
    const helpText = `
Here's what I can do:

📸 *Upload prescription* - Send a photo
➕ *Add medication* - Type "add [name]"
📊 *Check status* - Type "status"
⏸ *Pause reminders* - Type "pause"
▶️ *Resume reminders* - Type "resume"
👥 *Add caregiver* - Type "caregiver"
⚙️ *Settings* - Type "settings"

*Quick responses for reminders:*
✅ Taken / Done
⏰ Snooze
❌ Skip

Need anything else? Just ask!
    `;
    
    await whatsappService.sendMessage(user.whatsappId, { text: helpText });
  }
  
  async sendStatusMessage(user) {
    const medications = await Medication.find({
      userId: user._id,
      status: 'active',
    });
    
    if (medications.length === 0) {
      return whatsappService.sendMessage(user.whatsappId, {
        text: "You don't have any active medications. Send a prescription photo to get started!",
      });
    }
    
    let statusText = `*Your Medications:*\n\n`;
    
    for (const med of medications) {
      statusText += `💊 *${med.nickname}*\n`;
      statusText += `   Schedule: ${med.schedule.times.map(t => t.time).join(', ')}\n`;
      statusText += `   Adherence: ${med.adherence.rate}%\n`;
      statusText += `   Streak: ${med.adherence.streak} days\n\n`;
    }
    
    const adherence = await AdherenceLog.calculateAdherence(user._id, 7);
    statusText += `*Weekly Adherence: ${Math.round(adherence.adherenceRate)}%*`;
    
    await whatsappService.sendMessage(user.whatsappId, { text: statusText });
  }
}

export const messageController = new MessageController();
export default messageController;