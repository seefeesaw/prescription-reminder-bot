import mongoose from 'mongoose';

const scheduleSchema = new mongoose.Schema({
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
  
  scheduledTime: {
    type: Date,
    required: true,
    index: true,
  },
  
  actualTime: Date,
  
  dose: {
    amount: String,
    unit: String,
  },
  
  status: {
    type: String,
    enum: ['pending', 'sent', 'taken', 'missed', 'snoozed', 'skipped'],
    default: 'pending',
    index: true,
  },
  
  reminders: [{
    sentAt: Date,
    type: {
      type: String,
      enum: ['initial', 'followup', 'escalated', 'voice', 'caregiver'],
    },
    delivered: Boolean,
    read: Boolean,
    respondedAt: Date,
  }],
  
  escalation: {
    level: { type: Number, default: 0 },
    lastEscalatedAt: Date,
    caregiverAlerted: Boolean,
    caregiverAlertedAt: Date,
  },
  
  snooze: {
    count: { type: Number, default: 0 },
    until: Date,
  },
  
  userResponse: {
    action: String,           // 'taken', 'snoozed', 'skipped'
    timestamp: Date,
    method: String,          // 'button', 'text', 'voice'
    notes: String,
  },
  
  context: {
    dayOfWeek: Number,
    isWeekend: Boolean,
    isHoliday: Boolean,
    weather: String,
  },
  
  metadata: {
    batchId: String,         // For bulk processing
    clinicAlert: Boolean,
    flags: [String],
  },
}, {
  timestamps: true,
});

// Indexes for queries
scheduleSchema.index({ userId: 1, scheduledTime: 1 });
scheduleSchema.index({ status: 1, scheduledTime: 1 });
scheduleSchema.index({ medicationId: 1, status: 1 });
scheduleSchema.index({ 'escalation.level': 1 });

// Check if schedule needs escalation
scheduleSchema.methods.needsEscalation = function() {
  if (this.status !== 'sent') return false;
  
  const timeSinceSent = Date.now() - this.scheduledTime;
  const thirtyMinutes = 30 * 60 * 1000;
  
  return timeSinceSent > thirtyMinutes && this.escalation.level < 3;
};

// Record user response
scheduleSchema.methods.recordResponse = function(action, notes) {
  this.userResponse = {
    action,
    timestamp: new Date(),
    method: 'whatsapp',
    notes,
  };
  
  switch (action) {
    case 'taken':
      this.status = 'taken';
      this.actualTime = new Date();
      break;
    case 'snoozed':
      this.status = 'snoozed';
      this.snooze.count++;
      this.snooze.until = new Date(Date.now() + 30 * 60 * 1000);
      break;
    case 'skipped':
      this.status = 'skipped';
      break;
    default:
      this.status = 'missed';
  }
};

const Schedule = mongoose.model('Schedule', scheduleSchema);
export default Schedule;