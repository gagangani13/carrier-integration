/**
 * Custom error types for the carrier integration service
 * Provides structured error handling and meaningful error messages
 */

import { CarrierError } from '../types/domain';

export enum ErrorCode {
  // Validation errors
  INVALID_REQUEST = 'INVALID_REQUEST',
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INVALID_PACKAGE = 'INVALID_PACKAGE',

  // Auth errors
  AUTH_FAILED = 'AUTH_FAILED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',

  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',

  // HTTP errors
  HTTP_400 = 'HTTP_400',
  HTTP_401 = 'HTTP_401',
  HTTP_403 = 'HTTP_403',
  HTTP_404 = 'HTTP_404',
  HTTP_429 = 'HTTP_429',
  HTTP_500 = 'HTTP_500',
  HTTP_502 = 'HTTP_502',
  HTTP_503 = 'HTTP_503',
  HTTP_UNKNOWN = 'HTTP_UNKNOWN',

  // Response parsing errors
  INVALID_RESPONSE = 'INVALID_RESPONSE',
  MALFORMED_JSON = 'MALFORMED_JSON',

  // Service errors
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',

  // Unknown
  UNKNOWN = 'UNKNOWN',
}

export class CarrierIntegrationError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly statusCode?: number;
  public readonly originalError?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      details?: Record<string, unknown>;
      statusCode?: number;
      originalError?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'CarrierIntegrationError';
    this.code = code;
    this.details = options.details;
    this.statusCode = options.statusCode;
    this.originalError = options.originalError;

    Object.setPrototypeOf(this, CarrierIntegrationError.prototype);
  }

  toCarrierError(): CarrierError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Helper function to map HTTP status codes to error codes
 */
export function httpStatusToErrorCode(status: number): ErrorCode {
  switch (status) {
    case 400:
      return ErrorCode.HTTP_400;
    case 401:
      return ErrorCode.HTTP_401;
    case 403:
      return ErrorCode.HTTP_403;
    case 404:
      return ErrorCode.HTTP_404;
    case 429:
      return ErrorCode.HTTP_429;
    case 500:
      return ErrorCode.HTTP_500;
    case 502:
      return ErrorCode.HTTP_502;
    case 503:
      return ErrorCode.HTTP_503;
    default:
      return ErrorCode.HTTP_UNKNOWN;
  }
}

/**
 * Helper to determine if an error is retryable
 */
export function isRetryableError(error: CarrierIntegrationError): boolean {
  return [
    ErrorCode.TIMEOUT,
    ErrorCode.NETWORK_ERROR,
    ErrorCode.HTTP_429,
    ErrorCode.HTTP_500,
    ErrorCode.HTTP_502,
    ErrorCode.HTTP_503,
  ].includes(error.code);
}
