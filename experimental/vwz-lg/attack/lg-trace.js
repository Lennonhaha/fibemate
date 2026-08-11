/**
 * lg-trace.js — Frida 动态追踪 LG v2.2 七层有限群置换函数
 *
 * Target: LG v2.2 7-layer wreath-product finite group obfuscation
 * Function signatures:
 *   lgv2_confuse(data: *mut u8, seed: u64) -> *mut u8
 *   lgv2_deconfuse(data: *mut u8, seed: u64) -> *mut u8
 *   lgv2_confuse_d(data: *mut u8, seed: u64, depth: u32) -> *mut u8
 *   lgv2_confuse_ex(data: *mut u8, seed: u64, audit: *mut u8) -> *mut u8
 *
 * Usage:
 *   frida -l lg-trace.js --no-pause <process_name|pid>
 *   frida -l lg-trace.js -f node --no-pause -- lgv2-bench.js
 *
 * Output: JSONL to stdout, mapping pairs = {in: hex, out: hex, seed: hex, depth: n}
 */

// ---- WASM 函数名 (LG v2.2) ----
const CONFUSE      = "lgv2_confuse";
const DECONFUSE    = "lgv2_deconfuse";
const CONFUSE_D    = "lgv2_confuse_d";
const CONFUSE_EX   = "lgv2_confuse_ex";

const TARGETS = [CONFUSE, DECONFUSE, CONFUSE_D, CONFUSE_EX];

// ---- 配置 ----
const LOG_TO_CONSOLE = false;  // 设为 true 可打印到 frida 日志
const SAMPLE_LIMIT   = 0;      // 0 = 无限制

let sampleCount = 0;

// ---- 辅助: 输出 JSONL 样本 ----
function emitSample(tag, input, output, seed, depth) {
  if (SAMPLE_LIMIT > 0 && sampleCount >= SAMPLE_LIMIT) return;
  sampleCount++;
  const entry = JSON.stringify({
    tag: tag,
    in_size: input.length,
    out_size: output.length,
    seed: "0x" + seed.toString(16),
    depth: depth,
    in_hex: hexdump(input, { offset: 0, length: Math.min(input.length, 48), header: false, ansi: false }),
    out_hex: hexdump(output, { offset: 0, length: Math.min(output.length, 48), header: false, ansi: false }),
  });
  console.log(entry);
  if (LOG_TO_CONSOLE) {
    console.error("[lg-trace] " + tag + " seed=" + seed.toString(16) + " depth=" + depth + " in=" + input.length + "B out=" + output.length + "B");
  }
}

// ---- Hook 模板 ----
function hookFn(name, hasDepth, hasAudit) {
  const export_ = Module.findExportByName(null, name);
  if (!export_) {
    console.error("[lg-trace] WARNING: " + name + " not found in module exports");
    return;
  }

  Interceptor.attach(export_, {
    onEnter(args) {
      this.ptr  = args[0];
      this.seed = args[1].toInt32 ? BigInt(args[1].toInt32()) : BigInt(args[1].toString());
      this.depth = hasDepth ? (args[2].toInt32 ? args[2].toInt32() : 7) : 7;

      // 尝试读入参数据（大块只读前 48B）
      try {
        const len = this.ptr.readU32 ? this.ptr.add(0).readU32() : 256;
        this.input = Memory.readByteArray(this.ptr, Math.min(len || 256, 4096));
      } catch (e) {
        this.input = new ArrayBuffer(0);
      }
    },
    onLeave(retval) {
      try {
        let output;
        // 如果返回指针，尝试读取
        if (retval && !retval.isNull && !retval.isNull()) {
          output = Memory.readByteArray(retval, Math.min((this.input ? this.input.byteLength : 256) || 256, 4096));
        } else {
          // 原地修改（deconfuse 通常 in-place）
          output = Memory.readByteArray(this.ptr, Math.min((this.input ? this.input.byteLength : 256) || 256, 4096));
        }
        emitSample(name, this.input || new ArrayBuffer(0), output, this.seed, this.depth);
      } catch (e) {
        console.error("[lg-trace] ERROR reading output: " + e.message);
      }
    }
  });
}

// ---- 主逻辑 ----

console.error("[lg-trace] Hook targets: " + TARGETS.join(", "));
console.error("[lg-trace] Waiting for LG v2.2 WASM function calls...");

TARGETS.forEach(name => {
  const hasDepth = (name === CONFUSE_D);
  hookFn(name, hasDepth, false);
});

// Phase-II hint for confused() (JS side)
if (typeof global !== "undefined") {
  global.__LG_TRACE_ACTIVE = true;
}
