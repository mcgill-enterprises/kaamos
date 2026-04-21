import { CloudEvent } from 'cloudevents';
import { Message, toBinary, fromBinary, DescMessage } from '@bufbuild/protobuf';

// The source identifier for all events originating from this tutorial system.
const EVENT_SOURCE = '/galaxy/helka-expanse';

// The content type for binary Protobuf payloads inside a CloudEvent.
const PROTOBUF_CONTENT_TYPE = 'application/protobuf';

/**
 * GalaxyEventType enumerates all CloudEvent types in the system.
 *
 * Convention: com.kafkatutorial.<domain>.<entity>.<verb>
 */
export const GalaxyEventType = {
  // Navigation
  SHIP_DEPARTED:          'com.kafkatutorial.galaxy.ship.departed',
  SHIP_ARRIVED:           'com.kafkatutorial.galaxy.ship.arrived',
  SHIP_DISTRESS_SIGNAL:   'com.kafkatutorial.galaxy.ship.distress_signal',

  // Fuel
  FUEL_REQUESTED:         'com.kafkatutorial.galaxy.fuel.requested',
  FUEL_RESERVED:          'com.kafkatutorial.galaxy.fuel.reserved',
  FUEL_COMPLETED:         'com.kafkatutorial.galaxy.fuel.completed',
  STATION_FUEL_DEPLETED:  'com.kafkatutorial.galaxy.station.fuel_depleted',
} as const;

export type GalaxyEventType = typeof GalaxyEventType[keyof typeof GalaxyEventType];

/**
 * Creates a CloudEvent with a binary Protobuf payload.
 *
 * We use CloudEvents binary mode: the Protobuf message is serialised to bytes
 * and carried as the CloudEvent data. The CloudEvent itself will be placed in
 * Kafka headers by the producer, keeping the Kafka message value as pure
 * Protobuf bytes — clean and efficient.
 */
export function createGalaxyEvent<T extends Message>(
  type: GalaxyEventType,
  subject: string,
  schema: DescMessage<T>,
  payload: T,
): CloudEvent<Uint8Array> {
  return new CloudEvent<Uint8Array>({
    specversion: '1.0',
    type,
    source: EVENT_SOURCE,
    subject,
    datacontenttype: PROTOBUF_CONTENT_TYPE,
    data: toBinary(schema, payload),
    time: new Date().toISOString(),
  });
}

/**
 * Deserialises the Protobuf payload from a CloudEvent.
 */
export function parseGalaxyEvent<T extends Message>(
  event: CloudEvent<Uint8Array>,
  schema: DescMessage<T>,
): T {
  if (!event.data) {
    throw new Error(`CloudEvent ${event.id} has no data`);
  }
  return fromBinary(schema, event.data);
}

/**
 * Serialises a CloudEvent's attributes to Kafka message headers.
 * In binary mode, CloudEvent attributes travel as headers; the payload
 * travels as the Kafka message value.
 */
export function cloudEventToKafkaHeaders(
  event: CloudEvent<Uint8Array>,
): Record<string, string> {
  return {
    'ce_specversion':      event.specversion,
    'ce_id':               event.id,
    'ce_type':             event.type,
    'ce_source':           event.source,
    'ce_subject':          event.subject ?? '',
    'ce_time':             event.time ?? '',
    'ce_datacontenttype':  event.datacontenttype ?? PROTOBUF_CONTENT_TYPE,
  };
}

/**
 * Reconstructs a CloudEvent from Kafka message headers and a raw value.
 */
export function kafkaMessageToCloudEvent(
  headers: Record<string, string>,
  value: Buffer,
): CloudEvent<Uint8Array> {
  return new CloudEvent<Uint8Array>({
    specversion:     headers['ce_specversion'] ?? '1.0',
    id:              headers['ce_id'],
    type:            headers['ce_type'],
    source:          headers['ce_source'],
    subject:         headers['ce_subject'],
    time:            headers['ce_time'],
    datacontenttype: headers['ce_datacontenttype'],
    data:            new Uint8Array(value),
  });
}
