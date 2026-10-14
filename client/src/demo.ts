const SERVICE_URL = process.env.SERVICE_URL ?? 'http://localhost:3000';

async function main() {
  const res = await fetch(`${SERVICE_URL}/health`);
  console.log('Service health:', await res.json());
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
