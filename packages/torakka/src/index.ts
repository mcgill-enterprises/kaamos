import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import {
  GalaxyEventType,
  GalaxyTopic,
  ConsumerGroup,
  kafkaMessageToCloudEvent,
  parseGalaxyEvent,
} from '@kafka-tutorial/shared';

import {
  SectorDisruptedSchema,
  SectorStabilizedSchema,
  StationFuelPriceUpdatedSchema,
  StationFuelReserveUpdatedSchema,
  type SectorDisrupted,
  type SectorStabilized,
  type StationFuelPriceUpdated,
  type StationFuelReserveUpdated,
  StationFuelPriceUpdated_PriceReason,
  StationFuelReserveUpdated_ReserveEvent,
} from '../../../packages/shared/src/generated/galaxy/v1/volatility_pb.js';

import { checkConnection, sql } from './db.js';
import {
  upsertSectorDisrupted,
  upsertSectorStabilized,
  updateStationReserves,
  insertFuelPrice,
  getCurrentPrices,
} from './repos.js';

// ---------------------------------------------------------------------------
// Kafka client
// ---------------------------------------------------------------------------

const kafka = new Kafka({
  clientId: 'torakka',
  brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
});

const consumer: Consumer = kafka.consumer({
  groupId: ConsumerGroup.SECTOR_ANALYST,
});

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleSectorDisrupted(event: SectorDisrupted): Promise<void> {
  console.log(
    `[DISRUPTED] ${event.sectorName} (${event.sectorId}) ` +
    `| severity: ${event.severity.toFixed(2)}` +
    (event.sourceFaction ? ` | faction: ${event.sourceFaction}` : '') +
    (event.notes ? ` | "${event.notes}"` : ''),
  );
  await upsertSectorDisrupted(
    event.sectorId,
    event.severity,
    event.sourceFaction,
    event.disruptedAtUnix,
  );
}

async function handleSectorStabilized(event: SectorStabilized): Promise<void> {
  const durationMs = Number(event.stabilizedAtUnix - event.disruptedAtUnix) * 1000;
  const durationMin = Math.round(durationMs / 60000);
  console.log(
    `[STABILIZED] ${event.sectorName} (${event.sectorId}) ` +
    `| disruption lasted ${durationMin} min`,
  );
  await upsertSectorStabilized(
    event.sectorId,
    event.disruptedAtUnix,
    event.stabilizedAtUnix,
  );
}

async function handleFuelPriceUpdated(event: StationFuelPriceUpdated): Promise<void> {
  const delta = event.newPrice - event.previousPrice;
  const sign = delta >= 0 ? '+' : '';
  const reasonName = StationFuelPriceUpdated_PriceReason[event.reason] ?? 'UNKNOWN';
  console.log(
    `[PRICE] ${event.stationName} (${event.stationId}) ` +
    `${event.previousPrice.toFixed(2)} → ${event.newPrice.toFixed(2)} ` +
    `(${sign}${delta.toFixed(2)}) | ${reasonName}`,
  );
  const reasonKey = reasonName.replace('PRICE_REASON_', '') as
    'NORMAL' | 'DISRUPTION' | 'RATIONING' | 'RESUPPLY';
  await insertFuelPrice(
    event.stationId,
    event.newPrice,
    reasonKey,
    event.effectiveAtUnix,
  );
}

async function handleFuelReserveUpdated(event: StationFuelReserveUpdated): Promise<void> {
  const pct = (event.newFuelUnits / event.capacity * 100).toFixed(1);
  const eventName = StationFuelReserveUpdated_ReserveEvent[event.eventType] ?? 'UNKNOWN';
  const rationing = event.eventType === StationFuelReserveUpdated_ReserveEvent.RATIONING;
  console.log(
    `[RESERVE] ${event.stationName} (${event.stationId}) ` +
    `${event.previousFuelUnits.toFixed(0)} → ${event.newFuelUnits.toFixed(0)} units ` +
    `(${pct}% capacity) | ${eventName}`,
  );
  await updateStationReserves(
    event.stationId,
    event.newFuelUnits,
    rationing,
    event.updatedAtUnix,
  );
}

// ---------------------------------------------------------------------------
// Message router
// ---------------------------------------------------------------------------

async function handleMessage({ topic, partition, message }: EachMessagePayload): Promise<void> {
  if (!message.value) return;

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
      case GalaxyEventType.SECTOR_DISRUPTED:
        await handleSectorDisrupted(parseGalaxyEvent(cloudEvent, SectorDisruptedSchema));
        break;
      case GalaxyEventType.SECTOR_STABILIZED:
        await handleSectorStabilized(parseGalaxyEvent(cloudEvent, SectorStabilizedSchema));
        break;
      case GalaxyEventType.STATION_FUEL_PRICE_UPDATED:
        await handleFuelPriceUpdated(parseGalaxyEvent(cloudEvent, StationFuelPriceUpdatedSchema));
        break;
      case GalaxyEventType.STATION_FUEL_RESERVE_UPDATED:
        await handleFuelReserveUpdated(parseGalaxyEvent(cloudEvent, StationFuelReserveUpdatedSchema));
        break;
      default:
        // Torakka only cares about volatility events — ignore everything else silently.
        break;
    }
  } catch (err) {
    console.error(`[ERROR] Failed to process ${eventType}:`, err);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Torakka connecting to CockroachDB...');
  await checkConnection();
  console.log('CockroachDB connected.\n');

  console.log('Torakka connecting to Kafka...');
  await consumer.connect();

  await consumer.subscribe({
    topics: [GalaxyTopic.SECTORS_ALERTS, GalaxyTopic.STATIONS_DOCKING],
    fromBeginning: true,
  });

  console.log(
    `Listening on [${GalaxyTopic.SECTORS_ALERTS}, ${GalaxyTopic.STATIONS_DOCKING}] ` +
    `as consumer group: ${ConsumerGroup.SECTOR_ANALYST}\n` +
    `Torakka is watching. The void remembers.\n`,
  );

  await consumer.run({ eachMessage: handleMessage });
}

const shutdown = async (signal: string) => {
  console.log(`\n${signal} received — disconnecting...`);
  await consumer.disconnect();
  await sql.end();
  console.log('Torakka disconnected. Into the silence.');
  process.exit(0);
};

process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

main().catch((err) => {
  console.error('Fatal torakka error:', err);
  process.exit(1);
});
