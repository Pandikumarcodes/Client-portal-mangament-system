import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65_535).default(5000),
});

const validation = environmentSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  PORT: process.env.PORT,
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
});
