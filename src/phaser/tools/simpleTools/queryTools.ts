import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

/**
 * Tool to find all occurrences of a specific tile on the map.
 */
export class FindTileTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async ({ tileID, searchArea }: { tileID: number; searchArea?: string }) => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      const tileName = scene.tileDictionary?.[tileID] ?? `tile #${tileID}`;

      if (searchArea === "selection") {
        // Use the new scene method to find tiles
        const combinedSelection = scene.getCombinedSelection();

        if (combinedSelection.width === 0 || combinedSelection.height === 0) {
          return "Error: No selection active. Please select an area first or search 'global'.";
        }

        const locations = scene.findTileInSelection(tileID);

        if (locations.length === 0) {
          return (
            `No tiles found!\n` +
            `- Searched for: ${tileName} (ID: ${tileID})\n` +
            `- Search area: current selection (${combinedSelection.width}x${combinedSelection.height} at global ${combinedSelection.startX},${combinedSelection.startY})`
          );
        }

        let result = `Found ${locations.length} occurrence(s) of ${tileName} (ID: ${tileID}) in selection:\n\n`;
        locations.slice(0, 20).forEach((loc, i) => {
          result += `${i + 1}. Global (${loc.globalX}, ${loc.globalY}) | Local (${loc.localX}, ${loc.localY})\n`;
        });
        if (locations.length > 20) {
          result += `\n... and ${locations.length - 20} more locations.`;
        }
        return result;
      } else {
        // For global search, inform user to select full map first
        return (
          `Global tile search for ${tileName} (ID: ${tileID}):\n` +
          `- To search the entire map, first select the full map area using the UI, then search with searchArea='selection'.\n` +
          `- Alternatively, use get_selection_info to see what's in the current selection.`
        );
      }
    },
    {
      name: "find_tile",
      schema: z.object({
        tileID: z.number().min(0).describe("The tile ID to search for"),
        searchArea: z
          .enum(["selection", "global"])
          .optional()
          .default("selection")
          .describe(
            "Where to search: 'selection' for current selection, 'global' for entire map",
          ),
      }),
      description:
        "Finds all occurrences of a specific tile ID within the current selection or the entire map. " +
        "Returns both global and local coordinates for each found tile.",
    },
  );
}

/**
 * Tool to get information about the current selection.
 */
export class GetSelectionInfoTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async () => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      const combinedSelection = scene.getCombinedSelection();

      if (combinedSelection.width === 0 || combinedSelection.height === 0) {
        return (
          "No active selection.\n" +
          "- Use the mouse to draw a selection box on the map, or\n" +
          "- Use the select_layer tool to select a named layer."
        );
      }

      const startX = combinedSelection.startX;
      const startY = combinedSelection.startY;
      const endX = startX + combinedSelection.width - 1;
      const endY = startY + combinedSelection.height - 1;

      // Use the new scene method to get stats
      const stats = scene.getSelectionStats();

      // Sort by count
      const sortedTiles = Array.from(stats.tileCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      let result = `Selection Information:\n\n`;
      result += `Position:\n`;
      result += `  - Global start: (${startX}, ${startY})\n`;
      result += `  - Global end: (${endX}, ${endY})\n`;
      result += `  - Size: ${combinedSelection.width}x${combinedSelection.height} tiles\n`;
      result += `  - Total tiles: ${stats.totalTiles}\n\n`;

      result += `Tile Contents:\n`;
      result += `  - Empty spaces: ${stats.emptyCount}\n`;
      result += `  - Placed tiles: ${stats.totalTiles - stats.emptyCount}\n`;

      if (sortedTiles.length > 0) {
        result += `\nTop tiles by frequency:\n`;
        sortedTiles.forEach(([tileId, count]) => {
          const tileName = scene.tileDictionary?.[tileId] ?? `tile #${tileId}`;
          result += `  - ${tileName} (ID: ${tileId}): ${count} tiles\n`;
        });
      }

      return result;
    },
    {
      name: "get_selection_info",
      schema: z.object({}),
      description:
        "Gets detailed information about the current selection including position, size, " +
        "and a summary of what tiles are present within it.",
    },
  );
}

/**
 * Tool to get information about a specific tile by ID.
 */
export class GetTileInfoTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async ({ tileID }: { tileID: number }) => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      const tileName = scene.tileDictionary?.[tileID];

      if (!tileName) {
        return (
          `Tile ID ${tileID} not found in tile dictionary.\n` +
          `- Valid tile IDs range from 0 to the maximum defined in TileDatabase.json.`
        );
      }

      // Check if it's a multi-tile structure tile
      const multiTileIds = new Set([
        3, 6, 7, 8, 9, 11, 15, 18, 19, 20, 21, 22, 23, 30, 31, 32, 33, 34, 35,
      ]);
      const isMultiTile = multiTileIds.has(tileID);

      let result = `Tile Information:\n\n`;
      result += `- ID: ${tileID}\n`;
      result += `- Name: ${tileName}\n`;
      result += `- Placeable: ${isMultiTile ? "NO (part of multi-tile structure)" : "Yes"}\n`;

      if (isMultiTile) {
        result += `\nNote: This tile is part of a larger structure (like a tree) and cannot be placed individually.`;
      }

      return result;
    },
    {
      name: "get_tile_info",
      schema: z.object({
        tileID: z
          .number()
          .min(0)
          .describe("The tile ID to get information about"),
      }),
      description:
        "Gets information about a specific tile ID including its name and whether it can be placed.",
    },
  );
}

/**
 * Tool to search for tiles by name.
 */
export class SearchTilesByNameTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async ({ searchTerm }: { searchTerm: string }) => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      const dictionary = scene.tileDictionary;
      if (!dictionary) {
        return "Error: Tile dictionary not loaded.";
      }

      const searchLower = searchTerm.toLowerCase();
      const matches: { id: number; name: string }[] = [];

      for (const [idStr, name] of Object.entries(dictionary)) {
        if (name.toLowerCase().includes(searchLower)) {
          matches.push({ id: Number.parseInt(idStr, 10), name });
        }
      }

      if (matches.length === 0) {
        return (
          `No tiles found matching "${searchTerm}".\n` +
          `Try a different search term or use get_tile_info with a specific ID.`
        );
      }

      // Sort by ID
      matches.sort((a, b) => a.id - b.id);

      // Check for multi-tile
      const multiTileIds = new Set([
        3, 6, 7, 8, 9, 11, 15, 18, 19, 20, 21, 22, 23, 30, 31, 32, 33, 34, 35,
      ]);

      let result = `Found ${matches.length} tile(s) matching "${searchTerm}":\n\n`;
      matches.slice(0, 25).forEach(({ id, name }) => {
        const isMulti = multiTileIds.has(id);
        result += `- ID ${id}: ${name}${isMulti ? " [NOT PLACEABLE]" : ""}\n`;
      });

      if (matches.length > 25) {
        result += `\n... and ${matches.length - 25} more matches.`;
      }

      return result;
    },
    {
      name: "search_tiles",
      schema: z.object({
        searchTerm: z
          .string()
          .min(1)
          .describe("The term to search for in tile names"),
      }),
      description:
        "Searches for tiles by name. Returns all tiles whose names contain the search term. " +
        "Useful for finding the right tile ID when you know what you're looking for.",
    },
  );
}

/**
 * Tool to get the tile at a specific coordinate.
 */
export class GetTileAtTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async ({
      x,
      y,
      coordinateType,
    }: {
      x: number;
      y: number;
      coordinateType?: string;
    }) => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      let globalX = x;
      let globalY = y;

      if (coordinateType === "local") {
        // Convert local to global using combined selection info
        const combinedSelection = scene.getCombinedSelection();
        globalX = combinedSelection.startX + x;
        globalY = combinedSelection.startY + y;
      }

      // Validate bounds
      if (
        globalX < 0 ||
        globalX >= scene.CANVAS_WIDTH ||
        globalY < 0 ||
        globalY >= scene.CANVAS_HEIGHT
      ) {
        return `Error: Coordinates (${globalX}, ${globalY}) are outside map bounds (0,0) to (${scene.CANVAS_WIDTH - 1}, ${scene.CANVAS_HEIGHT - 1}).`;
      }

      // Use the new scene method to get the tile
      const tileId = scene.getTileAtGlobal(globalX, globalY);

      const tileName =
        tileId >= 0
          ? (scene.tileDictionary?.[tileId] ?? `tile #${tileId}`)
          : "empty";

      let result = `Tile at position:\n\n`;
      result += `- Global coordinates: (${globalX}, ${globalY})\n`;
      if (coordinateType === "local") {
        result += `- Local coordinates: (${x}, ${y})\n`;
      }
      result += `- Tile ID: ${tileId === -1 ? "none (empty)" : tileId}\n`;
      result += `- Tile name: ${tileName}\n`;

      return result;
    },
    {
      name: "get_tile_at",
      schema: z.object({
        x: z.number().describe("X coordinate"),
        y: z.number().describe("Y coordinate"),
        coordinateType: z
          .enum(["global", "local"])
          .optional()
          .default("global")
          .describe(
            "Whether coordinates are global (map) or local (selection)",
          ),
      }),
      description:
        "Gets information about what tile is at a specific coordinate. " +
        "Can use either global (map) or local (selection) coordinates.",
    },
  );
}

/**
 * Tool to get map dimensions and overview.
 */
export class GetMapInfoTool {
  constructor(private getScene: () => TinyTownScene) {}

  toolCall = tool(
    async () => {
      const scene = this.getScene();
      if (!scene) {
        return "Error: Tool Failed - No reference to scene.";
      }

      const layerCount = scene.namedLayers.size;
      const layerNames = Array.from(scene.namedLayers.keys());

      let result = `Map Information:\n\n`;
      result += `Dimensions:\n`;
      result += `  - Width: ${scene.CANVAS_WIDTH} tiles\n`;
      result += `  - Height: ${scene.CANVAS_HEIGHT} tiles\n`;
      result += `  - Total tiles: ${scene.CANVAS_WIDTH * scene.CANVAS_HEIGHT}\n`;
      result += `  - Tile size: ${scene.TILE_SIZE}x${scene.TILE_SIZE} pixels\n\n`;

      result += `Named Layers: ${layerCount}\n`;
      if (layerCount > 0) {
        layerNames.forEach((name) => {
          result += `  - ${name}\n`;
        });
      } else {
        result += `  (none)\n`;
      }

      return result;
    },
    {
      name: "get_map_info",
      schema: z.object({}),
      description:
        "Gets general information about the map including dimensions and a list of named layers.",
    },
  );
}
