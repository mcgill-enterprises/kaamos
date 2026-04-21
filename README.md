# Kaamos

*An event-driven architecture tutorial set in the dark between stars.*

---

## What this is

Kaamos is a hands-on tutorial for building an event-driven system using
**Apache Kafka**, **CloudEvents**, and **Protocol Buffers** — told through
the logistics of spacecraft routing and refueling in a galaxy-scale universe.

The architecture is the lesson. The universe is the reason to care.

---

## The stack

| Concern | Technology |
|---------|-----------|
| Event backbone | Apache Kafka (KRaft, no ZooKeeper) |
| Event envelope | CloudEvents 1.0 — binary mode |
| Payload schema | Protocol Buffers via [buf](https://buf.build) |
| State persistence | CockroachDB (Postgres-compatible) |
| Language (v1) | TypeScript / Node.js 22+ |
| Local infrastructure | Docker Compose |

Future chapters will implement the same system in **Go** and **JDK 21**,
demonstrating that a CloudEvents + Protobuf contract is genuinely language-agnostic.

---

## Monorepo structure

```
kaamos/
├── docker-compose.yml          # Kafka (KRaft) + CockroachDB
├── proto/                      # Source of truth for all event schemas
│   └── galaxy/v1/
│       ├── navigation.proto    # ShipDeparted, ShipArrived, ShipDistressSignal
│       ├── fuel.proto          # FuelRequested, FuelReserved, FuelCompleted, StationFuelDepleted
│       └── volatility.proto    # SectorDisrupted, SectorStabilized, StationFuelPriceUpdated, StationFuelReserveUpdated
├── buf.yaml                    # buf toolchain config
├── buf.gen.yaml                # Code generation config
├── scripts/
│   └── patch-bufbuild.mjs      # Postinstall patch for @bufbuild/protobuf exports map
├── packages/
│   ├── shared/                 # CloudEvents helpers, topic constants, lore constants
│   ├── producer/               # Scenarios — ships, refueling, Hiljaisuus disruption
│   ├── consumer/               # Navigation monitor — ship and fuel events
│   └── torakka/                # State service — persists volatility events to CockroachDB
├── tsconfig.base.json
├── package.json                # npm workspaces root
└── WORLDBUILDING.md            # Lore, naming sources, faction notes
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 22
- [Docker](https://www.docker.com/) and Docker Compose
- [buf](https://buf.build/docs/installation) — Protocol Buffer toolchain

---

## Getting started

### 1. Clone and install

```bash
git clone https://github.com/mcgill-enterprises/kaamos.git
cd kaamos
npm install
```

### 2. Generate Protobuf types

```bash
buf generate
npm run build --workspace=packages/shared
```

This reads `proto/galaxy/v1/*.proto` and emits TypeScript types into
`packages/shared/src/generated/`. The generated files are committed to
the repository so you can read them without running `buf`.

### 3. Start infrastructure

```bash
docker compose up -d
```

This starts:
- A single-broker Kafka cluster in KRaft mode (no ZooKeeper)
- A single-node CockroachDB instance with the Torakka schema

Wait for both to be ready:

```bash
docker compose logs -f kafka-init
# You will see: "The void is ready."

docker compose logs -f cockroachdb-init
# You will see: "Torakka schema initialised. The void remembers."
```

**Kafka topics:**

| Topic | Partitions | Partition key |
|-------|-----------|---------------|
| `galaxy.ships.navigation` | 6 | `ship_id` |
| `galaxy.ships.fuel` | 6 | `ship_id` |
| `galaxy.stations.docking` | 3 | `station_id` |
| `galaxy.sectors.alerts` | 3 | `sector_id` or `station_id` |

### 4. Start the services

Open three terminals:

```bash
# Terminal 1 — state service
npm run dev:torakka

# Terminal 2 — navigation monitor
npm run dev:consumer

# Terminal 3 — run scenarios
npm run dev:producer
```

The producer runs three scenarios and exits:

1. *Tumma* departs Tuonela Station bound for Manala Depot
2. *Kaipaus* requests and completes refueling at Ikävä Anchorage
3. Hiljaisuus is disrupted — the price cascade begins

Watch the Torakka terminal. It will record everything.

### 5. Query the state

```bash
# Current fuel prices across all stations
cockroach sql --insecure --host=localhost:26257 -d torakka \
  -e "SELECT DISTINCT ON (fp.station_id)
        fp.station_id, s.name, fp.price_per_unit, fp.reason, fp.effective_at
      FROM fuel_prices fp JOIN stations s USING (station_id)
      ORDER BY fp.station_id, fp.effective_at DESC;"

# Full price history — watch the shock propagate
cockroach sql --insecure --host=localhost:26257 -d torakka \
  -e "SELECT s.name, fp.price_per_unit, fp.reason, fp.effective_at
      FROM fuel_prices fp JOIN stations s USING (station_id)
      ORDER BY fp.effective_at;"

# Sector disruption log
cockroach sql --insecure --host=localhost:26257 -d torakka \
  -e "SELECT sector_id, event_type, severity, source_faction, occurred_at
      FROM sector_events ORDER BY occurred_at;"
```

You can also browse the CockroachDB admin UI at [http://localhost:8080](http://localhost:8080).

---

## How it works

### CloudEvents — binary mode

Every Kafka message in this system is a CloudEvent in **binary mode**:

- The **Kafka message value** is a raw Protobuf binary payload
- The **Kafka message headers** carry the CloudEvent attributes (`ce_type`, `ce_source`, `ce_id`, etc.)

This is more efficient than structured mode (which wraps the Protobuf in JSON)
and keeps the payload clean for downstream consumers that only care about the data.

### Protobuf — the shared contract

The `.proto` files in `proto/galaxy/v1/` are the single source of truth.
Neither the producer nor any consumer owns the schema — `packages/shared/` does,
and all packages depend on it.

This is the key architectural lesson: **the event contract lives in neither producer
nor consumer. It lives in the shared schema.**

When the Go and JDK 21 chapters are added, they will consume from the same topics
using the same `.proto` files — no changes to the event format required.

### Partitioning

Navigation and fuel events use `ship_id` as the Kafka partition key, guaranteeing
that all events for a given ship arrive in the order they were produced.

Sector alerts and price updates use `sector_id` or `station_id` as the partition
key — all price updates for a given station are ordered, so Torakka always sees
them in sequence.

### Torakka — the state service

`packages/torakka` is a Kafka consumer that listens to `galaxy.sectors.alerts`
and `galaxy.stations.docking` and writes state to CockroachDB. It is the memory
of the system — everything the void has seen is recorded there.

The schema is append-only for price history and sector events. The current state
of sectors and stations is maintained as upserts. This gives you both a live view
and a complete audit trail.

### The fuel price volatility model

Modeled on real petroleum market dynamics: chokepoint disruption, inventory
drawdown, faction rationing, and the compounding effect of duration over severity.

When Hiljaisuus is disrupted:
1. Fuel flow across the Helka Expanse is choked
2. Stations begin drawing down reserves faster than resupply
3. Pohjan Neito begins rationing at critical stations
4. Prices spike at all stations — proportional to their dependency on Hiljaisuus routes
5. When the disruption clears, prices normalize — but not to baseline. The market has memory.

---

## The universe

Kaamos is set in the Helka Expanse — the oldest sector of a galaxy-scale
shipping network, where spacecraft navigate between refueling stations
with a tendency to disappear.

See [WORLDBUILDING.md](./WORLDBUILDING.md) for lore, naming sources, and faction notes.

---

## Roadmap

- [x] TypeScript — producer, consumer, shared contract
- [x] Fuel price volatility — Hiljaisuus disruption, price cascade, Torakka state service
- [ ] Go implementation
- [ ] JDK 21 implementation
- [ ] Custom OpenAPI Generator templates → Protobuf generation

---

## License

[Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)](./LICENSE)