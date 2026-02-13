/**
 * Core carrier integration service
 * Provides a unified interface for getting rates from multiple carriers
 */

import { ICarrier } from './carriers/types';
import { RateRequest, RateResponse, Result } from './types/domain';
import { RateRequestSchema } from './types/validation';
import { CarrierIntegrationError, ErrorCode } from './errors';
import { logger } from './config/logger';

/**
 * Main service for carrier integration
 * Handles request validation, carrier routing, and response aggregation
 */
export class CarrierIntegrationService {
  private carriers: Map<string, ICarrier> = new Map();

  /**
   * Register a carrier
   */
  registerCarrier(carrier: ICarrier): void {
    this.carriers.set(carrier.name, carrier);
    logger.info(`Carrier registered: ${carrier.name}`);
  }

  /**
   * Get available carriers
   */
  getAvailableCarriers(): string[] {
    return Array.from(this.carriers.keys());
  }

  /**
   * Get rates from all registered carriers
   * Validates input, calls all carriers in parallel, and aggregates results
   */
  async getRates(request: RateRequest): Promise<RateResponse> {
    try {
      // Validate the request
      const validatedRequest = RateRequestSchema.parse(request) as RateRequest;

      logger.info('Getting rates for shipment', {
        origin: request.origin.city,
        destination: request.destination.city,
        packages: request.packages.length,
        carriers: this.carriers.size,
      });

      // Call all carriers in parallel
      const results = await Promise.allSettled(
        Array.from(this.carriers.values()).map((carrier) =>
          carrier.getRates(validatedRequest)
        )
      );

      // Aggregate quotes from all successful carriers
      const allQuotes = [];
      const errors = [];

      for (const result of results) {
        if (result.status === 'fulfilled') {
          allQuotes.push(...result.value.quotes);
        } else if (result.reason instanceof CarrierIntegrationError) {
          logger.warn(`Carrier returned error: ${result.reason.message}`);
          errors.push(result.reason.toCarrierError());
        } else {
          logger.error('Unexpected error from carrier', { error: result.reason });
        }
      }

      return {
        timestamp: new Date().toISOString(),
        quotes: allQuotes,
        ...(errors.length > 0 && { errors }),
      };
    } catch (error) {
      logger.error('Rate request failed validation', {
        error: error instanceof Error ? error.message : String(error),
      });

      if (error instanceof Error && error.name === 'ZodError') {
        throw new CarrierIntegrationError(
          ErrorCode.INVALID_REQUEST,
          'Invalid rate request format',
          {
            details: { message: error.message },
          }
        );
      }

      if (error instanceof CarrierIntegrationError) {
        throw error;
      }

      throw new CarrierIntegrationError(
        ErrorCode.UNKNOWN,
        'An unexpected error occurred while getting rates'
      );
    }
  }

  /**
   * Get rates from a specific carrier
   */
  async getRatesFromCarrier(carrierName: string, request: RateRequest): Promise<Result<RateResponse>> {
    try {
      const carrier = this.carriers.get(carrierName);
      if (!carrier) {
        return {
          success: false,
          error: {
            code: 'CARRIER_NOT_FOUND',
            message: `Carrier '${carrierName}' is not registered`,
          },
        };
      }

      const validatedRequest = RateRequestSchema.parse(request) as RateRequest;
      const response = await carrier.getRates(validatedRequest);

      return { success: true, data: response };
    } catch (error) {
      if (error instanceof CarrierIntegrationError) {
        return { success: false, error: error.toCarrierError() };
      }

      return {
        success: false,
        error: {
          code: 'UNKNOWN',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      };
    }
  }
}
