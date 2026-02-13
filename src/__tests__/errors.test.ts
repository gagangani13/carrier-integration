/**
 * Unit tests for error handling
 */

import { CarrierIntegrationError, ErrorCode, isRetryableError } from '../errors';

describe('Error Handling', () => {
  describe('CarrierIntegrationError', () => {
    it('should create error with code and message', () => {
      const error = new CarrierIntegrationError(
        ErrorCode.INVALID_REQUEST,
        'Invalid request format'
      );

      expect(error.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(error.message).toBe('Invalid request format');
      expect(error.name).toBe('CarrierIntegrationError');
    });

    it('should include optional details', () => {
      const details = { field: 'postalCode', reason: 'Invalid format' };
      const error = new CarrierIntegrationError(
        ErrorCode.INVALID_REQUEST,
        'Invalid address',
        { details }
      );

      expect(error.details).toEqual(details);
    });

    it('should include HTTP status code', () => {
      const error = new CarrierIntegrationError(
        ErrorCode.HTTP_500,
        'Server error',
        { statusCode: 500 }
      );

      expect(error.statusCode).toBe(500);
    });

    it('should include original error', () => {
      const originalError = new Error('Original error');
      const error = new CarrierIntegrationError(
        ErrorCode.NETWORK_ERROR,
        'Network failed',
        { originalError }
      );

      expect(error.originalError).toBe(originalError);
    });

    it('should convert to CarrierError format', () => {
      const error = new CarrierIntegrationError(
        ErrorCode.INVALID_REQUEST,
        'Invalid request',
        { details: { field: 'origin' } }
      );

      const carrierError = error.toCarrierError();

      expect(carrierError.code).toBe(ErrorCode.INVALID_REQUEST);
      expect(carrierError.message).toBe('Invalid request');
      expect(carrierError.details).toEqual({ field: 'origin' });
    });
  });

  describe('Error Code Utilities', () => {
    it('should identify retryable errors', () => {
      const retryableErrors = [
        ErrorCode.TIMEOUT,
        ErrorCode.NETWORK_ERROR,
        ErrorCode.HTTP_429,
        ErrorCode.HTTP_500,
        ErrorCode.HTTP_502,
        ErrorCode.HTTP_503,
      ];

      retryableErrors.forEach((code) => {
        const error = new CarrierIntegrationError(code, 'Error message');
        expect(isRetryableError(error)).toBe(true);
      });
    });

    it('should not retry non-retryable errors', () => {
      const nonRetryableErrors = [
        ErrorCode.INVALID_REQUEST,
        ErrorCode.INVALID_ADDRESS,
        ErrorCode.HTTP_400,
        ErrorCode.HTTP_401,
        ErrorCode.HTTP_403,
        ErrorCode.HTTP_404,
      ];

      nonRetryableErrors.forEach((code) => {
        const error = new CarrierIntegrationError(code, 'Error message');
        expect(isRetryableError(error)).toBe(false);
      });
    });
  });
});
