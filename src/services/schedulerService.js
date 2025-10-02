import Schedule from '../models/Schedule.js';
import Medication from '../models/Medication.js';
import { reminderQueue } from '../queues/reminderQueue.js';
import { logger } from '../utils/logger.js';
import moment from 'moment-timezone';

class SchedulerService {
  async createSchedules(medication) {
    try {
      const schedules = [];
      const user = await User.findById(medication.userId);
      const timezone = user.timezone || 'UTC';
      
      // Generate schedules for the duration
      const startDate = medication.schedule.startDate || new Date();
      const endDate = medication.schedule.endDate || 
        new Date(startDate.getTime() + medication.schedule.duration * 24 * 60 * 60 * 1000);
      
      let currentDate = new Date(startDate);
      
      while (currentDate <= endDate) {
        // Check if this day should have reminders
        if (this.shouldScheduleToday(medication, currentDate)) {
          // Create schedule for each time slot
          for (const timeSlot of medication.schedule.times) {
            const scheduledTime = this.getScheduledTime(currentDate, timeSlot.time, timezone);
            
            // Only create future schedules
            if (scheduledTime > new Date()) {
              const schedule = await Schedule.create({
                userId: medication.userId,
                medicationId: medication._id,
                scheduledTime,
                dose: {
                  amount: timeSlot.dose,
                  unit: medication.encryptedData.form || 'unit',
                },
                status: 'pending',
              });
              
              schedules.push(schedule);
              
              // Queue the reminder
              await reminderQueue.addReminder({
                scheduleId: schedule._id,
                scheduledTime,
              });
            }
          }
        }
        
        // Move to next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      logger.info('Schedules created', {
        medicationId: medication._id,
        count: schedules.length,
      });
      
      return schedules;
    } catch (error) {
      logger.error('Error creating schedules:', error);
      throw error;
    }
  }
  
  shouldScheduleToday(medication, date) {
    if (medication.schedule.frequency === 'daily') {
      return true;
    }
    
    if (medication.schedule.frequency === 'weekly') {
      const dayOfWeek = date.getDay();
      return medication.schedule.daysOfWeek.includes(dayOfWeek);
    }
    
    if (medication.schedule.frequency === 'monthly') {
      const dayOfMonth = date.getDate();
      return dayOfMonth === medication.schedule.dayOfMonth;
    }
    
    return false;
  }
  
  getScheduledTime(date, timeString, timezone) {
    const [hours, minutes] = timeString.split(':').map(Number);
    const scheduled = new Date(date);
    scheduled.setHours(hours, minutes, 0, 0);
    
    // Convert to user's timezone
    return moment.tz(scheduled, timezone).toDate();
  }
  
  async snoozeReminder(scheduleId, minutes) {
    try {
      const schedule = await Schedule.findById(scheduleId);
      if (!schedule) return;
      
      const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);
      
      // Create new reminder
      await reminderQueue.addReminder({
        scheduleId: schedule._id,
        scheduledTime: snoozeUntil,
        isSnoozed: true,
      });
      
      logger.info('Reminder snoozed', {
        scheduleId,
        snoozeUntil,
      });
      
      return snoozeUntil;
    } catch (error) {
      logger.error('Error snoozing reminder:', error);
      throw error;
    }
  }
  
  async pauseMedicationSchedules(medicationId) {
    try {
      // Cancel all pending schedules
      const schedules = await Schedule.updateMany(
        {
          medicationId,
          status: 'pending',
        },
        {
          status: 'paused',
        }
      );
      
      // Remove from queue
      await reminderQueue.removeByMedicationId(medicationId);
      
      logger.info('Medication schedules paused', {
        medicationId,
        count: schedules.modifiedCount,
      });
      
      return schedules.modifiedCount;
    } catch (error) {
      logger.error('Error pausing schedules:', error);
      throw error;
    }
  }
  
  async resumeMedicationSchedules(medicationId) {
    try {
      const medication = await Medication.findById(medicationId);
      const now = new Date();
      
      // Reactivate future schedules
      const schedules = await Schedule.find({
        medicationId,
        status: 'paused',
        scheduledTime: { $gte: now },
      });
      
      for (const schedule of schedules) {
        schedule.status = 'pending';
        await schedule.save();
        
        // Re-queue the reminder
        await reminderQueue.addReminder({
          scheduleId: schedule._id,
          scheduledTime: schedule.scheduledTime,
        });
      }
      
      logger.info('Medication schedules resumed', {
        medicationId,
        count: schedules.length,
      });
      
      return schedules.length;
    } catch (error) {
      logger.error('Error resuming schedules:', error);
      throw error;
    }
  }
  
  async getUpcomingSchedules(userId, days = 7) {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + days);
    
    const schedules = await Schedule.find({
      userId,
      scheduledTime: {
        $gte: startDate,
        $lte: endDate,
      },
      status: 'pending',
    })
    .populate('medicationId')
    .sort({ scheduledTime: 1 });
    
    return schedules;
  }
  
  async updateScheduleTime(scheduleId, newTime) {
    try {
      const schedule = await Schedule.findById(scheduleId);
      if (!schedule) throw new Error('Schedule not found');
      
      const oldTime = schedule.scheduledTime;
      schedule.scheduledTime = newTime;
      await schedule.save();
      
      // Update queue
      await reminderQueue.removeByScheduleId(scheduleId);
      await reminderQueue.addReminder({
        scheduleId: schedule._id,
        scheduledTime: newTime,
      });
      
      logger.info('Schedule time updated', {
        scheduleId,
        oldTime,
        newTime,
      });
      
      return schedule;
    } catch (error) {
      logger.error('Error updating schedule time:', error);
      throw error;
    }
  }
  
  async bulkCreateSchedules(userId, medications) {
    const allSchedules = [];
    
    for (const medication of medications) {
      const schedules = await this.createSchedules(medication);
      allSchedules.push(...schedules);
    }
    
    logger.info('Bulk schedules created', {
      userId,
      totalSchedules: allSchedules.length,
      medications: medications.length,
    });
    
    return allSchedules;
  }
}

export const schedulerService = new SchedulerService();
export default schedulerService;