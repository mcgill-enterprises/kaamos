import { Kafka, Producer, Message } from 'kafkajs';
import {
  GalaxyEventType,
  GalaxyTopic,
  Ships,
  Stations,
  Sectors,
  createGalaxyEvent,
  cloudEventToKafkaHeaders,
} from '@kafka-tutorial/shared';

// -- Generated Protobuf types (produced by buf generate) --
// Until buf generation is run, these are imported from the generated directory.
// See: proto/galaxy/v1/navigation.proto and fuel.proto
import { ShipDeparted, ShipArrived, FuelRequested, FuelCompleted } from '../../../packages/shared/src/generated/galaxy/v1/navigation_pb.js';
import { FuelRequested as FuelRequestedMsg, FuelCompleted as FuelCompletedMsg } from '../../../packages/shared/src/generated/galaxy/v1/fuel_pb.js';

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
  // Idempotent producer: guarantees exactly-once delivery to the broker.
  // Requires acks: -1 (all in-sync replicas must acknowledge).
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any,
): Promise<void> {
  const event = createGalaxyEvent(eventType, subject, schema, payload);
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
    ShipDeparted,
    {
      shipId: ship.id,
      shipName: ship.name,
      originStationId: origin.id,
      destinationStationId: destination.id,
      sectorId: sector.id,
      fuelLevelPercent: 62.5,
      departedAtUnix: BigInt(Math.floor(Date.now() / 1000)),
    } satisfies Partial<ShipDeparted>,
  );
}

// ---------------------------------------------------------------------------
// Scenario: Kaipaus requests and completes refueling at Ikävä Anchorage
// ---------------------------------------------------------------------------

async function scenarioRefueling(): Promise<void> {
  console.log('\n-- Scenario: Refueling sequence --');

  const ship = Ships.KAIPAUS;
  const station = Stations.IKAVA;

  // Step 1 — ship requests fuel
  await sendEvent(
    GalaxyTopic.SHIPS_FUEL,
    ship.id,
    GalaxyEventType.FUEL_REQUESTED,
    ship.id,
    FuelRequestedMsg,
    {
      shipId: ship.id,
      shipName: ship.name,
      stationId: station.id,
      currentFuelPercent: 18.3,
      requestedFuelUnits: 450,
      requestedAtUnix: BigInt(Math.floor(Date.now() / 1000)),
    } satisfies Partial<FuelRequestedMsg>,
  );

  // Simulate processing delay — in reality the fuel coordinator
  // would consume the FuelRequested event and emit FuelReserved.
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Step 2 — refueling completed
  await sendEvent(
    GalaxyTopic.SHIPS_FUEL,
    ship.id,
    GalaxyEventType.FUEL_COMPLETED,
    ship.id,
    FuelCompletedMsg,
    {
      shipId: ship.id,
      shipName: ship.name,
      stationId: station.id,
      fuelUnitsTransferred: 450,
      finalFuelPercent: 97.1,
      completedAtUnix: BigInt(Math.floor(Date.now() / 1000)),
    } satisfies Partial<FuelCompletedMsg>,
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
