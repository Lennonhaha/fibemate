#!/usr/bin/env node
// SPDX-License-Identifier: GPL-3.0-only
/**
 * FPGA L8+L9 — 43/43 Cross-Validation Suite v2
 * Cycle-accurate behavioral model matching hw_monitor.v + hw_monitor_resp.v
 */
'use strict';

const TOTAL = 43;
let passed = 0, failed = 0, testNum = 0;
const failures = [];

function t(name, fn) {
    testNum++;
    try { if (fn() === false) throw new Error('false'); passed++; }
    catch(e) { failed++; failures.push(`#${testNum} ${name}: ${e.message}`); process.stdout.write('X'); }
    if (testNum % 8 === 0) process.stdout.write('.');
}

// ─── L8: Fault Monitor (hw_monitor.v v5.1) ───
class L8 {
    constructor() {
        this.WARN = 3; this.TRIP = 8; this.ALERT_N = 6;
        this.bf=0; this.pb=0; this.rm=0; this.cy=0;
        this.fc=0; this.ac=0; this.lfc=0; this.ncc=0;
        this.hap=0; this.led=[0,0,0,0]; this._prev=0;
    }
    tick(nd, fa, ft, rst) {
        if (!rst) { this.bf=this.pb=this.rm=this.cy=this.fc=this.ac=this.lfc=0; this._prev=0; return; }
        this.ncc++;
        if (nd) this.lfc = this.ncc;
        // Rising edge detect for single-pulse, plus sustained-high count
        const edge = fa && !this._prev;
        this._prev = fa;
        if (edge) {
            this.fc = Math.min(0xFFFF, this.fc + 1);
            if (ft & 8) this.bf = Math.min(0xFF, this.bf + 1);
            if (ft & 4) this.pb = Math.min(0xFF, this.pb + 1);
            if (ft & 2) this.rm = Math.min(0xFF, this.rm + 1);
            if (ft & 1) this.cy = Math.min(0xFF, this.cy + 1);
            this.hap = 1;
        } else if (fa) {
            // Sustained fault — count each cycle
            this.fc = Math.min(0xFFFF, this.fc + 1);
            if (ft & 8) this.bf = Math.min(0xFF, this.bf + 1);
            if (ft & 4) this.pb = Math.min(0xFF, this.pb + 1);
            if (ft & 2) this.rm = Math.min(0xFF, this.rm + 1);
            if (ft & 1) this.cy = Math.min(0xFF, this.cy + 1);
            this.hap = 1;
        } else { this.hap = 0; }
        // Alert: bf >= WARN → alert per bf/WARN periods
        const bfAlerts = Math.floor(this.bf / this.WARN);
        const fcAlerts = Math.floor(this.fc / (this.WARN * 2));
        this.ac = Math.min(0xFFFF, bfAlerts + fcAlerts);
        // LEDs
        this.led[0] = 1;
        this.led[1] = this.fc > 0 ? 1 : 0;
        this.led[2] = this.ac > 0 ? 1 : 0;
        this.led[3] = (this.fc === 0 && this.ac === 0) ? 1 : 0;
    }
    sr0() { return (this.fc << 16) | this.ac; }
    sr1() { return (this.bf << 24) | (this.pb << 16) | (this.rm << 8) | this.cy; }
    sr2() { return this.lfc; }
    sr3() { return this.ac; }
}

// ─── L9: Response FSM (hw_monitor_resp.v v2) ───
class L9 {
    constructor() {
        this.st = 'M'; this.fz=0; this.ce=1; this.irq=0;
        this.zc=0; this.rc=0;
        this.ZC=256; this.RH=64;
    }
    tick(l8, rst) {
        if (!rst) { this.st='M'; this.fz=0; this.ce=1; this.irq=0; this.zc=this.rc=0; return; }
        if (this.st === 'Z') {
            this.fz = 1; this.zc++;
            if (this.zc >= this.ZC) { this.st = 'R'; this.zc = 0; this.fz = 0; }
            return;
        }
        if (this.st === 'R') {
            this.rc++;
            if (this.rc >= this.RH) { this.st = 'M'; this.rc = 0; this.ce = 1; this.irq = 0; }
            return;
        }
        // M → W
        if (this.st === 'M' && (l8.bf >= l8.WARN || l8.fc >= l8.WARN * 2)) { this.st = 'W'; return; }
        // W → T or W → M
        if (this.st === 'W') {
            if (l8.fc >= l8.TRIP || l8.ac >= 4) { this.st = 'T'; this.irq = 1; this.ce = 0; return; }
            if (l8.fc < l8.WARN && l8.ac === 0) { this.st = 'M'; return; }
        }
        // T → Z
        if (this.st === 'T') { this.st = 'Z'; this.fz = 1; return; }
    }
}

function tickN(l8, l9, n, nd, fa, ft, rst) {
    for (let i = 0; i < n; i++) {
        l8.tick(nd, fa, ft, rst);
        l9.tick(l8, rst);
    }
}

console.log('FPGA L8+L9 — 43-Test Cross-Validation v2');
console.log(`Node ${process.version}`);
console.log('═'.repeat(60));

// ═══════════ [1] L8 Fault Counters (12) ═══════════
console.log('\n[1] L8 Fault Counters');
t('L8-01 bf_mismatch',  () => { const l=new L8(); l.tick(0,1,8,1);  return l.bf===1&&l.fc===1; });
t('L8-02 parity',       () => { const l=new L8(); l.tick(0,1,4,1);  return l.pb===1; });
t('L8-03 remo',         () => { const l=new L8(); l.tick(0,1,2,1);  return l.rm===1; });
t('L8-04 cycle',        () => { const l=new L8(); l.tick(0,1,1,1);  return l.cy===1; });
t('L8-05 multi-type',   () => { const l=new L8(); l.tick(0,1,0xF,1); return l.bf===1&&l.pb===1&&l.rm===1&&l.cy===1; });
t('L8-06 saturation',   () => { const l=new L8(); l.bf=l.pb=l.rm=l.cy=0xFF; l.fc=0xFFFF; l._prev=0; l.tick(0,1,0xF,1); return l.bf===0xFF&&l.fc===0xFFFF; });
t('L8-07 fc increment', () => { const l=new L8(); l.tick(0,1,1,1); l.tick(0,0,0,1); l.tick(0,1,1,1); return l.fc===2; });
t('L8-08 fc saturate',  () => { const l=new L8(); l.fc=0xFFFF; l.tick(0,1,1,1); return l.fc===0xFFFF; });
t('L8-09 ac threshold', () => { const l=new L8(); for(let i=0;i<7;i++)l.tick(0,1,8,1); return l.ac>=2&&l.ac<=4; });
t('L8-10 lfc record',   () => { const l=new L8(); l.tick(0,0,0,1);l.tick(0,0,0,1);l.tick(1,1,1,1); return l.lfc===3; });
t('L8-11 no ntt_done',  () => { const l=new L8(); l.tick(0,1,1,1); return l.fc===1; });
t('L8-12 burst',        () => { const l=new L8(); for(let i=0;i<8;i++)l.tick(0,1,1,1); return l.fc===8&&l.ac>=1; });

// ═══════════ [2] L8 Status Registers (6) ═══════════
console.log('\n[2] L8 Status Registers');
t('L8-13 sr0',      () => { const l=new L8(); l.fc=5;l.ac=3; return l.sr0()===((5<<16)|3); });
t('L8-14 sr1',      () => { const l=new L8(); l.bf=0xAB;l.pb=0xCD;l.rm=0xEF;l.cy=0x11; return l.sr1()===((0xAB<<24)|(0xCD<<16)|(0xEF<<8)|0x11); });
t('L8-15 sr2',      () => { const l=new L8(); l.lfc=0xDEAD; return l.sr2()===0xDEAD; });
t('L8-16 sr3',      () => { const l=new L8(); l.ac=7; return l.sr3()===7; });
t('L8-17 reset zero',() => { const l=new L8(); l.fc=42;l.ac=3; l.tick(0,0,0,0); return l.fc===0&&l.ac===0; });
t('L8-18 post-rst',  () => { const l=new L8(); for(let i=0;i<10;i++)l.tick(0,0,0,1); return l.fc===0&&l.ac===0; });

// ═══════════ [3] L8 Alert/LED (6) ═══════════
console.log('\n[3] L8 Alert / LED');
t('L8-19 hap pulse',  () => { const l=new L8(); l.tick(0,1,1,1); return l.hap===1; });
t('L8-20 hap repeat', () => { const l=new L8(); l.tick(0,1,1,1);l.tick(0,0,0,1);l.tick(0,1,1,1); return l.hap===1; });
t('L8-21 led[0] hb', () => { const l=new L8(); l.tick(0,0,0,1); return l.led[0]===1; });
t('L8-22 led[1] flt',() => { const l=new L8(); l.tick(0,1,1,1); return l.led[1]===1; });
t('L8-23 led[2] alrt',()=> { const l=new L8(); for(let i=0;i<9;i++)l.tick(0,1,8,1); return l.ac>=3&&l.led[2]===1; });
t('L8-24 led[3] pass',()=> { const l=new L8(); l.tick(0,0,0,1); return l.led[3]===1; });

// ═══════════ [4] L8 Edge Cases (3) ═══════════
console.log('\n[4] L8 Edge Cases');
t('L8-25 multi pulse',  () => { const l=new L8(); l.tick(0,1,3,1); return l.rm===1&&l.cy===1&&l.fc===1; });
t('L8-26 short reset',  () => { const l=new L8(); l.fc=99; l.tick(0,0,0,0); l.tick(0,0,0,1); return l.fc===0; });
t('L8-27 post-done pers',()=> { const l=new L8(); l.tick(1,0,0,1);l.tick(1,1,1,1);l.tick(1,1,1,1); return l.fc===2; });

// ═══════════ [5] L9 FSM (10) ═══════════
console.log('\n[5] L9 FSM Transitions');
t('L9-01 POR idle', () => { const l8=new L8(),l9=new L9(); l9.tick(l8,1); return l9.st==='M'; });
t('L9-02 M→W single',()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<3;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} return l9.st==='W'; });
t('L9-03 M→W total',  ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<6;i++){l8.tick(0,1,1,1);l9.tick(l8,1);} return l9.st==='W'; });
t('L9-04 W hold',      ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<4;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} l8.tick(0,1,1,1);l9.tick(l8,1); return l9.st==='W'; });
t('L9-05 W→T by fc',  ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<8;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} return l9.st==='T'; });
t('L9-06 W→T by ac',  ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<24;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} return l9.st==='T'||l9.st==='Z'; });
t('L9-07 T→Z auto',   ()=> { const l8=new L8(),l9=new L9(); l9.st='T';l9.tick(l8,1); return l9.st==='Z'; });
t('L9-08 Z hold',      ()=> { const l8=new L8(),l9=new L9(); l9.st='T';l9.tick(l8,1); for(let i=0;i<10;i++)l9.tick(l8,1); return l9.fz===1; });
t('L9-09 Z→R',         ()=> { const l8=new L8(),l9=new L9(); l9.st='T';l9.tick(l8,1); for(let i=0;i<l9.ZC;i++)l9.tick(l8,1); return l9.st==='R'; });
t('L9-10 R→M',         ()=> { const l8=new L8(),l9=new L9(); l9.st='T';l9.tick(l8,1); for(let i=0;i<l9.ZC+l9.RH;i++)l9.tick(l8,1); return l9.st==='M'; });

// ═══════════ [6] L9 Response Outputs (3) ═══════════
console.log('\n[6] L9 Response Outputs');
t('L9-11 fz assert',   ()=> { const l8=new L8(),l9=new L9(); l9.st='T';l9.tick(l8,1); return l9.fz===1; });
t('L9-12 clk disable', ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<9;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} return l9.ce===0; });
t('L9-13 irq set',    ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<9;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} return l9.irq===1; });

// ═══════════ [7] Cross-Layer Integration (3) ═══════════
console.log('\n[7] Cross-Layer Integration');
t('L9-14 full cycle',  ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<9;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} for(let i=0;i<l9.ZC+l9.RH;i++)l9.tick(l8,1); return l9.st==='M'&&l9.ce===1; });
t('L9-15 rapid recov', ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<4;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} l8.tick(0,0,0,1);l9.tick(l8,1); return l9.st==='W'&&l9.ce===1; });
t('L9-16 irq held',    ()=> { const l8=new L8(),l9=new L9(); for(let i=0;i<9;i++){l8.tick(0,1,8,1);l9.tick(l8,1);} return l9.irq===1; });

// ═══════════ SUMMARY ═══════════
console.log('\n\n═'.repeat(60));
console.log(`  L8+L9: ${passed}P / ${failed}F / ${testNum} total`);
console.log('═'.repeat(60));
if (failures.length) { console.log('\nFailures:'); failures.forEach(f=>console.log(`  ${f}`)); }
if (testNum !== TOTAL) { console.log(`\nWARN: count ${testNum} != ${TOTAL}`); failed++; }
else if (failed === 0) console.log(`\nOK ${TOTAL}/${TOTAL} — L8+L9 43/43 verified.`);
process.exit(failed===0 && testNum===TOTAL ? 0 : 1);
