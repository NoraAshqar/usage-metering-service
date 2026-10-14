export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://metering:metering@localhost:5432/metering',
  adminKey: process.env.ADMIN_KEY ?? 'admin-secret',
};
