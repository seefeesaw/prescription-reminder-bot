import vision from '@google-cloud/vision';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';

class OCRService {
  constructor() {
    this.client = new vision.ImageAnnotatorClient({
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    });
  }
  
  async extractText(imageBuffer) {
    try {
      // Preprocess image for better OCR
      const processedImage = await this.preprocessImage(imageBuffer);
      
      // Perform OCR
      const [result] = await this.client.textDetection({
        image: {
          content: processedImage,
        },
      });
      
      const detections = result.textAnnotations;
      
      if (!detections || detections.length === 0) {
        logger.warn('No text found in image');
        return { text: '', confidence: 0 };
      }
      
      // Get full text
      const fullText = detections[0].description;
      
      // Extract structured information
      const structured = this.extractStructuredData(fullText);
      
      logger.info('OCR extraction complete', {
        textLength: fullText.length,
        medicationsFound: structured.medications.length,
      });
      
      return {
        text: fullText,
        structured,
        confidence: detections[0].confidence || 0.9,
      };
      
    } catch (error) {
      logger.error('OCR extraction error:', error);
      throw error;
    }
  }
  
  async preprocessImage(imageBuffer) {
    try {
      // Enhance image for better OCR
      const processed = await sharp(imageBuffer)
        .resize(2000, null, { 
          withoutEnlargement: true,
        })
        .grayscale()
        .normalize()
        .sharpen()
        .toBuffer();
      
      return processed;
    } catch (error) {
      logger.error('Image preprocessing error:', error);
      return imageBuffer; // Return original if processing fails
    }
  }
  
  extractStructuredData(text) {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
    const medications = [];
    
    // Patterns for common prescription formats
    const patterns = {
      medication: /^(?:rx:|medication:)?\s*(.+?)(?:\s+\d+mg|\s+\d+ml)?/i,
      dosage: /(\d+(?:\.\d+)?)\s*(mg|ml|mcg|g|tablet|capsule|pill)/i,
      frequency: /(\d+)\s*(?:times?|x)\s*(?:a|per)?\s*(?:day|daily)/i,
      duration: /(?:for|x)\s*(\d+)\s*(?:days?|weeks?|months?)/i,
      instructions: /(?:take|consume|apply|use)\s+(.+)/i,
    };
    
    let currentMedication = null;
    
    for (const line of lines) {
      // Check if this is a new medication
      if (patterns.medication.test(line)) {
        if (currentMedication) {
          medications.push(currentMedication);
        }
        
        currentMedication = {
          rawText: line,
          name: '',
          dosage: '',
          frequency: '',
          duration: '',
          instructions: '',
        };
        
        // Extract medication name
        const match = line.match(patterns.medication);
        if (match) {
          currentMedication.name = match[1].trim();
        }
      }
      
      if (currentMedication) {
        // Extract dosage
        const dosageMatch = line.match(patterns.dosage);
        if (dosageMatch) {
          currentMedication.dosage = `${dosageMatch[1]} ${dosageMatch[2]}`;
        }
        
        // Extract frequency
        const frequencyMatch = line.match(patterns.frequency);
        if (frequencyMatch) {
          currentMedication.frequency = `${frequencyMatch[1]} times daily`;
        }
        
        // Extract duration
        const durationMatch = line.match(patterns.duration);
        if (durationMatch) {
          currentMedication.duration = `${durationMatch[1]} ${durationMatch[2]}`;
        }
        
        // Extract instructions
        const instructionsMatch = line.match(patterns.instructions);
        if (instructionsMatch) {
          currentMedication.instructions = instructionsMatch[1];
        }
      }
    }
    
    // Add last medication
    if (currentMedication) {
      medications.push(currentMedication);
    }
    
    return {
      medications,
      rawText: text,
      doctorName: this.extractDoctorName(text),
      date: this.extractDate(text),
      patientName: this.extractPatientName(text),
    };
  }
  
  extractDoctorName(text) {
    const patterns = [
      /dr\.?\s+([a-z\s]+)/i,
      /physician:\s*([a-z\s]+)/i,
      /prescribed by:\s*([a-z\s]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return null;
  }
  
  extractDate(text) {
    const patterns = [
      /(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/,
      /(\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+\d{2,4})/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    
    return null;
  }
  
  extractPatientName(text) {
    const patterns = [
      /patient:\s*([a-z\s]+)/i,
      /name:\s*([a-z\s]+)/i,
      /for:\s*([a-z\s]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }
    
    return null;
  }
}

export const ocrService = new OCRService();
export default ocrService;