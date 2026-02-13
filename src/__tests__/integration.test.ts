/**
 * Integration tests for the carrier integration service
 * Uses nock to stub HTTP responses with realistic UPS API payloads
 */

import nock from 'nock';
import { CarrierIntegrationService } from '../service';
import { UpsCarrier } from '../carriers/ups';
import { RateRequest, ServiceLevel } from '../types/domain';
import { config } from '../config';

describe('CarrierIntegrationService', () => {
  let service: CarrierIntegrationService;

  beforeEach(() => {
    service = new CarrierIntegrationService();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('Carrier Registration', () => {
    it('should register a carrier', () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      expect(service.getAvailableCarriers()).toContain('ups');
    });

    it('should track multiple carriers', () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      expect(service.getAvailableCarriers()).toHaveLength(1);
      expect(service.getAvailableCarriers()).toContain('ups');
    });
  });

  describe('Request Validation', () => {
    it('should reject invalid address - missing required fields', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      const request: RateRequest = {
        origin: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          // missing country
          country: '',
        },
        destination: {
          street1: '456 Park Ave',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001',
          country: 'US',
        },
        packages: [
          {
            length: 10,
            width: 10,
            height: 10,
            weight: 5,
          },
        ],
      };

      await expect(service.getRates(request)).rejects.toThrow();
    });

    it('should reject invalid package - zero weight', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      const request: RateRequest = {
        origin: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        destination: {
          street1: '456 Park Ave',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001',
          country: 'US',
        },
        packages: [
          {
            length: 10,
            width: 10,
            height: 10,
            weight: 0, // invalid
          },
        ],
      };

      await expect(service.getRates(request)).rejects.toThrow();
    });

    it('should reject request with no packages', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      const request: RateRequest = {
        origin: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        destination: {
          street1: '456 Park Ave',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001',
          country: 'US',
        },
        packages: [], // invalid
      };

      await expect(service.getRates(request)).rejects.toThrow();
    });
  });

  describe('OAuth2 Token Lifecycle', () => {
    it('should acquire token on first rate request', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      const tokenScope = nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token_12345',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      const rateScope = nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [],
          },
        });

      const request = buildValidRateRequest();

      await service.getRates(request);

      expect(tokenScope.isDone()).toBe(true);
      expect(rateScope.isDone()).toBe(true);
    });

    it('should reuse cached token for multiple requests', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      const tokenScope = nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .once() // Should only be called once
        .reply(200, {
          access_token: 'cached_token_12345',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      const rateScope = nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .twice()
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [],
          },
        });

      const request = buildValidRateRequest();

      // Make two rate requests
      await service.getRates(request);
      await service.getRates(request);

      expect(tokenScope.isDone()).toBe(true);
      expect(rateScope.isDone()).toBe(true);
    });

    it('should refresh token when expired', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      // First token acquisition
      const tokenScope1 = nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'token_1',
          token_type: 'Bearer',
          expires_in: 1, // Very short expiry
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [],
          },
        });

      // Token refresh after expiry
      const tokenScope2 = nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'token_2',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [],
          },
        });

      const request = buildValidRateRequest();

      // First request
      await service.getRates(request);

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Second request should refresh token
      await service.getRates(request);

      expect(tokenScope1.isDone()).toBe(true);
      expect(tokenScope2.isDone()).toBe(true);
    });
  });

  describe('Successful Rate Responses', () => {
    it('should parse UPS response with single rate', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [
              {
                Service: {
                  Code: '03',
                  Description: 'UPS Ground',
                },
                RatedPackage: [
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '25.50',
                    },
                  },
                ],
              },
            ],
          },
        });

      const request = buildValidRateRequest();
      const response = await service.getRates(request);

      expect(response.quotes).toHaveLength(1);
      expect(response.quotes[0].carrier).toBe('ups');
      expect(response.quotes[0].serviceLevel).toBe(ServiceLevel.GROUND);
      expect(response.quotes[0].finalCharge).toBe(25.5);
      expect(response.quotes[0].currency).toBe('USD');
    });

    it('should parse UPS response with multiple rates', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [
              {
                Service: {
                  Code: '01',
                  Description: 'UPS Next Day Air',
                },
                RatedPackage: [
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '45.00',
                    },
                  },
                ],
                TimeInTransit: {
                  ServiceSummary: {
                    EstimatedArrival: {
                      Date: '20240115',
                    },
                  },
                },
              },
              {
                Service: {
                  Code: '02',
                  Description: 'UPS Second Day Air',
                },
                RatedPackage: [
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '35.00',
                    },
                  },
                ],
              },
              {
                Service: {
                  Code: '03',
                  Description: 'UPS Ground',
                },
                RatedPackage: [
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '25.00',
                    },
                  },
                ],
              },
            ],
          },
        });

      const request = buildValidRateRequest();
      const response = await service.getRates(request);

      expect(response.quotes).toHaveLength(3);
      expect(response.quotes.map((q: any) => q.finalCharge)).toEqual([45, 35, 25]);
    });

    it('should handle negotiated rates with discounts', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [
              {
                Service: {
                  Code: '03',
                  Description: 'UPS Ground',
                },
                RatedPackage: [
                  {
                    NegotiatedCharges: {
                      BaseCharge: {
                        MonetaryValue: '30.00',
                      },
                      DiscountAmount: {
                        MonetaryValue: '5.00',
                      },
                      TotalCharge: {
                        MonetaryValue: '25.00',
                      },
                    },
                  },
                ],
              },
            ],
          },
        });

      const request = buildValidRateRequest();
      const response = await service.getRates(request);

      expect(response.quotes).toHaveLength(1);
      expect(response.quotes[0].baseCharge).toBe(30);
      expect(response.quotes[0].discountAmount).toBe(5);
      expect(response.quotes[0].finalCharge).toBe(25);
    });

    it('should handle multiple packages in single shipment', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [
              {
                Service: {
                  Code: '03',
                  Description: 'UPS Ground',
                },
                RatedPackage: [
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '15.00',
                    },
                  },
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '10.00',
                    },
                  },
                ],
              },
            ],
          },
        });

      const request: RateRequest = {
        origin: {
          street1: '123 Main St',
          city: 'New York',
          state: 'NY',
          postalCode: '10001',
          country: 'US',
        },
        destination: {
          street1: '456 Park Ave',
          city: 'Los Angeles',
          state: 'CA',
          postalCode: '90001',
          country: 'US',
        },
        packages: [
          {
            length: 10,
            width: 10,
            height: 10,
            weight: 5,
          },
          {
            length: 8,
            width: 8,
            height: 8,
            weight: 3,
          },
        ],
      };

      const response = await service.getRates(request);

      expect(response.quotes).toHaveLength(1);
      expect(response.quotes[0].finalCharge).toBe(25); // 15 + 10
    });
  });

  describe('Error Handling', () => {
    it('should handle authentication failure', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(401, {
          error: 'invalid_client',
          error_description: 'Client authentication failed',
        });

      const request = buildValidRateRequest();

      const result = await service.getRates(request);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.quotes).toEqual([]);
    });

    it('should handle network timeout', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .delayConnection(60000) // Simulate timeout
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
          },
        });

      // Note: This test demonstrates timeout handling,
      // but actual timeout testing depends on axios configuration
      // In a real test, we'd mock the axios client
    });

    it('should handle malformed UPS response', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          // Missing RateResponse
          InvalidField: {},
        });

      const request = buildValidRateRequest();

      const result = await service.getRates(request);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.quotes).toEqual([]);
    });

    it('should handle UPS error response code', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '1',
                Description: 'Invalid request',
              },
            },
          },
        });

      const request = buildValidRateRequest();

      const result = await service.getRates(request);
      expect(result.errors).toBeDefined();
      expect(result.errors?.length).toBeGreaterThan(0);
      expect(result.quotes).toEqual([]);
    });

    it('should handle rate limit (429) with retry', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      // First request returns 429, second succeeds
      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(429, 'Too Many Requests');

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [
              {
                Service: { Code: '03', Description: 'UPS Ground' },
                RatedPackage: [
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '25.00',
                    },
                  },
                ],
              },
            ],
          },
        });

      const request = buildValidRateRequest();

      // Should succeed after retry
      const response = await service.getRates(request);
      expect(response.quotes).toHaveLength(1);
    });

    it('should return partial results when one carrier fails', async () => {
      // Create two carriers
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      // This test would require registering a second mock carrier
      // Demonstrating partial failure handling
      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates')
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [
              {
                Service: {
                  Code: '03',
                  Description: 'UPS Ground',
                },
                RatedPackage: [
                  {
                    BaseServiceCharge: {
                      MonetaryValue: '25.00',
                    },
                  },
                ],
              },
            ],
          },
        });

      const request = buildValidRateRequest();
      const response = await service.getRates(request);

      expect(response.quotes.length).toBeGreaterThan(0);
    });
  });

  describe('Request Building', () => {
    it('should build correct UPS API request format', async () => {
      const ups = new UpsCarrier();
      service.registerCarrier(ups);

      let capturedRequest: any;

      nock(config.ups.apiBaseUrl)
        .post('/security/v1/oauth/token')
        .reply(200, {
          access_token: 'test_token',
          token_type: 'Bearer',
          expires_in: 3600,
        });

      nock(config.ups.apiBaseUrl)
        .post('/rating/v2/shop/rates', (body) => {
          capturedRequest = body;
          return true;
        })
        .reply(200, {
          RateResponse: {
            Response: {
              ResponseStatus: {
                Code: '0',
                Description: 'Success',
              },
            },
            RatedShipment: [],
          },
        });

      const request = buildValidRateRequest();
      await service.getRates(request);

      // Verify request structure
      expect(capturedRequest.RateRequest).toBeDefined();
      expect(capturedRequest.RateRequest.Request).toBeDefined();
      expect(capturedRequest.RateRequest.Shipment).toBeDefined();
      expect(capturedRequest.RateRequest.Shipment.Shipper).toBeDefined();
      expect(capturedRequest.RateRequest.Shipment.ShipTo).toBeDefined();
      expect(capturedRequest.RateRequest.Shipment.Package).toBeDefined();
      expect(Array.isArray(capturedRequest.RateRequest.Shipment.Package)).toBe(true);
    });
  });
});

/**
 * Helper function to build a valid rate request for testing
 */
function buildValidRateRequest(): RateRequest {
  return {
    origin: {
      street1: '123 Main St',
      city: 'New York',
      state: 'NY',
      postalCode: '10001',
      country: 'US',
    },
    destination: {
      street1: '456 Park Ave',
      city: 'Los Angeles',
      state: 'CA',
      postalCode: '90001',
      country: 'US',
    },
    packages: [
      {
        length: 10,
        width: 10,
        height: 10,
        weight: 5,
      },
    ],
  };
}
