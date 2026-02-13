/**
 * Unit tests for validation schemas
 */

import { RateRequestSchema, AddressSchema, PackageSchema, ServiceLevelSchema } from '../types/validation';
import { RateRequest, ServiceLevel } from '../types/domain';

describe('Validation Schemas', () => {
  describe('AddressSchema', () => {
    it('should validate complete address', () => {
      const address = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(true);
    });

    it('should validate address with optional street2', () => {
      const address = {
        street1: '123 Main St',
        street2: 'Suite 100',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(true);
    });

    it('should fail validation - missing required field', () => {
      const address = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        // postalCode missing
        country: 'US',
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(false);
    });

    it('should fail validation - invalid state code length', () => {
      const address = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY1', // Invalid
        postalCode: '10001',
        country: 'US',
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(false);
    });

    it('should fail validation - invalid country code length', () => {
      const address = {
        street1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'USA', // Should be ISO 2-letter code
      };

      const result = AddressSchema.safeParse(address);
      expect(result.success).toBe(false);
    });
  });

  describe('PackageSchema', () => {
    it('should validate valid package', () => {
      const pkg = {
        length: 10,
        width: 8,
        height: 6,
        weight: 5,
      };

      const result = PackageSchema.safeParse(pkg);
      expect(result.success).toBe(true);
    });

    it('should fail - zero length', () => {
      const pkg = {
        length: 0,
        width: 8,
        height: 6,
        weight: 5,
      };

      const result = PackageSchema.safeParse(pkg);
      expect(result.success).toBe(false);
    });

    it('should fail - negative weight', () => {
      const pkg = {
        length: 10,
        width: 8,
        height: 6,
        weight: -5,
      };

      const result = PackageSchema.safeParse(pkg);
      expect(result.success).toBe(false);
    });

    it('should accept decimal dimensions', () => {
      const pkg = {
        length: 10.5,
        width: 8.25,
        height: 6.75,
        weight: 5.5,
      };

      const result = PackageSchema.safeParse(pkg);
      expect(result.success).toBe(true);
    });
  });

  describe('ServiceLevelSchema', () => {
    it('should validate all service levels', () => {
      const levels = ['OVERNIGHT', 'TWO_DAY', 'GROUND', 'EXPRESS', 'ECONOMY'];

      levels.forEach((level) => {
        const result = ServiceLevelSchema.safeParse(level);
        expect(result.success).toBe(true);
      });
    });

    it('should fail - invalid service level', () => {
      const result = ServiceLevelSchema.safeParse('INVALID_SERVICE');
      expect(result.success).toBe(false);
    });
  });

  describe('RateRequestSchema', () => {
    it('should validate complete rate request', () => {
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
            width: 8,
            height: 6,
            weight: 5,
          },
        ],
      };

      const result = RateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate request with service level', () => {
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
            width: 8,
            height: 6,
            weight: 5,
          },
        ],
        serviceLevel: ServiceLevel.OVERNIGHT,
      };

      const result = RateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should validate multiple packages', () => {
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
            width: 8,
            height: 6,
            weight: 5,
          },
          {
            length: 6,
            width: 4,
            height: 3,
            weight: 2,
          },
        ],
      };

      const result = RateRequestSchema.safeParse(request);
      expect(result.success).toBe(true);
    });

    it('should fail - no packages', () => {
      const request = {
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
        packages: [],
      };

      const result = RateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });

    it('should fail - invalid origin', () => {
      const request = {
        origin: {
          // Missing required fields
          city: 'New York',
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
            width: 8,
            height: 6,
            weight: 5,
          },
        ],
      };

      const result = RateRequestSchema.safeParse(request);
      expect(result.success).toBe(false);
    });
  });
});
