//-----------------------------------------------------------------------------
// nonlinear_layer.v — LG v2.1 v3.0 非线性层
// 功能：LFSR + S-box 混合非线性变换
// 8-bit 数据通路，可综合，无行为级构造
//-----------------------------------------------------------------------------

module nonlinear_layer (
    input  wire        clk,
    input  wire        rst_n,
    input  wire [7:0]  data_in,
    output reg  [7:0]  data_out,
    input  wire [63:0] seed,
    input  wire        valid_in,
    output reg         valid_out,
    input  wire        bypass_linear   // 1: 直通线性路径, 0: 经过 S-box
);

//=============================================================================
// 参数定义
//=============================================================================
localparam PIPELINE_STAGES = 3;

//=============================================================================
// 内部信号
//=============================================================================
reg [7:0]  sbox_out;
reg [7:0]  lfsr_state;
reg [7:0]  lfsr_out;
reg [7:0]  offset_reg;
reg [7:0]  pipeline_data [0:PIPELINE_STAGES-1];
reg        pipeline_valid [0:PIPELINE_STAGES-1];
reg [2:0]  stage_idx;

// LFSR 用于从 seed 生成 S-box 选择偏移
reg [15:0] lfsr_16bit;
wire [7:0] lfsr_derived_offset;

//=============================================================================
// AES S-box (256 entries)
//=============================================================================
reg [7:0] sbox_lookup [0:255];

initial begin
    // AES 标准 S-box
    sbox_lookup[0]   = 8'h63; sbox_lookup[1]   = 8'h7c; sbox_lookup[2]   = 8'h77; sbox_lookup[3]   = 8'h7b;
    sbox_lookup[4]   = 8'hf2; sbox_lookup[5]   = 8'h6b; sbox_lookup[6]   = 8'h6f; sbox_lookup[7]   = 8'hc5;
    sbox_lookup[8]   = 8'h30; sbox_lookup[9]   = 8'h01; sbox_lookup[10]  = 8'h67; sbox_lookup[11]  = 8'h2b;
    sbox_lookup[12]  = 8'hfe; sbox_lookup[13]  = 8'hd7; sbox_lookup[14]  = 8'hab; sbox_lookup[15]  = 8'h76;
    sbox_lookup[16]  = 8'hca; sbox_lookup[17]  = 8'h82; sbox_lookup[18]  = 8'hc9; sbox_lookup[19]  = 8'h7d;
    sbox_lookup[20]  = 8'hfa; sbox_lookup[21]  = 8'h59; sbox_lookup[22]  = 8'h47; sbox_lookup[23]  = 8'hf0;
    sbox_lookup[24]  = 8'had; sbox_lookup[25]  = 8'hd4; sbox_lookup[26]  = 8'ha2; sbox_lookup[27]  = 8'haf;
    sbox_lookup[28]  = 8'h9c; sbox_lookup[29]  = 8'ha4; sbox_lookup[30]  = 8'h72; sbox_lookup[31]  = 8'hc0;
    sbox_lookup[32]  = 8'hb7; sbox_lookup[33]  = 8'hfd; sbox_lookup[34]  = 8'h93; sbox_lookup[35]  = 8'h26;
    sbox_lookup[36]  = 8'h36; sbox_lookup[37]  = 8'h3f; sbox_lookup[38]  = 8'hf7; sbox_lookup[39]  = 8'hcc;
    sbox_lookup[40]  = 8'h34; sbox_lookup[41]  = 8'ha5; sbox_lookup[42]  = 8'he5; sbox_lookup[43]  = 8'hf1;
    sbox_lookup[44]  = 8'h71; sbox_lookup[45]  = 8'hd8; sbox_lookup[46]  = 8'h31; sbox_lookup[47]  = 8'h15;
    sbox_lookup[48]  = 8'h04; sbox_lookup[49]  = 8'hc7; sbox_lookup[50]  = 8'h23; sbox_lookup[51]  = 8'hc3;
    sbox_lookup[52]  = 8'h18; sbox_lookup[53]  = 8'h96; sbox_lookup[54]  = 8'h05; sbox_lookup[55]  = 8'h9a;
    sbox_lookup[56]  = 8'h07; sbox_lookup[57]  = 8'h12; sbox_lookup[58]  = 8'h80; sbox_lookup[59]  = 8'he2;
    sbox_lookup[60]  = 8'heb; sbox_lookup[61]  = 8'h27; sbox_lookup[62]  = 8'hb2; sbox_lookup[63]  = 8'h75;
    sbox_lookup[64]  = 8'h09; sbox_lookup[65]  = 8'h83; sbox_lookup[66]  = 8'h2c; sbox_lookup[67]  = 8'h1a;
    sbox_lookup[68]  = 8'h1b; sbox_lookup[69]  = 8'h6e; sbox_lookup[70]  = 8'h5a; sbox_lookup[71]  = 8'ha0;
    sbox_lookup[72]  = 8'h52; sbox_lookup[73]  = 8'h3b; sbox_lookup[74]  = 8'hd6; sbox_lookup[75]  = 8'hb3;
    sbox_lookup[76]  = 8'h29; sbox_lookup[77]  = 8'he3; sbox_lookup[78]  = 8'h2f; sbox_lookup[79]  = 8'h84;
    sbox_lookup[80]  = 8'h53; sbox_lookup[81]  = 8'hd1; sbox_lookup[82]  = 8'h00; sbox_lookup[83]  = 8'hed;
    sbox_lookup[84]  = 8'h20; sbox_lookup[85]  = 8'hfc; sbox_lookup[86]  = 8'hb1; sbox_lookup[87]  = 8'h5b;
    sbox_lookup[88]  = 8'h6a; sbox_lookup[89]  = 8'hcb; sbox_lookup[90]  = 8'hbe; sbox_lookup[91]  = 8'h39;
    sbox_lookup[92]  = 8'h4a; sbox_lookup[93]  = 8'h4c; sbox_lookup[94]  = 8'h58; sbox_lookup[95]  = 8'hcf;
    sbox_lookup[96]  = 8'hd0; sbox_lookup[97]  = 8'hef; sbox_lookup[98]  = 8'haa; sbox_lookup[99]  = 8'hfb;
    sbox_lookup[100] = 8'h43; sbox_lookup[101] = 8'h4d; sbox_lookup[102] = 8'h33; sbox_lookup[103] = 8'h85;
    sbox_lookup[104] = 8'h45; sbox_lookup[105] = 8'hf9; sbox_lookup[106] = 8'h02; sbox_lookup[107] = 8'h7f;
    sbox_lookup[108] = 8'h50; sbox_lookup[109] = 8'h3c; sbox_lookup[110] = 8'h9f; sbox_lookup[111] = 8'ha8;
    sbox_lookup[112] = 8'h51; sbox_lookup[113] = 8'ha3; sbox_lookup[114] = 8'h40; sbox_lookup[115] = 8'h8f;
    sbox_lookup[116] = 8'h92; sbox_lookup[117] = 8'h9d; sbox_lookup[118] = 8'h38; sbox_lookup[119] = 8'hf5;
    sbox_lookup[120] = 8'hbc; sbox_lookup[121] = 8'hb6; sbox_lookup[122] = 8'hda; sbox_lookup[123] = 8'h21;
    sbox_lookup[124] = 8'h10; sbox_lookup[125] = 8'hff; sbox_lookup[126] = 8'hf3; sbox_lookup[127] = 8'hd2;
    sbox_lookup[128] = 8'hcd; sbox_lookup[129] = 8'h0c; sbox_lookup[130] = 8'h13; sbox_lookup[131] = 8'hec;
    sbox_lookup[132] = 8'h5f; sbox_lookup[133] = 8'h97; sbox_lookup[134] = 8'h44; sbox_lookup[135] = 8'h17;
    sbox_lookup[136] = 8'hc4; sbox_lookup[137] = 8'ha7; sbox_lookup[138] = 8'h7e; sbox_lookup[139] = 8'h3d;
    sbox_lookup[140] = 8'h64; sbox_lookup[141] = 8'h5d; sbox_lookup[142] = 8'h19; sbox_lookup[143] = 8'h73;
    sbox_lookup[144] = 8'h60; sbox_lookup[145] = 8'h81; sbox_lookup[146] = 8'h4f; sbox_lookup[147] = 8'hdc;
    sbox_lookup[148] = 8'h22; sbox_lookup[149] = 8'h2a; sbox_lookup[150] = 8'h90; sbox_lookup[151] = 8'h88;
    sbox_lookup[152] = 8'h46; sbox_lookup[153] = 8'hee; sbox_lookup[154] = 8'hb8; sbox_lookup[155] = 8'h14;
    sbox_lookup[156] = 8'hde; sbox_lookup[157] = 8'h5e; sbox_lookup[158] = 8'h0b; sbox_lookup[159] = 8'hdb;
    sbox_lookup[160] = 8'he0; sbox_lookup[161] = 8'h32; sbox_lookup[162] = 8'h3a; sbox_lookup[163] = 8'h0a;
    sbox_lookup[164] = 8'h49; sbox_lookup[165] = 8'h06; sbox_lookup[166] = 8'h24; sbox_lookup[167] = 8'h5c;
    sbox_lookup[168] = 8'hc2; sbox_lookup[169] = 8'hd3; sbox_lookup[170] = 8'hac; sbox_lookup[171] = 8'h62;
    sbox_lookup[172] = 8'h91; sbox_lookup[173] = 8'h95; sbox_lookup[174] = 8'he4; sbox_lookup[175] = 8'h79;
    sbox_lookup[176] = 8'he7; sbox_lookup[177] = 8'hc8; sbox_lookup[178] = 8'h37; sbox_lookup[179] = 8'h6d;
    sbox_lookup[180] = 8'h8d; sbox_lookup[181] = 8'hd5; sbox_lookup[182] = 8'h4e; sbox_lookup[183] = 8'ha9;
    sbox_lookup[184] = 8'h6c; sbox_lookup[185] = 8'h56; sbox_lookup[186] = 8'hf4; sbox_lookup[187] = 8'hea;
    sbox_lookup[188] = 8'h65; sbox_lookup[189] = 8'h7a; sbox_lookup[190] = 8'hae; sbox_lookup[191] = 8'h08;
    sbox_lookup[192] = 8'hba; sbox_lookup[193] = 8'h78; sbox_lookup[194] = 8'h25; sbox_lookup[195] = 8'h2e;
    sbox_lookup[196] = 8'h1c; sbox_lookup[197] = 8'ha6; sbox_lookup[198] = 8'hb4; sbox_lookup[199] = 8'hc6;
    sbox_lookup[200] = 8'he8; sbox_lookup[201] = 8'hdd; sbox_lookup[202] = 8'h74; sbox_lookup[203] = 8'h1f;
    sbox_lookup[204] = 8'h4b; sbox_lookup[205] = 8'hbd; sbox_lookup[206] = 8'h8b; sbox_lookup[207] = 8'h8a;
    sbox_lookup[208] = 8'h70; sbox_lookup[209] = 8'h3e; sbox_lookup[210] = 8'hb5; sbox_lookup[211] = 8'h66;
    sbox_lookup[212] = 8'h48; sbox_lookup[213] = 8'h03; sbox_lookup[214] = 8'hf6; sbox_lookup[215] = 8'h0e;
    sbox_lookup[216] = 8'h61; sbox_lookup[217] = 8'h35; sbox_lookup[218] = 8'h57; sbox_lookup[219] = 8'hb9;
    sbox_lookup[220] = 8'h86; sbox_lookup[221] = 8'hc1; sbox_lookup[222] = 8'h1d; sbox_lookup[223] = 8'h9e;
    sbox_lookup[224] = 8'he1; sbox_lookup[225] = 8'hf8; sbox_lookup[226] = 8'h98; sbox_lookup[227] = 8'h11;
    sbox_lookup[228] = 8'h69; sbox_lookup[229] = 8'hd9; sbox_lookup[230] = 8'h8e; sbox_lookup[231] = 8'h94;
    sbox_lookup[232] = 8'h9b; sbox_lookup[233] = 8'h1e; sbox_lookup[234] = 8'h87; sbox_lookup[235] = 8'he9;
    sbox_lookup[236] = 8'hce; sbox_lookup[237] = 8'h55; sbox_lookup[238] = 8'h28; sbox_lookup[239] = 8'hdf;
    sbox_lookup[240] = 8'h8c; sbox_lookup[241] = 8'ha1; sbox_lookup[242] = 8'h89; sbox_lookup[243] = 8'h0d;
    sbox_lookup[244] = 8'hbf; sbox_lookup[245] = 8'he6; sbox_lookup[246] = 8'h42; sbox_lookup[247] = 8'h68;
    sbox_lookup[248] = 8'h41; sbox_lookup[249] = 8'h99; sbox_lookup[250] = 8'h2d; sbox_lookup[251] = 8'h0f;
    sbox_lookup[252] = 8'hb0; sbox_lookup[253] = 8'h54; sbox_lookup[254] = 8'hbb; sbox_lookup[255] = 8'h16;
end

//=============================================================================
// LFSR 初始化与更新
// 从 seed 中提取初始状态，每个周期推进 LFSR
//=============================================================================
assign lfsr_derived_offset = lfsr_16bit[7:0];

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        // 从 seed 初始化 LFSR
        lfsr_16bit <= seed[15:0];
        offset_reg <= seed[23:16];
    end else begin
        // Galois LFSR: x^16 + x^14 + x^13 + x^11 + 1
        lfsr_16bit[0]  <= lfsr_16bit[15] ^ lfsr_16bit[0];
        lfsr_16bit[1]  <= lfsr_16bit[0];
        lfsr_16bit[2]  <= lfsr_16bit[1];
        lfsr_16bit[3]  <= lfsr_16bit[2];
        lfsr_16bit[4]  <= lfsr_16bit[3];
        lfsr_16bit[5]  <= lfsr_16bit[4];
        lfsr_16bit[6]  <= lfsr_16bit[5];
        lfsr_16bit[7]  <= lfsr_16bit[6];
        lfsr_16bit[8]  <= lfsr_16bit[7];
        lfsr_16bit[9]  <= lfsr_16bit[8];
        lfsr_16bit[10] <= lfsr_16bit[9];
        lfsr_16bit[11] <= lfsr_16bit[10] ^ lfsr_16bit[15];
        lfsr_16bit[12] <= lfsr_16bit[11];
        lfsr_16bit[13] <= lfsr_16bit[12] ^ lfsr_16bit[15];
        lfsr_16bit[14] <= lfsr_16bit[13] ^ lfsr_16bit[15];
        lfsr_16bit[15] <= lfsr_16bit[14];
    end
end

//=============================================================================
// S-box 组合逻辑查找
//=============================================================================
always @(*) begin
    sbox_out = sbox_lookup[data_in];
end

//=============================================================================
// 流水线处理
// Stage 0: S-box 查找
// Stage 1: XOR offset
// Stage 2: 输出 MUX
//=============================================================================
integer i;

always @(posedge clk or negedge rst_n) begin
    if (!rst_n) begin
        for (i = 0; i < PIPELINE_STAGES; i = i + 1) begin
            pipeline_data[i]  <= 8'h00;
            pipeline_valid[i] <= 1'b0;
        end
        valid_out <= 1'b0;
        data_out  <= 8'h00;
    end else begin
        // Stage 0: S-box 查找
        pipeline_data[0]  <= sbox_out;
        pipeline_valid[0] <= valid_in;
        
        // Stage 1: XOR offset
        pipeline_data[1]  <= pipeline_data[0] ^ lfsr_derived_offset;
        pipeline_valid[1] <= pipeline_valid[0];
        
        // Stage 2: 输出 MUX (线性/非线性选择)
        if (bypass_linear) begin
            pipeline_data[2]  <= data_in;  // 直通模式
        end else begin
            pipeline_data[2]  <= pipeline_data[1];  // 经过 S-box
        end
        pipeline_valid[2] <= pipeline_valid[1];
        
        // 输出寄存
        data_out  <= pipeline_data[2];
        valid_out <= pipeline_valid[2];
    end
end

endmodule
