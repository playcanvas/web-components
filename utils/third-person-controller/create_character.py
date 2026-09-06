"""Owl Wayfarer: original geometry, skin and cloth, on a CC0 locomotion skeleton.

Run through Blender MCP: node utils/third-person-controller/blender.mjs utils/third-person-controller/create_character.py
Blender coordinates: metres, Z up, -Y forward. glTF exports +Y up, +Z forward.
"""
import bpy, bmesh, math, random, json, shutil
import numpy as np
from mathutils import Vector, Matrix
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
SOURCE=ROOT/'output/third-person-controller/source/owl-wayfarer'
SOURCE.mkdir(parents=True,exist_ok=True)
random.seed(81)
old=bpy.data.scenes.get('PWC Owl Wayfarer')
scene=bpy.data.scenes.new('PWC Owl Wayfarer Build')
bpy.context.window.scene=scene
if old:
    for obj in list(old.objects): bpy.data.objects.remove(obj,do_unlink=True)
    bpy.data.scenes.remove(old)
for datablocks in (bpy.data.meshes,bpy.data.armatures,bpy.data.materials,bpy.data.images,bpy.data.actions):
    for block in list(datablocks):
        if block.name.startswith('OWL ') and block.users==0:datablocks.remove(block)
scene.name='PWC Owl Wayfarer'
scene.unit_settings.system='METRIC'
scene.render.fps=30
bpy.ops.import_scene.gltf(filepath=str(ROOT/'utils/third-person-controller/motion-source/quaternius-locomotion.glb'))
rig=next(o for o in scene.objects if o.type=='ARMATURE')
rig.name='Wayfarer'
rig.data.name='OWL deformation rig'
actions={t.name:t.strips[0].action for t in rig.animation_data.nla_tracks}
for t in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(t)
rig.animation_data.action=None
for p in rig.pose.bones: p.matrix_basis.identity()
for obj in list(scene.objects):
    if obj!=rig: bpy.data.objects.remove(obj,do_unlink=True)
hero=bpy.data.collections.new('Owl Wayfarer geometry')
scene.collection.children.link(hero)
objects=[]
materials=[]

# Baked, tileable surface maps. Base-color variation stays subtle; geometry carries the design.
n=512
yy,xx=np.mgrid[0:n,0:n].astype(np.float32)/n
rng=np.random.default_rng(103)
def noise(freq):
    grid=rng.random((freq+1,freq+1)).astype(np.float32)
    grid[-1,:]=grid[0,:];grid[:,-1]=grid[:,0]
    gx=xx*freq;gy=yy*freq;ix=gx.astype(int);iy=gy.astype(int)
    fx=gx-ix;fy=gy-iy;fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    return (grid[iy,ix]*(1-fx)+grid[iy,ix+1]*fx)*(1-fy)+(grid[iy+1,ix]*(1-fx)+grid[iy+1,ix+1]*fx)*fy
grain=noise(5)*.55+noise(19)*.28+noise(69)*.12+noise(177)*.05
weave=(np.sin(xx*math.tau*128)*np.sin(yy*math.tau*128))*.5+.5
# Voronoi boundary distances create sparse, fine glaze crazing, not a broad crack overlay.
freq=15;gx=xx*freq;gy=yy*freq;ix=gx.astype(int);iy=gy.astype(int)
seeds=rng.random((freq,freq,2))
d1=np.full_like(xx,99);d2=d1.copy()
for ox in (-1,0,1):
    for oy in (-1,0,1):
        seed=seeds[(iy+oy)%freq,(ix+ox)%freq]
        dist=(ix+ox+seed[:,:,0]-gx)**2+(iy+oy+seed[:,:,1]-gy)**2
        d2=np.minimum(d2,np.maximum(d1,dist));d1=np.minimum(d1,dist)
crack=np.clip(1-(d2-d1)/.027,0,1)*np.clip((grain-.45)*5,0,1)

def image(name,values,color=False):
    if values.ndim==2: values=np.stack([values,values,values,np.ones_like(values)],axis=-1)
    elif values.shape[-1]==3: values=np.concatenate([values,np.ones((n,n,1))],axis=-1)
    im=bpy.data.images.new('OWL '+name,width=n,height=n,alpha=True)
    im.colorspace_settings.name='sRGB' if color else 'Non-Color'
    im.pixels.foreach_set(values.astype(np.float32).ravel())
    im.filepath_raw=str(SOURCE/(name+'.png'));im.file_format='PNG';im.save();im.pack()
    return im

def material(name,color,rough,metal=0,texture=None,emission=0):
    mat=bpy.data.materials.new('OWL '+name);mat.use_nodes=True
    mat.diffuse_color=(*color,1)
    bsdf=mat.node_tree.nodes.get('Principled BSDF');links=mat.node_tree.links
    bsdf.inputs['Base Color'].default_value=(*color,1)
    bsdf.inputs['Roughness'].default_value=rough;bsdf.inputs['Metallic'].default_value=metal
    if emission:
        bsdf.inputs['Emission Color'].default_value=(*color,1);bsdf.inputs['Emission Strength'].default_value=emission
    if texture:
        relief=grain*.015
        if texture=='ceramic':
            colors=np.array(color)[None,None,:]*(.91+grain[:,:,None]*.14)-crack[:,:,None]*.16
            roughmap=np.clip(rough+(grain-.5)*.1+crack*.16,.15,.7)
            relief=grain*.006-crack*.003
        elif texture=='fabric':
            colors=np.array(color)[None,None,:]*(.79+grain[:,:,None]*.33+weave[:,:,None]*.07)
            roughmap=np.clip(rough+weave*.05,0,1);relief=weave*.07+grain*.014
        elif texture=='brass':
            patina=np.clip((grain-.57)*5,0,.45)
            colors=np.array(color)[None,None,:]*(.75+grain[:,:,None]*.48)*(1-patina[:,:,None])+np.array([.075,.19,.16])*patina[:,:,None]
            roughmap=rough+(grain-.5)*.15+patina*.25
        else:
            colors=np.array(color)[None,None,:]*(.8+grain[:,:,None]*.38)
            roughmap=rough+(grain-.5)*.12;relief=grain*.035
        dy,dx=np.gradient(relief)
        normal=np.stack([.5-dx*1.8,.5-dy*1.8,np.ones_like(xx)],axis=-1)
        for channel,im in [('Base Color',image(name+' color',np.clip(colors,0,1),True)),('Roughness',image(name+' roughness',roughmap))]:
            node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=im
            links.new(node.outputs['Color'],bsdf.inputs[channel])
        node=mat.node_tree.nodes.new('ShaderNodeTexImage');node.image=image(name+' normal',normal)
        norm=mat.node_tree.nodes.new('ShaderNodeNormalMap');norm.inputs['Strength'].default_value=.3
        links.new(node.outputs['Color'],norm.inputs['Color']);links.new(norm.outputs['Normal'],bsdf.inputs['Normal'])
    materials.append(mat)
    return mat

ceramic=material('Ivory glaze',(.74,.69,.57),.28,.04,'ceramic')
brass=material('Antique brass',(.36,.225,.095),.34,.83,'brass')
dark=material('Deep teal enamel',(.017,.065,.060),.24,.35)
cloth=material('Petrol woven underlayer',(.027,.065,.062),.88,0,'fabric')
mantle=material('Oxide mantle',(.34,.066,.022),.92,0,'fabric');mantle.use_backface_culling=False
leather=material('Oiled leather',(.115,.055,.024),.6,0,'leather')
rubber=material('Charcoal joints and soles',(.014,.018,.017),.75)
eye=material('Amber optical glass',(.65,.27,.035),.19,.35,emission=.6)
thread=material('Golden stitching',(.36,.235,.105),.84)

def skin(obj,weights):
    if isinstance(weights,str): weights={weights:1}
    if isinstance(weights,dict):
        for name,value in weights.items(): obj.vertex_groups.new(name=name).add(list(range(len(obj.data.vertices))),value,'REPLACE')
    else:
        for i,w in enumerate(weights):
            for name,value in w.items():
                group=obj.vertex_groups.get(name) or obj.vertex_groups.new(name=name)
                if value>.0001: group.add([i],value,'REPLACE')
    return obj

def own(obj,name,mat,weights):
    obj.name='OWL '+name
    obj.data.name='OWL '+name
    for collection in list(obj.users_collection): collection.objects.unlink(obj)
    hero.objects.link(obj);obj.data.materials.append(mat);objects.append(obj)
    if weights: skin(obj,weights)
    return obj

def finish(obj,bevel=0,smooth=True):
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=obj.modifiers.new('Crafted edges','BEVEL');mod.width=bevel;mod.segments=2
        bpy.ops.object.modifier_apply(modifier=mod.name)
    if smooth:
        for face in obj.data.polygons: face.use_smooth=True
    obj.select_set(False)
    return obj

def mesh(name,verts,faces,mat,weights,uvs=None,solid=0,bevel=0,subdivide=0):
    data=bpy.data.meshes.new('OWL '+name);data.from_pydata(verts,[],faces);data.update()
    bm=bmesh.new();bm.from_mesh(data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(data);bm.free()
    obj=bpy.data.objects.new('OWL '+name,data);hero.objects.link(obj);data.materials.append(mat);objects.append(obj)
    if weights: skin(obj,weights)
    uv=data.uv_layers.new(name='Craft UV')
    for loop in data.loops:
        p=data.vertices[loop.vertex_index].co
        uv.data[loop.index].uv=uvs[loop.vertex_index] if uvs else (p.x*3,p.z*3)
    if solid or subdivide:
        bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
        if subdivide:
            mod=obj.modifiers.new('Crafted curvature','SUBSURF');mod.levels=subdivide
            bpy.ops.object.modifier_apply(modifier=mod.name)
        if solid:
            mod=obj.modifiers.new('Shell thickness','SOLIDIFY');mod.thickness=solid
            bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    return finish(obj,bevel)

def sphere(name,pos,scale,mat,weights,segments=20,rings=10):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments,ring_count=rings,radius=1,location=pos)
    obj=own(bpy.context.object,name,mat,weights);obj.scale=scale
    return finish(obj)

def box(name,pos,size,mat,weights,bevel=.007):
    bpy.ops.mesh.primitive_cube_add(size=1,location=pos)
    obj=own(bpy.context.object,name,mat,weights);obj.scale=size
    return finish(obj,bevel,False)

def cylinder(name,a,b,radius,mat,weights,vertices=24,radius2=None):
    a,b=Vector(a),Vector(b);direction=b-a
    bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=radius,radius2=radius if radius2 is None else radius2,depth=direction.length,location=(a+b)/2)
    obj=own(bpy.context.object,name,mat,weights);obj.rotation_mode='QUATERNION';obj.rotation_quaternion=direction.to_track_quat('Z','Y')
    return finish(obj)

def path(name,points,radius,mat,weights,cyclic=False):
    curve=bpy.data.curves.new('OWL '+name,'CURVE');curve.dimensions='3D';curve.resolution_u=4;curve.bevel_depth=radius;curve.bevel_resolution=1
    spline=curve.splines.new('POLY');spline.points.add(len(points)-1);spline.use_cyclic_u=cyclic
    for p,co in zip(spline.points,points): p.co=(*co,1)
    obj=bpy.data.objects.new('OWL '+name,curve);hero.objects.link(obj);curve.materials.append(mat)
    bpy.ops.object.select_all(action='DESELECT');obj.select_set(True);bpy.context.view_layer.objects.active=obj
    bpy.ops.object.convert(target='MESH');objects.append(obj);skin(obj,weights);obj.select_set(False)
    return obj

def ring(name,center,radius,wire,mat,weights,normal=(0,-1,0),count=32):
    normal=Vector(normal).normalized();axis=normal.orthogonal().normalized();other=normal.cross(axis)
    return path(name,[Vector(center)+radius*(axis*math.cos(i*math.tau/count)+other*math.sin(i*math.tau/count)) for i in range(count)],wire,mat,weights,True)

def joint(name,pos,axis,radius,weights):
    p=Vector(pos);axis=Vector(axis).normalized()
    cylinder(name+' bearing',p-axis*.032,p+axis*.032,radius,brass,weights)
    for sign in (-1,1):
        center=p+axis*.034*sign
        cylinder(name+' cap',center-axis*.005,center+axis*.005,radius*.71,dark,weights)
        ring(name+' rim',center+axis*.006*sign,radius*.77,.003,brass,weights,axis,32)
        cylinder(name+' axle',center-axis*.007,center+axis*.007,radius*.23,brass,weights,12)

def torso_weight(z):
    levels=[(.94,'pelvis'),(1.10,'spine_01'),(1.24,'spine_02'),(1.39,'spine_03')]
    if z<=levels[0][0]:return {levels[0][1]:1}
    for (lo,a),(hi,b) in zip(levels,levels[1:]):
        if z<=hi:
            t=(z-lo)/(hi-lo);return {a:1-t,b:t}
    return {'spine_03':1}

def loft(name,profiles,mat,weights,count=40):
    verts=[];uvs=[];ws=[]
    for row,(z,rx,ry,cy) in enumerate(profiles):
        for i in range(count):
            t=i*math.tau/count
            verts.append((rx*math.sin(t),cy-ry*math.cos(t),z));uvs.append((i/count,row/(len(profiles)-1)))
            ws.append(weights(z) if callable(weights) else {weights:1} if isinstance(weights,str) else weights)
    faces=[tuple(range(count-1,-1,-1))]
    for row in range(len(profiles)-1):
        for i in range(count):
            a=row*count+i;b=row*count+(i+1)%count;faces.append((a,b,b+count,a+count))
    faces.append(tuple((len(profiles)-1)*count+i for i in range(count)))
    return mesh(name,verts,faces,mat,ws,uvs)

def plate(name,a,b,width,depth,mat,bone,span=1.22):
    a,b=Vector(a),Vector(b);direction=(b-a).normalized();front=Vector((0,-1,0));front=(front-direction*front.dot(direction)).normalized();side=direction.cross(front)
    verts=[];uv=[]
    shape=[(0,.45),(.08,.85),(.25,1),(.7,.87),(.92,.7),(1,.25)]
    for row,(t,w) in enumerate(shape):
        for i in range(13):
            angle=(i/12*2-1)*span
            verts.append(a+(b-a)*t+side*math.sin(angle)*width*w+front*math.cos(angle)*depth)
            uv.append((i/12,t))
    faces=[]
    for row in range(len(shape)-1):
        for i in range(12):
            k=row*13+i;faces.append((k,k+1,k+14,k+13))
    return mesh(name,verts,faces,mat,bone,uv,solid=.006,subdivide=1)

# Torso has a deforming textile core and independently weighted manufactured plates.
loft('Tailored underlayer',[(.86,.125,.075,.025),(.94,.157,.097,.016),(1.03,.144,.098,.004),(1.12,.145,.112,.002),(1.25,.186,.126,.01),(1.38,.212,.13,.015),(1.45,.185,.104,.022),(1.50,.069,.072,.012)],cloth,torso_weight)
for side in (-1,1):
    # Broad breastplate follows the torso; a small central seam leaves room for spine flexion.
    verts=[];weights=[];uv=[]
    for row in range(9):
        t=row/8;z=1.20+.15*t
        for col in range(9):
            u=col/8;x=side*(.013+u*(.156+.027*t))
            y=.012-(.132+.008*t)*math.sqrt(max(.02,1-(x/(.192+.027*t))**2))-.01
            verts.append((x,y,z));weights.append(torso_weight(z));uv.append((u,t))
    mesh('Fitted breastplate',verts,[(r*9+c,r*9+c+1,r*9+c+10,r*9+c+9) for r in range(8) for c in range(8)],ceramic,weights,uv,solid=.007,subdivide=1)
    plate('Rear shoulder blade',(side*.09,.085,1.43),(side*.085,.082,1.22),.083,-.055,ceramic,'spine_03',1.2)
for z in (1.08,1.126,1.172):
    path('Abdominal leather rib',[(.138*math.sin(i*math.pi/24-math.pi/2),.003-.115*math.cos(i*math.pi/24-math.pi/2),z) for i in range(25)],.005,leather,torso_weight(z))
for z in (1.015,1.048):
    path('Waist belt edge',[(.161*math.sin(i*math.tau/64),.01-.107*math.cos(i*math.tau/64),z) for i in range(64)],.003,brass,'pelvis',True)
loft('Waist belt',[(1.007,.160,.105,.01),(1.054,.160,.105,.01)],leather,'pelvis',48)
box('Belt buckle',(0,-.102,1.032),(.058,.014,.047),brass,'pelvis',.004)
box('Buckle recess',(0,-.111,1.032),(.038,.006,.026),dark,'pelvis',.002)
for x in (-.105,-.065,.065,.105): sphere('Belt rivet',(x,-.098,1.032),(.004,.004,.004),brass,'pelvis',12,8)

# Limbs are modelled around the imported rest pivots, so the original motion remains exact.
for side,sign in [('l',1),('r',-1)]:
    def head(name):return rig.data.bones[name+'_'+side].head_local.copy()
    hip,knee,ankle=head('thigh'),head('calf'),head('foot')
    shoulder,elbow,wrist=head('upperarm'),head('lowerarm'),head('hand')
    for name,a,b,r1,r2 in [('thigh',hip,knee,.078,.061),('calf',knee,ankle,.06,.038),('upperarm',shoulder,elbow,.066,.043),('lowerarm',elbow,wrist,.048,.034)]:
        axis=(b-a).normalized();length=(b-a).length
        cylinder(name+' woven sleeve',a+axis*.026,b-axis*.025,r1,cloth,name+'_'+side,32,r2)
        if name=='thigh':
            plate('Thigh fluted shell',a+axis*.075,b-axis*.08,.074,.083,ceramic,name+'_'+side)
        elif name=='calf':
            plate('Long greave',a+axis*.065,b-axis*.06,.062,.062,ceramic,name+'_'+side)
            path('Greave center inlay',[a+axis*.085+Vector((0,-.064,0)),a+axis*.24+Vector((0,-.064,0)),b-axis*.08+Vector((0,-.06,0))],.002,brass,name+'_'+side)
        else:
            plate('Arm carved shell',a+axis*.048,b-axis*.045,r1*.99,r1*1.06,ceramic,name+'_'+side)
        for t in (.18,.82):
            center=a+(b-a)*t
            ring(name+' fastening band',center,r1*(1-t)+r2*t+.005,.005,leather,name+'_'+side,axis,32)
            for offs in (-.019,.019):
                sphere('Inset armor fastener',center+Vector((offs,-r1-.006,0)),(.0035,.0035,.0035),brass,name+'_'+side,12,8)
    joint('Hip',hip,(1,0,0),.065,'thigh_'+side)
    joint('Knee',knee,(1,0,0),.051,'calf_'+side)
    joint('Ankle',ankle,(1,0,0),.039,'foot_'+side)
    joint('Shoulder',shoulder,(0,1,0),.073,'upperarm_'+side)
    joint('Elbow',elbow,(0,0,1),.039,'lowerarm_'+side)
    joint('Wrist',wrist,(0,0,1),.029,'hand_'+side)
    # Overlapping foot and toe shells allow the actual source toe joint to articulate.
    x=ankle.x
    box('Boot rear sole',(x,.014,.026),(.142,.174,.039),rubber,'foot_'+side,.012)
    box('Boot toe sole',(x,-.143,.026),(.15,.15,.039),rubber,'ball_'+side,.012)
    sphere('Boot instep',(x,-.02,.077),(.077,.119,.064),leather,'foot_'+side)
    sphere('Ceramic toe cap',(x,-.159,.061),(.077,.087,.039),ceramic,'ball_'+side)
    plate('Boot bridge shell',(x,-.006,.14),(x,-.053,.061),.059,.053,ceramic,'foot_'+side,1.05)
    for z in (.085,.115):
        path('Boot strap',[(x-.055,-.068,z),(x,-.088,z+.008),(x+.055,-.068,z)],.006,leather,'foot_'+side)
    for dx in (-.049,.049):
        sphere('Boot buckle',(x+dx,-.06,.106),(.009,.006,.012),brass,'foot_'+side,16,8)
    # A fully articulated five-finger hand, with three mechanical segments per finger.
    hand=head('hand');palm=hand+Vector((sign*.067,0,0))
    sphere('Tailored glove palm',palm,(.074,.047,.027),rubber,'hand_'+side)
    box('Metacarpal shell',palm+Vector((0,0,.025)),(.10,.078,.012),ceramic,'hand_'+side,.01)
    for finger in ('index','middle','ring','pinky','thumb'):
        for segment in (1,2,3):
            bone=f'{finger}_{segment:02d}_{side}';bn=rig.data.bones[bone];a,b=bn.head_local,bn.tail_local;direction=(b-a).normalized()
            radius=.010 if finger in ('thumb','middle') else .009
            sphere('Finger knuckle',a,(radius*1.15,)*3,brass,bone,12,8)
            cylinder('Finger shell',a+direction*.006,b-direction*.004,radius,ceramic,bone,12,radius*.83)

# Neck bellows and a sculpted helmet with a pointed owl mask.
for z in (1.495,1.51,1.525,1.54,1.555):
    cylinder('Neck bellows',(0,.008,z-.008),(0,.008,z+.008),.059,rubber,'neck_01',32)
    ring('Neck coupling lip',(0,.008,z),.061,.0028,brass,'neck_01',(0,0,1),40)
helmet_profiles=[(1.567,.021,.040,-.01),(1.59,.052,.07,-.013),(1.63,.091,.104,-.012),(1.68,.116,.123,-.008),(1.735,.134,.14,-.003),(1.80,.135,.141,.005),(1.855,.119,.13,.017),(1.893,.093,.106,.032),(1.916,.048,.065,.039),(1.923,.009,.018,.041)]
loft('Continuous ceramic helmet',helmet_profiles,ceramic,'Head',80)
def face_depth(x,z,extra=0):
    for a,b in zip(helmet_profiles,helmet_profiles[1:]):
        if z<=b[0]:
            t=max(0,(z-a[0])/(b[0]-a[0]));rx,ry,cy=[a[i]*(1-t)+b[i]*t for i in (1,2,3)]
            return cy-ry*math.sqrt(max(.015,1-(x/rx)**2))-extra
    return -.01-extra
def face_panel(name,outline,mat,offset=.008):
    # Dense concentric rings conform the inset to the curved ceramic shell.
    center=np.mean(np.array(outline),axis=0);verts=[];uv=[];count=len(outline)
    for row in range(9):
        size=.005+row/8*.995
        for x,z in outline:
            px,pz=center+(np.array([x,z])-center)*size
            verts.append((float(px),face_depth(px,pz,offset),float(pz)));uv.append((px*3,pz*3))
    faces=[tuple(range(count-1,-1,-1))]
    for row in range(8):
        for i in range(count):
            a=row*count+i;b=row*count+(i+1)%count;faces.append((a,b,b+count,a+count))
    return mesh(name,verts,faces,mat,'Head',uv,solid=.002)
def smooth_outline(points):
    for _ in range(3):
        result=[]
        for a,b in zip(points,points[1:]+points[:1]):
            result.extend([(a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25),(a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75)])
        points=result
    return points
for sign in (-1,1):
    outline=smooth_outline([(sign*x,z) for x,z in [(0,1.708),(.022,1.764),(.05,1.808),(.079,1.814),(.108,1.785),(.116,1.74),(.091,1.675),(.047,1.624),(0,1.59)]])
    face_panel('Owl face inset',outline,dark,.005)
    path('Mask brass reveal',[(x,face_depth(x,z,.007),z) for x,z in outline],.0018,brass,'Head',True)
    path('Swept crown inlay',[(sign*x,face_depth(x,z,.003),z) for x,z in [(.012,1.913),(.034,1.896),(.05,1.873),(.063,1.848),(.077,1.831)]],.0013,brass,'Head')
    # Lens assembly is oriented to the sloping mask instead of facing straight ahead.
    x=sign*.063;z=1.747;y=face_depth(x,z,.008)
    normal=Vector((sign*.38,-.92,.015)).normalized();center=Vector((x,y,z))
    cylinder('Eye dark socket',center-normal*.004,center+normal*.001,.027,rubber,'Head',32)
    ring('Eye outer bezel',center+normal*.003,.024,.0025,brass,'Head',normal)
    lens=sphere('Amber lens',center+normal*.006,(.019,.008,.02),eye,'Head',24,12)
    lens.rotation_euler[2]=sign*.39
    pupil=sphere('Optic pupil',center+normal*.012,(.009,.003,.011),dark,'Head',20,10)
    pupil.rotation_euler[2]=sign*.39
    sphere('Eye catchlight',center+normal*.014+Vector((-.004,0,.006)),(.002,.002,.002),eye,'Head',12,8)
    # Side bearings, screws and concentric rings make the helmet readable from the back.
    joint('Temple',(sign*.131,.016,1.751),(1,0,0),.046,'Head')
    for i in range(6):
        angle=i*math.tau/6
        sphere('Temple screw',(sign*.169,.016+math.sin(angle)*.035,1.751+math.cos(angle)*.035),(.003,.003,.003),brass,'Head',12,8)
    for t in (.26,.58,.82):
        angle=1.18+t*1.6
        points=[]
        for z,rx,ry,cy in helmet_profiles[2:-1]:
            points.append((sign*rx*math.sin(angle)*1.033,cy-ry*math.cos(angle)*1.033,z))
        path('Ceramic shell seam',points,.0015,brass,'Head')
for z in (1.65,1.69,1.73):
    box('Rear neck inspection plate',(0,.122,z),(.045,.007,.022),brass,'Head',.003)

# Cloth has two articulated links across each of three columns, blended between columns.
bpy.ops.object.select_all(action='DESELECT');rig.select_set(True);bpy.context.view_layer.objects.active=rig
bpy.ops.object.mode_set(mode='EDIT')
cape_names=[]
for col,x in enumerate((-.2,0,.2)):
    top=1.44;length=.38+.20*(x+.2)/.4
    for row in range(2):
        name=f'mantle_{col}_{row}';bone=rig.data.edit_bones.new(name)
        bone.head=(x,.175+row*.055,top-length*row/2);bone.tail=(x,.23+row*.055,top-length*(row+1)/2)
        bone.parent=rig.data.edit_bones['spine_03' if row==0 else f'mantle_{col}_0'];cape_names.append(name)
    # Export leaves animation controls out; IK is opt-in in the editable blend.
for side in ('l','r'):
    foot=rig.data.edit_bones['foot_'+side]
    control=rig.data.edit_bones.new('control_foot_'+side);control.head=foot.head;control.tail=foot.head+Vector((0,-.16,0));control.use_deform=False
    pole=rig.data.edit_bones.new('control_knee_'+side);pole.head=rig.data.edit_bones['calf_'+side].head+Vector((0,-.5,0));pole.tail=pole.head+Vector((0,0,.12));pole.use_deform=False
bpy.ops.object.mode_set(mode='OBJECT');rig.select_set(False)
rig['Use foot IK']=0.0
for side in ('l','r'):
    con=rig.pose.bones['calf_'+side].constraints.new('IK');con.name='Optional editing IK';con.target=rig;con.subtarget='control_foot_'+side;con.pole_target=rig;con.pole_subtarget='control_knee_'+side;con.chain_count=2;con.influence=0
    driver=con.driver_add('influence').driver;driver.expression='enabled';variable=driver.variables.new();variable.name='enabled';variable.type='SINGLE_PROP';variable.targets[0].id=rig;variable.targets[0].data_path='["Use foot IK"]'
def cape_point(u,t):
    x=(u*2-1)*(.222+.026*t)
    length=.39+.21*u
    z=1.455-length*t+.012*math.sin(u*math.pi*9)*t*t
    y=.145+.035*math.sin(u*math.pi)+.025*t+.021*math.sin(u*math.pi*8+.4*t)*(.3+.7*t)
    return (x,y,z)
def cape_weights(u,t):
    col=u*2;left=min(1,int(col));blend=col-left
    v=min(1,t*1.5);w={}
    for c,f in ((left,1-blend),(left+1,blend)):
        w[f'mantle_{c}_0']=f*(1-v);w[f'mantle_{c}_1']=f*v
    if t<.10:
        w={k:v*t/.1 for k,v in w.items()};w['spine_03']=1-t/.1
    return {k:v for k,v in w.items() if v>.0001}
verts=[];faces=[];weights=[];uv=[]
for row in range(25):
    t=row/24
    for col in range(37):
        u=col/36;verts.append(cape_point(u,t));weights.append(cape_weights(u,t));uv.append((u,t))
for row in range(24):
    for col in range(36):
        k=row*37+col;faces.append((k,k+1,k+38,k+37))
mesh('Asymmetric travel mantle',verts,faces,mantle,weights,uv,solid=.004)
for t in (.96,.987):
    for i in range(52):
        u=(i+.5)/52;p=Vector(cape_point(u,t));q=Vector(cape_point(u+.008,t));p.y+=.004;q.y+=.004
        path('Mantle hand stitching',[p,q],.0008,thread,cape_weights(u,t))
# Continuous wrapped scarf: concentric cloth folds drape over the chest and shoulders.
def scarf_point(u,t):
    angle=u*math.tau;front=max(0,math.cos(angle));side=math.sin(angle)
    rx=.087+(.167+.012*side)*math.sqrt(t)
    ry=.090+.10*math.sqrt(t)
    fold=.009*math.sin(t*math.pi*7+angle*2)*math.sin(t*math.pi)
    z=1.509-(.079+.109*front+.023*side)*t+fold+.094*t*abs(side)**4
    return (math.sin(angle)*rx,.014-math.cos(angle)*(ry+fold),z)
verts=[];weights=[];uv=[]
for row in range(21):
    for col in range(65):
        u=col/64;t=row/20;p=scarf_point(u,t);verts.append(p);weights.append(torso_weight(p[2]));uv.append((u*2,t))
mesh('Wrapped shoulder scarf',verts,[(r*65+c,r*65+c+1,r*65+c+66,r*65+c+65) for r in range(20) for c in range(64)],mantle,weights,uv,solid=.004)
for i in range(80):
    u=i/80;p=Vector(scarf_point(u,.976));q=Vector(scarf_point(u+.005,.976));p.y-=.002;q.y-=.002
    path('Scarf hand stitching',[p,q],.0007,thread,torso_weight(p.z))

# A tailored harness and field equipment. Straps deform across the spine instead of floating.
for sign in (-1,1):
    def strap_point(t,dx=0,extra=0):
        z=1.067+.253*t;x=sign*(-.126+.216*t)+dx
        # Same profile and skin interpolation as the chest beneath the strap.
        if z>=1.20:
            f=(z-1.20)/.235;rx=.192+.027*f;ry=.132+.008*f;cy=.012
        else:rx=.154;ry=.117;cy=.003
        y=cy-ry*math.sqrt(max(.02,1-(x/rx)**2))-.022-extra
        return (x,y,z)
    verts=[];weights=[];uv=[]
    for i in range(25):
        t=i/24
        for dx in (-.017,.017):
            p=strap_point(t,dx,0 if sign==1 else .008);verts.append(p);weights.append(torso_weight(p[2]));uv.append((0 if dx<0 else 1,t*4))
    mesh('Cross body leather harness',verts,[(i*2,i*2+1,i*2+3,i*2+2) for i in range(24)],leather,weights,uv,solid=.004)
    for i in range(26):
        t=.025+i/25*.95
        for dx in (-.012,.012):
            p=strap_point(t,dx,.003 if sign==1 else .011);q=strap_point(t+.011,dx,.003 if sign==1 else .011)
            path('Harness saddle stitch',[p,q],.00065,thread,torso_weight(p[2]))
box('Field satchel',(-.19,.035,.978),(.145,.13,.203),leather,'pelvis',.016)
box('Satchel folded flap',(-.19,-.035,1.022),(.15,.018,.104),leather,'pelvis',.011)
for x in (-.226,-.158):
    box('Satchel keeper',(x,-.049,.968),(.019,.012,.068),leather,'pelvis',.003)
    box('Satchel buckle',(x,-.059,.985),(.026,.007,.025),brass,'pelvis',.003)
for z in (.891,1.015):path('Satchel seam',[(-.25,-.04,z),(-.19,-.04,z-.008),(-.13,-.04,z)],.001,thread,'pelvis')
cylinder('Survey telescope',(.16,-.109,.855),(.16,-.109,1.025),.022,brass,'pelvis',32,.018)
for z in (.86,.9,.97,1.026):ring('Telescope band',(.16,-.109,z),.023,.0028,brass,'pelvis',(0,0,1),24)
cylinder('Telescope lens',(.16,-.109,.851),(.16,-.109,.855),.017,dark,'pelvis')
# The astronomical clasp is deliberately concentrated detail against broad cloth surfaces.
center=Vector((.128,-.176,1.389))
cylinder('Astrolabe backing',center+Vector((0,.006,0)),center-Vector((0,.006,0)),.061,dark,'spine_03',48)
for radius,wire in ((.061,.003),(.052,.002),(.036,.0016),(.019,.0017)):
    ring('Astrolabe engraved orbit',center-Vector((0,.01,0)),radius,wire,brass,'spine_03',count=48)
for i in range(24):
    angle=i*math.tau/24;d=Vector((math.sin(angle),0,math.cos(angle)))
    path('Astrolabe index',[center+d*.054-Vector((0,.012,0)),center+d*(.06 if i%3 else .048)-Vector((0,.012,0))],.0009,brass,'spine_03')
for angle in (.4,1.65):
    d=Vector((math.sin(angle),0,math.cos(angle)))
    path('Astrolabe pointer',[center-d*.049-Vector((0,.016,0)),center+d*.049-Vector((0,.016,0))],.0018,brass,'spine_03')
sphere('Astrolabe pivot',center-Vector((0,.02,0)),(.004,)*3,brass,'spine_03',16,8)

# Reduce mesh submissions while retaining all independently assigned bone weights.
bpy.context.view_layer.update()
for obj in objects:
    if len(obj.vertex_groups)==1 and obj.vertex_groups[0].name=='Head':
        # A compact mask gives the adult explorer a less toy-like head-to-body ratio.
        inverse=obj.matrix_world.inverted()
        for vertex in obj.data.vertices:
            p=obj.matrix_world@vertex.co;p.z=1.568+(p.z-1.568)*.84;vertex.co=inverse@p
material_groups={mat:[o for o in objects if o.type=='MESH' and o.data.materials[0]==mat] for mat in materials}
for mat,items in material_groups.items():
    if not items:continue
    bpy.ops.object.select_all(action='DESELECT')
    for o in items:o.select_set(True)
    bpy.context.view_layer.objects.active=items[0]
    if len(items)>1:bpy.ops.object.join()
    obj=bpy.context.object;obj.name='Wayfarer '+mat.name[4:];obj.parent=rig
    obj.data.validate(verbose=True);obj.data.update()
    # Bevel/subdivision interpolation can create a fifth influence. Keep deterministic normalized four-weight skins.
    for vertex in obj.data.vertices:
        influences=sorted([(g.group,g.weight) for g in vertex.groups if g.weight>.00001],key=lambda x:-x[1])[:4]
        total=sum(w for _,w in influences)
        for g in list(vertex.groups):obj.vertex_groups[g.group].remove([vertex.index])
        for group,weight in influences:obj.vertex_groups[group].add([vertex.index],weight/total,'REPLACE')
    mod=obj.modifiers.new('Wayfarer skin','ARMATURE');mod.object=rig;obj.select_set(False)

# Bake source motion onto the matching rest skeleton, adding secondary cape animation.
clips={'Idle':'Idle_Loop','Walk':'Walk_Loop','Run':'Jog_Fwd_Loop','JumpStart':'Jump_Start','FallLoop':'Jump_Loop','Land':'Jump_Land'}
source_fps=scene.render.fps
clip_info=[]
sole_mesh=next(o for o in hero.objects if 'Charcoal joints' in o.name)
sole_groups={g.index for g in sole_mesh.vertex_groups if g.name in ('foot_l','foot_r','ball_l','ball_r')}
sole_vertices=[v.index for v in sole_mesh.data.vertices if sum(g.weight for g in v.groups if g.group in sole_groups)>.99]
for name,source_name in clips.items():
    original=actions[source_name]
    duration=(original.frame_range[1]-original.frame_range[0])/source_fps
    # Start/land source motions contain recovery tails. Gameplay needs their immediate pose response.
    if name=='JumpStart':duration=.32
    elif name=='Land':duration=.26
    elif name=='FallLoop':duration=1.0
    frames=max(2,round(duration*30))
    rig.animation_data.action=original;rig.animation_data.action_slot=original.slots[0]
    samples=[]
    lo,hi=original.frame_range
    for i in range(frames+1):
        t=i/frames
        frame=lo+(hi-lo)*t
        scene.frame_set(int(frame),subframe=frame-int(frame))
        samples.append({p.name:(p.location.copy(),p.rotation_quaternion.copy(),p.scale.copy()) for p in rig.pose.bones if p.name not in cape_names and not p.name.startswith('control_')})
    rig.animation_data.action=None
    action=bpy.data.actions.new('OWL '+name);rig.animation_data.action=action
    for i,pose in enumerate(samples):
        t=i/frames
        for p in rig.pose.bones:
            p.rotation_mode='QUATERNION'
            if p.name.startswith('control_'):continue
            if p.name in pose:
                p.location,p.rotation_quaternion,p.scale=pose[p.name]
                # The controller owns travel and jump height; retain pelvis gait motion.
                if p.name=='root':p.location=(0,0,0)
            else:
                col,row=map(int,p.name.split('_')[1:]);p.location=(0,0,0);p.scale=(1,1,1)
                phase=t*math.tau*(2 if name in ('Walk','Run') else 1)+col*.48-row*.75
                lift=0 if name=='Idle' else .065 if name=='Walk' else .14 if name=='Run' else .20
                p.rotation_quaternion=Matrix.Rotation(lift+math.sin(phase)*(.027 if name=='Idle' else .065),4,'X').to_quaternion()
            p.keyframe_insert('location',frame=i+1);p.keyframe_insert('rotation_quaternion',frame=i+1);p.keyframe_insert('scale',frame=i+1)
    # glTF interpolates sampled transforms linearly. Use the same interpolation in
    # Blender and inspect subframes: a rotating toe can dip below its keyframe bounds.
    for curve in action.layers[0].strips[0].channelbag(action.slots[0]).fcurves:
        for key in curve.keyframe_points:key.interpolation='LINEAR'
    corrections=[0]*(frames+1)
    for iteration in range(2):
        lifts=[0]*(frames+1)
        for i in range(frames+1):
            for fraction in ((0,.25,.5,.75) if i<frames else (0,)):
                scene.frame_set(i+1,subframe=fraction);deps=bpy.context.evaluated_depsgraph_get()
                evaluated=sole_mesh.evaluated_get(deps);data=evaluated.to_mesh()
                minimum=min((evaluated.matrix_world@data.vertices[j].co).z for j in sole_vertices)
                evaluated.to_mesh_clear();correction=max(0,.0067-minimum)
                lifts[i]=max(lifts[i],correction)
                if fraction:lifts[i+1]=max(lifts[i+1],correction)
        for i,correction in enumerate(lifts):
            if not correction:continue
            scene.frame_set(i+1);p=rig.pose.bones['pelvis']
            basis=rig.matrix_world@p.parent.matrix@p.parent.bone.matrix_local.inverted()@p.bone.matrix_local
            p.location+=basis.to_3x3().inverted()@Vector((0,0,correction))
            p.keyframe_insert('location',frame=i+1);corrections[i]+=correction
    maximum_correction=max(corrections)
    smoothing={}
    if name=='Walk':
        smoothing_script=Path(__file__).with_name('smooth_walk.py')
        helpers={'__file__':str(smoothing_script),'__name__':'walk_smoothing'}
        exec(compile(smoothing_script.read_text(),str(smoothing_script),'exec'),helpers)
        smoothing=helpers['smooth_walk'](scene,rig,action,sole_mesh,sole_vertices)
    track=rig.animation_data.nla_tracks.new();track.name=name;strip=track.strips.new(name,0 if name=='Walk' else 1,action);track.mute=True
    clip_info.append({'name':name,'source':source_name,'duration':frames/30,'maximumSoleCorrection':maximum_correction,**({'smoothing':smoothing} if smoothing else {})})
rig.animation_data.action=None
for p in rig.pose.bones:p.matrix_basis.identity()
scene.frame_set(1)
bpy.ops.object.select_all(action='DESELECT')
rig.select_set(True)
for o in hero.objects:o.select_set(True)
export=ROOT/'examples/assets/models/observatory-character.glb'
bpy.ops.export_scene.gltf(filepath=str(export),export_format='GLB',use_selection=True,use_active_scene=True,
    export_animations=True,export_animation_mode='NLA_TRACKS',export_force_sampling=True,
    export_cameras=False,export_lights=False,export_def_bones=True)
raw=ROOT/'output/third-person-controller/source/uncompressed'
raw.mkdir(parents=True,exist_ok=True)
shutil.copyfile(export,raw/export.name)

# An editable, lit studio scene for inspecting the real mesh and animation in Blender.
rig.animation_data.action=next(t.strips[0].action for t in rig.animation_data.nla_tracks if t.name=='Idle')
rig.animation_data.action_slot=rig.animation_data.action.slots[0]
scene.frame_set(24)
studio=bpy.data.collections.new('Wayfarer look development');scene.collection.children.link(studio)
def light(name,pos,energy,size,color):
    data=bpy.data.lights.new(name,'AREA');data.energy=energy;data.shape='DISK';data.size=size;data.color=color
    obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=pos;obj.rotation_euler=(Vector((0,0,1))-obj.location).to_track_quat('-Z','Y').to_euler()
light('Warm studio key',(-3,-4,4.5),500,3.5,(1,.84,.65))
light('Cool studio fill',(3,-2,2.8),220,3,(.62,.78,1))
light('Edge light',(1,3,3.5),600,2.5,(1,.72,.42))
camera_data=bpy.data.cameras.new('Wayfarer review camera');camera=bpy.data.objects.new('Wayfarer review camera',camera_data);studio.objects.link(camera)
camera.location=(2.7,-4.3,2.3);camera.rotation_euler=(Vector((0,0,1.03))-camera.location).to_track_quat('-Z','Y').to_euler();camera_data.type='ORTHO';camera_data.ortho_scale=2.36;scene.camera=camera
world=bpy.data.worlds.new('Wayfarer studio');world.use_nodes=True;world.node_tree.nodes['Background'].inputs['Color'].default_value=(.075,.092,.105,1);world.node_tree.nodes['Background'].inputs['Strength'].default_value=.4;scene.world=world
scene.render.engine='CYCLES';scene.cycles.samples=24;scene.cycles.use_denoising=True
scene.render.resolution_x=960;scene.render.resolution_y=1080;scene.render.resolution_percentage=100
scene.view_settings.view_transform='AgX'
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.013))
floor=bpy.context.object;floor.name='Studio floor (not exported)'
for collection in list(floor.users_collection):collection.objects.unlink(floor)
studio.objects.link(floor)
floor_mat=bpy.data.materials.new('Studio slate');floor_mat.diffuse_color=(.063,.077,.081,1);floor.data.materials.append(floor_mat)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'owl-wayfarer.blend'))
(SOURCE/'animation-mapping.json').write_text(json.dumps(clip_info,indent=2))
scene.render.filepath=str(SOURCE/'owl-wayfarer-front.png');bpy.ops.render.render(write_still=True)
print(json.dumps({'export':str(export),'bytes':export.stat().st_size,'bones':len(rig.data.bones),'meshes':len(hero.objects),'clips':clip_info,'preview':scene.render.filepath}))
