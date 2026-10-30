// =============================================================================
// ntt_core_pipe.v — 流水化 NTT 内核 (v2.0 final)
// =============================================================================
// 架构: 7深地址管线 + 2深写回队列
//   地址: S_BFLY 推入 addr_pipe[6] → 7拍后到达 addr_pipe[0]
//   写回: bf_valid → A'+B' 推入 2深队列 → 每拍弹出1项写回 RAM
//   队列吸收背靠背到达 (最多2/BF, 每拍弹出1 = 稳态1/BF背压)
// =============================================================================

`include "params.vh"

module ntt_core_pipe (
    input  wire        clk, rst_n, start, mode,
    output reg         done,
    output wire [2:0]  dbg_state,
    output wire [7:0]  dbg_len, dbg_idx,
    output wire [2:0]  dbg_stage,
    output reg  [7:0]  ram_addr_a, ram_addr_b,
    output reg         ram_wen,
    output reg  [12:0] ram_din,
    input  wire [12:0] ram_dout_a, ram_dout_b
);

    localparam S_IDLE=0, S_LOAD=1, S_WAIT=2, S_BFLY=3, S_NEXT=4, S_DONE=5;
    reg [2:0] state;
    reg [7:0] len, idx;    reg len_inc;
    reg [6:0] k;           reg [8:0] start_addr;  reg [2:0] stage_cnt;

    wire [12:0] bf_a_out, bf_b_out;
    wire bf_valid;
    reg bf_mode, bf_start;
    reg [12:0] bf_a_in, bf_b_in, bf_z;
    wire [12:0] zeta_out;
    reg [6:0] zeta_addr;

    ntt_butterfly_unif u_bf (.clk(clk),.rst_n(rst_n),.mode(bf_mode),
        .a_in(bf_a_in),.b_in(bf_b_in),.z(bf_z),.valid(bf_start),
        .a_out(bf_a_out),.b_out(bf_b_out),.out_valid(bf_valid));
    zeta_rom u_zeta (.addr(zeta_addr), .data(zeta_out));

    // 地址管线 (7深)
    localparam PD=7;
    reg [7:0] ap_a [0:PD-1], ap_b [0:PD-1];

    // 写回队列 (2深: 存A'/B'地址+值+is_A标志)
    reg [1:0]   wq_cnt;               // 0,1,2
    reg [7:0]   wq_addr [0:1];
    reg [12:0]  wq_data [0:1];

    // 排水: 已发出但未捕获的蝶形数
    reg [8:0] in_flight;

    localparam SCALE_N_INV = 13'd128;
    reg s_in_scale;
    reg [7:0] scale_idx;

    assign dbg_state=state;
    assign dbg_len=len; assign dbg_idx=idx; assign dbg_stage=stage_cnt;

    always @(posedge clk or negedge rst_n) begin
        if (!rst_n) begin
            state<=S_IDLE; done<=0; ram_addr_a<=0; ram_addr_b<=0;
            ram_wen<=0; ram_din<=0; bf_start<=0;
            len<=128; len_inc<=0; k<=0; idx<=0; start_addr<=0; stage_cnt<=0;
            zeta_addr<=0; s_in_scale<=0; scale_idx<=0;
            in_flight<=0; wq_cnt<=0;
        end else begin
            done<=1'b0; bf_start<=1'b0; ram_wen<=1'b0;

            // ── 地址管线移位 ──
            {ap_a[0],ap_a[1],ap_a[2],ap_a[3],ap_a[4],ap_a[5],ap_a[6]} <=
             {ap_a[1],ap_a[2],ap_a[3],ap_a[4],ap_a[5],ap_a[6],8'd0};
            {ap_b[0],ap_b[1],ap_b[2],ap_b[3],ap_b[4],ap_b[5],ap_b[6]} <=
             {ap_b[1],ap_b[2],ap_b[3],ap_b[4],ap_b[5],ap_b[6],8'd0};

            // ── bf_valid: 推 A'+B' 到写回队列 ──
            if (bf_valid) begin
                // 推 A' (偶数位: is_A=虽然没有AB标志, 但先A后B就是先A后B)
                wq_addr[wq_cnt] <= ap_a[0];
                wq_data[wq_cnt] <= bf_a_out;
                // 推 B'
                wq_addr[wq_cnt+1] <= ap_b[0];
                wq_data[wq_cnt+1] <= bf_b_out;
                wq_cnt <= wq_cnt + 2;
                in_flight <= in_flight - 1;
            end

            // ── 写回队列弹出 (1/BF/周期, 先A后B) ──
            if (wq_cnt > 0 && state != S_IDLE) begin
                ram_addr_a <= wq_addr[0];
                ram_din    <= wq_data[0];
                ram_wen    <= 1'b1;
                // 移位队列
                wq_addr[0] <= wq_addr[1];
                wq_data[0] <= wq_data[1];
                wq_cnt     <= wq_cnt - 1;
            end

            case (state)
                S_IDLE: if (start) begin
                    s_in_scale<=0; scale_idx<=0; stage_cnt<=0; in_flight<=0; wq_cnt<=0;
                    if (mode) begin len<=2; len_inc<=1; k<=127; end
                    else      begin len<=128; len_inc<=0; k<=1; end
                    idx<=0; start_addr<=0; bf_mode<=mode;
                    state<=S_LOAD;
                end

                S_LOAD: begin
                    ram_addr_a <= s_in_scale ? 0 : start_addr[7:0]+idx;
                    ram_addr_b <= s_in_scale ? scale_idx : start_addr[7:0]+idx+len;
                    zeta_addr  <= s_in_scale ? 0 : k;
                    state <= S_WAIT;
                end

                S_WAIT: state <= S_BFLY;

                S_BFLY: begin
                    ap_a[PD-1] <= s_in_scale ? scale_idx : start_addr[7:0]+idx;
                    ap_b[PD-1] <= s_in_scale ? 8'd0 : start_addr[7:0]+idx+len;
                    if (s_in_scale) begin
                        bf_a_in<=13'd0; bf_b_in<=ram_dout_b;
                        bf_z<=SCALE_N_INV; bf_mode<=1'b0;
                    end else begin
                        bf_a_in<=ram_dout_a; bf_b_in<=ram_dout_b;
                        bf_z<=zeta_out;
                    end
                    bf_start <= 1'b1;
                    in_flight <= in_flight + 1;

                    if (s_in_scale) begin
                        if (scale_idx < 8'd255) begin
                            scale_idx<=scale_idx+1; state<=S_LOAD;
                        end else state<=S_NEXT;
                    end else if (idx < len-1) begin
                        idx<=idx+1; state<=S_LOAD;
                    end else state<=S_NEXT;
                end

                S_NEXT: begin
                    // 等 in_flight==0 且 wq_cnt==0
                    if (in_flight == 0 && wq_cnt == 0) begin
                        idx<=0;
                        if (s_in_scale) begin
                            s_in_scale<=0; state<=S_DONE;
                        end else if (start_addr + {1'b0,len,1'b0} < 9'd256) begin
                            start_addr<=start_addr+{1'b0,len,1'b0};
                            if (len_inc) k<=k-7'd1; else k<=k+7'd1;
                            state<=S_LOAD;
                        end else begin
                            stage_cnt<=stage_cnt+1;
                            if (len_inc) k<=k-7'd1; else k<=k+7'd1;
                            if (stage_cnt<3'd6) begin
                                if (len_inc) len<=len<<1; else len<=len>>1;
                                start_addr<=0; state<=S_LOAD;
                            end else begin
                                if (mode) begin
                                    s_in_scale<=1; scale_idx<=0; state<=S_LOAD;
                                end else state<=S_DONE;
                            end
                        end
                    end
                end

                S_DONE: begin done<=1'b1; state<=S_IDLE; end
                default: state<=S_IDLE;
            endcase
        end
    end

endmodule
