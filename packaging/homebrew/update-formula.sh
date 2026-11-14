#!/bin/sh
# Usage: packaging/homebrew/update-formula.sh 0.6.0 > Formula/branchit.rb
# Prints the formula for a published npm version with its real checksum.
set -eu
version="$1"
url="https://registry.npmjs.org/branchit/-/branchit-${version}.tgz"
sha=$(curl -fsSL "$url" | shasum -a 256 | cut -d' ' -f1)
here=$(dirname "$0")
sed -e "s|branchit-[0-9][0-9.]*\.tgz|branchit-${version}.tgz|" \
    -e "s|REPLACE_WITH_SHA256_OF_THE_NPM_TARBALL|${sha}|" \
    -e "s|sha256 \"[0-9a-f]\{64\}\"|sha256 \"${sha}\"|" \
    "$here/branchit.rb"
