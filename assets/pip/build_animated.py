"""Rig, animate and export the APPROVED static Pip without rebuilding its shape.

Blender 5.0: --background --python assets/pip/build_animated.py
The approved pip-static.blend is read-only input. No app dependencies required.
"""
import hashlib
import json
import math
from pathlib import Path

import bmesh
import bpy
from bpy_extras.anim_utils import action_get_channelbag_for_slot
from mathutils import Euler, Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets/pip"
SOURCE = ASSETS / "pip-static.blend"
OUTPUT = ASSETS / "pip-animated.blend"
GLB = ROOT / "public/models/pip.glb"
GLB.parent.mkdir(parents=True, exist_ok=True)
SOURCE_HASH = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
bpy.context.preferences.filepaths.save_version = 0
scene = bpy.data.scenes["Pip | Static asset"]
bpy.context.window.scene = scene
scene.name = "Pip | Production"
character = bpy.data.collections["PIP | Character only"]
meshes = sorted(list(character.objects), key=lambda o: o.name)
assert len(meshes) == 5 and all(o.type == "MESH" for o in meshes)

# Capture evaluated approved geometry before any modification. This is also
# independent input for the post-export binary validator (vertex order may vary).
baseline = {"coordinate_system": "BLENDER_Z_UP", "source_sha256": SOURCE_HASH, "meshes": []}
for obj in meshes:
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    baseline["meshes"].append({"name": obj.name,
        "positions": [list(obj.matrix_world @ v.co) for v in mesh.vertices]})
    evaluated.to_mesh_clear()
(ASSETS / "approved-static-meshes.json").write_text(json.dumps(baseline), encoding="utf-8")

# Keep the production source itself free of the static presentation setup.
for obj in list(bpy.data.objects):
    if obj not in meshes:
        bpy.data.objects.remove(obj, do_unlink=True)
for other in list(bpy.data.scenes):
    if other != scene:
        bpy.data.scenes.remove(other)
for collection in list(bpy.data.collections):
    if collection != character:
        bpy.data.collections.remove(collection)
for camera in list(bpy.data.cameras):
    bpy.data.cameras.remove(camera)
for light in list(bpy.data.lights):
    bpy.data.lights.remove(light)
for image in list(bpy.data.images):
    bpy.data.images.remove(image)
scene.world = None
for world in list(bpy.data.worlds):
    bpy.data.worlds.remove(world)

body = bpy.data.objects["Pip.Body"]
bpy.ops.object.select_all(action="DESELECT")
body.select_set(True)
bpy.context.view_layer.objects.active = body
# glTF cannot apply a subdivision modifier and keep shape keys. Freeze only the
# already-approved smoothing, then add keys to the exact evaluated surface.
for mod in list(body.modifiers):
    assert mod.type == "SUBSURF"
    bpy.ops.object.modifier_apply(modifier=mod.name)
assert len(body.data.vertices) == len(baseline["meshes"][0]["positions"])


def smoother(a, b, value):
    t = max(0.0, min(1.0, (value - a) / (b - a)))
    return t * t * t * (t * (t * 6 - 15) + 10)


basis = body.shape_key_add(name="Basis")
squash = body.shape_key_add(name="Squash")
stretch = body.shape_key_add(name="Stretch")
for key in (squash, stretch):
    key.slider_min, key.slider_max, key.value = 0.0, 1.0, 0.0
for index, v in enumerate(basis.data):
    x, y, z = v.co
    # Pin a broad front cap (eye seating) and the low belly (foot roots).
    # Only body vertex positions change; no eye targets or runtime drivers.
    w = smoother(-1.0, -0.35, y) * smoother(0.18, 0.50, z)
    squash.data[index].co = (x * (1 + 0.13 * w),
                             y + 0.07 * (y + 1.18) * w,
                             z - 0.16 * (z - 0.03) * w)
    stretch.data[index].co = (x * (1 - 0.04 * w),
                              y + 0.42 * (y + 1.18) * w,
                              z - 0.18 * (z - 0.03) * w)
body["morph_contract"] = "Only body morphs; front cap and low foot-root corridor anchored; weights 0..1 independently."

# Minimal hierarchy, all local axes equal Blender axes: +Z up, -Y forward.
armature = bpy.data.armatures.new("Pip.Skeleton")
rig = bpy.data.objects.new("Pip.Rig", armature)
character.objects.link(rig)
bpy.ops.object.select_all(action="DESELECT")
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode="EDIT")
bone_heads = {"Root": (0, 0, 0), "Body": (0, 0, 0.32),
              "Foot.L": (-0.48, -0.38, 0.18), "Foot.R": (0.48, -0.38, 0.18)}
for name, head in bone_heads.items():
    bone = armature.edit_bones.new(name)
    bone.head = head
    bone.tail = Vector(head) + Vector((0, 0.18, 0))
    if name != "Root":
        bone.parent = armature.edit_bones["Root"]
bpy.ops.object.mode_set(mode="OBJECT")
rig.show_in_front = True
armature.display_type = "STICK"
for obj in meshes:
    name = "Foot." + obj.name[-1] if obj.name.startswith("Pip.Foot.") else "Body"
    group = obj.vertex_groups.new(name=name)
    group.add(list(range(len(obj.data.vertices))), 1.0, "REPLACE")
    mod = obj.modifiers.new("Pip | Skin", "ARMATURE")
    mod.object = rig
    mod.use_deform_preserve_volume = False
    obj.parent = rig
    obj.matrix_parent_inverse = Matrix.Identity(4)
for bone in rig.pose.bones:
    bone.rotation_mode = "QUATERNION"
rig.animation_data_create()
scene.render.fps = 30
scene.render.fps_base = 1.0


def reset_pose():
    for bone in rig.pose.bones:
        bone.location = (0, 0, 0)
        bone.rotation_quaternion = (1, 0, 0, 0)
        bone.scale = (1, 1, 1)


def pose_bone(name, location=(0, 0, 0), angles=(0, 0, 0), scale=(1, 1, 1)):
    bone = rig.pose.bones[name]
    bone.location = location
    bone.rotation_quaternion = Euler(angles, "XYZ").to_quaternion()
    bone.scale = scale


foot_vertices = {name: [v.co.copy() for v in bpy.data.objects["Pip." + name].data.vertices]
                 for name in ("Foot.L", "Foot.R")}


def foot_pose(name, y_offset, lift, pitch):
    pivot = Vector(bone_heads[name])
    rotation = Matrix.Rotation(pitch, 3, "X")
    min_z = min((pivot + rotation @ (v - pivot)).z for v in foot_vertices[name])
    # Analytic contact correction keeps the stance foot on Z=0 at any pitch.
    pose_bone(name, (0, y_offset, lift - min_z), (pitch, 0, 0))


def idle(t):
    breathe = 0.5 - 0.5 * math.cos(math.tau * t)
    pose_bone("Body", (0, 0, 0.004 * breathe),
              scale=(1 + 0.0015 * breathe, 1 + 0.0015 * breathe, 1 - 0.003 * breathe))


def run(t):
    phase = math.tau * t
    pose_bone("Body", (0, 0, 0.028 + 0.020 * (1 - math.cos(2 * phase))),
              (math.radians(2.0 + 1.5 * math.cos(phase)),
               math.radians(0.8) * math.sin(phase), 0))
    for index, name in enumerate(("Foot.L", "Foot.R")):
        p = phase + index * math.pi
        foot_pose(name, -0.24 * math.cos(p),
                  0.085 * max(0.0, -math.sin(p)) ** 2,
                  math.radians(11) * math.sin(p))


def curve(t, knots):
    for (a, x), (b, y) in zip(knots, knots[1:]):
        if t <= b:
            u = smoother(a, b, t)
            return x + (y - x) * u
    return knots[-1][1]


def evaluated_min_z():
    bpy.context.view_layer.update()
    graph = bpy.context.evaluated_depsgraph_get()
    lowest = math.inf
    for obj in meshes:
        evaluated = obj.evaluated_get(graph)
        mesh = evaluated.to_mesh()
        lowest = min(lowest, min((obj.matrix_world @ v.co).z for v in mesh.vertices))
        evaluated.to_mesh_clear()
    return lowest


def stumble(t):
    angle = math.radians(curve(t, [(0, 0), (.11, -6), (.23, 24), (.36, 75),
                                  (.46, 103), (.55, 83), (.72, 25), (.88, -7), (1, 0)]))
    impact = curve(t, [(0, 0), (.39, 0), (.47, 1), (.62, 0), (1, 0)])
    air = curve(t, [(0, 0), (.15, 0), (.30, .075), (.39, .06),
                   (.46, 0), (.56, .025), (.7, .035), (.9, 0), (1, 0)])
    pose_bone("Body", scale=(1 + .03 * impact, 1 + .03 * impact, 1 - .06 * impact))
    kick = curve(t, [(0, 0), (.18, 0), (.35, 1), (.52, .4), (.76, 0), (1, 0)])
    pose_bone("Foot.L", (0, -.10 * kick, .04 * kick), (math.radians(-16) * kick, 0, 0))
    pose_bone("Foot.R", (0, .08 * kick, .025 * kick), (math.radians(13) * kick, 0, 0))
    pivot = Vector((0, 0, .78))
    rotation = Matrix.Rotation(angle, 3, "X")
    offset = pivot - rotation @ pivot
    pose_bone("Root", offset, (angle, 0, 0))
    # Bone-only impact keeps runtime morph weights independent. Sample actual
    # deformed meshes to let the forward tumble touch rather than cross ground.
    floor = evaluated_min_z()
    rig.pose.bones["Root"].location.z += max(0, -floor) + air


actions = {}
for name, duration_frames, function in (("Idle", 96, idle), ("Run", 24, run), ("Stumble", 36, stumble)):
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    rig.animation_data.action = action
    for frame in range(duration_frames + 1):
        # Exact duplicate endpoint prevents trig roundoff in seamless loops.
        t = (0.0 if frame == duration_frames and name != "Stumble" else frame / duration_frames)
        reset_pose()
        function(t)
        if name == "Stumble" and frame in (0, duration_frames):
            reset_pose()
        for bone in rig.pose.bones:
            for path in ("location", "rotation_quaternion", "scale"):
                bone.keyframe_insert(data_path=path, frame=frame, group=bone.name)
    channelbag = action_get_channelbag_for_slot(action, rig.animation_data.action_slot)
    for fcurve in channelbag.fcurves:
        for key in fcurve.keyframe_points:
            key.interpolation = "LINEAR"
    action["loop"] = name != "Stumble"
    action["duration_seconds"] = duration_frames / scene.render.fps
    actions[name] = action
    print("PIP_ACTION", name, duration_frames / scene.render.fps, flush=True)

rig.animation_data.action = None
for name, action in actions.items():
    track = rig.animation_data.nla_tracks.new()
    track.name = name
    strip = track.strips.new(name, 0, action)
    strip.name = name
    strip.action_slot = action.slots[0]
    strip.extrapolation = "NOTHING"
    track.mute = True
reset_pose()
scene.frame_start, scene.frame_end = 0, 96
scene.frame_set(0)
character["phase"] = "Production animated asset | approved static shape preserved"
character["source_sha256"] = SOURCE_HASH
character["runtime"] = "Idle/Run repeat; Stumble once and crossfade back. Morph weights independent 0..1. No root travel."
rig["forward"] = "Blender -Y; exported glTF +Z, up +Y"
rig["clip_contract"] = "Idle 3.2s; Run 0.8s; Stumble 1.2s. Run supports playback scaling; no morph weight tracks."

# Validate combined body morphs before export, including both at full weight.
checks = []
for q in (0.0, 0.5, 1.0):
    for s in (0.0, 0.5, 1.0):
        squash.value, stretch.value = q, s
        bpy.context.view_layer.update()
        evaluated = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        bm = bmesh.new()
        bm.from_mesh(mesh)
        assert all(v.co.length < 10 and all(math.isfinite(c) for c in v.co) for v in bm.verts)
        assert all(e.is_manifold and e.is_contiguous for e in bm.edges)
        assert all(f.calc_area() > 1e-12 for f in bm.faces)
        volume = bm.calc_volume(signed=True)
        assert volume > 0
        dims = [max(v.co[a] for v in bm.verts) - min(v.co[a] for v in bm.verts) for a in range(3)]
        checks.append({"Squash": q, "Stretch": s, "volume": volume, "dimensions_xyz": dims})
        bm.free()
        evaluated.to_mesh_clear()
squash.value = stretch.value = 0
reset_pose()
bpy.context.view_layer.update()
assert len(armature.bones) == 4 and len(bpy.data.actions) == 3
assert body.data.shape_keys.animation_data is None
assert hashlib.sha256(SOURCE.read_bytes()).hexdigest() == SOURCE_HASH
(ASSETS / "production-source-validation.json").write_text(json.dumps({
    "approved_source_sha256": SOURCE_HASH, "approved_source_unchanged": True,
    "body_morph_checks": checks, "bones": list(bone_heads),
    "clips": {name: float(action["duration_seconds"]) for name, action in actions.items()},
    "morph_animation_channels": 0,
}, indent=2) + "\n", encoding="utf-8")

# Save clean neutral source; NLA strips preserve all three separately editable clips.
bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
bpy.ops.object.select_all(action="DESELECT")
for obj in [rig] + meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(
    filepath=str(GLB), export_format="GLB", use_selection=True,
    export_animations=True, export_animation_mode="ACTIONS", export_anim_single_armature=True,
    export_force_sampling=True, export_frame_range=False, export_frame_step=1,
    export_anim_slide_to_zero=True, export_merge_animation="NONE",
    export_optimize_animation_size=True, export_optimize_animation_keep_anim_armature=True,
    export_skins=True, export_def_bones=False, export_leaf_bone=False,
    export_rest_position_armature=True, export_armature_object_remove=False,
    export_morph=True, export_morph_normal=True, export_morph_tangent=False,
    export_morph_animation=False, export_apply=False,
    export_materials="EXPORT", export_texcoords=False, export_normals=True,
    export_cameras=False, export_lights=False, export_yup=True, export_extras=True,
)
assert GLB.is_file()
print("PIP_PRODUCTION_EXPORTED", GLB.stat().st_size, flush=True)
