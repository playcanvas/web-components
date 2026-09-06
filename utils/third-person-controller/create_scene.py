"""Original observatory assets, authored in Blender through the Blender MCP bridge.

Run: node utils/third-person-controller/blender.mjs utils/third-person-controller/create_scene.py [blockout|environment|full]
Coordinates in environment helpers are PlayCanvas (X, Y up, Z); character helpers use Blender.
"""
import bpy
import math
import random
import json
import shutil
import numpy as np
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
MODELS = ROOT / 'examples/assets/models'
SOURCE = ROOT / 'output/third-person-controller/source'
SOURCE.mkdir(parents=True, exist_ok=True)
DETAIL = globals().get('PWC_STAGE', 'full') != 'blockout'
random.seed(42)

# Rebuild only the scene owned by this generator. Other open Blender scenes survive.
old = bpy.data.scenes.get('PWC Observatory')
scene = bpy.data.scenes.new('PWC Observatory Build')
bpy.context.window.scene = scene
if old:
    old_data = [o.data for o in old.objects if o.type in ('MESH','ARMATURE')]
    old_materials = set(m for o in old.objects if o.type=='MESH' for m in o.data.materials)
    old_actions = set(s.action for o in old.objects if o.animation_data for t in o.animation_data.nla_tracks for s in t.strips)
    old_actions.update(o.animation_data.action for o in old.objects if o.animation_data and o.animation_data.action)
    old_collections = list(old.collection.children)
    for obj in list(old.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.scenes.remove(old)
    for data in old_data:
        if data.users==0:
            if isinstance(data,bpy.types.Mesh): bpy.data.meshes.remove(data)
            else: bpy.data.armatures.remove(data)
    for mat in old_materials:
        if mat and mat.users==0: bpy.data.materials.remove(mat)
    for action in old_actions:
        if action and action.users==0: bpy.data.actions.remove(action)
    for collection in old_collections:
        if collection.users==0: bpy.data.collections.remove(collection)
scene.name = 'PWC Observatory'
scene.unit_settings.system = 'METRIC'
env = bpy.data.collections.new('Observatory Environment')
collision = bpy.data.collections.new('Observatory Collision')
hero = bpy.data.collections.new('Observatory Character')
for collection in (env, collision, hero):
    scene.collection.children.link(collection)
active_collection = env
owned = []

def material(name, color, rough=.65, metal=0, emission=0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emission:
        bsdf.inputs['Emission Color'].default_value = (*color, 1)
        bsdf.inputs['Emission Strength'].default_value = emission
    return mat

stone = [material('Limestone %d' % i, c) for i, c in enumerate([
    (.62, .48, .31), (.69, .55, .38), (.74, .63, .46), (.59, .46, .32)])]
edge = material('Pale carved edges', (.78, .67, .49), .65)
cliff = material('Layered bedrock', (.31, .29, .23), .88)
bronze = material('Antique brass', (.32, .20, .075), .32, .78)
patina = material('Oxidized copper', (.09, .26, .23), .6, .55)
dark = material('Obsidian enamel', (.012, .032, .037), .22, .25)
ceramic = material('Glazed ivory ceramic', (.79, .73, .56), .24, .06)
fabric = material('Oxide red woven mantle', (.38, .075, .025), .91)
light = material('Amber phosphor', (.95, .47, .12), .25, .15, 2.8)
leaves = [material('Copper grass %d' % i, c, .9) for i, c in enumerate([
    (.31, .12, .04), (.51, .24, .075), (.65, .39, .13)])]
mountain = [material('Distant mineral ridge %d' % i, c, 1) for i, c in enumerate([
    (.11, .23, .24), (.16, .30, .31), (.23, .36, .34)])]

if DETAIL:
    # Bake deterministic mineral microstructure to glTF-compatible image maps in Blender.
    n=512
    yy,xx=np.mgrid[0:n,0:n].astype(np.float32)/n
    rng=np.random.default_rng(31)
    relief=np.zeros((n,n),np.float32)
    for frequency,amplitude in [(2,.6),(5,.24),(13,.11),(41,.045),(121,.012)]:
        grid=rng.random((frequency+1,frequency+1)).astype(np.float32)
        grid[-1,:]=grid[0,:];grid[:,-1]=grid[:,0]
        gx=xx*frequency;gy=yy*frequency;ix=gx.astype(int);iy=gy.astype(int)
        fx=gx-ix;fy=gy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
        relief += amplitude*((grid[iy,ix]*(1-fx)+grid[iy,ix+1]*fx)*(1-fy)+(grid[iy+1,ix]*(1-fx)+grid[iy+1,ix+1]*fx)*fy)
    dy,dx=np.gradient(relief)
    normal=np.stack([.5-dx*3,.5-dy*3,np.ones_like(xx),np.ones_like(xx)],axis=-1)
    rough=np.clip(.67+relief*.12+rng.normal(0,.025,(n,n)),.4,.9)
    def baked_image(name,pixels):
        image=bpy.data.images.new(name,width=n,height=n,alpha=True)
        image.colorspace_settings.name='Non-Color'
        image.pixels.foreach_set(pixels.astype(np.float32).ravel())
        image.filepath_raw=str(SOURCE/(name+'.png')); image.file_format='PNG';image.save();image.pack()
        return image
    normal_image=baked_image('limestone-normal',normal)
    rough_image=baked_image('limestone-roughness',np.stack([rough,rough,rough,np.ones_like(xx)],axis=-1))
    for mat in [*stone,edge,cliff]:
        nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
        texture=nodes.new('ShaderNodeTexImage');texture.image=normal_image
        nm=nodes.new('ShaderNodeNormalMap');nm.inputs['Strength'].default_value=.25
        links.new(texture.outputs['Color'],nm.inputs['Color']);links.new(nm.outputs['Normal'],bsdf.inputs['Normal'])
        texture=nodes.new('ShaderNodeTexImage');texture.image=rough_image
        links.new(texture.outputs['Color'],bsdf.inputs['Roughness'])
    glaze=np.clip(.26+relief*.035+rng.normal(0,.012,(n,n)),.15,.4)
    glaze_image=baked_image('ceramic-glaze',np.stack([glaze,glaze,glaze,np.ones_like(xx)],axis=-1))
    texture=ceramic.node_tree.nodes.new('ShaderNodeTexImage');texture.image=glaze_image
    ceramic.node_tree.links.new(texture.outputs['Color'],ceramic.node_tree.nodes.get('Principled BSDF').inputs['Roughness'])

    # Original equirectangular environment map, also used for image-based lighting.
    w,h=1024,512
    v,u=np.mgrid[0:h,0:w].astype(np.float32);v/=h;u/=w
    horizon=np.exp(-((v-.5)/.17)**2)
    sky=np.zeros((h,w,4),np.float32)
    for channel,(zenith,haze) in enumerate(zip((.09,.27,.34),(.62,.70,.59))):
        sky[:,:,channel]=zenith+(haze-zenith)*horizon
    sky[:h//2,:,:3]*=.65
    glow=np.exp(-(((u-.72)/.055)**2+((v-.65)/.045)**2))
    for channel,energy in enumerate((2.8,2.25,1.35)): sky[:,:,channel]+=glow*energy
    sky[:,:,3]=1
    image=bpy.data.images.new('Observatory atmosphere',width=w,height=h,float_buffer=True)
    image.pixels.foreach_set(sky.ravel());image.filepath_raw=str(ROOT/'examples/assets/skies/observatory.hdr')
    image.file_format='HDR';image.save();image.pack()

def own(obj, name, mat=None, collection=None, bone=None):
    obj.name = name
    collection = collection or active_collection
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    collection.objects.link(obj)
    if mat:
        obj.data.materials.append(mat)
    if bone:
        group = obj.vertex_groups.new(name=bone)
        group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    owned.append(obj)
    return obj

def finish(obj, bevel=0, smooth=False):
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        mod = obj.modifiers.new('Soft manufactured edge', 'BEVEL')
        mod.width = bevel
        mod.segments = 3 if DETAIL else 1
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        for face in obj.data.polygons:
            face.use_smooth = True
    obj.select_set(False)
    return obj

def box(name, pos, size, mat, bevel=.04, collection=None, bone=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    obj = own(bpy.context.object, name, mat, collection, bone)
    obj.scale = size
    return finish(obj, bevel)

def sphere(name, pos, scale, mat, bone=None, segments=24):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=12, radius=1, location=pos)
    obj = own(bpy.context.object, name, mat, bone=bone)
    obj.scale = scale
    return finish(obj, smooth=True)

def cylinder(name, pos, radius, depth, mat, vertices=32, bone=None):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=pos)
    return finish(own(bpy.context.object, name, mat, bone=bone), .025 if DETAIL else 0)

def mesh(name, verts, faces, mat, collection=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    (collection or active_collection).objects.link(obj)
    if mat:
        data.materials.append(mat)
    owned.append(obj)
    return obj

def pc(p):
    return (p[0], -p[2], p[1])

def pcbox(name, pos, size, mat, bevel=.04, collection=None):
    return box(name, pc(pos), (size[0], size[2], size[1]), mat, bevel, collection)

def arc(name, center, radius, thickness, start, end, mat, tilt=0, segments=80):
    # Ring in Blender XZ, facing the arrival camera. Tilt is around Blender Z.
    verts, faces = [], []
    for i in range(segments + 1):
        a = start + (end-start)*i/segments
        for j in range(8):
            b = j*math.tau/8
            x = (radius + thickness*math.cos(b))*math.cos(a)
            yy = thickness*math.sin(b)
            z = (radius + thickness*math.cos(b))*math.sin(a)
            verts.append((center[0]+x*math.cos(tilt)-yy*math.sin(tilt),
                          center[1]+x*math.sin(tilt)+yy*math.cos(tilt), center[2]+z))
    for i in range(segments):
        for j in range(8):
            a = i*8+j
            b = i*8+(j+1)%8
            faces.append((a,b,b+8,a+8))
    faces.extend([tuple(range(7,-1,-1)), tuple(segments*8+j for j in range(8))])
    obj = mesh(name, verts, faces, mat)
    for face in obj.data.polygons:
        face.use_smooth = True
    return obj

platform_specs=[]
ramp_specs=[]

def platform(name, x, z, w, d, top, tiles=True):
    platform_specs.append((name,x,z,w,d,top,tiles))
    # Recess the substrate so its sides do not coincide with the stone deck fascia.
    pcbox(name+' foundation', (x,top-1.45,z), (w-.32,2.5,d-.32), cliff, .12)
    inset=.16 if DETAIL and tiles else 0
    pcbox(name+' top', (x,top-(.25 if DETAIL and tiles else .12),z), (w-inset,.24,d-inset), stone[1], .035)
    pcbox(name+' collision', (x,top-.35,z), (w,.7,d), None, 0, collision)
    if DETAIL:
        for h in (.35,.62):
            pcbox(name+' cornice', (x,top-h,z), (w+.13,.09,d+.13), edge, .025)
        if tiles:
            nx, nz = max(1,round(w/2)), max(1,round(d/2))
            for i in range(nx):
                for j in range(nz):
                    pcbox(name+' paving', (x-w/2+(i+.5)*w/nx,top-.045,z-d/2+(j+.5)*d/nz),
                          (w/nx-.045,.09,d/nz-.045), random.choice(stone), .035)
        # Hanging buttresses produce an architectural silhouette above the valley.
        for sx in (-1,1):
            for zz in (-d*.36,0,d*.36):
                pcbox(name+' buttress', (x+sx*(w/2-.35),top-3.3,z+zz), (.9,6.3,1.0), cliff, .15)

def ramp(name, a, b, width, mat=stone[1]):
    ramp_specs.append((name,a,b,width))
    av, bv = Vector(pc(a)), Vector(pc(b))
    direction = bv-av
    side = Vector((direction.y,-direction.x,0)).normalized()*width/2
    points=[av-side,av+side,bv+side,bv-side]
    verts=[tuple(p) for p in points]+[tuple(p-Vector((0,0,.6))) for p in points]
    faces=[(0,1,2,3),(7,6,5,4),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)]
    obj=mesh(name,verts,faces,mat)
    copy=obj.copy(); copy.data=obj.data.copy(); collision.objects.link(copy); copy.name=name+' collision'
    if DETAIL:
        for sign in (-1,1):
            edgea=av+side*sign
            edgeb=bv+side*sign
            v=[tuple(p) for p in [edgea,edgea+side.normalized()*.16*sign,edgeb+side.normalized()*.16*sign,edgeb]]
            mesh(name+' border',v,[(0,1,2,3)],edge)
        # Flush scored treads preserve the continuous physics ramp.
        steps=max(2,round(direction.length/.65)) if abs(direction.z) > .1 else 1
        up=Vector((0,0,.006))
        for i in range(1,steps):
            p=av+direction*(i/steps)+up
            q=p+direction.normalized()*.025
            mesh(name+' scored tread',[tuple(v) for v in [p-side*.94,p+side*.94,q+side*.94,q-side*.94]],[(0,1,2,3)],bronze)

def pillar(name, x, z, base, height=5, r=.55, collide=True):
    cylinder(name+' foot',pc((x,base+.15,z)),r*1.6,.30,stone[2])
    cylinder(name+' plinth',pc((x,base+.38,z)),r*1.22,.18,edge)
    cylinder(name+' shaft',pc((x,base+height/2,z)),r,height-.7,stone[2],24)
    cylinder(name+' neck',pc((x,base+height-.28,z)),r*1.22,.22,bronze)
    cylinder(name+' crown',pc((x,base+height-.1,z)),r*1.55,.28,edge)
    if DETAIL:
        for ang in range(0,360,45):
            t=math.radians(ang)
            cylinder(name+' flute',pc((x+r*.97*math.cos(t),base+height/2,z+r*.97*math.sin(t))),r*.08,height-.9,stone[1],8)
    if collide:
        pcbox(name+' collision',(x,base+height/2,z),(r*2,height,r*2),None,0,collision)

def archway(name,x,z,base,width=6,height=5,angle=0):
    # Portal opening is 2*width/2 wide, lintel is a segmented stone arch.
    r=width/2
    pillar(name+' left',x-r,z,base,height-r,.6)
    pillar(name+' right',x+r,z,base,height-r,.6)
    for i in range(15):
        a0=i*math.pi/15+.012; a1=(i+1)*math.pi/15-.012
        verts=[]
        for dep in (-.55,.55):
            for rad,a in [(r-.4,a0),(r+.5,a0),(r+.5,a1),(r-.4,a1)]:
                verts.append(pc((x+rad*math.cos(a),base+height-r+rad*math.sin(a),z+dep)))
        mesh(name+' voussoir',verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],stone[i%4])
    pcbox(name+' overhead collision',(x,base+height-.5,z),(width,1,1.1),None,0,collision)

# Continuous loop around an open, unwalkable basin.
platform('Arrival',0,15,18,14,0)
platform('West terrace',-17,-7,10,18,3)
ramp('Western ascent',(-6,0,12),(-17,3,1),7)
platform('Upper walk',-7,-24,19,4,3)
ramp('Upper connection',(-17,3,-14),(-15,3,-24),6)
platform('Overlook',8,-20,18,12,3)
ramp('Upper bypass',(-1,3,-24),(3,3,-24),4)
# Three slabs on the direct route leave two 1.3 m gaps.
for i,x in enumerate((-11.6,-7.3,-3.0)):
    platform('Crossing slab %d'%i,x,-17,3,4,3,False)
ramp('Crossing approach',(-17,3,-14),(-13.1,3,-17),4)
platform('Colonnade',18,-9,6,16,3)
ramp('Eastern descent',(18,3,-1),(15,0,9),6)
platform('East garden',14,8,10,8,0)
ramp('Homeward path',(14,0,10),(5,0,16),6)
archway('Arrival portal',0,10,0,8,6.5)
archway('West gate',-17,-11,3,6,5)
for z in (-15,-11,-7,-3):
    for x in (15.7,20.3):
        pillar('Colonnade',x,z,3,5,.48)
pcbox('Colonnade roof',(18,8.1,-9),(6.4,.45,16.5),stone[2],.07)
pcbox('Colonnade roof collision',(18,8.1,-9),(6.4,.45,16.5),None,0,collision)
# Ring on a dais, oriented toward the arrival view.
dais=cylinder('Armillary dais',pc((7,3.25,-21)),5.3,.5,stone[2],96)
cylinder('Dais inset',pc((7,3.51,-21)),4.9,.045,patina,96)
# Copy the authored round surface, including its rim bevel, before visual trimming/batching.
dais_collision=dais.copy();dais_collision.data=dais.data.copy()
dais_collision.name='Dais collision';dais_collision.data.materials.clear()
collision.objects.link(dais_collision)
for x in (2,12):
    pillar('Armillary support',x,-21,3.5,3.5,.75)
center=pc((7,10,-21))
arc('Great ring limestone',center,6.65,.31,-.62,math.pi*1.68,edge)
arc('Great ring brass inlay',(center[0],center[1]-.29,center[2]),6.65,.055,-.6,math.pi*1.67,bronze)
arc('Meridian copper',center,5.6,.15,0,math.tau,patina,tilt=.75)
arc('Meridian inner gold',center,4.7,.095,0,math.tau,bronze,tilt=-.65)
sphere('Suspended amber heart',center,(.58,.58,.58),light,segments=32)
if DETAIL:
    for i in range(56):
        a=-.55+i*(math.pi*2-.55)/56
        rad=6.65
        pos=(center[0]+rad*math.cos(a),center[1]-.33,center[2]+rad*math.sin(a))
        obj=box('Engraved hour mark',pos,(.07,.035,.30 if i%4==0 else .13),bronze,.01)
        obj.rotation_euler.y=a-math.pi/2

# Remote mineral ridges and craggy understructure are authored meshes, not a sky photograph.
for layer in range(3):
    verts=[]; faces=[]
    for i in range(30):
        x=-110+i*220/29
        z=-55-layer*28
        peak=10+layer*6+random.uniform(-4,10)+4*math.sin(i*.9)
        verts.extend([pc((x,-16,z)),pc((x,peak,z)),pc((x,peak-4,z-10))])
    for i in range(29):
        k=i*3; faces.extend([(k,k+3,k+4,k+1),(k+1,k+4,k+5,k+2)])
    mesh('Distant ridge %d'%layer,verts,faces,mountain[layer])
for i in range(26 if DETAIL else 8):
    angle=random.random()*math.tau
    rr=random.uniform(24,42)
    x,z=math.cos(angle)*rr,math.sin(angle)*rr-5
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=pc((x,-8,z)))
    obj=own(bpy.context.object,'Mineral outcrop',cliff)
    obj.scale=(random.uniform(3,7),random.uniform(3,7),random.uniform(5,13))
    finish(obj)

def grass(x,y,z,count=8):
    verts=[]; faces=[]
    for j in range(count):
        a=random.random()*math.tau
        xx=x+random.uniform(-.35,.35); zz=z+random.uniform(-.35,.35)
        height=random.uniform(.3,.9); w=random.uniform(.03,.075)
        dx,dz=math.cos(a),math.sin(a)
        start=len(verts)
        verts.extend([pc((xx-dx*w,y,zz-dz*w)),pc((xx+dx*w,y,zz+dz*w)),
                      pc((xx+.16+dx*w*.5,y+height*.6,zz+.06+dz*w*.5)),
                      pc((xx+.22,y+height,zz+.13))])
        faces.extend([(start,start+1,start+2),(start,start+2,start+3)])
    mesh('Copper sedge',verts,faces,random.choice(leaves))

if DETAIL:
    for mat in leaves:
        mat.use_backface_culling=False
    for x,z,w,d,y in [(0,15,18,14,0),(-17,-7,10,18,3),(8,-20,18,12,3),(14,8,10,8,0)]:
        for i in range(38):
            sx=random.choice((-1,1))
            xx=x+sx*random.uniform(w*.35,w*.48)
            zz=z+random.uniform(-d*.45,d*.45)
            grass(xx,y+.025,zz)
        for i in range(8):
            xx=x+random.choice((-1,1))*random.uniform(w*.37,w*.46)
            zz=z+random.uniform(-d*.4,d*.4)
            bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=1,radius=1,location=pc((xx,y+.16,zz)))
            ob=own(bpy.context.object,'Weathered stone fragment',random.choice(stone))
            ob.scale=(random.uniform(.16,.45),random.uniform(.16,.5),random.uniform(.1,.3))
            finish(ob,.03)
    for x,z,base in [(-7,17,0),(7,17,0),(-20,-3,3),(13,-15,3),(12,8,0)]:
        cylinder('Waylight foot',pc((x,base+.15,z)),.36,.3,bronze)
        cylinder('Waylight stem',pc((x,base+.65,z)),.11,1,patina,16)
        sphere('Waylight lens',pc((x,base+1.1,z)),(.19,.19,.27),light)
        cylinder('Waylight cap',pc((x,base+1.36,z)),.30,.1,bronze)

    def branch(name,points,radius):
        curve=bpy.data.curves.new(name,'CURVE');curve.dimensions='3D'
        curve.resolution_u=3;curve.bevel_depth=radius;curve.bevel_resolution=2
        spline=curve.splines.new('BEZIER');spline.bezier_points.add(len(points)-1)
        for i,(p,coord) in enumerate(zip(spline.bezier_points,points)):
            p.co=pc(coord);p.handle_left_type='AUTO';p.handle_right_type='AUTO'
            p.radius=1-.82*i/(len(points)-1)
        obj=bpy.data.objects.new(name,curve);env.objects.link(obj)
        curve.materials.append(bronze)
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        bpy.ops.object.convert(target='MESH');obj.select_set(False)
    for tx,tz,base in [(-7,17,0),(13,-22,3),(-20,-5,3)]:
        branch('Windswept tree',[(tx,base,tz),(tx+.25,base+1.5,tz),(tx-.15,base+3,tz+.25),(tx+.9,base+4.1,tz+.1)],.15)
        for i in range(8):
            a=i*math.tau/8
            x=tx+math.cos(a)*random.uniform(1.1,2.1)
            z=tz+math.sin(a)*random.uniform(1,1.8)
            y=base+random.uniform(2.6,4)
            branch('Fine tree branch',[(tx+.1,base+1.4,tz),(tx+.3,base+2.4,tz),(x,y,z)],.035)
            verts=[];faces=[]
            for j in range(65):
                px=x+random.uniform(-.75,.75);pz=z+random.uniform(-.65,.65);py=y+random.uniform(-.25,.4)
                length=random.uniform(.13,.27);angle=random.random()*math.tau
                dx,dz=math.cos(angle)*length,math.sin(angle)*length
                k=len(verts)
                verts.extend([pc((px-dx,py,pz-dz)),pc((px-dz*.4,py+.045,pz+dx*.4)),pc((px+dx,py+.08,pz+dz)),pc((px+dz*.4,py+.045,pz-dx*.4))])
                faces.append((k,k+1,k+2,k+3))
            mesh('Autumn copper foliage',verts,faces,leaves[i%3])

if DETAIL:
    detail_script=Path(__file__).with_name('environment_detail.py')
    exec(compile(detail_script.read_text(),str(detail_script),'exec'))

# Character: all mechanical pieces are rigidly weighted to one compact armature.
active_collection=hero
bones={
    'Root':((0,0,0),None), 'Pelvis':((0,0,.77),'Root'), 'Chest':((0,0,1.04),'Pelvis'),
    'Head':((0,0,1.40),'Chest'), 'Mantle':((0,.16,1.29),'Chest')}
for side,sign in [('L',-1),('R',1)]:
    bones.update({f'Thigh.{side}':((sign*.18,0,.75),'Pelvis'),
        f'Shin.{side}':((sign*.18,0,.43),f'Thigh.{side}'),
        f'Foot.{side}':((sign*.18,0,.14),f'Shin.{side}'),
        f'Arm.{side}':((sign*.36,0,1.22),'Chest'),
        f'Forearm.{side}':((sign*.43,0,.94),f'Arm.{side}')})
armdata=bpy.data.armatures.new('Explorer Rig')
rig=bpy.data.objects.new('Explorer',armdata)
hero.objects.link(rig)
bpy.context.view_layer.objects.active=rig; rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')
for name,(pos,parent) in bones.items():
    bone=armdata.edit_bones.new(name); bone.head=pos; bone.tail=Vector(pos)+Vector((0,0,.15))
    if parent: bone.parent=armdata.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT'); rig.select_set(False)
sphere('Pelvis enamel',(0,0,.79),(.26,.20,.17),dark,'Pelvis')
sphere('Chest ceramic',(0,-.015,1.095),(.31,.245,.31),ceramic,'Chest')
cylinder('Neck coupling',(0,0,1.37),.14,.18,bronze,bone='Head')
sphere('Helmet ceramic',(0,0,1.62),(.37,.315,.32),ceramic,'Head',32)
sphere('Face recess',(0,-.273,1.60),(.291,.077,.20),bronze,'Head')
sphere('Dark faceplate',(0,-.314,1.60),(.265,.052,.169),dark,'Head')
for x in (-.095,.095):
    sphere('Amber eye',(x,-.363,1.61),(.034,.016,.047),light,'Head',16)
for x in (-.367,.367):
    sphere('Temple brass hinge',(x,0,1.60),(.045,.115,.12),bronze,'Head')
    sphere('Temple dark insert',(x*1.08,0,1.60),(.025,.075,.08),dark,'Head')
box('Chest badge',(0,-.254,1.14),(.12,.025,.12),bronze,.025,bone='Chest')
box('Chest phosphor',(0,-.273,1.14),(.045,.012,.065),light,.009,bone='Chest')
for side,sign in [('L',-1),('R',1)]:
    thigh=f'Thigh.{side}'; shin=f'Shin.{side}'; foot=f'Foot.{side}'
    arm=f'Arm.{side}'; fore=f'Forearm.{side}'
    sphere('Hip hinge',(sign*.19,0,.73),(.12,.13,.12),bronze,thigh)
    sphere('Thigh ceramic',(sign*.18,0,.595),(.12,.13,.17),ceramic,thigh)
    sphere('Knee hinge',(sign*.18,-.01,.43),(.105,.11,.10),bronze,shin)
    sphere('Shin ceramic',(sign*.18,0,.30),(.102,.11,.15),ceramic,shin)
    box('Boot sole',(sign*.18,-.075,.07),(.255,.40,.12),dark,.05,bone=foot)
    sphere('Boot ceramic',(sign*.18,-.085,.15),(.138,.215,.11),ceramic,foot)
    sphere('Shoulder hinge',(sign*.35,0,1.22),(.13,.13,.13),bronze,arm)
    sphere('Upper arm ceramic',(sign*.415,0,1.09),(.095,.105,.17),ceramic,arm)
    sphere('Elbow coupling',(sign*.43,0,.94),(.075,.08,.085),bronze,fore)
    sphere('Forearm ceramic',(sign*.43,-.008,.835),(.085,.095,.125),ceramic,fore)
    sphere('Hand enamel',(sign*.43,-.02,.70),(.085,.09,.09),dark,fore)
# Mantle is a shaped short cape with one deforming bone and a rolled collar.
verts=[]; faces=[]
for row in range(8):
    t=row/7
    for col in range(13):
        u=col/12*2-1
        verts.append((u*(.37+.04*t),.18+.12*t+.035*math.cos(u*math.pi*3),1.29-.48*t+.03*math.cos(u*math.pi*3)*t))
for row in range(7):
    for col in range(12):
        k=row*13+col; faces.append((k,k+1,k+14,k+13))
cape=mesh('Pleated travel mantle',verts,faces,fabric)
group=cape.vertex_groups.new(name='Mantle');group.add(list(range(len(verts))),1,'REPLACE')
fabric.use_backface_culling=False
sphere('Mantle collar',(0,.06,1.33),(.32,.225,.09),fabric,'Chest')

# Join by material before skinning. This retains bone groups with five material draws.
def join_group(objects,name):
    if len(objects)==1:
        if 'pwc_energy_speed' not in objects[0]:
            objects[0].name=name
        return objects[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objects: o.select_set(True)
    bpy.context.view_layer.objects.active=objects[0]
    bpy.ops.object.join()
    obj=bpy.context.object;obj.name=name;obj.select_set(False)
    return obj

for mat in [ceramic,bronze,dark,light,fabric]:
    objects=[o for o in hero.objects if o.type=='MESH' and o.data.materials and o.data.materials[0]==mat]
    if objects:
        obj=join_group(objects,'Explorer '+mat.name)
        obj.parent=rig
        mod=obj.modifiers.new('Explorer skin','ARMATURE');mod.object=rig

rig.animation_data_create()
def pose(name,frame,t):
    for bone in rig.pose.bones:
        bone.rotation_mode='XYZ';bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
    p=rig.pose.bones
    if name in ('Walk','Run'):
        run=name=='Run'; phase=t*math.tau; stride=.62 if run else .40
        # Swing is around bone local X; all authored bones share the same basis.
        for side,offset in [('L',0),('R',math.pi)]:
            s=math.sin(phase+offset)
            p[f'Thigh.{side}'].rotation_euler.x=stride*s
            p[f'Shin.{side}'].rotation_euler.x=-max(0,-s)*(.9 if run else .65)
            p[f'Foot.{side}'].rotation_euler.x=-stride*s+max(0,-s)*(.5 if run else .35)
            p[f'Arm.{side}'].rotation_euler.x=-s*(.65 if run else .36)
            p[f'Forearm.{side}'].rotation_euler.x=.35 if run else .08
        p['Pelvis'].location.y=(.045 if run else .025)*(1-math.cos(phase*2))
        p['Chest'].rotation_euler.x=.12 if run else .035
        p['Chest'].rotation_euler.y=.055*math.sin(phase)
        p['Head'].rotation_euler.y=-.045*math.sin(phase)
        p['Mantle'].rotation_euler.x=-.12-(.08 if run else .04)*math.sin(phase*2+.8)
    elif name=='Idle':
        p['Chest'].rotation_euler.x=.025*math.sin(t*math.tau)
        p['Head'].rotation_euler.y=.08*math.sin(t*math.tau)
        p['Mantle'].rotation_euler.x=.04*math.sin(t*math.tau+1)
    elif name=='JumpStart':
        f=math.sin(t*math.pi)
        p['Pelvis'].location.y=-.08*f
        for side in ('L','R'):
            p[f'Thigh.{side}'].rotation_euler.x=.45*f
            p[f'Shin.{side}'].rotation_euler.x=-.8*f
            p[f'Arm.{side}'].rotation_euler.x=-.75*f
        p['Mantle'].rotation_euler.x=-.3*f
    elif name=='FallLoop':
        p['Thigh.L'].rotation_euler.x=.24;p['Shin.L'].rotation_euler.x=-.4
        p['Thigh.R'].rotation_euler.x=-.12;p['Shin.R'].rotation_euler.x=-.24
        p['Arm.L'].rotation_euler.z=-.18;p['Arm.R'].rotation_euler.z=.18
        p['Mantle'].rotation_euler.x=-.35+.04*math.sin(t*math.tau)
    elif name=='Land':
        f=math.sin(t*math.pi)
        p['Pelvis'].location.y=-.13*f
        for side in ('L','R'):
            p[f'Thigh.{side}'].rotation_euler.x=.35*f
            p[f'Shin.{side}'].rotation_euler.x=-.60*f
            p[f'Foot.{side}'].rotation_euler.x=.25*f
        p['Chest'].rotation_euler.x=.16*f
    for bone in p:
        bone.keyframe_insert('rotation_euler',frame=frame,group=bone.name)
        bone.keyframe_insert('location',frame=frame,group=bone.name)

for name,duration in [('Idle',3.2),('Walk',1.0),('Run',.66),('JumpStart',.32),('FallLoop',.8),('Land',.24)]:
    action=bpy.data.actions.new(name)
    rig.animation_data.action=action
    frames=round(duration*30)
    for i in range(frames+1): pose(name,i+1,i/frames)
    track=rig.animation_data.nla_tracks.new();track.name=name
    strip=track.strips.new(name,1,action);strip.action_frame_start=1;strip.action_frame_end=frames+1
    track.mute=True
rig.animation_data.action=None
for bone in rig.pose.bones: bone.rotation_euler=(0,0,0);bone.location=(0,0,0)
scene.render.fps=30
scene.frame_set(1)

# Merge spatial chunks by material so repeated kit details do not become hundreds of draws.
groups={}
for obj in list(env.objects):
    if obj.type!='MESH': continue
    if DETAIL and not obj.get('pwc_preserve_uv'):
        # Stable world-scale UVs on authored stone geometry, including generated ramps and arches.
        uv=obj.data.uv_layers.active or obj.data.uv_layers.new(name='Mineral UV')
        # Joining meshes preserves UV layers by name. A shared name prevents untextured islands.
        uv.name='Mineral UV'
        matrix=obj.matrix_world
        for face in obj.data.polygons:
            normal=matrix.to_3x3()@face.normal
            axis=max(range(3),key=lambda a:abs(normal[a]))
            axes=[a for a in range(3) if a!=axis]
            for loop in face.loop_indices:
                p=matrix@obj.data.vertices[obj.data.loops[loop].vertex_index].co
                uv.data[loop].uv=(p[axes[0]]*.45,p[axes[1]]*.45)
    mat=obj.data.materials[0] if obj.data.materials else None
    # Keep mountains in their own group; divide architectural geometry into four culling chunks.
    region=obj.get('pwc_region') or ('distance' if obj.name.startswith('Distant') else ('west' if obj.location.x < -9 else 'east' if obj.location.x>11 else 'center'))
    key=(mat,region)
    groups.setdefault(key,[]).append(obj)
for (mat,region),objects in groups.items():
    join_group(objects,'Environment '+region+' '+(mat.name if mat else 'mesh'))
join_group(list(collision.objects),'Walkable surfaces and camera obstacles')

def export(collection,filename,animations=False):
    if collection==env and DETAIL:
        rock_script=Path(__file__).with_name('smooth_rocks.py')
        rock_helpers={'__file__':str(rock_script),'__name__':'rock_shading'}
        exec(compile(rock_script.read_text(),str(rock_script),'exec'),rock_helpers)
        rock_helpers['smooth_support_rocks'](collection)
        ao_script=Path(__file__).with_name('bake_ao.py')
        ao_helpers={'__file__':str(ao_script),'__name__':'observatory_ao'}
        exec(compile(ao_script.read_text(),str(ao_script),'exec'),ao_helpers)
        ao_helpers['bake_environment_ao'](collection,scene)
        animation_script=Path(__file__).with_name('animate_environment.py')
        helpers={'__file__':str(animation_script),'__name__':'observatory_animation'}
        exec(compile(animation_script.read_text(),str(animation_script),'exec'),helpers)
        helpers['bake_monument'](collection,scene)
        helpers['export_environment'](collection,MODELS/filename)
        raw=SOURCE/'uncompressed';raw.mkdir(parents=True,exist_ok=True)
        shutil.copyfile(MODELS/filename,raw/filename)
        return
    bpy.ops.object.select_all(action='DESELECT')
    for obj in collection.objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(MODELS/filename),export_format='GLB',use_selection=True,
        use_active_scene=True,
        export_animations=animations,export_animation_mode='NLA_TRACKS',export_nla_strips=True,
        export_force_sampling=True,export_materials='NONE' if collection==collision else 'EXPORT',export_yup=True,
        export_apply=False,export_cameras=False,export_lights=False)
    raw = SOURCE / 'uncompressed'
    raw.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(MODELS/filename, raw/filename)

export(env,'observatory-environment.glb')
export(collision,'observatory-collision.glb')
if globals().get('PWC_STAGE','full')!='environment':export(hero,'observatory-character.glb',True)
bpy.ops.object.select_all(action='DESELECT')
for obj in collision.objects: obj.hide_set(True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'observatory.blend'))
print(json.dumps({'stage':globals().get('PWC_STAGE','full'),'scene':scene.name,
    'objects':len(scene.objects),'files':[{ 'name':n,'bytes':(MODELS/n).stat().st_size} for n in
    ['observatory-environment.glb','observatory-collision.glb','observatory-character.glb']]}))
if globals().get('PWC_STAGE','full')=='full':
    # A full rebuild always restores the final rigged character after the layout proxy.
    character_script=Path(__file__).with_name('create_character.py')
    exec(compile(character_script.read_text(),str(character_script),'exec'),{'__file__':str(character_script),'__name__':'__main__'})
