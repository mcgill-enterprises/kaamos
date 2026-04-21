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
| Language (v1) | TypeScript / Node.js 20 |
| Local broker | Docker Compose |

Future chapters will implement the same system in **Go** and **JDK 21**,
demonstrating that a CloudEvents + Protobuf contract is genuinely language-agnostic.

---

## Monorepo structure

```
kaamos/
├── docker-compose.yml          # Single Kafka broker, KRaft mode
├── proto/                      # Source of truth for all event schemas
│   └── galaxy/v1/
│       ├── navigation.proto    # ShipDeparted, ShipArrived, ShipDistressSignal
│       └── fuel.proto          # FuelRequested, FuelReserved, FuelCompleted, StationFuelDepleted
├── buf.yaml                    # buf toolchain config
├── buf.gen.yaml                # Code generation config
├── packages/
│   ├── shared/                 # CloudEvents helpers, topic constants, lore constants
│   ├── producer/               # Example producer — dispatches ships into the Helka Expanse
│   └── consumer/               # Example consumer — monitors navigation and fuel events
├── tsconfig.base.json
├── package.json                # npm workspaces root
└── WORLDBUILDING.md            # Lore, naming sources, faction notes
```

---

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20
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
```

This reads `proto/galaxy/v1/*.proto` and emits TypeScript types into
`packages/shared/src/generated/`. The generated files are committed to
the repository so you can read them without running `buf`.

### 3. Start Kafka

```bash
docker compose up -d
```

This starts a single-broker Kafka cluster in KRaft mode (no ZooKeeper)
and creates the following topics:

| Topic | Partitions | Partition key |
|-------|-----------|---------------|
| `galaxy.ships.navigation` | 6 | `ship_id` |
| `galaxy.ships.fuel` | 6 | `ship_id` |
| `galaxy.stations.docking` | 3 | `station_id` |
| `galaxy.sectors.alerts` | 3 | `sector_id` |

Wait for the broker to be healthy before continuing:

```bash
docker compose logs -f kafka-init
# You will see: "The void is ready."
```

### 4. Start the consumer

```bash
npm run dev:consumer
```

The consumer joins the `navigation-monitor` consumer group and subscribes to
`galaxy.ships.navigation` and `galaxy.ships.fuel`. It will wait, watching the void.

### 5. Run the producer

In a second terminal:

```bash
npm run dev:producer
```

The producer runs two scenarios and exits:

1. *Tumma* departs Tuonela Station bound for Manala Depot
2. *Kaipaus* requests and completes refueling at Ikävä Anchorage

Watch the consumer terminal. The events will arrive.

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
Neither the producer nor the consumer owns the schema — `packages/shared/` does,
and both depend on it.

This is the key architectural lesson: **the event contract lives in neither producer
nor consumer. It lives in the shared schema.**

When the Go and JDK 21 chapters are added, they will consume from the same topics
using the same `.proto` files — no changes to the event format required.

### Partitioning by ship ID

All navigation and fuel events use `ship_id` as the Kafka partition key.
This guarantees that all events for a given ship arrive at a consumer
in the order they were produced — you will never process `FuelCompleted`
before `FuelRequested` for the same ship.

Events for different ships are independent and may be processed in parallel.

---

## The universe

Kaamos is set in the Helka Expanse — the oldest sector of a galaxy-scale
shipping network, where spacecraft navigate between refueling stations
with Finnish names and a tendency to disappear.

See [WORLDBUILDING.md](./WORLDBUILDING.md) for lore, naming sources, and faction notes.

---

## Roadmap

- [x] TypeScript — producer, consumer, shared contract
- [ ] Fuel price volatility — economic events driven by sector disruption
- [ ] Go implementation
- [ ] JDK 21 implementation
- [ ] Custom OpenAPI Generator templates → Protobuf generation

---

## License

MIT
