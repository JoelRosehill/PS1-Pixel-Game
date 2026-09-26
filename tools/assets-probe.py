import bpy
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
inventory = json.loads((root / 'assets/.work/inventory.json').read_text('utf8'))
names = sys.argv[sys.argv.index('--') + 1:]
for pack in inventory['packs']:
    if pack['id'] not in names:
        continue
    source = root / pack['sources'][0]['path']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    if source.suffix == '.blend':
        bpy.ops.wm.open_mainfile(filepath=str(source), load_ui=False, use_scripts=False)
    else:
        bpy.ops.import_scene.fbx(filepath=str(source))
    info = {
        'objects': [{'name': o.name, 'type': o.type, 'size': list(o.dimensions), 'rotation': list(o.rotation_euler),
                     'modifiers': [m.type for m in o.modifiers],
                     'colours': [a.name for a in o.data.color_attributes] if o.type == 'MESH' else [],
                     'materials': [m.name if m else None for m in o.data.materials] if o.type == 'MESH' else []} for o in bpy.context.scene.objects],
        'materials': [{'name': m.name, 'diffuse': list(m.diffuse_color),
                       'nodes': [{'name': n.name, 'type': n.type, 'image': n.image.name if n.type == 'TEX_IMAGE' and n.image else None} for n in m.node_tree.nodes] if m.node_tree else []} for m in bpy.data.materials],
        'images': [{'name': i.name, 'path': i.filepath, 'packed': bool(i.packed_file), 'size': list(i.size)} for i in bpy.data.images]
    }
    (root / ('assets/.work/probe-' + pack['id'] + '.json')).write_text(json.dumps(info, indent=2, ensure_ascii=False), 'utf8')
