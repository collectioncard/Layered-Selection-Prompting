import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

//Names the current rectangular selection as a new layer.
export class NameLayerTool {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({ name }: { name: string }) => {
      const scene = this.sceneGetter();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      if (!name || name.trim().length === 0) {
        return "Error: Layer name cannot be empty.";
      }

      // Check if layer already exists
      if (scene.namedLayers.has(name)) {
        return `Error: Layer "${name}" already exists. Use rename_layer to change the name or delete_layer first.`;
      }

      scene.nameSelection(name);
      window.dispatchEvent(new CustomEvent("layerCreated", { detail: name }));

      const selection = scene.getSelection();
      return (
        `Layer created successfully!\n` +
        `- Name: "${name}"\n` +
        `- Size: ${selection.width}x${selection.height} tiles\n` +
        `- You can now reference this area by name.`
      );
    },
    {
      name: "name_layer",
      schema: z.object({
        name: z
          .string()
          .min(1)
          .describe("The name to assign to the current selection"),
      }),
      description:
        "Saves the current selection as a named layer for future reference. " +
        "Named layers can be re-selected, renamed, or deleted later.",
    },
  );
}

export class SelectLayerTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async ({ layerName }: { layerName: string }) => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      if (!scene.namedLayers.has(layerName)) {
        const available = Array.from(scene.namedLayers.keys());
        return `Error: Layer "${layerName}" not found. Available layers: ${available.length > 0 ? available.join(", ") : "none"}`;
      }

      scene.selectLayer(layerName);
      const info = scene.namedLayers.get(layerName)!;
      const bounds = info.bounds;

      return (
        `Layer selected!\n` +
        `- Name: "${layerName}"\n` +
        `- Position: global (${bounds.x}, ${bounds.y})\n` +
        `- Size: ${bounds.width}x${bounds.height} tiles\n` +
        `- This area is now the active selection for tool operations.`
      );
    },
    {
      name: "select_layer",
      schema: z.object({
        layerName: z.string().describe("Name of the layer to re-select"),
      }),
      description:
        "Re-selects a previously named layer, making it the active selection for subsequent operations.",
    },
  );
}

export class DeleteLayerTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async ({ layerName }: { layerName: string }) => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      if (!scene.namedLayers.has(layerName)) {
        const available = Array.from(scene.namedLayers.keys());
        return `Error: Layer "${layerName}" not found. Available layers: ${available.length > 0 ? available.join(", ") : "none"}`;
      }

      scene.deleteLayer(layerName);
      return (
        `Layer deleted!\n` +
        `- Name: "${layerName}"\n` +
        `- All sublayers have also been removed.\n` +
        `- The tiles within the layer area remain on the map.`
      );
    },
    {
      name: "delete_layer",
      schema: z.object({
        layerName: z.string().describe("Name of the layer to delete"),
      }),
      description:
        "Deletes a named layer and all its sub-layers. " +
        "Note: This removes the layer reference but does NOT clear the tiles in that area.",
    },
  );
}

// /**
//  * Moves all tiles in an existing named layer by dx, dy in tile‐space.
//  */
// export class MoveLayerTool {
//   sceneGetter: () => TinyTownScene;

//   constructor(sceneGetter: () => TinyTownScene) {
//     this.sceneGetter = sceneGetter;
//   }

//   toolCall = tool(
//     async ({
//       layerName,
//       dx,
//       dy,
//     }: {
//       layerName: string;
//       dx: number;
//       dy: number;
//     }) => {
//       const scene = this.sceneGetter();
//       scene.moveLayer(layerName, dx, dy);
//       return `Layer "${layerName}" moved by (dx: ${dx}, dy: ${dy}).`;
//     },
//     {
//       name: "move_layer",
//       schema: z.object({
//         layerName: z.string().describe("The name of the layer to move"),
//         dx: z.number().describe("Number of tiles to shift in the X direction"),
//         dy: z.number().describe("Number of tiles to shift in the Y direction"),
//       }),
//       description: "Move a previously named layer by a given offset",
//     }
//   );
// }

export class RenameLayerTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async ({ oldName, newName }: { oldName: string; newName: string }) => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      if (!scene.namedLayers.has(oldName)) {
        const available = Array.from(scene.namedLayers.keys());
        return `Error: Layer "${oldName}" not found. Available layers: ${available.length > 0 ? available.join(", ") : "none"}`;
      }

      if (scene.namedLayers.has(newName)) {
        return `Error: Cannot rename to "${newName}" - a layer with that name already exists.`;
      }

      if (!newName || newName.trim().length === 0) {
        return "Error: New layer name cannot be empty.";
      }

      scene.renameLayer(oldName, newName);
      return (
        `Layer renamed successfully!\n` +
        `- Old name: "${oldName}"\n` +
        `- New name: "${newName}"`
      );
    },
    {
      name: "rename_layer",
      schema: z.object({
        oldName: z.string().describe("Current name of the layer"),
        newName: z.string().min(1).describe("New name for the layer"),
      }),
      description: "Renames an existing layer to a new name.",
    },
  );
}

export class ListLayersTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async () => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      const layers = scene.namedLayers;

      if (layers.size === 0) {
        return (
          "No named layers exist.\n" +
          "To create a layer, first make a selection, then use the name_layer tool."
        );
      }

      let output = `Found ${layers.size} named layer(s):\n\n`;

      for (const [name, info] of layers) {
        const { bounds } = info;
        output += `• "${name}"\n`;
        output += `  - Position: global (${bounds.x}, ${bounds.y})\n`;
        output += `  - Size: ${bounds.width}x${bounds.height} tiles\n`;
        output += `  - Area: ${bounds.width * bounds.height} total tiles\n\n`;
      }

      return output.trim();
    },
    {
      name: "list_layers",
      schema: z.object({}),
      description:
        "Lists all named layers in the scene with their positions, dimensions, and other details.",
    },
  );
}
