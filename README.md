# Cybership Carrier Integration Service

TypeScript shipping carrier integration service supporting UPS with extensible architecture for additional carriers (FedEx, USPS, DHL).

## How to Run the Project

### Prerequisites
- Node.js 18+
- UPS developer credentials (optional, for production use)

### Setup

```bash
# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
```

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

All tests use HTTP stubbing (nock) with realistic UPS API responses. No live API calls or credentials required.

### Build & Development

```bash
# Build TypeScript
npm run build

# Run linter
npm run lint

# Clean artifacts
npm run clean
```

## Design Decisions

### 1. **Domain Model Isolation**
Each carrier translates between our canonical domain models (`RateRequest`, `RateResponse`, `RateQuote`) and carrier-specific API formats. This isolates carriers from each other and ensures adding new carriers doesn't break the public API.

### 2. **Strategy Pattern for Carriers**
Each carrier implements the `ICarrier` interface. The main `CarrierIntegrationService` calls all registered carriers in parallel and aggregates results. This makes adding new carriers trivial - just implement the interface and register it.

### 3. **Zod for Runtime Validation**
Zod validates all requests and responses at runtime in addition to TypeScript compile-time checking. This prevents invalid data from flowing through the system and provides detailed validation errors.

### 4. **OAuth 2.0 Token Management**
The `OAuth2TokenManager` handles automatic token acquisition, caching, and refresh. Tokens are cached in-memory using node-cache with 30-second refresh buffer to avoid expiration during requests. This is transparent to callers.

### 5. **Automatic Retry Logic**
The HTTP client automatically retries on 5xx errors, 429 (rate limiting), and timeouts using exponential backoff. This makes the service resilient to transient failures without caller intervention.

### 6. **Structured Error Handling**
`CarrierIntegrationError` provides machine-readable error codes, human-readable messages, and contextual details. This allows callers to handle different errors appropriately (e.g., retry on timeout vs. fail on validation error).

### 7. **Partial Failure Handling**
When calling multiple carriers, the service returns aggregated results with both successful quotes and errors. If one carrier fails, others still provide quotes. This ensures partial service degradation rather than complete failure.

### 8. **No External State**
The service is stateless except for in-memory token caching. This makes it horizontally scalable and suitable for containerized deployments.

## How to Add New Carriers

The architecture is already set up for this. Here's exactly how to add FedEx:

1. **Create `src/carriers/fedex.ts`:**
```typescript
import { BaseCarrier } from './types';
import { RateRequest, RateResponse } from '../types/domain';

export class FedexCarrier extends BaseCarrier {
  readonly name = 'fedex';

  async getRates(request: RateRequest): Promise<RateResponse> {
    // 1. Authenticate (get OAuth token)
    const token = await this.authManager.getToken();
    
    // 2. Convert our format to FedEx's format
    const fedexRequest = this.buildFedexRequest(request);
    
    // 3. Call FedEx API
    const response = await this.httpClient.post(
      '/fedex/rates',
      fedexRequest,
      { Authorization: `Bearer ${token}` }
    );
    
    // 4. Convert FedEx response back to our format
    return this.parseFedexResponse(response.data);
  }

  private buildFedexRequest(request: RateRequest) {
    // Map our RateRequest to FedEx API format
  }

  private parseFedexResponse(response: any): RateResponse {
    // Map FedEx API response to our RateResponse format
  }
}
```

2. **Register it in your code:**
```typescript
import { CarrierIntegrationService } from './service';
import { UpsCarrier } from './carriers/ups';
import { FedexCarrier } from './carriers/fedex';

const service = new CarrierIntegrationService();
service.registerCarrier(new UpsCarrier());
service.registerCarrier(new FedexCarrier());  // Done!

// Now service.getRates() automatically calls both
```

That's it. The main service doesn't change. No modifications needed. Just implement the interface and register.

## What Would Be Improved Given More Time

### 1. **Making it Faster**
- **Caching** - Store quotes in Redis for 30 minutes. Huge win for repeat routes.

### 2. **Handling Failures Gracefully**
We already do this - if FedEx fails, UPS still returns quotes. Just need better error reporting so the user knows which carrier had issues.

### 3. **Adding More Carriers**
- **FedEx, USPS, DHL** - Just follow the pattern above. Each one is 200-300 lines of code. No changes to the core service.

### 4. **Better Documentation**
- **Swagger** - Test the APIs using SwaggerUI.

### 5. **Testing More Scenarios**
- **Load testing** - Use Apache JMeter or k6. Run 100 concurrent requests.

