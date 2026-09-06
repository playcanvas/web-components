"""Bake the monument's parent-axis motion in Blender and export one looping GLB clip.

Run through blender.mjs to update the existing Observatory scene, or call from create_scene.py.
"""
import math
from pathlib import Path

import bpy
from mathutils import Quaternion, Vector

CLIP = 'Observatory_Loop'
DURATION = 720  # Common period of the four original rotation speeds.
ROTORS = (
    ('Armillary Inner Meridian', (0, 1, 0), 6),
    ('Armillary Inner Equator', (1, 0, 0), 4.5),
    ('Armillary Inner Ecliptic', (0, 1, 0), -8),
    ('Armillary Celestial Core', (0, 1, 0), 12),
)


def bake_monument(collection, scene):
    scene.frame_set(1)
    fps = scene.render.fps / scene.render.fps_base
    scene.frame_start = 0
    scene.frame_end = round(DURATION * fps)
    for name, axis, speed in ROTORS:
        obj = collection.objects[name]
        # Retain the authored pose on repeat exports, not a currently evaluated pose.
        bind_rotation = Quaternion(obj.get('pwc_bind_rotation', obj.rotation_quaternion[:]))
        bind_position = Vector(obj.get('pwc_bind_position', obj.location[:]))
        obj['pwc_bind_rotation'] = list(bind_rotation)
        obj['pwc_bind_position'] = list(bind_position)
        old_action = obj.animation_data.action if obj.animation_data else None
        obj.animation_data_clear()
        if old_action and old_action.users == 0:
            bpy.data.actions.remove(old_action)
        obj.rotation_mode = 'QUATERNION'
        obj.animation_data_create()
        obj.animation_data.action = bpy.data.actions.new(CLIP + ' ' + name)
        blender_axis = Vector((axis[0], -axis[2], axis[1]))
        # One-second quaternion keys retain full turns and interpolate smoothly in glTF.
        for second in range(DURATION + 1):
            obj.rotation_quaternion = Quaternion(blender_axis, math.radians(second * speed)) @ bind_rotation
            obj.keyframe_insert('rotation_quaternion', frame=second * fps)
        if name == 'Armillary Celestial Core':
            # 74 complete bobs close the loop; 9.73 s per bob vs the old 9.67 s.
            for step in range(DURATION * 10 + 1):
                time = step / 10
                obj.location = bind_position + Vector((0, 0, .1 * math.sin(math.tau * 74 * time / DURATION)))
                obj.keyframe_insert('location', frame=time * fps)
        action = obj.animation_data.action
        for layer in action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
    for obj in collection.objects:
        if 'pwc_energy_speed' not in obj:
            continue
        old_action = obj.animation_data.action if obj.animation_data else None
        obj.animation_data_clear()
        if old_action and old_action.users == 0:
            bpy.data.actions.remove(old_action)
        obj.animation_data_create()
        obj.animation_data.action = bpy.data.actions.new(CLIP + ' ' + obj.name)
        obj.rotation_mode = 'QUATERNION'
        axis = Vector(obj['pwc_energy_axis'])
        for second in range(DURATION + 1):
            obj.rotation_quaternion = Quaternion(axis, math.radians(second * obj['pwc_energy_speed']))
            obj.keyframe_insert('rotation_quaternion', frame=second * fps)
        for layer in obj.animation_data.action.layers:
            for strip in layer.strips:
                for bag in strip.channelbags:
                    for curve in bag.fcurves:
                        for key in curve.keyframe_points:
                            key.interpolation = 'LINEAR'
    scene.frame_set(0)
    bpy.context.view_layer.update()


def export_environment(collection, filepath):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects:
        obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(filepath), export_format='GLB', use_selection=True, use_active_scene=True,
        export_animations=True, export_animation_mode='ACTIVE_ACTIONS',
        export_nla_strips_merged_animation_name=CLIP, export_force_sampling=False,
        export_frame_range=False, export_materials='EXPORT', export_yup=True,
        export_apply=False, export_cameras=False, export_lights=False)


if __name__ == '__main__' or 'PWC_STAGE' in globals():
    root = Path(__file__).resolve().parents[2]
    scene = bpy.data.scenes['PWC Observatory']
    bpy.context.window.scene = scene
    collection = next(c for c in scene.collection.children if c.name.startswith('Observatory Environment'))
    bake_monument(collection, scene)
    source = root / 'output/third-person-controller/source'
    export_environment(collection, source / 'uncompressed/observatory-environment.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(source / 'observatory.blend'))
    print('Baked ' + CLIP + ': 720 seconds, four parent-axis rotors and a seamless core bob.')
