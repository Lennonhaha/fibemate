#!/bin/bash
cd /opt/lgv2-repo
mkdir -p rust/src

# Install new modules
cp _lgv2_dynamic_path.rs   rust/src/dynamic_path.rs
cp _lgv2_control_flow.rs   rust/src/control_flow.rs
cp _lgv2_crypto_binding.rs rust/src/crypto_binding.rs
cp _lgv2_secure_cleanup.rs rust/src/secure_cleanup.rs
cp _lgv2_lib_rs            rust/lib.rs
cp _lgv2_Cargo_toml         rust/Cargo.toml

# Clean up temp files
rm -f _lgv2_*.rs _lgv2_Cargo_toml

echo "=== rust/src/ ==="
ls -la rust/src/
echo ""
echo "=== Cargo.toml ==="
head -20 rust/Cargo.toml
echo ""
echo "=== lib.rs line count ==="
wc -l rust/lib.rs
