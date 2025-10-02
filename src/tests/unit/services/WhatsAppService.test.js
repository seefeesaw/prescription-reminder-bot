import { jest } from '@jest/globals';
import { whatsappService } from '../services/WhatsAppService.js';
import twilio from 'twilio';
import axios from 'axios';
import { logger } from '../utils/logger.js';

// Mock dependencies
jest.mock('twilio');
jest.mock('axios');
jest.mock('../utils/logger.js');

describe('WhatsAppService', () => {
  let mockClient;
  let mockMessages;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Twilio client
    mockMessages = {
      create: jest.fn(),
    };

    mockClient = {
      messages: mockMessages,
    };

    twilio.mockReturnValue(mockClient);

    // Set environment variables
    process.env.TWILIO_ACCOUNT_SID = 'test-account-sid';
    process.env.TWILIO_AUTH_TOKEN = 'test-auth-token';
    process.env.TWILIO_WHATSAPP_NUMBER = 'whatsapp:+15551234567';
  });

  describe('constructor', () => {
    it('should initialize Twilio client with credentials', () => {
      expect(twilio).toHaveBeenCalledWith(
        'test-account-sid',
        'test-auth-token'
      );
    });

    it('should set from number from environment', () => {
      expect(whatsappService.fromNumber).toBe('whatsapp:+15551234567');
    });
  });

  describe('sendMessage', () => {
    const to = '+15559876543';
    const message = { text: 'Hello World' };

    beforeEach(() => {
      mockMessages.create.mockResolvedValue({
        sid: 'SM123456789',
        status: 'queued',
      });
    });

    it('should send basic text message successfully', async () => {
      const result = await whatsappService.sendMessage(to, message);

      expect(mockMessages.create).toHaveBeenCalledWith({
        from: 'whatsapp:+15551234567',
        to: 'whatsapp:+15559876543',
        body: 'Hello World',
      });

      expect(result.sid).toBe('SM123456789');
    });

    it('should add whatsapp prefix if not present', async () => {
      await whatsappService.sendMessage(to, message);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.to).toBe('whatsapp:+15559876543');
    });

    it('should not add whatsapp prefix if already present', async () => {
      await whatsappService.sendMessage('whatsapp:+15559876543', message);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.to).toBe('whatsapp:+15559876543');
    });

    it('should include media URL when provided', async () => {
      const messageWithMedia = {
        text: 'Check this out',
        mediaUrl: 'https://example.com/image.jpg',
      };

      await whatsappService.sendMessage(to, messageWithMedia);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.mediaUrl).toEqual(['https://example.com/image.jpg']);
    });

    it('should format quick replies as numbered list', async () => {
      const messageWithReplies = {
        text: 'Choose an option',
        quickReplies: ['Yes', 'No', 'Maybe'],
      };

      await whatsappService.sendMessage(to, messageWithReplies);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.body).toBe(
        'Choose an option\n\n1. Yes\n2. No\n3. Maybe'
      );
    });

    it('should handle empty quick replies array', async () => {
      const messageWithEmptyReplies = {
        text: 'Hello',
        quickReplies: [],
      };

      await whatsappService.sendMessage(to, messageWithEmptyReplies);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.body).toBe('Hello');
    });

    it('should handle message with both media and quick replies', async () => {
      const complexMessage = {
        text: 'Check this',
        mediaUrl: 'https://example.com/image.jpg',
        quickReplies: ['Like', 'Share'],
      };

      await whatsappService.sendMessage(to, complexMessage);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.body).toContain('1. Like');
      expect(createCall.body).toContain('2. Share');
      expect(createCall.mediaUrl).toEqual(['https://example.com/image.jpg']);
    });

    it('should log successful message send', async () => {
      await whatsappService.sendMessage(to, message);

      expect(logger.info).toHaveBeenCalledWith(
        'WhatsApp message sent',
        {
          messageId: 'SM123456789',
          to,
        }
      );
    });

    it('should handle send errors', async () => {
      const error = new Error('Twilio API error');
      mockMessages.create.mockRejectedValue(error);

      await expect(
        whatsappService.sendMessage(to, message)
      ).rejects.toThrow('Twilio API error');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send WhatsApp message:',
        error
      );
    });

    it('should handle message without quick replies', async () => {
      const simpleMessage = {
        text: 'Hello',
        quickReplies: null,
      };

      await whatsappService.sendMessage(to, simpleMessage);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.body).toBe('Hello');
    });

    it('should handle undefined quick replies', async () => {
      const simpleMessage = {
        text: 'Hello',
      };

      await whatsappService.sendMessage(to, simpleMessage);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.body).toBe('Hello');
    });
  });

  describe('sendVoiceNote', () => {
    const to = '+15559876543';
    const audioUrl = 'https://example.com/audio.mp3';

    beforeEach(() => {
      mockMessages.create.mockResolvedValue({
        sid: 'SM987654321',
        status: 'queued',
      });
    });

    it('should send voice note successfully', async () => {
      const result = await whatsappService.sendVoiceNote(to, audioUrl);

      expect(mockMessages.create).toHaveBeenCalledWith({
        from: 'whatsapp:+15551234567',
        to: 'whatsapp:+15559876543',
        mediaUrl: [audioUrl],
      });

      expect(result.sid).toBe('SM987654321');
    });

    it('should add whatsapp prefix if not present', async () => {
      await whatsappService.sendVoiceNote(to, audioUrl);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.to).toBe('whatsapp:+15559876543');
    });

    it('should not add whatsapp prefix if already present', async () => {
      await whatsappService.sendVoiceNote('whatsapp:+15559876543', audioUrl);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.to).toBe('whatsapp:+15559876543');
    });

    it('should log successful voice note send', async () => {
      await whatsappService.sendVoiceNote(to, audioUrl);

      expect(logger.info).toHaveBeenCalledWith(
        'Voice note sent',
        {
          messageId: 'SM987654321',
          to,
        }
      );
    });

    it('should handle send errors', async () => {
      const error = new Error('Failed to send voice note');
      mockMessages.create.mockRejectedValue(error);

      await expect(
        whatsappService.sendVoiceNote(to, audioUrl)
      ).rejects.toThrow('Failed to send voice note');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send voice note:',
        error
      );
    });

    it('should send mediaUrl as array', async () => {
      await whatsappService.sendVoiceNote(to, audioUrl);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(Array.isArray(createCall.mediaUrl)).toBe(true);
      expect(createCall.mediaUrl[0]).toBe(audioUrl);
    });
  });

  describe('sendTemplate', () => {
    const to = '+15559876543';
    const templateName = 'medication_reminder';
    const params = {
      medication: 'Aspirin',
      time: '8:00 AM',
    };

    beforeEach(() => {
      mockMessages.create.mockResolvedValue({
        sid: 'SM555666777',
        status: 'queued',
      });
    });

    it('should send template message successfully', async () => {
      const result = await whatsappService.sendTemplate(to, templateName, params);

      expect(mockMessages.create).toHaveBeenCalledWith({
        from: 'whatsapp:+15551234567',
        to: 'whatsapp:+15559876543',
        contentSid: templateName,
        contentVariables: JSON.stringify(params),
      });

      expect(result.sid).toBe('SM555666777');
    });

    it('should add whatsapp prefix if not present', async () => {
      await whatsappService.sendTemplate(to, templateName, params);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.to).toBe('whatsapp:+15559876543');
    });

    it('should stringify content variables', async () => {
      await whatsappService.sendTemplate(to, templateName, params);

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(typeof createCall.contentVariables).toBe('string');
      expect(JSON.parse(createCall.contentVariables)).toEqual(params);
    });

    it('should handle template send errors', async () => {
      const error = new Error('Template not found');
      mockMessages.create.mockRejectedValue(error);

      await expect(
        whatsappService.sendTemplate(to, templateName, params)
      ).rejects.toThrow('Template not found');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send template:',
        error
      );
    });

    it('should handle empty parameters', async () => {
      await whatsappService.sendTemplate(to, templateName, {});

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.contentVariables).toBe('{}');
    });
  });

  describe('downloadMedia', () => {
    const mediaUrl = 'https://api.twilio.com/media/ME123456';

    beforeEach(() => {
      axios.get = jest.fn();
    });

    it('should download media successfully', async () => {
      const mockData = Buffer.from('fake-media-data');
      axios.get.mockResolvedValue({
        data: mockData,
      });

      const result = await whatsappService.downloadMedia(mediaUrl);

      expect(result).toBeInstanceOf(Buffer);
      expect(axios.get).toHaveBeenCalledWith(mediaUrl, {
        responseType: 'arraybuffer',
        auth: {
          username: 'test-account-sid',
          password: 'test-auth-token',
        },
      });
    });

    it('should use Twilio credentials for authentication', async () => {
      axios.get.mockResolvedValue({
        data: Buffer.from('data'),
      });

      await whatsappService.downloadMedia(mediaUrl);

      const axiosCall = axios.get.mock.calls[0][1];
      expect(axiosCall.auth.username).toBe('test-account-sid');
      expect(axiosCall.auth.password).toBe('test-auth-token');
    });

    it('should request arraybuffer response type', async () => {
      axios.get.mockResolvedValue({
        data: Buffer.from('data'),
      });

      await whatsappService.downloadMedia(mediaUrl);

      const axiosCall = axios.get.mock.calls[0][1];
      expect(axiosCall.responseType).toBe('arraybuffer');
    });

    it('should handle download errors', async () => {
      const error = new Error('Download failed');
      axios.get.mockRejectedValue(error);

      await expect(
        whatsappService.downloadMedia(mediaUrl)
      ).rejects.toThrow('Download failed');

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to download media:',
        error
      );
    });

    it('should convert response data to Buffer', async () => {
      const mockData = new ArrayBuffer(8);
      axios.get.mockResolvedValue({
        data: mockData,
      });

      const result = await whatsappService.downloadMedia(mediaUrl);

      expect(Buffer.isBuffer(result)).toBe(true);
    });
  });

  describe('sendBulkMessages', () => {
    const recipients = ['+15551111111', '+15552222222', '+15553333333'];
    const message = { text: 'Bulk message' };

    beforeEach(() => {
      mockMessages.create.mockResolvedValue({
        sid: 'SM123456',
        status: 'queued',
      });
    });

    it('should send messages to all recipients', async () => {
      const results = await whatsappService.sendBulkMessages(recipients, message);

      expect(results).toHaveLength(3);
      expect(mockMessages.create).toHaveBeenCalledTimes(3);
    });

    it('should return success results for successful sends', async () => {
      const results = await whatsappService.sendBulkMessages(recipients, message);

      expect(results[0]).toEqual({
        success: true,
        recipient: '+15551111111',
        messageId: 'SM123456',
      });
    });

    it('should handle individual failures gracefully', async () => {
      mockMessages.create
        .mockResolvedValueOnce({ sid: 'SM111' })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ sid: 'SM333' });

      const results = await whatsappService.sendBulkMessages(recipients, message);

      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(false);
      expect(results[1].error).toBe('Failed');
      expect(results[2].success).toBe(true);
    });

    it('should log failures for individual recipients', async () => {
      const error = new Error('Send failed');
      mockMessages.create
        .mockResolvedValueOnce({ sid: 'SM111' })
        .mockRejectedValueOnce(error);

      await whatsappService.sendBulkMessages(
        ['+15551111111', '+15552222222'],
        message
      );

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send to +15552222222:',
        error
      );
    });

    it('should continue sending even if one fails', async () => {
      mockMessages.create
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ sid: 'SM222' })
        .mockResolvedValueOnce({ sid: 'SM333' });

      const results = await whatsappService.sendBulkMessages(recipients, message);

      expect(results).toHaveLength(3);
      expect(results[1].success).toBe(true);
      expect(results[2].success).toBe(true);
    });

    it('should handle empty recipients array', async () => {
      const results = await whatsappService.sendBulkMessages([], message);

      expect(results).toHaveLength(0);
      expect(mockMessages.create).not.toHaveBeenCalled();
    });

    it('should include error message in failed results', async () => {
      mockMessages.create.mockRejectedValue(new Error('Invalid number'));

      const results = await whatsappService.sendBulkMessages(['+15551111111'], message);

      expect(results[0].error).toBe('Invalid number');
    });
  });

  describe('formatPhoneNumber', () => {
    it('should add + prefix to clean number', () => {
      const result = whatsappService.formatPhoneNumber('15551234567');

      expect(result).toBe('+15551234567');
    });

    it('should remove non-digit characters', () => {
      const result = whatsappService.formatPhoneNumber('(555) 123-4567');

      expect(result).toBe('+15551234567');
    });

    it('should add US country code to 10-digit numbers', () => {
      const result = whatsappService.formatPhoneNumber('5551234567');

      expect(result).toBe('+15551234567');
    });

    it('should not duplicate country code', () => {
      const result = whatsappService.formatPhoneNumber('+15551234567');

      expect(result).toBe('+15551234567');
    });

    it('should handle numbers with spaces', () => {
      const result = whatsappService.formatPhoneNumber('555 123 4567');

      expect(result).toBe('+15551234567');
    });

    it('should handle numbers with dashes', () => {
      const result = whatsappService.formatPhoneNumber('555-123-4567');

      expect(result).toBe('+15551234567');
    });

    it('should handle numbers with parentheses', () => {
      const result = whatsappService.formatPhoneNumber('(555)1234567');

      expect(result).toBe('+15551234567');
    });

    it('should handle international numbers', () => {
      const result = whatsappService.formatPhoneNumber('447911123456');

      expect(result).toBe('+447911123456');
    });

    it('should preserve existing plus sign', () => {
      const result = whatsappService.formatPhoneNumber('+447911123456');

      expect(result).toBe('+447911123456');
    });

    it('should handle numbers with dots', () => {
      const result = whatsappService.formatPhoneNumber('555.123.4567');

      expect(result).toBe('+15551234567');
    });
  });

  describe('isValidWhatsAppNumber', () => {
    it('should validate correct US number', () => {
      expect(whatsappService.isValidWhatsAppNumber('+15551234567')).toBe(true);
    });

    it('should validate correct international number', () => {
      expect(whatsappService.isValidWhatsAppNumber('+447911123456')).toBe(true);
    });

    it('should reject number without plus sign', () => {
      expect(whatsappService.isValidWhatsAppNumber('15551234567')).toBe(false);
    });

    it('should reject number starting with zero', () => {
      expect(whatsappService.isValidWhatsAppNumber('+05551234567')).toBe(false);
    });

    it('should reject number too short', () => {
      expect(whatsappService.isValidWhatsAppNumber('+1555')).toBe(false);
    });

    it('should reject number too long', () => {
      expect(whatsappService.isValidWhatsAppNumber('+1555123456789012345')).toBe(false);
    });

    it('should reject empty string', () => {
      expect(whatsappService.isValidWhatsAppNumber('')).toBe(false);
    });

    it('should reject number with letters', () => {
      expect(whatsappService.isValidWhatsAppNumber('+1555ABC4567')).toBe(false);
    });

    it('should reject number with special characters', () => {
      expect(whatsappService.isValidWhatsAppNumber('+1555-123-4567')).toBe(false);
    });

    it('should validate minimum valid length', () => {
      expect(whatsappService.isValidWhatsAppNumber('+1234567890')).toBe(true);
    });

    it('should validate maximum valid length', () => {
      expect(whatsappService.isValidWhatsAppNumber('+123456789012345')).toBe(true);
    });

    it('should reject null', () => {
      expect(whatsappService.isValidWhatsAppNumber(null)).toBe(false);
    });

    it('should reject undefined', () => {
      expect(whatsappService.isValidWhatsAppNumber(undefined)).toBe(false);
    });
  });

  describe('integration tests', () => {
    it('should format and validate phone number workflow', () => {
      const raw = '(555) 123-4567';
      const formatted = whatsappService.formatPhoneNumber(raw);
      const isValid = whatsappService.isValidWhatsAppNumber(formatted);

      expect(formatted).toBe('+15551234567');
      expect(isValid).toBe(true);
    });

    it('should send message with formatted number', async () => {
      mockMessages.create.mockResolvedValue({
        sid: 'SM123456',
        status: 'queued',
      });

      const raw = '555-123-4567';
      const formatted = whatsappService.formatPhoneNumber(raw);

      await whatsappService.sendMessage(formatted, { text: 'Hello' });

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.to).toBe('whatsapp:+15551234567');
    });

    it('should handle complete message workflow', async () => {
      mockMessages.create.mockResolvedValue({
        sid: 'SM123456',
        status: 'queued',
      });

      const message = {
        text: 'Time to take your medicine',
        quickReplies: ['Taken', 'Snooze 10min', 'Skip'],
        mediaUrl: 'https://example.com/pill.jpg',
      };

      const result = await whatsappService.sendMessage('+15551234567', message);

      expect(result.sid).toBe('SM123456');

      const createCall = mockMessages.create.mock.calls[0][0];
      expect(createCall.body).toContain('Time to take your medicine');
      expect(createCall.body).toContain('1. Taken');
      expect(createCall.body).toContain('2. Snooze 10min');
      expect(createCall.body).toContain('3. Skip');
      expect(createCall.mediaUrl).toEqual(['https://example.com/pill.jpg']);
    });

    it('should handle bulk send with validation', async () => {
      mockMessages.create.mockResolvedValue({
        sid: 'SM123',
        status: 'queued',
      });

      const rawNumbers = ['555-123-4567', '(555) 987-6543'];
      const formattedNumbers = rawNumbers.map((num) =>
        whatsappService.formatPhoneNumber(num)
      );

      const results = await whatsappService.sendBulkMessages(
        formattedNumbers,
        { text: 'Bulk message' }
      );

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should handle Twilio rate limit errors', async () => {
      const error = new Error('Rate limit exceeded');
      error.code = 20429;
      mockMessages.create.mockRejectedValue(error);

      await expect(
        whatsappService.sendMessage('+15551234567', { text: 'Test' })
      ).rejects.toThrow('Rate limit exceeded');
    });

    it('should handle invalid credentials', async () => {
      const error = new Error('Invalid credentials');
      error.code = 20003;
      mockMessages.create.mockRejectedValue(error);

      await expect(
        whatsappService.sendMessage('+15551234567', { text: 'Test' })
      ).rejects.toThrow('Invalid credentials');
    });

    it('should handle network errors', async () => {
      const error = new Error('Network timeout');
      mockMessages.create.mockRejectedValue(error);

      await expect(
        whatsappService.sendMessage('+15551234567', { text: 'Test' })
      ).rejects.toThrow('Network timeout');
    });

    it('should log all errors appropriately', async () => {
      const error = new Error('Test error');
      mockMessages.create.mockRejectedValue(error);

      try {
        await whatsappService.sendMessage('+15551234567', { text: 'Test' });
      } catch (e) {
        // Expected
      }

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to send WhatsApp message:',
        error
      );
    });
  });
});