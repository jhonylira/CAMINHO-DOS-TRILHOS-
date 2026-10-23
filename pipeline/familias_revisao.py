# Somente leitura: familias R08_* renderizaveis -> materiais e colecoes; confere postes
import bpy, json, sys
from collections import defaultdict, Counter
out = sys.argv[sys.argv.index('--') + 1]
s = bpy.context.scene
parents = defaultdict(list)
def walk(c):
    for ch in c.children:
        parents[ch.name].append(c); walk(ch)
walk(s.collection)
excl = set()
def wl(lc):
    if lc.exclude: excl.add(lc.collection.name)
    for ch in lc.children: wl(ch)
wl(bpy.context.view_layer.layer_collection)
memo = {}
def cv(c):
    if c.name in memo: return memo[c.name]
    if c == s.collection: return True
    if c.hide_render or c.name in excl: memo[c.name] = False; return False
    memo[c.name] = any(cv(p) for p in parents.get(c.name, [])); return memo[c.name]
def rend(o):
    return (not o.hide_render) and o.type in ('MESH', 'CURVE', 'SURFACE', 'META', 'FONT') and any(cv(c) for c in o.users_collection)
fam = defaultdict(lambda: dict(n=0, mats=Counter(), cols=Counter(), ex=[]))
other = Counter()
for o in s.objects:
    if not rend(o): continue
    parts = o.name.split('_')
    if o.name.startswith('R08_'):
        k = '_'.join(parts[:3])
        f = fam[k]; f['n'] += 1
        for sl in o.material_slots: f['mats'][sl.material.name if sl.material else 'SEM'] += 1
        for c in o.users_collection: f['cols'][c.name] += 1
        if len(f['ex']) < 3: f['ex'].append(o.name)
    else:
        other['_'.join(parts[:2])] += 1
res = dict(r08={k: dict(n=v['n'], mats=dict(v['mats']), cols=dict(v['cols']), ex=v['ex']) for k, v in sorted(fam.items())},
           others=dict(other.most_common()))
json.dump(res, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print('FAM_OK')
