/**
 * Configuration layer - all external configuration comes through here
 * Supports environment variables and defaults
 */

import dotenv from 'dotenv';

dotenv.config();

export interface AppConfig {
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  ups: UpsConfig;
  http: HttpConfig;
}

export interface UpsConfig {
  clientId: string;
  clientSecret: string;
  apiBaseUrl: string;
  oauth2TokenUrl: string;
  ratingApiUrl: string;
  requestTimeoutMs: number;
}

export interface HttpConfig {
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

function getConfig(): AppConfig {
  const environment = (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'development';

  // Validate required environment variables
  const requiredVars = ['UPS_CLIENT_ID', 'UPS_CLIENT_SECRET', 'UPS_API_BASE_URL'];
  const missingVars = requiredVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    console.warn(
      `Warning: Missing environment variables: ${missingVars.join(', ')}. ` +
        'Set them in .env or export them. For testing, defaults will be used.'
    );
  }

  const config: AppConfig = {
    environment,
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    ups: {
      clientId: process.env.UPS_CLIENT_ID || 'test_client_id',
      clientSecret: process.env.UPS_CLIENT_SECRET || 'test_client_secret',
      apiBaseUrl: process.env.UPS_API_BASE_URL || 'https://onlinetools.ups.com',
      oauth2TokenUrl: '/security/v1/oauth/token',
      ratingApiUrl: '/rating/v2/shop/rates',
      requestTimeoutMs: parseInt(process.env.UPS_TIMEOUT_MS || '30000', 10),
    },
    http: {
      timeoutMs: parseInt(process.env.HTTP_TIMEOUT_MS || '30000', 10),
      retryAttempts: parseInt(process.env.HTTP_RETRY_ATTEMPTS || '3', 10),
      retryDelayMs: parseInt(process.env.HTTP_RETRY_DELAY_MS || '1000', 10),
    },
  };

  return config;
}

// Export singleton instance
export const config = getConfig();
