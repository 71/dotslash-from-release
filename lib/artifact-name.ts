import {
  Arch,
  DotslashArtifactFormat,
  DotslashPlatform,
  Os,
  Platform,
} from "./format.ts";

const osNames: Record<string, Os> = {
  "apple-darwin": "macos",
  "pc-windows-gnu": "windows",
  "pc-windows-msvc": "windows",
  "unknown-linux-gnu": "linux",
  "unknown-linux-musl": "linux",
  darwin: "macos",
  linux: "linux",
  macos: "macos",
  osx: "macos",
  windows: "windows",
};

const archNames: Record<string, Arch> = {
  aarch_64: "aarch64",
  aarch64: "aarch64",
  arm64: "aarch64",
  amd64: "x86_64",
  x86_64: "x86_64",
  x64: "x86_64",
};

const additionalPlatforms: Record<string, Platform> = {
  "macos-universal_binary": "macos-universal",
  "osx-universal_binary": "macos-universal",
  win64: "windows-x86_64",
};

const artifactFormats: Record<
  `.${DotslashArtifactFormat}`,
  DotslashArtifactFormat
> = {
  ".tar.gz": "tar.gz",
  ".tar.xz": "tar.xz",
  ".tar.zst": "tar.zst",
  ".tar": "tar",
  ".zip": "zip",
  ".gz": "gz",
  ".xz": "xz",
  ".zst": "zst",
};

const artifactRe = (function () {
  const nameRe = /(?<name>[\w-]+)/.source;
  const versionRe = /v?(?<version>\d+(\.\d+)+([-.][a-z]+[-.]?\d+)?)/.source;
  const osRe = (id: number) => `(?<os${id}>${Object.keys(osNames).join("|")})`;
  const archRe = (id: number) =>
    `(?<arch${id}>${Object.keys(archNames).join("|")})`;
  const additionalPlatformsRe = `(?<platform>${
    Object.keys(additionalPlatforms).join("|")
  })`;
  const formatRe = `(?<format>${Object.values(artifactFormats).join("|")})`;

  const osArchRe = `${osRe(1)}[-_]${archRe(1)}`;
  const archOsRe = `${archRe(2)}[-_]${osRe(2)}`;
  const platformRe = `(${osArchRe}|${archOsRe}|${additionalPlatformsRe})`;

  return new RegExp(
    `^${nameRe}([-_]${versionRe})?[-_]${platformRe}(\\.exe)?(\\.${formatRe})?$`,
    "i",
  );
})();

/**
 * Information extracted from an asset name.
 */
export interface AssetInfo {
  name: string;
  version?: string;
  platform?: Platform;
  format?: DotslashArtifactFormat;
}

/**
 * Parses an asset name such as `protoc-28.2-linux-x86_64.zip` into its components.
 */
export function parseAssetName(fileName: string): AssetInfo {
  const match = artifactRe.exec(fileName);

  if (match === null) {
    const dashIndex = fileName.indexOf("-");
    const name = dashIndex === -1 ? fileName : fileName.slice(0, dashIndex);

    return { name };
  }

  const { name, version, os1, os2, arch1, arch2, platform, format } = match
    .groups!;
  const os = (os1 ?? os2)?.toLowerCase();
  const arch = (arch1 ?? arch2)?.toLowerCase();
  const result: AssetInfo = {
    name,
    platform: platform === undefined
      ? `${osNames[os]}-${archNames[arch]}` as DotslashPlatform
      : additionalPlatforms[platform.toLowerCase()]!,
  };

  if (version !== undefined) {
    result.version = version;
  }
  if (format !== undefined) {
    result.format = format.toLowerCase() as DotslashArtifactFormat;
  }

  return result;
}

// spell-checker: disable

Deno.test("parseArtifactName", async () => {
  const { assertEquals } = await import("jsr:@std/assert@1.0.6/equals");
  const assertArtifactParsed = (name: string, expected: AssetInfo) => {
    assertEquals(parseAssetName(name), expected);
  };

  // https://github.com/protocolbuffers/protobuf/releases/tag/v28.2
  assertArtifactParsed("protoc-28.2-linux-aarch_64.zip", {
    name: "protoc",
    version: "28.2",
    platform: "linux-aarch64",
    format: "zip",
  });
  assertArtifactParsed("protoc-28.2-linux-x86_64.zip", {
    name: "protoc",
    version: "28.2",
    platform: "linux-x86_64",
    format: "zip",
  });
  assertArtifactParsed("protoc-28.2-osx-aarch_64.zip", {
    name: "protoc",
    version: "28.2",
    platform: "macos-aarch64",
    format: "zip",
  });
  assertArtifactParsed("protoc-28.2-osx-universal_binary.zip", {
    name: "protoc",
    version: "28.2",
    platform: "macos-universal",
    format: "zip",
  });
  assertArtifactParsed("protoc-28.2-osx-x86_64.zip", {
    name: "protoc",
    version: "28.2",
    platform: "macos-x86_64",
    format: "zip",
  });
  assertArtifactParsed("protoc-28.2-win64.zip", {
    name: "protoc",
    version: "28.2",
    platform: "windows-x86_64",
    format: "zip",
  });

  // https://github.com/protocolbuffers/protobuf/releases/tag/v29.0-rc2
  assertArtifactParsed("protoc-29.0-rc-2-linux-x86_64.zip", {
    name: "protoc",
    version: "29.0-rc-2",
    platform: "linux-x86_64",
    format: "zip",
  });

  // https://github.com/denoland/deno/releases/tag/v1.46.3
  assertArtifactParsed("deno-aarch64-apple-darwin.zip", {
    name: "deno",
    platform: "macos-aarch64",
    format: "zip",
  });
  assertArtifactParsed("deno-aarch64-unknown-linux-gnu.zip", {
    name: "deno",
    platform: "linux-aarch64",
    format: "zip",
  });
  assertArtifactParsed("deno-x86_64-apple-darwin.zip", {
    name: "deno",
    platform: "macos-x86_64",
    format: "zip",
  });
  assertArtifactParsed("deno-x86_64-pc-windows-msvc.zip", {
    name: "deno",
    platform: "windows-x86_64",
    format: "zip",
  });
  assertArtifactParsed("deno-x86_64-unknown-linux-gnu.zip", {
    name: "deno",
    platform: "linux-x86_64",
    format: "zip",
  });

  // https://github.com/bazelbuild/bazel/releases/tag/7.3.1
  assertArtifactParsed("bazel-7.3.1-darwin-arm64", {
    name: "bazel",
    platform: "macos-aarch64",
    version: "7.3.1",
  });
  assertArtifactParsed("bazel-7.3.1-darwin-x86_64", {
    name: "bazel",
    platform: "macos-x86_64",
    version: "7.3.1",
  });
  assertArtifactParsed("bazel-7.3.1-linux-arm64", {
    name: "bazel",
    platform: "linux-aarch64",
    version: "7.3.1",
  });
  assertArtifactParsed("bazel-7.3.1-linux-x86_64", {
    name: "bazel",
    platform: "linux-x86_64",
    version: "7.3.1",
  });
  assertArtifactParsed("bazel-7.3.1-windows-arm64.exe", {
    name: "bazel",
    platform: "windows-aarch64",
    version: "7.3.1",
  });
  assertArtifactParsed("bazel-7.3.1-windows-arm64.zip", {
    name: "bazel",
    version: "7.3.1",
    platform: "windows-aarch64",
    format: "zip",
  });
  assertArtifactParsed("bazel-7.3.1-windows-x86_64.exe", {
    name: "bazel",
    version: "7.3.1",
    platform: "windows-x86_64",
  });
  assertArtifactParsed("bazel-7.3.1-windows-x86_64.zip", {
    name: "bazel",
    version: "7.3.1",
    platform: "windows-x86_64",
    format: "zip",
  });

  // https://github.com/facebook/buck2/releases/tag/2024-09-16
  assertArtifactParsed("buck2-aarch64-apple-darwin.zst", {
    name: "buck2",
    platform: "macos-aarch64",
    format: "zst",
  });
  assertArtifactParsed("buck2-aarch64-unknown-linux-gnu.zst", {
    name: "buck2",
    platform: "linux-aarch64",
    format: "zst",
  });
  assertArtifactParsed("buck2-aarch64-unknown-linux-musl.zst", {
    name: "buck2",
    platform: "linux-aarch64",
    format: "zst",
  });
  assertArtifactParsed("buck2-x86_64-apple-darwin.zst", {
    name: "buck2",
    platform: "macos-x86_64",
    format: "zst",
  });
  assertArtifactParsed("buck2-x86_64-pc-windows-msvc.exe.zst", {
    name: "buck2",
    platform: "windows-x86_64",
    format: "zst",
  });
  assertArtifactParsed("buck2-x86_64-unknown-linux-gnu.zst", {
    name: "buck2",
    platform: "linux-x86_64",
    format: "zst",
  });
  assertArtifactParsed("buck2-x86_64-unknown-linux-musl.zst", {
    name: "buck2",
    platform: "linux-x86_64",
    format: "zst",
  });

  // https://github.com/BurntSushi/ripgrep/releases/tag/14.1.1
  assertArtifactParsed("ripgrep-14.1.1-aarch64-apple-darwin.tar.gz", {
    name: "ripgrep",
    version: "14.1.1",
    platform: "macos-aarch64",
    format: "tar.gz",
  });
  assertArtifactParsed("ripgrep-14.1.1-aarch64-unknown-linux-gnu.tar.gz", {
    name: "ripgrep",
    version: "14.1.1",
    platform: "linux-aarch64",
    format: "tar.gz",
  });
  assertArtifactParsed("ripgrep-14.1.1-x86_64-apple-darwin.tar.gz", {
    name: "ripgrep",
    version: "14.1.1",
    platform: "macos-x86_64",
    format: "tar.gz",
  });
  assertArtifactParsed("ripgrep-14.1.1-x86_64-pc-windows-gnu.zip", {
    name: "ripgrep",
    version: "14.1.1",
    platform: "windows-x86_64",
    format: "zip",
  });
  assertArtifactParsed("ripgrep-14.1.1-x86_64-pc-windows-msvc.zip", {
    name: "ripgrep",
    version: "14.1.1",
    platform: "windows-x86_64",
    format: "zip",
  });
  assertArtifactParsed("ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz", {
    name: "ripgrep",
    version: "14.1.1",
    platform: "linux-x86_64",
    format: "tar.gz",
  });

  // https://github.com/cameron-martin/bazel-lsp/releases/tag/v0.6.1
  assertArtifactParsed("bazel-lsp-0.6.1-osx-arm64", {
    name: "bazel-lsp",
    version: "0.6.1",
    platform: "macos-aarch64",
  });

  // https://github.com/bazelbuild/bazel-watcher/releases/tag/v0.25.3
  assertArtifactParsed("ibazel_darwin_arm64", {
    name: "ibazel",
    platform: "macos-aarch64",
  });
  assertArtifactParsed("ibazel_linux_amd64", {
    name: "ibazel",
    platform: "linux-x86_64",
  });
  assertArtifactParsed("ibazel_windows_amd64.exe", {
    name: "ibazel",
    platform: "windows-x86_64",
  });

  // https://github.com/sharkdp/bat/releases/tag/v0.25.0
  assertArtifactParsed("bat-v0.25.0-aarch64-apple-darwin.tar.gz", {
    name: "bat",
    version: "0.25.0",
    platform: "macos-aarch64",
    format: "tar.gz",
  });
  assertArtifactParsed("bat-v0.25.0-aarch64-unknown-linux-musl.tar.gz", {
    name: "bat",
    version: "0.25.0",
    platform: "linux-aarch64",
    format: "tar.gz",
  });
  assertArtifactParsed("bat-v0.25.0-x86_64-unknown-linux-gnu.tar.gz", {
    name: "bat",
    version: "0.25.0",
    platform: "linux-x86_64",
    format: "tar.gz",
  });

  // https://github.com/rr-debugger/rr/releases/tag/5.9.0
  assertArtifactParsed("rr-5.9.0-Linux-aarch64.tar.gz", {
    name: "rr",
    version: "5.9.0",
    platform: "linux-aarch64",
    format: "tar.gz",
  });
  assertArtifactParsed("rr-5.9.0-Linux-x86_64.tar.gz", {
    name: "rr",
    version: "5.9.0",
    platform: "linux-x86_64",
    format: "tar.gz",
  });
});
