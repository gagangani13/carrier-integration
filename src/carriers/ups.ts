/**
 * UPS Rating API integration
 * Implements the ICarrier interface for UPS
 * Based on: https://developer.ups.com/tag/Rating?loc=en_US
 */

import { BaseCarrier } from './types';
import { RateRequest, RateResponse, RateQuote, ServiceLevel, Currency } from '../types/domain';
import { HttpClient } from '../http/client';
import { OAuth2TokenManager } from '../auth/oauth2';
import { config } from '../config';
import { logger } from '../config/logger';
import { CarrierIntegrationError, ErrorCode } from '../errors';

/**
 * UPS API request format
 * This is internal to the UPS carrier - the service never exposes this shape
 */
interface UpsRateRequest {
  RateRequest: {
    Request: {
      RequestOption: string;
      SubVersion: string;
    };
    Shipment: {
      Shipper: {
        Address: {
          AddressLine: string;
          City: string;
          StateProvinceCode: string;
          PostalCode: string;
          CountryCode: string;
        };
      };
      ShipTo: {
        Address: {
          AddressLine: string;
          City: string;
          StateProvinceCode: string;
          PostalCode: string;
          CountryCode: string;
        };
      };
      Package: Array<{
        PackagingType: {
          Code: string;
        };
        Dimensions: {
          UnitOfMeasurement: {
            Code: string;
          };
          Length: string;
          Width: string;
          Height: string;
        };
        PackageWeight: {
          UnitOfMeasurement: {
            Code: string;
          };
          Weight: string;
        };
      }>;
      ShipmentRatingOptions?: {
        NegotiatedRatesIndicator?: string;
      };
    };
  };
}

/**
 * UPS API response format
 */
interface UpsRateResponse {
  RateResponse: {
    Response: {
      ResponseStatus: {
        Code: string;
        Description: string;
      };
      Alert?: Array<{
        Code: string;
        Description: string;
      }>;
    };
    RatedShipment?: Array<{
      Service: {
        Code: string;
        Description: string;
      };
      RatedPackage: Array<{
        BaseServiceCharge?: {
          MonetaryValue: string;
        };
        NegotiatedCharges?: {
          TotalCharge: {
            MonetaryValue: string;
          };
          BaseCharge: {
            MonetaryValue: string;
          };
          DiscountAmount?: {
            MonetaryValue: string;
          };
        };
      }>;
      TimeInTransit?: {
        ServiceSummary: {
          EstimatedArrival: {
            Date: string;
          };
        };
      };
    }>;
  };
}

/**
 * Mapping of UPS service codes to normalized service levels
 */
const UPS_SERVICE_CODE_MAP: Record<string, ServiceLevel> = {
  '01': ServiceLevel.OVERNIGHT, // Next Day Air
  '02': ServiceLevel.TWO_DAY, // Second Day Air
  '03': ServiceLevel.GROUND, // Ground
  '12': ServiceLevel.OVERNIGHT, // 3-Day Select
  '13': ServiceLevel.EXPRESS, // Next Day Air Saver
  '14': ServiceLevel.EXPRESS, // Next Day Air Early AM
};

export class UpsCarrier extends BaseCarrier {
  readonly name = 'ups';

  private httpClient: HttpClient;
  private tokenManager: OAuth2TokenManager;

  constructor() {
    super();
    this.httpClient = new HttpClient({
      baseURL: config.ups.apiBaseUrl,
    });
    this.tokenManager = new OAuth2TokenManager(config.ups.clientId, config.ups.clientSecret);
  }

  async getRates(request: RateRequest): Promise<RateResponse> {
    try {
      // Validate the request
      this.validateRequest(request);

      // Build the UPS API request
      const upsRequest = this.buildUpsRequest(request);

      // Get authentication token
      const token = await this.tokenManager.getToken();
      this.httpClient.setAuthHeader(token);

      // Make the API call
      logger.info('Requesting rates from UPS');
      const upsResponse = await this.httpClient.post<UpsRateResponse>(
        config.ups.ratingApiUrl,
        upsRequest
      );

      // Parse and normalize the response
      const normalizedResponse = this.parseUpsResponse(upsResponse);

      return normalizedResponse;
    } catch (error) {
      logger.error('UPS rate request failed', { error: error instanceof Error ? error.message : String(error) });

      if (error instanceof CarrierIntegrationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new CarrierIntegrationError(ErrorCode.INVALID_REQUEST, error.message, {
          originalError: error,
        });
      }

      throw new CarrierIntegrationError(ErrorCode.UNKNOWN, 'Unknown error during rate request');
    }
  }

  /**
   * Transform internal domain request to UPS API format
   */
  private buildUpsRequest(request: RateRequest): UpsRateRequest {
    return {
      RateRequest: {
        Request: {
          RequestOption: 'Shop', // Return all available rates
          SubVersion: '2407', // API version
        },
        Shipment: {
          Shipper: {
            Address: {
              AddressLine: request.origin.street1,
              City: request.origin.city,
              StateProvinceCode: request.origin.state,
              PostalCode: request.origin.postalCode,
              CountryCode: request.origin.country,
            },
          },
          ShipTo: {
            Address: {
              AddressLine: request.destination.street1,
              City: request.destination.city,
              StateProvinceCode: request.destination.state,
              PostalCode: request.destination.postalCode,
              CountryCode: request.destination.country,
            },
          },
          Package: request.packages.map((pkg) => ({
            PackagingType: {
              Code: '02', // Package
            },
            Dimensions: {
              UnitOfMeasurement: {
                Code: 'IN', // Inches
              },
              Length: String(pkg.length),
              Width: String(pkg.width),
              Height: String(pkg.height),
            },
            PackageWeight: {
              UnitOfMeasurement: {
                Code: 'LBS', // Pounds
              },
              Weight: String(pkg.weight),
            },
          })),
          ...(request.serviceLevel && { ShipmentRatingOptions: { NegotiatedRatesIndicator: 'Y' } }),
        },
      },
    };
  }

  /**
   * Transform UPS API response to internal domain format
   */
  private parseUpsResponse(upsResponse: UpsRateResponse): RateResponse {
    const response = upsResponse.RateResponse;

    if (!response.Response) {
      throw new CarrierIntegrationError(
        ErrorCode.INVALID_RESPONSE,
        'Invalid UPS response structure'
      );
    }

    const responseStatus = response.Response.ResponseStatus;
    if (responseStatus.Code !== '0') {
      throw new CarrierIntegrationError(
        ErrorCode.INVALID_RESPONSE,
        `UPS API error: ${responseStatus.Description}`,
        {
          details: { code: responseStatus.Code, description: responseStatus.Description },
        }
      );
    }

    const quotes: RateQuote[] = [];

    if (response.RatedShipment && Array.isArray(response.RatedShipment)) {
      for (const shipment of response.RatedShipment) {
        try {
          const quote = this.parseRatedShipment(shipment);
          quotes.push(quote);
        } catch (error) {
          logger.warn(`Failed to parse UPS rate for service ${shipment.Service.Code}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const warnings = response.Response.Alert?.map((a) => `${a.Code}: ${a.Description}`) || [];

    return {
      timestamp: new Date().toISOString(),
      quotes,
      ...(warnings.length > 0 && { errors: [] }),
    };
  }

  /**
   * Parse a single rated shipment into a RateQuote
   */
  private parseRatedShipment(
    shipment: NonNullable<UpsRateResponse['RateResponse']['RatedShipment']>[0]
  ): RateQuote {
    const serviceCode = shipment.Service.Code;
    const serviceLevel = UPS_SERVICE_CODE_MAP[serviceCode] || ServiceLevel.GROUND;

    // Calculate total charge from all packages
    let totalBaseCharge = 0;
    let totalDiscountAmount = 0;
    let finalCharge = 0;

    if (shipment.RatedPackage && Array.isArray(shipment.RatedPackage)) {
      for (const pkg of shipment.RatedPackage) {
        if (pkg.NegotiatedCharges) {
          const negotiated = pkg.NegotiatedCharges;
          totalBaseCharge += parseFloat(negotiated.BaseCharge.MonetaryValue || '0');
          totalDiscountAmount += parseFloat(negotiated.DiscountAmount?.MonetaryValue || '0');
          finalCharge += parseFloat(negotiated.TotalCharge.MonetaryValue || '0');
        } else if (pkg.BaseServiceCharge) {
          const amount = parseFloat(pkg.BaseServiceCharge.MonetaryValue || '0');
          totalBaseCharge += amount;
          finalCharge += amount;
        }
      }
    }

    return {
      carrier: this.name,
      serviceLevel,
      baseCharge: totalBaseCharge,
      ...(totalDiscountAmount > 0 && { discountAmount: totalDiscountAmount }),
      finalCharge,
      currency: Currency.USD,
      ...(shipment.TimeInTransit?.ServiceSummary?.EstimatedArrival?.Date && {
        estimatedDelivery: shipment.TimeInTransit.ServiceSummary.EstimatedArrival.Date,
      }),
    };
  }
}
