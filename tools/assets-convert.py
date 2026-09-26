"""Run with Blender --background --factory-startup --disable-autoexec --python.

Original downloads are never edited. Each pack becomes one self-contained GLB.
Textures retain base colour/alpha and emission; expensive PBR maps are omitted.
"""
import argparse
import json
import math
import pathlib
import re
import sys
import traceback

import bpy
import bmesh

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'public' / 'models'
WORK = ROOT / 'assets' / '.work'
OUT.mkdir(parents=True, exist_ok=True)
parser = argparse.ArgumentParser()
parser.add_argument('--only', default='')
parser.add_argument('--force', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
selected = set(args.only.split(',')) if args.only else None
VERSION = 5


def budget(name):
    if 'dragon' in name:
        return 12000
    if any(w in name for w in ('forest', 'landscape', 'castle', 'church', 'lost-relic')):
        return 24000
    if any(w in name for w in ('demon', 'monster', 'character', 'nemesis')):
        return 6000
    if any(w in name for w in ('pack', 'graveyard')):
        return 8000
    if any(w in name for w in ('sword', 'axe', 'scimitar', 'sickle', 'machete')):
        return 1200
    return 2400


def tris(mesh):
    return sum(max(0, len(p.vertices) - 2) for p in mesh.polygons)


def image_from(socket, seen=None):
    seen = seen or set()
    for link in socket.links:
        node = link.from_node
        if node in seen:
            continue
        seen.add(node)
        if node.type == 'TEX_IMAGE' and node.image:
            return node.image
        if node.type not in ('NORMAL_MAP', 'BUMP'):
            for inp in node.inputs:
                found = image_from(inp, seen)
                if found:
                    return found
    return None


def convert(pack):
    name = pack['id']
    target = OUT / (name + '.glb')
    report_path = WORK / (name + '.report.json')
    if not args.force and target.exists() and report_path.exists():
        report = json.loads(report_path.read_text('utf8'))
        if report.get('version') == VERSION and report.get('sha256') == pack['sha256'] and report.get('status') == 'ok':
            return report
    # Castle XIII ships the same set in OBJ and DAE. Prefer the supported OBJ;
    # record both source paths rather than shipping duplicate runtime geometry.
    order = {'glb': 0, 'gltf': 1, 'blend': 2, 'fbx': 3, 'obj': 4, 'dae': 5}
    sources = sorted(pack['sources'], key=lambda s: order.get(s['format'], 99))
    if not sources:
        raise RuntimeError('No model source found')
    source = sources[0]
    src = ROOT / source['path']
    print('CONVERT ' + name, flush=True)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    fmt = source['format']
    if fmt == 'blend':
        bpy.ops.wm.open_mainfile(filepath=str(src), load_ui=False, use_scripts=False)
    elif fmt in ('glb', 'gltf'):
        bpy.ops.import_scene.gltf(filepath=str(src))
    elif fmt == 'fbx':
        bpy.ops.import_scene.fbx(filepath=str(src), use_anim=not any(w in name for w in ('forest', 'landscape', 'castle', 'church')))
    elif fmt == 'obj':
        bpy.ops.wm.obj_import(filepath=str(src))
    else:
        raise RuntimeError('Unsupported source: ' + fmt)

    print('IMPORTED ' + name, flush=True)
    warnings = []
    # Do not export source cameras/lights or subdivision intended for offline renders.
    for obj in list(bpy.data.objects):
        if obj.type in ('CAMERA', 'LIGHT'):
            bpy.data.objects.remove(obj, do_unlink=True)
        elif name == 'lowpoly-castle' and obj.type == 'MESH' and any(
                slot.material and slot.material.node_tree and any(
                    n.type == 'TEX_IMAGE' and n.image and n.image.name.lower() in ('sky.png', 'moon.png', 'cloud.png', 'bloom.png')
                    for n in slot.material.node_tree.nodes) for slot in obj.material_slots):
            warnings.append('Omitted source presentation backdrop: ' + obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        raise RuntimeError('Source contains no meshes')
    original = sum(tris(o.data) for o in meshes)
    print(f'GEOMETRY {name}: {len(meshes)} meshes, {original} triangles', flush=True)
    limit = budget(name)
    # Full environment scenes often contain thousands of separate static tree
    # objects. Join them once before decimation (and reduce runtime draw calls).
    # Modular kits and animated characters keep their individual nodes/rigs.
    if len(meshes) > 100 and not any(o.find_armature() or o.animation_data for o in meshes):
        bpy.ops.object.select_all(action='DESELECT')
        for obj in meshes:
            obj.hide_set(False)
            obj.hide_viewport = False
            obj.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        bpy.ops.object.join()
        meshes = [bpy.context.view_layer.objects.active]
        warnings.append('Merged static environment objects to reduce draw calls')
    for obj in meshes:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        for mod in list(obj.modifiers):
            if mod.type in ('SUBSURF', 'MULTIRES'):
                obj.modifiers.remove(mod)
                warnings.append('Removed offline subdivision from ' + obj.name)
    ratio = min(1.0, limit / max(1, original) * 0.96)
    if original > limit:
        done = set()
        for obj in meshes:
            key = obj.data.as_pointer()
            if key in done or tris(obj.data) < 24:
                continue
            done.add(key)
            # Linked copies share one reduced mesh. Decimation retains UVs, material
            # boundaries and vertex groups, so skinning remains available.
            shared = [o for o in meshes if o.data == obj.data]
            if obj.data.shape_keys:
                warnings.append('Retained shape keys without decimation: ' + obj.name)
                continue
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            obj.data = obj.data.copy()
            # Some downloaded architecture duplicates vertices at every face.
            # Welding coincident positions allows decimation to simplify surfaces;
            # UVs remain on face corners, so texture seams are retained.
            bm = bmesh.new()
            bm.from_mesh(obj.data)
            extent = max((v.co.length for v in bm.verts), default=1)
            bmesh.ops.remove_doubles(bm, verts=list(bm.verts), dist=max(1e-7, extent * 1e-7))
            bm.to_mesh(obj.data)
            bm.free()
            obj.data.validate()
            mod = obj.modifiers.new('Game polygon budget', 'DECIMATE')
            mod.ratio = ratio
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            for other in shared:
                other.data = obj.data
    reduced = sum(tris(o.data) for o in meshes)
    # Decimate targets faces, whereas the runtime pays for triangulated n-gons.
    # Re-measure triangles and refine when a source contains many n-gons/islands.
    for attempt in range(3):
        if reduced <= limit:
            break
        before_pass = reduced
        seen = set()
        for obj in meshes:
            if obj.data.as_pointer() in seen or obj.data.shape_keys or tris(obj.data) < 24:
                continue
            shared = [other for other in meshes if other.data == obj.data]
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            if obj.data.users > 1:
                obj.data = obj.data.copy()
            mod = obj.modifiers.new('Triangle budget refinement', 'DECIMATE')
            mod.ratio = max(0.01, limit / reduced * 0.8)
            mod.use_collapse_triangulate = True
            bpy.ops.object.modifier_apply(modifier=mod.name)
            obj.data.validate()
            for other in shared:
                other.data = obj.data
            seen.add(obj.data.as_pointer())
        reduced = sum(tris(o.data) for o in meshes)
        if reduced >= before_pass * 0.99:
            warnings.append('Topology limits simplification without removing disconnected details')
            break
    if reduced > limit:
        warnings.append(f'Triangle budget exceeded to retain source details: {reduced} > {limit}')
    print(f'REDUCED {name}: {reduced} triangles', flush=True)

    images_on_disk = [p for p in (ROOT / pack['folder']).rglob('*') if p.suffix.lower() in ('.png', '.jpg', '.jpeg', '.tga', '.bmp', '.webp')]
    by_name = {p.name.lower(): p for p in images_on_disk}
    candidates = [p for p in by_name.values() if not re.search(r'normal|rough|metal|specular|emission|(?:^|_)ao|ground_ao|opacity', p.name, re.I)]
    texture_info = []
    image_cache = {}
    baked = WORK / 'textures' / name
    baked.mkdir(parents=True, exist_ok=True)

    def prepare(image):
        if image is None:
            return None
        key = image.as_pointer()
        if key in image_cache:
            return image_cache[key]
        # Blender loads image pixels lazily: has_data can be false for a valid
        # newly imported/packed image. Touch size/pixels before deciding it is missing.
        loaded = image.size[0] > 0 and len(image.pixels) > 0
        if not loaded:
            filename = pathlib.PureWindowsPath(image.filepath).name.lower()
            found = by_name.get(filename) or by_name.get(image.name.lower())
            if not found:
                stem = pathlib.Path(filename or re.sub(r'\.\d{3}$', '', image.name)).stem.lower()
                found = next((p for p in by_name.values() if p.stem.lower() == stem), None)
            if found:
                image.filepath = str(found)
                image.reload()
        if not image.size[0] or not len(image.pixels):
            warnings.append('Missing image: ' + image.name)
            image_cache[key] = None
            return None
        before = list(image.size)
        scale = min(1, 256 / max(before))
        dims = [max(1, round(d * scale)) for d in before]
        if dims != before:
            image.scale(*dims)
        image.file_format = 'PNG'
        image.filepath_raw = str(baked / (str(len(texture_info)) + '.png'))
        image.save()
        texture_info.append({'name': image.name, 'before': before, 'after': list(image.size)})
        # Imported GLBs retain their original packed bytes even after image.scale.
        # Load the saved reduced PNG as a fresh datablock so the exporter cannot
        # silently embed the old full-resolution packed payload.
        optimized = bpy.data.images.load(image.filepath_raw, check_existing=False)
        optimized.colorspace_settings.name = image.colorspace_settings.name
        optimized.pack()
        image_cache[key] = optimized
        return optimized

    for obj in meshes:
        if not obj.data.materials:
            obj.data.materials.append(bpy.data.materials.new(obj.name + ' colour'))
    materials = {slot.material for obj in meshes for slot in obj.material_slots if slot.material}
    for mat in materials:
        base = None
        emission = None
        rgba = list(mat.diffuse_color)
        glow = [0, 0, 0, 1]
        strength = 0
        alpha = False
        vertex_layer = None
        if mat.use_nodes and mat.node_tree:
            principled = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if principled:
                rgba = list(principled.inputs['Base Color'].default_value)
                base = image_from(principled.inputs['Base Color'])
                emission = image_from(principled.inputs['Emission Color'])
                glow = list(principled.inputs['Emission Color'].default_value)
                strength = principled.inputs['Emission Strength'].default_value
                alpha = bool(principled.inputs['Alpha'].links) or principled.inputs['Alpha'].default_value < 0.99
                for link in principled.inputs['Base Color'].links:
                    if link.from_node.type == 'VERTEX_COLOR':
                        vertex_layer = link.from_node.layer_name
            if base is None:
                base = next((n.image for n in mat.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image and not re.search(r'normal|rough|metal|specular|emission|_ao', n.image.name, re.I)), None)
        base = prepare(base)
        if base is None and len(candidates) == 1:
            base = prepare(bpy.data.images.load(str(candidates[0]), check_existing=True))
            warnings.append('Recovered colour texture from pack: ' + mat.name)
        emission = prepare(emission)
        mat.use_nodes = True
        tree = mat.node_tree
        tree.nodes.clear()
        output = tree.nodes.new('ShaderNodeOutputMaterial')
        shader = tree.nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Base Color'].default_value = rgba
        shader.inputs['Roughness'].default_value = 1
        shader.inputs['Metallic'].default_value = 0
        shader.inputs['Emission Color'].default_value = glow
        shader.inputs['Emission Strength'].default_value = min(strength, 2)
        tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        if base:
            tex = tree.nodes.new('ShaderNodeTexImage')
            tex.image = base
            tex.interpolation = 'Closest'
            tree.links.new(tex.outputs['Color'], shader.inputs['Base Color'])
            if alpha:
                tree.links.new(tex.outputs['Alpha'], shader.inputs['Alpha'])
                mat.surface_render_method = 'DITHERED'
        elif vertex_layer is not None:
            vertex = tree.nodes.new('ShaderNodeVertexColor')
            vertex.layer_name = vertex_layer
            tree.links.new(vertex.outputs['Color'], shader.inputs['Base Color'])
        if emission:
            tex = tree.nodes.new('ShaderNodeTexImage')
            tex.image = emission
            tex.interpolation = 'Closest'
            tree.links.new(tex.outputs['Color'], shader.inputs['Emission Color'])

    bpy.context.scene.frame_set(bpy.context.scene.frame_start)
    bpy.context.view_layer.update()
    kwargs = dict(filepath=str(target), export_format='GLB', export_image_format='AUTO',
                  export_texcoords=True, export_normals=True, export_materials='EXPORT',
                  export_animations=True, export_skins=True, export_morph=True,
                  export_cameras=False, export_lights=False, export_yup=True,
                  export_extras=False, export_apply=False)
    props = bpy.ops.export_scene.gltf.get_rna_type().properties
    kwargs = {k: v for k, v in kwargs.items() if k in props}
    bpy.ops.export_scene.gltf(**kwargs)
    report = dict(id=name, status='ok', version=VERSION, sha256=pack['sha256'],
                  source=source['path'], alternateSources=[s['path'] for s in sources[1:]],
                  url='models/' + target.name, bytes=target.stat().st_size,
                  sourceTriangles=original, optimizedTriangles=reduced, triangleBudget=limit,
                  meshes=len(meshes), textures=texture_info, warnings=sorted(set(warnings)),
                  license={'status': 'unverified', 'notices': pack['notices']},
                  blender=bpy.app.version_string)
    report_path.write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n', 'utf8')
    print(f'DONE {name}: {original:,} -> {reduced:,} triangles; {target.stat().st_size:,} bytes', flush=True)
    return report


inventory = json.loads((WORK / 'inventory.json').read_text('utf8'))
failures = []
for pack in sorted(inventory['packs'], key=lambda p: any(w in p['id'] for w in ('a-forest-3', 'landscape'))):
    if selected and pack['id'] not in selected:
        continue
    try:
        convert(pack)
    except Exception as error:
        traceback.print_exc()
        failures.append(pack['id'])
        (WORK / (pack['id'] + '.report.json')).write_text(json.dumps({'id': pack['id'], 'status': 'failed', 'error': str(error)}, indent=2), 'utf8')
print('CONVERSION FAILURES: ' + json.dumps(failures), flush=True)
if failures:
    sys.exit(1)
