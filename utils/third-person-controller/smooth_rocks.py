"""Soften small support-cliff facets while retaining the authored rock silhouette."""
import math
from pathlib import Path

import bpy


def smooth_support_rocks(collection):
    results = []
    for obj in collection.objects:
        if obj.type != 'MESH' or not obj.name.startswith('Environment valley Layered bedrock'):
            continue
        mesh = obj.data
        # Clearing custom normals makes repeated exports/rebuilds idempotent.
        # Blender marks additional sharp edges when storing distinct custom corner
        # normals. Remove both layers before calculating the original angle groups.
        for name in ('custom_normal', 'sharp_edge'):
            attribute = mesh.attributes.get(name)
            if attribute:
                mesh.attributes.remove(attribute)
        for face in mesh.polygons:
            face.use_smooth = True
        mesh.set_sharp_from_angle(angle=math.radians(55))
        mesh.update()
        averaged = [corner.vector.copy() for corner in mesh.corner_normals]
        normals = [None] * len(mesh.loops)
        for face in mesh.polygons:
            for index in face.loop_indices:
                # Retain a quarter of each facet's normal for weathered, layered rock.
                normals[index] = face.normal.lerp(averaged[index], .75).normalized()
        mesh.normals_split_custom_set(normals)
        results.append({'name': obj.name, 'faces': len(mesh.polygons)})
    if not results:
        raise RuntimeError('Support-cliff batch was not found.')
    return results


if __name__ == '__main__' or 'PWC_STAGE' in globals():
    root = Path(__file__).resolve().parents[2]
    scene = bpy.data.scenes['PWC Observatory']
    bpy.context.window.scene = scene
    scene.frame_set(0)
    collection = next(c for c in scene.collection.children if c.name.startswith('Observatory Environment'))
    print(smooth_support_rocks(collection))
    script = Path(__file__).with_name('animate_environment.py')
    helpers = {'__file__': str(script), '__name__': 'rock_export'}
    exec(compile(script.read_text(), str(script), 'exec'), helpers)
    source = root / 'output/third-person-controller/source'
    helpers['export_environment'](collection, source / 'uncompressed/observatory-environment.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(source / 'observatory.blend'))
