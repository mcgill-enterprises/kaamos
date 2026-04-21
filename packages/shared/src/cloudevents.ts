import { toBinary, fromBinary } from '@bufbuild/protobuf';
import type { DescMessage, MessageShape } from '@bufbuild/protobuf';

// ---------------------------------------------------------------------------
// Minimal CloudEvent implementation — binary mode only.
//
// We don't use the 'cloudevents' npm package because it pulls in
// @bufbuild/protobuf v1 as a transitive dependency, which conflicts with
// the v2 we need for the generated Protobuf types.
//
// We only use CloudEvent as a typed envelope — no validation, no structured
// mode serialisation. The full cloudevents SDK is unnecessary here.
// ---------------------------------------------------------------------------

export interface CloudEvent<T = unknown> {
  readonly specversion: string;
  readonly id: string;
  readonly type: string;
  readonly source: string;
  readonly subject?: string;
  readonly time?: string;
  readonly datacontenttype?: string;
  readonly data?: T;
}

let _idCounter = 0;
function newEventId(): string {
  return `${Date.now()}-${(++_idCounter).toString(36)}`;
}

function makeCloudEvent<T>(attrs: Omit<CloudEvent<T>, 'specversion' | 'id'> & { id?: string }): CloudEvent<T> {
  return {
    specversion: '1.0',
    id: attrs.id ?? newEventId(),
    ...attrs,
  };
}

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

  // Volatility
  SECTOR_DISRUPTED:              'com.kafkatutorial.galaxy.sector.disrupted',
  SECTOR_STABILIZED:             'com.kafkatutorial.galaxy.sector.stabilized',
  STATION_FUEL_PRICE_UPDATED:    'com.kafkatutorial.galaxy.station.fuel_price_updated',
  STATION_FUEL_RESERVE_UPDATED:  'com.kafkatutorial.galaxy.station.fuel_reserve_updated',
} as const;

export type GalaxyEventType = typeof GalaxyEventType[keyof typeof GalaxyEventType];

/**
 * Creates a CloudEvent with a binary Protobuf payload.
 */
export function createGalaxyEvent<Desc extends DescMessage>(
  type: GalaxyEventType,
  subject: string,
  schema: Desc,
  payload: MessageShape<Desc>,
): CloudEvent<Uint8Array> {
  return makeCloudEvent<Uint8Array>({
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
export function parseGalaxyEvent<Desc extends DescMessage>(
  event: CloudEvent<Uint8Array>,
  schema: Desc,
): MessageShape<Desc> {
  if (!event.data) {
    throw new Error(`CloudEvent ${event.id} has no data`);
  }
  return fromBinary(schema, event.data);
}

/**
 * Serialises a CloudEvent's attributes to Kafka message headers.
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
  return makeCloudEvent<Uint8Array>({
    id:              headers['ce_id'],
    type:            headers['ce_type'],
    source:          headers['ce_source'],
    subject:         headers['ce_subject'],
    time:            headers['ce_time'],
    datacontenttype: headers['ce_datacontenttype'],
    data:            new Uint8Array(value),
  });
}
