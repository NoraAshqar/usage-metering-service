import express from 'express';
import { errorHandler } from './errors';
import { accountsRouter } from './routes/accounts.routes';
import { usersRouter } from './routes/users.routes';
import { plansRouter } from './routes/plans.routes';
import { consumeRouter } from './routes/consume.routes';
import { usageRouter } from './routes/usage.routes';

// Builds the Express app. Kept separate from index.ts so tests can import it without starting a server.
export function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use(accountsRouter);
  app.use(usersRouter);
  app.use(plansRouter);
  app.use(consumeRouter);
  app.use(usageRouter);

  app.use(errorHandler); // must be last
  return app;
}
