/**
 * OAuth 2.0 client-credentials token manager
 * Handles token acquisition, caching, and transparent refresh
 */

import NodeCache from 'node-cache';
import { HttpClient } from '../http/client';
import { config } from '../config';
import { logger } from '../config/logger';
import { CarrierIntegrationError, ErrorCode } from '../errors';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * Manages OAuth 2.0 client-credentials tokens
 * - Acquires tokens on first use
 * - Caches tokens to avoid unnecessary API calls
 * - Transparently refreshes expired tokens
 * - Thread-safe (single-threaded Node.js context)
 */
export class OAuth2TokenManager {
  private httpClient: HttpClient;
  private cache: NodeCache;
  private readonly cacheKey = 'oauth2_token';
  private readonly tokenRefreshBufferSecs = 30; // Refresh 30s before expiry

  constructor(private clientId: string, private clientSecret: string) {
    this.httpClient = new HttpClient({
      baseURL: config.ups.apiBaseUrl,
    });

    // Cache with no auto-expiration (we'll manage expiration manually)
    this.cache = new NodeCache({ stdTTL: 0 });
  }

  /**
   * Get a valid token, fetching or refreshing as needed
   */
  async getToken(): Promise<string> {
    const cached = this.cache.get<CachedToken>(this.cacheKey);

    // If cached token is still valid, return it
    if (cached && cached.expiresAt > Date.now()) {
      logger.debug('Returning cached OAuth2 token');
      return cached.token;
    }

    // Token is missing or expired, fetch new one
    logger.info('Fetching new OAuth2 token');
    const newToken = await this.fetchToken();

    return newToken;
  }

  /**
   * Fetch a new token from the OAuth 2.0 endpoint
   */
  private async fetchToken(): Promise<string> {
    try {
      const params = new URLSearchParams();
      params.append('grant_type', 'client_credentials');

      const auth = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');

      const response = await this.httpClient.post<TokenResponse>(config.ups.oauth2TokenUrl, params, {
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      if (!response.access_token) {
        throw new CarrierIntegrationError(
          ErrorCode.INVALID_RESPONSE,
          'Token response missing access_token'
        );
      }

      // Cache the token with expiration buffer
      const expiresAt = Date.now() + (response.expires_in - this.tokenRefreshBufferSecs) * 1000;
      const cachedToken: CachedToken = {
        token: response.access_token,
        expiresAt,
      };

      this.cache.set(this.cacheKey, cachedToken);

      logger.debug('OAuth2 token acquired and cached', {
        expiresIn: response.expires_in,
      });

      return response.access_token;
    } catch (error) {
      if (error instanceof CarrierIntegrationError) {
        throw error;
      }

      if (error instanceof Error) {
        throw new CarrierIntegrationError(ErrorCode.AUTH_FAILED, `Failed to acquire OAuth2 token: ${error.message}`, {
          originalError: error,
        });
      }

      throw new CarrierIntegrationError(ErrorCode.AUTH_FAILED, 'Failed to acquire OAuth2 token');
    }
  }

  /**
   * Clear cached token (e.g., on logout or credential change)
   */
  clearCache(): void {
    this.cache.del(this.cacheKey);
    logger.debug('OAuth2 token cache cleared');
  }
}
