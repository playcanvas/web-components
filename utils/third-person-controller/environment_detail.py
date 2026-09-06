"""Concept-faithful observatory art pass, executed in create_scene.py's Blender context.

The calibrated traversal and collision layout stays in create_scene.py. This module
replaces its layout proxies with weathered architecture, machinery and a ruin valley.
"""
import bmesh
from mathutils import Matrix, Quaternion
exec(compile(Path(__file__).with_name('surface_geometry.py').read_text(),str(Path(__file__).with_name('surface_geometry.py')),'exec'))

ART_SOURCE=SOURCE/'environment-v2'
ART_SOURCE.mkdir(parents=True,exist_ok=True)
random.seed(734)

# Retain the calibrated walking surfaces, replacing the visual placeholders around them.
remove_prefixes=('Distant ridge','Mineral outcrop','Copper sedge','Autumn copper foliage','Windswept tree','Fine tree branch',
                 'Great ring','Meridian','Engraved hour mark','Suspended amber heart','Armillary support','Dais inset',
                 'Arrival portal','West gate','Colonnade','Waylight','Weathered stone fragment')
for obj in list(env.objects):
    if obj.name.startswith(remove_prefixes) or any(part in obj.name for part in (' buttress',' paving')):
        data=obj.data;bpy.data.objects.remove(obj,do_unlink=True)
        if data.users==0 and isinstance(data,bpy.types.Mesh):bpy.data.meshes.remove(data)
    elif obj.name=='Armillary dais':
        # Its underside sits within the floor; a second cap competes with the
        # plinth/floor detailing without contributing an exposed surface.
        bm=bmesh.new();bm.from_mesh(obj.data)
        bmesh.ops.delete(bm,geom=[face for face in bm.faces if face.normal.z<-.9999],context='FACES')
        bm.to_mesh(obj.data);bm.free()

def trim_object(obj,masks):
    if not masks:return
    matrix=obj.matrix_world.copy();inverse=matrix.inverted()
    positions=[matrix@v.co for v in obj.data.vertices]
    vertices=[(p.x,p.z,-p.y) for p in positions]
    vertices,faces=trim_faces(vertices,[tuple(p.vertices) for p in obj.data.polygons],masks)
    old=obj.data
    if not faces:
        bpy.data.objects.remove(obj,do_unlink=True)
    else:
        data=bpy.data.meshes.new(old.name+' fitted')
        data.from_pydata([tuple(inverse@Vector(pc(p))) for p in vertices],[],faces)
        data.update()
        for mat in old.materials:data.materials.append(mat)
        obj.data=data
    if old.users==0:bpy.data.meshes.remove(old)

# Foundation/deck/cornice volumes share an owner at platform junctions. Their
# coincident undersides and fascia otherwise remain visible from valley cameras.
bpy.context.view_layer.update()
for index,(name,x,z,w,d,top,tiles) in enumerate(platform_specs):
    previous=[p for p in platform_specs[:index] if p[5]==top]
    for kind,margin in (('foundation',-.16),('top',0),('cornice',.065)):
        masks=[rectangle(px,pz,pw,pd,(-.08 if ptiles and tiles else 0) if kind=='top' else margin) for _,px,pz,pw,pd,_,ptiles in previous]
        for obj in list(env.objects):
            if obj.name.startswith(name+' '+kind):trim_object(obj,masks)

# Flat connectors end at the platform's edge, rather than lying through its tiles.
# Sloped ramps retain their complete incline; the separate collision mesh is untouched.
flat_connectors=[]
for name,a,b,width in ramp_specs:
    if abs(a[1]-b[1])>1e-6:continue
    masks=[rectangle(x,z,w,d) for _,x,z,w,d,top,_ in platform_specs if abs(top-a[1])<1e-6]
    masks += [footprint for top,footprint in flat_connectors if abs(top-a[1])<1e-6]
    for obj in list(env.objects):
        if obj.name==name or obj.name.startswith(name+' '):trim_object(obj,masks)
    direction=Vector((b[0]-a[0],b[2]-a[2])).normalized()
    side=Vector((-direction.y,direction.x))*(width/2+.16)
    footprint=[(a[0]-side.x,a[2]-side.y),(b[0]-side.x,b[2]-side.y),
               (b[0]+side.x,b[2]+side.y),(a[0]+side.x,a[2]+side.y)]
    flat_connectors.append((a[1],footprint))

# Texture inputs: an image-generated limestone albedo and deterministic Blender surface maps.
stone_image=bpy.data.images.load(str(ROOT/'utils/third-person-controller/textures/weathered-limestone.png'),check_existing=True)
stone_image.colorspace_settings.name='sRGB';stone_image.pack()
stone_tints=((.91,.92,.86),(.82,.87,.86),(1,.96,.85),(.70,.74,.73),(.98,.95,.87),(.40,.46,.43))
def stone_surface(mat,tint):
    nodes=mat.node_tree.nodes;bsdf=nodes.get('Principled BSDF')
    texture=nodes.new('ShaderNodeTexImage');texture.image=stone_image
    # The glTF exporter recognizes this multiply as a baseColorFactor, sharing one image.
    mix=nodes.new('ShaderNodeMix');mix.data_type='RGBA';mix.blend_type='MULTIPLY'
    mix.inputs[0].default_value=1;mix.inputs[7].default_value=(*tint,1)
    mat.node_tree.links.new(texture.outputs['Color'],mix.inputs[6])
    mat.node_tree.links.new(mix.outputs[2],bsdf.inputs['Base Color'])
    for node in nodes:
        if node.type=='NORMAL_MAP':node.inputs['Strength'].default_value=.55
    mat.diffuse_color=(*tint,1)
for mat,tint in zip([*stone,edge,cliff],stone_tints):stone_surface(mat,tint)

def art_image(name,data,color=False):
    if data.ndim==2:data=np.stack([data,data,data,np.ones_like(data)],axis=-1)
    if data.shape[-1]==3:data=np.concatenate([data,np.ones((*data.shape[:2],1))],axis=-1)
    im=bpy.data.images.new('OBS '+name,width=data.shape[1],height=data.shape[0],alpha=True)
    im.colorspace_settings.name='sRGB' if color else 'Non-Color'
    im.pixels.foreach_set(data.astype(np.float32).ravel());im.file_format='PNG';im.filepath_raw=str(ART_SOURCE/(name+'.png'));im.save();im.pack()
    return im

noise=relief
weather=np.clip((noise-.40)*3,0,.7)
metal_color=np.array([.42,.285,.125])[None,None,:]*(.62+noise[:,:,None]*.9)
metal_color=metal_color*(1-weather[:,:,None])+np.array([.066,.105,.078])*weather[:,:,None]
brass_color=art_image('aged-brass-albedo',metal_color,True)
brass_rough=art_image('aged-brass-roughness',np.clip(.34+weather*.55+(noise-.5)*.15,.25,.83))
for mat in (bronze,patina):
    nodes=mat.node_tree.nodes;links=mat.node_tree.links;bsdf=nodes.get('Principled BSDF')
    for image_,channel in ((brass_color,'Base Color'),(brass_rough,'Roughness')):
        node=nodes.new('ShaderNodeTexImage');node.image=image_;links.new(node.outputs['Color'],bsdf.inputs[channel])
    bsdf.inputs['Metallic'].default_value=.78
gilt=material('OBS Worn gold edges',(.39,.265,.12),.38,.8)
recess=material('OBS Bronze engraved recess',(.058,.047,.028),.86,.35)
moss=material('OBS Moss in masonry joints',(.091,.115,.049),1)
bark=material('OBS Weathered olive wood',(.092,.080,.049),.95)
greens=[material('OBS Olive foliage '+str(i),c,.93) for i,c in enumerate(((.095,.125,.048),(.17,.185,.071),(.24,.22,.095)))]
for mat in greens:mat.use_backface_culling=False
ruin_stone=material('OBS Valley limestone',(.34,.30,.22),.92)
stone_surface(ruin_stone,(.63,.69,.65))
earth=material('OBS Valley bedrock',(.15,.17,.105),1)
core_light=material('OBS Celestial tracery',(.14,.56,.49),.3,.2,1.3)

# Mesh batching during authoring keeps thousands of small carved details inexpensive.
batches={}
monument_center=(7,11.5,-21)
rotor_names={f'rotor-{i}':name for i,name in enumerate(('Armillary Inner Meridian','Armillary Inner Ecliptic','Armillary Inner Equator','Armillary Celestial Core'))}
surface_masks=[]
def geometry(mat,verts,faces,region='center',smooth=False):
    if surface_masks:verts,faces=trim_faces(verts,faces,surface_masks)
    if not faces:return
    key=(mat,region,smooth)
    out=batches.setdefault(key,[[],[]]);offset=len(out[0]);out[0].extend(verts)
    out[1].extend(tuple(offset+i for i in face) for face in faces)

def cuboid(center,size,mat,region='center',yaw=0,bevel=0,bottom=True):
    cx,cy,cz=center;w,h,d=size
    # Chamfered footprint gives paving and masonry worn, non-razor-sharp corners.
    bevel=min(bevel,w*.2,d*.2)
    outline=[(-w/2+bevel,-d/2),(w/2-bevel,-d/2),(w/2,-d/2+bevel),(w/2,d/2-bevel),
             (w/2-bevel,d/2),(-w/2+bevel,d/2),(-w/2,d/2-bevel),(-w/2,-d/2+bevel)] if bevel else [(-w/2,-d/2),(w/2,-d/2),(w/2,d/2),(-w/2,d/2)]
    count=len(outline);verts=[]
    for dy in (-h/2,h/2):
        for x,z in outline:verts.append((cx+x*math.cos(yaw)-z*math.sin(yaw),cy+dy,cz+x*math.sin(yaw)+z*math.cos(yaw)))
    faces=([tuple(range(count-1,-1,-1))] if bottom else [])+[tuple(count+i for i in range(count))]
    faces += [(i,(i+1)%count,(i+1)%count+count,i+count) for i in range(count)]
    geometry(mat,verts,faces,region)

def lathe(center,profile,mat,region='center',segments=40,flutes=0,caps=True):
    x,y,z=center;verts=[]
    for height,radius in profile:
        for j in range(segments):
            a=j*math.tau/segments;r=radius*(1-flutes*(.5+.5*math.cos(a*12)))
            verts.append((x+math.cos(a)*r,y+height,z+math.sin(a)*r))
    faces=[tuple(range(segments-1,-1,-1))] if caps is True else []
    for row in range(len(profile)-1):
        for j in range(segments):
            k=row*segments+j;n=row*segments+(j+1)%segments;faces.append((k,n,n+segments,k+segments))
    if caps:faces.append(tuple((len(profile)-1)*segments+j for j in range(segments)))
    geometry(mat,verts,faces,region,True)

def band(center,radius,width,depth,mat,region='center',rotation=(0,0,0),start=0,end=math.tau,segments=96):
    # Broad rectangular band, initially in the XY plane, with an engraved front face.
    transform=Matrix.Rotation(rotation[1],4,'Y')@Matrix.Rotation(rotation[0],4,'X')@Matrix.Rotation(rotation[2],4,'Z')
    verts=[]
    for i in range(segments+1):
        a=start+(end-start)*i/segments
        for rad,d in ((radius-width/2,-depth/2),(radius+width/2,-depth/2),(radius+width/2,depth/2),(radius-width/2,depth/2)):
            p=transform@Vector((rad*math.cos(a),rad*math.sin(a),d));verts.append(tuple(Vector(center)+p))
    faces=[]
    for i in range(segments):
        for j in range(4):k=i*4+j;n=i*4+(j+1)%4;faces.append((k,n,n+4,k+4))
    geometry(mat,verts,faces,region)

def tube(points,radius,mat,region='center',segments=7):
    verts=[]
    for i,p in enumerate(points):
        tangent=Vector(points[min(i+1,len(points)-1)])-Vector(points[max(0,i-1)])
        tangent.normalize();a=tangent.orthogonal().normalized();b=tangent.cross(a)
        r=radius*(1-.6*i/max(1,len(points)-1))
        for j in range(segments):verts.append(tuple(Vector(p)+r*(a*math.cos(j*math.tau/segments)+b*math.sin(j*math.tau/segments))))
    faces=[]
    for i in range(len(points)-1):
        for j in range(segments):k=i*segments+j;n=i*segments+(j+1)%segments;faces.append((k,n,n+segments,k+segments))
    geometry(mat,verts,faces,region,True)

def medallion(x,y,z,radius,region='center'):
    for r,w in ((radius,.024),(radius-.15,.012),(radius*.60,.025),(radius*.57,.008)):
        band((x,y,z),r,w,.008,bronze,region,(math.pi/2,0,0),segments=120)
    for i in range(72):
        a=i*math.tau/72;r=radius-.07
        cuboid((x+math.cos(a)*r,y+.0055,z+math.sin(a)*r),(.025,.019,.24 if i%6==0 else .10),gilt,region,yaw=a-math.pi/2,bottom=False)
    for i in range(12):
        a=i*math.tau/12;r=radius*.78
        band((x+r*math.cos(a),y,z+r*math.sin(a)),.19,.018,.009,bronze,region,(math.pi/2,0,0),segments=20)
    global surface_masks
    # Each crossbar owns its footprint; crossing bars must not stack coplanar tops.
    surface_masks=[]
    for a in (0,math.pi/4):
        cuboid((x,y,z),(radius*1.08,.006,.012),bronze,region,yaw=a)
        surface_masks.append([(x+px*math.cos(a)-pz*math.sin(a),z+px*math.sin(a)+pz*math.cos(a)) for px,pz in rectangle(0,0,radius*1.08,.012)])
        cuboid((x,y,z),(.012,.006,radius*1.08),bronze,region,yaw=a)
        surface_masks.append([(x+px*math.cos(a)-pz*math.sin(a),z+px*math.sin(a)+pz*math.cos(a)) for px,pz in rectangle(0,0,.012,radius*1.08)])
    surface_masks=[]

def circular_paving(x,y,z,radius,region='center'):
    """Concentric, jointed stone courses, like the astronomical court in the concept."""
    courses=7
    for row in range(courses):
        inner=radius*row/courses;outer=radius*(row+1)/courses
        count=max(6,round((inner+outer)*math.pi/1.05));phase=(row%2)*math.pi/count
        for i in range(count):
            a0=i*math.tau/count+phase+.006;a1=(i+1)*math.tau/count+phase-.006
            rim=[]
            for rad,angles in ((max(.008,inner+.012),[a0+(a1-a0)*j/4 for j in range(5)]),
                               (outer-.012,[a1-(a1-a0)*j/4 for j in range(5)])):
                rim.extend((x+rad*math.cos(a),z+rad*math.sin(a)) for a in angles)
            verts=[(px,y+dy,pz) for dy in (-.05,0) for px,pz in rim];n=len(rim)
            faces=[tuple(range(n-1,-1,-1)),tuple(range(n,n*2))]
            faces += [(j,(j+1)%n,(j+1)%n+n,j+n) for j in range(n)]
            geometry(stone[(i+row)%4],verts,faces,region)

# Closely fitted, individually cut paving with narrow moss-filled seams.
platforms=[(0,15,18,14,0,'center'),(-17,-7,10,18,3,'west'),(-7,-24,19,4,3,'north'),
           (8,-20,18,12,3,'north'),(18,-9,6,16,3,'east'),(14,8,10,8,0,'east')]
for platform_index,(x,z,w,d,top,region) in enumerate(platforms):
    previous=[p for p in platforms[:platform_index] if p[4]==top]
    surface_masks=[rectangle(px,pz,pw,pd) for px,pz,pw,pd,_,_ in previous]
    nx,nz=round(w/1.45),round(d/1.45)
    for row in range(nz):
        for col in range(nx):
            px=x-w/2+(col+.5)*w/nx;pz=z-d/2+(row+.5)*d/nz
            cuboid((px,top-.04+random.uniform(-.002,.002),pz),(w/nx-.023,.08,d/nz-.023),random.choice(stone),region,bevel=random.uniform(.025,.06))
    # Trim overlapping platforms once, and shorten corner stones to meet cleanly.
    surface_masks=[rectangle(px,pz,pw,pd,.11) for px,pz,pw,pd,_,_ in previous]
    # Alternating masonry courses make the platform read as a substantial ruin.
    for h in (.4,1.1,1.8):
        for sign in (-1,1):
            count=max(1,round(d/1.7))
            for i in range(count):
                pz=z-d/2+(i+.5)*d/count
                cuboid((x+sign*(w/2+.018),top-h,pz),(.16,.62,d/count-.035),stone[(i+int(h*10))%4],region,bevel=.035)
        for sign in (-1,1):
            count=max(1,round(w/1.7))
            for i in range(count):
                span=w-.20;px=x-span/2+(i+.5)*span/count
                cuboid((px,top-h,z+sign*(d/2+.018)),(span/count-.035,.62,.16),stone[(i+1)%4],region,bevel=.035)
    surface_masks=[rectangle(px,pz,pw,pd) for px,pz,pw,pd,_,_ in previous]
    for sign in (-1,1):
        cuboid((x+sign*(w/2-.2),top+.008,z),(.035,.012,d-.4),bronze,region)
        cuboid((x,top+.008,z+sign*(d/2-.2)),(w-.445,.012,.035),bronze,region)
surface_masks=[]
circular_paving(0,.013,15,6.2)
medallion(0,.022,15,5.8)
medallion(7,3.52,-21,4.6,'north')

def carved_pillar(x,z,base,height,r=.65,region='center'):
    lathe((x,base,z),[(0,r*1.65),(.13,r*1.65),(.21,r*1.42),(.29,r*1.38),(.36,r*1.16),(.53,r*1.09),(.60,r)],stone[2],region,caps='top')
    lathe((x,base,z),[(.58,r),(.7,r*.97),(height-.6,r*.83),(height-.30,r*.95)],stone[1],region,72,.07)
    for h in (.26,.46,height-.55,height-.35):
        lathe((x,base+h,z),[(0,r*1.13),(.055,r*1.15),(.085,r*1.13)],bronze,region)
    lathe((x,base+height-.34,z),[(0,r),(.12,r*1.25),(.22,r*1.45),(.34,r*1.45)],stone[2],region)
    for h in (.7,height-.85):
        lathe((x,base+h,z),[(0,r*1.01),(.22,r*1.01)],bronze,region)
        for i in range(24):
            a=i*math.tau/24
            cuboid((x+r*1.025*math.cos(a),base+h+.11,z+r*1.025*math.sin(a)),(.035,.13,.025),gilt,region,yaw=-a)
    for h in (height*.36,height*.63):
        lathe((x,base+h,z),[(0,r*.97),(.022,r*.98)],recess,region,caps=False)

def arch(x,z,base,width,height,region='center',metal=False):
    r=width/2;center=(x,base+height-r,z)
    carved_pillar(x-r,z,base,height-r,.68,region);carved_pillar(x+r,z,base,height-r,.68,region)
    count=27
    for i in range(count):
        a0=i*math.pi/count+.002;a1=(i+1)*math.pi/count-.002
        verts=[]
        for dep in (-.60,.60):
            for rad,a in ((r-.34,a0),(r+.45,a0),(r+.45,a1),(r-.34,a1)):
                verts.append((x+rad*math.cos(a),center[1]+rad*math.sin(a),z+dep))
        geometry(stone[i%4],verts,[(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)],region)
    for rad,w in ((r-.30,.09),(r+.38,.065)):
        band((x,center[1],z+.625),rad,w,.07,bronze,region,start=0,end=math.pi,segments=100)
    if metal:
        band((x,center[1],z+.655),r+.02,.35,.085,bronze,region,start=0,end=math.pi,segments=100)
        for i in range(49):
            a=i*math.pi/48;r0=r+.025;p=(x+r0*math.cos(a),center[1]+r0*math.sin(a),z+.708)
            # Radial chisel marks in the visible broad bronze face.
            tangent=Vector((-math.sin(a),math.cos(a),0));radial=Vector((math.cos(a),math.sin(a),0))
            vs=[tuple(Vector(p)+tangent*s+radial*t) for s,t in ((-.012,-.11),(.012,-.11),(.012,.11),(-.012,.11))]
            geometry(gilt,vs,[(0,1,2,3)],region)
arch(0,10,0,8,6.5,metal=True)
arch(-17,-11,3,6,5,'west',True)
for z in (-15,-11,-7,-3):
    arch(18,z,3,4.6,5,'east')
    for x in (15.7,20.3):
        cuboid((x,8.05,z),(1.6,.45,1.7),stone[2],'east',bevel=.06)
for x in (15.7,20.3):
    cuboid((x,8.15,-9),(1.1,.45,16.7),stone[1],'east',bevel=.05)
    cuboid((x,8.43,-9),(1.38,.12,16.9),bronze,'east',bevel=.04)

# Mechanically separate rotors keep their bearings centered and clear the explorer's head.
center=monument_center
for x in (2,12):
    # The support plinths meet the dais at the same level. Trim their footprint
    # against its 96-sided flat top, including the cylinder's 25 mm bevel inset.
    surface_masks=[[(7+5.275*math.cos(i*math.tau/96),-21+5.275*math.sin(i*math.tau/96)) for i in range(96)]]
    cuboid((x,3.25,-21),(3,.5,3),stone[2],'north',bevel=.10,bottom=False)
    surface_masks=[]
    carved_pillar(x,-21,3.5,3.0,.85,'north')
    cuboid((x,6.7,-21),(1.1,.4,1.1),bronze,'north',bevel=.1)
band(center,6.7,.59,.40,bronze,'north',segments=144)
for r in (6.42,6.98):band((7,center[1],-20.77),r,.035,.045,gilt,'north',segments=144)
for i in range(120):
    a=i*math.tau/120;p=Vector((7+6.68*math.cos(a),center[1]+6.68*math.sin(a),-20.77))
    tangent=Vector((-math.sin(a),math.cos(a),0));radial=Vector((math.cos(a),math.sin(a),0));length=.22 if i%5==0 else .09
    geometry(recess,[tuple(p+tangent*s+radial*t) for s,t in ((-.018,-length),(.018,-length),(.018,length),(-.018,length))],[(0,1,2,3)],'north')
for rotor,radius in enumerate((5.80,4.95,5.4)):
    # Canonical XY ring meshes; the nested pivots own their authored tilt and motion.
    rot=(0,0,0)
    region=f'rotor-{rotor}'
    band(center,radius,.24,.19,bronze,region,rot,segments=192)
    band(center,radius-.09,.020,.22,gilt,region,rot,segments=192)
    band(center,radius+.09,.020,.22,gilt,region,rot,segments=192)
    for i in range(32):
        a=i*math.tau/32;transform=Matrix.Rotation(rot[1],4,'Y')@Matrix.Rotation(rot[0],4,'X')@Matrix.Rotation(rot[2],4,'Z')
        p=Vector(center)+transform@Vector((radius*math.cos(a),radius*math.sin(a),.11))
        tangent=transform@Vector((-math.sin(a),math.cos(a),0));radial=transform@Vector((math.cos(a),math.sin(a),0))
        geometry(gilt,[tuple(p+tangent*s+radial*t) for s,t in ((-.018,-.08),(.018,-.08),(.018,.08),(-.018,.08))],[(0,1,2,3)],region)
    for i in range(4):
        a=i*math.tau/4
        band(center,radius,.10,.25,core_light,region,rot,start=a-.045,end=a+.045,segments=12)
# The plasma core is authored after the gimbal pivots below.

# Valley geometry has actual depth and soft geological forms.
def terrain_height(x,z):
    ridge=max(0,(-z-45)/110)*(22+13*math.sin(x*.036+1)+8*math.cos(x*.081))
    return -26+7*math.sin(x*.053+z*.018)+5*math.cos(z*.071-x*.029)+3*math.sin(x*.127)*math.cos(z*.107)+ridge
verts=[];faces=[];nx,nz=101,91
for row in range(nz):
    z=-170+row*225/(nz-1)
    for col in range(nx):
        x=-170+col*340/(nx-1)
        verts.append((x,terrain_height(x,z),z))
for row in range(nz-1):
    for col in range(nx-1):
        k=row*nx+col;faces.extend([(k,k+nx,k+1),(k+1,k+nx,k+nx+1)])
geometry(earth,verts,faces,'distance',True)

def rock(x,y,z,rx,ry,rz,region='valley',seed=0):
    random_state=random.getstate();random.seed(seed)
    count=36 if region=='valley' else 18;levels=19 if region=='valley' else 9;verts=[]
    lobes=[random.uniform(.83,1.16) for _ in range(count)]
    for level in range(levels):
        t=level/(levels-1);profile=math.sin(math.pi*(.10+.79*t))**.44
        strata=1+.055*math.sin(t*math.pi*11)+.018*math.sin(t*math.pi*29)
        for i in range(count):
            a=i*math.tau/count;jitter=lobes[i]+random.uniform(-.025,.025)
            verts.append((x+rx*math.cos(a)*profile*jitter*strata,y+ry*(t-.5)+.12*math.sin(a*3+t),z+rz*math.sin(a)*profile*jitter*strata))
    faces=[]
    for level in range(levels-1):
        for i in range(count):
            k=level*count+i;n=level*count+(i+1)%count;faces.append((k,n,n+count,k+count))
    faces.append(tuple((levels-1)*count+i for i in range(count)));geometry(ruin_stone if region=='distance' else cliff,verts,faces,region)
    random.setstate(random_state)
for i,(x,z,rx,rz,top) in enumerate(((0,15,12,10,0),(-17,-6,8,15,3),(8,-21,12,9,3),(18,-8,6,12,3),(14,8,7,7,0))):
    rock(x,top-13.5,z,rx,25,rz,'valley',i+10)
    # Overlapping buttresses and shelves break up the old single-cone silhouette.
    for j in range(7):
        a=j*math.tau/7+.24
        rock(x+rx*.7*math.cos(a),top-11-j%3,z+rz*.7*math.sin(a),rx*.43,18+j%3,rz*.43,'valley',i*17+j+910)
for i in range(38):
    x=random.uniform(-110,110);z=random.uniform(-120,35)
    if -28<x<29 and -33<z<27:continue
    h=random.uniform(9,24);rock(x,terrain_height(x,z)+h*.25,z,random.uniform(5,12),h,random.uniform(5,12),'distance',i+53)

def leaf_cluster(x,y,z,radius,count,region='center'):
    for i in range(count):
        a=random.random()*math.tau;u=random.uniform(-1,1);r=radius*random.random()**.33
        p=Vector((x+r*math.sqrt(1-u*u)*math.cos(a),y+u*r*.62,z+r*math.sqrt(1-u*u)*math.sin(a)))
        leaf_size=max(.065,min(.25,radius*.17))
        length=random.uniform(leaf_size*.65,leaf_size*1.45);angle=random.random()*math.tau
        direction=Vector((math.cos(angle),random.uniform(-.2,.5),math.sin(angle))).normalized()*length
        side=Vector((-math.sin(angle),0,math.cos(angle)))*length*.35
        if region=='distance':
            verts=[tuple(p-direction),tuple(p-side),tuple(p+direction),tuple(p+side)]
            faces=[(0,1,2),(0,2,3)]
        else:
            verts=[tuple(p-direction),tuple(p-direction*.45-side),tuple(p+Vector((0,.025,0))),tuple(p+direction*.55-side*.8),tuple(p+direction),tuple(p+direction*.55+side*.8),tuple(p-direction*.45+side)]
            faces=[(0,1,2),(1,3,2),(3,4,2),(4,5,2),(5,6,2),(6,0,2)]
        geometry(random.choice(greens),verts,faces,region,True)

def moss_patch(x,y,z,radius,region):
    verts=[(x,y+.025,z)]
    for i in range(17):
        a=i*math.tau/16;r=radius*random.uniform(.72,1.15)
        verts.append((x+r*math.cos(a),y+.006,z+r*.7*math.sin(a)))
    geometry(moss,verts,[(0,i+1,i+2) for i in range(16)],region,True)

def fern(x,y,z,size,region):
    for frond in range(7):
        a=frond*math.tau/7+math.sin(x*17.31+z*7.19)*math.pi;forward=Vector((math.cos(a),0,math.sin(a)));side=Vector((-math.sin(a),0,math.cos(a)))
        points=[]
        for i in range(11):
            t=i/10;p=Vector((x,y,z))+forward*(size*t*.85)+Vector((0,size*math.sin(t*math.pi*.8)*.7,0));points.append(tuple(p))
            if not i or i==10:continue
            length=size*.23*math.sin(t*math.pi)**.8
            for sign in (-1,1):
                tip=p+side*length*sign+forward*size*.07+Vector((0,size*.025,0))
                geometry(greens[(frond+i)%3],[tuple(p),tuple(p+forward*.035*size),tuple(tip),tuple(p-forward*.03*size)],[(0,1,2),(0,2,3)],region,True)
        tube(points,.006*size,bark,region,4)

def tree(x,y,z,size,region='center',dense=True):
    points=[(x,y,z),(x+.10*size,y+size*.35,z),(x-.12*size,y+size*.67,z+.06*size),(x+.22*size,y+size,z)]
    tube(points,.065*size,bark,region)
    for i in range(7):
        a=i*math.tau/7;tip=(x+math.cos(a)*size*.43,y+size*random.uniform(.68,1.04),z+math.sin(a)*size*.4)
        start=Vector(points[1]).lerp(Vector(points[2]),.2+i*.09)
        elbow=start.lerp(Vector(tip),.45)+Vector((0,size*.08,0))
        tube([tuple(start),tuple(elbow),tip],size*.018,bark,region)
        leaf_cluster(*tip,size*.25,200 if dense else 65,region)

for x,z,y,size,region in ((-7.7,18,0,3.7,'center'),(-20.5,-5,3,4.6,'west'),(13.8,-24,3,4.0,'north'),(14.5,10,0,3.1,'east')):
    tree(x,y,z,size,region)
for x,z,w,d,y,region in platforms:
    for i in range(12):
        px=x+random.choice((-1,1))*random.uniform(w*.39,w*.45);pz=z+random.uniform(-d*.43,d*.43)
        moss_patch(px,y+.014,pz,random.uniform(.3,.65),region)
        fern(px,y+.035,pz,random.uniform(.38,.73),region)
    for i in range(30):
        px=x+random.choice((-1,1))*random.uniform(w*.38,w*.48);pz=z+random.uniform(-d*.45,d*.45)
        leaf_cluster(px,y+.18,pz,random.uniform(.2,.45),32,region)
        if i%4==0:rock(px,y+.10,pz,.22,.22,.28,region,i+213)
    for i in range(90):
        px=x+random.choice((-1,1))*random.uniform(w*.36,w*.48);pz=z+random.uniform(-d*.46,d*.46)
        for j in range(5):
            h=random.uniform(.10,.34);a=random.random()*math.tau;direction=Vector((math.cos(a),0,math.sin(a)));side=Vector((-math.sin(a),0,math.cos(a)))*.014
            p=Vector((px+random.uniform(-.2,.2),y+.007,pz+random.uniform(-.2,.2)))
            geometry(random.choice(greens),[tuple(p-side),tuple(p+side),tuple(p+direction*h*.18+Vector((0,h*.55,0))+side*.5),tuple(p+direction*h*.35+Vector((0,h,0)))],[(0,1,2),(0,2,3)],region)
# Ivy follows actual piers and coping stones rather than filling the walking route.
for x,z,y,h,region in ((-4,10,0,2.3,'center'),(4,10,0,2.4,'center'),(-20,-11,3,1.5,'west'),(20.3,-7,3,4.7,'east')):
    points=[]
    for i in range(14):
        t=i/13;p=(x+.52*math.cos(t*4),y+h*t,z+.63+.09*math.sin(t*11));points.append(p)
        leaf_cluster(*p,.18,12,region)
    tube(points,.022,bark,region)

# Creepers trail from coping into the cliff recesses, giving the ruin a planted edge.
for x,z,w,d,y,region in platforms:
    for i in range(7):
        px=x+random.choice((-1,1))*(w/2+.11);pz=z+random.uniform(-d*.42,d*.42)
        points=[]
        length=random.uniform(1.0,2.7)
        for j in range(14):
            t=j/13;p=(px+.05*math.sin(t*11),y-length*t,pz+.14*math.sin(t*5));points.append(p)
            leaf_cluster(*p,.13,8,region)
        tube(points,.012,bark,region,5)

# A clustered landscape of ruined towers, domed instruments and trees below the terrace.
# Several taller instruments break the distant ridge, matching the concept's inhabited skyline.
tower_sites=[]
for i in range(42):
    x=random.uniform(-105,105);z=random.uniform(-135,-45);ground=terrain_height(x,z)
    radius=random.uniform(1.6,3.6);height=random.uniform(8,21)
    if i<4:
        x,z,height=((-12,-60,30),(30,-75,36),(-39,-85,32),(6,-110,37))[i]
        ground=terrain_height(x,z);radius=3.4
    original_x,original_z=x,z;attempt=0
    while any(math.hypot(x-px,z-pz)<1.6*(radius+pr)+.75 for px,pz,pr in tower_sites):
        attempt+=1;a=attempt*2.399963229728653;r=1.5*math.sqrt(attempt)
        x=original_x+math.cos(a)*r;z=original_z+math.sin(a)*r
    ground=terrain_height(x,z);tower_sites.append((x,z,radius))
    lathe((x,ground,z),[(0,radius*1.5),(.5,radius*1.5),(.7,radius*1.12),(height*.38,radius*1.12),
                      (height*.40,radius),(height*.78,radius),(height*.8,radius*.88),(height,radius*.88),(height+.25,radius*1.05)],ruin_stone,'distance',40)
    for h,r in ((1.4,1.17),(height*.4,1.14),(height*.8,1.02),(height,.99)):
        lathe((x,ground+h,z),[(0,radius*r),(.17,radius*(r+.05)),(.34,radius*r)],ruin_stone,'distance',40)
        lathe((x,ground+h+.35,z),[(0,radius*r),(.065,radius*r)],bronze,'distance',40)
    # Recessed arched windows are sized to storeys, rather than tall painted stripes.
    for fraction,mult in ((.24,1.122),(.61,1.002),(.9,.882)):
        for j in range(8):
            a=j*math.tau/8;normal=Vector((math.cos(a),0,math.sin(a)));side=Vector((-math.sin(a),0,math.cos(a)))
            center_window=Vector((x,ground+height*fraction,z))+normal*radius*mult
            window_h=min(2.5,height*.15);half=.36
            rim=[(-half,-window_h/2),(half,-window_h/2),(half,window_h/2-half)]
            rim += [(half*math.cos(t*math.pi/8),window_h/2-half+half*math.sin(t*math.pi/8)) for t in range(1,9)]
            geometry(recess,[tuple(center_window+side*xx+Vector((0,yy,0))) for xx,yy in rim],[tuple(range(len(rim)))],'distance')
    if i%3:
        lathe((x,ground+height+.25,z),[(0,radius*1.1),(.4,radius),(radius*.7,radius*.7),(radius,.08)],bronze,'distance',24)
        lathe((x,ground+height+radius,z),[(0,.13),(1.8,.13),(2.0,.28),(2.35,.04)],gilt,'distance',12)
    else:
        for j in range(8):
            a=j*math.tau/8;cuboid((x+radius*math.cos(a),ground+height+.65,z+radius*math.sin(a)),(.6,.8,.6),ruin_stone,'distance')
for i in range(105):
    x=random.uniform(-120,120);z=random.uniform(-125,25)
    if -29<x<30 and -34<z<30:continue
    tree(x,terrain_height(x,z),z,random.uniform(3.5,6.5),'distance',False)

# A few close brass lanterns echo the hardware in the character concept.
for x,z,y,region in ((-7,17,0,'center'),(7,17,0,'center'),(-20,-3,3,'west'),(13,-15,3,'north')):
    lathe((x,y,z),[(0,.30),(.15,.30),(.22,.19),(.8,.08),(.84,.22),(1.15,.22),(1.2,.30),(1.28,.12)],bronze,region)
    lathe((x,y+.84,z),[(0,.15),(.26,.15)],light,region,16)
    for a in range(4):
        t=a*math.tau/4;cuboid((x+.18*math.cos(t),y+1,z+.18*math.sin(t)),(.025,.35,.025),bronze,region)

rotors={}
for region,name in rotor_names.items():
    pivot=bpy.data.objects.new(name,None);env.objects.link(pivot)
    pivot.empty_display_type='PLAIN_AXES';pivot.empty_display_size=.6;rotors[region]=pivot
# Outside to inside: meridian -> equator -> ecliptic -> core. Each hinge is a
# diameter of its parent ring, with alternating Y/X/Y axes in that parent's frame.
for region,parent,axis,angle in (('rotor-0',None,(0,1,0),.65),
                               ('rotor-2','rotor-0',(1,0,0),1.22),
                               ('rotor-1','rotor-2',(0,1,0),-.65),
                               ('rotor-3','rotor-1',(0,1,0),0)):
    pivot=rotors[region]
    pivot.parent=rotors.get(parent)
    pivot.location=(0,0,0) if parent else pc(monument_center)
    pivot.rotation_mode='QUATERNION';pivot.rotation_quaternion=Quaternion(pc(axis),angle)
for (mat,region,smooth),(verts,faces) in batches.items():
    pivot=rotors.get(region)
    positions=[pc(Vector(p)-Vector(monument_center)) if pivot else pc(p) for p in verts]
    obj=mesh('OBS '+region+' '+mat.name,positions,faces,mat)
    if pivot:obj.parent=pivot
    obj['pwc_region']=region
    bm=bmesh.new();bm.from_mesh(obj.data);bmesh.ops.recalc_face_normals(bm,faces=bm.faces);bm.to_mesh(obj.data);bm.free()
    if smooth:
        for face in obj.data.polygons:face.use_smooth=True
    if pivot and mat in (bronze,gilt):
        bpy.context.view_layer.objects.active=obj;obj.select_set(True)
        bevel=obj.modifiers.new('Polished rotor edges','BEVEL');bevel.width=.008;bevel.segments=2
        bevel.limit_method='ANGLE';bevel.angle_limit=.6
        bpy.ops.object.modifier_apply(modifier=bevel.name)
        for face in obj.data.polygons:face.use_smooth=True
        normals=obj.modifiers.new('Balanced metal normals','WEIGHTED_NORMAL');normals.keep_sharp=True
        bpy.ops.object.modifier_apply(modifier=normals.name);obj.select_set(False)
bpy.context.view_layer.update()

# Keep the energy meshes as separate animated layers with their authored spherical UVs.
energy_script=Path(__file__).with_name('energy_core.py')
energy_helpers={'__file__':str(energy_script),'__name__':'observatory_energy'}
exec(compile(energy_script.read_text(),str(energy_script),'exec'),energy_helpers)
energy_helpers['build_energy_core'](env,rotors['rotor-3'])

# Warm, softly clouded atmosphere. The HDR also provides neutral open-sky fill.
w,h=1024,512
v,u=np.mgrid[0:h,0:w].astype(np.float32);v/=h;u/=w
cloud=np.zeros((h,w),np.float32);cloud_rng=np.random.default_rng(810)
for frequency,amplitude in ((5,.52),(11,.27),(23,.14),(47,.07)):
    grid=cloud_rng.random((frequency+1,frequency*2+1));grid[:,-1]=grid[:,0]
    gx=u*frequency*2;gy=v*frequency;ix=gx.astype(int);iy=gy.astype(int);fx=gx-ix;fy=gy-iy
    fx=fx*fx*(3-2*fx);fy=fy*fy*(3-2*fy)
    cloud+=amplitude*((grid[iy,ix]*(1-fx)+grid[iy,ix+1]*fx)*(1-fy)+(grid[iy+1,ix]*(1-fx)+grid[iy+1,ix+1]*fx)*fy)
cloud=np.clip((cloud-.38)*3.0,0,.86)*np.clip((v-.515)*16,0,1)
haze=np.exp(-((v-.5)/.095)**2)
sky=np.zeros((h,w,4),np.float32)
for c,(zenith,horizon) in enumerate(zip((.17,.29,.39),(.86,.77,.61))):
    clear=zenith+(horizon-zenith)*haze
    sky[:,:,c]=clear*(1-cloud)+cloud*(.85,.83,.76)[c]
sky[:,:,:3]*=(.36+.64*np.clip((v-.35)/.15,0,1))[:,:,None]
glow=np.exp(-(((u-.72)/.07)**2+((v-.65)/.055)**2))
for c,energy in enumerate((3.0,2.35,1.4)):sky[:,:,c]+=glow*energy
sky[:,:,3]=1
image=bpy.data.images.new('OBS Warm cloud atmosphere',width=w,height=h,float_buffer=True)
image.pixels.foreach_set(sky.ravel());image.filepath_raw=str(ROOT/'examples/assets/skies/observatory.hdr');image.file_format='HDR';image.save();image.pack()
print(json.dumps({'artPass':'weathered observatory','detailMeshes':len(batches),'originalTexture':str(stone_image.filepath)}))
