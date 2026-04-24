#!/usr/bin/env bash
# Release the three @fortune-sheet/* subpackages as tarballs attached to a
# GitHub release on labxchange/fortune-sheet. See RELEASE.md for usage.

set -euo pipefail

SUFFIX="${1:-lxc.1}"

OWNER="labxchange"
REPO="fortune-sheet"
CORE_BASE="1.0.4"
REACT_BASE="1.0.4"
FORMULA_BASE="0.2.13"

TAG="v${CORE_BASE}-${SUFFIX}"
CORE_VERSION="${CORE_BASE}-${SUFFIX}"
REACT_VERSION="${REACT_BASE}-${SUFFIX}"
FORMULA_VERSION="${FORMULA_BASE}-${SUFFIX}"

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

ARTIFACT_DIR="${REPO_ROOT}/release-artifacts"

FORMULA_TGZ_NAME="fortune-sheet-formula-parser-${FORMULA_VERSION}.tgz"
CORE_TGZ_NAME="fortune-sheet-core-${CORE_VERSION}.tgz"
REACT_TGZ_NAME="fortune-sheet-react-${REACT_VERSION}.tgz"

RELEASE_URL_BASE="https://github.com/${OWNER}/${REPO}/releases/download/${TAG}"
FORMULA_URL="${RELEASE_URL_BASE}/${FORMULA_TGZ_NAME}"
CORE_URL="${RELEASE_URL_BASE}/${CORE_TGZ_NAME}"
REACT_URL="${RELEASE_URL_BASE}/${REACT_TGZ_NAME}"

log() { printf '==> %s\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# --- Preflight checks -------------------------------------------------------

command -v gh >/dev/null 2>&1 || die "gh CLI not found"
command -v npm >/dev/null 2>&1 || die "npm not found"
command -v node >/dev/null 2>&1 || die "node not found"

gh auth status >/dev/null 2>&1 || die "gh not authenticated; run 'gh auth login'"

origin_url="$(git remote get-url origin 2>/dev/null || true)"
case "$origin_url" in
  *"${OWNER}/${REPO}"*) ;;
  *) die "origin is '${origin_url}'; expected a URL containing ${OWNER}/${REPO}" ;;
esac

if [ -n "$(git status --porcelain)" ]; then
  die "working tree is dirty; commit or stash changes first"
fi

if git rev-parse --verify --quiet "refs/tags/${TAG}" >/dev/null; then
  die "tag ${TAG} already exists; pick a new suffix (e.g., ./scripts/release.sh lxc.2)"
fi

if gh release view "${TAG}" --repo "${OWNER}/${REPO}" >/dev/null 2>&1; then
  die "release ${TAG} already exists on ${OWNER}/${REPO}"
fi

# --- Rewrite package.json files --------------------------------------------

log "bumping versions and cross-dep URLs"

node -e '
  const fs = require("fs");
  const [path, version] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
  pkg.version = version;
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
' "packages/formula-parser/package.json" "${FORMULA_VERSION}"

node -e '
  const fs = require("fs");
  const [path, version, depName, depUrl] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
  pkg.version = version;
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies[depName] = depUrl;
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
' "packages/core/package.json" "${CORE_VERSION}" "@fortune-sheet/formula-parser" "${FORMULA_URL}"

node -e '
  const fs = require("fs");
  const [path, version, depName, depUrl] = process.argv.slice(1);
  const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
  pkg.version = version;
  pkg.dependencies = pkg.dependencies || {};
  pkg.dependencies[depName] = depUrl;
  fs.writeFileSync(path, JSON.stringify(pkg, null, 2) + "\n");
' "packages/react/package.json" "${REACT_VERSION}" "@fortune-sheet/core" "${CORE_URL}"

# --- Pack ------------------------------------------------------------------

log "packing tarballs into ${ARTIFACT_DIR}"
rm -rf "${ARTIFACT_DIR}"
mkdir -p "${ARTIFACT_DIR}"

for pkg in formula-parser core react; do
  (
    cd "packages/${pkg}"
    tgz="$(npm pack --silent)"
    mv "${tgz}" "${ARTIFACT_DIR}/"
  )
done

# Sanity-check that each expected tarball is present
for name in "${FORMULA_TGZ_NAME}" "${CORE_TGZ_NAME}" "${REACT_TGZ_NAME}"; do
  [ -f "${ARTIFACT_DIR}/${name}" ] || die "missing artifact: ${name}"
done

# --- Commit, tag, push -----------------------------------------------------

log "committing version bumps"
git add \
  packages/formula-parser/package.json \
  packages/core/package.json \
  packages/react/package.json

git commit -m "chore: release ${TAG}"

log "tagging ${TAG}"
git tag "${TAG}"

current_branch="$(git rev-parse --abbrev-ref HEAD)"
log "pushing ${current_branch} and tag"
git push origin "${current_branch}"
git push origin "${TAG}"

# --- Create GitHub release -------------------------------------------------

NOTES_FILE="$(mktemp)"
trap 'rm -f "${NOTES_FILE}"' EXIT

cat >"${NOTES_FILE}" <<EOF
LabXchange fork release ${TAG}.

Install in a consumer \`package.json\`:

\`\`\`json
"@fortune-sheet/formula-parser": "${FORMULA_URL}",
"@fortune-sheet/core": "${CORE_URL}",
"@fortune-sheet/react": "${REACT_URL}"
\`\`\`

See RELEASE.md in the repo for details.
EOF

log "creating GitHub release ${TAG}"
gh release create "${TAG}" \
  --repo "${OWNER}/${REPO}" \
  --title "${TAG}" \
  --notes-file "${NOTES_FILE}" \
  "${ARTIFACT_DIR}/${FORMULA_TGZ_NAME}" \
  "${ARTIFACT_DIR}/${CORE_TGZ_NAME}" \
  "${ARTIFACT_DIR}/${REACT_TGZ_NAME}"

# --- Summary ---------------------------------------------------------------

cat <<EOF

Released ${TAG}. Consumer package.json entries:

  "@fortune-sheet/formula-parser": "${FORMULA_URL}",
  "@fortune-sheet/core": "${CORE_URL}",
  "@fortune-sheet/react": "${REACT_URL}"

EOF
