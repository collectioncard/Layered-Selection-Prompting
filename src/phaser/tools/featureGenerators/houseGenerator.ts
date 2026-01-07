import {
  FeatureGenerator,
  completedSection,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const MIN_HOUSE_WIDTH = 3;
const MIN_HOUSE_HEIGHT = 3;
const BORDER_PADDING = 1;

let lastHouseX = 0; // Global variable to store the house X position
let lastHouseY = 0; // Global variable to store the house Y position
let lastHouseWidth = 0; // Global variable to store the house X position
let lastHouseHeight = 0; // Global variable to store the house Y position

let points_of_interest = new Map();

export class HouseGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  static houseArgsSchema = z.object({
    style: z.enum(["brown", "grey"]).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().min(3).max(20).optional(),
    height: z.number().min(3).max(20).optional(),
    roof: z.enum(["red", "grey"]).optional(),
    doorCount: z.number().min(1).max(4).optional(),
    windowCount: z.number().min(0).max(20),
  });

  toolCall = tool(
    async (args: z.infer<typeof HouseGenerator.houseArgsSchema>) => {
      console.log("Generating house with args:", args);
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: No reference to scene.";
      const selection = scene.getSelection();
      var tmp = this.generate(selection, args);
      try {
        await scene.putFeatureAtSelection(tmp);
        return (
          "House added. at: (" +
          lastHouseX +
          ", " +
          lastHouseY +
          "). the connection point is at: (" +
          (lastHouseX + Math.floor(lastHouseWidth / 2)) +
          ", " +
          (lastHouseY + lastHouseHeight) +
          ")."
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Failed to place house`;
      }
    },
    {
      name: "house",
      schema: HouseGenerator.houseArgsSchema,
      description:
        "Adds a house to the map. Supports style, roof, width, height, door count, and window count.",
    },
  );

  generate(
    mapSection: generatorInput,
    args?: z.infer<typeof HouseGenerator.houseArgsSchema>,
  ): completedSection {
    const grid = mapSection.grid;
    console.log(grid);
    const houseWidth =
      args?.width ??
      Phaser.Math.Between(
        MIN_HOUSE_WIDTH,
        mapSection.width - BORDER_PADDING * 2,
      );
    const houseHeight =
      args?.height ??
      Phaser.Math.Between(
        MIN_HOUSE_HEIGHT,
        mapSection.height - BORDER_PADDING * 2,
      );
    const houseX =
      args?.x ??
      Phaser.Math.Between(
        BORDER_PADDING,
        mapSection.width - houseWidth - BORDER_PADDING,
      );
    const houseY =
      args?.y ??
      Phaser.Math.Between(
        BORDER_PADDING,
        mapSection.height - houseHeight - BORDER_PADDING,
      );
    lastHouseX = houseX; // Store the last house X position
    lastHouseY = houseY; // Store the last house Y position
    lastHouseWidth = houseWidth; // Store the last house X position
    lastHouseHeight = houseHeight; // Store the last house Y position
    // Determine style
    let wallTextureOffset: -4 | 0 = Math.random() < 0.5 ? -4 : 0;
    if (args?.style === "brown") wallTextureOffset = -4;
    if (args?.style === "grey") wallTextureOffset = 0;

    // Determine roof based on style
    let isRedRoof: boolean;
    if (args?.roof) {
      isRedRoof = args.roof === "red";
    } else {
      // Default rule: brown house -> grey roof, grey house -> red roof
      isRedRoof = wallTextureOffset === 0;
    }

    const roofTextureOffset = isRedRoof ? 0 : -4;

    const chimneyX = Phaser.Math.Between(-1, houseWidth - 1);

    // --- Roofs ---
    let y = houseY;
    grid[y][houseX] = 52 + roofTextureOffset;
    grid[y].fill(53 + roofTextureOffset, houseX + 1, houseX + houseWidth - 1);
    grid[y][houseX + houseWidth - 1] = 54 + roofTextureOffset;
    if (chimneyX >= 0) grid[y][houseX + chimneyX] = 55 + roofTextureOffset;

    y = houseY + 1;
    grid[y][houseX] = 64 + roofTextureOffset;
    grid[y].fill(65 + roofTextureOffset, houseX + 1, houseX + houseWidth - 1);
    grid[y][houseX + houseWidth - 1] = 66 + roofTextureOffset;

    // --- Wall + Window Logic ---
    const windowCount = args?.windowCount ?? 0;
    const wallTiles: { x: number; y: number }[] = [];

    for (y = houseY + 2; y < houseY + houseHeight; y++) {
      grid[y][houseX] = 76 + wallTextureOffset;
      grid[y][houseX + houseWidth - 1] = 79 + wallTextureOffset;

      for (let x = houseX + 1; x < houseX + houseWidth - 1; x++) {
        wallTiles.push({ x, y });
      }
    }

    const shuffledWallTiles = Phaser.Utils.Array.Shuffle(wallTiles);
    const windowTiles = shuffledWallTiles.slice(0, windowCount);

    for (const { x, y } of wallTiles) {
      const isWindow = windowTiles.some((tile) => tile.x === x && tile.y === y);
      grid[y][x] = isWindow ? 88 + wallTextureOffset : 77 + wallTextureOffset;
    }

    // --- Door + Awning ---
    const doorCount = args?.doorCount ?? 1;
    const possibleDoorXPositions = [];
    for (let x = houseX + 1; x < houseX + houseWidth - 1; x++) {
      possibleDoorXPositions.push(x);
    }

    const shuffledDoors = Phaser.Utils.Array.Shuffle(
      possibleDoorXPositions,
    ).slice(0, doorCount);

    shuffledDoors.forEach((doorX, index) => {
      grid[houseY + houseHeight - 1][doorX] = 89 + wallTextureOffset;

      const awningY = houseY + 1;
      if (
        ![77 + wallTextureOffset, 79 + wallTextureOffset].includes(
          grid[awningY][doorX],
        )
      ) {
        grid[awningY][doorX] = 67 + roofTextureOffset;
      }

      points_of_interest.set(`door${index + 1}`, {
        x: doorX,
        y: houseY + houseHeight - 1,
      });
    });

    return {
      name: "House",
      description: `${args?.style ?? "A"} house with a ${isRedRoof ? "red" : "grey"} roof, ${doorCount} door(s), and ${windowCount} window(s)`,
      grid,
      points_of_interest,
    };
  }
}
