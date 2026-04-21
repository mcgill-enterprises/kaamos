import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import {
  GalaxyEventType,
  GalaxyTopic,
  ConsumerGroup,
  kafkaMessageToCloudEvent,
  parseGalaxyEvent,
} from '@kafka-tutorial/shared';

import { ShipDeparted, ShipArrived, ShipDistressSignal } from '../../../packages/shared/src/generated/galaxy/v1/navigation_pb.js';
import { FuelRequested, FuelCompleted, StationFuelDepleted } from '../../../packages/shared/src/generated/galaxy/v1/fuel_pb.js';

// ---------------------------------------------------------------------------
// Kafka client configuration
// ---------------------------------------------------------------------------

const kafka = new Kafka({
  clientId: 'galaxy-navigation-monitor',
  brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
});

const consumer: Consumer = kafka.consumer({
  groupId: ConsumerGroup.NAVIGATION_MONITOR,
});

// ---------------------------------------------------------------------------
// Event handlers
// Each handler receives a fully typed, validated Protobuf message.
// ---------------------------------------------------------------------------

function handleShipDeparted(event: ShipDeparted): void {
  console.log(
    `[DEPARTED] ${event.shipName} (${event.shipId}) ` +
    `left ${event.originStationId} → ${event.destinationStationId} ` +
    `| fuel: ${event.fuelLevelPercent.toFixed(1)}%`,
  );
}

function handleShipArrived(event: ShipArrived): void {
  console.log(
    `[ARRIVED]  ${event.shipName} (${event.shipId}) ` +
    `reached ${event.stationId} ` +
    `| fuel: ${event.fuelLevelPercent.toFixed(1)}%`,
  );
}

function handleShipDistress(event: ShipDistressSignal): void {
  console.error(
    `[DISTRESS] ${event.shipName} (${event.shipId}) ` +
    `in sector ${event.sectorId} ` +
    `| reason: ${event.reason} | fuel: ${event.fuelLevelPercent.toFixed(1)}%`,
  );
}

function handleFuelRequested(event: FuelRequested): void {
  console.log(
    `[FUEL REQ] ${event.shipName} (${event.shipId}) ` +
    `at ${event.stationId} ` +
    `| current: ${event.currentFuelPercent.toFixed(1)}% ` +
    `| requesting: ${event.requestedFuelUnits} units`,
  );
}

function handleFuelCompleted(event: FuelCompleted): void {
  console.log(
    `[FUEL DONE] ${event.shipName} (${event.shipId}) ` +
    `at ${event.stationId} ` +
    `| transferred: ${event.fuelUnitsTransferred} units ` +
    `| final: ${event.finalFuelPercent.toFixed(1)}%`,
  );
}

function handleStationFuelDepleted(event: StationFuelDepleted): void {
  console.error(
    `[DEPLETED] ${event.stationName} (${event.stationId}) ` +
    `fuel critically low: ${event.remainingFuelUnits} units remaining`,
  );
}

// ---------------------------------------------------------------------------
// Message router
// Reads CloudEvent type from Kafka headers and dispatches to the right handler.
// ---------------------------------------------------------------------------

async function handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
  if (!message.value) return;

  // Reconstruct headers as a plain string map
  const headers: Record<string, string> = {};
  for (const [key, val] of Object.entries(message.headers ?? {})) {
    if (val !== undefined) {
      headers[key] = Buffer.isBuffer(val) ? val.toString() : String(val);
    }
  }

  const eventType = headers['ce_type'] as GalaxyEventType | undefined;
  if (!eventType) {
    console.warn(`[WARN] Message on ${topic}:${partition} has no ce_type header — skipping`);
    return;
  }

  const cloudEvent = kafkaMessageToCloudEvent(headers, message.value as Buffer);

  try {
    switch (eventType) {
      case GalaxyEventType.SHIP_DEPARTED:
        handleShipDeparted(parseGalaxyEvent(cloudEvent, ShipDeparted));
        break;
      case GalaxyEventType.SHIP_ARRIVED:
        handleShipArrived(parseGalaxyEvent(cloudEvent, ShipArrived));
        break;
      case GalaxyEventType.SHIP_DISTRESS_SIGNAL:
        handleShipDistress(parseGalaxyEvent(cloudEvent, ShipDistressSignal));
        break;
      case GalaxyEventType.FUEL_REQUESTED:
        handleFuelRequested(parseGalaxyEvent(cloudEvent, FuelRequested));
        break;
      case GalaxyEventType.FUEL_COMPLETED:
        handleFuelCompleted(parseGalaxyEvent(cloudEvent, FuelCompleted));
        break;
      case GalaxyEventType.STATION_FUEL_DEPLETED:
        handleStationFuelDepleted(parseGalaxyEvent(cloudEvent, StationFuelDepleted));
        break;
      default:
        console.warn(`[WARN] Unknown event type: ${eventType}`);
    }
  } catch (err) {
    console.error(`[ERROR] Failed to process ${eventType}:`, err);
    // In production: send to a dead-letter topic rather than crashing.
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Connecting to Kafka...');
  await consumer.connect();

  await consumer.subscribe({
    topics: [GalaxyTopic.SHIPS_NAVIGATION, GalaxyTopic.SHIPS_FUEL],
    fromBeginning: true,
  });

  console.log(
    `Listening on [${GalaxyTopic.SHIPS_NAVIGATION}, ${GalaxyTopic.SHIPS_FUEL}] ` +
    `as consumer group: ${ConsumerGroup.NAVIGATION_MONITOR}\n` +
    `Watching the void...\n`,
  );

  await consumer.run({ eachMessage: handleMessage });
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(`\n${signal} received — disconnecting consumer...`);
  await consumer.disconnect();
  console.log('Consumer disconnected. Into the silence.');
  process.exit(0);
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  console.error('Fatal consumer error:', err);
  process.exit(1);
});
