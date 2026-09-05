# SPDX-License-Identifier: GPL-3.0-only
import os, re, io, json
ROOT='/opt/fibemate-repo'
with io.open(os.path.join(ROOT,'VERSION.json'),encoding='utf-8') as f:
    V=json.load(f)
VER=V['version']; VIZ=V['visualizations']; CARS=V['cars']
print(f"Expected from VERSION.json: version=v{VER}, viz={VIZ}, cars={CARS}\n")

# Historical documents where v3.3-preview / old numbers are INTENTIONAL (keep as-is)
HIST=('BUILD.md','whitepaper','audit','report','memory/','/tsa/','VULNERABILITIES',
      'api-stability','security-limitations','platform-matrix','good-first-issues',
      'FAQ','sm2-frontend-verification','vwz-challenge','p0-01-pathA',
      'www-scripts-docs-review','RELEASE_NOTES','benchmark-report','MEMORY.md',
      'README.zh-CN.md','bindings/python','fuzz','2026-07-22')
def is_hist(fp): return any(k in fp for k in HIST)

SKIP={'.git','node_modules','target','.venv','archives','backups','.openclaw','.Xil','.cache','dist','fibemate-mobile'}
exts=('.html','.md','.json')
files=[]
for dp,dn,fn in os.walk(ROOT):
    dn[:]=[d for d in dn if d not in SKIP]
    for x in fn:
        if x.endswith(exts): files.append(os.path.join(dp,x))
print(f"Scanned {len(files)} files\n")

def L(c): return c.split('\n')
WHITE=('TSR','timestamp','存证','tsa','首页 TSR')

print("=== 1. v3.3-preview residuals (historical docs EXCLUDED) ===")
stray=0
for fp in files:
    if is_hist(fp): continue
    try: c=io.open(fp,encoding='utf-8',errors='replace').read()
    except: continue
    for i,l in enumerate(L(c)):
        if 'v3.3-preview' in l and not any(k in l for k in WHITE):
            stray+=1; print(f"  {fp}:{i+1}: {l.strip()[:90]}")
print("  OK: no stray v3.3-preview in active files\n" if stray==0 else f"  {stray} stray found (review)\n")

print("=== 2. current version markers (🔒 / 当前为) must equal v%s ===" % VER)
bad=0
for fp in files:
    if is_hist(fp): continue
    c=io.open(fp,encoding='utf-8',errors='replace').read()
    for i,l in enumerate(L(c)):
        if 'v3.3-preview' in l: continue
        if '🔒 v3.3' in l or '当前为 v3.3' in l:
            m=re.search(r'v3\.3[\w.]*', l)
            if m and m.group(0)!='v'+VER:
                bad+=1; print(f"  {fp}:{i+1}: marker={m.group(0)} expected v{VER}")
print("  OK: all current markers match v%s\n" % VER if bad==0 else f"  {bad} mismatched\n")

print(f"=== 3. visualization count (expect {VIZ}) ===")
for fp in files:
    if is_hist(fp): continue
    c=io.open(fp,encoding='utf-8',errors='replace').read()
    for m in re.finditer(r'(\d+)\s*个?(?:交互式|可视化|可视化页面|可视化工具|工具集|工具)', c):
        i=c[:m.start()].count('\n'); n=int(m.group(1))
        flag='' if n==VIZ else f'  <<< expected {VIZ}'
        print(f"  {fp}:{i+1}: {n}{flag} | {L(c)[i].strip()[:55]}")

print(f"\n=== 4. CARS score (expect {CARS}) ===")
for fp in files:
    if is_hist(fp): continue
    c=io.open(fp,encoding='utf-8',errors='replace').read()
    for m in re.finditer(r'CARS\s*[:：]?\s*(\d+)', c):
        i=c[:m.start()].count('\n'); n=int(m.group(1))
        flag='' if n==CARS else f'  <<< expected {CARS}'
        print(f"  {fp}:{i+1}: CARS={n}{flag}")
print("\nDone. Historical docs excluded. Review <<< marks on active files only.")
