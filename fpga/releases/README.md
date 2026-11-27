# FPGA bitstreams (v4)

The 13 prebuilt `.bit` files are no longer stored in the source tree: a binary
cannot be reviewed, and OpenSSF's Binary-Artifacts check treats committed
bitstreams as an auditability gap. They are published as release assets:

  https://github.com/Lennonhaha/fibemate/releases/tag/fpga-bitstreams-v4

The RTL under `fpga/rtl/` is the source of truth and builds every one of them.
These are development artifacts with no security claim; see `SECURITY.md`.

Integrity: the SHA-256 values below are the ones recorded in the 2026-10-28 TSR
manifest (`docs/tsa/2026-10-28-retire-ml-kem-768-td/SHA256SUMS`). Verify a
downloaded asset with `sha256sum -c` against this list.

```
d8687daf8fee5996f5181e694201b555301a9abdffbb695d3cb76beba56ee2fb  fibemate_fpga_top.bit
60eb3856cdb4ecc0e6b94cb6d9abb24260488c4d8950634dce652d753df8394c  fibemate_fpga_v5.bit
be5857b6470cb8f8e96d7bee4cfba5aa2d191a955d2979bc9a32ddafb06897ed  fibemate_fpga_v5_2.bit
51468cfa1c25153aa56a053e91f430d44d89ed28270f822ed652d52feb782bf6  fibemate_fpga_v5_2_debug.bit
ea4d17b65055647be123ceeefb71365c5547c9009877a54ea9f39e25ba5c4847  fibemate_fpga_v5_2b.bit
4d234ef3dcac9d5dbda3bb32fedca53cd4f3e852565ebd4b4b5c80c789d26ccf  fibemate_fpga_v5_3.bit
940b3c1e269c11321c708cfff6d52efd8b5d9cc997920a02436f4e750cbd2079  fibemate_fpga_v5_debug.bit
92888a08f735b0b226b687d90f6ca76a86706dbdd7976528ced646c07173d6aa  fibemate_fpga_v5_drcfix.bit
3842b522f14641ad68c1af16bba965550ab4191aca14602ed80459c89734ef1f  fibemate_fpga_v5_gpio.bit
b59dc3dce47ca3329dbd54cb2b0c1b2c8645c89f406fac41403fa0685ab5838c  fibemate_fpga_v5_j19clk.bit
e0268f9d817382d0f6f548675ac8bcc9450b071d3a72c227f1732eadaa892368  fibemate_fpga_v5_m18.bit
d8687daf8fee5996f5181e694201b555301a9abdffbb695d3cb76beba56ee2fb  fibemate_fpga_v5_n19.bit
a16232619a88293e2ebbdc69732f5d1a94c149f5f5340c2bfd21ce3178c86e8f  fibemate_fpga_v5_v2u2.bit
```
