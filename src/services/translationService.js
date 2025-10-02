import { Translate } from '@google-cloud/translate/build/src/v2';
import { logger } from '../utils/logger.js';

class TranslationService {
  constructor() {
    this.translate = new Translate({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
    
    this.cache = new Map();
  }
  
  async translateText(text, targetLanguage, sourceLanguage = 'en') {
    try {
      // Check cache
      const cacheKey = `${text}_${sourceLanguage}_${targetLanguage}`;
      if (this.cache.has(cacheKey)) {
        return this.cache.get(cacheKey);
      }
      
      // Translate
      const [translation] = await this.translate.translate(text, {
        from: sourceLanguage,
        to: targetLanguage,
      });
      
      // Cache result
      this.cache.set(cacheKey, translation);
      
      logger.info('Text translated', {
        sourceLanguage,
        targetLanguage,
        textLength: text.length,
      });
      
      return translation;
    } catch (error) {
      logger.error('Translation error:', error);
      // Return original text if translation fails
      return text;
    }
  }
  
  async translateMessage(message, targetLanguage) {
    // Translate message templates
    const translations = await Promise.all([
      this.translateText(message.text, targetLanguage),
      message.quickReplies ? 
        Promise.all(message.quickReplies.map(reply => 
          this.translateText(reply, targetLanguage)
        )) : null,
    ]);
    
    return {
      text: translations[0],
      quickReplies: translations[1],
    };
  }
  
  getLanguageCode(language) {
    const codes = {
      english: 'en',
      zulu: 'zu',
      hindi: 'hi',
      hausa: 'ha',
      swahili: 'sw',
      portuguese: 'pt',
      spanish: 'es',
    };
    
    return codes[language.toLowerCase()] || 'en';
  }
}

export const translationService = new TranslationService();
export default translationService;