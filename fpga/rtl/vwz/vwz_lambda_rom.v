// =============================================================================
// vwz_lambda_rom.v — VWZ λ-Power Table BRAM (Read-Only)
// =============================================================================
// Stores precomputed λ_{i1,2}^j and λ_{i1,3}^j for all i1∈[0,N-1], j∈[0,M-1].
//
// Organization:
//   dim=0 (λ_2): addr = i1 * M + j               → offset 0..N*M-1
//   dim=1 (λ_3): addr = N*M + i1 * M + j         → offset N*M..2*N*M-1
//
// Parameters:
//   N = 2k+1, M = k+1
//   k=8 → N=17, M=9, depth=306, 13-bit wide
//
// Initialized from vwz_lambda_pows_k8.hex via $readmemh.
//
// Copyright 2026 FIBEMATE
// MIT License
// SPDX-License-Identifier: MIT

`include "params.vh"

module vwz_lambda_rom #(
    parameter K = 8,
    parameter N = 2*K + 1,        // 17
    parameter M = K + 1,          // 9
    parameter TOTAL = 2 * N * M,  // 306
    parameter ADDR_W = 9          // ceil(log2(306)) = 9
)(
    input  wire                clk,
    input  wire [ADDR_W-1:0]  addr,      // {dim(1bit), i1(5bit), j(4bit)} or flat
    input  wire [1:0]          dim_sel,    // 0=λ_2, 1=λ_3
    input  wire [7:0]           i1_sel,    // 0..16
    input  wire [7:0]           j_sel,     // 0..8
    output wire [12:0]         data        // λ^j value (13-bit)
);

    // BRAM storage
    (* ram_style = "block" *) reg [12:0] rom [0:TOTAL-1];

    // Initialize from hex file
    initial begin
        $readmemh("vwz_lambda_pows_k8.hex", rom);
    end

    // Address computation: flat = dim*N*M + i1*M + j
    wire [ADDR_W-1:0] flat_addr;
    assign flat_addr = dim_sel * (N * M) + i1_sel * M + j_sel;

    // Synchronous read (1-cycle latency, standard BRAM behavior)
    reg [12:0] data_reg;
    always @(posedge clk) begin
        data_reg <= rom[flat_addr];
    end
    assign data = data_reg;

endmodule
