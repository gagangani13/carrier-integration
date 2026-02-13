/**
 * Core domain models and types for the carrier integration service.
 * These represent the public API contract and are independent of any carrier's format.
 */

/**
 * Address information - normalized format across all carriers
 */
export interface Address {
  street1: string;
  street2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string; // ISO 3166-1 alpha-2 code
}

/**
 * Package dimensions and weight
 */
export interface Package {
  length: number; // inches
  width: number; // inches
  height: number; // inches
  weight: number; // pounds
}

/**
 * Shipping service levels - normalized across carriers
 * UPS: 01=Next Day Air, 02=Second Day Air, 03=Ground, etc.
 * FedEx: FEDEX_OVERNIGHT, FEDEX_2_DAY, GROUND_HOME_DELIVERY, etc.
 * USPS: First Class, Priority Mail, Priority Mail Express, etc.
 */
export enum ServiceLevel {
  OVERNIGHT = 'OVERNIGHT',
  TWO_DAY = 'TWO_DAY',
  GROUND = 'GROUND',
  EXPRESS = 'EXPRESS',
  ECONOMY = 'ECONOMY',
}

/**
 * Currency codes (ISO 4217)
 */
export enum Currency {
  USD = 'USD',
  CAD = 'CAD',
  EUR = 'EUR',
}

/**
 * Rate request - what the caller provides
 */
export interface RateRequest {
  origin: Address;
  destination: Address;
  packages: Package[];
  serviceLevel?: ServiceLevel;
}

/**
 * A single rate quote for a particular service
 */
export interface RateQuote {
  carrier: string;
  serviceLevel: ServiceLevel;
  baseCharge: number;
  discountAmount?: number;
  finalCharge: number;
  currency: Currency;
  estimatedDelivery?: string; // ISO 8601 format
  warnings?: string[];
}

/**
 * Rate response - what the caller gets back
 */
export interface RateResponse {
  timestamp: string;
  quotes: RateQuote[];
  errors?: CarrierError[];
}

/**
 * Structured error from carrier integration
 */
export interface CarrierError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Result type for operations that may fail
 */
export type Result<T> = { success: true; data: T } | { success: false; error: CarrierError };
