import express from 'express';
import { handleWhatsAppWebhook, handleStatusCallback } from '../controllers/webhookController.js';
import { authentication } from '../middleware/authentication.js';

const router = express.Router();

// WhatsApp webhook
router.post('/whatsapp', authentication, handleWhatsAppWebhook);

// Status callback
router.post('/status', authentication, handleStatusCallback);

// Voice response handling
router.post('/voice-response', authentication, async (req, res) => {
  const { Digits, CallSid } = req.body;
  
  // Handle voice call responses
  const twiml = `
    <Response>
      <Say>Thank you for your response.</Say>
      <Hangup/>
    </Response>
  `;
  
  res.type('text/xml');
  res.send(twiml);
});

export default router;