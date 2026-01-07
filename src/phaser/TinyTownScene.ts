import Phaser from "phaser";
import { sendSystemMessage } from "../modelChat/chatbox";
import { chatHistory } from "../modelChat/chatbox";

import { Preload } from "./Preload";
import { completedSection, generatorInput } from "./tools/IGenerator.ts";
import { Tree } from "./TreeStructure.ts";
import { WorldFactsDatabaseMaker } from "./WorldFactsDatabaseMaker.ts";

interface TinyTownSceneData {
  dict: { [key: number]: string };
}

const TILE_PRIORITY = {
  HOUSE: 4,
  FENCE: 3,
  DECOR: 2,
  FOREST: 1,
  GRASS: 0,
  EMPTY: -1,
};

const MULTI_TILE_TREES = {
  single: {
    green: [4, 16],
    yellow: [3, 15],
  },
  stack1: {
    green: [6, 8, 30, 32],
    yellow: [9, 11, 33, 35],
  },
  stack2: {
    green: [7, 19, 31, 18, 20],
    yellow: [10, 22, 34, 21, 23],
  },
};

const buildNeighbourRules = () => {
  type RuleEntry = { dx: number; dy: number; expected: number };
  const map = new Map<number, RuleEntry[]>();

  const addRules = (tiles: number[], positions: { x: number; y: number }[]) => {
    tiles.forEach((id, i) => {
      const rules: RuleEntry[] = [];
      tiles.forEach((otherID, j) => {
        if (i === j) return;
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        rules.push({ dx, dy, expected: otherID });
      });
      map.set(id, rules);
    });
  };

  addRules(MULTI_TILE_TREES.single.green, [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ]);
  addRules(MULTI_TILE_TREES.single.yellow, [
    { x: 0, y: 0 },
    { x: 0, y: 1 },
  ]);

  const squarePos = [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: 1, y: 1 },
  ];
  addRules(MULTI_TILE_TREES.stack1.green, squarePos);
  addRules(MULTI_TILE_TREES.stack1.yellow, squarePos);

  const crossPos = [
    { x: 0, y: 0 }, // top
    { x: 0, y: 1 }, // mid
    { x: 0, y: 2 }, // bottom
    { x: -1, y: 1 }, // left
    { x: 1, y: 1 }, // right
  ];
  addRules(MULTI_TILE_TREES.stack2.green, crossPos);
  addRules(MULTI_TILE_TREES.stack2.yellow, crossPos);

  return map;
};

const MULTI_TILE_NEIGHBOUR_RULES = buildNeighbourRules();

export class TinyTownScene extends Phaser.Scene {
  private highlightBorders: Phaser.GameObjects.Graphics[] = [];
  private highlightLabels: Phaser.GameObjects.Text[] = [];

  // the currently active layer bounds, or null if none
  private activeLayerBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null = null;

  // graphics object we’ll use for the outside mask
  private overlayMask!: Phaser.GameObjects.Graphics;

  private readonly SCALE = 1;
  public readonly CANVAS_WIDTH = 40; //Size in tiles
  public readonly CANVAS_HEIGHT = 25; // ^^^
  public readonly TILE_SIZE = 16; //Size in pixels

  ////DEBUG / FEATURE FLAGS////
  private readonly allowOverwriting: boolean = true; // Allows LLM to overwrite placed tiles
  private readonly AUTOLAYER: boolean = true;

  // Phaser map & tileset references
  private map!: Phaser.Tilemaps.Tilemap;
  private tileset!: Phaser.Tilemaps.Tileset;

  // Base layers
  private grassLayer!: Phaser.Tilemaps.TilemapLayer;
  private featureLayer!: Phaser.Tilemaps.TilemapLayer;

  // Tree Structure
  private layerTree = new Tree(
    "Root",
    [
      [0, 0],
      [this.CANVAS_WIDTH, this.CANVAS_HEIGHT],
    ],
    this.CANVAS_WIDTH,
    this.CANVAS_HEIGHT,
  );

  // Named layers storage: name → bounds + tile coordinates
  public namedLayers = new Map<
    string,
    {
      layer: Phaser.Tilemaps.TilemapLayer;
      bounds: { x: number; y: number; width: number; height: number };
    }
  >();
  //highlight box
  private highlightBox!: Phaser.GameObjects.Graphics;
  public selectedTileId: number | null = null;

  public isPlacingMode: boolean = false; // true = placing mode, false = selection mode

  // selection box properties
  private selectionBox!: Phaser.GameObjects.Graphics;
  public selectionStart!: Phaser.Math.Vector2;
  public selectionEnd!: Phaser.Math.Vector2;
  private isSelecting: boolean = false;
  private selectedTiles: {
    coordinates: { x: number; y: number }[];
    dimensions: { width: number; height: number };
    tileGrid: number[][]; // grass layer
    featureGrid: number[][]; // feature layer
    combinedGrid: number[][]; // combined layer
  } = {
    coordinates: [],
    dimensions: { width: 0, height: 0 },
    tileGrid: [],
    featureGrid: [],
    combinedGrid: [],
  };

  private wf: WorldFactsDatabaseMaker | null = null;
  private paragraphDescription: string = "";

  // set of tile indexes used for tile understanding
  private selectedTileSet = new Set<number>();
  public tileDictionary!: { [key: number]: string };

  public LastData: completedSection = {
    name: "DefaultSelection",
    description: "Full Default",
    grid: [],
    points_of_interest: new Map(),
  };

  constructor() {
    super("TinyTown");
  }

  init(data: TinyTownSceneData) {
    console.log(data);
    this.tileDictionary = data.dict;
    console.log(this.tileDictionary);
  }

  preload() {
    this.load.image("tiny_town_tiles", "phaserAssets/Tilemap_Extruded.png");
  }

  create() {
    const stripeSize = 64;
    const stripeThickness = 16;

    const g = this.make.graphics();
    g.fillStyle(0x000000, 1);
    g.fillRect(0, 0, stripeSize, stripeSize);

    g.lineStyle(stripeThickness, 0xb92d2e, 1);
    g.strokeLineShape(new Phaser.Geom.Line(0, stripeSize, stripeSize, 0));
    g.generateTexture("stripePattern", stripeSize, stripeSize);
    g.destroy();

    const stripes = this.add
      .tileSprite(
        0,
        0,
        this.cameras.main.width,
        this.cameras.main.height,
        "stripePattern",
      )
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-100);

    this.scale.on("resize", (gameSize: Phaser.Structs.Size) => {
      stripes.setSize(gameSize.width, gameSize.height);
    });

    const map = this.make.tilemap({
      tileWidth: 16,
      tileHeight: 16,
      width: 20,
      height: 20,
    });

    // Load the extruded map to prevent bleeding when zooming in.
    // This is generated with npm run process-assets
    // this must be done for every new tileset
    const tileSheet = map.addTilesetImage(
      "tiny_town_tiles",
      "tiny_town_tiles",
      16,
      16,
      1,
      2,
    )!;

    this.map = map;
    this.tileset = tileSheet;

    this.grassLayer = map.createBlankLayer(
      "base-layer",
      tileSheet,
      0,
      0,
      this.CANVAS_WIDTH,
      this.CANVAS_HEIGHT,
    )!;
    this.grassLayer.setScale(this.SCALE);

    this.featureLayer = map.createBlankLayer(
      "features-layer",
      tileSheet,
      0,
      0,
      this.CANVAS_WIDTH,
      this.CANVAS_HEIGHT,
    )!;
    this.featureLayer.setScale(this.SCALE);

    //fill the grass layer with 1 of the three options
    for (let y = 0; y < this.CANVAS_HEIGHT; y++) {
      for (let x = 0; x < this.CANVAS_WIDTH; x++) {
        this.grassLayer.putTileAt(Phaser.Math.Between(0, 2), x, y);
      }
    }

    // -------------> DO STUFF HERE <----------------
    this.selectionBox = this.add.graphics();
    this.selectionBox.setDepth(100);
    this.overlayMask = this.add.graphics().setDepth(140);

    // this.input.on('pointerdown', this.startSelection, this);
    this.input.on("pointermove", this.updateSelection, this);
    this.input.on("pointerupoutside", this.endSelection, this);
    this.input.on("pointerup", this.endSelection, this);

    // cursor change outside active layer
    this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
      if (this.isPlacingMode) {
        this.input.setDefaultCursor("default");
        return;
      }

      const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const tx = Math.floor(worldPoint.x / (16 * this.SCALE));
      const ty = Math.floor(worldPoint.y / (16 * this.SCALE));

      if (this.activeLayerBounds) {
        const b = this.activeLayerBounds;
        const ok =
          tx >= b.x && tx < b.x + b.width && ty >= b.y && ty < b.y + b.height;
        this.input.setDefaultCursor(ok ? "crosshair" : "not-allowed");
      } else {
        this.input.setDefaultCursor("crosshair");
      }
    });

    //highlight box
    this.highlightBox = this.add.graphics();
    this.highlightBox.setDepth(101); // Ensure it's on top of everything

    // Setup pointer movement
    this.input.on("pointermove", this.highlightTile, this);

    //place the selected tile upon mouse click
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.isPlacingMode) {
        const worldPoint = this.cameras.main.getWorldPoint(
          pointer.x,
          pointer.y,
        );
        const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
        const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

        if (
          this.selectedTileId !== null &&
          x >= 0 &&
          x < this.CANVAS_WIDTH &&
          y >= 0 &&
          y < this.CANVAS_HEIGHT
        ) {
          this.featureLayer?.putTileAt(this.selectedTileId, x, y);
        }
      } else {
        this.startSelection(pointer);
      }
    });

    // create/refrence button to change modes (move to main later)
    const modeButton = document.getElementById("mode-selection");
    if (modeButton) {
      modeButton.textContent = `Mode: ${this.isPlacingMode ? "Place" : "Select"}`;
      modeButton.addEventListener("click", () => {
        this.isPlacingMode = !this.isPlacingMode;
        modeButton!.textContent = `Mode: ${this.isPlacingMode ? "Place" : "Select"}`;
      });
    }
  }

  startSelection(pointer: Phaser.Input.Pointer): void {
    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    if (x < 0 || x >= this.CANVAS_WIDTH || y < 0 || y >= this.CANVAS_HEIGHT) {
      return;
    }

    // If we're zoomed into a specific layer, only allow starting inside it
    if (this.activeLayerBounds) {
      const b = this.activeLayerBounds;
      if (x < b.x || x >= b.x + b.width || y < b.y || y >= b.y + b.height) {
        return;
      }
    }

    // Begin the selection
    this.isSelecting = true;
    this.selectionStart = new Phaser.Math.Vector2(x, y);
    this.selectionEnd = new Phaser.Math.Vector2(x, y);
    this.drawSelectionBox();
  }
  setSelectionCoordinates(x: number, y: number, w: number, h: number): void {
    const endX = x + w - 1;
    const endY = y + h - 1;

    if (
      w >= 1 &&
      h >= 1 &&
      x >= 0 &&
      x < this.CANVAS_WIDTH &&
      y >= 0 &&
      y < this.CANVAS_HEIGHT &&
      endX >= 0 &&
      endX < this.CANVAS_WIDTH &&
      endY >= 0 &&
      endY < this.CANVAS_HEIGHT
    ) {
      this.isSelecting = true;
      this.selectionStart = new Phaser.Math.Vector2(x, y);

      this.selectionEnd = new Phaser.Math.Vector2(endX, endY);
      this.drawSelectionBox();

      this.endSelection();
    } else {
      console.warn(
        `Invalid selection coordinates provided: x=${x}, y=${y}, w=${w}, h=${h}. Selection not set.`,
      );
    }
  }

  updateSelection(pointer: Phaser.Input.Pointer): void {
    if (!this.isSelecting) return;

    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Clamp to map bounds
    let clampedX: number = Phaser.Math.Clamp(x, 0, this.CANVAS_WIDTH - 1);
    let clampedY: number = Phaser.Math.Clamp(y, 0, this.CANVAS_HEIGHT - 1);

    if (this.activeLayerBounds) {
      const b = this.activeLayerBounds;
      clampedX = Phaser.Math.Clamp(x, b.x, b.x + b.width - 1);
      clampedY = Phaser.Math.Clamp(y, b.y, b.y + b.height - 1);
    }

    this.selectionEnd.set(clampedX, clampedY);
    this.drawSelectionBox();
  }

  endSelection() {
    if (!this.isSelecting) return;

    this.isSelecting = false;
    this.collectSelectedTiles();

    const selectedDescriptions = [];
    for (let tileID of this.selectedTileSet) {
      const description = this.tileDictionary[tileID];
      selectedDescriptions.push({ tileID, description });
    }

    this.wf = new WorldFactsDatabaseMaker(
      this.selectedTiles.combinedGrid,
      this.selectedTiles.dimensions.width,
      this.selectedTiles.dimensions.height,
      this.TILE_SIZE,
    );
    this.wf.getWorldFacts();

    this.paragraphDescription = this.wf.getDescriptionParagraph();
    console.log(this.paragraphDescription);
    this.wf.printWorldFacts();

    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    // These define the height and width of the selection box
    const selectionWidth = endX - startX;
    const selectionHeight = endY - startY;

    // Helper to convert any global (x, y) to selection-local coordinates
    const toSelectionCoordinates = (x: number, y: number) => {
      return {
        x: x - startX,
        y: endY - y, // Flip y-axis relative to bottom-left
      };
    };

    let selectionMessage: string;

    if (startX === endX && startY === endY) {
      const { x: localX, y: localY } = toSelectionCoordinates(startX, startY);
      selectionMessage = `User has selected a single tile at (${localX}, ${localY}) relative to the bottom-left of the selection box.`;
    } else {
      if (this.paragraphDescription != "") {
        selectionMessage =
          `User has selected a rectangular region that is this size: ${selectionWidth}x${selectionHeight}. Here are the global coordinates for the selection box: [${startX}, ${startY}] to [${endX}, ${endY}].` +
          `This is the description of the selection, this is only for context purposes and to help you understand what is selected: ${this.paragraphDescription}` +
          `Doors are connection points / points of interest for you to connect paths with.` +
          `Be sure to re-explain what is in the selection box. If there are objects in the selection, specify the characteristics of the object. ` +
          `If no objects are inside the selection, then do not mention anything else.`;
      } else {
        selectionMessage =
          `User has selected a rectangular region that is this size: ${selectionWidth}x${selectionHeight}. Here are the global coordinates for the selection box: [${startX}, ${startY}] to [${endX}, ${endY}].` +
          `There are no notable points of interest in this selection` +
          `Be sure to re-explain what is in the selection box. If there are objects in the selection, specify the characteristics of the object. ` +
          `If no objects are inside the selection, then do not mention anything else.`;
      }
      console.log(selectionMessage);
    }

    sendSystemMessage(selectionMessage);
  }

  drawSelectionBox() {
    this.selectionBox.clear();

    if (!this.isSelecting) return;

    // Calculate the bounds of the selection
    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    const width = endX - startX + 1;
    const height = endY - startY + 1;

    // Draw a semi-transparent rectangle
    this.selectionBox.fillStyle(0xff5555, 0.3);
    this.selectionBox.fillRect(
      startX * 16 * this.SCALE,
      startY * 16 * this.SCALE,
      (endX - startX + 1) * 16 * this.SCALE,
      (endY - startY + 1) * 16 * this.SCALE,
    );

    // Draw a dashed border
    this.selectionBox.lineStyle(2, 0xff5555, 1);
    this.selectionBox.beginPath();
    const dashLength = 8; // Length of each dash
    const gapLength = 4; // Length of each gap

    // Top border
    for (let i = 0; i < width * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        startX * 16 * this.SCALE + i,
        startY * 16 * this.SCALE,
      );
      this.selectionBox.lineTo(
        Math.min(
          startX * 16 * this.SCALE + i + dashLength,
          endX * 16 * this.SCALE + 16 * this.SCALE,
        ),
        startY * 16 * this.SCALE,
      );
    }

    // Bottom border
    for (let i = 0; i < width * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        startX * 16 * this.SCALE + i,
        endY * 16 * this.SCALE + 16 * this.SCALE,
      );
      this.selectionBox.lineTo(
        Math.min(
          startX * 16 * this.SCALE + i + dashLength,
          endX * 16 * this.SCALE + 16 * this.SCALE,
        ),
        endY * 16 * this.SCALE + 16 * this.SCALE,
      );
    }

    // Left border
    for (let i = 0; i < height * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        startX * 16 * this.SCALE,
        startY * 16 * this.SCALE + i,
      );
      this.selectionBox.lineTo(
        startX * 16 * this.SCALE,
        Math.min(
          startY * 16 * this.SCALE + i + dashLength,
          endY * 16 * this.SCALE + 16 * this.SCALE,
        ),
      );
    }

    // Right border
    for (let i = 0; i < height * 16 * this.SCALE; i += dashLength + gapLength) {
      this.selectionBox.moveTo(
        endX * 16 * this.SCALE + 16 * this.SCALE,
        startY * 16 * this.SCALE + i,
      );
      this.selectionBox.lineTo(
        endX * 16 * this.SCALE + 16 * this.SCALE,
        Math.min(
          startY * 16 * this.SCALE + i + dashLength,
          endY * 16 * this.SCALE + 16 * this.SCALE,
        ),
      );
    }

    this.selectionBox.strokePath();
  }

  collectSelectedTiles() {
    const startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const endX = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const endY = Math.max(this.selectionStart.y, this.selectionEnd.y);

    const width = endX - startX + 1;
    const height = endY - startY + 1;

    // Reset the selectedTiles
    this.selectedTiles = {
      coordinates: [],
      dimensions: { width, height },
      tileGrid: Array(height)
        .fill(0)
        .map(() => Array(width).fill(-1)),
      featureGrid: Array(height)
        .fill(0)
        .map(() => Array(width).fill(-1)),
      combinedGrid: Array(height)
        .fill(0)
        .map(() => Array(width).fill(-1)),
    };
    this.selectedTileSet.clear();

    // Populate coordinates and tile IDs
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const worldX = startX + x;
        const worldY = startY + y;

        // Add to coordinates array
        this.selectedTiles.coordinates.push({ x: worldX, y: worldY });

        // Get tile IDs from both layers
        let grassTileId = -1;
        if (this.grassLayer) {
          const tile = this.grassLayer.getTileAt(worldX, worldY);
          grassTileId = tile ? tile.index : -1;
          this.selectedTiles.tileGrid[y][x] = grassTileId;
        }

        let featureTileId = -1;
        if (this.featureLayer) {
          const featureTile = this.featureLayer.getTileAt(worldX, worldY);
          featureTileId = featureTile ? featureTile.index : -1;
          this.selectedTiles.featureGrid[y][x] = featureTileId;
        }

        let namedTileId = -1;
        for (const info of this.namedLayers.values()) {
          const b = info.bounds;
          if (
            worldX >= b.x &&
            worldX < b.x + b.width &&
            worldY >= b.y &&
            worldY < b.y + b.height
          ) {
            const localX = worldX - b.x;
            const localY = worldY - b.y;
            const tile = info.layer.getTileAt(localX, localY);
            if (tile && tile.index >= 0) {
              namedTileId = tile.index;
              break; // Found a tile in a named layer, no need to check others
            }
          }
        }

        const finalIdx =
          namedTileId !== -1
            ? namedTileId
            : featureTileId !== -1
              ? featureTileId
              : grassTileId;
        this.selectedTiles.combinedGrid[y][x] = finalIdx;
        if (finalIdx !== -1) {
          this.selectedTileSet.add(finalIdx);
        }
      }
    }
  }

  clearSelection() {
    this.isSelecting = false;
    this.selectionBox.clear();
    this.selectionStart = new Phaser.Math.Vector2(0, 0);
    this.selectionEnd = new Phaser.Math.Vector2(0, 0);
    this.selectedTiles = {
      coordinates: [],
      dimensions: { width: 0, height: 0 },
      tileGrid: [],
      featureGrid: [],
      combinedGrid: [],
    };
    console.log("Selection cleared");
  }

  getSelection(): generatorInput {
    return {
      grid: this.selectedTiles.featureGrid.map((row) => [...row]),
      width: this.selectedTiles.dimensions.width,
      height: this.selectedTiles.dimensions.height,
    };
  }

  public clearLayerHighlights() {
    this.highlightBorders.forEach((g) => g.destroy());
    this.highlightLabels.forEach((t) => t.destroy());
    this.highlightBorders = [];
    this.highlightLabels = [];
  }

  public drawLayerHighlights(layerNames: string[]) {
    this.clearLayerHighlights();

    const tw = 16 * this.SCALE;
    const th = 16 * this.SCALE;
    const color = 0x0000ff; // Color
    const alpha = 0.5; // opacity
    const lineWidth = 2; // line width

    layerNames.forEach((name) => {
      const info = this.namedLayers.get(name);
      if (!info) return;

      const { x, y, width, height } = info.bounds;
      const wx = x * tw;
      const wy = y * th;
      const wpx = width * tw;
      const hpx = height * th;

      // draw the box
      const g = this.add.graphics().setDepth(150);
      g.lineStyle(lineWidth, color, alpha);
      g.strokeRect(wx, wy, wpx, hpx);
      this.highlightBorders.push(g);

      // draw the label in the top-right corner
      const label = this.add
        .text(wx + wpx - 4, wy + 4, name, {
          font: "12px sans-serif",
          color: "#0000ff",
        })
        .setOrigin(1, 0)
        .setDepth(151);
      this.highlightLabels.push(label);
    });
  }

  public drawSingleHighlight(layerName: string, color = 0xff8800, alpha = 0.8) {
    const tw = 16 * this.SCALE;
    const th = 16 * this.SCALE;
    const info = this.namedLayers.get(layerName);
    if (!info) return;
    const { x, y, width, height } = info.bounds;
    const g = this.add.graphics().setDepth(151);
    g.lineStyle(4, color, alpha);
    g.strokeRect(x * tw, y * th, width * tw, height * th);
    this.highlightBorders.push(g);
  }

  public nameSelection(name: string) {
    const sx = Math.min(this.selectionStart.x, this.selectionEnd.x);
    const sy = Math.min(this.selectionStart.y, this.selectionEnd.y);
    const ex = Math.max(this.selectionStart.x, this.selectionEnd.x);
    const ey = Math.max(this.selectionStart.y, this.selectionEnd.y);
    const w = ex - sx + 1;
    const h = ey - sy + 1;

    const layer = this.map.createBlankLayer(
      name, // unique layer name
      this.tileset, // your Tileset object
      sx * 16 * this.SCALE, // world-space X
      sy * 16 * this.SCALE, // world-space Y
      w, // layer width in tiles
      h, // layer height in tiles
    );

    if (!layer) {
      console.warn(`Failed to create layer "${name}".`);
      return;
    }

    // Copy & clear tiles from featureLayer → new layer
    for (let row = 0; row < h; row++) {
      for (let col = 0; col < w; col++) {
        const tx = sx + col;
        const ty = sy + row;
        const idx = this.featureLayer.getTileAt(tx, ty)?.index ?? -1;
        if (idx >= 0) {
          layer.putTileAt(idx, col, row);
          this.featureLayer.removeTileAt(tx, ty);
        }
      }
    }

    this.namedLayers.set(name, {
      layer,
      bounds: { x: sx, y: sy, width: w, height: h },
    });
    console.log(
      `Layer "${name}" created at tile coords (${sx},${sy}) size ${w}×${h}`,
    );

    this.layerTree.add(
      name,
      [
        [sx, sy],
        [ex, ey],
      ],
      w,
      h,
    );
    this.layerTree.printTree();

    window.dispatchEvent(
      new CustomEvent("layerCreated", {
        detail: name,
      }),
    );
  }

  public selectLayer(name: string) {
    const info = this.namedLayers.get(name);
    if (!info) {
      console.warn(`No layer called "${name}".`);
      return;
    }
    const startX = info.bounds.x;
    const startY = info.bounds.y;
    const width = info.bounds.width;
    const height = info.bounds.height;
    // this will draw & collect
    this.setSelectionCoordinates(startX, startY, width, height);
    // then zoom in on it
    this.zoomToLayer(name);
    console.log(
      `Re-selected layer "${name}" at tile (${startX},${startY}) ` +
        `size ${width}×${height}.`,
    );

    // Used to change highlighted layer in the UI
    window.dispatchEvent(new CustomEvent("layerSelected", { detail: name }));
  }

  // //Moves an existing named layer by (dx, dy) tiles.

  // public moveLayer(name: string, dx: number, dy: number) {
  //     const layer = this.namedLayers.get(name);
  //     if (!layer) {
  //         console.warn(`Layer "${name}" not found.`);
  //         return;
  //     }

  //     layer.x += dx * 16 * this.SCALE;
  //     layer.y += dy * 16 * this.SCALE;

  //     console.log(`Layer "${name}" moved by (${dx},${dy}) tiles`);
  // }

  public zoomToLayer(name: string, paddingFraction = 0.1) {
    const info = this.namedLayers.get(name);
    if (!info) {
      console.warn(`Layer "${name}" not found, cannot zoom.`);
      return;
    }

    const { x, y, width, height } = info.bounds;
    const cam = this.cameras.main;

    // tile → world pixels
    const tw = 16 * this.SCALE;
    const th = 16 * this.SCALE;
    const worldX = x * tw;
    const worldY = y * th;
    const layerWpx = width * tw;
    const layerHpx = height * th;

    // how much to zoom so that the layer just fits (before padding)
    const zoomX = cam.width / layerWpx;
    const zoomY = cam.height / layerHpx;
    let zoom = Math.min(zoomX, zoomY);

    // shrink a bit by paddingFraction (e.g. 0.1 → 10% border)
    zoom = zoom * (1 - paddingFraction);

    cam.setZoom(zoom);

    // center on the middle of that layer
    cam.centerOn(worldX + layerWpx / 2, worldY + layerHpx / 2);
  }

  public resetView() {
    const cam = this.cameras.main;
    cam.setZoom(1);
    // center on world middle (mapWidth*tileSize/2, mapHeight*tileSize/2)
    const worldW = this.CANVAS_WIDTH * 16 * this.SCALE;
    const worldH = this.CANVAS_HEIGHT * 16 * this.SCALE;
    cam.centerOn(worldW / 2, worldH / 2);
    console.log("View reset to default");
  }

  getTilePriority(tileIndex: number): number {
    if (tileIndex === -1) {
      return TILE_PRIORITY.EMPTY; // -1
    }
    if ([44, 45, 46, 56, 58, 68, 69, 70].includes(tileIndex)) {
      return TILE_PRIORITY.FENCE; // 3
    }

    if (
      (tileIndex >= 48 && tileIndex <= 67) ||
      (tileIndex >= 72 && tileIndex <= 91)
    ) {
      return TILE_PRIORITY.HOUSE; // 4
    }

    if (
      (tileIndex >= 3 && tileIndex <= 23) ||
      (tileIndex >= 27 && tileIndex <= 35)
    ) {
      return TILE_PRIORITY.FOREST; // 1
    }

    if ([57, 94, 95, 106, 107, 130, 131].includes(tileIndex)) {
      return TILE_PRIORITY.DECOR; // 2
    }
    if (tileIndex >= 0 && tileIndex <= 2) {
      return TILE_PRIORITY.GRASS; // 0
    }
    return TILE_PRIORITY.GRASS; // 0
  }

  public renameLayer(oldName: string, newName: string) {
    const info = this.namedLayers.get(oldName);
    if (!info) {
      console.warn(`Layer "${oldName}" not found.`);
      return;
    }
    this.namedLayers.delete(oldName);
    info.layer.name = newName;
    this.namedLayers.set(newName, info);

    this.layerTree.rename(oldName, newName);

    window.dispatchEvent(
      new CustomEvent("layerRenamed", {
        detail: { oldName, newName },
      }),
    );
  }

  public deleteLayerOnly(name: string) {
    const node = this.layerTree.getNode(name);
    if (!node) return;
    for (const child of [...node.Children]) {
      this.deleteLayerOnly(child.Name);
    }

    this.namedLayers.delete(name);

    this.layerTree.deleteNode(name);

    window.dispatchEvent(new CustomEvent("layerDeleted", { detail: name }));
  }

  // Recursively remove a layer and all its children.
  public deleteLayer(name: string) {
    const node = this.layerTree.getNode(name);
    if (!node) {
      console.warn(`Cannot delete layer "${name}", not found.`);
      return;
    }

    for (const child of [...node.Children]) {
      this.deleteLayer(child.Name);
    }

    const info = this.namedLayers.get(name);
    if (info) {
      const { x, y, width, height } = info.bounds;
      const tiles = info.layer.getTilesWithin(x, y, width, height);
      for (const tile of tiles) {
        info.layer.removeTileAt(tile.x, tile.y);
      }
      info.layer.destroy(true);
      this.namedLayers.delete(name);
    }

    this.layerTree.deleteNode(name);

    window.dispatchEvent(new CustomEvent("layerDeleted", { detail: name }));
  }

  public setActiveLayer(name: string | null) {
    if (name) {
      const info = this.namedLayers.get(name);
      this.activeLayerBounds = info ? { ...info.bounds } : null;
    } else {
      this.activeLayerBounds = null;
    }
    this.drawOverlayMask();
  }

  // Draw a dark translucent mask everywhere outside activeLayerBounds
  private drawOverlayMask() {
    this.overlayMask.clear();
    if (!this.activeLayerBounds) return;

    const tw = 16 * this.SCALE;
    const th = 16 * this.SCALE;
    const { x, y, width, height } = this.activeLayerBounds;
    const fullW = this.CANVAS_WIDTH * tw;
    const fullH = this.CANVAS_HEIGHT * th;

    this.overlayMask.fillStyle(0x000000, 0.5);
    // top
    this.overlayMask.fillRect(0, 0, fullW, y * th);
    // bottom
    this.overlayMask.fillRect(
      0,
      (y + height) * th,
      fullW,
      fullH - (y + height) * th,
    );
    // left
    this.overlayMask.fillRect(0, y * th, x * tw, height * th);
    // right
    this.overlayMask.fillRect(
      (x + width) * tw,
      y * th,
      fullW - (x + width) * tw,
      height * th,
    );
  }

  async putFeatureAtSelection(
    generatedData: completedSection,
    worldOverride = false,
    acceptneg = false,
    undoing = false,
  ) {
    //console.groupCollapsed(`Placing: ${generatedData.name} (Override: ${worldOverride}, Undo: ${acceptneg}, AllowOverwrite: ${this.allowOverwriting})`);

    let startX = 0;
    let startY = 0;
    const changed: { x: number; y: number }[] = [];

    if (!worldOverride) {
      if (
        this.selectionStart &&
        this.selectionEnd &&
        (this.selectionStart.x !== this.selectionEnd.x ||
          this.selectionStart.y !== this.selectionEnd.y ||
          this.isSelecting ||
          this.selectedTiles.dimensions.width > 0)
      ) {
        startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
        startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
      } else {
        this.clearSelection();
      }
    }

    if (!acceptneg) {
      this.LastData = {
        name: "Undo State",
        description: "Previous map feature state",
        grid: [],
        points_of_interest: new Map(),
      };
      const currentTiles =
        this.featureLayer?.getTilesWithin(
          0,
          0,
          this.CANVAS_WIDTH,
          this.CANVAS_HEIGHT,
        ) || [];
      this.LastData.grid = Array(this.CANVAS_HEIGHT)
        .fill(0)
        .map(() => Array(this.CANVAS_WIDTH).fill(-1));
      currentTiles.forEach((tile) => {
        if (tile.index !== -1) {
          if (
            tile.y >= 0 &&
            tile.y < this.CANVAS_HEIGHT &&
            tile.x >= 0 &&
            tile.x < this.CANVAS_WIDTH
          ) {
            this.LastData.grid[tile.y][tile.x] = tile.index;
          }
        }
      });

      for (const info of this.namedLayers.values()) {
        const { x: lx, y: ly, width: w, height: h } = info.bounds;
        // Loop over that layer’s entire rectangle
        for (let localY = 0; localY < h; localY++) {
          for (let localX = 0; localX < w; localX++) {
            const t = info.layer.getTileAt(localX, localY);
            if (t && t.index >= 0) {
              // Compute world‐coords and copy into LastData.grid
              const worldX = lx + localX;
              const worldY = ly + localY;
              this.LastData.grid[worldY][worldX] = t.index;
            }
          }
        }
      }
    }

    const gridToPlace = generatedData.grid;
    const gridHeight = gridToPlace.length;
    const gridWidth = gridHeight > 0 ? (gridToPlace[0]?.length ?? 0) : 0;

    if (!this.featureLayer) {
      console.error("Feature layer is missing, cannot place tiles.");
      // console.groupEnd();
      return;
    }
    if (gridWidth === 0 || gridHeight === 0) {
      console.groupEnd();
      return;
    }

    // Placement Logic
    for (let yOffset = 0; yOffset < gridHeight; yOffset++) {
      for (let xOffset = 0; xOffset < gridWidth; xOffset++) {
        const placeX = startX + xOffset;
        const placeY = startY + yOffset;

        if (
          placeX < 0 ||
          placeX >= this.CANVAS_WIDTH ||
          placeY < 0 ||
          placeY >= this.CANVAS_HEIGHT
        ) {
          continue;
        }

        const newTileIndex = gridToPlace[yOffset]?.[xOffset];
        if (newTileIndex === undefined) {
          continue;
        }

        // Clear
        if (acceptneg && newTileIndex === -2) {
          this.featureLayer?.putTileAt(-1, placeX, placeY);
          console.log("deleted a tile at", placeX, placeY);
          for (const info of this.namedLayers.values()) {
            const b = info.bounds;
            if (
              placeX >= b.x &&
              placeX < b.x + b.width &&
              placeY >= b.y &&
              placeY < b.y + b.height
            ) {
              const localX = placeX - b.x;
              const localY = placeY - b.y;
              info.layer?.putTileAt(-1, localX, localY);
            }
          }
          changed.push({ x: placeX, y: placeY });
          continue;
        }

        // Skip empty tiles
        if (newTileIndex === -1 && !undoing) {
          continue;
        }

        // Check if we should place in active layer first
        let placedInLayer = false;

        if (this.activeLayerBounds && newTileIndex >= 0) {
          const b = this.activeLayerBounds;
          if (
            placeX >= b.x &&
            placeX < b.x + b.width &&
            placeY >= b.y &&
            placeY < b.y + b.height
          ) {
            // Find the named layer that matches the active layer bounds
            for (const [, info] of this.namedLayers.entries()) {
              if (
                info.bounds.x === b.x &&
                info.bounds.y === b.y &&
                info.bounds.width === b.width &&
                info.bounds.height === b.height
              ) {
                const localX = placeX - b.x;
                const localY = placeY - b.y;
                // Remove any existing tile in this position
                info.layer.removeTileAt(localX, localY);
                // Place the new tile
                info.layer.putTileAt(newTileIndex, localX, localY);
                changed.push({ x: placeX, y: placeY });
                placedInLayer = true;
                break;
              }
            }
          }
        }

        // If already placed in active layer, continue to next tile
        if (placedInLayer) {
          continue;
        }

        // Try to place in any named layer that contains this position
        if (newTileIndex >= 0) {
          for (const info of this.namedLayers.values()) {
            const b = info.bounds;
            if (
              placeX >= b.x &&
              placeX < b.x + b.width &&
              placeY >= b.y &&
              placeY < b.y + b.height
            ) {
              const localX = placeX - b.x;
              const localY = placeY - b.y;
              const existingTile = info.layer.getTileAt(localX, localY);
              const existingTileIndex = existingTile ? existingTile.index : -1;

              if (existingTileIndex === -1 || this.allowOverwriting) {
                const newPriority = this.getTilePriority(newTileIndex);
                const currentPriority = this.getTilePriority(existingTileIndex);

                if (newPriority >= currentPriority || undoing) {
                  info.layer.putTileAt(newTileIndex, localX, localY);
                  changed.push({ x: placeX, y: placeY });
                  placedInLayer = true;
                  break; // Only place in one named layer
                }
              }
            }
          }
        }

        // If already placed in a named layer, continue to next tile
        if (placedInLayer) {
          continue;
        }

        // If not placed in any named layer, try the feature layer as fallback
        // get from flattened layers to check what's already there
        const currentTile = this.GetFlattenedTileMap()[placeY]?.[placeX];
        const currentTileIndex = currentTile !== undefined ? currentTile : -1;

        if (this.allowOverwriting) {
          const newPriority = this.getTilePriority(newTileIndex);
          const currentPriority = this.getTilePriority(currentTileIndex);

          if (newPriority >= currentPriority || undoing) {
            this.featureLayer?.putTileAt(newTileIndex, placeX, placeY);
            if (undoing) {
              // When undoing, clear any overlapping tiles in named layers
              for (const info of this.namedLayers.values()) {
                const b = info.bounds;
                if (
                  placeX >= b.x &&
                  placeX < b.x + b.width &&
                  placeY >= b.y &&
                  placeY < b.y + b.height
                ) {
                  const localX = placeX - b.x;
                  const localY = placeY - b.y;
                  info.layer.removeTileAt(localX, localY);
                }
              }
            }
            changed.push({ x: placeX, y: placeY });
          }
        } else {
          if (currentTileIndex === -1) {
            this.featureLayer?.putTileAt(newTileIndex, placeX, placeY);
            if (undoing) {
              for (const info of this.namedLayers.values()) {
                const b = info.bounds;
                if (
                  placeX >= b.x &&
                  placeX < b.x + b.width &&
                  placeY >= b.y &&
                  placeY < b.y + b.height
                ) {
                  const localX = placeX - b.x;
                  const localY = placeY - b.y;
                  info.layer.removeTileAt(localX, localY);
                }
              }
            }
            changed.push({ x: placeX, y: placeY });
          }
        }
      }
    }
    this.pruneBrokenTrees(changed);

    if (
      this.AUTOLAYER &&
      generatedData.name !== "Undo State" &&
      generatedData.name !== "ClearBox"
    ) {
      console.groupCollapsed(`Auto-layering: ${generatedData.name}`);
      // Compute selection bounds
      const w = gridWidth;
      const h = gridHeight;
      if (changed.length > 0) {
        // Try to find an existing layer with identical bounds
        let existingInfo:
          | {
              layer: Phaser.Tilemaps.TilemapLayer;
              bounds: { x: number; y: number; width: number; height: number };
            }
          | undefined;
        for (const info of this.namedLayers.values()) {
          if (
            info.bounds.x === startX &&
            info.bounds.y === startY &&
            info.bounds.width === w &&
            info.bounds.height === h
          ) {
            existingInfo = info;
            break;
          }
        }

        if (existingInfo) {
          // Move new tiles from featureLayer into the existing layer
          changed.forEach(({ x, y }) => {
            const relX = x - existingInfo!.bounds.x;
            const relY = y - existingInfo!.bounds.y;
            const idx = this.featureLayer.getTileAt(x, y)?.index ?? -1;
            if (idx >= 0) {
              existingInfo!.layer.putTileAt(idx, relX, relY);
              this.featureLayer.removeTileAt(x, y);
            }
          });
        } else {
          // No existing layer: create a new auto-named layer with generated name
          const autoName = await Tree.createLayerName(chatHistory, w, h);
          this.nameSelection(autoName);
        }
      }
      console.groupEnd();
    }
  }

  pruneBrokenTrees(changed?: { x: number; y: number }[]): void {
    if (!this.featureLayer) return;

    const EXPANSION = 2; // Expand the search area by this many tiles

    let minX = 0;
    let minY = 0;
    let maxX = this.featureLayer.layer.width - 1;
    let maxY = this.featureLayer.layer.height - 1;
    //const time = performance.now();
    //let tilesScanned = 0;

    if (changed && changed.length) {
      const xs = changed.map((c) => c.x);
      const ys = changed.map((c) => c.y);
      minX = Math.max(0, Math.min(...xs) - EXPANSION);
      minY = Math.max(0, Math.min(...ys) - EXPANSION);
      maxX = Math.min(
        this.featureLayer.layer.width - 1,
        Math.max(...xs) + EXPANSION,
      );
      maxY = Math.min(
        this.featureLayer.layer.height - 1,
        Math.max(...ys) + EXPANSION,
      );
    }

    const toRemove: { x: number; y: number }[] = [];

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const tile = this.featureLayer.getTileAt(x, y);
        //tilesScanned++;
        if (!tile) continue;

        const rules = MULTI_TILE_NEIGHBOUR_RULES.get(tile.index);
        if (!rules) continue;

        const broken = rules.some(({ dx, dy, expected }) => {
          const n = this.featureLayer.getTileAt(x + dx, y + dy);
          return !n || n.index !== expected;
        });

        if (broken) toRemove.push({ x, y });
      }
    }

    toRemove.forEach(({ x, y }) => this.featureLayer!.putTileAt(-1, x, y));
    //const timeTaken = performance.now() - time;
    //console.log(`Pruned ${toRemove.length} tiles in ${timeTaken.toFixed(2)} ms (${tilesScanned} tiles scanned)`);
  }

  highlightTile(pointer: Phaser.Input.Pointer): void {
    // Convert screen coordinates to tile coordinates
    const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
    const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

    // Only highlight if within map bounds
    if (x >= 0 && x < this.CANVAS_WIDTH && y >= 0 && y < this.CANVAS_HEIGHT) {
      if (this.isPlacingMode) {
        this.drawHighlightBox(x, y, 0xffff00); // Yellow outline
      } else {
        this.drawHighlightBox(x, y, 0xff0000); // Red outline
      }
    } else {
      // Clear highlight if out of bounds
      this.highlightBox.clear();
    }
  }

  drawHighlightBox(x: number, y: number, color: number): void {
    // Clear any previous highlights
    this.highlightBox.clear();

    // Set the style for the highlight (e.g., semi-transparent yellow)
    this.highlightBox.fillStyle(color, 0.5);
    this.highlightBox.lineStyle(2, color, 1);

    // Draw a rectangle around the hovered tile
    this.highlightBox.strokeRect(
      x * 16 * this.SCALE,
      y * 16 * this.SCALE,
      16 * this.SCALE,
      16 * this.SCALE,
    );

    // Optionally, you can fill the tile with a semi-transparent color to highlight it
    this.highlightBox.fillRect(
      x * 16 * this.SCALE,
      y * 16 * this.SCALE,
      16 * this.SCALE,
      16 * this.SCALE,
    );
  }

  // to be used in main to select tiles via buttons
  setSelectedTileId(id: number) {
    this.selectedTileId = id;
    console.log("Selected tile ID:", id);
  }
  //TODO: THIS IS STUPID, FIX THIS LATER - Thomas
  //flatten all of the layers into a single array of tile IDs
  public GetFlattenedTileMap(): number[][] {
    const flattened: number[][] = Array(this.CANVAS_HEIGHT)
      .fill(null)
      .map(() => Array(this.CANVAS_WIDTH).fill(-1));

    if (this.grassLayer) {
      for (let y = 0; y < this.CANVAS_HEIGHT; y++) {
        for (let x = 0; x < this.CANVAS_WIDTH; x++) {
          const tile = this.grassLayer.getTileAt(x, y);
          if (tile && tile.index !== -1) {
            flattened[y][x] = tile.index;
          }
        }
      }
    }

    if (this.featureLayer) {
      for (let y = 0; y < this.CANVAS_HEIGHT; y++) {
        for (let x = 0; x < this.CANVAS_WIDTH; x++) {
          const tile = this.featureLayer.getTileAt(x, y);
          if (tile && tile.index !== -1) {
            flattened[y][x] = tile.index;
          }
        }
      }
    }

    for (const [, info] of this.namedLayers.entries()) {
      const { x: layerX, y: layerY, width, height } = info.bounds;

      for (let localY = 0; localY < height; localY++) {
        for (let localX = 0; localX < width; localX++) {
          const worldX = layerX + localX;
          const worldY = layerY + localY;

          if (
            worldX < 0 ||
            worldX >= this.CANVAS_WIDTH ||
            worldY < 0 ||
            worldY >= this.CANVAS_HEIGHT
          ) {
            continue;
          }

          const tile = info.layer.getTileAt(localX, localY);
          if (tile && tile.index !== -1) {
            flattened[worldY][worldX] = tile.index;
          }
        }
      }
    }

    return flattened;
  }

  public loadMapFromJSON(mapData: number[][]): void {
    if (this.featureLayer) {
      this.featureLayer.forEachTile((tile) => {
        this.featureLayer.removeTileAt(tile.x, tile.y);
      });
    }

    this.namedLayers.forEach((info) => {
      info.layer.destroy(true);
    });
    this.namedLayers.clear();

    this.layerTree = new Tree(
      "Root",
      [
        [0, 0],
        [this.CANVAS_WIDTH, this.CANVAS_HEIGHT],
      ],
      this.CANVAS_WIDTH,
      this.CANVAS_HEIGHT,
    );

    this.clearSelection();
    this.clearLayerHighlights();

    for (let y = 0; y < Math.min(mapData.length, this.CANVAS_HEIGHT); y++) {
      for (let x = 0; x < Math.min(mapData[y].length, this.CANVAS_WIDTH); x++) {
        const tileId = mapData[y][x];
        if (tileId > 3) {
          //Actual tiles
          this.featureLayer.putTileAt(tileId, x, y);
        } else if (tileId >= 0 && tileId < 3) {
          //Grass tiles
          this.grassLayer.putTileAt(tileId, x, y);
        }
      }
    }

    console.log("Map loaded from JSON data");

    this.resetView();
  }
}

export function createGame(attachPoint: HTMLDivElement) {
  const config = {
    type: Phaser.AUTO,
    width: 640,
    height: 400,
    parent: attachPoint,
    scene: [Preload, TinyTownScene],
  };

  return new Phaser.Game(config);
}
