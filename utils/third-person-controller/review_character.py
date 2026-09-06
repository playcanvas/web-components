"""Render actual animated geometry and measure sole contact through Blender MCP."""
import bpy, json
from pathlib import Path
from mathutils import Vector
ROOT=Path(__file__).resolve().parents[2]
scene=bpy.data.scenes['PWC Owl Wayfarer'];bpy.context.window.scene=scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
camera=scene.camera
output=ROOT/'output/third-person-controller/source/owl-wayfarer'
tracks={t.name:t.strips[0].action for t in rig.animation_data.nla_tracks}
soles=[]
for obj in scene.objects:
    if obj.type!='MESH' or 'Charcoal joints' not in obj.name:continue
    indices={g.index for g in obj.vertex_groups if g.name in ('foot_l','foot_r','ball_l','ball_r')}
    vertices=[v.index for v in obj.data.vertices if sum(g.weight for g in v.groups if g.group in indices)>.99]
    soles.append((obj,vertices))
contact={}
for name,action in tracks.items():
    rig.animation_data.action=action;rig.animation_data.action_slot=action.slots[0]
    heights=[]
    start,end=action.frame_range
    for i in range(25):
        frame=start+(end-start)*i/24;scene.frame_set(int(frame),subframe=frame-int(frame))
        deps=bpy.context.evaluated_depsgraph_get();low=100
        for obj,indices in soles:
            evaluated=obj.evaluated_get(deps);data=evaluated.to_mesh()
            low=min(low,min((evaluated.matrix_world@data.vertices[j].co).z for j in indices));evaluated.to_mesh_clear()
        heights.append(low)
    contact[name]={'minimumSoleZ':min(heights),'maximumLowestSoleZ':max(heights)}
(output/'contact-review.json').write_text(json.dumps(contact,indent=2))
assert all(measurement['minimumSoleZ']>=.0062 for measurement in contact.values()),contact
assert contact['Walk']['maximumLowestSoleZ']<.025,contact['Walk']
if globals().get('PWC_STAGE')!='contacts':
    print('Contact measurements saved; rendering five review angles.')
for name,frame,pos,target,scale,suffix in [
    ('Idle',24,(2.7,-4.3,2.3),(0,0,1.03),2.36,'front'),
    ('Idle',24,(-2.5,4.3,2.4),(0,0,1.03),2.36,'back'),
    ('Idle',24,(1.9,-4,2.05),(0,-.02,1.69),.73,'portrait'),
    ('Walk',12,(3,-4,2.3),(0,0,1.03),2.36,'walk'),
    ('Run',7,(3,-4,2.3),(0,0,1.03),2.36,'run')]:
    if globals().get('PWC_STAGE')=='contacts':break
    rig.animation_data.action=tracks[name];rig.animation_data.action_slot=tracks[name].slots[0];scene.frame_set(frame)
    camera.location=pos;camera.rotation_euler=(Vector(target)-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=scale
    scene.render.filepath=str(output/('owl-wayfarer-'+suffix+'.png'));bpy.ops.render.render(write_still=True)
rig.animation_data.action=tracks['Idle'];rig.animation_data.action_slot=tracks['Idle'].slots[0];scene.frame_set(24)
camera.location=(2.7,-4.3,2.3);camera.rotation_euler=(Vector((0,0,1.03))-camera.location).to_track_quat('-Z','Y').to_euler();camera.data.ortho_scale=2.36
(output/'contact-review.json').write_text(json.dumps(contact,indent=2))
print(json.dumps(contact))
