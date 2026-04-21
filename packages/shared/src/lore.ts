/**
 * Lore constants for the tutorial's example data.
 *
 * These names are drawn from Finnish literary tradition — particularly
 * the work of Eino Leino and Kaarlo Sarkia — and from the darker register
 * of Poe and Hölderlin. They are used in example producers and tests.
 *
 * All identifiers are English slugs; the Finnish and literary names are
 * display names only.
 */

export const Ships = {
  TUMMA: {
    id: 'ship-tumma-001',
    name: 'Tumma',          // The Dark One — Leino, Helkavirsiä
  },
  YOLAULU: {
    id: 'ship-yolaulu-002',
    name: 'Yölaulu',        // Night Song — Leino
  },
  KAIPAUS: {
    id: 'ship-kaipaus-003',
    name: 'Kaipaus',        // Longing — Sarkia
  },
  ULALUME: {
    id: 'ship-ulalume-004',
    name: 'Ulalume',        // Poe — grief made into sound
  },
  HYPERION: {
    id: 'ship-hyperion-005',
    name: 'Hyperion',       // Hölderlin — fallen grandeur
  },
  HAMARA: {
    id: 'ship-hamara-006',
    name: 'Hämärä',         // Twilight / Dusk — Sarkia
  },
} as const;

export const Stations = {
  TUONELA: {
    id: 'station-tuonela-001',
    name: 'Tuonela Station',      // Realm of the Dead — Finnish mythology
  },
  MANALA: {
    id: 'station-manala-002',
    name: 'Manala Depot',         // The Underworld — Finnish death-realm
  },
  IKAVA: {
    id: 'station-ikava-003',
    name: 'Ikävä Anchorage',      // The Longing — Sarkia
  },
  USHER: {
    id: 'station-usher-004',
    name: 'Usher Reach',          // Poe — a place of slow collapse
  },
  DIOTIMA: {
    id: 'station-diotima-005',
    name: 'Diotima Platform',     // Hölderlin — the ideal, unattainable
  },
} as const;

export const Sectors = {
  HELKA_EXPANSE: {
    id: 'sector-helka-001',
    name: 'Helka Expanse',        // Helkavirsiä — the ancient songs
  },
  POHJOLA_DRIFT: {
    id: 'sector-pohjola-002',
    name: 'Pohjola Drift',        // The North / darkness — Finnish myth
  },
  ULALUME_DRIFT: {
    id: 'sector-ulalume-003',
    name: 'Ulalume Drift',        // Poe — the poem's haunted wood
  },
  HYPERION_BELT: {
    id: 'sector-hyperion-004',
    name: 'Hyperion Belt',        // Hölderlin — fallen light
  },
  HILJAISUUS: {
    id: 'sector-hiljaisuus-005',
    name: 'Hiljaisuus',           // The Silence — deep void region
  },
} as const;
