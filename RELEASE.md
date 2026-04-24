# Releasing the LabXchange fork

This fork of `fortune-sheet` is not published to npmjs.org — the upstream
`ruilisi` owns the `@fortune-sheet` scope there. Instead, we publish tarballs
as GitHub release assets on `labxchange/fortune-sheet` and consumers install
them by HTTPS URL.

Releases are produced by the **LabXchange Release** GitHub Actions workflow
(`.github/workflows/labxchange-release.yml`). No local tooling, `gh` login,
or SSH key is required.

## Cutting a release

1. Push the commit you want to release to a branch on `labxchange/fortune-sheet`.
2. Go to **Actions → LabXchange Release → Run workflow**.
3. Under "Use workflow from", pick the branch.
4. Enter the version **suffix** (e.g. `lxc.1`). The tag will be `v1.0.4-<suffix>`
   and the three packages will be versioned `1.0.4-<suffix>` (core, react) and
   `0.2.13-<suffix>` (formula-parser).
5. Click **Run workflow**. Takes ~3-4 min.
6. When it finishes, the three tarball URLs are printed in the run's
   summary and are also visible on the release page.

What the workflow does:

1. Checks out the selected branch.
2. `yarn install --frozen-lockfile && yarn build` — fresh build, every run.
   You do **not** need to commit `dist/` locally.
3. Rewrites the three `packages/*/package.json` versions and points the
   `core → formula-parser` and `react → core` dependencies at the tarball URLs
   we're about to publish. (Without this, npm would resolve the cross-deps
   from the public registry, which serves upstream ruilisi's unrelated builds.)
4. `npm pack` each of the three packages in `$RUNNER_TEMP`.
5. Creates the GitHub release pinned to the workflow's commit SHA and uploads
   all three `.tgz` files as assets.

The version bump and tarball-URL rewrite are ephemeral — nothing is committed
back to the branch. The release assets themselves are the source of truth;
consumers install from their URLs.

Release assets are immutable. If you need to re-release, bump the suffix
(`lxc.2`, `lxc.3`) — don't delete and recreate the tag.

## Consuming a release

Add the tarball URLs from the workflow summary to your `package.json`:

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

Only `@fortune-sheet/react` strictly needs to be listed if your code imports
only from it — npm will pull `core` and `formula-parser` transitively via the
URLs baked into the published `react` and `core` tarballs. Listing all three
explicitly makes the dependency tree easier to audit and lets you override
hoisted versions if needed.
