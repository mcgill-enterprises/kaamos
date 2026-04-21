/**
 * Topic names in the galaxy event backbone.
 *
 * Topics are named by domain, not by event type — multiple event types
 * may share a topic when they are consumed together.
 *
 * Partition counts are defined in docker-compose.yml and should be
 * revisited for production deployments based on throughput requirements.
 */
export const GalaxyTopic = {
  // Ship movement and distress — partition key: ship_id
  SHIPS_NAVIGATION: 'galaxy.ships.navigation',

  // Fuel lifecycle events — partition key: ship_id (or station_id for depletion)
  SHIPS_FUEL: 'galaxy.ships.fuel',

  // Station docking bay events — partition key: station_id
  STATIONS_DOCKING: 'galaxy.stations.docking',

  // Sector-level alerts and route updates — partition key: sector_id
  SECTORS_ALERTS: 'galaxy.sectors.alerts',
} as const;

export type GalaxyTopic = typeof GalaxyTopic[keyof typeof GalaxyTopic];

/**
 * Consumer group identifiers.
 *
 * Each independent service that consumes Kafka events should have its own
 * consumer group so that it maintains its own offset independently.
 */
export const ConsumerGroup = {
  NAVIGATION_MONITOR:  'navigation-monitor',
  FUEL_COORDINATOR:    'fuel-coordinator',
  DISTRESS_RESPONDER:  'distress-responder',
  SECTOR_ANALYST:      'sector-analyst',
} as const;

export type ConsumerGroup = typeof ConsumerGroup[keyof typeof ConsumerGroup];
