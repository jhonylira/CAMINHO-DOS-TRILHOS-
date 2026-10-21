# -*- coding: utf-8 -*-
"""
Pipeline Blender -> Web (Caminho dos Trilhos).

O que faz:
  1. Abre o .blend fonte SOMENTE PARA LEITURA (o arquivo nunca e salvo).
  2. Seleciona os objetos renderizaveis (respeita hide_render de objeto e de toda a cadeia de colecoes).
  3. Avalia cada objeto (modificadores/curvas), aplica matrix_world e converte Z-up -> Y-up:
        three(x, y, z) = blender(x, z, -y)      (rotacao pura: preserva medidas e orientacao)
  4. Agrupa triangulos por (camada tematica, material) e grava um GLB proprio (sem perdas geometricas).
  5. Exporta dados semanticos (arvores, postes, bancos, cameras originais, limites de camadas,
     pontos de humanizacao ilustrativa) e renderiza a planta 2D ortografica por camada.

Uso:
  blender -b --factory-startup <fonte.blend> --python exportar_web.py -- <pasta_public> [--sem-planta]
"""
import bpy, bmesh, json, sys, struct, math, hashlib, random, time
from pathlib import Path
from collections import defaultdict
import numpy as np
from mathutils import Vector, Matrix

argv = sys.argv[sys.argv.index('--') + 1:]
OUT = Path(argv[0]).resolve()
SEM_PLANTA = '--sem-planta' in argv
(OUT / 'models').mkdir(parents=True, exist_ok=True)
(OUT / 'data').mkdir(parents=True, exist_ok=True)
(OUT / 'plan').mkdir(parents=True, exist_ok=True)
t0 = time.time()
SRC = Path(bpy.data.filepath)
sha = hashlib.sha256(SRC.read_bytes()).hexdigest()
scene = bpy.context.scene

# ---------------------------------------------------------------- visibilidade de render
parents = defaultdict(list)
def walk(c):
    for ch in c.children:
        parents[ch.name].append(c)
        walk(ch)
walk(scene.collection)

excluded = set()
def walk_lc(lc):
    if lc.exclude: excluded.add(lc.collection.name)
    for ch in lc.children: walk_lc(ch)
walk_lc(bpy.context.view_layer.layer_collection)

def col_visible(c, memo={}):
    if c.name in memo: return memo[c.name]
    if c == scene.collection: return True
    if c.hide_render or c.name in excluded:
        memo[c.name] = False; return False
    r = any(col_visible(p) for p in parents.get(c.name, []))
    memo[c.name] = r
    return r

def renderable(o):
    if o.hide_render or o.type not in ('MESH', 'CURVE', 'SURFACE', 'META', 'FONT'):
        return False
    return any(col_visible(c) for c in o.users_collection)

# ---------------------------------------------------------------- camadas tematicas
# (id, rotulo, ordem de empilhamento na planta)
LAYERS = [
    ('viario', 'Sistema viario e sinalizacao', 1),
    ('passeios', 'Passeios, pracas e guias', 2),
    ('canteiros', 'Canteiros e vegetacao baixa', 3),
    ('ciclovia', 'Faixas especiais / ciclovia (tracado identificado)', 4),
    ('ferrovia', 'Patrimonio ferroviario - trilhos e lastro', 5),
    ('floreiras', 'Floreiras, muretas e grelhas de arvores', 6),
    ('mobiliario', 'Mobiliario urbano', 7),
    ('iluminacao', 'Iluminacao publica', 8),
    ('quiosques', 'Quiosques panoramicos', 9),
    ('conceitual', 'Arquitetura conceitual (R10)', 10),
    ('cafes', 'Anexos de vidro - cafes e bistro', 11),
    ('estacao', 'Estacao ferroviaria historica', 12),
    ('vegetacao', 'Arborizacao (proxies CAD)', 13),
    ('entorno', 'Entorno volumetrico simplificado', 14),
    ('outros', 'Outros elementos do modelo', 15),
]
LAYER_IDS = [l[0] for l in LAYERS]

def chain(o):
    names = set()
    def up(c):
        names.add(c.name)
        for p in parents.get(c.name, []): up(p)
    for c in o.users_collection: up(c)
    return names

MAT_RULES = {
    'EP_ASFALTO': 'viario', 'Cracked asphalt': 'viario',
    'EP_FAIXA_ESPECIAL_CIMENTICIO': 'ciclovia',
    'EP_CANTEIRO': 'canteiros', 'EP_VEGETACAO_BAIXA': 'canteiros',
    'EP_LASTRO': 'ferrovia',
    'EP_CONCRETO_FULGET_CINZA': 'passeios', 'EP_PERMANENCIA_FULGET_TERROSO': 'passeios',
    'EP_GUIA_CONCRETO': 'passeios',
    'EP_COPA_PROXY': 'vegetacao', 'EP_TRONCO': 'vegetacao',
    'R03_TIJOLINHO_BASE_CAFE_BISTRO': 'cafes', 'R03_VIDRO_INCOLOR_ANEXO': 'cafes',
    'R03_DIFUSOR_LED': 'iluminacao',
    'R03_METAL_GRELHA_GRAFITE': 'floreiras', 'R03_SOLO_AERADO': 'floreiras',
    'EP_R02_CONCRETO_BRANCO_FLOREIRA': 'floreiras', 'EP_R02_SOLO_ORGANICO_ESCUR0': 'floreiras',
    'EP_R02_VEGETACAO_BAIXA_MASSA': 'floreiras', 'R06_CONCRETO_CLARO_FOSCO_MICROAGREGADO': 'floreiras',
    'ENTORNO': 'entorno',
}
NAME_RULES = [
    (('R03_POSTE', 'R03_BRACO', 'R03_LED'), 'iluminacao'),
    (('R03_ANEXO', 'R10_CAFE', 'Base_tijolo'), 'cafes'),
    (('EP_COBERTURA', 'EP_CUMEEIRA', 'EP_CAIBRO'), 'estacao'),
    (('EP_COPA', 'EP_TRONCO', 'R07_COPA', 'R07_TRONCO'), 'vegetacao'),
    (('R04_GRELHA', 'R04_SOLO', 'R07_SOLO', 'R06_', 'EP_FLOREIRA'), 'floreiras'),
    (('R05_BANCO', 'EP_BANCO', 'CADEIRA_RODAS'), 'mobiliario'),
    (('R15_QUIOSQUE',), 'quiosques'),
    (('EP_TRILHO',), 'ferrovia'),
    (('EP_SINAL', 'R07_SINAL', 'Faixa_horizontal', 'Placa_sem'), 'viario'),
    (('ENTORNO',), 'entorno'),
    (('EP_GUIA', 'R07_GUIA'), 'passeios'),
]
COL_RULES = [
    ('70_ESTACAO_FOTOGRAFIAS', 'estacao'),
    ('R15_QUIOSQUES_PANORAMICOS_270', 'quiosques'),
    ('R13_FERROVIA', 'ferrovia'), ('EP_TRILHOS_LEVANTADOS_DORMENTES_ILUSTRATIVOS', 'ferrovia'),
    ('R13_PROXIES_VEGETACAO', 'vegetacao'), ('EP_R00d_ARVORIZACAO_CAD', 'vegetacao'),
    ('R10_ARVORES_CAD_STATUS_DESCONHECIDO', 'vegetacao'), ('R10_PAISAGISMO_ILUSTRATIVO_NAO_INVENTARIO', 'vegetacao'),
    ('R05_BANCOS_INTEGRADOS', 'mobiliario'), ('R13_MOBILIARIO', 'mobiliario'), ('EP_R00d_MOBILIARIO_CAD', 'mobiliario'),
    ('R10_KALUNGAS_ATENDIMENTO', 'mobiliario'),
    ('R04_GRELHAS_PADRAO_CIRCULAR_E_PISOS', 'floreiras'), ('R06_MURETAS_CANTEIROS_AUTORAIS', 'floreiras'),
    ('R10_PILOTO_ARQUITETURA_CONCEITUAL', 'conceitual'),
    ('ENTORNO', 'entorno'), ('R10_ENTORNO_ESTIMADO_ORTHO', 'entorno'), ('R15_DIVISAS_CAD_FECHAMENTOS_CONCEITUAIS', 'entorno'),
    ('R09_HUMANIZACAO_ILUSTRATIVA', 'entorno'),
    ('CALCADAS', 'passeios'), ('ASFALTO', 'viario'), ('CANTEIROS', 'canteiros'), ('VEGETACAO_BAIXA', 'canteiros'),
    ('FAIXAS_ESPECIAIS', 'ciclovia'), ('FERROVIA_BASE', 'ferrovia'), ('TRILHOS_ATUAIS', 'ferrovia'),
]

def classify(o, mat_name, cols):
    for prefixes, lay in NAME_RULES:
        if o.name.startswith(prefixes):
            # Materiais de pavimento dentro de grupos de outros prefixos continuam no pavimento
            if lay in ('estacao', 'cafes', 'quiosques') or mat_name not in MAT_RULES:
                return lay
            return MAT_RULES[mat_name] if MAT_RULES[mat_name] != 'entorno' else lay
    for cname, lay in COL_RULES:
        if cname in cols and lay in ('estacao', 'quiosques', 'conceitual', 'entorno'):
            if mat_name in MAT_RULES and MAT_RULES[mat_name] in ('viario', 'passeios', 'canteiros', 'ciclovia'):
                return MAT_RULES[mat_name]
            return lay
    if mat_name in MAT_RULES:
        return MAT_RULES[mat_name]
    for cname, lay in COL_RULES:
        if cname in cols:
            return lay
    return 'outros'

# ---------------------------------------------------------------- materiais
def mat_props(m):
    d = dict(name=m.name if m else 'SEM_MATERIAL', color=[0.7, 0.7, 0.7], roughness=0.8, metallic=0.0,
             alpha=1.0, transmission=0.0, emission=[0, 0, 0], emission_strength=0.0, textured=False)
    if not m: return d
    d['color'] = list(m.diffuse_color[:3]); d['roughness'] = float(m.roughness); d['metallic'] = float(m.metallic)
    if m.use_nodes and m.node_tree:
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                def val(k, default=None):
                    i = n.inputs.get(k)
                    if i is None: return default
                    if i.is_linked:
                        d['textured'] = True
                        return default
                    v = i.default_value
                    try: return list(v)
                    except TypeError: return float(v)
                bc = val('Base Color');
                if bc: d['color'] = bc[:3]
                r = val('Roughness');  d['roughness'] = r if r is not None else d['roughness']
                me_ = val('Metallic'); d['metallic'] = me_ if me_ is not None else d['metallic']
                a = val('Alpha');      d['alpha'] = a if a is not None else 1.0
                t = val('Transmission Weight') or val('Transmission'); d['transmission'] = t or 0.0
                ec = val('Emission Color'); es = val('Emission Strength')
                if ec: d['emission'] = ec[:3]
                if es: d['emission_strength'] = es
                break
    return d

# ---------------------------------------------------------------- coleta geometrica
dg = bpy.context.evaluated_depsgraph_get()
B2T = np.array([[1, 0, 0], [0, 0, 1], [0, -1, 0]], dtype=np.float64)  # blender -> three

groups = defaultdict(lambda: dict(pos=[], nrm=[], uv=[], idx=[], count=0, objects=0))
materials = {}
layer_bounds = {l: [np.full(3, 1e9), np.full(3, -1e9)] for l in LAYER_IDS}
layer_objects = defaultdict(int)
report_objs = []
walk_faces = []
WALK_MATS = ('EP_CONCRETO_FULGET_CINZA', 'EP_PERMANENCIA_FULGET_TERROSO')
tris_total = 0
n_obj = 0
objs = [o for o in scene.objects if renderable(o)]
print('RENDERABLE', len(objs))

for o in objs:
    eo = o.evaluated_get(dg)
    try:
        me = eo.to_mesh()
    except RuntimeError:
        continue
    if me is None or len(me.polygons) == 0:
        eo.to_mesh_clear(); continue
    me.calc_loop_triangles()
    M = np.array(eo.matrix_world, dtype=np.float64)
    nv = len(me.vertices); nl = len(me.loops); nt = len(me.loop_triangles)
    co = np.empty(nv * 3); me.vertices.foreach_get('co', co); co = co.reshape(-1, 3)
    co = co @ M[:3, :3].T + M[:3, 3]
    lv = np.empty(nl, dtype=np.int64); me.loops.foreach_get('vertex_index', lv)
    try:
        cn = np.empty(nl * 3); me.corner_normals.foreach_get('vector', cn); cn = cn.reshape(-1, 3)
    except Exception:
        cn = np.empty(nl * 3); me.loops.foreach_get('normal', cn); cn = cn.reshape(-1, 3)
    Nm = np.linalg.inv(M[:3, :3]).T
    cn = cn @ Nm.T
    ln = np.linalg.norm(cn, axis=1, keepdims=True); ln[ln == 0] = 1; cn = cn / ln
    if me.uv_layers.active:
        uv = np.empty(nl * 2); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 2)
    else:
        uv = np.zeros((nl, 2))
    tl = np.empty(nt * 3, dtype=np.int64); me.loop_triangles.foreach_get('loops', tl); tl = tl.reshape(-1, 3)
    tp = np.empty(nt, dtype=np.int64); me.loop_triangles.foreach_get('polygon_index', tp)
    pm = np.empty(len(me.polygons), dtype=np.int64); me.polygons.foreach_get('material_index', pm)
    tmat = pm[tp]
    # materiais por slot (objeto ou dados)
    slots = [s.material for s in eo.material_slots] or [None]
    cols = chain(o)
    world_pos = co[lv]                      # posicao por canto (loop)
    world_pos_t = world_pos @ B2T.T
    nrm_t = cn @ B2T.T
    for mi in np.unique(tmat):
        m = slots[mi] if mi < len(slots) else None
        mname = m.name if m else 'SEM_MATERIAL'
        if mname not in materials: materials[mname] = mat_props(m)
        lay = classify(o, mname, cols)
        key = (lay, mname)
        g = groups[key]
        sel = tl[tmat == mi]
        used, inv = np.unique(sel.reshape(-1), return_inverse=True)
        g['pos'].append(world_pos_t[used].astype(np.float32))
        g['nrm'].append(nrm_t[used].astype(np.float32))
        g['uv'].append(uv[used].astype(np.float32))
        g['idx'].append((inv.reshape(-1, 3) + g['count']).astype(np.uint32))
        g['count'] += len(used); g['objects'] += 1
        tris_total += len(sel)
        if mname in WALK_MATS:
            # triangulos de piso voltados para cima -> candidatos a humanizacao ilustrativa
            A = world_pos[sel[:, 0]]; Bv = world_pos[sel[:, 1]]; C = world_pos[sel[:, 2]]
            cr = np.cross(Bv - A, C - A); ar = np.linalg.norm(cr, axis=1) / 2
            up = cr[:, 2] / np.maximum(ar * 2, 1e-9)
            ok = (up > 0.95) & (ar > 0.05)
            for a_, b_, c_, s_ in zip(A[ok], Bv[ok], C[ok], ar[ok]):
                walk_faces.append((float(s_), Vector(a_), Vector(b_), Vector(c_)))
        b = layer_bounds[lay]
        p = world_pos[used]
        b[0] = np.minimum(b[0], p.min(0)); b[1] = np.maximum(b[1], p.max(0))
        layer_objects[lay] += 1
    report_objs.append((o.name, sorted({classify(o, (slots[i].name if i < len(slots) and slots[i] else 'SEM_MATERIAL'), cols) for i in np.unique(tmat)})))
    eo.to_mesh_clear()
    n_obj += 1

print('COLLECTED', n_obj, 'tris', tris_total, 'groups', len(groups), round(time.time() - t0, 1), 's')

# ---------------------------------------------------------------- GLB writer (glTF 2.0)
def srgb_to_lin(c):  # Blender ja guarda base color linear; mantem
    return c

def write_glb(path, groups, materials):
    bin_chunks = []; offset = 0
    buffer_views = []; accessors = []; meshes = []; nodes = []; gl_mats = []; mat_index = {}

    def add_view(arr, target=None):
        nonlocal offset
        data = arr.tobytes()
        pad = (4 - len(data) % 4) % 4
        bv = dict(buffer=0, byteOffset=offset, byteLength=len(data))
        if target: bv['target'] = target
        buffer_views.append(bv); bin_chunks.append(data + b'\x00' * pad); offset += len(data) + pad
        return len(buffer_views) - 1

    for (lay, mname) in sorted(groups.keys(), key=lambda k: (LAYER_IDS.index(k[0]), k[1])):
        g = groups[(lay, mname)]
        pos = np.concatenate(g['pos']); nrm = np.concatenate(g['nrm'])
        idx = np.concatenate(g['idx']).reshape(-1)
        # Soldagem sem perdas: une apenas vertices com posicao E normal identicas (bit a bit em float32).
        rows = np.ascontiguousarray(np.hstack([pos, nrm])).view(np.dtype((np.void, 24))).reshape(-1)
        _, first, inv = np.unique(rows, return_index=True, return_inverse=True)
        pos = pos[first]; nrm = nrm[first]; idx = inv.reshape(-1)[idx].astype(np.uint32)
        uv = None
        if mname not in mat_index:
            mp = materials[mname]
            gm = dict(name=mname, pbrMetallicRoughness=dict(
                baseColorFactor=[*mp['color'][:3], float(mp['alpha'])],
                roughnessFactor=float(max(0, min(1, mp['roughness']))), metallicFactor=float(max(0, min(1, mp['metallic'])))),
                doubleSided=True, extras=dict(transmission=mp['transmission'], textured=mp['textured']))
            if mp['alpha'] < 0.999 or mp['transmission'] > 0.3: gm['alphaMode'] = 'BLEND'
            if mp['emission_strength'] > 0: gm['emissiveFactor'] = [min(1, c) for c in mp['emission']]
            gl_mats.append(gm); mat_index[mname] = len(gl_mats) - 1
        a_pos = len(accessors)
        accessors.append(dict(bufferView=add_view(pos, 34962), componentType=5126, count=len(pos), type='VEC3',
                              min=pos.min(0).tolist(), max=pos.max(0).tolist()))
        accessors.append(dict(bufferView=add_view(nrm, 34962), componentType=5126, count=len(nrm), type='VEC3'))
        if pos.shape[0] < 65535:
            idx_arr = idx.astype(np.uint16); ct = 5123
        else:
            idx_arr = idx.astype(np.uint32); ct = 5125
        accessors.append(dict(bufferView=add_view(idx_arr, 34963), componentType=ct, count=len(idx_arr), type='SCALAR'))
        name = f'{lay}__{mname}'
        meshes.append(dict(name=name, primitives=[dict(attributes=dict(POSITION=a_pos, NORMAL=a_pos + 1),
                                                        indices=a_pos + 2, material=mat_index[mname])]))
        nodes.append(dict(name=name, mesh=len(meshes) - 1, extras=dict(layer=lay, material=mname,
                                                                       objects=g['objects'], triangles=int(len(idx) // 3))))
    gltf = dict(asset=dict(version='2.0', generator='Caminho dos Trilhos pipeline exportar_web.py',
                           extras=dict(source=SRC.name, sha256=sha)),
                scene=0, scenes=[dict(name='R07', nodes=list(range(len(nodes))))], nodes=nodes, meshes=meshes,
                materials=gl_mats, accessors=accessors, bufferViews=buffer_views, buffers=[dict(byteLength=offset)])
    js = json.dumps(gltf, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    binb = b''.join(bin_chunks)
    total = 12 + 8 + len(js) + 8 + len(binb)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(binb), 0x004E4942)); f.write(binb)
    return len(nodes), total

nn, size = write_glb(OUT / 'models' / 'caminho_dos_trilhos_R07.glb', groups, materials)
print('GLB', nn, 'nodes', round(size / 1e6, 1), 'MB')

# ---------------------------------------------------------------- dados semanticos
def b2t(v): return [round(v[0], 3), round(v[2], 3), round(-v[1], 3)]

def world_bbox(o):
    pts = [o.matrix_world @ Vector(c) for c in o.bound_box]
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return mn, mx

trees = []
for o in objs:
    if o.name.startswith(('EP_COPA_', 'R07_COPA_')) or ('COPA' in o.name and 'vegetacao' in dict(report_objs).get(o.name, [])):
        if o.type != 'MESH': continue
        mn, mx = world_bbox(o)
        c = (mn + mx) / 2
        trees.append(dict(name=o.name, handle=o.get('CAD_handle', ''), x=round(c.x, 3), y=round(c.y, 3),
                          rx=round((mx.x - mn.x) / 2, 3), ry=round((mx.y - mn.y) / 2, 3),
                          zmin=round(mn.z, 3), zmax=round(mx.z, 3), species=str(o.get('species', 'Nao confirmada'))))
lamps = []
for o in objs:
    if o.name.startswith('R03_POSTE'):
        mn, mx = world_bbox(o)
        lamps.append(dict(name=o.name, x=round((mn.x + mx.x) / 2, 3), y=round((mn.y + mx.y) / 2, 3), h=round(mx.z, 2)))
benches = []
for o in objs:
    if o.name.startswith(('EP_BANCO', 'R05_BANCO')):
        mn, mx = world_bbox(o)
        benches.append(dict(name=o.name, x=round((mn.x + mx.x) / 2, 3), y=round((mn.y + mx.y) / 2, 3)))

# objetos-chave para pontos de interesse (bbox em coordenadas Blender)
def bbox_of(pred):
    mn = Vector((1e9,) * 3); mx = Vector((-1e9,) * 3); n = 0
    for o in objs:
        if pred(o):
            a, b = world_bbox(o); n += 1
            mn = Vector(map(min, mn, a)); mx = Vector(map(max, mx, b))
    return dict(min=list(mn), max=list(mx), count=n) if n else None

layer_of = dict(report_objs)
key_elements = {
    'estacao': bbox_of(lambda o: 'estacao' in layer_of.get(o.name, [])),
    'cafes': bbox_of(lambda o: 'cafes' in layer_of.get(o.name, [])),
    'quiosques': bbox_of(lambda o: o.name.startswith('R15_QUIOSQUE')),
    'conceitual': bbox_of(lambda o: 'conceitual' in layer_of.get(o.name, [])),
    'ferrovia': bbox_of(lambda o: 'ferrovia' in layer_of.get(o.name, [])),
    'floreiras_R06': bbox_of(lambda o: o.name.startswith('R06_')),
    'floreiras_R07': bbox_of(lambda o: o.name.startswith(('R07_SOLO', 'R07_GUIA'))),
    'bancos_R05': bbox_of(lambda o: o.name.startswith('R05_BANCO')),
    'grelhas_R04': bbox_of(lambda o: o.name.startswith('R04_GRELHA')),
    'ciclovia': bbox_of(lambda o: 'ciclovia' in layer_of.get(o.name, [])),
}

# cameras originais do autor (preservadas; apenas leitura)
cams = []
for o in scene.objects:
    if o.type != 'CAMERA': continue
    R = o.matrix_world.to_3x3()
    fwd = R @ Vector((0, 0, -1)); up = R @ Vector((0, 1, 0))
    loc = o.matrix_world.translation
    d = o.data
    fov = 2 * math.degrees(math.atan(d.sensor_width / (2 * d.lens))) if d.type == 'PERSP' else None
    cams.append(dict(name=o.name, type=d.type, position=b2t(loc), forward=b2t(fwd), up=b2t(up),
                     lens=d.lens, sensor=d.sensor_width, fov_h=fov, ortho_scale=d.ortho_scale if d.type == 'ORTHO' else None,
                     res=[scene.render.resolution_x, scene.render.resolution_y]))

# pontos de humanizacao ilustrativa: amostragem ponderada por area nas faces de passeio (normal para cima)
random.seed(7)
obstacles = [(t['x'], t['y'], 0.9) for t in trees] + [(l['x'], l['y'], 0.6) for l in lamps] + [(b['x'], b['y'], 1.2) for b in benches]
solid_boxes = []
for o in objs:
    lay = layer_of.get(o.name, [])
    if any(l in lay for l in ('estacao', 'cafes', 'quiosques', 'conceitual', 'floreiras', 'entorno')):
        mn, mx = world_bbox(o)
        if mx.z - mn.z > 0.25 and (mx.x - mn.x) * (mx.y - mn.y) < 3000:
            solid_boxes.append((mn.x - 0.5, mn.y - 0.5, mx.x + 0.5, mx.y + 0.5))

print('WALK_FACES', len(walk_faces))

st = key_elements['estacao']
scx = (st['min'][0] + st['max'][0]) / 2 if st else 0; scy = (st['min'][1] + st['max'][1]) / 2 if st else 0
people = []
if walk_faces:
    weights = np.array([f[0] * (1.0 + 6.0 * math.exp(-(((f[1].x - scx) ** 2 + (f[1].y - scy) ** 2) ** 0.5) / 120.0)) for f in walk_faces])
    weights /= weights.sum()
    tries = 0
    while len(people) < 320 and tries < 20000:
        tries += 1
        f = walk_faces[np.random.choice(len(walk_faces), p=weights)]
        r1, r2 = random.random(), random.random()
        if r1 + r2 > 1: r1, r2 = 1 - r1, 1 - r2
        P = f[1] + (f[2] - f[1]) * r1 + (f[3] - f[1]) * r2
        if any((P.x - x) ** 2 + (P.y - y) ** 2 < r * r for x, y, r in obstacles): continue
        if any(a <= P.x <= c and b <= P.y <= d for a, b, c, d in solid_boxes): continue
        if any((P.x - q['x']) ** 2 + (P.y - q['y']) ** 2 < 1.0 for q in people): continue
        people.append(dict(x=round(P.x, 2), y=round(P.y, 2), z=round(P.z, 3), rot=round(random.uniform(0, 6.283), 2),
                           kind=random.randint(0, 5)))

lb = {}
for l in LAYER_IDS:
    b = layer_bounds[l]
    if b[0][0] < 1e8: lb[l] = dict(min=b[0].round(2).tolist(), max=b[1].round(2).tolist(), objects=layer_objects[l])

all_mn = np.min([np.array(v['min']) for v in lb.values()], axis=0)
all_mx = np.max([np.array(v['max']) for v in lb.values()], axis=0)
proj = [k for k in lb if k not in ('entorno', 'outros')]
proj_mn = np.min([np.array(lb[k]['min']) for k in proj], axis=0)
proj_mx = np.max([np.array(lb[k]['max']) for k in proj], axis=0)

# ---------------------------------------------------------------- planta 2D por camada
PLAN_W_PX = 4096
margin = 30.0
px0, py0 = float(proj_mn[0] - margin), float(proj_mn[1] - margin)
px1, py1 = float(proj_mx[0] + margin), float(proj_mx[1] + margin)
W = px1 - px0; H = py1 - py0
PLAN_H_PX = int(round(PLAN_W_PX * H / W))
plan = dict(xmin=px0, ymin=py0, xmax=px1, ymax=py1, width_px=PLAN_W_PX, height_px=PLAN_H_PX,
            meters_per_px=W / PLAN_W_PX, layers=[],
            note='Planta ortografica gerada do mesmo modelo R07, mesma origem local (E 700080 / N 7070350). '
                 'u=(x-xmin)/(xmax-xmin)*width_px ; v=(ymax-y)/(ymax-ymin)*height_px (coordenadas Blender).')

if not SEM_PLANTA:
    cam_data = bpy.data.cameras.new('WEB_PLAN_TMP'); cam_data.type = 'ORTHO'; cam_data.ortho_scale = W
    cam_data.sensor_fit = 'HORIZONTAL'; cam_data.clip_start = 1; cam_data.clip_end = 2000
    cam = bpy.data.objects.new('WEB_PLAN_TMP', cam_data); scene.collection.objects.link(cam)
    cam.location = ((px0 + px1) / 2, (py0 + py1) / 2, 600); cam.rotation_euler = (0, 0, 0)
    scene.camera = cam
    r = scene.render
    r.engine = 'BLENDER_WORKBENCH'; r.resolution_x = PLAN_W_PX; r.resolution_y = PLAN_H_PX; r.resolution_percentage = 100
    r.film_transparent = True; r.image_settings.file_format = 'PNG'; r.image_settings.color_mode = 'RGBA'
    r.use_border = False
    sh = scene.display.shading
    sh.light = 'STUDIO'; sh.color_type = 'MATERIAL'; sh.show_shadows = True; sh.shadow_intensity = 0.35
    sh.show_cavity = True; sh.cavity_type = 'WORLD'; sh.show_object_outline = True; sh.object_outline_color = (0.12, 0.12, 0.12)
    scene.display.light_direction = (0.35, -0.45, 0.82)
    scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.35
    try: scene.display.render_aa = '8'
    except Exception: pass
    orig_hide = {o.name: o.hide_render for o in scene.objects}
    for lay_id, label, order in (LAYERS if '--camadas-planta' in argv else []):
        if lay_id not in lb: continue
        members = {n for n, ls in report_objs if lay_id in ls}
        for o in objs: o.hide_render = o.name not in members
        fp = OUT / 'plan' / f'{order:02d}_{lay_id}.png'
        r.filepath = str(fp)
        bpy.ops.render.render(write_still=True)
        plan['layers'].append(dict(id=lay_id, label=label, order=order, file=f'plan/{fp.name}'))
        print('PLAN', lay_id, round(time.time() - t0, 1))
    for o in objs: o.hide_render = orig_hide[o.name]
    # composicao completa (todas as camadas juntas, com sombras entre elas)
    r.filepath = str(OUT / 'plan' / '00_completa.png')
    bpy.ops.render.render(write_still=True)
    plan['composite'] = 'plan/00_completa.png'

manifest = dict(
    source=dict(file=SRC.name, path=str(SRC), sha256=sha, exported_at=time.strftime('%Y-%m-%d %H:%M:%S'),
                note='Arquivo fonte aberto somente para leitura; nenhuma gravacao realizada.'),
    frame=dict(origin_utm='E 700080 / N 7070350 (origem local do CAD, metros)',
               blender_to_three='three(x, y, z) = blender(x, z, -y)', units='metros'),
    stats=dict(renderable_objects=n_obj, triangles=int(tris_total), glb_nodes=nn, glb_bytes=size),
    layers=[dict(id=l, label=lab, order=o_, **lb[l]) for l, lab, o_ in LAYERS if l in lb],
    materials=materials,
    bounds_all=dict(min=all_mn.tolist(), max=all_mx.tolist()),
    bounds_project=dict(min=proj_mn.tolist(), max=proj_mx.tolist()),
    key_elements=key_elements, plan=plan)

(OUT / 'data' / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding='utf-8')
(OUT / 'data' / 'semantic.json').write_text(json.dumps(dict(trees=trees, lamps=lamps, benches=benches, people=people,
    people_note='Humanizacao ilustrativa: pontos aleatorios em passeios do modelo; nao representa fluxo ou contagem.'),
    ensure_ascii=False), encoding='utf-8')
(OUT / 'data' / 'cameras.json').write_text(json.dumps(cams, ensure_ascii=False, indent=1), encoding='utf-8')
(Path(__file__).parent / 'CLASSIFICACAO_OBJETOS.json').write_text(json.dumps(report_objs, ensure_ascii=False), encoding='utf-8')
print('DONE', round(time.time() - t0, 1), 's', 'trees', len(trees), 'lamps', len(lamps), 'benches', len(benches), 'people', len(people))
# Importante: NAO salvar o .blend. Encerrar sem gravar.
bpy.ops.wm.quit_blender()
