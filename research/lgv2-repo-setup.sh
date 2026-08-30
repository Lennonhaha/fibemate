#!/bin/bash
set -e

echo "=== Step 1: Create /opt/lgv2-repo ==="
mkdir -p /opt/lgv2-repo

echo "=== Step 2: Copy files (excluding target/, pkg/, __pycache__/) ==="
rsync -av --exclude=target/ --exclude=pkg/ --exclude='__pycache__' /opt/fibemate-full/lgv2/ /opt/lgv2-repo/
echo "Copy done"

echo "=== Files in repo ==="
find /opt/lgv2-repo -type f | sort

echo "=== Step 3: Init git and commit ==="
cd /opt/lgv2-repo
git init
git config user.email "ci@fibemate.local"
git config user.name "Fibemate CI"
git add -A
git commit -m "feat: LG v2.1/v2.2 initial"

echo "=== Step 4: Create git bundle ==="
git bundle create /opt/lgv2-repo.bundle --all

echo "=== Step 5: Verify log ==="
git log --oneline

echo "=== Step 6: Bundle size ==="
ls -lh /opt/lgv2-repo.bundle
du -h /opt/lgv2-repo.bundle
