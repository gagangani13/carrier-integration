/**
 * HTTP client utility with retry logic and timeout handling
 * Provides a consistent interface for making HTTP requests
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError } from 'axios';
import { config } from '../config';
import { logger } from '../config/logger';
import { CarrierIntegrationError, ErrorCode, isRetryableError } from '../errors';

export interface HttpClientOptions {
  baseURL: string;
  timeout?: number;
  headers?: Record<string, string>;
}

export class HttpClient {
  private client: AxiosInstance;
  private retryAttempts: number;
  private retryDelayMs: number;

  constructor(options: HttpClientOptions) {
    this.client = axios.create({
      baseURL: options.baseURL,
      timeout: options.timeout || config.http.timeoutMs,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    this.retryAttempts = config.http.retryAttempts;
    this.retryDelayMs = config.http.retryDelayMs;
  }

  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry('GET', url, config);
  }

  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry('POST', url, { ...config, data });
  }

  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry('PUT', url, { ...config, data });
  }

  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return this.requestWithRetry('DELETE', url, config);
  }

  private async requestWithRetry<T>(
    method: string,
    url: string,
    axiosConfig?: AxiosRequestConfig
  ): Promise<T> {
    let lastError: CarrierIntegrationError | undefined;

    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        logger.debug(`${method} ${url}`, { attempt, maxAttempts: this.retryAttempts });
        const response = await this.client.request<T>({ method, url, ...axiosConfig });
        return response.data;
      } catch (error) {
        lastError = this.handleError(error, method, url);

        if (!isRetryableError(lastError) || attempt === this.retryAttempts) {
          throw lastError;
        }

        const delayMs = this.retryDelayMs * Math.pow(2, attempt - 1);
        logger.warn(`Request failed, retrying in ${delayMs}ms`, {
          attempt,
          error: lastError.message,
        });

        await this.sleep(delayMs);
      }
    }

    throw lastError || new CarrierIntegrationError(ErrorCode.UNKNOWN, 'Request failed after retries');
  }

  private handleError(error: unknown, method: string, url: string): CarrierIntegrationError {
    if (error instanceof AxiosError) {
      const status = error.response?.status;
      const data = error.response?.data;

      if (!error.response) {
        if (error.code === 'ECONNABORTED') {
          return new CarrierIntegrationError(ErrorCode.TIMEOUT, 'Request timeout', {
            originalError: error,
          });
        }

        if (error.code === 'ECONNREFUSED') {
          return new CarrierIntegrationError(ErrorCode.CONNECTION_REFUSED, 'Connection refused', {
            originalError: error,
          });
        }

        return new CarrierIntegrationError(ErrorCode.NETWORK_ERROR, error.message, {
          originalError: error,
        });
      }

      if (status && status >= 400) {
        const errorCode =
          status === 400
            ? ErrorCode.HTTP_400
            : status === 401
              ? ErrorCode.HTTP_401
              : status === 429
                ? ErrorCode.HTTP_429
                : status >= 500
                  ? ErrorCode.HTTP_500
                  : ErrorCode.HTTP_UNKNOWN;

        return new CarrierIntegrationError(errorCode, `HTTP ${status}: ${error.message}`, {
          statusCode: status,
          details: { data, method, url },
          originalError: error,
        });
      }

      return new CarrierIntegrationError(ErrorCode.NETWORK_ERROR, error.message, {
        originalError: error,
      });
    }

    if (error instanceof Error) {
      return new CarrierIntegrationError(ErrorCode.UNKNOWN, error.message, {
        originalError: error,
      });
    }

    return new CarrierIntegrationError(ErrorCode.UNKNOWN, 'An unknown error occurred');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  setAuthHeader(token: string): void {
    this.client.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  }

  clearAuthHeader(): void {
    delete this.client.defaults.headers.common['Authorization'];
  }
}
