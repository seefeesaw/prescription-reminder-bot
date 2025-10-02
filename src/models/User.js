import mongoose from 'mongoose';
import bcrypt from 'bcrypt';
import { CONSTANTS } from '../config/constants.js';

const userSchema = new mongoose.Schema({
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
    validate: {
      validator: (v) => /^\+[1-9]\d{1,14}$/.test(v),
      message: 'Invalid phone number format',
    },
  },
  
  whatsappId: {
    type: String,
    required: true,
    unique: true,
  },
  
  name: {
    type: String,
    default: 'Friend',
  },
  
  language: {
    type: String,
    enum: Object.keys(CONSTANTS.LANGUAGES),
    default: 'en',
  },
  
  timezone: {
    type: String,
    default: 'UTC',
  },
  
  state: {
    type: String,
    enum: Object.values(CONSTANTS.USER_STATES),
    default: CONSTANTS.USER_STATES.NEW,
  },
  
  onboardingStep: {
    type: Number,
    default: 0,
  },
  
  settings: {
    voiceReminders: { type: Boolean, default: false },
    escalationEnabled: { type: Boolean, default: true },
    quietHours: {
      enabled: { type: Boolean, default: false },
      start: { type: String, default: '22:00' },
      end: { type: String, default: '07:00' },
    },
    defaultPrivacyLevel: {
      type: Number,
      min: 1,
      max: 6,
      default: 2,
    },
  },
  
  caregivers: [{
    name: String,
    phoneNumber: String,
    relationship: String,
    alertLevel: {
      type: Number,
      min: 1,
      max: 5,
      default: 4,
    },
  }],
  
  subscription: {
    type: {
      type: String,
      enum: ['free', 'premium', 'clinic'],
      default: 'free',
    },
    validUntil: Date,
    clinicId: { type: mongoose.Schema.Types.ObjectId, ref: 'Clinic' },
  },
  
  stats: {
    totalMedications: { type: Number, default: 0 },
    adherenceRate: { type: Number, default: 100 },
    streak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastActive: { type: Date, default: Date.now },
  },
  
  flags: {
    isActive: { type: Boolean, default: true },
    isBlocked: { type: Boolean, default: false },
    hasCompletedOnboarding: { type: Boolean, default: false },
    hasUploadedPrescription: { type: Boolean, default: false },
  },
  
  metadata: {
    source: String,
    referredBy: String,
    clinicCode: String,
    notes: String,
  },
}, {
  timestamps: true,
});

// Indexes for performance
userSchema.index({ 'state': 1, 'flags.isActive': 1 });
userSchema.index({ 'subscription.validUntil': 1 });
userSchema.index({ createdAt: -1 });

// Methods
userSchema.methods.isSubscribed = function() {
  return this.subscription.type === 'premium' && 
         this.subscription.validUntil > new Date();
};

userSchema.methods.canAddMedication = function() {
  const limit = this.isSubscribed() ? 50 : CONSTANTS.LIMITS.MAX_MEDICATIONS;
  return this.stats.totalMedications < limit;
};

userSchema.methods.updateAdherence = function(taken, total) {
  if (total === 0) return;
  this.stats.adherenceRate = Math.round((taken / total) * 100);
};

const User = mongoose.model('User', userSchema);
export default User;