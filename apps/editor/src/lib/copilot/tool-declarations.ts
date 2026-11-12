import type { CopilotToolDeclaration } from "./types";

/** Layout relation of place_resource(s) (plan 5.7). Code computes the positions. */
const LAYOUT_SCHEMA = {
  type: "object",
  description: "Where to put the objects. Code computes x, y, z.",
  properties: {
    pattern: {
      type: "string",
      enum: ["single", "cluster", "ring", "row", "scatter", "shore", "path"],
      description: "cluster = irregular group next to the anchor; ring = around it; row/path = from anchor to 'to'; scatter = loose; shore = at the island edge nearest the anchor"
    },
    anchor: {
      description: "Node id from the digest, 'origin', 'camera' (default), 'selection', or {x, z}",
      anyOf: [{ type: "string" }, { type: "object", properties: { x: { type: "number" }, z: { type: "number" } }, required: ["x", "z"] }]
    },
    to: {
      description: "Second point for row and path: node id or {x, z}",
      anyOf: [{ type: "string" }, { type: "object", properties: { x: { type: "number" }, z: { type: "number" } }, required: ["x", "z"] }]
    },
    radius: { type: "number", description: "Meters; default from the footprints" },
    facing: { type: "string", enum: ["anchor", "away", "random", "along"] }
  },
  required: ["pattern"]
};

export const COPILOT_TOOL_DECLARATIONS: CopilotToolDeclaration[] = [
  // ── Placement ───────────────────────────────────────────────
  {
    name: "place_blockout_room",
    description:
      "Places a blockout room (enclosed box with walls, floor, ceiling). Open sides remove entire wall/floor/ceiling planes for coarse full-side openings only. Position is the center-bottom of the room.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position of room center" },
        y: { type: "number", description: "World Y position of room bottom (usually 0 for ground level)" },
        z: { type: "number", description: "World Z position of room center" },
        sizeX: { type: "number", description: "Room width in meters (X axis)" },
        sizeY: { type: "number", description: "Room height in meters (Y axis)" },
        sizeZ: { type: "number", description: "Room depth in meters (Z axis)" },
        openSides: {
          type: "array",
          items: { type: "string", enum: ["north", "south", "east", "west", "top", "bottom"] },
          description: "Whole sides to leave open. This removes the entire wall, floor, or ceiling plane and is not suitable for doorway- or hallway-sized openings."
        },
        materialId: { type: "string", description: "Material ID to apply. Use list_materials to see available IDs." },
        name: { type: "string", description: "Display name for the room node" }
      },
      required: ["x", "y", "z", "sizeX", "sizeY", "sizeZ"]
    }
  },
  {
    name: "place_blockout_platform",
    description:
      "Places a flat blockout mesh platform (floor slab, roof, shelf). Position is the center of the platform volume.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position (center of slab thickness)" },
        z: { type: "number", description: "World Z position" },
        sizeX: { type: "number", description: "Platform width (X)" },
        sizeY: { type: "number", description: "Platform thickness (Y), typically 0.25-0.5" },
        sizeZ: { type: "number", description: "Platform depth (Z)" },
        materialId: { type: "string", description: "Material ID" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "sizeX", "sizeY", "sizeZ"]
    }
  },
  {
    name: "place_blockout_stairs",
    description:
      "Places a parametric staircase with optional landings. Position is the center-bottom of the bottom landing. Returns topLandingCenter for chaining connections.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position of stair base" },
        y: { type: "number", description: "World Y position of stair base (bottom)" },
        z: { type: "number", description: "World Z position of stair base" },
        stepCount: { type: "number", description: "Number of steps" },
        stepHeight: { type: "number", description: "Height of each step in meters (typical: 0.2)" },
        treadDepth: { type: "number", description: "Depth of each step tread in meters (typical: 0.3)" },
        width: { type: "number", description: "Stair width in meters" },
        direction: {
          type: "string",
          enum: ["north", "south", "east", "west"],
          description: "Direction the stairs ascend toward (default: north)"
        },
        materialId: { type: "string", description: "Material ID" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "stepCount", "stepHeight", "treadDepth", "width"]
    }
  },
  {
    name: "place_primitive",
    description:
      "Places a parametric primitive shape (cube, sphere, cylinder, cone). Use it for static blockout primitives or physics props.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        role: { type: "string", enum: ["brush", "prop"], description: "brush = static blockout primitive, prop = physics object" },
        shape: { type: "string", enum: ["cube", "sphere", "cylinder", "cone"], description: "Primitive shape" },
        sizeX: { type: "number", description: "Size X (default: 2)" },
        sizeY: { type: "number", description: "Size Y (default: 2, or 3 for cylinder/cone)" },
        sizeZ: { type: "number", description: "Size Z (default: 2)" },
        materialId: { type: "string", description: "Material ID to apply directly. Avoids needing a separate assign_material call." },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "role", "shape"]
    }
  },
  {
    name: "place_primitives",
    description: "Places several primitive shapes in one call (one undo step). Each item has the fields of place_primitive.",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Put all new shapes in one folder with this name" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" },
              role: { type: "string", enum: ["brush", "prop"] },
              shape: { type: "string", enum: ["cube", "sphere", "cylinder", "cone"] },
              sizeX: { type: "number" },
              sizeY: { type: "number" },
              sizeZ: { type: "number" },
              materialId: { type: "string" },
              name: { type: "string" }
            },
            required: ["x", "y", "z", "shape"]
          }
        }
      },
      required: ["items"]
    }
  },
  {
    name: "place_brush",
    description:
      "Legacy-named compatibility tool that places a simple axis-aligned mesh box. Default is a 4x3x4 box. Prefer mesh editing workflows after placement.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        sizeX: { type: "number", description: "Brush width (default: 4)" },
        sizeY: { type: "number", description: "Brush height (default: 3)" },
        sizeZ: { type: "number", description: "Brush depth (default: 4)" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z"]
    }
  },
  {
    name: "place_light",
    description: "Places a light in the scene. Types: point (local area), directional (sun), spot (focused cone), ambient (global fill), hemisphere (sky/ground).",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        type: {
          type: "string",
          enum: ["point", "directional", "spot", "ambient", "hemisphere"],
          description: "Light type"
        },
        color: { type: "string", description: "Hex color (e.g. '#ffffff')" },
        intensity: { type: "number", description: "Light intensity" }
      },
      required: ["x", "y", "z", "type"]
    }
  },
  {
    name: "place_entity",
    description: "Places a gameplay entity (spawn point, NPC, or interactive object). Prefer place_player_spawn for playable start positions.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        rotationY: { type: "number", description: "Yaw rotation in radians" },
        type: {
          type: "string",
          enum: ["player-spawn", "npc-spawn", "smart-object", "vfx-object"],
          description: "Entity type"
        },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z", "type"]
    }
  },
  {
    name: "place_player_spawn",
    description: "Places a player-spawn entity. Use this for playable maps instead of generic entity placement.",
    parameters: {
      type: "object",
      properties: {
        x: { type: "number", description: "World X position" },
        y: { type: "number", description: "World Y position" },
        z: { type: "number", description: "World Z position" },
        rotationY: { type: "number", description: "Yaw rotation in radians" },
        name: { type: "string", description: "Display name" }
      },
      required: ["x", "y", "z"]
    }
  },

  // ── Transform ───────────────────────────────────────────────
  {
    name: "translate_nodes",
    description: "Moves nodes by a relative offset (delta). Does not set absolute position — adds delta to current position.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Node IDs to move" },
        dx: { type: "number", description: "X offset" },
        dy: { type: "number", description: "Y offset" },
        dz: { type: "number", description: "Z offset" }
      },
      required: ["nodeIds", "dx", "dy", "dz"]
    }
  },
  {
    name: "set_node_transform",
    description: "Sets a node's absolute position, rotation, and scale.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Node ID" },
        x: { type: "number", description: "Absolute X position" },
        y: { type: "number", description: "Absolute Y position" },
        z: { type: "number", description: "Absolute Z position" },
        rotationX: { type: "number", description: "Rotation X in radians" },
        rotationY: { type: "number", description: "Rotation Y in radians" },
        rotationZ: { type: "number", description: "Rotation Z in radians" },
        scaleX: { type: "number", description: "Scale X" },
        scaleY: { type: "number", description: "Scale Y" },
        scaleZ: { type: "number", description: "Scale Z" }
      },
      required: ["nodeId", "x", "y", "z"]
    }
  },
  {
    name: "duplicate_nodes",
    description: "Duplicates nodes with a position offset. Returns the new node IDs.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Node IDs to duplicate" },
        offsetX: { type: "number", description: "X offset for duplicates" },
        offsetY: { type: "number", description: "Y offset for duplicates" },
        offsetZ: { type: "number", description: "Z offset for duplicates" }
      },
      required: ["nodeIds", "offsetX", "offsetY", "offsetZ"]
    }
  },
  {
    name: "mirror_nodes",
    description: "Mirrors (flips) nodes across the specified axis.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Node IDs to mirror" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Axis to mirror across" }
      },
      required: ["nodeIds", "axis"]
    }
  },
  {
    name: "delete_nodes",
    description: "Deletes nodes and/or entities by their IDs. Also removes all children.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Node or entity IDs to delete" }
      },
      required: ["ids"]
    }
  },

  // ── Brush ───────────────────────────────────────────────────
  {
    name: "split_brush",
    description: "Legacy brush-only tool. Splits brush nodes at their midpoint along the specified axis. Returns the new node IDs.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Brush node IDs to split" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Axis to split along" }
      },
      required: ["nodeIds", "axis"]
    }
  },
  {
    name: "extrude_brush",
    description: "Legacy brush-only tool. Extrudes (grows) brush nodes along an axis by a given amount.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Brush node IDs" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Extrusion axis" },
        amount: { type: "number", description: "Extrusion distance in meters" },
        direction: { type: "string", enum: ["-1", "1"], description: "Extrusion direction: '-1' (negative) or '1' (positive)" }
      },
      required: ["nodeIds", "axis", "amount", "direction"]
    }
  },
  {
    name: "offset_brush_face",
    description: "Legacy brush-only tool. Moves a single face of a brush inward or outward.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Brush node ID" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Face axis" },
        side: { type: "string", enum: ["min", "max"], description: "Which face (min or max)" },
        amount: { type: "number", description: "Offset amount (positive = outward)" }
      },
      required: ["nodeId", "axis", "side", "amount"]
    }
  },
  {
    name: "assign_material_to_brushes",
    description: "Legacy brush-only tool. Assigns a material to all faces of the specified brush nodes.",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Brush node IDs" },
        materialId: { type: "string", description: "Material ID to assign" }
      },
      required: ["nodeIds", "materialId"]
    }
  },

  // ── Materials ───────────────────────────────────────────────
  {
    name: "create_material",
    description: "Creates or updates a material in the scene library. The ID is auto-generated as 'material:custom:<slug>' from the name (e.g. name 'Dark Wood' → id 'material:custom:dark-wood'). You can use this predictable ID immediately in assign_material calls.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Material display name" },
        color: { type: "string", description: "Hex color. Give it only when the user names a color; otherwise use palette + role." },
        palette: { type: "string", enum: ["meadow", "harbor", "ember", "blossom", "moss", "frost"], description: "Named palette. Use with role." },
        role: { type: "string", enum: ["ground", "wood", "stone", "roof", "accent", "light"] },
        category: { type: "string", enum: ["flat", "blockout", "custom"], description: "Material category (default: custom)" },
        metalness: { type: "number", description: "Metalness 0-1 (default: 0)" },
        roughness: { type: "number", description: "Roughness 0-1 (default: 0.8)" }
      },
      required: ["name"]
    }
  },
  {
    name: "assign_material",
    description: "Assigns a material to nodes (all faces) or specific faces on nodes.",
    parameters: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string", description: "Node ID" },
              faceIds: { type: "array", items: { type: "string" }, description: "Optional face IDs (omit for all faces)" }
            },
            required: ["nodeId"]
          },
          description: "Nodes (and optional faces) to assign material to"
        },
        materialId: { type: "string", description: "Material ID to assign" }
      },
      required: ["targets", "materialId"]
    }
  },
  {
    name: "set_uv_scale",
    description: "Sets UV texture tiling scale on nodes or specific faces.",
    parameters: {
      type: "object",
      properties: {
        targets: {
          type: "array",
          items: {
            type: "object",
            properties: {
              nodeId: { type: "string" },
              faceIds: { type: "array", items: { type: "string" } }
            },
            required: ["nodeId"]
          }
        },
        scaleX: { type: "number", description: "UV scale X" },
        scaleY: { type: "number", description: "UV scale Y" }
      },
      required: ["targets", "scaleX", "scaleY"]
    }
  },

  // ── Scene management ────────────────────────────────────────
  {
    name: "group_nodes",
    description:
      "Puts nodes into a new named folder (a group node) in the scene tree, like a Blender collection. Objects keep their place in the world. Use it for every object built from several parts (Tower, Wall, Bridge) and nest folders for bigger builds (Castle > Walls, Castle > Tower). Returns the group ID.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Node IDs to put in the folder" },
        name: { type: "string", description: "Folder name, for example 'Castle', 'North wall', 'Bridge'" },
        parentId: { type: "string", description: "Optional: an existing folder to put the new folder in" }
      },
      required: ["ids", "name"]
    }
  },
  {
    name: "move_to_group",
    description: "Moves nodes into an existing folder, or to the top level of the scene tree when groupId is empty. Objects keep their place in the world.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" } },
        groupId: { type: "string", description: "Target folder ID, or empty for the top level" }
      },
      required: ["ids"]
    }
  },
  {
    name: "rename_node",
    description: "Renames a node or folder in the scene tree.",
    parameters: { type: "object", properties: { id: { type: "string" }, name: { type: "string" } }, required: ["id", "name"] }
  },
  {
    name: "ungroup",
    description: "Removes a folder but keeps its contents (they move up one level).",
    parameters: { type: "object", properties: { groupId: { type: "string" } }, required: ["groupId"] }
  },
  {
    name: "select_nodes",
    description: "Sets the editor selection to the given node/entity IDs.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "IDs to select" }
      },
      required: ["ids"]
    }
  },
  {
    name: "clear_selection",
    description: "Clears the current editor selection.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "undo",
    description: "Undoes the last editor command.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "set_screen_effects",
    description:
      "Sets the screen effects (post processing) of the scene from a preset: ink = ink lines on every edge, storybook = ink lines with warm glow, cinematic = contrast, cool shadows and grain, golden = warm glow, noir = black and white, dream = strong soft glow, soft = light glow and vignette, none = off. Saved with the scene; the user tunes it in the Effects panel.",
    parameters: {
      type: "object",
      properties: {
        preset: { type: "string", enum: ["none", "soft", "ink", "storybook", "cinematic", "golden", "noir", "dream"] }
      },
      required: ["preset"]
    }
  },
  {
    name: "set_scene_settings",
    description: "Updates scene settings (world physics, fog, ambient light, player config, screen effects).",
    parameters: {
      type: "object",
      properties: {
        postFx: {
          type: "string",
          enum: ["none", "soft", "ink", "storybook", "cinematic", "golden", "noir", "dream"],
          description: "Screen effects preset (post processing): ink = ink lines on every edge, storybook = ink + warm glow, cinematic, golden (warm glow), noir (black and white), dream (strong glow), soft, none = off. The user can tune it in the Effects panel."
        },
        gravityX: { type: "number", description: "Gravity X (default: 0)" },
        gravityY: { type: "number", description: "Gravity Y (default: -9.81)" },
        gravityZ: { type: "number", description: "Gravity Z (default: 0)" },
        physicsEnabled: { type: "boolean", description: "Enable physics simulation" },
        ambientColor: { type: "string", description: "Ambient light hex color" },
        ambientIntensity: { type: "number", description: "Ambient light intensity" },
        fogColor: { type: "string", description: "Fog hex color" },
        fogNear: { type: "number", description: "Fog near distance" },
        fogFar: { type: "number", description: "Fog far distance" },
        toneMapping: { type: "string", enum: ["aces", "cineon", "linear", "neutral", "none", "reinhard"], description: "Renderer tone mapping mode" },
        cameraMode: { type: "string", enum: ["fps", "third-person", "top-down"], description: "Player camera mode" },
        playerHeight: { type: "number", description: "Player height in meters" },
        movementSpeed: { type: "number", description: "Player movement speed" },
        jumpHeight: { type: "number", description: "Player jump height" }
      }
    }
  },
  {
    name: "push_scene_to_connected_game",
    description:
      "Pushes the current editor scene into the connected scaffolded game dev server. Use it when the user asks to sync or send the current scene to the game.",
    parameters: {
      type: "object",
      properties: {
        forceSwitch: {
          type: "boolean",
          description: "If true, request the game to reload directly into the pushed scene after syncing."
        },
        gameId: {
          type: "string",
          description: "Optional specific connected game ID when more than one game is available."
        },
        projectName: {
          type: "string",
          description: "Optional project display name override for the pushed scene."
        },
        projectSlug: {
          type: "string",
          description: "Optional slug override for the target scene folder."
        }
      }
    }
  },

  // ── Read-only queries ───────────────────────────────────────
  {
    name: "list_nodes",
    description: "Lists the scene node outline as a lightweight hierarchy. Returns IDs, names, kinds, child nodes, and attached entities, but not full node data.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_entities",
    description: "Lists entities in a lightweight form with ID, name, type, and parentId. Use get_entity_details for full data.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_materials",
    description: "Lists all materials in the scene with their ID, name, color, and category.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_scene_paths",
    description: "Lists all scene-level waypoint paths with ids, names, loop state, and points.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_scene_events",
    description: "Lists the standard and custom gameplay events available in the scene.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "list_hook_types",
    description: "Lists all supported gameplay hook types, including field paths, defaults, emitted events, and listened events.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "get_node_details",
    description: "Gets full details of a specific node, including transform, worldTransform, hierarchy links, hooks, metadata, and node data.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Node ID to inspect" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "get_entity_details",
    description: "Gets full details of a specific entity, including transform, worldTransform, parentId, properties, and hooks.",
    parameters: {
      type: "object",
      properties: {
        entityId: { type: "string", description: "Entity ID to inspect" }
      },
      required: ["entityId"]
    }
  },
  {
    name: "get_scene_settings",
    description: "Gets current scene settings. This is the canonical source for player scale, jump height, movement, camera mode, physics, fog, and ambient lighting.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "create_scene_path",
    description: "Creates a new scene-level waypoint path. Paths are referenced by hook config such as path_mover.pathId.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Optional explicit path id" },
        name: { type: "string", description: "Display name" },
        loop: { type: "boolean", description: "Whether the path loops" },
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" }
            },
            required: ["x", "y", "z"]
          },
          description: "Waypoint points in world space"
        }
      },
      required: ["name", "points"]
    }
  },
  {
    name: "update_scene_path",
    description: "Updates a scene path by replacing any provided fields such as name, loop, or points.",
    parameters: {
      type: "object",
      properties: {
        pathId: { type: "string", description: "Path id to update" },
        name: { type: "string", description: "New display name" },
        loop: { type: "boolean", description: "Whether the path loops" },
        points: {
          type: "array",
          items: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
              z: { type: "number" }
            },
            required: ["x", "y", "z"]
          },
          description: "Replacement waypoint points in world space"
        }
      },
      required: ["pathId"]
    }
  },
  {
    name: "delete_scene_path",
    description: "Deletes a scene-level waypoint path.",
    parameters: {
      type: "object",
      properties: {
        pathId: { type: "string", description: "Path id to delete" }
      },
      required: ["pathId"]
    }
  },
  {
    name: "add_hook",
    description: "Attaches a gameplay hook to a node or entity using the canonical default config for that hook type, then applies any provided config overrides.",
    parameters: {
      type: "object",
      properties: {
        targetKind: { type: "string", enum: ["node", "entity"], description: "Whether the hook attaches to a node or entity" },
        targetId: { type: "string", description: "Node or entity id" },
        hookType: { type: "string", description: "Hook type. Use list_hook_types to inspect supported types." },
        enabled: { type: "boolean", description: "Whether the hook starts enabled" },
        defaultPathId: { type: "string", description: "Optional default path id for path_mover hooks" },
        config: {
          type: "object",
          additionalProperties: true,
          description: "Optional config override object merged into the canonical default config"
        }
      },
      required: ["targetKind", "targetId", "hookType"]
    }
  },
  {
    name: "set_hook_value",
    description: "Sets a specific hook config value by dot path on an existing node/entity hook.",
    parameters: {
      type: "object",
      properties: {
        targetKind: { type: "string", enum: ["node", "entity"], description: "Whether the hook is on a node or entity" },
        targetId: { type: "string", description: "Node or entity id" },
        hookId: { type: "string", description: "Hook id to edit" },
        path: { type: "string", description: "Dot path inside hook.config, for example 'pathId' or 'trigger.event'" },
        value: {
          description: "New value to write at the config path"
        }
      },
      required: ["targetKind", "targetId", "hookId", "path", "value"]
    }
  },
  {
    name: "remove_hook",
    description: "Removes a gameplay hook from a node or entity.",
    parameters: {
      type: "object",
      properties: {
        targetKind: { type: "string", enum: ["node", "entity"], description: "Whether the hook is on a node or entity" },
        targetId: { type: "string", description: "Node or entity id" },
        hookId: { type: "string", description: "Hook id to remove" }
      },
      required: ["targetKind", "targetId", "hookId"]
    }
  },
  {
    name: "get_mesh_topology",
    description: "Returns the face IDs, vertex IDs with positions, face centers, face normals, and edges for a mesh node. Use this before mesh editing operations to discover which faces/vertices/edges to target.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID to inspect" }
      },
      required: ["nodeId"]
    }
  },

  // ── Mesh editing ────────────────────────────────────────────
  {
    name: "extrude_mesh_faces",
    description: "Extrude one or more faces of a mesh node along their normal by an amount. Use get_mesh_topology first to find face IDs.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to extrude" },
        amount: { type: "number", description: "Extrusion distance in meters (positive = outward)" }
      },
      required: ["nodeId", "faceIds", "amount"]
    }
  },
  {
    name: "extrude_mesh_edge",
    description: "Extrude a boundary edge of a mesh outward, creating a new quad face.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexId1: { type: "string", description: "First vertex ID of the edge" },
        vertexId2: { type: "string", description: "Second vertex ID of the edge" },
        amount: { type: "number", description: "Extrusion distance" }
      },
      required: ["nodeId", "vertexId1", "vertexId2", "amount"]
    }
  },
  {
    name: "bevel_mesh_edges",
    description: "Bevel (chamfer/round) edges of a mesh. Creates smooth transitions at sharp edges.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Edges as [[vertexId1, vertexId2], ...] pairs" },
        width: { type: "number", description: "Bevel width in meters" },
        steps: { type: "number", description: "Number of bevel segments (1=flat chamfer, 3+=smooth round)" },
        profile: { type: "string", enum: ["flat", "round"], description: "Bevel profile shape (default: flat)" }
      },
      required: ["nodeId", "edges", "width", "steps"]
    }
  },
  {
    name: "subdivide_mesh_face",
    description: "Subdivide a mesh face into smaller faces. Quad faces get a grid pattern, others get radial.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceId: { type: "string", description: "Face ID to subdivide" },
        cuts: { type: "number", description: "Number of cuts (1=2x2 for quads, 2=3x3, etc.)" }
      },
      required: ["nodeId", "faceId", "cuts"]
    }
  },
  {
    name: "cut_mesh_face",
    description: "Cut a mesh face with a line passing through a point, splitting it into two faces.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceId: { type: "string", description: "Face ID to cut" },
        pointX: { type: "number", description: "X coordinate of cut point on the face" },
        pointY: { type: "number", description: "Y coordinate" },
        pointZ: { type: "number", description: "Z coordinate" },
        snapSize: { type: "number", description: "Snap resolution (default: 1)" }
      },
      required: ["nodeId", "faceId", "pointX", "pointY", "pointZ"]
    }
  },
  {
    name: "delete_mesh_faces",
    description: "Delete faces from a mesh, leaving real holes. Use only for intentional openings to empty space or adjacent voids, not as a shortcut for doorway- or hallway-sized passages.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to delete" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "merge_mesh_faces",
    description: "Merge adjacent coplanar faces into a single face.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to merge (must be coplanar and adjacent)" }
      },
      required: ["nodeId", "faceIds"]
    }
  },
  {
    name: "merge_mesh_vertices",
    description: "Merge multiple vertices to their average position.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs to merge" }
      },
      required: ["nodeId", "vertexIds"]
    }
  },
  {
    name: "translate_mesh_vertices",
    description: "Translate selected mesh vertices in world space. Use this to reposition a cap or face region after cutting or extruding.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs to move" },
        offsetX: { type: "number", description: "World X offset in meters" },
        offsetY: { type: "number", description: "World Y offset in meters" },
        offsetZ: { type: "number", description: "World Z offset in meters" }
      },
      required: ["nodeId", "vertexIds", "offsetX", "offsetY", "offsetZ"]
    }
  },
  {
    name: "scale_mesh_vertices",
    description: "Scale selected mesh vertices around their centroid or an optional pivot. Use this to widen or narrow an extruded cap before the next extrusion.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs to scale" },
        scaleX: { type: "number", description: "World-axis scale factor around the pivot for X" },
        scaleY: { type: "number", description: "World-axis scale factor around the pivot for Y" },
        scaleZ: { type: "number", description: "World-axis scale factor around the pivot for Z" },
        pivotX: { type: "number", description: "Optional pivot X. Defaults to the selected vertices centroid." },
        pivotY: { type: "number", description: "Optional pivot Y. Defaults to the selected vertices centroid." },
        pivotZ: { type: "number", description: "Optional pivot Z. Defaults to the selected vertices centroid." }
      },
      required: ["nodeId", "vertexIds", "scaleX", "scaleY", "scaleZ"]
    }
  },
  {
    name: "fill_mesh_face",
    description: "Create a new face from a loop of boundary vertices, filling a hole in the mesh.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        vertexIds: { type: "array", items: { type: "string" }, description: "Vertex IDs forming the boundary loop (>=3, must be boundary vertices)" }
      },
      required: ["nodeId", "vertexIds"]
    }
  },
  {
    name: "invert_mesh_normals",
    description: "Flip face normals (winding order) on selected or all faces of a mesh.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        faceIds: { type: "array", items: { type: "string" }, description: "Face IDs to invert (omit for all faces)" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "arc_mesh_edges",
    description: "Curve straight edges into arcs by inserting interpolated vertices.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Mesh node ID" },
        edges: { type: "array", items: { type: "array", items: { type: "string" } }, description: "Edges as [[vertexId1, vertexId2], ...] pairs" },
        offset: { type: "number", description: "Arc height/offset in meters" },
        segments: { type: "number", description: "Number of arc segments (minimum 2)" }
      },
      required: ["nodeId", "edges", "offset", "segments"]
    }
  },
  {
    name: "inflate_mesh",
    description: "Move all vertices of mesh nodes along their averaged normals (inflate/deflate).",
    parameters: {
      type: "object",
      properties: {
        nodeIds: { type: "array", items: { type: "string" }, description: "Mesh node IDs" },
        factor: { type: "number", description: "Inflate factor (positive = outward, negative = inward)" }
      },
      required: ["nodeIds", "factor"]
    }
  },
  {
    name: "convert_brush_to_mesh",
    description: "Convert a legacy brush node into an editable mesh node, enabling the preferred face/edge/vertex editing workflow.",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Brush node ID to convert" }
      },
      required: ["nodeId"]
    }
  },
  {
    name: "split_brush_at_coordinate",
    description: "Split a brush node at an exact world coordinate along an axis (more precise than split_brush which only splits at the midpoint).",
    parameters: {
      type: "object",
      properties: {
        nodeId: { type: "string", description: "Brush node ID" },
        axis: { type: "string", enum: ["x", "y", "z"], description: "Axis to split along" },
        coordinate: { type: "number", description: "World coordinate to split at" }
      },
      required: ["nodeId", "axis", "coordinate"]
    }
  },

  // ── Build dock (slots) and island ───────────────────────────
  {
    name: "list_slots",
    description:
      "Lists the build dock slots (shortcut buttons). A tap on the scene with an active slot places that slot's recipe. Returns index, label, icon, kind and the active index.",
    parameters: { type: "object", properties: {} }
  },
  {
    name: "set_slot",
    description:
      "Creates or replaces a build dock slot. The user may say 'slot 1' for index 0. Its icon is a 3D render of what it places, made automatically. The recipe is a list of primitive parts placed relative to the tapped point: y = 0 is the surface, each part's x/y/z is its CENTER, sizes in meters, one grid cell is 1 x 1 m. Keep recipes small (1 to 12 parts) and inside about 3 x 3 m. Materials are defined once in the recipe and parts refer to them by key. Use this to make a slot for an object the user asks for (lamp post, fence, house), or to change what an existing slot places. Do not place anything in the scene with this tool.",
    parameters: {
      type: "object",
      properties: {
        index: { type: "number", description: "Slot index to replace (0-based). Omit to add a new slot at the end." },
        label: { type: "string", description: "Short label shown under the icon, 1 or 2 words" },
        icon: {
          type: "string",
          enum: ["landmark", "lantern", "sky", "soil", "stone", "water", "seeds", "bridge", "gate", "erase", "house", "tower", "lamp", "fence", "flower", "rock", "box"],
          description: "Icon for the slot"
        },
        kind: {
          type: "string",
          enum: ["recipe", "erase", "resource"],
          description: "recipe = places parts (default); resource = places a library entry (set resourceId); erase = removes the tapped object"
        },
        resourceId: { type: "string", description: "For kind resource: a library id from search_resources, for example lh:landmark:windmill" },
        scale: { type: "number", description: "Default size of every placement (1 = as designed, 2 = twice as big)" },
        iconSvg: {
          type: "string",
          description:
            "Optional symbol instead of the automatic 3D preview: SVG inner markup for a 24 x 24 view box, stroke only (path, circle, rect, line, polyline, polygon). Leave it out to get a 3D render of the slot's object as its icon."
        },
        materials: {
          type: "array",
          items: {
            type: "object",
            properties: {
              key: { type: "string" },
              name: { type: "string" },
              color: { type: "string", description: "Hex color like #a8744a" },
              roughness: { type: "number" },
              metalness: { type: "number" }
            },
            required: ["key", "name", "color"]
          }
        },
        parts: {
          type: "array",
          items: {
            type: "object",
            properties: {
              shape: { type: "string", enum: ["cube", "cylinder", "cone", "sphere"] },
              x: { type: "number" },
              y: { type: "number", description: "Center height above the surface" },
              z: { type: "number" },
              sizeX: { type: "number" },
              sizeY: { type: "number" },
              sizeZ: { type: "number" },
              material: { type: "string", description: "Material key from materials" },
              rotationY: { type: "number", description: "Yaw in radians" },
              segments: { type: "number", description: "Radial segments for round shapes; 6-8 gives a low-poly look" },
              name: { type: "string" }
            },
            required: ["shape", "x", "y", "z", "sizeX", "sizeY", "sizeZ", "material"]
          }
        }
      },
      required: ["label", "icon"]
    }
  },
  {
    name: "select_slot",
    description: "Makes a dock slot active, so the user's next tap places it. index -1 goes back to normal selection.",
    parameters: { type: "object", properties: { index: { type: "number" } }, required: ["index"] }
  },
  {
    name: "remove_slot",
    description: "Removes a dock slot.",
    parameters: { type: "object", properties: { index: { type: "number" } }, required: ["index"] }
  },
  {
    name: "place_slot",
    description:
      "Places a slot's recipe in the scene at x, z with its base at height y (the surface). Use it to stamp the same object several times, for example a gate at each path end.",
    parameters: {
      type: "object",
      properties: {
        index: { type: "number" },
        x: { type: "number" },
        y: { type: "number", description: "Surface height to build on" },
        z: { type: "number" },
        quarterTurns: { type: "number", description: "0-3, turns of 90 degrees" }
      },
      required: ["index", "x", "y", "z"]
    }
  },
  {
    name: "generate_island",
    description:
      "Creates the Island kit island terrain (a lake with a soft, rounded island, a hill and stone outcrops) that rises with an animation. It replaces the current island. Use it when the user wants an island or a cozy start. The user shapes it with the Soil, Stone and Water dock slots. Then add landmarks and features with search_resources and place_resource, and set a sky with set_environment.",
    parameters: {
      type: "object",
      properties: {
        seed: { type: "number", description: "Shape seed; the same seed gives the same island" },
        x: { type: "number", description: "Center X, default 0" },
        z: { type: "number", description: "Center Z, default 0" }
      }
    }
  },

  // ── Resource library ────────────────────────────────────────
  {
    name: "search_resources",
    description:
      "Searches the resource library before you build anything by hand. It has, by category: Island (an editable island terrain); Island landmarks (windmill, lighthouse, shrine, fountain, gazebo, campfire, greenhouse and more) and Island features (bridge, fence, bench, lantern, rose arch, rowboat, beehive, stepping stones and more); Plants (garden plants and trees: oak, birch, cherry, pine, willow, flowers, grass, water plants, a random seed mix; plus nature trees, bushes and rocks); Buildings (whole city buildings, modular house pieces: walls, doors, windows, floors, roofs, stairs); Castle (modular walls, towers, gates, bridges, siege engines); Fantasy village (timber and fortified walls, towers, roofs, docks, crates, barrels); City commercial and industrial (shops, skyscrapers, factories, chimneys, tanks, containers, water tower); Creatures (34 characters such as hound, warlord, oracle, cloud jelly, lamp moth, woodcutter) and Vehicles (caravan ship); Water (stylized water surfaces with waves: water:lagoon, water:ocean, water:wavy-sea, water:toon-sea and more); Skies (times of day, seasons, anime skies with cumulus clouds and a sun lens flare); Blocks (primitive blockouts, last resort) and external CC0 sky images. ALWAYS prefer a library model over primitives: a tree, plant, house, castle or tower must come from the library. Modular pieces of one kit share a grid and fit together, so compose walls, towers and gates from them for a quick build. Returns id, name, kind, category, footprint radius, description (with size), source and make (code = built by code only, procedural; files = loads a model or image file).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Words to match, for example 'water mill', 'night', 'tower'. Empty lists everything." },
        kind: { type: "string", enum: ["landmark", "feature", "plant", "building", "creature", "water", "terrain", "sky", "recipe", "hdri"] },
        source: { type: "string", enum: ["local", "external"] }
      }
    }
  },
  {
    name: "place_resource",
    description:
      "Places one library object. Give layout (code computes x, y, z on the terrain, without overlap) or, only when the user gives coordinates, x, y, z (y = surface height). Objects appear with a build animation. For more than one object use place_resources.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", description: "Library id" },
        layout: LAYOUT_SCHEMA,
        x: { type: "number" },
        y: { type: "number", description: "Surface height. Island grass is at about 0.5." },
        z: { type: "number" },
        rotationY: { type: "number", description: "Yaw in radians (with x, y, z)" },
        seed: { type: "number", description: "Variation seed; the same seed gives the same look" }
      },
      required: ["id"]
    }
  },
  {
    name: "place_resources",
    description:
      "Places a whole set of library objects in one call. You give ids, counts and a layout relation; code computes positions on the terrain (ground height, no overlap, land only; boats and water plants go on the water at the shore). Items that do not fit are returned in skipped. Returns placed [{id, nodeId, x, y, z}] and skipped [{id, reason}].",
    parameters: {
      type: "object",
      properties: {
        folder: { type: "string", description: "Put all new objects in one folder with this name" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Library id" },
              count: { type: "number", description: "Default 1, max 24" },
              layout: LAYOUT_SCHEMA,
              seed: { type: "number" }
            },
            required: ["id"]
          }
        }
      },
      required: ["items"]
    }
  },
  {
    name: "set_environment",
    description:
      "Sets the scene sky and lighting from a library sky entry (kind sky or hdri). It replaces the current environment. Island kit skies bring their own sun, sky light and fog; lanterns and fires glow in the dusk and night skies.",
    parameters: { type: "object", properties: { id: { type: "string" } }, required: ["id"] }
  },
  {
    name: "load_project",
    description:
      "Loads an imported project's environment as the scene (one undo step): a place rebuilt from the project's own files (an arena, a desert, an island) or its level model. Projects are imported when the user's message has a folder path; the digest lists them under 'Imported projects'. Use search_resources with the project name for its single models.",
    parameters: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project name or folder path from the digest." },
        replace: { type: "boolean", description: "Remove the current top-level objects first (default true)." }
      },
      required: ["project"]
    }
  },
  {
    name: "set_physics",
    description:
      "Sets how objects take part in physics in game mode (Play). loose: a dynamic body that falls and can be pushed by the player (crates, barrels, balls, chairs). solid: a fixed collider (walls, floors). ghost: no collider. default: back to the automatic rule (everything solid, trees block at the trunk, water and sky never collide). Game mode never changes the saved scene.",
    parameters: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: "Node ids from the digest." },
        mode: { type: "string", enum: ["loose", "solid", "ghost", "default"] }
      },
      required: ["ids", "mode"]
    }
  },
  {
    name: "game_mode",
    description:
      "Starts or stops game mode: the scene gets physics colliders (the user sees this step), then the user walks in it as a person (WASD, mouse look, click to push loose objects) while you keep building. view: first (eye view, the default) or third (camera behind the player). Set view only when the user asks for one.",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["enter", "exit", "view"] },
        view: { type: "string", enum: ["third", "first"] }
      },
      required: ["action"]
    }
  },
  {
    name: "apply_template",
    description:
      "Starts the scene from a template, with land, sky and objects in one step (one undo step). Templates: cozy-island (golden hour island with windmill, lighthouse, lanterns, flowers), spring-meadow (wide flat meadow, blossom trees, beehives), night-harbor (starry night island, lighthouse, campfire, lanterns, rowboat), empty-island (island and summer sky only), blank (only a summer sky). Use it when the user asks for a ready scene or a starting point; then adjust with other tools.",
    parameters: {
      type: "object",
      properties: {
        id: { type: "string", enum: ["cozy-island", "spring-meadow", "night-harbor", "empty-island", "blank"] },
        replace: { type: "boolean", description: "Remove the current top-level objects first (default true). False adds to the scene." }
      },
      required: ["id"]
    }
  }
];
