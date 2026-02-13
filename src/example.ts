/**
 * Example usage of the carrier integration service
 * Demonstrates how to use the service in a real application
 */

import { CarrierIntegrationService, UpsCarrier, RateRequest, ServiceLevel } from './index';

async function exampleUsage() {
  // Initialize the service
  const service = new CarrierIntegrationService();

  // Register carriers
  const ups = new UpsCarrier();
  service.registerCarrier(ups);

  // Note: Additional carriers (FedEx, USPS) would be registered similarly:
  // const fedex = new FedexCarrier();
  // service.registerCarrier(fedex);

  console.log('Available carriers:', service.getAvailableCarriers());

  // Build a rate request
  const rateRequest: RateRequest = {
    origin: {
      street1: '123 Main St',
      street2: 'Suite 100',
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
        length: 12,
        width: 8,
        height: 6,
        weight: 5.5,
      },
      {
        length: 10,
        width: 6,
        height: 4,
        weight: 3.0,
      },
    ],
    serviceLevel: ServiceLevel.TWO_DAY, // Optional
  };

  try {
    // Get rates from all carriers
    const response = await service.getRates(rateRequest);

    console.log('\nRate Response:');
    console.log(`Timestamp: ${response.timestamp}`);
    console.log(`Number of quotes: ${response.quotes.length}`);

    response.quotes.forEach((quote, index) => {
      console.log(`\nQuote ${index + 1}:`);
      console.log(`  Carrier: ${quote.carrier}`);
      console.log(`  Service: ${quote.serviceLevel}`);
      console.log(`  Base Charge: $${quote.baseCharge.toFixed(2)}`);
      if (quote.discountAmount) {
        console.log(`  Discount: $${quote.discountAmount.toFixed(2)}`);
      }
      console.log(`  Final Charge: $${quote.finalCharge.toFixed(2)}`);
      console.log(`  Currency: ${quote.currency}`);
      if (quote.estimatedDelivery) {
        console.log(`  Estimated Delivery: ${quote.estimatedDelivery}`);
      }
    });

    if (response.errors && response.errors.length > 0) {
      console.log('\nErrors:');
      response.errors.forEach((error) => {
        console.log(`  ${error.code}: ${error.message}`);
      });
    }
  } catch (error) {
    console.error('Failed to get rates:', error instanceof Error ? error.message : error);
  }
}

// Run the example
if (require.main === module) {
  exampleUsage().catch(console.error);
}

export { exampleUsage };
