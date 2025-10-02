import mongoose from 'mongoose';

const adherenceLogSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  
  medicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Medication',
    required: true,
    index: true,
  },
  
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true,
  },
  
  date: {
    type: Date,
    required: true,
    index: true,
  },
  
  scheduledTime: {
    type: Date,
    required: true,
  },
  
  actualTime: Date,
  
  status: {
    type: String,
    enum: ['taken', 'missed', 'snoozed', 'skipped', 'late'],
    required: true,
    index: true,
  },
  
  dose: {
    scheduled: String,
    actual: String,
  },
  
  delayMinutes: {
    type: Number,
    default: 0,
  },
  
  escalationReached: {
    type: Number,
    default: 0,
  },
  
  responseMethod: {
    type: String,
    enum: ['button', 'text', 'voice', 'caregiver', 'manual', 'auto'],
  },
  
  sideEffects: [String],
  
  notes: String,
  
  context: {
    location: String,
    activity: String,
    mood: String,
    symptoms: [String],
  },
  
  flags: {
    wasHospitalized: Boolean,
    hadSideEffects: Boolean,
    requiredAssistance: Boolean,
    criticalMedication: Boolean,
  },
}, {
  timestamps: true,
});

// Indexes for reporting
adherenceLogSchema.index({ userId: 1, date: -1 });
adherenceLogSchema.index({ medicationId: 1, date: -1 });
adherenceLogSchema.index({ status: 1, date: -1 });
adherenceLogSchema.index({ 'flags.criticalMedication': 1, status: 1 });

// Calculate adherence metrics
adherenceLogSchema.statics.calculateAdherence = async function(userId, days = 30) {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  
  const logs = await this.find({
    userId,
    date: { $gte: startDate },
  });
  
  const taken = logs.filter(log => log.status === 'taken' || log.status === 'late').length;
  const total = logs.length;
  
  return {
    adherenceRate: total > 0 ? (taken / total) * 100 : 0,
    taken,
    missed: logs.filter(log => log.status === 'missed').length,
    skipped: logs.filter(log => log.status === 'skipped').length,
    total,
  };
};

const AdherenceLog = mongoose.model('AdherenceLog', adherenceLogSchema);
export default AdherenceLog;