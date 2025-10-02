import mongoose from 'mongoose';

const escalationSchema = new mongoose.Schema({
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
  },
  
  scheduleId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Schedule',
    required: true,
  },
  
  level: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  
  type: {
    type: String,
    enum: ['reminder', 'urgent', 'voice_call', 'caregiver', 'clinic'],
    required: true,
  },
  
  status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'responded', 'failed'],
    default: 'pending',
  },
  
  attempts: [{
    attemptedAt: Date,
    method: String,
    success: Boolean,
    error: String,
    response: String,
  }],
  
  caregiver: {
    notified: Boolean,
    phoneNumber: String,
    relationship: String,
    notifiedAt: Date,
    response: String,
  },
  
  resolution: {
    resolved: Boolean,
    resolvedAt: Date,
    resolvedBy: String,      // 'user', 'caregiver', 'timeout'
    outcome: String,          // 'taken', 'skipped', 'refused'
    notes: String,
  },
  
  metadata: {
    criticalMedication: Boolean,
    previousMissed: Number,
    adherenceRate: Number,
  },
}, {
  timestamps: true,
});

// Indexes
escalationSchema.index({ status: 1, level: 1 });
escalationSchema.index({ userId: 1, createdAt: -1 });

const Escalation = mongoose.model('Escalation', escalationSchema);
export default Escalation;