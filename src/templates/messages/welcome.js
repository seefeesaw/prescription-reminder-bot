export const welcomeMessages = {
  en: {
    greeting: `Welcome! 👋 I'm your medication reminder assistant.

I'll help you remember to take your medications on time.

To get started, you can:
📸 Send a photo of your prescription
✍️ Type your medication details
❓ Send 'help' for more options`,
    
    onboardingComplete: `Perfect! You're all set up.

I'll send you reminders for your medications.
You can always:
- Send 'status' to check your medications
- Send 'help' for all options
- Upload a new prescription anytime

I'm here whenever you need me! 💊`,
  },
  
  zu: {
    greeting: `Sawubona! 👋 Ngingumsizi wakho wokukhumbula imithi.

Ngizokusiza ukhumbule ukuthatha imithi yakho ngesikhathi.

Ukuze uqale:
📸 Thumela isithombe somuthi wakho
✍️ Bhala imininingwane yomuthi
❓ Thumela 'usizo' ukuthola ezinye izindlela`,
    
    onboardingComplete: `Kuhle! Usulungile.

Ngizokuthumela izikhumbuzi zemithi yakho.
Ungahlala:
- Uthumela 'isimo' ukubheka imithi yakho
- Uthumela 'usizo' ukuthola zonke izindlela
- Ulayishe umuthi omusha noma nini

Ngikhona noma nini lapho ungidinga! 💊`,
  },
  
  hi: {
    greeting: `स्वागत है! 👋 मैं आपका दवा अनुस्मारक सहायक हूं।

मैं आपको समय पर दवाएं लेने में मदद करूंगा।

शुरू करने के लिए:
📸 अपने पर्चे की फोटो भेजें
✍️ दवा का विवरण टाइप करें
❓ अधिक विकल्पों के लिए 'help' भेजें`,
    
    onboardingComplete: `बढ़िया! आप तैयार हैं।

मैं आपको दवाओं के लिए अनुस्मारक भेजूंगा।
आप हमेशा कर सकते हैं:
- अपनी दवाएं जांचने के लिए 'status' भेजें
- सभी विकल्पों के लिए 'help' भेजें
- कभी भी नया पर्चा अपलोड करें

जब भी आपको जरूरत हो मैं यहां हूं! 💊`,
  },
};

export function getWelcomeMessage(language = 'en', type = 'greeting') {
  return welcomeMessages[language]?.[type] || welcomeMessages.en[type];
}