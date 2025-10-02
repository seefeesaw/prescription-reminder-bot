import { jest } from '@jest/globals';
import { aiParserService } from '../services/AIParserService.js';
import { logger } from '../utils/logger.js';
import OpenAI from 'openai';

// Mock dependencies
jest.mock('openai');
jest.mock('../utils/logger.js');
jest.mock('../config/constants.js', () => ({
  CONSTANTS: {
    DEFAULT_NICKNAMES: ['Medicine A', 'Medicine B', 'Daily pill'],
  },
}));

describe('AIParserService', () => {
  let mockOpenAI;
  let mockCreate;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock OpenAI chat completions
    mockCreate = jest.fn();
    mockOpenAI = {
      chat: {
        completions: {
          create: mockCreate,
        },
      },
    };
    
    OpenAI.mockImplementation(() => mockOpenAI);
  });

  describe('parsePrescription', () => {
    const mockOcrText = 'Amoxicillin 500mg - Take 3 times daily for 7 days';
    const userId = 'test-user-123';

    it('should successfully parse prescription text', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                medications: [
                  {
                    actualName: 'Amoxicillin',
                    genericName: 'Amoxicillin',
                    dosage: '500mg',
                    form: 'tablet',
                    frequency: '3 times daily',
                    duration: '7 days',
                    instructions: 'Take with food',
                    color: 'white',
                    shape: 'oval',
                    purpose: 'antibiotic',
                    criticalMedication: false,
                  },
                ],
                confidence: 0.95,
                warnings: [],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await aiParserService.parsePrescription(mockOcrText, userId);

      expect(result.medications).toHaveLength(1);
      expect(result.medications[0].actualName).toBe('Amoxicillin');
      expect(result.medications[0].dosage).toBe('500mg');
      expect(result.confidence).toBe(0.95);
      expect(logger.info).toHaveBeenCalledWith(
        'Prescription parsed by AI',
        expect.objectContaining({
          userId,
          medicationCount: 1,
        })
      );
    });

    it('should handle multiple medications', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                medications: [
                  {
                    actualName: 'Amoxicillin',
                    dosage: '500mg',
                    form: 'tablet',
                    frequency: '3 times daily',
                    duration: '7 days',
                    color: 'white',
                    shape: 'oval',
                  },
                  {
                    actualName: 'Ibuprofen',
                    dosage: '400mg',
                    form: 'tablet',
                    frequency: '2 times daily',
                    duration: '5 days',
                    color: 'brown',
                    shape: 'round',
                  },
                ],
                confidence: 0.92,
                warnings: ['Take with food'],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await aiParserService.parsePrescription(mockOcrText, userId);

      expect(result.medications).toHaveLength(2);
      expect(result.warnings).toContain('Take with food');
    });

    it('should handle API errors', async () => {
      mockCreate.mockRejectedValue(new Error('API Error'));

      await expect(
        aiParserService.parsePrescription(mockOcrText, userId)
      ).rejects.toThrow('API Error');

      expect(logger.error).toHaveBeenCalledWith(
        'AI parsing error:',
        expect.any(Error)
      );
    });

    it('should use correct OpenAI parameters', async () => {
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                medications: [],
                confidence: 0.9,
                warnings: [],
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await aiParserService.parsePrescription(mockOcrText, userId);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(String),
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'system',
              content: expect.stringContaining('medical prescription parser'),
            }),
            expect.objectContaining({
              role: 'user',
              content: expect.stringContaining(mockOcrText),
            }),
          ]),
          response_format: { type: 'json_object' },
          temperature: 0.1,
        })
      );
    });
  });

  describe('generateNickname', () => {
    it('should generate nickname based on morning timing', () => {
      const medication = {
        frequency: 'once in the morning',
        color: 'blue',
        shape: 'round',
        form: 'tablet',
      };

      const nickname = aiParserService.generateNickname(medication);

      expect(nickname).toBe('Morning medicine');
    });

    it('should generate nickname based on evening timing', () => {
      const medication = {
        frequency: 'once in the evening',
        color: 'red',
        shape: 'oval',
        form: 'capsule',
      };

      const nickname = aiParserService.generateNickname(medication);

      expect(nickname).toBe('Evening medicine');
    });

    it('should generate nickname based on color and shape', () => {
      const medication = {
        frequency: '2 times daily',
        color: 'white',
        shape: 'oval',
        form: 'tablet',
      };

      const nickname = aiParserService.generateNickname(medication);

      expect(nickname).toBe('white oval pill');
    });

    it('should generate nickname based on color only', () => {
      const medication = {
        frequency: '2 times daily',
        color: 'pink',
        form: 'tablet',
      };

      const nickname = aiParserService.generateNickname(medication);

      expect(nickname).toBe('pink pill');
    });

    it('should generate nickname based on form', () => {
      const medication = {
        frequency: '1 time daily',
        form: 'capsule',
      };

      const nickname = aiParserService.generateNickname(medication);

      expect(nickname).toBe('Daily capsule');
    });

    it('should use default nickname as fallback', () => {
      const medication = {
        frequency: '1 time daily',
      };

      const nickname = aiParserService.generateNickname(medication);

      expect(['Medicine A', 'Medicine B', 'Daily pill']).toContain(nickname);
    });
  });

  describe('parseSchedule', () => {
    it('should parse once daily schedule', () => {
      const medication = {
        frequency: '1 time daily',
        duration: '7 days',
      };

      const schedule = aiParserService.parseSchedule(medication);

      expect(schedule.times).toHaveLength(1);
      expect(schedule.times[0].time).toBe('08:00');
      expect(schedule.duration).toBe(7);
    });

    it('should parse twice daily schedule', () => {
      const medication = {
        frequency: '2 times daily',
        duration: '10 days',
      };

      const schedule = aiParserService.parseSchedule(medication);

      expect(schedule.times).toHaveLength(2);
      expect(schedule.times[0].time).toBe('08:00');
      expect(schedule.times[1].time).toBe('20:00');
      expect(schedule.duration).toBe(10);
    });

    it('should parse three times daily schedule', () => {
      const medication = {
        frequency: '3 times daily',
        duration: '5 days',
      };

      const schedule = aiParserService.parseSchedule(medication);

      expect(schedule.times).toHaveLength(3);
      expect(schedule.times[0].time).toBe('08:00');
      expect(schedule.times[1].time).toBe('14:00');
      expect(schedule.times[2].time).toBe('20:00');
      expect(schedule.times.every(t => t.withFood)).toBe(true);
    });

    it('should parse four times daily schedule', () => {
      const medication = {
        frequency: '4 times daily',
        duration: '7 days',
      };

      const schedule = aiParserService.parseSchedule(medication);

      expect(schedule.times).toHaveLength(4);
      expect(schedule.times[0].time).toBe('06:00');
      expect(schedule.times[1].time).toBe('12:00');
      expect(schedule.times[2].time).toBe('18:00');
      expect(schedule.times[3].time).toBe('23:00');
    });

    it('should parse duration in weeks', () => {
      const medication = {
        frequency: '2 times daily',
        duration: '2 weeks',
      };

      const schedule = aiParserService.parseSchedule(medication);

      expect(schedule.duration).toBe(14);
    });

    it('should use default duration if not specified', () => {
      const medication = {
        frequency: '1 time daily',
        duration: '',
      };

      const schedule = aiParserService.parseSchedule(medication);

      expect(schedule.duration).toBe(7);
    });

    it('should handle unusual frequencies', () => {
      const medication = {
        frequency: '5 times daily',
        duration: '3 days',
      };

      const schedule = aiParserService.parseSchedule(medication);

      expect(schedule.times).toHaveLength(5);
      expect(schedule.duration).toBe(3);
    });
  });

  describe('generateTimes', () => {
    it('should generate correct times for various frequencies', () => {
      expect(aiParserService.generateTimes(1)).toHaveLength(1);
      expect(aiParserService.generateTimes(2)).toHaveLength(2);
      expect(aiParserService.generateTimes(3)).toHaveLength(3);
      expect(aiParserService.generateTimes(4)).toHaveLength(4);
    });

    it('should include dose information', () => {
      const times = aiParserService.generateTimes(2);

      expect(times[0]).toHaveProperty('dose', '1');
      expect(times[1]).toHaveProperty('dose', '1');
    });

    it('should include withFood flag', () => {
      const times = aiParserService.generateTimes(3);

      expect(times[0]).toHaveProperty('withFood');
      expect(times[1]).toHaveProperty('withFood');
      expect(times[2]).toHaveProperty('withFood');
    });
  });

  describe('checkDrugInteractions', () => {
    it('should detect duplicate medications', async () => {
      const medications = [
        { actualName: 'Amoxicillin' },
        { actualName: 'Ibuprofen' },
        { actualName: 'Amoxicillin' },
      ];

      const warnings = await aiParserService.checkDrugInteractions(medications);

      expect(warnings).toContain(
        'Duplicate medications detected. Please verify with your doctor.'
      );
    });

    it('should return empty array for no duplicates', async () => {
      const medications = [
        { actualName: 'Amoxicillin' },
        { actualName: 'Ibuprofen' },
        { actualName: 'Paracetamol' },
      ];

      const warnings = await aiParserService.checkDrugInteractions(medications);

      expect(warnings).toHaveLength(0);
    });

    it('should handle case-insensitive duplicates', async () => {
      const medications = [
        { actualName: 'Amoxicillin' },
        { actualName: 'AMOXICILLIN' },
      ];

      const warnings = await aiParserService.checkDrugInteractions(medications);

      expect(warnings.length).toBeGreaterThan(0);
    });

    it('should handle medications without actualName', async () => {
      const medications = [
        { actualName: null },
        { actualName: 'Ibuprofen' },
      ];

      const warnings = await aiParserService.checkDrugInteractions(medications);

      expect(Array.isArray(warnings)).toBe(true);
    });
  });

  describe('identifyPillByImage', () => {
    it('should successfully identify pill from image', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                color: 'white',
                shape: 'oval',
                markings: 'L544',
                likelyMedication: 'Acetaminophen 500mg',
              }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      const result = await aiParserService.identifyPillByImage(mockImageBuffer);

      expect(result.color).toBe('white');
      expect(result.shape).toBe('oval');
      expect(result.likelyMedication).toBe('Acetaminophen 500mg');
    });

    it('should use gpt-4-vision-preview model', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ color: 'blue' }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await aiParserService.identifyPillByImage(mockImageBuffer);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-4-vision-preview',
          messages: expect.arrayContaining([
            expect.objectContaining({
              role: 'user',
              content: expect.arrayContaining([
                expect.objectContaining({
                  type: 'text',
                }),
                expect.objectContaining({
                  type: 'image_url',
                  image_url: expect.objectContaining({
                    url: expect.stringContaining('data:image/jpeg;base64,'),
                  }),
                }),
              ]),
            }),
          ]),
          max_tokens: 500,
        })
      );
    });

    it('should handle identification errors gracefully', async () => {
      const mockImageBuffer = Buffer.from('fake-image-data');
      mockCreate.mockRejectedValue(new Error('Vision API Error'));

      const result = await aiParserService.identifyPillByImage(mockImageBuffer);

      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        'Pill identification error:',
        expect.any(Error)
      );
    });

    it('should convert image buffer to base64', async () => {
      const mockImageBuffer = Buffer.from('test-data');
      const expectedBase64 = mockImageBuffer.toString('base64');
      const mockResponse = {
        choices: [
          {
            message: {
              content: JSON.stringify({ color: 'red' }),
            },
          },
        ],
      };

      mockCreate.mockResolvedValue(mockResponse);

      await aiParserService.identifyPillByImage(mockImageBuffer);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({
                  image_url: {
                    url: `data:image/jpeg;base64,${expectedBase64}`,
                  },
                }),
              ]),
            }),
          ]),
        })
      );
    });
  });

  describe('buildPrescriptionPrompt', () => {
    it('should include OCR text in prompt', () => {
      const ocrText = 'Sample prescription text';
      const prompt = aiParserService.buildPrescriptionPrompt(ocrText);

      expect(prompt).toContain(ocrText);
    });

    it('should request JSON format', () => {
      const prompt = aiParserService.buildPrescriptionPrompt('test');

      expect(prompt).toContain('Return JSON');
      expect(prompt).toContain('medications');
      expect(prompt).toContain('confidence');
      expect(prompt).toContain('warnings');
    });

    it('should include privacy instructions', () => {
      const prompt = aiParserService.buildPrescriptionPrompt('test');

      expect(prompt).toContain('encrypt');
      expect(prompt).toContain('privacy');
    });
  });
});