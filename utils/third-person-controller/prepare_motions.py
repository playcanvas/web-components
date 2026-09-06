"""Create the redistributable CC0 locomotion reference through Blender MCP."""
import bpy, json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'output/third-person-controller/animation-source/quaternius/Universal Animation Library[Standard]'
destination=ROOT/'utils/third-person-controller/motion-source'
destination.mkdir(parents=True,exist_ok=True)
scene=bpy.data.scenes.get('PWC Animation Source')
if not scene:
    scene=bpy.data.scenes.new('PWC Animation Source')
    bpy.context.window.scene=scene
    bpy.ops.import_scene.gltf(filepath=str(source/'Unreal-Godot/UAL1_Standard.glb'))
bpy.context.window.scene=scene
rig=next(o for o in scene.objects if o.type=='ARMATURE')
keep={'Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','Jump_Start','Jump_Loop','Jump_Land','A_TPose'}
rig.animation_data.action=None
for track in list(rig.animation_data.nla_tracks):
    if track.name not in keep: rig.animation_data.nla_tracks.remove(track)
    else: track.mute=True
scene.render.fps=24
scene.frame_set(0)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=str(destination/'quaternius-locomotion.glb'),export_format='GLB',
    use_selection=True,use_active_scene=True,export_animations=True,export_animation_mode='NLA_TRACKS',
    export_force_sampling=True,export_cameras=False,export_lights=False)
(destination/'License.txt').write_text((source/'License.txt').read_text())
print(json.dumps({'file':str(destination/'quaternius-locomotion.glb'),'bytes':(destination/'quaternius-locomotion.glb').stat().st_size,
    'tracks':[t.name for t in rig.animation_data.nla_tracks]}))
