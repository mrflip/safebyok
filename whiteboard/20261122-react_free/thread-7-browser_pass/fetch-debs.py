import sys, hashlib, urllib.request, subprocess, os
pk = {}
cur = {}
for line in open('Packages'):
    line = line.rstrip('\n')
    if not line:
        if 'Package' in cur: pk[cur['Package']] = cur
        cur = {}
        continue
    if line[0] in ' \t': continue
    k, _, v = line.partition(': ')
    if k in ('Package', 'Filename', 'SHA256', 'Depends'): cur[k] = v
for name in sys.argv[1:]:
    p = pk[name]
    fn = os.path.basename(p['Filename'])
    if not os.path.exists(fn):
        urllib.request.urlretrieve('https://deb.debian.org/debian/' + p['Filename'], fn)
    h = hashlib.sha256(open(fn, 'rb').read()).hexdigest()
    assert h == p['SHA256'], (name, h)
    subprocess.run(['dpkg', '-x', fn, '../libroot'], check=True)
    print('ok', name, fn, '| deps:', p.get('Depends', ''))
