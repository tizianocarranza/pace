"""Inspect Pip's actual GLB payload, including CPU animation/morph/skinning.

Run with Blender's bundled Python (numpy is the only dependency), or:
  blender --background --factory-startup --python assets/pip/validate_glb.py
The verifier does not load the authoring .blend or trust export settings.
"""

import argparse
import itertools
import json
import math
from pathlib import Path
import struct
import sys

import numpy as np


ROOT = Path(__file__).resolve().parents[2]
DTYPES = {5120: "i1", 5121: "u1", 5122: "<i2", 5123: "<u2", 5125: "<u4", 5126: "<f4"}
COMPONENTS = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT2": 4, "MAT3": 9, "MAT4": 16}
EXPECTED_MESHES = {"Pip.Body", "Pip.Eye.L", "Pip.Eye.R", "Pip.Foot.L", "Pip.Foot.R"}


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def transform(points, matrix):
    return points @ matrix[:3, :3].T + matrix[:3, 3]


def quat_matrix(quat):
    x, y, z, w = np.asarray(quat, dtype=float) / np.linalg.norm(quat)
    return np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ])


def slerp(first, last, factor):
    first = first / np.linalg.norm(first)
    last = last / np.linalg.norm(last)
    cosine = float(np.dot(first, last))
    if cosine < 0:
        last, cosine = -last, -cosine
    if cosine > 0.9995:
        result = first + factor * (last - first)
        return result / np.linalg.norm(result)
    angle = math.acos(np.clip(cosine, -1, 1))
    return (math.sin((1 - factor) * angle) * first + math.sin(factor * angle) * last) / math.sin(angle)


class GLB:
    def __init__(self, path):
        self.path = path
        self.raw = path.read_bytes()
        magic, version, length = struct.unpack_from("<III", self.raw)
        require(magic == 0x46546C67 and version == 2, "Expected GLB version 2")
        require(length == len(self.raw), "GLB header length disagrees with file size")
        cursor, chunks = 12, []
        while cursor < len(self.raw):
            chunk_length, chunk_type = struct.unpack_from("<II", self.raw, cursor)
            cursor += 8
            require(chunk_length % 4 == 0, "GLB chunk is not aligned")
            require(cursor + chunk_length <= len(self.raw), "Truncated GLB chunk")
            chunks.append((chunk_type, self.raw[cursor:cursor + chunk_length]))
            cursor += chunk_length
        require(len(chunks) == 2 and chunks[0][0] == 0x4E4F534A and chunks[1][0] == 0x004E4942,
                "Expected self-contained JSON and BIN chunks")
        self.doc = json.loads(chunks[0][1])
        self.binary = chunks[1][1]
        require(self.doc["asset"]["version"] == "2.0", "Unexpected glTF asset version")
        require(len(self.doc.get("buffers", [])) == 1, "Expected one embedded buffer")
        require("uri" not in self.doc["buffers"][0], "External buffer dependency")
        require(0 <= len(self.binary) - self.doc["buffers"][0]["byteLength"] <= 3, "BIN length mismatch")
        self.cache = {}
        self.nodes = self.doc.get("nodes", [])
        self.parent = {}
        for index, node in enumerate(self.nodes):
            for child in node.get("children", []):
                require(child not in self.parent, "Node has multiple parents")
                require(0 <= child < len(self.nodes), "Invalid child node")
                self.parent[child] = index
        self.clips = {clip["name"]: clip for clip in self.doc.get("animations", [])}

    def _view(self, view_index, offset, count, width, component):
        view = self.doc["bufferViews"][view_index]
        require(view["buffer"] == 0, "Non-embedded bufferView")
        dtype = np.dtype(DTYPES[component])
        stride = view.get("byteStride", width * dtype.itemsize)
        require(stride >= width * dtype.itemsize, "Accessor stride overlaps values")
        end = offset + (count - 1) * stride + width * dtype.itemsize if count else offset
        require(end <= view["byteLength"], "Accessor exceeds bufferView")
        start = view.get("byteOffset", 0) + offset
        require(view.get("byteOffset", 0) + view["byteLength"] <= len(self.binary), "bufferView exceeds BIN")
        return np.ndarray((count, width), dtype, buffer=self.binary, offset=start,
                          strides=(stride, dtype.itemsize)).copy()

    def accessor(self, index):
        if index in self.cache:
            return self.cache[index]
        accessor = self.doc["accessors"][index]
        count = accessor["count"]
        width = COMPONENTS[accessor["type"]]
        require(accessor["componentType"] in DTYPES, "Unsupported component type")
        if "bufferView" in accessor:
            values = self._view(accessor["bufferView"], accessor.get("byteOffset", 0), count, width,
                                accessor["componentType"])
        else:
            values = np.zeros((count, width), dtype=DTYPES[accessor["componentType"]])
        if "sparse" in accessor:
            sparse = accessor["sparse"]
            indices = self._view(sparse["indices"]["bufferView"], sparse["indices"].get("byteOffset", 0),
                                 sparse["count"], 1, sparse["indices"]["componentType"]).ravel()
            require(np.all(indices < count) and np.all(np.diff(indices.astype(int)) > 0),
                    "Invalid sparse indices")
            replacement = self._view(sparse["values"]["bufferView"], sparse["values"].get("byteOffset", 0),
                                     sparse["count"], width, accessor["componentType"])
            values[indices] = replacement
        if accessor.get("normalized"):
            component = accessor["componentType"]
            maximum = {5120: 127, 5121: 255, 5122: 32767, 5123: 65535}[component]
            values = values.astype(float) / maximum
            if component in (5120, 5122):
                values = np.maximum(values, -1)
        require(np.isfinite(values).all(), f"Non-finite accessor {index}")
        if "min" in accessor:
            require(np.allclose(np.min(values, axis=0), accessor["min"], atol=2e-5),
                    f"Accessor {index} min bounds are incorrect")
        if "max" in accessor:
            require(np.allclose(np.max(values, axis=0), accessor["max"], atol=2e-5),
                    f"Accessor {index} max bounds are incorrect")
        self.cache[index] = values
        return values

    def sample(self, clip, channel, time):
        sampler = clip["samplers"][channel["sampler"]]
        times = self.accessor(sampler["input"]).ravel()
        values = self.accessor(sampler["output"])
        interpolation = sampler.get("interpolation", "LINEAR")
        require(interpolation in ("LINEAR", "STEP", "CUBICSPLINE"), "Unknown interpolation")
        require(len(values) == len(times) * (3 if interpolation == "CUBICSPLINE" else 1),
                "Animation sampler cardinality mismatch")
        at = max(0, min(int(np.searchsorted(times, time, side="right")) - 1, len(times) - 1))
        if at == len(times) - 1 or time <= times[0]:
            return values[(0 if time <= times[0] else at) * 3 + 1] if interpolation == "CUBICSPLINE" else values[0 if time <= times[0] else at]
        duration = float(times[at + 1] - times[at])
        factor = float((time - times[at]) / duration)
        if interpolation == "STEP":
            return values[at]
        rotation = channel["target"]["path"] == "rotation"
        if interpolation == "CUBICSPLINE":
            a, b = values[3 * at + 1], values[3 * (at + 1) + 1]
            out_tangent, in_tangent = values[3 * at + 2], values[3 * (at + 1)]
            result = ((2 * factor ** 3 - 3 * factor ** 2 + 1) * a +
                      (factor ** 3 - 2 * factor ** 2 + factor) * duration * out_tangent +
                      (-2 * factor ** 3 + 3 * factor ** 2) * b +
                      (factor ** 3 - factor ** 2) * duration * in_tangent)
            return result / np.linalg.norm(result) if rotation else result
        return slerp(values[at], values[at + 1], factor) if rotation else (1 - factor) * values[at] + factor * values[at + 1]

    def matrices(self, clip_name=None, time=0):
        animated = {}
        if clip_name:
            clip = self.clips[clip_name]
            for channel in clip["channels"]:
                target = channel["target"]
                require(target["path"] in ("translation", "rotation", "scale"), "Morph animation is prohibited")
                animated.setdefault(target["node"], {})[target["path"]] = self.sample(clip, channel, time)
        local = []
        for index, node in enumerate(self.nodes):
            if "matrix" in node:
                require(index not in animated, "Animated node uses a matrix instead of TRS")
                matrix = np.array(node["matrix"]).reshape(4, 4).T
            else:
                changed = animated.get(index, {})
                translation = changed.get("translation", node.get("translation", [0, 0, 0]))
                rotation = changed.get("rotation", node.get("rotation", [0, 0, 0, 1]))
                scale = changed.get("scale", node.get("scale", [1, 1, 1]))
                require(np.linalg.norm(rotation) > 1e-8, "Zero rotation quaternion")
                require(np.all(np.asarray(scale) > 0), "Negative or zero node scale")
                matrix = np.eye(4)
                matrix[:3, :3] = quat_matrix(rotation) @ np.diag(scale)
                matrix[:3, 3] = translation
            local.append(matrix)
        world = {}
        visiting = set()

        def resolve(index):
            if index not in world:
                require(index not in visiting, "Cyclic node hierarchy")
                visiting.add(index)
                world[index] = resolve(self.parent[index]) @ local[index] if index in self.parent else local[index]
                visiting.remove(index)
            return world[index]

        return np.array([resolve(i) for i in range(len(self.nodes))])

    def geometry(self, clip_name=None, time=0, morph=(0, 0)):
        world = self.matrices(clip_name, time)
        result = {}
        for node_id, node in enumerate(self.nodes):
            if "mesh" not in node:
                continue
            mesh = self.doc["meshes"][node["mesh"]]
            positions = []
            for primitive in mesh["primitives"]:
                attributes = primitive["attributes"]
                points = self.accessor(attributes["POSITION"]).astype(float).copy()
                names = mesh.get("extras", {}).get("targetNames", [])
                for name, weight in zip(("Squash", "Stretch"), morph):
                    if name in names:
                        target = primitive["targets"][names.index(name)]
                        points += weight * self.accessor(target["POSITION"])
                if "skin" in node:
                    skin = self.doc["skins"][node["skin"]]
                    inverse = self.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
                    joint_matrices = world[skin["joints"]] @ inverse
                    posed = np.zeros_like(points)
                    for suffix in ("0", "1"):
                        if "JOINTS_" + suffix not in attributes:
                            continue
                        joints = self.accessor(attributes["JOINTS_" + suffix]).astype(int)
                        weights = self.accessor(attributes["WEIGHTS_" + suffix])
                        for column in range(joints.shape[1]):
                            matrices = joint_matrices[joints[:, column]]
                            moved = np.einsum("vij,vj->vi", matrices[:, :3, :3], points) + matrices[:, :3, 3]
                            posed += weights[:, column, None] * moved
                    points = posed
                else:
                    points = transform(points, world[node_id])
                positions.append(points)
            result[node.get("name", mesh.get("name", str(node_id)))] = np.concatenate(positions)
        return result


def nearest_max(first, second):
    """Bidirectional rest comparison tolerates exporter vertex splitting/order."""
    maximum = 0.0
    for start in range(0, len(first), 96):
        distances = np.sum((first[start:start + 96, None] - second[None]) ** 2, axis=2)
        maximum = max(maximum, float(np.sqrt(distances.min(axis=1)).max()))
    return maximum


def bounds(geometry):
    points = np.concatenate(list(geometry.values()))
    require(np.isfinite(points).all(), "Non-finite posed vertices")
    return np.min(points, axis=0), np.max(points, axis=0)


def validate(asset, approved_path):
    doc = asset.doc
    for index in range(len(doc.get("accessors", []))):
        asset.accessor(index)
    require(not doc.get("cameras"), "Camera exported")
    require(not doc.get("images") and not doc.get("textures"), "Image/texture dependency exported")
    require("KHR_lights_punctual" not in doc.get("extensions", {}), "Light exported")
    require(all("camera" not in n and "KHR_lights_punctual" not in n.get("extensions", {}) for n in asset.nodes),
            "Node contains camera/light")
    require(len(doc.get("animations", [])) == 3 and set(asset.clips) == {"Idle", "Run", "Stumble"},
            "Exactly Idle, Run, Stumble clips are required")
    require(0 < len(doc.get("skins", [])) <= 5, "Armature/skin missing or unexpected")
    joint_ids = set(itertools.chain.from_iterable(s["joints"] for s in doc["skins"]))
    require(3 <= len(joint_ids) <= 8, "Unexpectedly large or missing minimal rig")
    for skin in doc["skins"]:
        require(all(0 <= joint < len(asset.nodes) for joint in skin["joints"]), "Invalid skin joints")
        matrices = asset.accessor(skin["inverseBindMatrices"]).reshape(-1, 4, 4).transpose(0, 2, 1)
        require(len(matrices) == len(skin["joints"]), "Inverse bind count mismatch")
        require(np.all(np.abs(np.linalg.det(matrices)) > 1e-8), "Singular inverse bind matrices")
        require(np.allclose(matrices[:, 3], [0, 0, 0, 1]), "Invalid homogeneous inverse bind matrices")
    mesh_nodes = [n for n in asset.nodes if "mesh" in n]
    require({n.get("name") for n in mesh_nodes} == EXPECTED_MESHES and len(mesh_nodes) == 5,
            "Expected only the approved body, eyes and feet meshes")
    reached = set()
    def visit(index):
        reached.add(index)
        for child in asset.nodes[index].get("children", []):
            if child not in reached:
                visit(child)
    for index in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(index)
    require(len(reached) == len(asset.nodes), "Hidden/unreachable scene nodes")
    triangles, vertex_count, mesh_report = 0, 0, []
    for node in mesh_nodes:
        mesh = doc["meshes"][node["mesh"]]
        name = node["name"]
        targets = mesh.get("extras", {}).get("targetNames", [])
        if name == "Pip.Body":
            require(targets == ["Squash", "Stretch"], "Body morph names/order missing")
            require(np.allclose(mesh.get("weights", [0, 0]), 0), "Body defaults to active morphs")
        else:
            require(not targets and not any(p.get("targets") for p in mesh["primitives"]),
                    "Morph affects a non-body mesh")
        require("skin" in node, f"{name} is not attached to the rig")
        mesh_triangles, mesh_vertices = 0, 0
        for primitive in mesh["primitives"]:
            require(primitive.get("mode", 4) == 4, "Non-triangle primitive")
            attributes = primitive["attributes"]
            positions = asset.accessor(attributes["POSITION"])
            require(positions.shape[1] == 3, "Positions must be VEC3")
            normals = asset.accessor(attributes["NORMAL"])
            require(len(normals) == len(positions) and np.max(np.abs(np.linalg.norm(normals, axis=1) - 1)) < 2e-3,
                    "Missing or non-unit mesh normals")
            indices = asset.accessor(primitive["indices"]).ravel().astype(int)
            require(len(indices) % 3 == 0 and indices.min() >= 0 and indices.max() < len(positions),
                    "Invalid triangle indices")
            faces = positions[indices.reshape(-1, 3)]
            areas = np.linalg.norm(np.cross(faces[:, 1] - faces[:, 0], faces[:, 2] - faces[:, 0]), axis=1)
            require(np.all(areas > 1e-10), f"Degenerate rest triangles in {name}")
            joint_count = len(doc["skins"][node["skin"]]["joints"])
            total_weights = np.zeros(len(positions))
            for suffix in ("0", "1"):
                if "JOINTS_" + suffix not in attributes:
                    continue
                joints = asset.accessor(attributes["JOINTS_" + suffix])
                weights = asset.accessor(attributes["WEIGHTS_" + suffix])
                require(len(joints) == len(positions) and joints.shape == weights.shape, "Joint/weight shape mismatch")
                require(joints.min() >= 0 and joints.max() < joint_count, "Out-of-range skin joint")
                require(weights.min() >= 0 and weights.max() <= 1 + 1e-6, "Invalid skin weights")
                total_weights += weights.sum(axis=1)
            require(np.allclose(total_weights, 1, atol=2e-5), "Unnormalized or missing skin weights")
            require(len(primitive.get("targets", [])) == len(targets), "Morph primitive count mismatch")
            for target in primitive.get("targets", []):
                require(asset.accessor(target["POSITION"]).shape == positions.shape, "Morph position shape mismatch")
                require(np.linalg.norm(asset.accessor(target["POSITION"])) > 1e-4, "Empty morph target")
            mesh_triangles += len(indices) // 3
            mesh_vertices += len(positions)
        mesh_report.append({"name": name, "triangles": mesh_triangles, "vertices": mesh_vertices, "morph_targets": targets})
        triangles += mesh_triangles
        vertex_count += mesh_vertices
    require(triangles <= 15000, "Geometry exceeds lightweight budget")
    materials = doc.get("materials", [])
    require(len(materials) == 2, "Expected exactly two approved materials")
    for material in materials:
        pbr = material.get("pbrMetallicRoughness", {})
        require(pbr.get("metallicFactor", 1) == 0, "Character material became metallic")
        require(material.get("alphaMode", "OPAQUE") == "OPAQUE", "Unexpected transparent material")
        require(not any(k.endswith("Texture") for k in pbr) and not any(k.endswith("Texture") for k in material),
                "Unexpected texture/baked lighting material")
    require(len(asset.raw) < 5 * 1024 * 1024, "GLB exceeds 5 MiB budget")
    rest = asset.geometry()
    rest_min, rest_max = bounds(rest)
    rest_size = rest_max - rest_min
    require(approved_path.exists(), "Approved static rest reference is required")
    approved = json.loads(approved_path.read_text(encoding="utf-8"))
    require(approved["coordinate_system"] in ("BLENDER_Z_UP", "GLTF_Y_UP"), "Unknown approved coordinate basis")
    source_errors = {}
    require({mesh["name"] for mesh in approved["meshes"]} == EXPECTED_MESHES, "Incomplete approved static snapshot")
    for mesh in approved["meshes"]:
        source = np.asarray(mesh["positions"], dtype=float)
        if approved["coordinate_system"] == "BLENDER_Z_UP":
            source = source[:, [0, 2, 1]] * [1, 1, -1]
        exported = rest[mesh["name"]]
        error = max(nearest_max(source, exported), nearest_max(exported, source))
        source_errors[mesh["name"]] = round(error, 10)
        require(error < 3e-5, f"Approved static geometry changed: {mesh['name']} error={error}")
    clips = []
    for name, clip in asset.clips.items():
        end = 0.0
        targets_seen = set()
        for channel in clip["channels"]:
            target = channel["target"]
            require(target["path"] != "weights", f"{name} drives runtime morph weights")
            key = (target["node"], target["path"])
            require(key not in targets_seen, "Duplicate animation target")
            targets_seen.add(key)
            sampler = clip["samplers"][channel["sampler"]]
            times = asset.accessor(sampler["input"]).ravel()
            require(len(times) > 1 and np.all(np.diff(times) > 0), "Non-increasing animation times")
            require(abs(float(times[0])) < 1e-6, "Clip does not start at zero")
            end = max(end, float(times[-1]))
            if target["path"] == "rotation":
                values = asset.accessor(sampler["output"])
                if sampler.get("interpolation") == "CUBICSPLINE":
                    values = values[1::3]
                require(np.max(np.abs(np.linalg.norm(values, axis=1) - 1)) < 2e-4, "Non-unit animation quaternions")
        require(end > 0, f"Empty clip: {name}")
        entry = {"name": name, "duration_seconds": round(end, 6), "channels": len(clip["channels"]),
                 "drives_morph_weights": False}
        first = asset.geometry(name, 0)
        last = asset.geometry(name, end)
        endpoint_error = max(float(np.max(np.linalg.norm(first[n] - last[n], axis=1))) for n in first)
        matrix_error = float(np.abs(asset.matrices(name, 0) - asset.matrices(name, end)).max())
        entry["endpoint_max_vertex_distance"] = round(endpoint_error, 9)
        entry["endpoint_max_world_matrix_delta"] = round(matrix_error, 9)
        if name in ("Idle", "Run"):
            require(endpoint_error < 2e-5 and matrix_error < 2e-5, f"{name} loop endpoint mismatch")
            # A finite-difference seam diagnostic, including quaternion/skin output.
            step = min(1 / 60, end / 60)
            after = asset.geometry(name, step)
            before = asset.geometry(name, end - step)
            mismatch, peak = 0., 0.
            for mesh_name in first:
                velocity_start = (after[mesh_name] - first[mesh_name]) / step
                velocity_end = (last[mesh_name] - before[mesh_name]) / step
                mismatch = max(mismatch, float(np.linalg.norm(velocity_start - velocity_end, axis=1).max()))
                peak = max(peak, float(np.linalg.norm(velocity_start, axis=1).max()),
                           float(np.linalg.norm(velocity_end, axis=1).max()))
            entry["seam_velocity_delta_units_per_second"] = round(mismatch, 6)
            entry["seam_sample_step_seconds"] = round(step, 6)
            entry["loop_endpoint_pass"] = True
            # Samples straddle a turn in a smooth trajectory; finite step yields
            # curvature differences, so this is a diagnostic, not a C1 claim.
        contacts = []
        for time in np.linspace(0, end, 81):
            geometry = asset.geometry(name, float(time))
            lower, upper = bounds(geometry)
            require(np.all(upper - lower < rest_size * 3), f"Explosive animation bounds: {name}")
            contacts.append(float(lower[1]))
        entry["sampled_global_ground_min_y"] = round(min(contacts), 6)
        entry["sampled_global_ground_max_y"] = round(max(contacts), 6)
        require(min(contacts) >= -0.08, f"Excessive ground penetration in {name}: {min(contacts)}")
        if name == "Stumble":
            error = max(float(np.linalg.norm(last[n] - rest[n], axis=1).max()) for n in rest)
            entry["recovery_max_distance_from_rest"] = round(error, 8)
            require(error < 3e-4, "Stumble does not recover to approved rest pose")
        clips.append(entry)
    duration = next(clip["duration_seconds"] for clip in clips if clip["name"] == "Run")
    playback = []
    combinations = [(0, 0), (1, 0), (0, 1), (.5, .5), (1, 1)]
    for speed in (0.6, 1.0, 2.0):
        lowest, highest, maximum_size, evaluations = math.inf, -math.inf, np.zeros(3), 0
        for weights in combinations:
            for phase in np.linspace(0, 1, 33):
                wall_time = phase * duration / speed
                geometry = asset.geometry("Run", wall_time * speed, weights)
                lower, upper = bounds(geometry)
                require(np.all(upper - lower < rest_size * 3), "Explosive Run/morph bounds")
                lowest, highest = min(lowest, lower[1]), max(highest, lower[1])
                maximum_size = np.maximum(maximum_size, upper - lower)
                evaluations += 1
        require(lowest >= -0.08, f"Run/morph floor penetration at speed {speed}: {lowest}")
        playback.append({"speed": speed, "wall_loop_seconds": round(duration / speed, 6),
                         "evaluations": evaluations, "minimum_ground_y": round(float(lowest), 6),
                         "maximum_airborne_ground_y": round(float(highest), 6),
                         "maximum_dimensions_xyz": np.round(maximum_size, 6).tolist(), "finite_bounds_pass": True})
    morph_report = []
    for weights in combinations:
        geometry = asset.geometry(morph=weights)
        lower, upper = bounds(geometry)
        body_lower = geometry["Pip.Body"].min(axis=0)
        body_upper = geometry["Pip.Body"].max(axis=0)
        for mesh_name in rest:
            if mesh_name != "Pip.Body":
                require(np.array_equal(rest[mesh_name], geometry[mesh_name]), "Runtime morph changed eyes/feet")
        morph_report.append({"Squash": weights[0], "Stretch": weights[1],
                             "body_dimensions_xyz": np.round(body_upper - body_lower, 6).tolist(),
                             "ground_min_y": round(float(lower[1]), 6)})
    return {
        "status": "PASS", "validated_asset": str(asset.path.relative_to(ROOT)).replace("\\", "/"),
        "method": "Independent GLB JSON/BIN accessor parsing, CPU glTF TRS interpolation, morphing and linear skinning; no .blend assumptions.",
        "triangle_count": triangles, "exported_vertex_count": vertex_count,
        "bone_count": len(joint_ids), "bone_names": [asset.nodes[i].get("name", str(i)) for i in sorted(joint_ids)],
        "skin_count": len(doc["skins"]), "mesh_count": len(mesh_nodes), "meshes": mesh_report,
        "materials": [{"name": m.get("name"), "pbr": m.get("pbrMetallicRoughness", {})} for m in materials],
        "file_bytes": len(asset.raw), "file_kib": round(len(asset.raw) / 1024, 2),
        "rest_dimensions_xyz": np.round(rest_size, 6).tolist(), "coordinate_system": "glTF Y-up, +Z forward",
        "approved_static_max_position_error": source_errors,
        "clips": clips, "morph_targets": ["Squash", "Stretch"], "morph_weights_animated": False,
        "body_only_morph_checks": morph_report, "run_playback_checks": playback,
        "cameras": 0, "lights": 0, "images": 0, "environment_meshes": 0,
        "checks": ["GLB headers, buffer bounds, finite accessor values and declared extrema",
                   "Triangle indices, normals, nondegenerate base geometry",
                   "Joint indices, normalized skin weights, invertible inverse-bind matrices",
                   "Exported rest geometry equals approved evaluated static geometry",
                   "Exactly Idle/Run/Stumble; separate clips and normalized quaternions",
                   "Idle and Run matching world-matrix and skinned-vertex loop endpoints",
                   "Stumble recovery returns to approved rest geometry",
                   "Run sampled at 0.6x, 1x and 2x with five independent morph combinations",
                   "Runtime body-only Squash/Stretch survives export without animated weights",
                   "Two texture-free opaque nonmetallic materials and no environment objects"],
        "limitations": ["CPU playback validation is not a browser/GPU integration test; the application was not modified.",
                        "Loop endpoints are numerically verified; finite-difference seam velocity is reported, not a proof of continuous derivatives.",
                        "Ground bounds are sampled, not a continuous collision/intersection solver; no floor is exported.",
                        "Morph values were tested on [0,1], including simultaneous full influences; values outside this range are not supported."],
    }


def markdown(report):
    lines = ["# Pip production GLB validation", "", f"**{report['status']}** — `{report['validated_asset']}`", "",
             f"{report['triangle_count']:,} triangles; {report['exported_vertex_count']:,} exported vertices; "
             f"{report['bone_count']} bones; {report['mesh_count']} meshes; {len(report['materials'])} materials; "
             f"{report['file_kib']:,.2f} KiB ({report['file_bytes']:,} bytes).", "",
             "| Clip | Seconds | Result |", "| --- | ---: | --- |"]
    for clip in report["clips"]:
        result = "Seamless matching endpoints" if clip["name"] in ("Idle", "Run") else "Returns to approved rest pose"
        lines.append(f"| {clip['name']} | {clip['duration_seconds']:.3f} | {result} |")
    lines += ["", "`Squash` and `Stretch` survive as body-only morph targets. All clips leave their weights "
              "untouched for independent runtime control. Eyes and feet have no morph targets.", "",
              "The exported rest positions match the evaluated approved static source within "
              f"{max(report['approved_static_max_position_error'].values()):.8f} units. "
              "The GLB contains no cameras, lights, image textures or environment meshes.", "",
              "Run was evaluated from exported keyframes at 0.6×, 1× and 2×, with neutral, full Squash, "
              "full Stretch, half/half, and simultaneous full morph influences. "
              "Skinning and bounds remain finite. Material definitions retain opaque, nonmetallic ivory and black.", "",
              "## Checks", ""]
    lines.extend(f"- {check}." for check in report["checks"])
    lines += ["", "## Limits and runtime notes", ""]
    lines.extend(f"- {note}" for note in report["limitations"])
    lines += ["- glTF coordinates are Y-up, +Z forward. Scale is approximately "
              f"{report['rest_dimensions_xyz'][1]:.3f} units high.",
              "- Loop Idle and Run. Play Stumble once, then transition to Idle/Run. "
              "Keep root translation in the application; the run is in place.",
              "- Change Run playback speed independently of body morph weights. "
              "The same neutral-speed clip supports the full intended speed range.", "",
              "See `glb-validation.json` for per-clip endpoint errors, ground bounds, morph dimensions and sampler results.", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--glb", type=Path, default=ROOT / "public/models/pip.glb")
    parser.add_argument("--approved", type=Path, default=ROOT / "assets/pip/approved-static-meshes.json")
    parser.add_argument("--output", type=Path, default=ROOT / "assets/pip/glb-validation.json")
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ([] if "bpy" in sys.modules else sys.argv[1:])
    args = parser.parse_args(argv)
    report = validate(GLB(args.glb.resolve()), args.approved)
    args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    args.output.with_suffix(".md").write_text(markdown(report), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("status", "triangle_count", "bone_count", "file_bytes")}))


if __name__ == "__main__":
    main()
