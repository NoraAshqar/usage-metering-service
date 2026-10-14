import { createApp } from './app';
import { config } from './config';
import { runMigrations } from './migrate';

async function main() {
  await runMigrations();
  createApp().listen(config.port, () => {
    console.log(`Usage metering service listening on port ${config.port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
