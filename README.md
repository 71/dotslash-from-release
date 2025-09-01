# dotslash-from-release

Generates a [`dotslash`](https://dotslash-cli.com) file from a GitHub release.

## Usage

[`deno`](https://deno.com) must be installed. The main script can then be run
with `./main.ts`.

<details>
<summary>Other invocation methods</summary>

- Run with explicit permissions:
  ```sh
  $ deno run                                                            \
    --allow-net=github.com,api.github.com,release-assets.githubusercontent.com \
    main.ts
  ```

- Run without cloning:
  ```sh
  $ deno run                                                            \
    --allow-net=github.com,api.github.com,release-assets.githubusercontent.com \
    https://github.com/71/dotslash-from-release/raw/refs/heads/main/main.ts
  ```

- Use `dotslash` to run Deno without installing it:
  ```sh
  $ DENO_DIR=/tmp/deno-cache                                                                             \
    dotslash <(curl -fsSL https://github.com/71/dotslash-from-release/raw/refs/heads/main/examples/deno) \
    run --allow-net=github.com,api.github.com,release-assets.githubusercontent.com                              \
    https://github.com/71/dotslash-from-release/raw/refs/heads/main/main.ts
  ```

  You can then clean up with:
  ```sh
  $ rm -rf /tmp/deno-cache/
  ```

</details>

Examples:

- Convert a release URL to a `dotslash` file:

  ```sh
  $ ./main.ts https://github.com/BurntSushi/ripgrep/releases/tag/14.1.1 --program rg --no-progress > examples/rg
  ```

- Convert the latest release of a repository to a `dotslash` file:

  ```sh
  $ ./main.ts protocolbuffers protobuf --program protoc --no-progress > examples/protoc
  ```

- Show progress and be prompted on ambiguous choices:

  ```sh
  $ ./main.ts denoland deno v1.46.3 > examples/deno
  ? Assets to use › deno (macos-aarch64, linux-aarch64, macos-x86_64, windows-x86_64, linux-x86_64)
  Downloading assets
  [==========================================] deno-aarch64-apple-darwin.zip 100.00% 42377654/42377654
  [=====================================] deno-aarch64-unknown-linux-gnu.zip 100.00% 51654988/51654988
  [===========================================] deno-x86_64-apple-darwin.zip 100.00% 43844272/43844272
  [========================================] deno-x86_64-pc-windows-msvc.zip 100.00% 42072300/42072300
  [======================================] deno-x86_64-unknown-linux-gnu.zip 100.00% 49337647/49337647
  ? Program name (deno) › deno
  ```

- Detect and re-use existing `dotslash` files:

  ```sh
  $ ./main.ts facebook buck2 2024-09-16 > examples/buck2
  ? Use release dotslash file? (Y/n) › Yes
  ```

Programs can then be marked as executable and used like regular binaries
(assuming that `dotslash` is in the `PATH`):

```sh
$ chmod +x examples/*

$ examples/buck2 --version
buck2 c605599614de379194006957cdd7d2d3 <build-id>

$ examples/deno --version | head -1
deno 1.46.3 (stable, release, aarch64-apple-darwin)

$ examples/protoc --version
libprotoc 28.2

$ examples/rg --version | head -1
ripgrep 14.1.1 (rev 4649aa9700)
```

## Installation

If you want to install `dotslash-from-release` instead of using it with
`deno run`, run the following:

```sh
deno install --global --allow-net --allow-write https://github.com/71/dotslash-from-release/raw/refs/heads/main/main.ts --name dotslash-from-release
```
