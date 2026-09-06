"""Smooth the baked walk's grounding corrections without runtime pose offsets."""
import json
import math
from pathlib import Path

import bpy
from mathutils import Vector


def smooth_walk(scene, rig, action, sole_mesh, sole_vertices):
    if action.get('pwc_smooth_walk'):
        raise ValueError('Walk is already smoothed; rebuild from source before processing again')
    rig.animation_data.action = action
    rig.animation_data.action_slot = action.slots[0]
    start, end = action.frame_range
    count = round(end - start)
    pelvis = rig.pose.bones['pelvis']
    heights = []
    for i in range(count + 1):
        scene.frame_set(round(start) + i)
        heights.append((rig.matrix_world @ pelvis.matrix).translation.z)
    # The former subframe safety pass treated the two ends differently. Use a
    # periodic filter so the contact correction and its velocity close together.
    heights[0] = (heights[0] + heights[-1]) * .5
    heights = heights[:-1]
    weights = [math.exp(-i*i / (2 * .9**2)) for i in range(-5, 6)]
    smooth = [sum(heights[(i+j) % count] * w for j, w in zip(range(-5, 6), weights)) / sum(weights)
              for i in range(count)]

    def raise_pelvis(amount, frame):
        basis = rig.matrix_world @ pelvis.parent.matrix @ pelvis.parent.bone.matrix_local.inverted() @ pelvis.bone.matrix_local
        pelvis.location += basis.to_3x3().inverted() @ Vector((0, 0, amount))
        pelvis.keyframe_insert('location', frame=frame)

    for i in range(count + 1):
        frame = round(start) + i
        scene.frame_set(frame)
        height = (rig.matrix_world @ pelvis.matrix).translation.z
        raise_pelvis(smooth[i % count] - height, frame)

    def contacts():
        values = []
        for i in range(count * 8 + 1):
            frame = start + i / 8
            scene.frame_set(int(frame), subframe=frame-int(frame))
            evaluated = sole_mesh.evaluated_get(bpy.context.evaluated_depsgraph_get())
            mesh = evaluated.to_mesh()
            values.append(min((evaluated.matrix_world @ mesh.vertices[j].co).z for j in sole_vertices))
            evaluated.to_mesh_clear()
        return values

    # A single constant clearance offset preserves the smoothed waveform. Avoid
    # another per-frame max() correction, which would reintroduce the sharp dips.
    lift = max(0, .0067 - min(contacts()))
    for i in range(count + 1):
        frame = round(start) + i
        scene.frame_set(frame)
        raise_pelvis(lift, frame)
    contact = contacts()
    assert min(contact) >= .0066, min(contact)
    assert max(contact) < .025, max(contact)
    # glTF holds the first pose until its first timestamp. Remove that leading
    # frame from this looping clip instead of freezing briefly every stride.
    for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
        for key in curve.keyframe_points:
            key.co.x -= start
            key.interpolation = 'LINEAR'
    action['pwc_smooth_walk'] = True
    return {'minimumSoleZ': min(contact), 'maximumLowestSoleZ': max(contact), 'constantClearanceLift': lift,
            'duration': count / scene.render.fps, 'samples': len(contact)}


if __name__ == '__main__' or 'PWC_STAGE' in globals():
    root = Path(__file__).resolve().parents[2]
    scene = bpy.data.scenes['PWC Owl Wayfarer']
    bpy.context.window.scene = scene
    rig = next(o for o in scene.objects if o.type == 'ARMATURE')
    collection = next(c for c in scene.collection.children if c.name.startswith('Owl Wayfarer geometry'))
    sole_mesh = next(o for o in collection.objects if 'Charcoal joints' in o.name)
    groups = {g.index for g in sole_mesh.vertex_groups if g.name in ('foot_l', 'foot_r', 'ball_l', 'ball_r')}
    vertices = [v.index for v in sole_mesh.data.vertices if sum(g.weight for g in v.groups if g.group in groups) > .99]
    strip = next(t for t in rig.animation_data.nla_tracks if t.name == 'Walk').strips[0]
    backup = strip.action.copy()
    backup.name = 'OWL Walk before smoothing'
    backup.use_fake_user = True
    report = smooth_walk(scene, rig, strip.action, sole_mesh, vertices)
    strip.frame_start = 0
    strip.action_frame_start = 0
    strip.action_frame_end = strip.action.frame_range[1]
    strip.frame_end = strip.action_frame_end
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    scene.frame_set(0)
    bpy.ops.object.select_all(action='DESELECT')
    rig.select_set(True)
    for obj in collection.objects:
        obj.select_set(True)
    source = root / 'output/third-person-controller/source'
    bpy.ops.export_scene.gltf(
        filepath=str(source / 'uncompressed/observatory-character.glb'), export_format='GLB',
        use_selection=True, use_active_scene=True, export_animations=True,
        export_animation_mode='NLA_TRACKS', export_force_sampling=True,
        export_cameras=False, export_lights=False, export_def_bones=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(source / 'owl-wayfarer/owl-wayfarer.blend'))
    (source / 'owl-wayfarer/walk-smoothing.json').write_text(json.dumps(report, indent=2))
    print(json.dumps(report))
