"""Apply hot-path optimizations to ml-kem-768.js"""
import sys

with open(sys.argv[1], 'r') as f:
    src = f.read()

changes = 0

# Fix 1: modAdd → branchless (sum < 2Q → conditional subtract)
old = 'function modAdd(a, b) { const r = ((a|0)+(b|0)) % Q; return r >= 0 ? r : r+Q; }'
new = 'function modAdd(a, b) { const r = ((a|0)+(b|0)); return r >= Q ? r-Q : r; }'
if old in src:
    src = src.replace(old, new)
    print('modAdd: branchless (remove %%)')
    changes += 1

# Fix 2: modSub → branchless
old = 'function modSub(a, b) { const r = ((a|0)-(b|0)) % Q; return r >= 0 ? r : r+Q; }'
new = 'function modSub(a, b) { const r = ((a|0)-(b|0)); return r < 0 ? r+Q : r; }'
if old in src:
    src = src.replace(old, new)
    print('modSub: branchless (remove %%)')
    changes += 1

# Fix 3: NTT butterfly — hoist modMul(b, omega) to compute once per pair
old_bfly = """                f[i0] = modAdd(a, modMul(b, omega));
                f[i1] = modSub(a, modMul(b, omega));"""
new_bfly = """                const t = modMul(b, omega);
                f[i0] = modAdd(a, t);
                f[i1] = modSub(a, t);"""
if old_bfly in src:
    src = src.replace(old_bfly, new_bfly, 1)
    print('ntt(): hoist modMul(b, omega) — saves 1 mul per butterfly')
    changes += 1

# Fix 4: intt() butterfly — same pattern (modMul(modSub(b,a), omega) is only one mul, fine)
# but intt's inner loop has modAdd(b,a) + modMul(modSub(b,a), omega) — no duplication

# Fix 5: polyMulNTT — modNeg called in loop, hoistable?
# if(i&1)z=modNeg(z) is conditional, fine

with open(sys.argv[1], 'w') as f:
    f.write(src)

print(f'Total changes: {changes}')
