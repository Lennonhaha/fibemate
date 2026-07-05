// =============================================================================
// tb_ntt_compare.v — 原版 vs. 流水版 NTT 对比 testbench
// =============================================================================
// 实例1: tensor_ntt_scheduler #(.USE_PIPE(0)) — ntt_core 原版
// 实例2: tensor_ntt_scheduler #(.USE_PIPE(1)) — ntt_core_pipe 流水版
// 相同输入数据，测量单次 NTT 周期 + 正确性对比
// =============================================================================
`timescale 1ns / 1ps

module tb_ntt_compare;
    localparam CLK_PERIOD = 10;
    localparam N = 256;
    localparam DW = 13;

    reg clk, rst_n;
    integer cycle;
    integer errors;

    // ═══ 通道1: 原版 ═══
    reg  s1_start; wire s1_done; reg s1_mode;
    wire [3:0] s1_busy;
    reg  s1_load_en; reg [3:0] s1_load_poly, s1_load_size;
    reg  [7:0] s1_load_addr; reg [12:0] s1_load_data;
    reg  [3:0] s1_read_poly; reg [7:0] s1_read_addr;
    wire [12:0] s1_read_data;

    tensor_ntt_scheduler #(.NUM_POLYS(1), .USE_PIPE(0)) u_orig (
        .clk(clk), .rst_n(rst_n),
        .start_i(s1_start), .mode_i(s1_mode), .done_o(s1_done),
        .busy_poly(s1_busy),
        .load_en(s1_load_en), .load_poly(s1_load_poly),
        .load_addr(s1_load_addr), .load_data(s1_load_data),
        .load_size(s1_load_size),
        .read_poly(s1_read_poly), .read_addr(s1_read_addr),
        .read_data(s1_read_data), .dbg_state()
    );

    // ═══ 通道2: 流水版 ═══
    reg  s2_start; wire s2_done; reg s2_mode;
    wire [3:0] s2_busy;
    reg  s2_load_en; reg [3:0] s2_load_poly, s2_load_size;
    reg  [7:0] s2_load_addr; reg [12:0] s2_load_data;
    reg  [3:0] s2_read_poly; reg [7:0] s2_read_addr;
    wire [12:0] s2_read_data;

    tensor_ntt_scheduler #(.NUM_POLYS(1), .USE_PIPE(1)) u_pipe (
        .clk(clk), .rst_n(rst_n),
        .start_i(s2_start), .mode_i(s2_mode), .done_o(s2_done),
        .busy_poly(s2_busy),
        .load_en(s2_load_en), .load_poly(s2_load_poly),
        .load_addr(s2_load_addr), .load_data(s2_load_data),
        .load_size(s2_load_size),
        .read_poly(s2_read_poly), .read_addr(s2_read_addr),
        .read_data(s2_read_data), .dbg_state()
    );

    // ═══ 测试数据 ═══
    integer addr;
    integer orig_cycles, pipe_cycles;
    integer orig_start, orig_end, pipe_start, pipe_end;
    reg [12:0] test_coeff [0:N-1];
    reg [12:0] orig_result [0:N-1];
    reg [12:0] pipe_result [0:N-1];

    // 时钟
    initial begin clk = 0; forever #(CLK_PERIOD/2) clk = ~clk; end
    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) cycle <= 0; else cycle <= cycle + 1;
    end

    // ═══ 主测试 ═══
    initial begin
        $display("\n");
        $display("╔══════════════════════════════════════════════════════╗");
        $display("║  NTT CORE — original vs. pipelined                  ║");
        $display("╚══════════════════════════════════════════════════════╝");
        $display("");

        // ── 初始化 ──
        rst_n = 0; errors = 0;
        s1_start=0; s1_mode=0; s1_load_en=0; s1_load_poly=0;
        s1_load_addr=0; s1_load_data=0; s1_load_size=0;
        s1_read_poly=0; s1_read_addr=0;
        s2_start=0; s2_mode=0; s2_load_en=0; s2_load_poly=0;
        s2_load_addr=0; s2_load_data=0; s2_load_size=0;
        s2_read_poly=0; s2_read_addr=0;

        #(CLK_PERIOD * 5); rst_n = 1; #(CLK_PERIOD * 2);

        // ── 生成测试向量 ──
        $display("[INIT] Generating test vector (ramp)...");
        for (addr = 0; addr < N; addr = addr + 1)
            test_coeff[addr] = addr % 3329;

        // ── 加载到两个实例 ──
        $display("[LOAD] Loading coefficients...");
        for (addr = 0; addr < N; addr = addr + 1) begin
            @(posedge clk);
            s1_load_en <= 1; s1_load_poly <= 4'd0;
            s1_load_addr <= addr[7:0];
            s1_load_data <= test_coeff[addr];
            s1_load_size <= 4'd1;
            s2_load_en <= 1; s2_load_poly <= 4'd0;
            s2_load_addr <= addr[7:0];
            s2_load_data <= test_coeff[addr];
            s2_load_size <= 4'd1;
        end
        @(posedge clk);
        s1_load_en <= 0; s2_load_en <= 0;
        s1_load_size <= 4'd1; s2_load_size <= 4'd1;
        #(CLK_PERIOD * 3);

        // ═══════════════════════════════════════════════
        // 原版 NTT
        // ═══════════════════════════════════════════════
        $display("\n━━━ Original ntt_core ━━━");
        s1_mode <= 0;  // Forward
        @(posedge clk); orig_start = cycle;
        s1_start <= 1; @(posedge clk); s1_start <= 0;
        wait(s1_done);
        orig_end = cycle;
        orig_cycles = orig_end - orig_start;
        $display("  Done: %0d cycles", orig_cycles);

        // 归档结果
        s1_read_poly <= 4'd0;
        for (addr = 0; addr < N; addr = addr + 1) begin
            s1_read_addr <= addr[7:0];
            @(posedge clk); #1;
            orig_result[addr] = s1_read_data;
        end
        @(posedge clk);

        // 打印前 8 个结果
        $display("  Orig[0..7]: %0d %0d %0d %0d %0d %0d %0d %0d",
                 orig_result[0], orig_result[1], orig_result[2], orig_result[3],
                 orig_result[4], orig_result[5], orig_result[6], orig_result[7]);

        // ═══════════════════════════════════════════════
        // 流水版 NTT
        // ═══════════════════════════════════════════════
        $display("\n━━━ Pipelined ntt_core_pipe ━━━");
        s2_mode <= 0;  // Forward
        @(posedge clk); pipe_start = cycle;
        s2_start <= 1; @(posedge clk); s2_start <= 0;
        wait(s2_done);
        pipe_end = cycle;
        pipe_cycles = pipe_end - pipe_start;
        $display("  Done: %0d cycles", pipe_cycles);

        // 归档结果
        s2_read_poly <= 4'd0;
        for (addr = 0; addr < N; addr = addr + 1) begin
            s2_read_addr <= addr[7:0];
            @(posedge clk); #1;
            pipe_result[addr] = s2_read_data;
        end
        @(posedge clk);

        $display("  Pipe[0..7]: %0d %0d %0d %0d %0d %0d %0d %0d",
                 pipe_result[0], pipe_result[1], pipe_result[2], pipe_result[3],
                 pipe_result[4], pipe_result[5], pipe_result[6], pipe_result[7]);

        // ═══════════════════════════════════════════════
        // 对比
        // ═══════════════════════════════════════════════
        $display("\n━━━ Cross-validation ━━━");
        for (addr = 0; addr < N; addr = addr + 1) begin
            if (orig_result[addr] !== pipe_result[addr]) begin
                if (errors < 10)
                    $display("  MISMATCH addr=%0d: orig=%0d pipe=%0d",
                             addr, orig_result[addr], pipe_result[addr]);
                errors = errors + 1;
            end
        end

        // ═══════════════════════════════════════════════
        // 报告
        // ═══════════════════════════════════════════════
        $display("\n");
        $display("╔══════════════════════════════════════════════════════╗");
        $display("║  RESULTS                                            ║");
        $display("╠══════════════════════════════════════════════════════╣");
        $display("║  Original (ntt_core):       %6d cycles            ║", orig_cycles);
        $display("║  Pipelined (ntt_core_pipe): %6d cycles            ║", pipe_cycles);
        if (pipe_cycles > 0) begin
            $display("║  Speedup:                   %5.2f×                ║",
                     orig_cycles * 1.0 / pipe_cycles);
        end
        $display("║  Result errors:             %0d / %0d               ║",
                 errors, N);
        if (errors == 0)
            $display("║  STATUS:                    ALL MATCH              ║");
        else
            $display("║  STATUS:                    MISMATCHES!             ║");
        $display("╚══════════════════════════════════════════════════════╝");

        // 分析
        $display("\n[ANALYSIS]");
        $display("  Original: %0d cycles/BF (avg over %0d butterflies)",
                 orig_cycles / (N/2), N/2);
        $display("  Pipelined: %0d cycles/BF (avg over %0d butterflies)",
                 pipe_cycles / (N/2), N/2);
        $display("  Improvement: %0d cycles saved (%0d%%)",
                 orig_cycles - pipe_cycles,
                 (orig_cycles - pipe_cycles) * 100 / orig_cycles);

        $display("\n[DONE] @ cycle %0d", cycle);
        $finish;
    end

    // 看门狗
    initial begin #(CLK_PERIOD * 100000); $display("\n[TIMEOUT]"); $finish; end

    // VCD
    initial begin $dumpfile("tb_ntt_compare.vcd"); $dumpvars(0, tb_ntt_compare); end
endmodule
