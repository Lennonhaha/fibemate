// SPDX-License-Identifier: GPL-3.0-only
// Copyright (c) 2026 FIBEMATE Contributors
// =============================================================================
// uart_rx 行为级测�?v2 �?Node.js
// =============================================================================
// 用法: node scripts/test-uart-rx.js
// =============================================================================

'use strict';

const PASS = (n, msg) => console.log(`  PASS #${n}: ${msg}`);
const FAIL = (n, msg, detail) => {
    console.error(`  FAIL #${n}: ${msg}`);
    if (detail) console.error(`         ${detail}`);
    process.exitCode = 1;
};

const CLK_FREQ = 50_000_000;
const BAUD = 115_200;
const BIT_PERIOD = Math.round(CLK_FREQ / BAUD);
const HALF_BIT = Math.round(BIT_PERIOD / 2);

let clk = 0, rst_n = 0, rx_line = 1;
let data_out = 0;
let data_valid_captured = 0;  // latched capture

// DUT
const S_IDLE = 0, S_START = 1, S_RECEIVE = 2, S_STOP = 3;
let state = S_IDLE, bit_idx = 0, bit_cnt = 0, shift_reg = 0;

function tick(n = 1) {
    for (let i = 0; i < n; i++) {
        clk++;
        let pulse = 0;
        if (!rst_n) {
            state = S_IDLE; bit_idx = 0; bit_cnt = 0; shift_reg = 0;
            data_out = 0;
            continue;
        }
        switch (state) {
            case S_IDLE:
                if (rx_line === 0) { state = S_START; bit_cnt = 0; }
                break;
            case S_START:
                if (bit_cnt < HALF_BIT - 1) { bit_cnt++; }
                else {
                    if (rx_line === 0) { state = S_RECEIVE; bit_idx = 0; bit_cnt = 0; }
                    else { state = S_IDLE; }
                }
                break;
            case S_RECEIVE:
                if (bit_cnt < BIT_PERIOD - 1) { bit_cnt++; }
                else {
                    bit_cnt = 0;
                    shift_reg = (shift_reg & ~(1 << bit_idx)) | (rx_line << bit_idx);
                    if (bit_idx < 7) bit_idx++; else state = S_STOP;
                }
                break;
            case S_STOP:
                if (bit_cnt < BIT_PERIOD - 1) { bit_cnt++; }
                else {
                    if (rx_line === 1) { data_out = shift_reg; pulse = 1; }
                    state = S_IDLE;
                }
                break;
        }
        if (pulse) data_valid_captured = 1;
    }
}

function assert_idle() {
    if (state !== S_IDLE) FAIL(-1, 'DUT not idle', `state=${state}`);
}

function set_rx(val) { rx_line = val ? 1 : 0; }

// 发送一�? start(0) + 8 data(LSB) + stop(1), 每段 BIT_PERIOD 周期
// 返回后清�?capture 标志, 等待 data_valid 脉冲再额�?tick 2 拍确保采�?function send_byte(byte) {
    assert_idle();
    data_valid_captured = 0;
    set_rx(0); tick(BIT_PERIOD);            // start
    for (let b = 0; b < 8; b++) {
        set_rx((byte >> b) & 1);
        tick(BIT_PERIOD);
    }
    set_rx(1); tick(BIT_PERIOD);            // stop
    tick(20);  // 额外空闲周期确保脉冲已捕�?}

function send_glitch(cycles) {
    assert_idle();
    data_valid_captured = 0;
    set_rx(0); tick(cycles);
    set_rx(1); tick(50);
}

function reset() {
    rst_n = 0; rx_line = 1; tick(10);
    rst_n = 1; tick(10);
    data_valid_captured = 0;
    assert_idle();
}

// =============================================================================
// Tests
// =============================================================================
reset();
let ok = false;

// #1: 0x55
send_byte(0x55);
if (data_valid_captured && data_out === 0x55) PASS(1, '0x55 received');
else FAIL(1, '0x55 mismatch', `out=0x${data_out.toString(16)} valid=${data_valid_captured}`);

// #2: 0xA3
send_byte(0xA3);
if (data_valid_captured && data_out === 0xA3) PASS(2, '0xA3 received');
else FAIL(2, '0xA3 mismatch', `out=0x${data_out.toString(16)}`);

// #3: 0x00
send_byte(0x00);
if (data_valid_captured && data_out === 0x00) PASS(3, '0x00 received');
else FAIL(3, '0x00 mismatch', `out=0x${data_out.toString(16)}`);

// #4: 0xFF
send_byte(0xFF);
if (data_valid_captured && data_out === 0xFF) PASS(4, '0xFF received');
else FAIL(4, '0xFF mismatch', `out=0x${data_out.toString(16)}`);

// #5: 毛刺过滤
reset();
send_glitch(Math.round(HALF_BIT / 3));
if (!data_valid_captured) PASS(5, 'glitch filtered');
else FAIL(5, 'glitch not filtered');

// #6: 停止位错�?reset();
data_valid_captured = 0;
set_rx(0); tick(BIT_PERIOD);
for (let b = 0; b < 8; b++) { set_rx((0x33 >> b) & 1); tick(BIT_PERIOD); }
set_rx(0); tick(BIT_PERIOD);  // bad stop
tick(20);
if (!data_valid_captured) PASS(6, 'frame error: bad stop rejected');
else FAIL(6, 'frame error missed');

// #7: 连续 4 字节
reset();
for (let i = 0; i < 4; i++) { send_byte(0x41); }
ok = (data_valid_captured && data_out === 0x41);
if (ok) PASS(7, '4x 0x41 consecutive');
else FAIL(7, 'consecutive mismatch', `out=0x${data_out.toString(16)}`);

// #8: 0xDEADBEEF �?reset();
ok = true;
for (const b of [0xDE, 0xAD, 0xBE, 0xEF]) {
    send_byte(b);
    if (!data_valid_captured || data_out !== b) { ok = false; break; }
}
if (ok) PASS(8, 'stream 0xDEADBEEF');
else FAIL(8, 'stream mismatch', `out=0x${data_out.toString(16)}`);

// #9: LSB-first 验证 �?0x01 (�?bit0=1)
reset();
send_byte(0x01);
if (data_valid_captured && data_out === 0x01) PASS(9, 'LSB-first 0x01');
else FAIL(9, 'LSB-first', `out=0x${data_out.toString(16)}`);

// #10: LSB-first �?0x80 (�?bit7=1)
reset();
send_byte(0x80);
if (data_valid_captured && data_out === 0x80) PASS(10, 'LSB-first 0x80');
else FAIL(10, 'LSB-first MSB', `out=0x${data_out.toString(16)}`);

if (!process.exitCode) console.log(`\n�?ALL 10 TESTS PASSED`);
else console.error(`\n�?FAILURES: ${process.exitCode}`);
process.exit(process.exitCode ? 1 : 0);
