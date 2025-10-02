import { jest } from '@jest/globals';
import { translationService } from '../services/TranslationService.js';
import { Translate } from '@google-cloud/translate/build/src/v2';
import { logger } from '../utils/logger.js';

// Mock dependencies
jest.mock('@google-cloud/translate/build/src/v2');
jest.mock('../utils/logger.js');

describe('TranslationService', () => {
  let mockTranslate;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Google Translate client
    mockTranslate = {
      translate: jest.fn(),
    };

    Translate.mockImplementation(() => mockTranslate);

    // Clear the cache before each test
    translationService.cache.clear();
  });

  describe('constructor', () => {
    it('should initialize Google Translate client', () => {
      expect(Translate).toHaveBeenCalledWith({
        keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
      });
    });

    it('should initialize empty cache', () => {
      expect(translationService.cache).toBeInstanceOf(Map);
      expect(translationService.cache.size).toBe(0);
    });
  });

  describe('translateText', () => {
    const text = 'Hello World';
    const targetLanguage = 'es';
    const sourceLanguage = 'en';

    it('should translate text successfully', async () => {
      mockTranslate.translate.mockResolvedValue(['Hola Mundo']);

      const result = await translationService.translateText(
        text,
        targetLanguage,
        sourceLanguage
      );

      expect(result).toBe('Hola Mundo');
      expect(mockTranslate.translate).toHaveBeenCalledWith(text, {
        from: sourceLanguage,
        to: targetLanguage,
      });
    });

    it('should use default source language as English', async () => {
      mockTranslate.translate.mockResolvedValue(['Hola Mundo']);

      await translationService.translateText(text, targetLanguage);

      expect(mockTranslate.translate).toHaveBeenCalledWith(text, {
        from: 'en',
        to: targetLanguage,
      });
    });

    it('should cache translation results', async () => {
      mockTranslate.translate.mockResolvedValue(['Hola Mundo']);

      // First call
      await translationService.translateText(text, targetLanguage, sourceLanguage);

      // Second call - should use cache
      const result = await translationService.translateText(
        text,
        targetLanguage,
        sourceLanguage
      );

      expect(result).toBe('Hola Mundo');
      expect(mockTranslate.translate).toHaveBeenCalledTimes(1);
    });

    it('should create unique cache keys for different parameters', async () => {
      mockTranslate.translate
        .mockResolvedValueOnce(['Hola Mundo'])
        .mockResolvedValueOnce(['Bonjour le monde']);

      await translationService.translateText(text, 'es', 'en');
      await translationService.translateText(text, 'fr', 'en');

      expect(mockTranslate.translate).toHaveBeenCalledTimes(2);
      expect(translationService.cache.size).toBe(2);
    });

    it('should return cached result on subsequent calls', async () => {
      mockTranslate.translate.mockResolvedValue(['Hola Mundo']);

      const result1 = await translationService.translateText(
        text,
        targetLanguage,
        sourceLanguage
      );
      const result2 = await translationService.translateText(
        text,
        targetLanguage,
        sourceLanguage
      );

      expect(result1).toBe(result2);
      expect(mockTranslate.translate).toHaveBeenCalledTimes(1);
    });

    it('should log successful translation', async () => {
      mockTranslate.translate.mockResolvedValue(['Hola Mundo']);

      await translationService.translateText(text, targetLanguage, sourceLanguage);

      expect(logger.info).toHaveBeenCalledWith(
        'Text translated',
        {
          sourceLanguage,
          targetLanguage,
          textLength: text.length,
        }
      );
    });

    it('should return original text on translation error', async () => {
      const error = new Error('Translation API error');
      mockTranslate.translate.mockRejectedValue(error);

      const result = await translationService.translateText(
        text,
        targetLanguage,
        sourceLanguage
      );

      expect(result).toBe(text);
      expect(logger.error).toHaveBeenCalledWith('Translation error:', error);
    });

    it('should not cache failed translations', async () => {
      const error = new Error('Translation API error');
      mockTranslate.translate.mockRejectedValue(error);

      await translationService.translateText(text, targetLanguage, sourceLanguage);

      expect(translationService.cache.size).toBe(0);
    });

    it('should handle empty text', async () => {
      mockTranslate.translate.mockResolvedValue(['']);

      const result = await translationService.translateText('', targetLanguage);

      expect(result).toBe('');
      expect(mockTranslate.translate).toHaveBeenCalledWith('', {
        from: 'en',
        to: targetLanguage,
      });
    });

    it('should handle long text', async () => {
      const longText = 'A'.repeat(1000);
      mockTranslate.translate.mockResolvedValue(['B'.repeat(1000)]);

      const result = await translationService.translateText(longText, targetLanguage);

      expect(result.length).toBe(1000);
      expect(logger.info).toHaveBeenCalledWith(
        'Text translated',
        expect.objectContaining({
          textLength: 1000,
        })
      );
    });

    it('should handle special characters', async () => {
      const specialText = 'Hello! @#$%^&*()';
      mockTranslate.translate.mockResolvedValue(['¡Hola! @#$%^&*()']);

      const result = await translationService.translateText(specialText, 'es');

      expect(result).toBe('¡Hola! @#$%^&*()');
    });

    it('should differentiate between different text', async () => {
      mockTranslate.translate
        .mockResolvedValueOnce(['Hola'])
        .mockResolvedValueOnce(['Adiós']);

      await translationService.translateText('Hello', 'es');
      await translationService.translateText('Goodbye', 'es');

      expect(mockTranslate.translate).toHaveBeenCalledTimes(2);
      expect(translationService.cache.size).toBe(2);
    });
  });

  describe('translateMessage', () => {
    beforeEach(() => {
      mockTranslate.translate.mockImplementation((text) => {
        const translations = {
          'Take your medicine': 'Toma tu medicina',
          'Yes': 'Sí',
          'No': 'No',
          'Later': 'Más tarde',
        };
        return Promise.resolve([translations[text] || text]);
      });
    });

    it('should translate message text', async () => {
      const message = {
        text: 'Take your medicine',
      };

      const result = await translationService.translateMessage(message, 'es');

      expect(result.text).toBe('Toma tu medicina');
    });

    it('should translate message with quick replies', async () => {
      const message = {
        text: 'Take your medicine',
        quickReplies: ['Yes', 'No', 'Later'],
      };

      const result = await translationService.translateMessage(message, 'es');

      expect(result.text).toBe('Toma tu medicina');
      expect(result.quickReplies).toEqual(['Sí', 'No', 'Más tarde']);
    });

    it('should handle message without quick replies', async () => {
      const message = {
        text: 'Take your medicine',
      };

      const result = await translationService.translateMessage(message, 'es');

      expect(result.text).toBe('Toma tu medicina');
      expect(result.quickReplies).toBeNull();
    });

    it('should handle empty quick replies array', async () => {
      const message = {
        text: 'Take your medicine',
        quickReplies: [],
      };

      const result = await translationService.translateMessage(message, 'es');

      expect(result.text).toBe('Toma tu medicina');
      expect(result.quickReplies).toEqual([]);
    });

    it('should translate all quick replies', async () => {
      const message = {
        text: 'Take your medicine',
        quickReplies: ['Yes', 'No'],
      };

      await translationService.translateMessage(message, 'es');

      expect(mockTranslate.translate).toHaveBeenCalledTimes(3); // text + 2 replies
    });

    it('should handle translation errors gracefully', async () => {
      const error = new Error('API Error');
      mockTranslate.translate.mockRejectedValue(error);

      const message = {
        text: 'Take your medicine',
        quickReplies: ['Yes', 'No'],
      };

      const result = await translationService.translateMessage(message, 'es');

      expect(result.text).toBe('Take your medicine');
      expect(result.quickReplies).toEqual(['Yes', 'No']);
    });

    it('should use cache for repeated translations', async () => {
      const message1 = {
        text: 'Take your medicine',
        quickReplies: ['Yes'],
      };

      const message2 = {
        text: 'Take your medicine',
        quickReplies: ['Yes'],
      };

      await translationService.translateMessage(message1, 'es');
      await translationService.translateMessage(message2, 'es');

      // Should only call translate API once per unique text
      expect(mockTranslate.translate).toHaveBeenCalledTimes(2);
    });
  });

  describe('getLanguageCode', () => {
    it('should return correct code for English', () => {
      expect(translationService.getLanguageCode('english')).toBe('en');
      expect(translationService.getLanguageCode('English')).toBe('en');
      expect(translationService.getLanguageCode('ENGLISH')).toBe('en');
    });

    it('should return correct code for Zulu', () => {
      expect(translationService.getLanguageCode('zulu')).toBe('zu');
      expect(translationService.getLanguageCode('Zulu')).toBe('zu');
    });

    it('should return correct code for Hindi', () => {
      expect(translationService.getLanguageCode('hindi')).toBe('hi');
    });

    it('should return correct code for Hausa', () => {
      expect(translationService.getLanguageCode('hausa')).toBe('ha');
    });

    it('should return correct code for Swahili', () => {
      expect(translationService.getLanguageCode('swahili')).toBe('sw');
    });

    it('should return correct code for Portuguese', () => {
      expect(translationService.getLanguageCode('portuguese')).toBe('pt');
    });

    it('should return correct code for Spanish', () => {
      expect(translationService.getLanguageCode('spanish')).toBe('es');
    });

    it('should return default code for unknown language', () => {
      expect(translationService.getLanguageCode('unknown')).toBe('en');
      expect(translationService.getLanguageCode('french')).toBe('en');
      expect(translationService.getLanguageCode('german')).toBe('en');
    });

    it('should handle case insensitive input', () => {
      expect(translationService.getLanguageCode('HINDI')).toBe('hi');
      expect(translationService.getLanguageCode('SpAnIsH')).toBe('es');
      expect(translationService.getLanguageCode('sWaHiLi')).toBe('sw');
    });

    it('should handle empty string', () => {
      expect(translationService.getLanguageCode('')).toBe('en');
    });

    it('should return default for null or undefined', () => {
      expect(translationService.getLanguageCode(null)).toBe('en');
      expect(translationService.getLanguageCode(undefined)).toBe('en');
    });
  });

  describe('cache behavior', () => {
    it('should store translations in cache', async () => {
      mockTranslate.translate.mockResolvedValue(['Hola']);

      await translationService.translateText('Hello', 'es');

      expect(translationService.cache.size).toBe(1);
      expect(translationService.cache.has('Hello_en_es')).toBe(true);
    });

    it('should retrieve from cache with correct key format', async () => {
      const text = 'Hello';
      const source = 'en';
      const target = 'es';
      const cacheKey = `${text}_${source}_${target}`;

      mockTranslate.translate.mockResolvedValue(['Hola']);

      await translationService.translateText(text, target, source);

      expect(translationService.cache.get(cacheKey)).toBe('Hola');
    });

    it('should maintain separate cache entries for different languages', async () => {
      mockTranslate.translate
        .mockResolvedValueOnce(['Hola'])
        .mockResolvedValueOnce(['Bonjour'])
        .mockResolvedValueOnce(['Ciao']);

      await translationService.translateText('Hello', 'es');
      await translationService.translateText('Hello', 'fr');
      await translationService.translateText('Hello', 'it');

      expect(translationService.cache.size).toBe(3);
    });

    it('should handle cache across multiple service calls', async () => {
      mockTranslate.translate.mockResolvedValue(['Hola']);

      // First call
      const result1 = await translationService.translateText('Hello', 'es');
      
      // Modify mock to return different result
      mockTranslate.translate.mockResolvedValue(['Different']);
      
      // Second call should still return cached result
      const result2 = await translationService.translateText('Hello', 'es');

      expect(result1).toBe('Hola');
      expect(result2).toBe('Hola'); // From cache
      expect(mockTranslate.translate).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should handle network errors', async () => {
      const networkError = new Error('Network timeout');
      mockTranslate.translate.mockRejectedValue(networkError);

      const result = await translationService.translateText('Hello', 'es');

      expect(result).toBe('Hello');
      expect(logger.error).toHaveBeenCalledWith('Translation error:', networkError);
    });

    it('should handle API quota errors', async () => {
      const quotaError = new Error('Quota exceeded');
      mockTranslate.translate.mockRejectedValue(quotaError);

      const result = await translationService.translateText('Hello', 'es');

      expect(result).toBe('Hello');
    });

    it('should handle invalid language codes', async () => {
      const langError = new Error('Invalid language code');
      mockTranslate.translate.mockRejectedValue(langError);

      const result = await translationService.translateText('Hello', 'invalid');

      expect(result).toBe('Hello');
    });

    it('should not throw errors on translation failure', async () => {
      mockTranslate.translate.mockRejectedValue(new Error('API Error'));

      await expect(
        translationService.translateText('Hello', 'es')
      ).resolves.not.toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should handle multiple concurrent translations', async () => {
      mockTranslate.translate.mockImplementation((text) => 
        Promise.resolve([`Translated: ${text}`])
      );

      const translations = await Promise.all([
        translationService.translateText('Hello', 'es'),
        translationService.translateText('Goodbye', 'es'),
        translationService.translateText('Thank you', 'es'),
      ]);

      expect(translations).toEqual([
        'Translated: Hello',
        'Translated: Goodbye',
        'Translated: Thank you',
      ]);
      expect(translationService.cache.size).toBe(3);
    });

    it('should handle message translation workflow', async () => {
      mockTranslate.translate.mockImplementation((text) => {
        const map = {
          'Time to take your medicine': 'Es hora de tomar tu medicina',
          'Taken': 'Tomado',
          'Snooze': 'Posponer',
          'Skip': 'Omitir',
        };
        return Promise.resolve([map[text] || text]);
      });

      const message = {
        text: 'Time to take your medicine',
        quickReplies: ['Taken', 'Snooze', 'Skip'],
      };

      const targetLang = translationService.getLanguageCode('spanish');
      const translated = await translationService.translateMessage(
        message,
        targetLang
      );

      expect(translated.text).toBe('Es hora de tomar tu medicina');
      expect(translated.quickReplies).toEqual(['Tomado', 'Posponer', 'Omitir']);
    });

    it('should efficiently use cache in bulk operations', async () => {
      mockTranslate.translate.mockImplementation((text) =>
        Promise.resolve([`Translated: ${text}`])
      );

      const messages = [
        { text: 'Hello', quickReplies: ['Yes', 'No'] },
        { text: 'Hello', quickReplies: ['Yes', 'No'] },
        { text: 'Hello', quickReplies: ['Yes', 'No'] },
      ];

      await Promise.all(
        messages.map((msg) => translationService.translateMessage(msg, 'es'))
      );

      // Should only translate unique texts once
      expect(mockTranslate.translate).toHaveBeenCalledTimes(3); // Hello, Yes, No
    });
  });
});