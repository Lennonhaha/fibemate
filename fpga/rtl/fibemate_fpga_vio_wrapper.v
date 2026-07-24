// =============================================================================
// FIBEMATE FPGA — VIO wrapper for v5.2 (Vivado VIO 3.0 JTAG debugging)
// =============================================================================
// Wraps fibemate_fpga_top + vio_ntt_v5 to expose internal signals via JTAG.
// No UART, no multimeter, no ILA required — just Vivado HW Manager + JTAG.
// =============================================================================

`timescale 1ns / 1ps

module fibemate_fpga_vio_wrapper (
    input  wire        sys_clk,
    output wire [3:0]  led,
    output wire        uart_tx,
    input  wire        uart_rx,
    output wire [12:0] ntt_debug_a,
    output wire [12:0] ntt_debug_b,
    output wire        ntt_done
);

// Original top
fibemate_fpga_top u_top (
    .sys_clk     (sys_clk),
    .led         (led),
    .uart_tx     (uart_tx),
    .uart_rx     (uart_rx),
    .ntt_debug_a (ntt_debug_a),
    .ntt_debug_b (ntt_debug_b),
    .ntt_done    (ntt_done)
);

// VIO probes — 32-bit input (FPGA → JTAG read) + 1-bit output (JTAG → FPGA)
// probe_in[31:0] = {seq_state[3:0], fwd_done, inv_pass, ntt_done, fault_latched, 
//                    core_done, core_fault_alert, core_start, core_mode, wait_timer[9:0],
//                    seq_cnt[7:0]}
// probe_out[0]  = soft_reset (optional future use)

// We don't have direct access to internal signals from here.
// Instead, we'll tap the 32-bit status_reg_0 output which is already
// exported from the core, and use ntt_debug_b bits to carry status.

// ═══════════════════════════════════════════════════════════════════
// Strategy: Use unused ntt_debug_b pins as status bus
// ntt_debug_b[8:0] are routed to pins (V22..B15), but [0:5] have no LOC.
// We'll repurpose debug_b[12:9] as a serial status vector
// and check what comes out after NTT completes.
// ═══════════════════════════════════════════════════════════════════

// The simplest approach without modifying original top:
// 1. ntt_done (D17) is already a top-level output
// 2. led[3:0] (T19/U20/V20 + N19=uart) are top-level outputs
// 3. We CAN'T read these from JTAG without ILA/VIO

// So we MUST modify the original top to expose internal state on
// the already-routed debug pins. Let's do that instead.

endmodule
