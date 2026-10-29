export function validateEnv(config: Record<string, any>) {
  const required = ['JWT_SECRET', 'MONGO_URI'];
  const missing: string[] = [];

  for (const key of required) {
    if (!config[key]) {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Config validation error: Missing required environment variables: ${missing.join(', ')}`);
  }

  return config;
}

