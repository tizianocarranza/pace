"""Build Pip's phase-one static source and real orthographic preview renders.

Run with Blender 5.0+: blender --background --factory-startup --python
assets/pip/build_static.py -- --quality draft|final
No rig, animation, shape keys, textures, or exchange export is created.
"""

import argparse
import json
import math
from pathlib import Path
import sys

import bmesh
import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / "assets" / "pip"
PREVIEWS = ASSETS / "previews"
REFERENCE = ROOT / "public" / "references" / "pip-character-reference.png"
parser = argparse.ArgumentParser()
parser.add_argument("--quality", choices=("draft", "final"), default="final")
args = parser.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
PREVIEWS.mkdir(parents=True, exist_ok=True)

# Coordinates: X left/right, -Y forward, Z up. Sole baseline is Z=0.
BODY_RX = 1.05
BODY_RY = 1.19
BODY_MID_Z = 0.89
BODY_TOP_Z = 1.95
BODY_BASE_Z = 0.095
EYE_Z = 1.175
EYE_X = 0.285

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.context.preferences.filepaths.save_version = 0
asset_scene = bpy.context.scene
asset_scene.name = "Pip | Static asset"
character = bpy.data.collections.new("PIP | Character only")
asset_scene.collection.children.link(character)


def material(name, color, roughness, specular):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    mat.diffuse_color = (*color, 1)
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0
    shader.inputs["Specular IOR Level"].default_value = specular
    return mat


# Linear RGB values; no painted shading or environment-dependent textures.
ivory = material("Pip | Warm ivory matte", (0.82, 0.73, 0.64), 0.68, 0.25)
black = material("Pip | Soft black eyes", (0.0015, 0.001, 0.0007), 0.30, 0.08)


def closed_surface(name, evaluate, segments, rings, mat, subdivision=0):
    """Quad latitude loops and single pole fans; welded, closed, outward mesh."""
    verts = [evaluate(0, 0)]
    for row in range(1, rings):
        theta = math.pi * row / rings
        for col in range(segments):
            verts.append(evaluate(theta, 2 * math.pi * col / segments))
    bottom = len(verts)
    verts.append(evaluate(math.pi, 0))
    faces = []
    for col in range(segments):
        nxt = (col + 1) % segments
        faces.append((0, 1 + col, 1 + nxt))
    for row in range(rings - 2):
        first = 1 + row * segments
        after = first + segments
        for col in range(segments):
            nxt = (col + 1) % segments
            faces.append((first + col, after + col, after + nxt, first + nxt))
    first = 1 + (rings - 2) * segments
    for col in range(segments):
        faces.append((first + col, bottom, first + (col + 1) % segments))
    mesh = bpy.data.meshes.new(name + " | Mesh")
    mesh.from_pydata(verts, [], faces)
    assert not mesh.validate(), name + " required mesh repair"
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
    assert all(edge.is_manifold for edge in bm.edges), name + " is not closed"
    assert bm.calc_volume(signed=True) > 0, name + " is inverted"
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    character.objects.link(obj)
    obj.data.materials.append(mat)
    for face in mesh.polygons:
        face.use_smooth = True
    if subdivision:
        mod = obj.modifiers.new("Surface smoothing | one level", "SUBSURF")
        mod.levels = subdivision
        mod.render_levels = subdivision
    return obj


def body_surface(theta, phi):
    s = math.cos(theta)
    radius = math.sin(theta)
    z = (BODY_MID_Z + (BODY_TOP_Z - BODY_MID_Z) * s if s >= 0 else
         BODY_MID_Z - (BODY_MID_Z - BODY_BASE_Z) * (-s) ** 0.86)
    # Crown leans very slightly toward the face; lower rear stays full.
    center_y = -0.14 * max(s, 0) + 0.025 * min(s, 0)
    return (BODY_RX * radius * math.cos(phi),
            center_y + BODY_RY * radius * math.sin(phi), z)


body = closed_surface("Pip.Body", body_surface, 40, 28, ivory, 1)


def make_foot(sign):
    angle = math.radians(22)
    extent_z = math.hypot(0.32 * math.sin(angle), 0.14 * math.cos(angle))
    def surface(theta, phi):
        s = math.cos(theta)
        radius = math.sin(theta)
        # Low smooth toe, buried root, slightly narrower toward the heel.
        x = sign * 0.50 + 0.215 * radius * math.cos(phi)
        local_y = 0.32 * radius * math.sin(phi)
        local_z = 0.14 * s
        y = -0.28 + math.cos(angle) * local_y - math.sin(angle) * local_z
        z = extent_z + 0.045 + math.sin(angle) * local_y + math.cos(angle) * local_z
        return (x, y, z)
    return closed_surface("Pip.Foot." + ("L" if sign < 0 else "R"),
                          surface, 32, 20, ivory, 0)


feet = [make_foot(-1), make_foot(1)]

# Sample the smoothed body so eye caps follow the actual surface with no gap.
bpy.context.view_layer.update()
depsgraph = bpy.context.evaluated_depsgraph_get()
evaluated_body = body.evaluated_get(depsgraph)


def make_eye(sign):
    x = sign * EYE_X
    hit, point, normal, _ = evaluated_body.ray_cast(Vector((x, -3, EYE_Z)), Vector((0, 1, 0)))
    assert hit, "Eye must be supported by the front body surface"
    vertical = Vector((0, 0, 1))
    up = (vertical - normal * vertical.dot(normal)).normalized()
    across = up.cross(normal).normalized()
    # A slim elliptical lens mostly embedded in the body. No stalks or pupils.
    center = point - normal * 0.007
    def surface(theta, phi):
        radial = math.sin(theta)
        p = (center + up * (0.186 * math.cos(theta))
             + across * (0.105 * radial * math.cos(phi))
             + normal * (0.037 * radial * math.sin(phi)))
        return tuple(p)
    return closed_surface("Pip.Eye." + ("L" if sign < 0 else "R"),
                          surface, 24, 16, black, 0)


eyes = [make_eye(-1), make_eye(1)]
for obj in character.objects:
    # Normalize the raised/tucked feet back to a shared ground baseline.
    for vertex in obj.data.vertices:
        vertex.co.z -= 0.045
character["phase"] = "01 | Static geometry, pending visual approval"
character["reference"] = "public/references/pip-character-reference.png"
character["forward"] = "-Y; up +Z; feet at Z=0"
character["presentation"] = "Character collection contains only body, two feet, two eyes."
body["design"] = "Broad dome, full low body, softened underside; reference IDLE pose."

# Separate review scene, sharing only the character collection with the asset.
review = bpy.data.scenes.new("Pip | Preview studio")
review.collection.children.link(character)
studio = bpy.data.collections.new("STUDIO | Cameras and lights only")
review.collection.children.link(studio)
review.render.engine = "CYCLES"
review.cycles.samples = 24 if args.quality == "draft" else 96
review.cycles.use_denoising = True
review.cycles.max_bounces = 6
review.render.resolution_x = 640 if args.quality == "draft" else 1200
review.render.resolution_y = review.render.resolution_x
review.render.resolution_percentage = 100
review.render.image_settings.file_format = "PNG"
review.render.image_settings.color_mode = "RGBA"
review.render.film_transparent = True
review.view_settings.view_transform = "AgX"
review.view_settings.look = "AgX - Base Contrast"
review.view_settings.exposure = 1.7
review.world = bpy.data.worlds.new("Studio | Neutral ambient")
review.world.use_nodes = True
review.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.72, 0.72, 0.72, 1)
review.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.45


def point_at(obj, target):
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def area(name, pos, energy, size):
    data = bpy.data.lights.new(name, "AREA")
    data.energy = energy
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    studio.objects.link(obj)
    obj.location = pos
    point_at(obj, (0, 0, 1))


area("Studio.Key", (-1.5, -5.5, 4), 700, 4.0)
area("Studio.Fill", (-4, -1, 3.2), 85, 3.8)
area("Studio.Top", (1.5, 3.5, 5.5), 150, 3.0)

cameras = {}
for name, position in {
    "side": (-7, 0, 1.0),
    "front": (0, -7, 1.0),
    "three-quarter": (-5.5, -4.3, 1.25),
}.items():
    data = bpy.data.cameras.new("Camera." + name)
    data.type = "ORTHO"
    data.ortho_scale = 3.05
    data.lens = 70
    obj = bpy.data.objects.new("Camera." + name, data)
    studio.objects.link(obj)
    obj.location = position
    point_at(obj, (0, 0, 0.975))
    cameras[name] = obj

review.camera = cameras["three-quarter"]
bpy.context.window.scene = review
bpy.context.view_layer.update()


def validate_asset():
    records = []
    for obj in character.objects:
        assert obj.type == "MESH"
        assert obj.animation_data is None and obj.data.shape_keys is None
        assert all(mod.type == "SUBSURF" for mod in obj.modifiers)
        evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
        mesh = evaluated.to_mesh()
        mesh.calc_loop_triangles()
        records.append({"object": obj.name, "base_vertices": len(obj.data.vertices),
                        "base_faces": len(obj.data.polygons),
                        "evaluated_triangles": len(mesh.loop_triangles)})
        evaluated.to_mesh_clear()
    assert len(records) == 5
    assert not bpy.data.actions and not bpy.data.armatures
    assert not any(mat.node_tree.nodes.get("Image Texture") for mat in (ivory, black))
    result = {"phase": "static only", "blender": bpy.app.version_string,
              "reference": str(REFERENCE.relative_to(ROOT)).replace("\\", "/"),
              "objects": records,
              "total_evaluated_triangles": sum(r["evaluated_triangles"] for r in records),
              "materials": 2, "texture_images": 0, "armatures": 0,
              "animations": 0, "shape_keys": 0,
              "geometry_checks": "Closed manifold shells; consistent outward normals; no invalid mesh data",
              "note": "Body and feet are separate intersecting closed shells with hidden roots."}
    (ASSETS / "validation.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("PIP_VALIDATION", json.dumps(result), flush=True)


validate_asset()
for screen in bpy.data.screens:
    for area_item in screen.areas:
        if area_item.type == "VIEW_3D":
            area_item.spaces.active.region_3d.view_perspective = "CAMERA"
            area_item.spaces.active.shading.type = "MATERIAL"
            area_item.spaces.active.overlay.show_overlays = False

bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "pip-static.blend"))
for view, camera in cameras.items():
    review.camera = camera
    review.render.filepath = str(PREVIEWS / ("pip-" + view + ".png"))
    print("PIP_RENDER", view, flush=True)
    bpy.ops.render.render(write_still=True)
review.camera = cameras["three-quarter"]
bpy.ops.wm.save_as_mainfile(filepath=str(ASSETS / "pip-static.blend"))
print("PIP_STATIC_COMPLETE", flush=True)
