import { crypto } from "jsr:@std/crypto@1.0.3/crypto";
import { encodeHex } from "jsr:@std/encoding@1.0.5/hex";
import type { DotslashArtifactFormat } from "./format.ts";

/**
 * Downloads the artifact at the given URL, returning its hex-encoded BLAKE3 digest and, if it is a
 * supported archive, the names of the files it contains.
 */
export async function downloadArtifact(
  url: string,
  format: DotslashArtifactFormat | undefined,
  onProgress?: (read: number) => Promise<void>,
): Promise<{ blake3Digest: string; archiveFileNames?: string[] }> {
  const resp = await fetch(url);
  let readFileNames:
    | { (stream: ReadableStream<Uint8Array>): Promise<string[]> }
    | undefined;

  switch (format) {
    case "zip":
      readFileNames = async (stream) => {
        const { ZipReader } = await import("jsr:@zip-js/zip-js@2.7.52");
        const zip = new ZipReader(stream);
        const entries = await zip.getEntries();

        return entries.filter((entry) => !entry.directory).map((entry) =>
          entry.filename
        );
      };
      break;

    case "tar":
      readFileNames = readTarFileNames;
      break;

    case "tar.gz":
      readFileNames = async (stream) => {
        return await readTarFileNames(
          stream.pipeThrough(new DecompressionStream("gzip")),
        );
      };
      break;

    case "tar.xz":
      readFileNames = async (stream) => {
        const { default: { XzReadableStream } } = await import(
          "npm:xz-decompress@0.2.2"
        );

        // Ensure that xz decompression operations are performed sequentially; see
        // `xzCurrentPromise` documentation for more information.
        const promise = xzCurrentPromise.then(() =>
          readTarFileNames(new XzReadableStream(stream))
        );

        xzCurrentPromise = promise.then(() => {}, () => {});

        return promise;
      };
      break;

    case "tar.zst":
      readFileNames = async (stream) => {
        return await readTarFileNames(
          stream.pipeThrough(new DecompressionStream("deflate")),
        );
      };
      break;

    default:
      break;
  }

  let body = resp.body!;
  let fileNamesPromise: Promise<string[]> | undefined;
  let progressPromise: Promise<void> | undefined;

  if (readFileNames !== undefined) {
    let fileNamesStream: ReadableStream<Uint8Array>;

    [body, fileNamesStream] = body.tee();

    fileNamesPromise = readFileNames(fileNamesStream);
  }

  if (onProgress !== undefined) {
    let progressStream: ReadableStream<Uint8Array>;

    [body, progressStream] = body.tee();

    progressPromise = (async () => {
      let totalRead = 0;

      for await (const bytes of progressStream) {
        totalRead += bytes.length;

        await onProgress(totalRead);
      }
    })();
  }

  const [digest, archiveFileNames] = await Promise.all([
    crypto.subtle.digest("BLAKE3", body),
    fileNamesPromise,
    progressPromise,
  ]);

  return {
    blake3Digest: encodeHex(digest),
    archiveFileNames,
  };
}

/**
 * Returns the names of the files in a tar archive.
 */
async function readTarFileNames(
  stream: ReadableStream<Uint8Array>,
): Promise<string[]> {
  // spell-checker: ignore Untar
  const { UntarStream } = await import("jsr:@std/tar@0.1.6/untar-stream");
  const entries: string[] = [];

  try {
    for await (const entry of stream.pipeThrough(new UntarStream())) {
      if (entry.readable !== undefined) {
        entries.push(entry.path);

        await entry.readable.cancel();
      }
    }
  } catch (e) {
    if (!(e instanceof SyntaxError) || entries.length === 0) {
      throw e;
    }
    // If the tar file is invalid for any reason (e.g. invalid header checksum), ignore it as we
    // may have been able to extract some entries out of it.
  }

  return entries;
}

/**
 * A promise corresponding to a xz decompression operation, used to ensure such operations are
 * performed sequentially.
 *
 * Required since xz cannot decompress streams concurrently:
 * https://github.com/httptoolkit/xz-decompress/issues/9.
 */
let xzCurrentPromise = Promise.resolve();

// spell-checker: disable

Deno.test("downloadArtifact", async () => {
  const { assertEquals } = await import("jsr:@std/assert@1.0.6/equals");

  await Promise.all([
    async function () {
      assertEquals(
        await downloadArtifact(
          "https://github.com/protocolbuffers/protobuf/releases/download/v28.2/protoc-28.2-linux-aarch_64.zip",
          "zip",
        ),
        {
          blake3Digest:
            "89ebfb8f46237be600c2513068fa813e9d7ff50b7e590d0d45766227196e95ea",
          archiveFileNames: [
            "bin/protoc",
            "include/google/protobuf/any.proto",
            "include/google/protobuf/api.proto",
            "include/google/protobuf/compiler/plugin.proto",
            "include/google/protobuf/cpp_features.proto",
            "include/google/protobuf/descriptor.proto",
            "include/google/protobuf/duration.proto",
            "include/google/protobuf/empty.proto",
            "include/google/protobuf/field_mask.proto",
            "include/google/protobuf/java_features.proto",
            "include/google/protobuf/source_context.proto",
            "include/google/protobuf/struct.proto",
            "include/google/protobuf/timestamp.proto",
            "include/google/protobuf/type.proto",
            "include/google/protobuf/wrappers.proto",
            "readme.txt",
          ],
        },
      );
    }(),

    async function () {
      assertEquals(
        await downloadArtifact(
          "https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-x86_64-unknown-linux-musl.tar.gz",
          "tar.gz",
        ),
        {
          blake3Digest:
            "f73cca4e54d78c31f832c7f6e2c0b4db8b04fa3eaa747915727d570893dbee76",
          archiveFileNames: [
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/COPYING",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/UNLICENSE",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/doc/CHANGELOG.md",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/doc/FAQ.md",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/doc/rg.1",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/doc/GUIDE.md",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/LICENSE-MIT",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/rg",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/complete/_rg",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/complete/rg.fish",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/complete/_rg.ps1",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/complete/rg.bash",
            "ripgrep-14.1.1-x86_64-unknown-linux-musl/README.md",
          ],
        },
      );
    }(),

    async function () {
      assertEquals(
        await downloadArtifact(
          "https://github.com/mstange/samply/releases/download/samply-v0.13.1/samply-aarch64-unknown-linux-gnu.tar.xz",
          "tar.xz",
        ),
        {
          blake3Digest:
            "3775cd10d9b7618fd4a88e9de6752500af26f5dff548471a223d00cde8291a0d",
          archiveFileNames: [
            "samply-aarch64-unknown-linux-gnu/README.md",
            "samply-aarch64-unknown-linux-gnu/samply",
            "samply-aarch64-unknown-linux-gnu/RELEASES.md",
            "samply-aarch64-unknown-linux-gnu/LICENSE-APACHE",
            "samply-aarch64-unknown-linux-gnu/LICENSE-MIT",
          ],
        },
      );
    }(),
  ]);
});
