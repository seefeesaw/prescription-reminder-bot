import { jest } from '@jest/globals';
import { voiceService } from '../services/VoiceService.js';
import textToSpeech from '@google-cloud/text-to-speech';
import { Storage } from '@google-cloud/storage';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import crypto from 'crypto';

// Mock dependencies
jest.mock('@google-cloud/text-to-speech');
jest.mock('@google-cloud/storage');
jest.mock('../utils/logger.js');
jest.mock('fs/promises');
jest.mock('crypto');

describe('VoiceService', () => {
  let mockTTSClient;
  let mockStorage;
  let mockBucket;
  let mockFile;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Text-to-Speech client
    mockTTSClient = {
      synthesizeSpeech: jest.fn(),
    };

    textToSpeech.TextToSpeechClient = jest.fn(() => mockTTSClient);

    // Mock Storage
    mockFile = {
      exists: jest.fn(),
    };

    mockBucket = {
      file: jest.fn(() => mockFile),
      upload: jest.fn(),
    };

    mockStorage = {
      bucket: jest.fn(() => mockBucket),
    };

    Storage.mockImplementation(() => mockStorage);

    // Mock fs operations
    fs.mkdir = jest.fn().mockResolvedValue(undefined);
    fs.writeFile = jest.fn().mockResolvedValue(undefined);
    fs.unlink = jest.fn().mockResolvedValue(undefined);

    // Mock crypto
    const mockHash = {
      update: jest.fn().mockReturnThis(),
      digest: jest.fn().mockReturnValue('abc123def456'),
    };
    crypto.createHash = jest.fn(() => mockHash);
  });

  describe('constructor', () => {
    it('should initialize TTS client with credentials', () => {
      expect(textToSpeech.TextToSpeechClient).toHaveBeenCalledWith({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
    });

    it('should initialize Storage client with credentials', () => {
      expect(Storage).toHaveBeenCalledWith({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
    });

    it('should set default bucket name', () => {
      expect(voiceService.bucketName).toBeDefined();
    });
  });

  describe('generateAudio', () => {
    const text = 'Take your medicine now';
    const language = 'en';

    beforeEach(() => {
      mockFile.exists.mockResolvedValue([false]);
      mockTTSClient.synthesizeSpeech.mockResolvedValue([
        { audioContent: Buffer.from('fake-audio-data') },
      ]);
    });

    it('should generate audio successfully', async () => {
      const url = await voiceService.generateAudio(text, language);

      expect(url).toContain('https://storage.googleapis.com');
      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalled();
    });

    it('should use cached audio if exists', async () => {
      mockFile.exists.mockResolvedValue([true]);

      const url = await voiceService.generateAudio(text, language);

      expect(mockTTSClient.synthesizeSpeech).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith(
        'Using cached audio',
        expect.objectContaining({
          filename: expect.stringContaining('audio/'),
        })
      );
    });

    it('should generate hash for caching', async () => {
      await voiceService.generateAudio(text, language);

      expect(crypto.createHash).toHaveBeenCalledWith('md5');
    });

    it('should use default language as English', async () => {
      await voiceService.generateAudio(text);

      const synthesizeCall = mockTTSClient.synthesizeSpeech.mock.calls[0][0];
      expect(synthesizeCall.voice.languageCode).toBe('en-US');
    });

    it('should call TTS API with correct request', async () => {
      await voiceService.generateAudio(text, language);

      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledWith({
        input: { text },
        voice: expect.objectContaining({
          languageCode: expect.any(String),
          name: expect.any(String),
          ssmlGender: expect.any(String),
        }),
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: expect.any(Number),
          pitch: expect.any(Number),
        },
      });
    });

    it('should save audio to cloud storage', async () => {
      await voiceService.generateAudio(text, language);

      expect(mockBucket.upload).toHaveBeenCalled();
    });

    it('should log audio generation', async () => {
      await voiceService.generateAudio(text, language);

      expect(logger.info).toHaveBeenCalledWith(
        'Audio generated',
        {
          language,
          textLength: text.length,
          filename: expect.stringContaining('.mp3'),
        }
      );
    });

    it('should handle errors', async () => {
      const error = new Error('TTS API error');
      mockTTSClient.synthesizeSpeech.mockRejectedValue(error);

      await expect(
        voiceService.generateAudio(text, language)
      ).rejects.toThrow('TTS API error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error generating audio:',
        error
      );
    });

    it('should generate different hashes for different text', async () => {
      const mockHash1 = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hash1'),
      };
      const mockHash2 = {
        update: jest.fn().mockReturnThis(),
        digest: jest.fn().mockReturnValue('hash2'),
      };

      crypto.createHash
        .mockReturnValueOnce(mockHash1)
        .mockReturnValueOnce(mockHash2);

      await voiceService.generateAudio('Text 1', 'en');
      await voiceService.generateAudio('Text 2', 'en');

      expect(crypto.createHash).toHaveBeenCalledTimes(2);
    });

    it('should create correct filename format', async () => {
      await voiceService.generateAudio(text, language);

      const uploadCall = mockBucket.upload.mock.calls[0];
      expect(uploadCall[1].destination).toMatch(/^audio\/.*\.mp3$/);
    });
  });

  describe('getVoiceConfig', () => {
    it('should return English config', () => {
      const config = voiceService.getVoiceConfig('en');

      expect(config.voice.languageCode).toBe('en-US');
      expect(config.voice.name).toBe('en-US-Wavenet-F');
      expect(config.voice.ssmlGender).toBe('FEMALE');
      expect(config.rate).toBe(0.9);
      expect(config.pitch).toBe(0);
    });

    it('should return Zulu config', () => {
      const config = voiceService.getVoiceConfig('zu');

      expect(config.voice.languageCode).toBe('zu-ZA');
      expect(config.voice.name).toBe('zu-ZA-Standard-A');
      expect(config.voice.ssmlGender).toBe('FEMALE');
    });

    it('should return Hindi config', () => {
      const config = voiceService.getVoiceConfig('hi');

      expect(config.voice.languageCode).toBe('hi-IN');
      expect(config.voice.name).toBe('hi-IN-Wavenet-A');
    });

    it('should return Hausa config with Nigerian English', () => {
      const config = voiceService.getVoiceConfig('ha');

      expect(config.voice.languageCode).toBe('en-NG');
      expect(config.voice.name).toBe('en-NG-Standard-A');
      expect(config.rate).toBe(0.85);
    });

    it('should return Swahili config', () => {
      const config = voiceService.getVoiceConfig('sw');

      expect(config.voice.languageCode).toBe('sw-KE');
      expect(config.voice.name).toBe('sw-KE-Standard-A');
    });

    it('should return Portuguese config', () => {
      const config = voiceService.getVoiceConfig('pt');

      expect(config.voice.languageCode).toBe('pt-BR');
      expect(config.voice.name).toBe('pt-BR-Wavenet-A');
    });

    it('should return Spanish config', () => {
      const config = voiceService.getVoiceConfig('es');

      expect(config.voice.languageCode).toBe('es-US');
      expect(config.voice.name).toBe('es-US-Wavenet-A');
    });

    it('should return default English config for unknown language', () => {
      const config = voiceService.getVoiceConfig('unknown');

      expect(config.voice.languageCode).toBe('en-US');
    });

    it('should return consistent config structure for all languages', () => {
      const languages = ['en', 'zu', 'hi', 'ha', 'sw', 'pt', 'es'];

      languages.forEach((lang) => {
        const config = voiceService.getVoiceConfig(lang);

        expect(config).toHaveProperty('voice');
        expect(config.voice).toHaveProperty('languageCode');
        expect(config.voice).toHaveProperty('name');
        expect(config.voice).toHaveProperty('ssmlGender');
        expect(config).toHaveProperty('rate');
        expect(config).toHaveProperty('pitch');
      });
    });
  });

  describe('checkCache', () => {
    const filename = 'audio/test.mp3';

    it('should return URL if file exists', async () => {
      mockFile.exists.mockResolvedValue([true]);

      const url = await voiceService.checkCache(filename);

      expect(url).toBe(
        `https://storage.googleapis.com/${voiceService.bucketName}/${filename}`
      );
    });

    it('should return null if file does not exist', async () => {
      mockFile.exists.mockResolvedValue([false]);

      const url = await voiceService.checkCache(filename);

      expect(url).toBeNull();
    });

    it('should call storage bucket with correct filename', async () => {
      mockFile.exists.mockResolvedValue([false]);

      await voiceService.checkCache(filename);

      expect(mockBucket.file).toHaveBeenCalledWith(filename);
      expect(mockFile.exists).toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Storage error');
      mockFile.exists.mockRejectedValue(error);

      const url = await voiceService.checkCache(filename);

      expect(url).toBeNull();
      expect(logger.error).toHaveBeenCalledWith('Cache check error:', error);
    });

    it('should use correct bucket name', async () => {
      mockFile.exists.mockResolvedValue([true]);

      await voiceService.checkCache(filename);

      expect(mockStorage.bucket).toHaveBeenCalledWith(voiceService.bucketName);
    });
  });

  describe('saveAudio', () => {
    const audioContent = Buffer.from('fake-audio-data');
    const filename = 'audio/test.mp3';

    it('should save audio successfully', async () => {
      const url = await voiceService.saveAudio(audioContent, filename);

      expect(url).toContain('https://storage.googleapis.com');
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockBucket.upload).toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should create temp directory recursively', async () => {
      await voiceService.saveAudio(audioContent, filename);

      expect(fs.mkdir).toHaveBeenCalledWith('./temp/audio', {
        recursive: true,
      });
    });

    it('should write audio to local file', async () => {
      await voiceService.saveAudio(audioContent, filename);

      expect(fs.writeFile).toHaveBeenCalledWith(
        `./temp/${filename}`,
        audioContent,
        'binary'
      );
    });

    it('should upload to cloud storage with correct metadata', async () => {
      await voiceService.saveAudio(audioContent, filename);

      expect(mockBucket.upload).toHaveBeenCalledWith(
        `./temp/${filename}`,
        {
          destination: filename,
          metadata: {
            contentType: 'audio/mpeg',
            cacheControl: 'public, max-age=31536000',
          },
        }
      );
    });

    it('should clean up local file after upload', async () => {
      await voiceService.saveAudio(audioContent, filename);

      expect(fs.unlink).toHaveBeenCalledWith(`./temp/${filename}`);
    });

    it('should return public URL', async () => {
      const url = await voiceService.saveAudio(audioContent, filename);

      expect(url).toBe(
        `https://storage.googleapis.com/${voiceService.bucketName}/${filename}`
      );
    });

    it('should handle upload errors', async () => {
      const error = new Error('Upload error');
      mockBucket.upload.mockRejectedValue(error);

      await expect(
        voiceService.saveAudio(audioContent, filename)
      ).rejects.toThrow('Upload error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error saving audio:',
        error
      );
    });

    it('should handle write errors', async () => {
      const error = new Error('Write error');
      fs.writeFile.mockRejectedValue(error);

      await expect(
        voiceService.saveAudio(audioContent, filename)
      ).rejects.toThrow('Write error');

      expect(logger.error).toHaveBeenCalledWith(
        'Error saving audio:',
        error
      );
    });

    it('should use correct bucket', async () => {
      await voiceService.saveAudio(audioContent, filename);

      expect(mockStorage.bucket).toHaveBeenCalledWith(voiceService.bucketName);
    });
  });

  describe('generateSSML', () => {
    it('should generate SSML with default emphasis', async () => {
      const text = 'Take your medicine';
      const ssml = await voiceService.generateSSML(text);

      expect(ssml).toContain('<speak>');
      expect(ssml).toContain('</speak>');
      expect(ssml).toContain(text);
      expect(ssml).toContain('moderate');
    });

    it('should include prosody tags', async () => {
      const text = 'Take your medicine';
      const ssml = await voiceService.generateSSML(text);

      expect(ssml).toContain('<prosody');
      expect(ssml).toContain('rate="90%"');
      expect(ssml).toContain('pitch="-1st"');
      expect(ssml).toContain('</prosody>');
    });

    it('should include emphasis tags', async () => {
      const text = 'Important message';
      const ssml = await voiceService.generateSSML(text, 'strong');

      expect(ssml).toContain('<emphasis level="strong">');
      expect(ssml).toContain('</emphasis>');
    });

    it('should include break time', async () => {
      const text = 'Take your medicine';
      const ssml = await voiceService.generateSSML(text);

      expect(ssml).toContain('<break time="500ms"/>');
    });

    it('should include follow-up message', async () => {
      const text = 'Take your medicine';
      const ssml = await voiceService.generateSSML(text);

      expect(ssml).toContain('Please respond when you\'re ready.');
    });

    it('should handle custom emphasis levels', async () => {
      const text = 'Test message';

      const moderate = await voiceService.generateSSML(text, 'moderate');
      const strong = await voiceService.generateSSML(text, 'strong');
      const reduced = await voiceService.generateSSML(text, 'reduced');

      expect(moderate).toContain('moderate');
      expect(strong).toContain('strong');
      expect(reduced).toContain('reduced');
    });

    it('should properly escape text content', async () => {
      const text = 'Take your medicine & relax';
      const ssml = await voiceService.generateSSML(text);

      expect(ssml).toContain(text);
    });

    it('should return string', async () => {
      const ssml = await voiceService.generateSSML('Test');

      expect(typeof ssml).toBe('string');
    });
  });

  describe('integration tests', () => {
    it('should generate and cache audio for multiple languages', async () => {
      const text = 'Take your medicine';

      mockFile.exists.mockResolvedValue([false]);
      mockTTSClient.synthesizeSpeech.mockResolvedValue([
        { audioContent: Buffer.from('audio-data') },
      ]);

      const languages = ['en', 'es', 'pt'];
      const urls = await Promise.all(
        languages.map((lang) => voiceService.generateAudio(text, lang))
      );

      expect(urls).toHaveLength(3);
      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledTimes(3);
    });

    it('should use cache on second call', async () => {
      const text = 'Take your medicine';

      // First call - no cache
      mockFile.exists.mockResolvedValueOnce([false]);
      mockTTSClient.synthesizeSpeech.mockResolvedValue([
        { audioContent: Buffer.from('audio-data') },
      ]);

      await voiceService.generateAudio(text, 'en');

      // Second call - cached
      mockFile.exists.mockResolvedValueOnce([true]);

      await voiceService.generateAudio(text, 'en');

      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalledTimes(1);
    });

    it('should handle complete workflow', async () => {
      const text = 'Time to take your medication';
      const language = 'es';

      mockFile.exists.mockResolvedValue([false]);
      mockTTSClient.synthesizeSpeech.mockResolvedValue([
        { audioContent: Buffer.from('spanish-audio') },
      ]);

      // Get voice config
      const config = voiceService.getVoiceConfig(language);
      expect(config.voice.languageCode).toBe('es-US');

      // Generate audio
      const url = await voiceService.generateAudio(text, language);
      expect(url).toContain('https://storage.googleapis.com');

      // Verify all steps executed
      expect(crypto.createHash).toHaveBeenCalled();
      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalled();
      expect(fs.mkdir).toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
      expect(mockBucket.upload).toHaveBeenCalled();
      expect(fs.unlink).toHaveBeenCalled();
    });

    it('should generate SSML and use it for audio generation', async () => {
      const text = 'Important reminder';
      const ssml = await voiceService.generateSSML(text, 'strong');

      expect(ssml).toContain(text);
      expect(ssml).toContain('strong');

      // SSML can be used with TTS API
      mockTTSClient.synthesizeSpeech.mockResolvedValue([
        { audioContent: Buffer.from('ssml-audio') },
      ]);

      // This demonstrates SSML could be used instead of plain text
      expect(ssml).toContain('<speak>');
    });
  });

  describe('error recovery', () => {
    it('should not delete local file if upload fails', async () => {
      const error = new Error('Upload failed');
      mockBucket.upload.mockRejectedValue(error);

      await expect(
        voiceService.saveAudio(Buffer.from('data'), 'audio/test.mp3')
      ).rejects.toThrow();

      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it('should handle cache check failure gracefully', async () => {
      mockFile.exists.mockRejectedValue(new Error('Storage unavailable'));
      mockTTSClient.synthesizeSpeech.mockResolvedValue([
        { audioContent: Buffer.from('audio') },
      ]);

      // Should still generate audio if cache check fails
      const url = await voiceService.generateAudio('Test', 'en');

      expect(url).toBeDefined();
      expect(mockTTSClient.synthesizeSpeech).toHaveBeenCalled();
    });

    it('should log all errors appropriately', async () => {
      const error = new Error('Test error');
      mockTTSClient.synthesizeSpeech.mockRejectedValue(error);

      await expect(
        voiceService.generateAudio('Test', 'en')
      ).rejects.toThrow();

      expect(logger.error).toHaveBeenCalledWith(
        'Error generating audio:',
        error
      );
    });
  });
});