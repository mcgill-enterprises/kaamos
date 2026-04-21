import { sql } from './db.js';

// ---------------------------------------------------------------------------
// Sectors
// ---------------------------------------------------------------------------

export async function upsertSectorDisrupted(
  sectorId: string,
  severity: number,
  sourceFaction: string,
  disruptedAtUnix: bigint,
): Promise<void> {
  const disruptedAt = new Date(Number(disruptedAtUnix) * 1000);
  await sql`
    UPDATE sectors SET
      disrupted           = true,
      disruption_severity = ${severity},
      disrupted_since     = ${disruptedAt},
      stabilized_at       = NULL,
      updated_at          = now()
    WHERE sector_id = ${sectorId}
  `;
  await sql`
    INSERT INTO sector_events (sector_id, event_type, severity, source_faction, occurred_at)
    VALUES (${sectorId}, 'DISRUPTED', ${severity}, ${sourceFaction || null}, ${disruptedAt})
  `;
}

export async function upsertSectorStabilized(
  sectorId: string,
  disruptedAtUnix: bigint,
  stabilizedAtUnix: bigint,
): Promise<void> {
  const stabilizedAt = new Date(Number(stabilizedAtUnix) * 1000);
  await sql`
    UPDATE sectors SET
      disrupted           = false,
      disruption_severity = 0.0,
      stabilized_at       = ${stabilizedAt},
      updated_at          = now()
    WHERE sector_id = ${sectorId}
  `;
  await sql`
    INSERT INTO sector_events (sector_id, event_type, severity, occurred_at)
    VALUES (${sectorId}, 'STABILIZED', 0.0, ${stabilizedAt})
  `;
}

// ---------------------------------------------------------------------------
// Stations — reserves
// ---------------------------------------------------------------------------

export async function updateStationReserves(
  stationId: string,
  newFuelUnits: number,
  rationing: boolean,
  updatedAtUnix: bigint,
): Promise<void> {
  const updatedAt = new Date(Number(updatedAtUnix) * 1000);
  await sql`
    UPDATE stations SET
      fuel_units = ${newFuelUnits},
      rationing  = ${rationing},
      updated_at = ${updatedAt}
    WHERE station_id = ${stationId}
  `;
}

// ---------------------------------------------------------------------------
// Fuel prices
// ---------------------------------------------------------------------------

export async function insertFuelPrice(
  stationId: string,
  newPrice: number,
  reason: 'NORMAL' | 'DISRUPTION' | 'RATIONING' | 'RESUPPLY',
  effectiveAtUnix: bigint,
): Promise<void> {
  const effectiveAt = new Date(Number(effectiveAtUnix) * 1000);
  await sql`
    INSERT INTO fuel_prices (station_id, price_per_unit, reason, effective_at)
    VALUES (${stationId}, ${newPrice}, ${reason}, ${effectiveAt})
  `;
}

export async function getCurrentPrices(): Promise<Array<{
  stationId: string;
  stationName: string;
  pricePerUnit: number;
  reason: string;
  effectiveAt: Date;
}>> {
  const rows = await sql`
    SELECT DISTINCT ON (fp.station_id)
      fp.station_id   AS "stationId",
      s.name          AS "stationName",
      fp.price_per_unit AS "pricePerUnit",
      fp.reason,
      fp.effective_at AS "effectiveAt"
    FROM fuel_prices fp
    JOIN stations s ON s.station_id = fp.station_id
    ORDER BY fp.station_id, fp.effective_at DESC
  `;
  return rows as any;
}
