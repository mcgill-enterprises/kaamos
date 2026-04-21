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

// ---------------------------------------------------------------------------
// Kafka client configuration
// ---------------------------------------------------------------------------

const kafka = new Kafka({
  clientId: 'galaxy-producer',
  brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
  retry: {
    initialRetryTime: 300,
    retries: 5,
  },
});

const producer: Producer = kafka.producer({
  idempotent: true,
});

// ---------------------------------------------------------------------------
// Helper: send a single event to a Kafka topic
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

  console.log(
    `[${new Date().toISOString()}] Sent ${eventType} | key: ${partitionKey} | subject: ${subject}`,
  );
}

// ---------------------------------------------------------------------------
// Scenario: Tumma departs Tuonela Station bound for Manala Depot
// ---------------------------------------------------------------------------

async function scenarioShipDeparture(): Promise<void> {
  console.log('\n-- Scenario: Ship departure --');

  const ship = Ships.TUMMA;
  const origin = Stations.TUONELA;
  const destination = Stations.MANALA;
  const sector = Sectors.HELKA_EXPANSE;

  await sendEvent(
    GalaxyTopic.SHIPS_NAVIGATION,
    ship.id,
    GalaxyEventType.SHIP_DEPARTED,
    ship.id,
    ShipDepartedSchema,
    {
      shipId: ship.id,
      shipName: ship.name,
      originStationId: origin.id,
      destinationStationId: destination.id,
      sectorId: sector.id,
      fuelLevelPercent: 62.5,
      departedAtUnix: BigInt(Math.floor(Date.now() / 1000)),
    },
  );
}

// ---------------------------------------------------------------------------
// Scenario: Kaipaus requests and completes refueling at Ikävä Anchorage
// ---------------------------------------------------------------------------

async function scenarioRefueling(): Promise<void> {
  console.log('\n-- Scenario: Refueling sequence --');

  const ship = Ships.KAIPAUS;
  const station = Stations.IKAVA;

  await sendEvent(
    GalaxyTopic.SHIPS_FUEL,
    ship.id,
    GalaxyEventType.FUEL_REQUESTED,
    ship.id,
    FuelRequestedSchema,
    {
      shipId: ship.id,
      shipName: ship.name,
      stationId: station.id,
      currentFuelPercent: 18.3,
      requestedFuelUnits: 450,
      requestedAtUnix: BigInt(Math.floor(Date.now() / 1000)),
    },
  );

  await new Promise((resolve) => setTimeout(resolve, 500));

  await sendEvent(
    GalaxyTopic.SHIPS_FUEL,
    ship.id,
    GalaxyEventType.FUEL_COMPLETED,
    ship.id,
    FuelCompletedSchema,
    {
      shipId: ship.id,
      shipName: ship.name,
      stationId: station.id,
      fuelUnitsTransferred: 450,
      finalFuelPercent: 97.1,
      completedAtUnix: BigInt(Math.floor(Date.now() / 1000)),
    },
  );
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
  } finally {
    await producer.disconnect();
    console.log('\nProducer disconnected. The void is silent again.');
  }
}

main().catch((err) => {
  console.error('Fatal producer error:', err);
  process.exit(1);
});