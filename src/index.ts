/**
 * Main entry point for the carrier integration service
 */

export { CarrierIntegrationService } from './service';
export { UpsCarrier } from './carriers/ups';
export { BaseCarrier, ICarrier } from './carriers/types';
export type { RateRequest, RateResponse, RateQuote, Address, Package } from './types/domain';
export { ServiceLevel, Currency } from './types/domain';
export { CarrierIntegrationError, ErrorCode } from './errors';
export { config } from './config';
export { logger } from './config/logger';
