import express from 'express';
import { errorHandler, notFoundHandler } from './errors';
import { requireAdmin, requireApiKey } from './middleware/auth';
import { adminRouter } from './routes/admin.routes';
import { accountRouter } from './routes/account.routes';
import { usersRouter } from './routes/users.routes';
import { plansRouter } from './routes/plans.routes';
import { consumeRouter } from './routes/consume.routes';
import { usageRouter } from './routes/usage.routes';

// Builds the Express app. Kept separate from index.ts so tests can import it without starting a server.
// Express 5 passes errors thrown in async handlers to errorHandler automatically.
export function createApp() {
  const app = express();
  app.use(express.json());

  // Public
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Admin key only
  app.use('/admin', requireAdmin, adminRouter);

  // Everything below needs a valid API key
  app.use(requireApiKey);
  app.use('/account', accountRouter);
  app.use('/users', usersRouter);
  app.use('/plans', plansRouter);
  app.use('/consume', consumeRouter);
  app.use(usageRouter);

  app.use(notFoundHandler);
  app.use(errorHandler); // must be last
  return app;
}
