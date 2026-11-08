"""Prepare the official CC0 Standard ZIP as a texture-free embedded GLB.
Usage: python3 scripts/prepare-base.py base-standard.zip base-clean.glb
"""
import json, struct, sys, zipfile
from pathlib import Path
with zipfile.ZipFile(sys.argv[1]) as z:
    name = next(n for n in z.namelist() if n.endswith('Godot - UE/Superhero_Male_FullBody.gltf'))
    doc = json.loads(z.read(name))
    binary = z.read(name.replace('.gltf', '.bin'))
for key in ('images', 'textures', 'samplers'):
    doc.pop(key, None)
doc['materials'] = [{'name': 'White mannequin', 'pbrMetallicRoughness': {'baseColorFactor': [.93,.93,.92,1], 'metallicFactor': 0, 'roughnessFactor': .7}}]
for mesh in doc['meshes']:
    for primitive in mesh['primitives']:
        primitive['material'] = 0
excluded = {i for i,n in enumerate(doc['nodes']) if n.get('name') in ('Eyes','Eyebrows')}
for node in doc['nodes']:
    if 'children' in node:
        node['children'] = [i for i in node['children'] if i not in excluded]
doc['buffers'] = [{'byteLength': len(binary)}]
text = json.dumps(doc, separators=(',', ':')).encode()
text += b' ' * (-len(text) % 4)
binary += b'\0' * (-len(binary) % 4)
Path(sys.argv[2]).write_bytes(struct.pack('<III',0x46546c67,2,28+len(text)+len(binary)) + struct.pack('<II',len(text),0x4e4f534a) + text + struct.pack('<II',len(binary),0x004e4942) + binary)
