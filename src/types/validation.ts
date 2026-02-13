/**
 * Validation schemas using Zod for runtime validation
 */

import { z } from 'zod';

export const AddressSchema = z.object({
  street1: z.string().min(1),
  street2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(2).max(2),
  postalCode: z.string().min(1),
  country: z.string().length(2), // ISO code
});

export const PackageSchema = z.object({
  length: z.number().positive(),
  width: z.number().positive(),
  height: z.number().positive(),
  weight: z.number().positive(),
});

export const ServiceLevelSchema = z.enum([
  'OVERNIGHT',
  'TWO_DAY',
  'GROUND',
  'EXPRESS',
  'ECONOMY',
]);

export const RateRequestSchema = z.object({
  origin: AddressSchema,
  destination: AddressSchema,
  packages: z.array(PackageSchema).min(1),
  serviceLevel: ServiceLevelSchema.optional(),
});

export type ValidatedRateRequest = z.infer<typeof RateRequestSchema>;
