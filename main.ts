#!/usr/bin/env -S deno run --allow-net=github.com,api.github.com,objects.githubusercontent.com --allow-write
import { Command, EnumType } from "jsr:@cliffy/command@1.0.0-rc.7";
import {
  Checkbox,
  Confirm,
  Input,
  Select,
} from "jsr:@cliffy/prompt@1.0.0-rc.7";
import { MultiProgressBar } from "jsr:@deno-library/progress@1.4.9";
import { join } from "node:path";

import { type AssetInfo, parseAssetName } from "./lib/artifact-name.ts";
import { downloadArtifact } from "./lib/download-artifact.ts";
import {
  architectures,
  type DotslashArtifact,
  type DotslashFile,
  dotslashHeader,
  type DotslashProvider,
  oses,
  type Platform,
  platforms,
} from "./lib/format.ts";

/** A string which selects a set of platforms. */
const platformSelector = [
  "all" as const,
  ...architectures,
  ...oses,
  ...platforms,
];

/** CLI definition. */
const command = new Command()
  .type("platform", new EnumType(platformSelector))
  .type("provider", new EnumType(["github-release", "url"]))
  //
  .name("dotslash-from-release")
  .version("0.0.1")
  .description(
    "Generate a dotslash file (https://dotslash-cli.com) from a GitHub release.",
  )
  //
  .arguments("<url-or-owner:string> [repo:string] [tag:string]")
  .usage("<release-url> | <owner> <repo> [tag]")
  //
  .option(
    "--use-dotslash",
    "Use dotslash file included in release if available.",
  )
  .option(
    "--no-use-dotslash",
    "Do not use dotslash file included in release.",
    { hidden: true },
  )
  //
  .group("Output options")
  .option("--program <name:string>", 'Value of "program" in the output.')
  .option(
    "--platforms <platforms:platform[]>",
    "Platforms to include in the output.",
    {
      required: true,
      default: ["all"],
    },
  )
  .option(
    "--providers <providers:provider[]>",
    "Providers to include in the output.",
    {
      default: ["url", "github-release"],
      required: true,
    },
  )
  .option(
    "-o, --output <output:file>",
    "Write to executable file instead of stdout.",
  )
  //
  .group("Display options")
  .option("--no-progress", "Do not show progress bars.");

/** Type of the options parsed by {@linkcode command}. */
type Options = ReturnType<typeof command.parse> extends
  Promise<{ options: infer T }> ? T : never;

if (import.meta.main) {
  const { args, options } = await command.parse(Deno.args);
  const { program, contents } = await makeDotslashFile(
    releaseFromArgs(args),
    options,
  );

  if (options.output !== undefined) {
    try {
      await Deno.writeTextFile(options.output, contents + "\n", {
        mode: 0o777,
      });
    } catch (e) {
      // TODO(https://github.com/denoland/deno/issues/28873): use
      // `e instanceof Deno.errors.IsADirectory` instead.
      if (
        !(e instanceof Error) ||
        !e.message.startsWith("Is a directory (os error 21)")
      ) {
        throw e;
      }
      await Deno.writeTextFile(join(options.output, program), contents + "\n", {
        mode: 0o777,
      });
    }
  } else {
    console.log(contents);
  }
}

/**
 * Information about a GitHub release to be converted by {@linkcode makeDotslashFile()}.
 */
interface Release {
  /** The owner of the repository (e.g. `denoland` in `https://github.com/denoland/deno`). */
  owner: string;
  /** The name of the repository (e.g. `deno` in `https://github.com/denoland/deno`). */
  repo: string;
  /** The tag of the release; if `undefined`, the _latest_ release will be fetched. */
  tag?: string;
}

/**
 * Generates a dotslash file corresponding to the assets found in a GitHub release.
 */
async function makeDotslashFile(
  release: Release,
  options: Options,
): Promise<{ program: string; contents: string }> {
  /** Writer used for {@linkcode Confirm} and other prompts. */
  const writer = { writeSync: Deno.stderr.writeSync.bind(Deno.stderr) };

  const {
    assetsByName,
    possibleDotslashUrl,
    tag,
    unknownAssets,
  } = await fetchRelease(release, selectPlatforms(options.platforms));

  if (possibleDotslashUrl !== undefined && options.useDotslash !== false) {
    const resp = await fetch(possibleDotslashUrl);
    const text = await resp.text();

    if (text.startsWith(dotslashHeader)) {
      const useDotslash = options.useDotslash ?? await Confirm.prompt({
        message: "Use release dotslash file?",
        default: true,
        hint: possibleDotslashUrl,
        writer,
      });

      if (useDotslash) {
        const programName = JSON.parse(text).name;

        return {
          program: programName,
          contents: text,
        };
      }
    }
  }

  const releaseUrl =
    `https://github.com/${release.owner}/${release.repo}/releases/tag/${tag}`;

  if (assetsByName.size === 0) {
    if (unknownAssets.length === 0) {
      throw new Error(`no asset found in ${releaseUrl}`);
    }

    throw new Error(
      `no asset could be parsed in ${releaseUrl}: ${
        unknownAssets.map((asset) => asset.name).sort().join(", ")
      }`,
    );
  }

  const selectedAssets = await selectAssets(assetsByName, options, writer);
  const artifacts = await downloadArtifacts(
    release,
    tag,
    selectedAssets,
    options,
  );

  const program = options.program ?? await Input.prompt({
    message: "Program name",
    default: selectedAssets[0].info.name,
    suggestions: [
      release.repo,
      selectedAssets[0].info.name,
      ...artifacts.flatMap((artifact) =>
        artifact.archiveFileNames?.filter((name) => !name.endsWith("/")) ?? []
      ),
    ],
    writer,
  });

  const file = await createDotslashFile(program, artifacts, writer);
  const contents = `
${dotslashHeader}

// ${releaseUrl}
${JSON.stringify(file, undefined, 2)}
  `.trim();

  return { program, contents };
}

/**
 * Fetches information about a GitHub release, filtering output assets based on the allowed
 * `platforms`.
 */
async function fetchRelease(
  release: Release,
  platforms: ReadonlySet<Platform>,
): Promise<{
  /** If defined, an URL where an existing dotslash file can be found. */
  possibleDotslashUrl: string | undefined;
  assetsByName: Map<
    string,
    { name: string; size: number; url: string; info: AssetInfo }[]
  >;
  unknownAssets: { name: string; size: number; url: string }[];
  tag: string;
}> {
  const tagsFragment = release.tag === undefined
    ? "latest"
    : `tags/${release.tag}`;
  const apiUrl =
    `https://api.github.com/repos/${release.owner}/${release.repo}/releases/${tagsFragment}`;

  // Example API response: https://api.github.com/repos/denoland/deno/releases/tags/v1.46.3
  const resp = await fetch(apiUrl);

  if (!resp.ok) {
    throw new Error(`failed to fetch release at ${apiUrl}: ${resp.statusText}`);
  }

  const json = await resp.json();
  const releaseAssets = json.assets as Array<
    {
      name: string;
      browser_download_url: string;
      content_type: string;
      size: number;
    }
  >;

  const MAX_DOTSLASH_SIZE = 8_192; // 8 KiB, should be enough for a JSON file.
  let possibleDotslashUrl: string | undefined;

  const assetsByName = new Map<
    string,
    { name: string; size: number; url: string; info: AssetInfo }[]
  >();
  const unknownAssets: { name: string; size: number; url: string }[] = [];

  for (
    const { name, browser_download_url: url, size, content_type }
      of releaseAssets
  ) {
    if (
      name === release.repo && content_type === "application/octet-stream" &&
      size <= MAX_DOTSLASH_SIZE
    ) {
      possibleDotslashUrl = url;
      continue;
    }

    const info = parseAssetName(name);

    if (info.platform === undefined) {
      unknownAssets.push({ name, size, url });
    } else {
      const isSupportedPlatform = info.platform === "macos-universal"
        ? platforms.has("macos-aarch64") || platforms.has("macos-x86_64")
        : platforms.has(info.platform);

      if (!isSupportedPlatform) {
        continue;
      }

      let assetsForName = assetsByName.get(info.name);
      if (assetsForName === undefined) {
        assetsByName.set(info.name, assetsForName = []);
      }
      assetsForName.push({ info, size, url, name });
    }
  }

  return {
    possibleDotslashUrl,
    assetsByName,
    unknownAssets,
    tag: release.tag ?? json.tag_name,
  };
}

/**
 * Converts a list of {@linkcode platformSelector}s into a set of platforms.
 */
function selectPlatforms(
  selectedPlatforms: readonly typeof platformSelector[number][],
): Set<Platform> {
  const supportedPlatforms = new Set<Platform>();

  for (const platform of selectedPlatforms) {
    switch (platform) {
      case "linux":
      case "macos":
      case "windows":
        for (const arch of architectures) {
          supportedPlatforms.add(`${platform}-${arch}`);
        }
        break;
      case "aarch64":
      case "x86_64":
        for (const os of oses) {
          supportedPlatforms.add(`${os}-${platform}`);
        }
        break;
      case "all":
        for (const platform of platforms) {
          supportedPlatforms.add(platform);
        }
        break;
      default:
        supportedPlatforms.add(platform);
        break;
    }
  }

  return supportedPlatforms;
}

/**
 * Returns the list of assets to be used in the output file given all available assets grouped by prefix.
 */
async function selectAssets(
  assetsByName: ReadonlyMap<
    string,
    { name: string; size: number; url: string; info: AssetInfo }[]
  >,
  options: Options,
  writer: { writeSync(data: Uint8Array): number },
): Promise<{ name: string; size: number; url: string; info: AssetInfo }[]> {
  const assetGroups = [...assetsByName].sort(([a], [b]) => a.localeCompare(b));
  const assets = assetGroups.length === 1
    ? assetGroups[0][1]
    : options.program !== undefined && assetsByName.has(options.program)
    ? assetsByName.get(options.program)!
    : await Select.prompt({
      message: "Assets to use",
      options: assetGroups.map(([name, assets]) => ({
        name: `${name} (${
          assets.map((asset) => asset.info.platform).join(", ")
        })`,
        value: assets,
      })),
      writer,
    });

  const assetsByPlatform = Map.groupBy(assets, (asset) => asset.info.platform!);
  const promptPlatforms = assets.length > 1 &&
    (options.platforms === undefined ||
      [...assetsByPlatform.values()].some((assets) => assets.length > 1));

  if (!promptPlatforms) {
    return assets;
  }

  const seenPlatforms = new Set<string>();

  return await Checkbox.prompt({
    message: "Platforms",
    search: true,
    confirmSubmit: false,
    options: assets.sort((a, b) => a.name.localeCompare(b.name)).map((
      asset,
    ) => ({
      name: asset.name,
      value: asset,
      checked:
        seenPlatforms.size !== seenPlatforms.add(asset.info.platform!).size,
    })),
    minOptions: 1,
    writer,

    validate(value) {
      const platforms = Map.groupBy(value, (asset) => asset.info.platform!);

      for (const [platform, assets] of platforms) {
        if (assets.length !== 1) {
          return `platform may only be chosen once: ${platform} (selected: ${
            assets.map((asset) => asset.name).join(", ")
          })`;
        }
      }

      return true;
    },
  });
}

/**
 * A {@linkcode DotslashArtifact} whose `path` has yet to be determined.
 */
interface IntermediateArtifact extends Omit<DotslashArtifact, "path"> {
  /** Names of the files in the artifact if it is an archive. */
  archiveFileNames?: string[];
  /** Full name of the artifact file. */
  fullName: string;
  /** Platform of the artifact. */
  platform: Platform;
}

/**
 * Downloads the specified assets and returns them as {@linkcode IntermediateArtifact}s.
 */
async function downloadArtifacts(
  release: Release,
  tag: string,
  assets: readonly {
    name: string;
    size: number;
    url: string;
    info: AssetInfo;
  }[],
  options: Options,
): Promise<IntermediateArtifact[]> {
  const downloadProgress = options.progress
    ? new MultiProgressBar({
      title: "Downloading assets",
      complete: "=",
      incomplete: " ",
      display: "[:bar] :text :percent :completed/:total",
    })
    : undefined;

  if (downloadProgress !== undefined) {
    // Show progress on stderr.
    downloadProgress["writer"].releaseLock();
    downloadProgress["writer"] = Deno.stderr.writable.getWriter();
  }

  const currentProgress = assets.map((asset) => ({
    completed: 0,
    total: asset.size,
    text: asset.name,
  }));

  const artifacts = await Promise.all(
    assets.map(
      async (
        asset,
        i,
      ): Promise<IntermediateArtifact> => {
        const { blake3Digest, archiveFileNames } = await downloadArtifact(
          asset.url,
          asset.info.format,
          async (completed) => {
            currentProgress[i].completed = completed;

            await downloadProgress?.render(currentProgress);
          },
        );
        const providers = options.providers.map(
          (provider): DotslashProvider => {
            switch (provider) {
              case "url":
                return { url: asset.url };
              case "github-release":
                return {
                  type: "github-release",
                  repo: `${release.owner}/${release.repo}`,
                  tag,
                  name: asset.name,
                };
            }
          },
        );

        return {
          size: asset.size,
          hash: "blake3",
          digest: blake3Digest,
          providers,
          format: asset.info.format,
          platform: asset.info.platform!,
          fullName: asset.name,
          archiveFileNames,
        };
      },
    ),
  );
  await downloadProgress?.end();

  return artifacts;
}

async function createDotslashFile(
  program: string,
  artifacts: readonly IntermediateArtifact[],
  writer: { writeSync(data: Uint8Array): number },
): Promise<DotslashFile> {
  const file: DotslashFile = {
    name: program,
    platforms: {},
  };
  const programRe = new RegExp(`(^|/)${program}(\\.exe)?$`);

  for (const artifact of artifacts) {
    let path: string;

    if (artifact.archiveFileNames === undefined) {
      if (artifact.format === undefined) {
        path = artifact.fullName;
      } else {
        path = artifact.fullName.replace(
          new RegExp(`\\.${artifact.format}$`),
          "",
        );
      }
    } else {
      const paths = artifact.archiveFileNames.filter((name) =>
        programRe.test(name)
      );

      if (paths.length === 1) {
        path = paths[0];
      } else {
        path = await Select.prompt({
          message: `Path for ${artifact.platform}`,
          options: paths,
          writer,
        });
      }
    }

    const dotslashArtifact: DotslashArtifact = {
      size: artifact.size,
      hash: artifact.hash,
      digest: artifact.digest,
      format: artifact.format,
      providers: artifact.providers,
      path,
    };

    if (artifact.platform === "macos-universal") {
      file.platforms["macos-aarch64"] = dotslashArtifact;
      file.platforms["macos-x86_64"] = dotslashArtifact;
    } else {
      file.platforms[artifact.platform] = dotslashArtifact;
    }
  }

  return file;
}

/**
 * Parses a {@linkcode Release} from command-line arguments.
 */
function releaseFromArgs(args: readonly [string, string?, string?]): Release {
  switch (args.length) {
    case 1: {
      const match =
        /^(https:\/\/)?github.com\/(?<owner>[\w-]+)\/(?<repo>[\w-]+)(\/releases\/(latest|tag\/(?<tag>.+)))?$/
          .exec(args[0]);

      if (match === null) {
        console.error(`invalid release URL: ${args[0]}`);
        Deno.exit(1);
      }

      return {
        owner: match.groups!.owner,
        repo: match.groups!.repo,
        tag: match.groups!.tag,
      };
    }
    case 2:
    case 3: {
      return {
        owner: args[0],
        repo: args[1]!,
        tag: args[2],
      };
    }
    default:
      command.showHelp();
      Deno.exit(1);
  }
}
