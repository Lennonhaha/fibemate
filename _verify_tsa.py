with open('/opt/fibemate-full/www/index.html', 'r') as f:
    h = f.read()
print('len:', len(h))
print('tsa.cn:', 'tsa.cn' in h)
print('hash:', '4e2f4bef' in h)
print('disclaimer:', 'disclaimer.html' in h)
# Show TSA section area
idx = h.find('Trusted Timestamp')
if idx >= 0:
    print(h[idx:idx+300])