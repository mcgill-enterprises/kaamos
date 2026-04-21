# Generated code

This directory contains TypeScript types generated from `proto/galaxy/v1/*.proto`
by the [buf](https://buf.build) toolchain.

These files are committed to the repository so you can read and understand
the generated output without needing to run `buf generate` yourself.

To regenerate:

```bash
buf generate
```

Configuration is in `buf.yaml` and `buf.gen.yaml` at the repository root.

## What gets generated

| Proto file | Generated output |
|-----------|-----------------|
| `navigation.proto` | `galaxy/v1/navigation_pb.ts` |
| `fuel.proto` | `galaxy/v1/fuel_pb.ts` |

## Why these are committed

Generated files are normally gitignored. They are committed here deliberately
because this is a tutorial — readers benefit from seeing what `buf` produces
without needing to install and run the toolchain first.

In a production codebase, treat these as build artifacts and generate them
in CI instead.
