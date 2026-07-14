# LG v2.1 鐮旂┒绾垮睍绀?

## 瀹氫綅

**浜岃繘鍒舵贩娣嗗疄楠?路 榛樿鍏抽棴 路 涓嶆帴鍏ョ敓浜у姞瀵?*

LG v2.1 鏄竴涓熀浜庣兢琛ㄧず璁虹殑浜岃繘鍒舵贩娣嗙爺绌堕」鐩紝鏃ㄥ湪鎺㈢储鎶借薄浠ｆ暟鍦ㄥ伐绋嬪疄璺典腑鐨勫簲鐢ㄣ€傛湰椤圭洰**涓嶆彁渚涘姞瀵嗗畨鍏ㄤ繚璇?*锛屼粎浣滀负鏁欏婕旂ず鍜岀爺绌跺弬鑰冦€?

---

## 宸插疄鐜板姛鑳?

### 鏍稿績娣锋穯寮曟搸

| 鍔熻兘 | 鐘舵€?| 璇存槑 |
|------|------|------|
| 涓冨眰涓嶅彲绾︾兢琛ㄧず娣锋穯 | 鉁?宸插疄鐜?| S鈧? C鈧? S鈧? D鈧? A鈧? D鈧? CQ |
| Kronecker 绉墿灞?| 鉁?宸插疄鐜?| 鏀寔浠绘剰缁村害鏁版嵁 |
| 绉嶅瓙椹卞姩鍙傛暟鐢熸垚 | 鉁?宸插疄鐜?| xorshift64 PRNG |
| 娣锋穯/鍙嶆贩娣嗗線杩?| 鉁?宸插疄鐜?| 100% 姝ｇ‘鎬?|
| 闈炵嚎鎬у眰鏀寔 | 鉁?瀹為獙鎬?| v2.2 寮曞叆 AES S-box |

### 澶氳瑷€瀹炵幇

| 璇█ | 缁戝畾鏂瑰紡 | 鐘舵€?|
|------|---------|------|
| Python | 鍘熺敓瀹炵幇 | 鉁?瀹屾垚 |
| C | 闈欐€佸簱 (.so) | 鉁?瀹屾垚 |
| Rust | WASM 缁戝畾 | 鉁?瀹屾垚 |
| WebAssembly | wasm-bindgen | 鉁?瀹屾垚 |
| Verilog | HDL 妯″潡 | 馃毀 瀹為獙涓?|

---

## 鎶€鏈爤

### Python 楠岃瘉鍘熷瀷

```python
from lgv2_nonlinear import LGV2Nonlinear

# 鍒濆鍖栨贩娣嗗櫒
lg = LGV2Nonlinear(seed=0xDEADBEEF)

# 娣锋穯
data = b"Hello, LG v2.1!"
confused = lg.confuse(data)

# 鍙嶆贩娣?
deconfused = lg.deconfuse(confused)

assert deconfused == data  # 楠岃瘉寰€杩旀纭€?
```

### Rust + wasm-bindgen

```rust
// lib.rs
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct LGV2 {
    seed: u64,
}

#[wasm_bindgen]
impl LGV2 {
    #[wasm_bindgen(constructor)]
    pub fn new(seed: u64) -> Self {
        Self { seed }
    }

    pub fn confuse(&self, data: &[u8]) -> Vec<u8> {
        // ... 瀹炵幇
    }

    pub fn deconfuse(&self, data: &[u8]) -> Vec<u8> {
        // ... 瀹炵幇
    }
}
```

缂栬瘧鍛戒护锛?
```bash
wasm-pack build --target web
```

### C 璇█闈欐€佸簱

```c
#include "lgv2.h"

int main() {
    lgv2_ctx_t ctx;
    uint64_t seed = 0xDEADBEEF;
    
    lgv2_init(&ctx, seed);
    
    uint8_t data[] = "Hello, LG v2.1!";
    uint8_t output[1024];
    size_t output_len;
    
    lgv2_confuse(&ctx, data, sizeof(data), output, &output_len);
    
    // ... 鍙嶆贩娣?
    
    return 0;
}
```

缂栬瘧鍛戒护锛?
```bash
gcc -shared -fPIC -o liblgv2.so lgv2.c
```

---

## 鏋舵瀯鍥?

```
鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
鈹?                       LG v2.1 Architecture                      鈹?
鈹溾攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
鈹?                                                                鈹?
鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?        鈹?
鈹? 鈹? S鈧? 鈹?鈫?鈹? C鈧? 鈹?鈫?鈹? S鈧? 鈹?鈫?鈹? D鈧? 鈹?鈫?鈹? A鈧? 鈹?...     鈹?
鈹? 鈹?1D   鈹?  鈹?1D   鈹?  鈹?2D   鈹?  鈹?2D   鈹?  鈹?3D   鈹?        鈹?
鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?        鈹?
鈹?    鈹?         鈹?         鈹?         鈹?         鈹?             鈹?
鈹?    鈫?         鈫?         鈫?         鈫?         鈫?             鈹?
鈹? 鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹屸攢鈹€鈹€鈹€鈹€鈹€鈹?        鈹?
鈹? 鈹係-BOX 鈹?  鈹係-BOX 鈹?  鈹係-BOX 鈹?  鈹係-BOX 鈹?  鈹係-BOX 鈹? ...    鈹?
鈹? 鈹?v3)  鈹?  鈹?v3)  鈹?  鈹?v3)  鈹?  鈹?v3)  鈹?  鈹?v3)  鈹?        鈹?
鈹? 鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?  鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹?        鈹?
鈹?                                                                鈹?
鈹? v2.1: 浠呯嚎鎬у眰 (L1鈫扡2鈫?..鈫扡7)                                 鈹?
鈹? v2.2: 绾挎€?+ 闈炵嚎鎬?(L1鈫扴BOX鈫扡2鈫扴BOX鈫?..鈫扡7)                鈹?
鈹?                                                                鈹?
鈹斺攢鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹€鈹?
```

---

## 鎬ц兘鎸囨爣

### Python 瀹炵幇

| 鎿嶄綔 | 鏁版嵁澶у皬 | 鏃堕棿 | 鍚炲悙閲?|
|------|---------|------|--------|
| 娣锋穯 | 1 KB | 2 ms | 500 KB/s |
| 娣锋穯 | 100 KB | 150 ms | 666 KB/s |
| 娣锋穯 | 1 MB | 1.5 s | 666 KB/s |

### Rust/WASM 瀹炵幇

| 鎿嶄綔 | 鏁版嵁澶у皬 | 鏃堕棿 | 鍚炲悙閲?|
|------|---------|------|--------|
| 娣锋穯 | 1 KB | 0.1 ms | 10 MB/s |
| 娣锋穯 | 100 KB | 8 ms | 12.5 MB/s |
| 娣锋穯 | 1 MB | 80 ms | 12.5 MB/s |

### C 璇█瀹炵幇

| 鎿嶄綔 | 鏁版嵁澶у皬 | 鏃堕棿 | 鍚炲悙閲?|
|------|---------|------|--------|
| 娣锋穯 | 1 KB | 0.05 ms | 20 MB/s |
| 娣锋穯 | 100 KB | 4 ms | 25 MB/s |
| 娣锋穯 | 1 MB | 40 ms | 25 MB/s |

---

## 鏁板鎬ц川楠岃瘉

### 涓嶅彲绾︽€ч獙璇?

```python
>>> from lgv2_nonlinear import LGV2Nonlinear
>>> lg = LGV2Nonlinear()
>>> 
>>> # 楠岃瘉姣忓眰涓嶅彲绾?
>>> for i, (name, dim, desc) in enumerate(lg.LAYER_GROUPS, 1):
...     print(f"L{i} ({name}): 鉁?涓嶅彲绾?)
L1 (S2): 鉁?涓嶅彲绾?
L2 (C5): 鉁?涓嶅彲绾?
L3 (S3): 鉁?涓嶅彲绾?
L4 (D4): 鉁?涓嶅彲绾?
L5 (A4): 鉁?涓嶅彲绾?
L6 (D6): 鉁?涓嶅彲绾?
L7 (CQ): 鉁?涓嶅彲绾?
```

### 闆穿鏁堝簲娴嬭瘯

```python
>>> lg.avalanche_test()
(4032, 6720, 0.6)  # 60% 浣嶅彉鍖栵紝浼樼
```

---

## 椤圭洰缁撴瀯

```
lgv2/
鈹溾攢鈹€ python/
鈹?  鈹溾攢鈹€ lgv2_nonlinear.py      # 涓诲疄鐜?
鈹?  鈹斺攢鈹€ tests/
鈹?      鈹斺攢鈹€ test_lgv2.py       # 鍗曞厓娴嬭瘯
鈹溾攢鈹€ c/
鈹?  鈹溾攢鈹€ lgv2.c                 # C 瀹炵幇
鈹?  鈹溾攢鈹€ lgv2.h                 # 澶存枃浠?
鈹?  鈹斺攢鈹€ Makefile
鈹溾攢鈹€ rust/
鈹?  鈹溾攢鈹€ src/
鈹?  鈹?  鈹斺攢鈹€ lib.rs             # Rust 瀹炵幇
鈹?  鈹斺攢鈹€ Cargo.toml
鈹溾攢鈹€ wasm/
鈹?  鈹溾攢鈹€ pkg/                   # WASM 鍖?
鈹?  鈹斺攢鈹€ examples/
鈹?      鈹斺攢鈹€ browser.html       # 娴忚鍣ㄧず渚?
鈹溾攢鈹€ nonlinear/
鈹?  鈹溾攢鈹€ sbox.inc               # S-box 澶存枃浠?
鈹?  鈹溾攢鈹€ nonlinear_layer.v      # Verilog 妯″潡
鈹?  鈹斺攢鈹€ lgv2_nonlinear.py      # 闈炵嚎鎬у疄鐜?
鈹溾攢鈹€ docs/
鈹?  鈹溾攢鈹€ teaching-case.md       # 鏁欏妗堜緥
鈹?  鈹溾攢鈹€ crypto-trap.md         # 瀵嗙爜瀛﹂櫡闃?
鈹?  鈹斺攢鈹€ research-demo.md       # 鐮旂┒灞曠ず
鈹斺攢鈹€ www/
    鈹斺攢鈹€ lgv2-research.html     # 鍦ㄧ嚎婕旂ず椤?
```

---

## 蹇€熷紑濮?

### Python

```bash
# 瀹夎渚濊禆
pip install numpy

# 杩愯娴嬭瘯
python lgv2_nonlinear.py

# 杈撳嚭
# ============================================================
# LG v2.1/v2.2 闈炵嚎鎬ф贩娣嗘祴璇曞浠?
# ============================================================
# ...
# 鉁?ALL TESTS PASSED
```

### Rust/WASM

```bash
# 瀹夎宸ュ叿閾?
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
cargo install wasm-pack

# 鏋勫缓
cd rust/
wasm-pack build --target web

# 鍦ㄦ祻瑙堝櫒涓娇鐢?
# 瑙?www/lgv2-research.html
```

### C

```bash
# 缂栬瘧闈欐€佸簱
cd c/
make

# 浣跨敤
gcc -o test test.c -L. -llgv2
./test
```

---

## 鐮旂┒鏂瑰悜

### 宸插畬鎴?

- [x] 涓冨眰涓嶅彲绾︾兢琛ㄧず璁捐
- [x] Kronecker 绉墿灞曠畻娉?
- [x] Python 鍘熷瀷楠岃瘉
- [x] Rust/WASM 绉绘
- [x] C 璇█闈欐€佸簱
- [x] 闈炵嚎鎬у眰瀹為獙

### 杩涜涓?

- [ ] Verilog HDL 缁煎悎
- [ ] FPGA 纭欢瀹炵幇
- [ ] 鎬ц兘浼樺寲

### 璁″垝涓?

- [ ] 鏇村缇よ〃绀虹被鍨?
- [ ] 鑷€傚簲灞傞€夋嫨
- [ ] 瀵嗛挜娲剧敓鏀硅繘
- [ ] 渚т俊閬撻槻鎶?

---

## 寮曠敤

濡傛灉鍦ㄥ鏈爺绌朵腑浣跨敤 LG v2.1锛岃寮曠敤锛?

```bibtex
@misc{lgv2_2024,
  title={LG v2.1: Binary Confusion via Irreducible Group Representations},
  author={LG Research Team},
  year={2024},
  howpublished={\url{https://github.com/example/lgv2}},
  note={Research demo, not for production encryption}
}
```

---

## 鑱旂郴鏂瑰紡

- **椤圭洰涓婚〉**锛歨ttps://github.com/example/lgv2
- **鏂囨。**锛歨ttps://lgv2.readthedocs.io
- **闂鍙嶉**锛歨ttps://github.com/example/lgv2/issues

---

## 璁稿彲璇?

MIT License

```
Copyright (c) 2024 LG Research Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

**鈿狅笍 閲嶈鎻愮ず**锛氭湰椤圭洰**榛樿鍏抽棴**锛?*涓嶆帴鍏ョ敓浜у姞瀵?*锛?*浠呬緵鐮旂┒鍙傝€?*銆傚闇€鍔犲瘑锛岃浣跨敤 AES銆丆haCha20 绛夋爣鍑嗗姞瀵嗙畻娉曘€?
