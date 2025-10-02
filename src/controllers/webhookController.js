import { messageController } from './messageController.js';
import { logger } from '../utils/logger.js';
import User from '../models/User.js';

export async function handleWhatsAppWebhook(req, res) {
  try {
    const { From, Body, ProfileName, MediaUrl0, MediaContentType0, MessageSid } = req.body;
    
    logger.info('Received WhatsApp message', {
      from: From,
      messageId: MessageSid,
      hasMedia: !!MediaUrl0,
    });
    
    // Get or create user
    let user = await User.findOne({ whatsappId: From });
    
    if (!user) {
      user = await User.create({
        whatsappId: From,
        phoneNumber: From,
        name: ProfileName || 'Friend',
      });
      logger.info('New user created', { userId: user._id });
    }
    
    // Update last active
    user.stats.lastActive = new Date();
    await user.save();
    
    // Process message based on type
    if (MediaUrl0) {
      await messageController.handleImageMessage(user, MediaUrl0, MediaContentType0);
    } else {
      await messageController.handleTextMessage(user, Body);
    }
    
    // Acknowledge receipt
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Webhook error:', error);
    res.status(500).send('Error processing message');
  }
}

export async function handleStatusCallback(req, res) {
  try {
    const { MessageSid, MessageStatus, ErrorCode } = req.body;
    
    logger.info('Message status update', {
      messageId: MessageSid,
      status: MessageStatus,
      error: ErrorCode,
    });
    
    // Update delivery status in database if needed
    
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Status callback error:', error);
    res.status(500).send('Error');
  }
}