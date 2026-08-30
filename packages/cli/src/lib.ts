// The importable face of this package. `src/index.ts` is the `flaghoist` binary; this module is
// what other packages consume, so the config format has exactly one implementation.
//
// `create-flaghoist` scaffolds a project with `serializeConfig`, and the CLI reads it back with
// `parseConfig` — sharing them here is what keeps the two from drifting into a file one side
// writes and the other cannot parse.
export {
  asContainer,
  containerStorageDefault,
  DEFAULT_CONFIG,
  parseConfig,
  PLATFORM_KINDS,
  serializeConfig,
  STORAGE_KINDS,
  type AdminAuthKind,
  type ContainerStorage,
  type FlaghoistConfig,
  type PlatformKind,
  type StorageKind,
} from './config'
