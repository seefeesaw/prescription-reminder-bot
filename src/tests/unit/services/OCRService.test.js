import { jest } from '@jest/globals';
import { ocrService } from '../services/OCRService.js';
import vision from '@google-cloud/vision';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';

// Mock dependencies
jest.mock('@google-cloud/vision');
jest.mock('sharp');
jest.mock('../utils/logger.js');

describe('OCRService', () => {
  let mockClient;
  let mockSharp;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Google Cloud Vision client
    mockClient = {
      textDetection: jest.fn(),
    };

    vision.ImageAnnotatorClient = jest.fn(() => mockClient);

    // Mock Sharp
    mockSharp = {
      resize: jest.fn().mockReturnThis(),
      grayscale: jest.fn().mockReturnThis(),
      normalize: jest.fn().mockReturnThis(),
      sharpen: jest.fn().mockReturnThis(),
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image')),
    };

    sharp.mockReturnValue(mockSharp);
  });

  describe('extractText', () => {
    const mockImageBuffer = Buffer.from('test-image');

    it('should successfully extract text from image', async () => {
      const mockResult = {
        textAnnotations: [
          {
            description: 'Amoxicillin 500mg\nTake 3 times daily\nFor 7 days',
            confidence: 0.95,
          },
        ],
      };

      mockClient.textDetection.mockResolvedValue([mockResult]);

      const result = await ocrService.extractText(mockImageBuffer);

      expect(result.text).toBe('Amoxicillin 500mg\nTake 3 times daily\nFor 7 days');
      expect(result.confidence).toBe(0.95);
      expect(result.structured).toBeDefined();
    });

    it('should preprocess image before OCR', async () => {
      const mockResult = {
        textAnnotations: [
          {
            description: 'Test text',
            confidence: 0.9,
          },
        ],
      };

      mockClient.textDetection.mockResolvedValue([mockResult]);

      await ocrService.extractText(mockImageBuffer);

      expect(sharp).toHaveBeenCalledWith(mockImageBuffer);
      expect(mockSharp.resize).toHaveBeenCalledWith(2000, null, {
        withoutEnlargement: true,
      });
      expect(mockSharp.grayscale).toHaveBeenCalled();
      expect(mockSharp.normalize).toHaveBeenCalled();
      expect(mockSharp.sharpen).toHaveBeenCalled();
      expect(mockSharp.toBuffer).toHaveBeenCalled();
    });

    it('should call Google Vision API with processed image', async () => {
      const mockResult = {
        textAnnotations: [
          {
            description: 'Test text',
            confidence: 0.9,
          },
        ],
      };

      mockClient.textDetection.mockResolvedValue([mockResult]);

      await ocrService.extractText(mockImageBuffer);

      expect(mockClient.textDetection).toHaveBeenCalledWith({
        image: {
          content: Buffer.from('processed-image'),
        },
      });
    });

    it('should handle no text detected', async () => {
      mockClient.textDetection.mockResolvedValue([
        { textAnnotations: [] },
      ]);

      const result = await ocrService.extractText(mockImageBuffer);

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith('No text found in image');
    });

    it('should handle null text annotations', async () => {
      mockClient.textDetection.mockResolvedValue([
        { textAnnotations: null },
      ]);

      const result = await ocrService.extractText(mockImageBuffer);

      expect(result.text).toBe('');
      expect(result.confidence).toBe(0);
    });

    it('should use default confidence if not provided', async () => {
      const mockResult = {
        textAnnotations: [
          {
            description: 'Test text',
          },
        ],
      };

      mockClient.textDetection.mockResolvedValue([mockResult]);

      const result = await ocrService.extractText(mockImageBuffer);

      expect(result.confidence).toBe(0.9);
    });

    it('should log extraction completion', async () => {
      const mockResult = {
        textAnnotations: [
          {
            description: 'Amoxicillin 500mg\nTake 3 times daily',
            confidence: 0.95,
          },
        ],
      };

      mockClient.textDetection.mockResolvedValue([mockResult]);

      await ocrService.extractText(mockImageBuffer);

      expect(logger.info).toHaveBeenCalledWith(
        'OCR extraction complete',
        expect.objectContaining({
          textLength: expect.any(Number),
          medicationsFound: expect.any(Number),
        })
      );
    });

    it('should handle OCR errors', async () => {
      const error = new Error('Vision API error');
      mockClient.textDetection.mockRejectedValue(error);

      await expect(
        ocrService.extractText(mockImageBuffer)
      ).rejects.toThrow('Vision API error');

      expect(logger.error).toHaveBeenCalledWith(
        'OCR extraction error:',
        error
      );
    });
  });

  describe('preprocessImage', () => {
    const mockImageBuffer = Buffer.from('test-image');

    it('should apply all image enhancements', async () => {
      await ocrService.preprocessImage(mockImageBuffer);

      expect(sharp).toHaveBeenCalledWith(mockImageBuffer);
      expect(mockSharp.resize).toHaveBeenCalledWith(2000, null, {
        withoutEnlargement: true,
      });
      expect(mockSharp.grayscale).toHaveBeenCalled();
      expect(mockSharp.normalize).toHaveBeenCalled();
      expect(mockSharp.sharpen).toHaveBeenCalled();
      expect(mockSharp.toBuffer).toHaveBeenCalled();
    });

    it('should return processed buffer', async () => {
      const result = await ocrService.preprocessImage(mockImageBuffer);

      expect(result).toEqual(Buffer.from('processed-image'));
    });

    it('should return original buffer if processing fails', async () => {
      const error = new Error('Sharp processing error');
      mockSharp.toBuffer.mockRejectedValue(error);

      const result = await ocrService.preprocessImage(mockImageBuffer);

      expect(result).toEqual(mockImageBuffer);
      expect(logger.error).toHaveBeenCalledWith(
        'Image preprocessing error:',
        error
      );
    });

    it('should handle sharp initialization error', async () => {
      sharp.mockImplementation(() => {
        throw new Error('Sharp init error');
      });

      const result = await ocrService.preprocessImage(mockImageBuffer);

      expect(result).toEqual(mockImageBuffer);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('extractStructuredData', () => {
    it('should extract medication information', () => {
      const text = 'Amoxicillin 500mg\nTake 3 times daily\nFor 7 days';

      const result = ocrService.extractStructuredData(text);

      expect(result.medications).toHaveLength(1);
      expect(result.medications[0].name).toBe('Amoxicillin');
      expect(result.medications[0].dosage).toBe('500 mg');
      expect(result.medications[0].frequency).toBe('3 times daily');
      expect(result.medications[0].duration).toContain('7');
    });

    it('should extract multiple medications', () => {
      const text = `Amoxicillin 500mg
Take 3 times daily
For 7 days

Ibuprofen 400mg
Take 2 times daily
For 5 days`;

      const result = ocrService.extractStructuredData(text);

      expect(result.medications).toHaveLength(2);
      expect(result.medications[0].name).toBe('Amoxicillin');
      expect(result.medications[1].name).toBe('Ibuprofen');
    });

    it('should extract dosage in different units', () => {
      const testCases = [
        { text: 'Medicine 500mg', expected: '500 mg' },
        { text: 'Medicine 10ml', expected: '10 ml' },
        { text: 'Medicine 250mcg', expected: '250 mcg' },
        { text: 'Medicine 1g', expected: '1 g' },
      ];

      testCases.forEach(({ text, expected }) => {
        const result = ocrService.extractStructuredData(text);
        expect(result.medications[0]?.dosage).toBe(expected);
      });
    });

    it('should extract frequency patterns', () => {
      const testCases = [
        { text: 'Take 1 time daily', expected: '1 times daily' },
        { text: 'Take 2 times a day', expected: '2 times daily' },
        { text: 'Take 3 times per day', expected: '3 times daily' },
        { text: 'Take 4x daily', expected: '4 times daily' },
      ];

      testCases.forEach(({ text, expected }) => {
        const result = ocrService.extractStructuredData(text);
        if (result.medications[0]?.frequency) {
          expect(result.medications[0].frequency).toBe(expected);
        }
      });
    });

    it('should extract duration in different formats', () => {
      const testCases = [
        { text: 'For 7 days', duration: '7 days' },
        { text: 'For 2 weeks', duration: '2 weeks' },
        { text: 'x 30 days', duration: '30 days' },
        { text: 'For 3 months', duration: '3 months' },
      ];

      testCases.forEach(({ text, duration }) => {
        const result = ocrService.extractStructuredData(text);
        if (result.medications[0]?.duration) {
          expect(result.medications[0].duration).toContain(duration.split(' ')[0]);
        }
      });
    });

    it('should extract instructions', () => {
      const text = 'Medicine 500mg\nTake with food and water';

      const result = ocrService.extractStructuredData(text);

      expect(result.medications[0]?.instructions).toContain('with food');
    });

    it('should include raw text', () => {
      const text = 'Amoxicillin 500mg';

      const result = ocrService.extractStructuredData(text);

      expect(result.rawText).toBe(text);
    });

    it('should extract doctor name', () => {
      const text = 'Dr. John Smith\nAmoxicillin 500mg';

      const result = ocrService.extractStructuredData(text);

      expect(result.doctorName).toBe('John Smith');
    });

    it('should extract date', () => {
      const text = 'Date: 15/01/2024\nAmoxicillin 500mg';

      const result = ocrService.extractStructuredData(text);

      expect(result.date).toBe('15/01/2024');
    });

    it('should extract patient name', () => {
      const text = 'Patient: Jane Doe\nAmoxicillin 500mg';

      const result = ocrService.extractStructuredData(text);

      expect(result.patientName).toBe('Jane Doe');
    });

    it('should handle empty text', () => {
      const result = ocrService.extractStructuredData('');

      expect(result.medications).toHaveLength(0);
      expect(result.rawText).toBe('');
    });

    it('should handle text with no medications', () => {
      const text = 'This is just some random text';

      const result = ocrService.extractStructuredData(text);

      expect(result.medications).toHaveLength(0);
    });

    it('should trim whitespace from lines', () => {
      const text = '  Amoxicillin 500mg  \n  Take 3 times daily  ';

      const result = ocrService.extractStructuredData(text);

      expect(result.medications[0].name).toBe('Amoxicillin');
      expect(result.medications[0].dosage).toBe('500 mg');
    });
  });

  describe('extractDoctorName', () => {
    it('should extract doctor name with Dr. prefix', () => {
      const text = 'Dr. John Smith prescribed medication';
      const name = ocrService.extractDoctorName(text);
      expect(name).toBe('John Smith');
    });

    it('should extract doctor name without period', () => {
      const text = 'Dr Sarah Johnson';
      const name = ocrService.extractDoctorName(text);
      expect(name).toBe('Sarah Johnson');
    });

    it('should extract from physician label', () => {
      const text = 'Physician: Michael Brown';
      const name = ocrService.extractDoctorName(text);
      expect(name).toBe('Michael Brown');
    });

    it('should extract from prescribed by label', () => {
      const text = 'Prescribed by: Emily Davis';
      const name = ocrService.extractDoctorName(text);
      expect(name).toBe('Emily Davis');
    });

    it('should return null if no doctor name found', () => {
      const text = 'Amoxicillin 500mg';
      const name = ocrService.extractDoctorName(text);
      expect(name).toBeNull();
    });

    it('should handle case insensitive matching', () => {
      const text = 'DR. ROBERT WILSON';
      const name = ocrService.extractDoctorName(text);
      expect(name).toBe('ROBERT WILSON');
    });
  });

  describe('extractDate', () => {
    it('should extract date in DD/MM/YYYY format', () => {
      const text = 'Date: 15/01/2024';
      const date = ocrService.extractDate(text);
      expect(date).toBe('15/01/2024');
    });

    it('should extract date in DD-MM-YYYY format', () => {
      const text = 'Date: 15-01-2024';
      const date = ocrService.extractDate(text);
      expect(date).toBe('15-01-2024');
    });

    it('should extract date in short year format', () => {
      const text = 'Date: 15/01/24';
      const date = ocrService.extractDate(text);
      expect(date).toBe('15/01/24');
    });

    it('should extract date with month name', () => {
      const text = 'Date: 15 January 2024';
      const date = ocrService.extractDate(text);
      expect(date).toBe('15 January 2024');
    });

    it('should extract abbreviated month names', () => {
      const text = 'Date: 15 Jan 2024';
      const date = ocrService.extractDate(text);
      expect(date).toBe('15 Jan 2024');
    });

    it('should handle case insensitive month names', () => {
      const text = 'Date: 15 DECEMBER 2024';
      const date = ocrService.extractDate(text);
      expect(date).toBe('15 DECEMBER 2024');
    });

    it('should return null if no date found', () => {
      const text = 'Amoxicillin 500mg';
      const date = ocrService.extractDate(text);
      expect(date).toBeNull();
    });
  });

  describe('extractPatientName', () => {
    it('should extract patient name with patient label', () => {
      const text = 'Patient: John Doe';
      const name = ocrService.extractPatientName(text);
      expect(name).toBe('John Doe');
    });

    it('should extract patient name with name label', () => {
      const text = 'Name: Jane Smith';
      const name = ocrService.extractPatientName(text);
      expect(name).toBe('Jane Smith');
    });

    it('should extract patient name with for label', () => {
      const text = 'For: Robert Wilson';
      const name = ocrService.extractPatientName(text);
      expect(name).toBe('Robert Wilson');
    });

    it('should return null if no patient name found', () => {
      const text = 'Amoxicillin 500mg';
      const name = ocrService.extractPatientName(text);
      expect(name).toBeNull();
    });

    it('should handle case insensitive matching', () => {
      const text = 'PATIENT: SARAH JOHNSON';
      const name = ocrService.extractPatientName(text);
      expect(name).toBe('SARAH JOHNSON');
    });

    it('should trim whitespace', () => {
      const text = 'Patient:   Emily Davis   ';
      const name = ocrService.extractPatientName(text);
      expect(name).toBe('Emily Davis');
    });
  });

  describe('Integration tests', () => {
    it('should handle complete prescription extraction', async () => {
      const mockResult = {
        textAnnotations: [
          {
            description: `Dr. John Smith
Date: 15/01/2024
Patient: Jane Doe

Amoxicillin 500mg
Take 3 times daily with food
For 7 days

Ibuprofen 400mg
Take 2 times per day
For 5 days`,
            confidence: 0.95,
          },
        ],
      };

      mockClient.textDetection.mockResolvedValue([mockResult]);

      const result = await ocrService.extractText(Buffer.from('test-image'));

      expect(result.structured.doctorName).toBe('John Smith');
      expect(result.structured.date).toBe('15/01/2024');
      expect(result.structured.patientName).toBe('Jane Doe');
      expect(result.structured.medications).toHaveLength(2);
      expect(result.structured.medications[0].name).toBe('Amoxicillin');
      expect(result.structured.medications[1].name).toBe('Ibuprofen');
    });

    it('should handle prescription with Rx prefix', () => {
      const text = 'Rx: Amoxicillin 500mg\nTake 3 times daily';

      const result = ocrService.extractStructuredData(text);

      expect(result.medications).toHaveLength(1);
      expect(result.medications[0].name).toBe('Amoxicillin');
    });

    it('should handle medication prefix', () => {
      const text = 'Medication: Ibuprofen 400mg';

      const result = ocrService.extractStructuredData(text);

      expect(result.medications).toHaveLength(1);
      expect(result.medications[0].name).toBe('Ibuprofen');
    });
  });
});