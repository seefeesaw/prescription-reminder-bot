import OpenAI from 'openai';
import { logger } from '../utils/logger.js';
import { CONSTANTS } from '../config/constants.js';

class AIParserService {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  
  async parsePrescription(ocrText, userId) {
    try {
      const prompt = this.buildPrescriptionPrompt(ocrText);
      
      const completion = await this.openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a medical prescription parser. Extract medication information and suggest privacy-preserving nicknames. Be accurate but never store actual drug names unless explicitly requested.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      });
      
      const result = JSON.parse(completion.choices[0].message.content);
      
      // Process each medication
      const medications = result.medications.map(med => ({
        ...med,
        suggestedNickname: this.generateNickname(med),
        schedule: this.parseSchedule(med),
      }));
      
      logger.info('Prescription parsed by AI', {
        userId,
        medicationCount: medications.length,
      });
      
      return {
        medications,
        confidence: result.confidence || 0.9,
        warnings: result.warnings || [],
      };
      
    } catch (error) {
      logger.error('AI parsing error:', error);
      throw error;
    }
  }
  
  buildPrescriptionPrompt(ocrText) {
    return `
Parse this prescription text and extract medication information.
Return JSON with this structure:
{
  "medications": [
    {
      "actualName": "real medication name (encrypt this)",
      "genericName": "generic name if different",
      "dosage": "e.g., 500mg",
      "form": "tablet/capsule/syrup",
      "frequency": "e.g., 3 times daily",
      "duration": "e.g., 7 days",
      "instructions": "take with food, etc",
      "color": "if visible/mentioned",
      "shape": "round/oval/etc",
      "purpose": "what it treats (general)",
      "criticalMedication": true/false
    }
  ],
  "confidence": 0.0-1.0,
  "warnings": ["any important notes"]
}

Prescription text:
${ocrText}

Important:
- Extract ALL medications mentioned
- For privacy, we'll encrypt actualName later
- Suggest generic nicknames like "morning medicine"
- Mark HIV, TB, diabetes, heart medications as critical
- Include any special instructions
`;
  }
  
  generateNickname(medication) {
    // Generate privacy-preserving nickname suggestions
    const nicknames = [];
    
    // Based on timing
    if (medication.frequency.includes('morning')) {
      nicknames.push('Morning medicine');
    } else if (medication.frequency.includes('evening')) {
      nicknames.push('Evening medicine');
    }
    
    // Based on color/shape
    if (medication.color && medication.shape) {
      nicknames.push(`${medication.color} ${medication.shape} pill`);
    } else if (medication.color) {
      nicknames.push(`${medication.color} pill`);
    }
    
    // Based on form
    if (medication.form) {
      nicknames.push(`Daily ${medication.form}`);
    }
    
    // Default suggestions
    nicknames.push(...CONSTANTS.DEFAULT_NICKNAMES);
    
    return nicknames[0] || 'Your medication';
  }
  
  parseSchedule(medication) {
    const schedule = {
      times: [],
      frequency: 'daily',
      duration: 7, // Default 7 days
    };
    
    // Parse frequency
    const frequencyMatch = medication.frequency.match(/(\d+)\s*(?:times?|x)/i);
    if (frequencyMatch) {
      const timesPerDay = parseInt(frequencyMatch[1]);
      schedule.times = this.generateTimes(timesPerDay);
    }
    
    // Parse duration
    const durationMatch = medication.duration.match(/(\d+)\s*(?:days?|weeks?)/i);
    if (durationMatch) {
      let duration = parseInt(durationMatch[1]);
      if (medication.duration.includes('week')) {
        duration *= 7;
      }
      schedule.duration = duration;
    }
    
    return schedule;
  }
  
  generateTimes(timesPerDay) {
    const times = [];
    
    switch (timesPerDay) {
      case 1:
        times.push({ time: '08:00', dose: '1', withFood: false });
        break;
      case 2:
        times.push({ time: '08:00', dose: '1', withFood: false });
        times.push({ time: '20:00', dose: '1', withFood: false });
        break;
      case 3:
        times.push({ time: '08:00', dose: '1', withFood: true });
        times.push({ time: '14:00', dose: '1', withFood: true });
        times.push({ time: '20:00', dose: '1', withFood: true });
        break;
      case 4:
        times.push({ time: '06:00', dose: '1', withFood: false });
        times.push({ time: '12:00', dose: '1', withFood: true });
        times.push({ time: '18:00', dose: '1', withFood: true });
        times.push({ time: '23:00', dose: '1', withFood: false });
        break;
      default:
        // Space evenly throughout the day
        const interval = Math.floor(16 / timesPerDay); // Active hours
        for (let i = 0; i < timesPerDay; i++) {
          const hour = 6 + (i * interval);
          times.push({
            time: `${hour.toString().padStart(2, '0')}:00`,
            dose: '1',
            withFood: false,
          });
        }
    }
    
    return times;
  }
  
  async checkDrugInteractions(medications) {
    // In production, integrate with drug interaction API
    // For MVP, basic checks
    const warnings = [];
    
    // Check for duplicate medications
    const names = medications.map(m => m.actualName?.toLowerCase());
    const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
    
    if (duplicates.length > 0) {
      warnings.push('Duplicate medications detected. Please verify with your doctor.');
    }
    
    return warnings;
  }
  
  async identifyPillByImage(imageBuffer) {
    try {
      // Use GPT-4 Vision to identify pill
      const base64Image = imageBuffer.toString('base64');
      
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Identify this pill. Describe its color, shape, markings, and likely medication if identifiable. Return JSON.',
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/jpeg;base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
      });
      
      return JSON.parse(response.choices[0].message.content);
    } catch (error) {
      logger.error('Pill identification error:', error);
      return null;
    }
  }
}

export const aiParserService = new AIParserService();
export default aiParserService;