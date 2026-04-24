# Releasing the LabXchange fork

This fork of `fortune-sheet` is not published to npmjs.org — the upstream
`ruilisi` owns the `@fortune-sheet` scope there. Instead, we publish tarballs
as GitHub release assets on `labxchange/fortune-sheet` and consumers install
them by HTTPS URL.

## Cutting a release

Prerequisites:

- `gh` authenticated with push access to `labxchange/fortune-sheet`
  (`gh auth status`)
- Clean working tree on the branch you want to push (the script commits and
  pushes the version bump to the current branch)
- `dist/` (core, react) and `lib/` (formula-parser) already built and
  committed — the script does **not** rebuild; it trusts the committed
  artifacts, matching the repo's existing workflow

Run:

```sh
./scripts/release.sh lxc.1
```

The argument is the suffix appended to the base versions. Examples:

| Invocation                     | Tag             | Package versions                       |
| ------------------------------ | --------------- | -------------------------------------- |
| `./scripts/release.sh lxc.1`   | `v1.0.4-lxc.1`  | core/react `1.0.4-lxc.1`, formula-parser `0.2.13-lxc.1` |
| `./scripts/release.sh lxc.2`   | `v1.0.4-lxc.2`  | core/react `1.0.4-lxc.2`, formula-parser `0.2.13-lxc.2` |

The script:

1. Rewrites the three `packages/*/package.json` versions and points the
   `core → formula-parser` and `react → core` dependencies at the tarball URLs
   we're about to publish (otherwise npm would resolve them from the public
   registry, which serves upstream ruilisi's unrelated builds).
2. Runs `npm pack` in each package and collects the `.tgz` files into
   `release-artifacts/` (gitignored).
3. Commits the version bump, tags, and pushes the current branch and tag.
4. Creates the GitHub release and uploads all three tarballs.
5. Prints the three HTTPS URLs for the consumer's `package.json`.

Release assets are immutable — if you need to re-release, bump the suffix
(`lxc.2`, `lxc.3`) rather than overwriting a tag.

## Consuming a release

Add the URLs printed by the release script to your `package.json`:

```json
{
  "dependencies": {
    "@fortune-sheet/formula-parser": "https://github.com/labxchange/fortune-sheet/releases/download/v1.0.4-lxc.1/fortune-sheet-formula-parser-0.2.13-lxc.1.tgz",
    "@fortune-sheet/core": "https://github.com/labxchange/fortune-sheet/releases/download/v1.0.4-lxc.1/fortune-sheet-core-1.0.4-lxc.1.tgz",
    "@fortune-sheet/react": "https://github.com/labxchange/fortune-sheet/releases/download/v1.0.4-lxc.1/fortune-sheet-react-1.0.4-lxc.1.tgz"
  }
}
```

Then run `npm install` (or `yarn`) to regenerate the lockfile, which will
pin the tarball's SHA-512 for integrity.

Only `@fortune-sheet/react` needs to be listed if your code only imports from
it — npm will pull `core` and `formula-parser` transitively via the URLs baked
into the published `react` and `core` tarballs. Listing all three explicitly
makes the dependency tree easier to audit and lets you override the hoisted
versions if needed.
