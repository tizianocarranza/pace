"""Render animation and morph review frames from the exported GLB itself.

blender --background --factory-startup --python assets/pip/render_animated_previews.py
Only writes assets/pip/animation-previews. Never saves a .blend or alters the GLB.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import sys

import bpy
from mathutils import Matrix, Vector


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "assets" / "pip" / "animation-previews"
GLB = ROOT / "public" / "models" / "pip.glb"
parser = argparse.ArgumentParser()
parser.add_argument("--size", type=int, default=400)
parser.add_argument("--samples", type=int, default=16)
parser.add_argument("--only", choices=("Idle", "Run", "Stumble", "Morphs"))
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
assert GLB.is_file(), "Build public/models/pip.glb before rendering exported-asset previews."
OUTPUT.mkdir(parents=True, exist_ok=True)
glb_digest = hashlib.sha256(GLB.read_bytes()).hexdigest()

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.fps = 30
bpy.ops.import_scene.gltf(filepath=str(GLB))
characters = list(scene.objects)
armatures = [obj for obj in characters if obj.type == "ARMATURE"]
assert armatures, "The exported GLB has no armature."
meshes = [obj for obj in characters if obj.type == "MESH"]
body = next(obj for obj in meshes if obj.data.shape_keys is not None)
assert "Squash" in body.data.shape_keys.key_blocks
assert "Stretch" in body.data.shape_keys.key_blocks

# Capture the glTF importer's NLA action/slot assignments before switching clips.
# Blender 5 uses layered actions and the action_slot assignment is required.
animated_ids = list(characters) + [obj.data.shape_keys for obj in meshes if obj.data.shape_keys]
bindings = {}
for data in animated_ids:
    anim = data.animation_data
    if anim is None:
        continue
    for track in anim.nla_tracks:
        track.mute = True
        for strip in track.strips:
            bindings.setdefault(track.name, []).append((data, strip.action, strip.action_slot))
    anim.action = None
assert all(name in bindings for name in ("Idle", "Run", "Stumble")), sorted(bindings)


def reset_pose():
    for data in animated_ids:
        if data.animation_data:
            data.animation_data.action = None
    for armature in armatures:
        for bone in armature.pose.bones:
            bone.matrix_basis = Matrix.Identity(4)
    for key in body.data.shape_keys.key_blocks:
        if key.name != "Basis":
            key.value = 0
    bpy.context.view_layer.update()


def activate(name):
    reset_pose()
    for data, action, slot in bindings[name]:
        data.animation_data.action = action
        data.animation_data.action_slot = slot
    return next(action for _, action, _ in bindings[name]).frame_range[:]


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, pos, energy, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.location = pos
    point_at(obj, (0, 0, 1))


scene.render.engine = "CYCLES"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 6
scene.render.resolution_x = args.size
scene.render.resolution_y = args.size
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.render.film_transparent = True
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Base Contrast"
scene.view_settings.exposure = 1.7
scene.world = bpy.data.worlds.new("Preview only | Neutral ambient")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.72, 0.72, 0.72, 1)
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45
area("Preview only | Key", (-1.5, -5.5, 4), 700, 4.0)
area("Preview only | Fill", (-4, -1, 3.2), 85, 3.8)
area("Preview only | Top", (1.5, 3.5, 5.5), 150, 3.0)
camera_data = bpy.data.cameras.new("Preview only | Camera")
camera_data.type = "ORTHO"
camera_data.ortho_scale = 4.2
camera = bpy.data.objects.new("Preview only | Camera", camera_data)
scene.collection.objects.link(camera)
camera.location = (-5.5, -4.3, 1.55)
point_at(camera, (0, 0.15, 1.16))
scene.camera = camera


def render(name):
    scene.render.filepath = str(OUTPUT / name)
    bpy.ops.render.render(write_still=True)
    print("PIP_GLB_PREVIEW", name, flush=True)


manifest_path = OUTPUT / "manifest.json"
manifest = json.loads(manifest_path.read_text()) if args.only and manifest_path.exists() else {}
manifest.update({"source": "public/models/pip.glb", "source_sha256": glb_digest,
                 "rendered_from": "Fresh Blender glTF import; no source .blend loaded",
                 "view": "Orthographic three-quarter, fixed camera for all frames",
                 "image_size": args.size, "samples": args.samples,
                 "clips": manifest.get("clips", {}), "morphs": manifest.get("morphs", [])})

for name, count, looping in (("Idle", 6, True), ("Run", 8, True), ("Stumble", 8, False)):
    if args.only and args.only != name:
        continue
    first, last = activate(name)
    duration = (last - first) / scene.render.fps
    frames = []
    for index in range(count):
        # Loop strips omit the duplicate end frame. Stumble includes recovery.
        fraction = index / (count if looping else count - 1)
        value = first + (last - first) * fraction
        scene.frame_set(math.floor(value), subframe=value % 1)
        filename = f"{name.lower()}-{index:02d}.png"
        render(filename)
        frames.append({"file": filename, "time": round(duration * fraction, 6),
                       "phase": round(fraction, 6), "frame": round(value, 6)})
    manifest["clips"][name] = {"duration": round(duration, 6), "loop": looping, "frames": frames}

if not args.only or args.only == "Morphs":
    reset_pose()
    morphs = []
    for name, squash, stretch in (("Basis", 0, 0), ("Squash", 1, 0),
                                  ("Stretch", 0, 1), ("Both", 1, 1)):
        body.data.shape_keys.key_blocks["Squash"].value = squash
        body.data.shape_keys.key_blocks["Stretch"].value = stretch
        bpy.context.view_layer.update()
        filename = f"morph-{name.lower()}.png"
        render(filename)
        morphs.append({"name": name, "file": filename, "Squash": squash, "Stretch": stretch})
    manifest["morphs"] = morphs

assert hashlib.sha256(GLB.read_bytes()).hexdigest() == glb_digest, "GLB changed during review rendering."
manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

# Self-contained local review: static PNG flipbooks only, no application or Three.js.
payload = json.dumps(manifest).replace("</", "<\\/")
html = """<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pip / exported asset review</title>
<style>
body{margin:0;background:#f5f4f2;color:#292826;font:15px system-ui,sans-serif}
main{max-width:1200px;margin:auto;padding:35px 24px}h1{font-size:25px;font-weight:500;letter-spacing:.06em}
p{color:#73716d;line-height:1.6}section{margin:30px 0}h2{font-size:17px;font-weight:500}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:18px}
figure{margin:0;border:1px solid #ddd9d2;border-radius:12px;overflow:hidden}
img{display:block;width:100%;aspect-ratio:1}figcaption{padding:12px 16px;font-size:14px}
button{border:1px solid #c9c4bc;border-radius:20px;padding:8px 16px;background:transparent;color:inherit;cursor:pointer}
a{color:inherit}code{font-size:12px;overflow-wrap:anywhere}
</style><main><h1>PIP / EXPORTED ASSET REVIEW</h1>
<p>Actual frames rendered from <code>public/models/pip.glb</code>. Constant orthographic camera and neutral studio lighting.
These eight-frame flipbooks are motion review aids; timing and continuous interpolation are validated separately.</p>
<button id="toggle">Pause motion</button>
<section><h2>Run / playback speed comparison</h2><div class="grid" id="runs"></div></section>
<section><h2>Idle and Stumble</h2><div class="grid" id="clips"></div></section>
<section><h2>Independent body morphs / neutral pose</h2><div class="grid" id="morphs"></div></section>
<p><a href="pip-animation-review.png">Contact sheet</a> / <a href="manifest.json">Frame manifest</a></p>
<p>GLB SHA-256: <code id="hash"></code></p></main>
<script>
const data=__PAYLOAD__;document.getElementById('hash').textContent=data.source_sha256;
const items=[];let paused=false,elapsed=0,previous=performance.now();
function card(parent,label,source){const f=document.createElement('figure'),img=document.createElement('img'),c=document.createElement('figcaption');
img.src=source;img.alt=label;c.textContent=label;f.append(img,c);document.getElementById(parent).append(f);return img;}
function motion(parent,name,speed,label){const clip=data.clips[name];if(!clip)return;
const img=card(parent,label,clip.frames[0].file);items.push({img,clip,speed});clip.frames.forEach(f=>{const i=new Image;i.src=f.file;});}
[0.6,1,2].forEach(speed=>motion('runs','Run',speed,`Run / ${speed.toFixed(1)}x`));
motion('clips','Idle',1,'Idle / 1.0x');motion('clips','Stumble',1,'Stumble / replay with recovery hold');
data.morphs.forEach(m=>card('morphs',`${m.name} / Squash ${m.Squash}, Stretch ${m.Stretch}`,m.file));
document.getElementById('toggle').onclick=e=>{paused=!paused;e.target.textContent=paused?'Resume motion':'Pause motion';};
function tick(now){if(!paused)elapsed+=(now-previous)/1000;previous=now;
items.forEach(({img,clip,speed})=>{const t=(elapsed*speed)%(clip.duration+(clip.loop?0:0.7));
const fraction=Math.min(t/clip.duration,1);const n=clip.frames.length;
const index=clip.loop?Math.min(n-1,Math.floor(fraction*n)):Math.min(n-1,Math.floor(fraction*(n-1)));
const file=clip.frames[index].file;if(img.getAttribute('src')!==file)img.src=file;});requestAnimationFrame(tick);}
requestAnimationFrame(tick);
</script></html>""".replace("__PAYLOAD__", payload)
(OUTPUT / "index.html").write_text(html, encoding="utf-8")
print("PIP_GLB_PREVIEWS_COMPLETE", str(OUTPUT), flush=True)
