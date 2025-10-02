import express from 'express';
import dotenv from 'dotenv';
import helmet from 'helmet';
import cors from 'cors';
import { connectDB } from './config/database.js';
import { initRedis } from './config/redis.js';
import { initWhatsApp } from './config/whatsapp.js';
import { startWorkers } from './queues/workers/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import { logger } from './utils/logger.js';
import webhookRoutes from './routes/webhook.js';
import healthRoutes from './routes/health.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet());
app.use(cors());

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/webhook', webhookRoutes);
app.use('/health', healthRoutes);

// Error handling
app.use(errorHandler);

// Initialize services
async function startServer() {
  try {
    // Connect to databases
    await connectDB();
    await initRedis();
    
    // Initialize WhatsApp
    await initWhatsApp();
    
    // Start background workers
    startWorkers();
    
    app.listen(PORT, () => {
      logger.info(`🚀 WhatsApp bot running on port ${PORT}`);
      logger.info(`📱 WhatsApp webhook: ${process.env.SERVER_URL}/webhook/whatsapp`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Gracefully shutting down...');
  process.exit(0);
});