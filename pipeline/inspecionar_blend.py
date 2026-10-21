# Inspeção somente-leitura do modelo Blender (nunca salva o arquivo).
# Uso: blender -b <arquivo.blend> --python inspecionar_blend.py -- <saida.json>
import bpy, json, sys
from collections import Counter, defaultdict
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1]
s = bpy.context.scene

def visible(o):
    if o.hide_render: return False
    for c in o.users_collection:
        if c.hide_render: return False
    return True

prefix = Counter(); prefix_vis = Counter(); types = Counter()
col_info = {}
mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3)
mats = Counter(); tris = 0
per_col = defaultdict(lambda: [0, 0])
for o in s.objects:
    types[o.type] += 1
    p = o.name.split('_')[0] + '_' + (o.name.split('_')[1] if '_' in o.name else '')
    prefix[p] += 1
    if visible(o) and o.type in ('MESH', 'CURVE'):
        prefix_vis[p] += 1
        for c in o.users_collection:
            per_col[c.name][0] += 1
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            mn = Vector(map(min, mn, w)); mx = Vector(map(max, mx, w))
        if o.type == 'MESH':
            n = sum(len(p.vertices) - 2 for p in o.data.polygons)
            tris += n
            for c in o.users_collection:
                per_col[c.name][1] += n
            for m in o.data.materials:
                if m: mats[m.name] += 1

def walk(c, depth=0):
    col_info[c.name] = dict(depth=depth, hide_render=c.hide_render, hide_viewport=c.hide_viewport,
                            n_objects=len(c.objects), children=[x.name for x in c.children])
    for ch in c.children: walk(ch, depth + 1)
walk(s.collection)

cams = []
for o in s.objects:
    if o.type == 'CAMERA':
        cams.append(dict(name=o.name, loc=list(o.location), rot=list(o.rotation_euler), type=o.data.type,
                         lens=o.data.lens, ortho=o.data.ortho_scale, active=(s.camera == o)))

json.dump(dict(file=bpy.data.filepath, n_objects=len(s.objects), types=types, prefixes_all=prefix.most_common(),
               prefixes_visible=prefix_vis.most_common(), bounds_visible=[list(mn), list(mx)], tris_visible=tris,
               collections=col_info, per_collection_visible=per_col, materials=mats.most_common(), cameras=cams,
               unit_scale=s.unit_settings.scale_length, unit_system=s.unit_settings.system),
          open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1, default=list)
print('INSPECT_OK', out)
