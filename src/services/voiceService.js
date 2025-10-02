import textToSpeech from '@google-cloud/text-to-speech';
import { Storage } from '@google-cloud/storage';
import { logger } from '../utils/logger.js';
import fs from 'fs/promises';
import crypto from 'crypto';

class VoiceService {
  constructor() {
    this.ttsClient = new textToSpeech.TextToSpeechClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
    
    this.storage = new Storage({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
    
    this.bucketName = process.env.VOICE_BUCKET || 'prescription-voice-notes';
  }
  
  async generateAudio(text, language = 'en') {
    try {
      const voiceConfig = this.getVoiceConfig(language);
      
      // Generate hash for caching
      const hash = crypto.createHash('md5')
        .update(`${text}_${language}`)
        .digest('hex');
      const filename = `audio/${hash}.mp3`;
      
      // Check if audio already exists
      const existingUrl = await this.checkCache(filename);
      if (existingUrl) {
        logger.info('Using cached audio', { filename });
        return existingUrl;
      }
      
      // Generate new audio
      const request = {
        input: { text },
        voice: voiceConfig.voice,
        audioConfig: {
          audioEncoding: 'MP3',
          speakingRate: voiceConfig.rate,
          pitch: voiceConfig.pitch,
        },
      };
      
      const [response] = await this.ttsClient.synthesizeSpeech(request);
      
      // Save to cloud storage
      const url = await this.saveAudio(response.audioContent, filename);
      
      logger.info('Audio generated', {
        language,
        textLength: text.length,
        filename,
      });
      
      return url;
    } catch (error) {
      logger.error('Error generating audio:', error);
      throw error;
    }
  }
  
  getVoiceConfig(language) {
    const configs = {
      en: {
        voice: {
          languageCode: 'en-US',
          name: 'en-US-Wavenet-F',
          ssmlGender: 'FEMALE',
        },
        rate: 0.9,
        pitch: 0,
      },
      zu: {
        voice: {
          languageCode: 'zu-ZA',
          name: 'zu-ZA-Standard-A',
          ssmlGender: 'FEMALE',
        },
        rate: 0.9,
        pitch: 0,
      },
      hi: {
        voice: {
          languageCode: 'hi-IN',
          name: 'hi-IN-Wavenet-A',
          ssmlGender: 'FEMALE',
        },
        rate: 0.9,
        pitch: 0,
      },
      ha: {
        // Hausa not directly supported, use English with Nigerian accent
        voice: {
          languageCode: 'en-NG',
          name: 'en-NG-Standard-A',
          ssmlGender: 'FEMALE',
        },
        rate: 0.85,
        pitch: 0,
      },
      sw: {
        voice: {
          languageCode: 'sw-KE',
          name: 'sw-KE-Standard-A',
          ssmlGender: 'FEMALE',
        },
        rate: 0.9,
        pitch: 0,
      },
      pt: {
        voice: {
          languageCode: 'pt-BR',
          name: 'pt-BR-Wavenet-A',
          ssmlGender: 'FEMALE',
        },
        rate: 0.9,
        pitch: 0,
      },
      es: {
        voice: {
          languageCode: 'es-US',
          name: 'es-US-Wavenet-A',
          ssmlGender: 'FEMALE',
        },
        rate: 0.9,
        pitch: 0,
      },
    };
    
    return configs[language] || configs.en;
  }
  
  async checkCache(filename) {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(filename);
      const [exists] = await file.exists();
      
      if (exists) {
        return `https://storage.googleapis.com/${this.bucketName}/${filename}`;
      }
      
      return null;
    } catch (error) {
      logger.error('Cache check error:', error);
      return null;
    }
  }
  
  async saveAudio(audioContent, filename) {
    try {
      // Save locally first
      const localPath = `./temp/${filename}`;
      await fs.mkdir('./temp/audio', { recursive: true });
      await fs.writeFile(localPath, audioContent, 'binary');
      
      // Upload to cloud storage
      const bucket = this.storage.bucket(this.bucketName);
      await bucket.upload(localPath, {
        destination: filename,
        metadata: {
          contentType: 'audio/mpeg',
          cacheControl: 'public, max-age=31536000',
        },
      });
      
      // Clean up local file
      await fs.unlink(localPath);
      
      // Return public URL
      return `https://storage.googleapis.com/${this.bucketName}/${filename}`;
    } catch (error) {
      logger.error('Error saving audio:', error);
      throw error;
    }
  }
  
  async generateSSML(text, emphasis = 'moderate') {
    // Generate SSML for more natural speech
    const ssml = `
      <speak>
        <prosody rate="90%" pitch="-1st">
          <emphasis level="${emphasis}">
            ${text}
          </emphasis>
          <break time="500ms"/>
          Please respond when you're ready.
        </prosody>
      </speak>
    `;
    
    return ssml;
  }
}

export const voiceService = new VoiceService();
export default voiceService;