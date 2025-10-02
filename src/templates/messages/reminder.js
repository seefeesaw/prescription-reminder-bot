export const reminderTemplates = {
  en: {
    initial: [
      `⏰ Time for your {medication}!\n\n{dose}`,
      `💊 Medication reminder: {medication}\n\nPlease take {dose}`,
      `🔔 Don't forget: {medication}\n\n{dose}`,
    ],
    
    urgent: `🚨 *URGENT REMINDER*\n\n{medication} was due {timeAgo}.\n\nPlease take it now or let me know if you're skipping today.`,
    
    escalated: `⚠️ *IMPORTANT*\n\nYou haven't taken your {medication} yet.\n\nThis medication is important for your health. Please take it as soon as possible.`,
    
    caregiver: `🚨 *Caregiver Alert*\n\n{patientName} hasn't taken their {medication} which was due {timeAgo}.\n\nCan you please check on them?`,
    
    refill: `📦 *Refill Reminder*\n\nYour {medication} will run out in {daysRemaining} days.\n\nTime to refill your prescription!`,
    
    streak: `🔥 Great job! You've taken {medication} for {days} days in a row!`,
    
    missed: `You missed {medication} yesterday. No worries - let's get back on track today!`,
  },
  
  zu: {
    initial: [
      `⏰ Isikhathi somuthi wakho {medication}!\n\n{dose}`,
      `💊 Isikhumbuzi somuthi: {medication}\n\nNgicela uthathe {dose}`,
      `🔔 Ungakhohlwa: {medication}\n\n{dose}`,
    ],
    
    urgent: `🚨 *ISIKHUMBUZI ESIPHUTHUMAYO*\n\n{medication} bekufanele uthathwe {timeAgo}.\n\nNgicela uyithathe manje noma ungazise uma uyeqa namhlanje.`,
  },
  
  hi: {
    initial: [
      `⏰ आपकी {medication} का समय!\n\n{dose}`,
      `💊 दवा अनुस्मारक: {medication}\n\nकृपया {dose} लें`,
      `🔔 मत भूलिए: {medication}\n\n{dose}`,
    ],
    
    urgent: `🚨 *जरूरी अनुस्मारक*\n\n{medication} {timeAgo} देय थी।\n\nकृपया अभी लें या बताएं यदि आज छोड़ रहे हैं।`,
  },
};

export function getReminderMessage(language = 'en', type = 'initial', variables = {}) {
  const templates = reminderTemplates[language] || reminderTemplates.en;
  let template = templates[type];
  
  // If template is array, pick random
  if (Array.isArray(template)) {
    template = template[Math.floor(Math.random() * template.length)];
  }
  
  // Replace variables
  Object.keys(variables).forEach(key => {
    template = template.replace(`{${key}}`, variables[key]);
  });
  
  return template;
}