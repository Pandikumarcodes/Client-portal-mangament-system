import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const isMongoSrvUri = (value) => {
  if (!value.startsWith('mongodb+srv://')) {
    return false;
  }

  try {
    const parsedUri = new URL(value);
    const hostnameLabels = parsedUri.hostname.split('.');
    const hasValidHostname = hostnameLabels.every((label) =>
      /^[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?$/i.test(label),
    );

    return parsedUri.protocol === 'mongodb+srv:' && !parsedUri.port && hasValidHostname;
  } catch {
    return false;
  }
};

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(5000),
  MONGO_URI: z.string().trim().min(1).refine(isMongoSrvUri),
});

const validation = environmentSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
});

if (!validation.success) {
  const invalidFields = [
    ...new Set(validation.error.issues.map((issue) => issue.path[0] ?? 'environment')),
  ];

  throw new Error(
    `Invalid environment configuration: invalid value for ${invalidFields.join(', ')}.`,
  );
}

export const env = Object.freeze({
  nodeEnv: validation.data.NODE_ENV,
  port: validation.data.PORT,
  mongoUri: validation.data.MONGO_URI,
});
