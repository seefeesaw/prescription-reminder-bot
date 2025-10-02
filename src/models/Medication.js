import mongoose from 'mongoose';
import CryptoJS from 'crypto-js';
import { CONSTANTS } from '../config/constants.js';

const medicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  // User-facing information
  nickname: {
    type: String,
    required: true,
    maxlength: CONSTANTS.LIMITS.MAX_NICKNAME_LENGTH,
  },
  
  // Encrypted actual medication information
  encryptedData: {
    actualName: String,        // Real medication name
    genericName: String,       // Generic name
    dosage: String,           // e.g., "500mg"
    form: String,             // tablet, capsule, syrup
    manufacturer: String,
  },
  
  // Visual identification
  visual: {
    imageUrl: String,
    imageHash: String,
    color: String,
    shape: String,
    markings: String,
    size: String,
  },
  
  // Schedule
  schedule: {
    times: [{
      time: String,           // "08:00"
      dose: String,          // "1 tablet"
      withFood: Boolean,
      notes: String,
    }],
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'asNeeded'],
      default: 'daily',
    },
    daysOfWeek: [Number],    // For weekly frequency [1,3,5] = Mon, Wed, Fri
    startDate: {
      type: Date,
      default: Date.now,
    },
    endDate: Date,
    duration: Number,         // Duration in days
  },
  
  // Privacy settings
  privacyLevel: {
    type: Number,
    min: 1,
    max: 6,
    default: 2,
  },
  
  // Medical information
  medical: {
    purpose: String,          // What it treats (encrypted)
    sideEffects: [String],
    interactions: [String],
    criticalMedication: {
      type: Boolean,
      default: false,
    },
    prescribedBy: String,
    prescriptionDate: Date,
    pharmacyName: String,
  },
  
  // Supply tracking
  supply: {
    totalQuantity: Number,
    remainingQuantity: Number,
    refillReminder: {
      enabled: Boolean,
      daysBeforeEmpty: { type: Number, default: 7 },
    },
    lastRefillDate: Date,
  },
  
  // Status
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'discontinued'],
    default: 'active',
  },
  
  // Adherence tracking
  adherence: {
    taken: { type: Number, default: 0 },
    missed: { type: Number, default: 0 },
    snoozed: { type: Number, default: 0 },
    rate: { type: Number, default: 100 },
    lastTaken: Date,
    streak: { type: Number, default: 0 },
  },
  
  // Settings
  settings: {
    remindersEnabled: { type: Boolean, default: true },
    escalationEnabled: { type: Boolean, default: true },
    snoozeEnabled: { type: Boolean, default: true },
    customMessage: String,
    voiceReminder: { type: Boolean, default: false },
  },
  
  metadata: {
    addedVia: {
      type: String,
      enum: ['photo', 'text', 'voice', 'clinic'],
    },
    originalPrescriptionUrl: String,
    notes: String,
  },
}, {
  timestamps: true,
});

// Indexes
medicationSchema.index({ userId: 1, status: 1 });
medicationSchema.index({ 'schedule.times.time': 1 });
medicationSchema.index({ 'schedule.endDate': 1 });
medicationSchema.index({ 'supply.remainingQuantity': 1 });

// Encryption/Decryption methods
medicationSchema.methods.encryptSensitiveData = function(data) {
  const encrypted = CryptoJS.AES.encrypt(
    JSON.stringify(data),
    process.env.ENCRYPTION_KEY
  ).toString();
  return encrypted;
};

medicationSchema.methods.decryptSensitiveData = function() {
  if (!this.encryptedData.actualName) return null;
  
  try {
    const decrypted = CryptoJS.AES.decrypt(
      this.encryptedData.actualName,
      process.env.ENCRYPTION_KEY
    );
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  } catch (error) {
    return null;
  }
};

// Get display name based on privacy level
medicationSchema.methods.getDisplayName = function() {
  switch (this.privacyLevel) {
    case 1:
      return this.nickname || 'Your medication';
    case 2:
      return this.visual.color && this.visual.shape 
        ? `${this.visual.color} ${this.visual.shape} pill`
        : this.nickname;
    case 3:
      const time = this.schedule.times[0]?.time;
      return time ? `${time} medication` : this.nickname;
    case 4:
      return this.medical.purpose 
        ? `Medicine for ${this.medical.purpose}`
        : this.nickname;
    case 5:
    case 6:
      const decrypted = this.decryptSensitiveData();
      return decrypted?.actualName || this.nickname;
    default:
      return this.nickname;
  }
};

// Check if refill is needed
medicationSchema.methods.needsRefill = function() {
  if (!this.supply.refillReminder.enabled) return false;
  
  const daysRemaining = this.supply.remainingQuantity / this.schedule.times.length;
  return daysRemaining <= this.supply.refillReminder.daysBeforeEmpty;
};

// Update adherence statistics
medicationSchema.methods.updateAdherenceRate = function() {
  const total = this.adherence.taken + this.adherence.missed;
  if (total > 0) {
    this.adherence.rate = Math.round((this.adherence.taken / total) * 100);
  }
};

const Medication = mongoose.model('Medication', medicationSchema);
export default Medication;