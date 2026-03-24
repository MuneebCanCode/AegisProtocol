import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import winston from 'winston';

dotenv.config();

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
  defaultMeta: { service: 'aegis-backend' },
  transports: [new winston.transports.Console()],
});

// ---------------------------------------------------------------------------
// Express App
// ---------------------------------------------------------------------------

const app = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3001',
    credentials: true,
  }),
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests', message: 'Please try again later' },
});
app.use(limiter);

// JSON body parser
app.use(express.json());

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

import authRoutes from '@/routes/auth.routes';
import keysRoutes from '@/routes/keys.routes';
import accountsRoutes from '@/routes/accounts.routes';
import transfersRoutes from '@/routes/transfers.routes';
import guardiansRoutes from '@/routes/guardians.routes';
import policiesRoutes from '@/routes/policies.routes';
import rotationRoutes from '@/routes/rotation.routes';
import deadmanRoutes from '@/routes/deadman.routes';
import allowancesRoutes from '@/routes/allowances.routes';
import stakingRoutes from '@/routes/staking.routes';
import insuranceRoutes from '@/routes/insurance.routes';
import auditRoutes from '@/routes/audit.routes';
import governanceRoutes from '@/routes/governance.routes';
import tokensRoutes from '@/routes/tokens.routes';
import filesRoutes from '@/routes/files.routes';
import complianceRoutes from '@/routes/compliance.routes';
import mirrorRoutes from '@/routes/mirror.routes';
import settingsRoutes from '@/routes/settings.routes';

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok' }, message: 'AEGIS Backend is running' });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/keys', keysRoutes);
app.use('/api/accounts', accountsRoutes);
app.use('/api/transfers', transfersRoutes);
app.use('/api/guardians', guardiansRoutes);
app.use('/api/policies', policiesRoutes);
app.use('/api/rotation', rotationRoutes);
app.use('/api/deadman', deadmanRoutes);
app.use('/api/allowances', allowancesRoutes);
app.use('/api/staking', stakingRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/governance', governanceRoutes);
app.use('/api/tokens', tokensRoutes);
app.use('/api/files', filesRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/mirror', mirrorRoutes);
app.use('/api/settings', settingsRoutes);

// ---------------------------------------------------------------------------
// Error handling middleware
// ---------------------------------------------------------------------------

import { AppError } from '@/lib/errors';
import { errorResponse } from '@/lib/response';

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  if (err instanceof AppError) {
    errorResponse(res, err.name, err.message, err.statusCode);
  } else {
    errorResponse(res, 'InternalError', 'An unexpected error occurred');
  }
});

// ---------------------------------------------------------------------------
// Server Startup
// ---------------------------------------------------------------------------

import { initialize } from '@/modules/init/init.service';

const PORT = process.env.PORT || 4000;

if (process.env.NODE_ENV !== 'test') {
  (async () => {
    try {
      logger.info('Running AEGIS Protocol initialization...');
      await initialize();
      logger.info('Initialization complete.');
    } catch (err) {
      logger.error('Initialization failed — server will not accept requests', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      process.exit(1);
    }

    app.listen(PORT, () => {
      logger.info(`AEGIS Backend running on port ${PORT}`);
    });
  })();
}

export default app;
