"""Bake static architectural AO in Blender, with one padded UV1 atlas per region.

Run through blender.mjs; optional stage is a region name for a targeted rebake.
Cycles uses its native worker threads. The glTF exporter preserves the original
UV0 mineral textures and adds standard occlusionTexture bindings on UV1.
"""
import json
import math
import time
from pathlib import Path

import bpy
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
CONFIGS = json.loads(Path(__file__).with_name('lighting-bakes.json').read_text())


def region_of(obj):
    return obj.name.split(' ')[1] if obj.name.startswith('Environment ') else None


def get_targets(collection, config):
    groups = {region: [] for region in config['regions']}
    for obj in collection.objects:
        region = region_of(obj)
        if obj.type != 'MESH' or obj.parent or region not in groups:
            continue
        mat = obj.data.materials[0] if obj.data.materials else None
        original = mat.get('pwc_ao_source', mat.name) if mat else ''
        if any(original.startswith(prefix) for prefix in config['materialPrefixes']):
            groups[region].append(obj)
    for region, objects in groups.items():
        if not objects:
            raise RuntimeError('No AO receivers found in ' + region)
    return groups


def unwrap(objects, config):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        uv = obj.data.uv_layers.get(config['uv']) or obj.data.uv_layers.new(name=config['uv'])
        obj.data.uv_layers.active = uv
        obj.select_set(True)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=.006,
                             area_weight=.2, correct_aspect=True)
    bpy.ops.object.mode_set(mode='OBJECT')
    # Exporter assigns the active render UV to TEXCOORD_0; preserve the mineral map.
    for obj in objects:
        obj.data.uv_layers[0].active_render = True


def attach_ao(objects, image, region, config):
    group = bpy.data.node_groups.get('glTF Material Output')
    if not group:
        group = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
        group.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    materials = {}
    for obj in objects:
        base = obj.data.materials[0]
        if base.get('pwc_ao_region') == region:
            mat = base
        elif base in materials:
            mat = materials[base]
        else:
            mat = base.copy()
            mat.name = base.name + ' AO ' + region
            mat['pwc_ao_source'] = base.get('pwc_ao_source', base.name)
            mat['pwc_ao_region'] = region
            materials[base] = mat
        obj.data.materials[0] = mat
        nodes = mat.node_tree.nodes
        for node in list(nodes):
            if node.label == 'Architectural AO':
                nodes.remove(node)
        uv = nodes.new('ShaderNodeUVMap');uv.uv_map = config['uv'];uv.label = 'Architectural AO'
        texture = nodes.new('ShaderNodeTexImage');texture.image = image;texture.label = 'Architectural AO'
        settings = nodes.new('ShaderNodeGroup');settings.node_tree = group;settings.label = 'Architectural AO'
        mat.node_tree.links.new(uv.outputs['UV'], texture.inputs['Vector'])
        mat.node_tree.links.new(texture.outputs['Color'], settings.inputs['Occlusion'])
        obj['pwc_ao_region'] = region


def bake_region(objects, config, region, directory):
    start = time.perf_counter()
    unwrap(objects, config)
    resolution = config['regions'][region]
    name = 'OBS AO ' + region
    image = bpy.data.images.get(name)
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new(name, resolution, resolution, alpha=False)
    image.colorspace_settings.name = 'Non-Color'
    image.generated_color = (1, 1, 1, 1)
    image.pixels.foreach_set(np.ones(resolution * resolution * 4, np.float32))
    mat = bpy.data.materials.new('Temporary AO bake ' + region);mat.use_nodes = True
    nodes = mat.node_tree.nodes;nodes.clear()
    output = nodes.new('ShaderNodeOutputMaterial')
    emission = nodes.new('ShaderNodeEmission')
    ao = nodes.new('ShaderNodeAmbientOcclusion');ao.samples = config['samples']
    ao.inputs['Distance'].default_value = config['distance']
    scale = nodes.new('ShaderNodeMath');scale.operation = 'MULTIPLY_ADD'
    scale.inputs[1].default_value = config['strength'];scale.inputs[2].default_value = 1 - config['strength']
    mat.node_tree.links.new(ao.outputs['AO'], scale.inputs[0])
    mat.node_tree.links.new(scale.outputs[0], emission.inputs['Color'])
    mat.node_tree.links.new(emission.outputs[0], output.inputs['Surface'])
    target = nodes.new('ShaderNodeTexImage');target.image = image;nodes.active = target
    originals = {obj: list(obj.data.materials) for obj in objects}
    try:
        for obj in objects:
            obj.data.materials.clear();obj.data.materials.append(mat)
        bpy.ops.object.bake(type='EMIT', use_clear=False, margin=config['margin'],
                            margin_type='EXTEND', uv_layer=config['uv'])
    finally:
        for obj, materials in originals.items():
            obj.data.materials.clear()
            for original in materials:
                obj.data.materials.append(original)
        bpy.data.materials.remove(mat)
    pixels = np.empty(resolution * resolution * 4, np.float32)
    image.pixels.foreach_get(pixels)
    values = pixels.reshape(-1, 4)[:, 0]
    dark = float(np.mean(values < .97))
    if not np.isfinite(values).all() or dark < .005 or values.min() < .30:
        raise RuntimeError(f'{region}: AO bake is empty or invalid: range {values.min()}..{values.max()}, coverage {dark}')
    image.filepath_raw = str(directory / (region + '-ao.png'));image.file_format = 'PNG'
    image.save();image.pack()
    attach_ao(objects, image, region, config)
    result = {'region': region, 'objects': len(objects), 'resolution': resolution,
              'seconds': time.perf_counter() - start, 'minimum': float(values.min()),
              'mean': float(values.mean()), 'occludedFraction': dark,
              'pngBytes': Path(image.filepath_raw).stat().st_size}
    print('AO BAKED ' + json.dumps(result), flush=True)
    return result


def bake_environment_ao(collection, scene, target='all', asset='observatory'):
    config = CONFIGS[asset]
    groups = get_targets(collection, config)
    directory = ROOT / 'output/third-person-controller/source/ao' / asset
    directory.mkdir(parents=True, exist_ok=True)
    hidden = {obj: obj.hide_render for obj in scene.objects}
    engine = scene.render.engine
    samples = scene.cycles.samples
    device = scene.cycles.device
    results = []
    try:
        # Collision proxies, the explorer and moving rotors must never enter a static bake.
        for obj in scene.objects:
            obj.hide_render = obj.name not in collection.objects or bool(obj.parent)
        scene.render.engine = 'CYCLES';scene.cycles.device = 'CPU';scene.cycles.samples = 1
        for region, objects in groups.items():
            if target not in ('all', 'full', region):
                continue
            results.append(bake_region(objects, config, region, directory))
    finally:
        for obj, value in hidden.items():
            obj.hide_render = value
        scene.render.engine = engine;scene.cycles.samples = samples;scene.cycles.device = device
    if not results:
        raise RuntimeError('Unknown AO region: ' + target)
    # Coverage audit runs before the caller can export a partial or stale delivery.
    for region, objects in groups.items():
        for obj in objects:
            if obj.get('pwc_ao_region') != region:
                raise RuntimeError('Missing AO receiver: ' + obj.name)
    (directory / ('report-' + target + '.json')).write_text(json.dumps(results, indent=2))
    return results


if __name__ == '__main__' or 'PWC_STAGE' in globals():
    config = CONFIGS['observatory'];scene = bpy.data.scenes[config['scene']]
    bpy.context.window.scene = scene;scene.frame_set(0)
    collection = next(c for c in scene.collection.children if c.name.startswith(config['collectionPrefix']))
    bake_environment_ao(collection, scene, globals().get('PWC_STAGE', 'all'))
    script = Path(__file__).with_name('animate_environment.py')
    helpers = {'__file__': str(script), '__name__': 'ao_export'}
    exec(compile(script.read_text(), str(script), 'exec'), helpers)
    source = ROOT / 'output/third-person-controller/source'
    helpers['export_environment'](collection, source / 'uncompressed/observatory-environment.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(source / 'observatory.blend'))
