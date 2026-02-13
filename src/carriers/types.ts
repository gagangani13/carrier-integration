/**
 * Carrier integration interface and types
 * Defines the contract that all carrier implementations must follow
 */

import { RateRequest, RateResponse, Address, Package } from '../types/domain';

/**
 * Core interface that all carrier implementations must implement
 * This allows adding new carriers (FedEx, USPS, DHL) without modifying existing code
 */
export interface ICarrier {
  /**
   * Carrier identifier (e.g., 'ups', 'fedex', 'usps')
   */
  readonly name: string;

  /**
   * Get shipping rates for a rate request
   */
  getRates(request: RateRequest): Promise<RateResponse>;
}

/**
 * HTTP API specification for a carrier's rate endpoint
 * Used to configure different carriers with their specific endpoints
 */
export interface CarrierApiConfig {
  baseURL: string;
  endpoints: {
    rates: string;
  };
  auth?: {
    type: 'oauth2' | 'api_key' | 'basic';
  };
  headers?: Record<string, string>;
}

/**
 * Base class for carrier implementations
 * Provides common functionality and patterns
 */
export abstract class BaseCarrier implements ICarrier {
  abstract readonly name: string;

  /**
   * Validate that the request is compatible with this carrier
   */
  protected validateRequest(request: RateRequest): void {
    this.validateAddress(request.origin);
    this.validateAddress(request.destination);

    if (!request.packages || request.packages.length === 0) {
      throw new Error('At least one package must be provided');
    }

    request.packages.forEach((pkg) => this.validatePackage(pkg));
  }

  protected validateAddress(address: Address): void {
    if (!address.street1 || !address.city || !address.state || !address.postalCode || !address.country) {
      throw new Error('Invalid address: missing required fields');
    }
  }

  protected validatePackage(pkg: Package): void {
    if (pkg.length <= 0 || pkg.width <= 0 || pkg.height <= 0 || pkg.weight <= 0) {
      throw new Error('Invalid package: all dimensions and weight must be positive');
    }
  }

  abstract getRates(request: RateRequest): Promise<RateResponse>;
}
