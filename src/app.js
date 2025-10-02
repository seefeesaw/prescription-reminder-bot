import express from 'express';
import { rateLimiter } from './middleware/rateLimiter.js';
import { authentication } from './middleware/authentication.js';

const app = express();

// Trust proxy for rate limiting
app.set('trust proxy', 1);

// Apply rate limiting
app.use(rateLimiter);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date() });
});

// Apply authentication to all other routes
app.use(authentication);

export default app;