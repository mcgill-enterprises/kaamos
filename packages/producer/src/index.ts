import { Kafka, Producer, Message } from 'kafkajs';
import { create } from '@bufbuild/protobuf';
import {
  GalaxyEventType,
  GalaxyTopic,
  Ships,
  Stations,
  Sectors,
  createGalaxyEvent,
  cloudEventToKafkaHeaders,
} from '@kafka-tutorial/shared';

import { ShipDepartedSchema } from '../../../packages/shared/src/generated/galaxy/v1/navigation_pb.js';
import { FuelRequestedSchema, FuelCompletedSchema } from '../../../packages/shared/src/generated/galaxy/v1/fuel_pb.js';
import {
  SectorDisruptedSchema,
  SectorStabilizedSchema,
  StationFuelPriceUpdatedSchema,
  StationFuelReserveUpdatedSchema,
  StationFuelPriceUpdated_PriceReason,
  StationFuelReserveUpdated_ReserveEvent,
} from '../../../packages/shared/src/generated/galaxy/v1/volatility_pb.js';

// ---------------------------------------------------------------------------
// Kafka client
// ---------------------------------------------------------------------------

const kafka = new Kafka({
  clientId: 'galaxy-producer',
  brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
  retry: { initialRetryTime: 300, retries: 5 },
});

const producer: Producer = kafka.producer({ idempotent: true });

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function sendEvent(
  topic: string,
  partitionKey: string,
  eventType: GalaxyEventType,
  subject: string,
  schema: any,
  fields: any,
): Promise<void> {
  const event = createGalaxyEvent(eventType, subject, schema, create(schema, fields));
  const headers = cloudEventToKafkaHeaders(event);
  const message: Message = {
    key: partitionKey,
    value: Buffer.from(event.data as Uint8Array),
    headers,
  };
  await producer.send({ topic, messages: [message] });
  console.log(`[${new Date().toISOString()}] Sent ${eventType} | key: ${partitionKey}`);
}

function now(): bigint {
  return BigInt(Math.floor(Date.now() / 1000));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Scenario 1: Tumma departs Tuonela Station bound for Manala Depot
// ---------------------------------------------------------------------------

async function scenarioShipDeparture(): Promise<void> {
  console.log('\n-- Scenario: Ship departure --');
  const ship = Ships.TUMMA;
  const origin = Stations.TUONELA;
  const destination = Stations.MANALA;
  const sector = Sectors.HELKA_EXPANSE;

  await sendEvent(
    GalaxyTopic.SHIPS_NAVIGATION, ship.id,
    GalaxyEventType.SHIP_DEPARTED, ship.id,
    ShipDepartedSchema, {
      shipId: ship.id, shipName: ship.name,
      originStationId: origin.id, destinationStationId: destination.id,
      sectorId: sector.id, fuelLevelPercent: 62.5,
      departedAtUnix: now(),
    },
  );
}

// ---------------------------------------------------------------------------
// Scenario 2: Kaipaus requests and completes refueling at Ikävä Anchorage
// ---------------------------------------------------------------------------

async function scenarioRefueling(): Promise<void> {
  console.log('\n-- Scenario: Refueling sequence --');
  const ship = Ships.KAIPAUS;
  const station = Stations.IKAVA;

  await sendEvent(
    GalaxyTopic.SHIPS_FUEL, ship.id,
    GalaxyEventType.FUEL_REQUESTED, ship.id,
    FuelRequestedSchema, {
      shipId: ship.id, shipName: ship.name,
      stationId: station.id, currentFuelPercent: 18.3,
      requestedFuelUnits: 450, requestedAtUnix: now(),
    },
  );

  await delay(500);

  await sendEvent(
    GalaxyTopic.SHIPS_FUEL, ship.id,
    GalaxyEventType.FUEL_COMPLETED, ship.id,
    FuelCompletedSchema, {
      shipId: ship.id, shipName: ship.name,
      stationId: station.id, fuelUnitsTransferred: 450,
      finalFuelPercent: 97.1, completedAtUnix: now(),
    },
  );
}

// ---------------------------------------------------------------------------
// Scenario 3: Hiljaisuus disruption — the price cascade
//
// Something moves through the Silence. Tuonen Väki do not explain themselves.
// Pohjan Neito begins rationing. The Kaipaus takes the long way around.
// ---------------------------------------------------------------------------

async function scenarioHiljaisuusDisruption(): Promise<void> {
  console.log('\n-- Scenario: Hiljaisuus disruption --');

  const sector = Sectors.HILJAISUUS;
  const disruptedAt = now();

  // 1. The disruption event — source faction is noted without comment
  await sendEvent(
    GalaxyTopic.SECTORS_ALERTS, sector.id,
    GalaxyEventType.SECTOR_DISRUPTED, sector.id,
    SectorDisruptedSchema, {
      sectorId: sector.id,
      sectorName: sector.name,
      severity: 0.74,
      sourceFaction: 'Tuonen Väki',
      notes: 'Interference patterns consistent with prior unresolved events. No contact attempted.',
      disruptedAtUnix: disruptedAt,
    },
  );

  await delay(300);

  // 2. Reserves begin drawing down at stations dependent on Hiljaisuus routes
  const drawdownStations = [
    { ...Stations.TUONELA, prev: 3800, next: 3200 },
    { ...Stations.MANALA,  prev: 4100, next: 3400 },
    { ...Stations.IKAVA,   prev: 2900, next: 2100 },
  ];

  for (const station of drawdownStations) {
    await sendEvent(
      GalaxyTopic.STATIONS_DOCKING, station.id,
      GalaxyEventType.STATION_FUEL_RESERVE_UPDATED, station.id,
      StationFuelReserveUpdatedSchema, {
        stationId: station.id,
        stationName: station.name,
        previousFuelUnits: station.prev,
        newFuelUnits: station.next,
        capacity: 5000.0,
        eventType: StationFuelReserveUpdated_ReserveEvent.DRAWDOWN,
        updatedAtUnix: now(),
      },
    );
    await delay(150);
  }

  await delay(300);

  // 3. Pohjan Neito begins rationing — Ikävä Anchorage first, then the others
  const rationingStations = [
    { ...Stations.IKAVA,   prev: 2100, next: 2100 },
    { ...Stations.TUONELA, prev: 3200, next: 3200 },
  ];

  for (const station of rationingStations) {
    await sendEvent(
      GalaxyTopic.STATIONS_DOCKING, station.id,
      GalaxyEventType.STATION_FUEL_RESERVE_UPDATED, station.id,
      StationFuelReserveUpdatedSchema, {
        stationId: station.id,
        stationName: station.name,
        previousFuelUnits: station.prev,
        newFuelUnits: station.next,
        capacity: 5000.0,
        eventType: StationFuelReserveUpdated_ReserveEvent.RATIONING,
        updatedAtUnix: now(),
      },
    );
    await delay(150);
  }

  await delay(300);

  // 4. Price cascade — stations reprice in response
  const priceUpdates = [
    { station: Stations.IKAVA,   prev: 11.5,  next: 28.0  },
    { station: Stations.TUONELA, prev: 10.0,  next: 22.5  },
    { station: Stations.MANALA,  prev: 10.0,  next: 24.0  },
    { station: Stations.USHER,   prev: 13.0,  next: 31.0  },
    { station: Stations.DIOTIMA, prev: 12.0,  next: 26.5  },
  ];

  for (const { station, prev, next } of priceUpdates) {
    await sendEvent(
      GalaxyTopic.SECTORS_ALERTS, station.id,
      GalaxyEventType.STATION_FUEL_PRICE_UPDATED, station.id,
      StationFuelPriceUpdatedSchema, {
        stationId: station.id,
        stationName: station.name,
        sectorId: sector.id,
        previousPrice: prev,
        newPrice: next,
        reason: StationFuelPriceUpdated_PriceReason.DISRUPTION,
        effectiveAtUnix: now(),
      },
    );
    await delay(200);
  }

  await delay(2000);

  // 5. Disruption clears — the silence returns to merely being silent
  const stabilizedAt = now();
  await sendEvent(
    GalaxyTopic.SECTORS_ALERTS, sector.id,
    GalaxyEventType.SECTOR_STABILIZED, sector.id,
    SectorStabilizedSchema, {
      sectorId: sector.id,
      sectorName: sector.name,
      disruptedAtUnix: disruptedAt,
      stabilizedAtUnix: stabilizedAt,
    },
  );

  await delay(300);

  // 6. Prices normalize — not all the way back, the market has memory
  const normalizationUpdates = [
    { station: Stations.IKAVA,   prev: 28.0, next: 14.0  },
    { station: Stations.TUONELA, prev: 22.5, next: 12.0  },
    { station: Stations.MANALA,  prev: 24.0, next: 12.5  },
    { station: Stations.USHER,   prev: 31.0, next: 16.0  },
    { station: Stations.DIOTIMA, prev: 26.5, next: 14.5  },
  ];

  for (const { station, prev, next } of normalizationUpdates) {
    await sendEvent(
      GalaxyTopic.SECTORS_ALERTS, station.id,
      GalaxyEventType.STATION_FUEL_PRICE_UPDATED, station.id,
      StationFuelPriceUpdatedSchema, {
        stationId: station.id,
        stationName: station.name,
        sectorId: sector.id,
        previousPrice: prev,
        newPrice: next,
        reason: StationFuelPriceUpdated_PriceReason.NORMAL,
        effectiveAtUnix: now(),
      },
    );
    await delay(200);
  }

  console.log('\nThe silence returns to merely being silent.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('Connecting to Kafka...');
  await producer.connect();
  console.log('Connected. Dispatching events into the Helka Expanse...\n');

  try {
    await scenarioShipDeparture();
    await scenarioRefueling();
    await scenarioHiljaisuusDisruption();
  } finally {
    await producer.disconnect();
    console.log('\nProducer disconnected. The void is silent again.');
  }
}

main().catch((err) => {
  console.error('Fatal producer error:', err);
  process.exit(1);
});