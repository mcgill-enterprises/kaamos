-- Torakka schema
-- The state service for the Helka Expanse fuel economy.
-- CockroachDB (Postgres-compatible SQL).

CREATE DATABASE IF NOT EXISTS torakka;
USE torakka;

-- ---------------------------------------------------------------------------
-- sectors
-- One row per sector. Hiljaisuus is the chokepoint.
-- Updated when SectorDisrupted / SectorStabilized events arrive.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sectors (
  sector_id            STRING       PRIMARY KEY,
  name                 STRING       NOT NULL,
  disrupted            BOOL         NOT NULL DEFAULT false,
  disruption_severity  FLOAT        NOT NULL DEFAULT 0.0
                                    CHECK (disruption_severity >= 0.0 AND disruption_severity <= 1.0),
  disrupted_since      TIMESTAMPTZ,
  stabilized_at        TIMESTAMPTZ,
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed known sectors
INSERT INTO sectors (sector_id, name) VALUES
  ('sector-helka-001',      'Helka Expanse'),
  ('sector-pohjola-002',    'Pohjola Drift'),
  ('sector-ulalume-003',    'Ulalume Drift'),
  ('sector-hyperion-004',   'Hyperion Belt'),
  ('sector-hiljaisuus-005', 'Hiljaisuus')
ON CONFLICT (sector_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- stations
-- One row per station. Reserves are in fuel units.
-- Updated when StationFuelReserveUpdated events arrive.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stations (
  station_id      STRING       PRIMARY KEY,
  name            STRING       NOT NULL,
  fuel_units      FLOAT        NOT NULL DEFAULT 0.0  CHECK (fuel_units >= 0.0),
  capacity        FLOAT        NOT NULL DEFAULT 5000.0,
  rationing       BOOL         NOT NULL DEFAULT false,
  last_resupply_at TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Seed known stations with starting reserves
INSERT INTO stations (station_id, name, fuel_units, capacity) VALUES
  ('station-tuonela-001', 'Tuonela Station',   3800.0, 5000.0),
  ('station-manala-002',  'Manala Depot',       4100.0, 5000.0),
  ('station-ikava-003',   'Ikävä Anchorage',    2900.0, 4000.0),
  ('station-usher-004',   'Usher Reach',        1200.0, 3000.0),
  ('station-diotima-005', 'Diotima Platform',   3300.0, 4000.0)
ON CONFLICT (station_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- fuel_prices
-- Append-only price history. One row per price change event.
-- Query latest price: SELECT DISTINCT ON (station_id) * FROM fuel_prices ORDER BY station_id, effective_at DESC
-- ---------------------------------------------------------------------------
CREATE TYPE IF NOT EXISTS price_reason AS ENUM (
  'NORMAL',
  'DISRUPTION',
  'RATIONING',
  'RESUPPLY'
);

CREATE TABLE IF NOT EXISTS fuel_prices (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  station_id      STRING       NOT NULL REFERENCES stations (station_id),
  price_per_unit  FLOAT        NOT NULL CHECK (price_per_unit > 0.0),
  effective_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  reason          price_reason NOT NULL DEFAULT 'NORMAL'
);

-- Seed baseline prices
INSERT INTO fuel_prices (station_id, price_per_unit, reason) VALUES
  ('station-tuonela-001', 10.0, 'NORMAL'),
  ('station-manala-002',  10.0, 'NORMAL'),
  ('station-ikava-003',   11.5, 'NORMAL'),
  ('station-usher-004',   13.0, 'NORMAL'),
  ('station-diotima-005', 12.0, 'NORMAL');

-- ---------------------------------------------------------------------------
-- sector_events
-- Audit log of disruption and stabilization events.
-- Never updated — append only.
-- ---------------------------------------------------------------------------
CREATE TYPE IF NOT EXISTS sector_event_type AS ENUM (
  'DISRUPTED',
  'STABILIZED'
);

CREATE TABLE IF NOT EXISTS sector_events (
  id              UUID              PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id       STRING            NOT NULL REFERENCES sectors (sector_id),
  event_type      sector_event_type NOT NULL,
  severity        FLOAT             NOT NULL DEFAULT 0.0
                                    CHECK (severity >= 0.0 AND severity <= 1.0),
  source_faction  STRING,           -- who or what caused it. may be null. may be unknowable.
  occurred_at     TIMESTAMPTZ       NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fuel_prices_station_time
  ON fuel_prices (station_id, effective_at DESC);

CREATE INDEX IF NOT EXISTS idx_sector_events_sector_time
  ON sector_events (sector_id, occurred_at DESC);
