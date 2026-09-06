"""Author an emissive plasma core through Blender MCP; motion stays in the GLB."""
import math
from pathlib import Path

import bpy
import numpy as np
from mathutils import Quaternion, Vector


def build_energy_core(collection, parent):
    # Replacing only the core leaves the architecture and nested gimbal untouched.
    for child in list(parent.children_recursive):
        bpy.data.objects.remove(child, do_unlink=True)

    def material(name, color, strength, image=None):
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        nodes.clear()
        output = nodes.new('ShaderNodeOutputMaterial')
        shader = nodes.new('ShaderNodeBsdfPrincipled')
        shader.inputs['Base Color'].default_value = (0, 0, 0, 1)
        shader.inputs['Roughness'].default_value = 1
        shader.inputs['Specular IOR Level'].default_value = 0
        shader.inputs['Emission Color'].default_value = (*color, 1)
        shader.inputs['Emission Strength'].default_value = strength
        mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
        if image:
            texture = nodes.new('ShaderNodeTexImage')
            texture.image = image
            mat.node_tree.links.new(texture.outputs['Color'], shader.inputs['Emission Color'])
        return mat

    # Evaluate a warped field on a sphere so longitude and pole seams close naturally.
    width, height = 1024, 512
    v, u = np.mgrid[0:height, 0:width].astype(np.float32)
    longitude = u / (width - 1) * math.tau
    latitude = v / (height - 1) * math.pi
    x = np.sin(latitude) * np.cos(longitude)
    y = np.sin(latitude) * np.sin(longitude)
    z = np.cos(latitude)
    warp = 1.6 * np.sin(4 * x + 2 * z) + .7 * np.sin(7 * y - 3 * x)
    field = np.sin(8 * z + 4 * y + warp) + .5 * np.sin(10 * x - 5 * y + warp)
    veins = np.exp(-((field / .14) ** 2))
    cloud = (.5 + .5 * np.sin(5 * x + 6 * y + 4 * z + warp)) ** 2
    detail = .5 + .5 * np.sin(27 * x + 19 * y + 23 * z + warp * 3)
    pixels = np.ones((height, width, 4), np.float32)
    pixels[:, :, 0] = .025 + .14 * cloud + .58 * veins
    pixels[:, :, 1] = .18 + .40 * cloud + .38 * veins + .018 * detail
    pixels[:, :, 2] = .30 + .40 * cloud + .25 * veins + .025 * detail
    image = bpy.data.images.get('OBS Plasma flow')
    if image:
        bpy.data.images.remove(image)
    image = bpy.data.images.new('OBS Plasma flow', width, height, alpha=False)
    image.pixels.foreach_set(pixels.ravel())
    image.pack()
    body_mat = material('OBS Plasma heart', (1, 1, 1), 8, image)
    strand_mat = material('OBS Plasma filaments', (.24, .8, 1), 14)
    wisp_mat = material('OBS Plasma prominences', (.045, .32, 1), 8)
    spark_mat = material('OBS Plasma sparks', (.45, .9, 1), 16)

    def configure(obj, name, mat):
        obj.name = name
        for owner in list(obj.users_collection):
            owner.objects.unlink(obj)
        collection.objects.link(obj)
        obj.parent = parent
        obj.location = (0, 0, 0)
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        obj['pwc_region'] = name
        obj['pwc_preserve_uv'] = True
        for face in obj.data.polygons:
            face.use_smooth = True
        return obj

    bpy.ops.mesh.primitive_uv_sphere_add(segments=96, ring_count=48, radius=1.02)
    body = configure(bpy.context.object, 'Energy Core Plasma', body_mat)

    def tubes(name, paths, mat):
        vertices, faces = [], []
        for points, width in paths:
            start = len(vertices)
            for i, point in enumerate(points):
                tangent = points[min(i + 1, len(points) - 1)] - points[max(0, i - 1)]
                tangent.normalize()
                normal = tangent.cross(point).normalized()
                binormal = tangent.cross(normal).normalized()
                taper = .08 + .92 * math.sin(math.pi * i / (len(points) - 1)) ** .6
                for side in range(6):
                    angle = side * math.tau / 6
                    vertices.append(point + width * taper * (math.cos(angle) * normal + math.sin(angle) * binormal))
                if i:
                    for side in range(6):
                        a = start + (i - 1) * 6 + side
                        b = start + (i - 1) * 6 + (side + 1) % 6
                        faces.append((a, b, b + 6, a + 6))
            faces.append(tuple(start + i for i in reversed(range(6))))
            faces.append(tuple(len(vertices) - 6 + i for i in range(6)))
        mesh = bpy.data.meshes.new(name)
        mesh.from_pydata(vertices, [], faces)
        mesh.update()
        obj = bpy.data.objects.new(name, mesh)
        collection.objects.link(obj)
        return configure(obj, name, mat)

    rng = np.random.default_rng(421)
    paths = []
    for i in range(12):
        orientation = Quaternion(Vector(rng.normal(size=3)).normalized(), float(rng.uniform(0, math.tau)))
        points = []
        phase = float(rng.uniform(0, math.tau))
        for step in range(97):
            t = step / 96
            angle = phase + t * (1.9 + .8 * math.sin(i))
            latitude = .38 * math.sin(angle * 1.7 + phase) + .12 * math.sin(t * math.tau)
            radius = 1.07 + .045 * math.sin(math.pi * t)
            point = Vector((math.cos(latitude) * math.cos(angle), math.cos(latitude) * math.sin(angle), math.sin(latitude)))
            points.append(orientation @ (point * radius))
        paths.append((points, .013 + .004 * (i % 3)))
    strands = tubes('Energy Core Filaments', paths, strand_mat)

    paths = []
    for i in range(6):
        orientation = Quaternion(Vector(rng.normal(size=3)).normalized(), float(rng.uniform(0, math.tau)))
        points = []
        for step in range(81):
            t = step / 80
            angle = i + t * 2.1
            radius = 1.1 + .30 * math.sin(math.pi * t) ** 1.2
            points.append(orientation @ Vector((radius * math.cos(angle), radius * math.sin(angle), .12 * math.sin(t * math.tau))))
        paths.append((points, .009))
    wisps = tubes('Energy Core Prominences', paths, wisp_mat)

    # Tiny faceted sparks, combined into a single independently orbiting mesh.
    vertices, faces = [], []
    for i in range(28):
        direction = Vector(rng.normal(size=3)).normalized()
        center = direction * float(rng.uniform(1.25, 1.65))
        radius = float(rng.uniform(.012, .03))
        start = len(vertices)
        vertices.extend(center + Vector(axis) * radius for axis in ((1,0,0),(-1,0,0),(0,1,0),(0,-1,0),(0,0,1),(0,0,-1)))
        faces.extend(tuple(start + k for k in face) for face in ((0,2,4),(2,1,4),(1,3,4),(3,0,4),(2,0,5),(1,2,5),(3,1,5),(0,3,5)))
    mesh = bpy.data.meshes.new('Energy sparks')
    mesh.from_pydata(vertices, [], faces)
    sparks = bpy.data.objects.new('Energy Core Sparks', mesh)
    collection.objects.link(sparks)
    configure(sparks, 'Energy Core Sparks', spark_mat)

    # Blender Z is PlayCanvas Y. Every speed completes full turns in the shared 720 s loop.
    for obj, axis, speed in ((body, (0,0,1), 18), (strands, (0,0,1), -30),
                             (wisps, (1,0,0), 20), (sparks, (0,1,0), 45)):
        obj['pwc_energy_axis'] = axis
        obj['pwc_energy_speed'] = speed
        obj.rotation_mode = 'QUATERNION'
        obj.rotation_quaternion = Quaternion()
    bpy.context.view_layer.update()


if __name__ == '__main__' or 'PWC_STAGE' in globals():
    root = Path(__file__).resolve().parents[2]
    scene = bpy.data.scenes['PWC Observatory']
    bpy.context.window.scene = scene
    scene.frame_set(0)
    collection = next(c for c in scene.collection.children if c.name.startswith('Observatory Environment'))
    build_energy_core(collection, collection.objects['Armillary Celestial Core'])
    script = Path(__file__).with_name('animate_environment.py')
    helpers = {'__file__': str(script), '__name__': 'energy_animation'}
    exec(compile(script.read_text(), str(script), 'exec'), helpers)
    helpers['bake_monument'](collection, scene)
    source = root / 'output/third-person-controller/source'
    helpers['export_environment'](collection, source / 'uncompressed/observatory-environment.glb')
    bpy.ops.wm.save_as_mainfile(filepath=str(source / 'observatory.blend'))
    print('Exported plasma energy core with four baked flow layers.')
