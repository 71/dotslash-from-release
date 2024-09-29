/**
 * Format of a dotslash file.
 *
 * See https://dotslash-cli.com/docs/dotslash-file.
 */
export interface DotslashFile {
  name: string;
  platforms: { [P in DotslashPlatform]?: DotslashArtifact };
}

export interface DotslashArtifact {
  size: number;
  hash: "blake3" | "sha256";
  digest: string;
  format?: DotslashArtifactFormat;
  path: string;
  providers: DotslashProvider[];
}

export type Os = "linux" | "macos" | "windows";
export type Arch = "aarch64" | "x86_64";

export type DotslashPlatform = `${Os}-${Arch}`;
export type Platform = DotslashPlatform | "macos-universal";

/** See https://dotslash-cli.com/docs/dotslash-file/#artifact-format. */
export type DotslashArtifactFormat =
  | "tar.gz"
  | "tar.xz"
  | "tar.zst"
  | "tar"
  | "zip"
  | "gz"
  | "xz"
  | "zst";

export type DotslashProvider = { url: string } | {
  type: "github-release";
  repo: string;
  tag: string;
  name: string;
};

/** First line of a dotslash file. */
export const dotslashHeader = `#!/usr/bin/env dotslash`;

export const oses = Object.keys(
  {
    "linux": void 0,
    "macos": void 0,
    "windows": void 0,
  } satisfies Record<Os, void>,
) as readonly Os[];

export const archs = Object.keys(
  {
    "aarch64": void 0,
    "x86_64": void 0,
  } satisfies Record<Arch, void>,
) as readonly Arch[];

export const platforms = Object.keys(
  {
    "linux-aarch64": void 0,
    "linux-x86_64": void 0,
    "macos-aarch64": void 0,
    "macos-x86_64": void 0,
    "windows-aarch64": void 0,
    "windows-x86_64": void 0,
  } satisfies Record<DotslashPlatform, void>,
) as readonly DotslashPlatform[];
