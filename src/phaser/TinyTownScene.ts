import Phaser from 'phaser';
import { sendSystemMessage } from '../modelChat/chatbox';

import {Preload} from './Preload';
import {completedSection, generatorInput} from "./featureGenerators/GeneratorInterface.ts";
import { WorldFactsDatabaseMaker } from './WorldFactsDatabaseMaker.ts';

interface TinyTownSceneData {
    dict: { [key: number]: string };
}

const TILE_PRIORITY = {
    HOUSE: 4,
    FENCE: 3,
    DECOR: 2,
    FOREST: 1,
    GRASS: 0,
    EMPTY: -1
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
  
    addRules(MULTI_TILE_TREES.single.green, [{ x: 0, y: 0 }, { x: 0, y: 1 }]);
    addRules(MULTI_TILE_TREES.single.yellow, [{ x: 0, y: 0 }, { x: 0, y: 1 }]);
  
    const squarePos = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ];
    addRules(MULTI_TILE_TREES.stack1.green, squarePos);
    addRules(MULTI_TILE_TREES.stack1.yellow, squarePos);
  
    const crossPos = [
      { x: 0, y: 0 },   // top 
      { x: 0, y: 1 },   // mid 
      { x: 0, y: 2 },   // bottom 
      { x: -1, y: 1 },  // left 
      { x: 1, y: 1 },   // right 
    ];
    addRules(MULTI_TILE_TREES.stack2.green, crossPos);
    addRules(MULTI_TILE_TREES.stack2.yellow, crossPos);
  
    return map;
};
  
const MULTI_TILE_NEIGHBOUR_RULES = buildNeighbourRules();

export class TinyTownScene extends Phaser.Scene {

    private readonly SCALE = 1;
    public readonly CANVAS_WIDTH = 40;  //Size in tiles
    public readonly CANVAS_HEIGHT = 25; // ^^^
    public readonly TILE_SIZE = 16; //Size in pixels
    
    // Three constant layers (editing lenses)
    private layer1!: Phaser.Tilemaps.TilemapLayer;
    private layer2!: Phaser.Tilemaps.TilemapLayer;
    private layer3!: Phaser.Tilemaps.TilemapLayer;

    // Active layer index (1, 2, or 3)
    public activeLayerIndex: number = 1;

    // Selection box color depends on active layer
    private selectionColor: number = 0xFF5555; // default for layer 1

    private updateSelectionColor(): void {
        if (this.activeLayerIndex === 1) this.selectionColor = 0xFF5555; // red
        else if (this.activeLayerIndex === 2) this.selectionColor = 0x3E7BFF; // blue
        else this.selectionColor = 0x2ECC71; // green
    }

    //highlight box
    private highlightBox!: Phaser.GameObjects.Graphics;

    // selection box properties
    private selectionBox!: Phaser.GameObjects.Graphics;
    public selectionStart!: Phaser.Math.Vector2;
    public selectionEnd!: Phaser.Math.Vector2;
    private isSelecting: boolean = false;
    private selectedTiles: {
        coordinates: { x: number; y: number }[];  
        dimensions: { width: number; height: number };
        grid: number[][];
      } = {
        coordinates: [],
        dimensions: { width: 0, height: 0 },
        grid: []
      };

    private wf: WorldFactsDatabaseMaker | null = null;
    private paragraphDescription: string = '';

    // set of tile indexes used for tile understanding
    private selectedTileSet = new Set<number>();
    public tileDictionary!: { [key: number]: string };

    public LastData: completedSection = {
        name: 'DefaultSelection',
        description: 'Full Default',
        grid: [],
        points_of_interest: new Map(),
    };

    constructor() {
        super('TinyTown');
    }

    init(data: TinyTownSceneData) {
        console.log(data);
        this.tileDictionary = data.dict;
        console.log(this.tileDictionary);
    }

    preload() {
        this.load.image(
            'tiny_town_tiles',
            'phaserAssets/Tilemap_Extruded.png',
        );
        
    }

    create() {
        const stripeSize = 64;
        const stripeThickness = 16;

        const g = this.make.graphics();
        g.fillStyle(0x000000, 1);
        g.fillRect(0, 0, stripeSize, stripeSize);

        g.lineStyle(stripeThickness, 0xb92d2e, 1);
        g.strokeLineShape(new Phaser.Geom.Line(0, stripeSize, stripeSize, 0));
        g.generateTexture('stripePattern', stripeSize, stripeSize);
        g.destroy();
        
        const stripes = this.add
        .tileSprite(0, 0, this.cameras.main.width, this.cameras.main.height, 'stripePattern')
        .setOrigin(0)
        .setScrollFactor(0)
        .setDepth(-100);

        this.scale.on('resize', (gameSize: Phaser.Structs.Size) => {
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
        const tileSheet = map.addTilesetImage("tiny_town_tiles", "tiny_town_tiles", 16, 16, 1, 2)!;

        this.layer1 = map.createBlankLayer('layer-1', tileSheet, 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT)!;
        this.layer1.setScale(this.SCALE);

        this.layer2 = map.createBlankLayer('layer-2', tileSheet, 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT)!;
        this.layer2.setScale(this.SCALE);

        this.layer3 = map.createBlankLayer('layer-3', tileSheet, 0, 0, this.CANVAS_WIDTH, this.CANVAS_HEIGHT)!;
        this.layer3.setScale(this.SCALE);

        // Fill layer 1 with grass tiles
        for (let y = 0; y < this.CANVAS_HEIGHT; y++) {
            for (let x = 0; x < this.CANVAS_WIDTH; x++) {
                this.layer1.putTileAt(Phaser.Math.Between(0, 2), x, y);
            }
        }
        
        // Setup selection box
        this.selectionBox = this.add.graphics();
        this.selectionBox.setDepth(100);
        this.updateSelectionColor();
        // Input handlers
        this.input.on('pointermove', this.updateSelection, this);
        this.input.on('pointerupoutside', this.endSelection, this);
        this.input.on('pointerup', this.endSelection, this);

        
      
        //highlight box
        this.highlightBox = this.add.graphics();
        this.highlightBox.setDepth(101);  // Ensure it's on top of everything

        // Setup pointer movement
        this.input.on('pointermove', this.highlightTile, this);

        // Handle selection box
        this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
            this.startSelection(pointer);
        });
    }

    startSelection(pointer: Phaser.Input.Pointer): void {
        // Convert screen coordinates to tile coordinates
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
        const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));
        
        if (x < 0 || x >= this.CANVAS_WIDTH || y < 0 || y >= this.CANVAS_HEIGHT) {
            return;
        }

        // Begin the selection
        this.isSelecting = true;
        this.selectionStart = new Phaser.Math.Vector2(x, y);
        this.selectionEnd   = new Phaser.Math.Vector2(x, y);
        this.drawSelectionBox();
    }
    setSelectionCoordinates(x: number, y: number, w: number, h: number): void {
        const endX = x + w - 1;
        const endY = y + h - 1;

        if (w >= 1 && h >= 1 &&
            x >= 0 && x < this.CANVAS_WIDTH &&
            y >= 0 && y < this.CANVAS_HEIGHT &&
            endX >= 0 && endX < this.CANVAS_WIDTH &&
            endY >= 0 && endY < this.CANVAS_HEIGHT)
        {
            this.isSelecting = true;
            this.selectionStart = new Phaser.Math.Vector2(x, y);

            this.selectionEnd = new Phaser.Math.Vector2(endX, endY);
            this.drawSelectionBox();
            
            this.endSelection();
        } else {
            console.warn(`Invalid selection coordinates provided: x=${x}, y=${y}, w=${w}, h=${h}. Selection not set.`);
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
        
        this.wf = new WorldFactsDatabaseMaker(this.selectedTiles.grid, this.selectedTiles.dimensions.width, this.selectedTiles.dimensions.height, this.TILE_SIZE);
		this.wf.getWorldFacts();

		this.paragraphDescription = this.wf.getDescriptionParagraph();
		console.log(this.paragraphDescription);
        this.wf.printWorldFacts()

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
                y: endY - y // Flip y-axis relative to bottom-left
            };
        };

        let selectionMessage: string;

        if (startX === endX && startY === endY) {
            const { x: localX, y: localY } = toSelectionCoordinates(startX, startY);
            selectionMessage = `User has selected a single tile at (${localX}, ${localY}) relative to the bottom-left of the selection box.`;
        } else {
            if (this.paragraphDescription!=''){
                selectionMessage =
                `User has selected a rectangular region that is this size: ${selectionWidth}x${selectionHeight}. Here are the global coordinates for the selection box: [${startX}, ${startY}] to [${endX}, ${endY}].` +
                `This is the description of the selection, this is only for context purposes and to help you understand what is selected: ${this.paragraphDescription}` +
                `Doors are connection points / points of interest for you to connect paths with.` +
                `Be sure to re-explain what is in the selection box. If there are objects in the selection, specify the characteristics of the object. ` +
                `If no objects are inside the selection, then do not mention anything else.`;
            }else{
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
        this.selectionBox.fillStyle(this.selectionColor, 0.3);
        this.selectionBox.fillRect(
            startX * 16 * this.SCALE, 
            startY * 16 * this.SCALE, 
            (endX - startX + 1) * 16 * this.SCALE, 
            (endY - startY + 1) * 16 * this.SCALE
        );

        // Draw a dashed border
        this.selectionBox.lineStyle(2, this.selectionColor, 1);
        this.selectionBox.beginPath();
        const dashLength = 8; // Length of each dash
        const gapLength = 4;  // Length of each gap

        // Top border
        for (let i = 0; i < width * 16 * this.SCALE; i += dashLength + gapLength) {
            this.selectionBox.moveTo(startX * 16 * this.SCALE + i, startY * 16 * this.SCALE);
            this.selectionBox.lineTo(
                Math.min(startX * 16 * this.SCALE + i + dashLength, endX * 16 * this.SCALE + 16 * this.SCALE),
                startY * 16 * this.SCALE
            );
        }

        // Bottom border
        for (let i = 0; i < width * 16 * this.SCALE; i += dashLength + gapLength) {
            this.selectionBox.moveTo(startX * 16 * this.SCALE + i, endY * 16 * this.SCALE + 16 * this.SCALE);
            this.selectionBox.lineTo(
                Math.min(startX * 16 * this.SCALE + i + dashLength, endX * 16 * this.SCALE + 16 * this.SCALE),
                endY * 16 * this.SCALE + 16 * this.SCALE
            );
        }

        // Left border
        for (let i = 0; i < height * 16 * this.SCALE; i += dashLength + gapLength) {
            this.selectionBox.moveTo(startX * 16 * this.SCALE, startY * 16 * this.SCALE + i);
            this.selectionBox.lineTo(
                startX * 16 * this.SCALE,
                Math.min(startY * 16 * this.SCALE + i + dashLength, endY * 16 * this.SCALE + 16 * this.SCALE)
            );
        }

        // Right border
        for (let i = 0; i < height * 16 * this.SCALE; i += dashLength + gapLength) {
            this.selectionBox.moveTo(endX * 16 * this.SCALE + 16 * this.SCALE, startY * 16 * this.SCALE + i);
            this.selectionBox.lineTo(
                endX * 16 * this.SCALE + 16 * this.SCALE,
                Math.min(startY * 16 * this.SCALE + i + dashLength, endY * 16 * this.SCALE + 16 * this.SCALE)
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
          grid: Array(height).fill(0).map(() => Array(width).fill(-1))
        };
        this.selectedTileSet.clear();
        
        // Get the active layer
        const activeLayer = this.activeLayerIndex === 1 ? this.layer1 : 
                           this.activeLayerIndex === 2 ? this.layer2 : this.layer3;
        
        // Populate coordinates and tile IDs from active layer
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const worldX = startX + x;
                const worldY = startY + y;
                
                // Add to coordinates array 
                this.selectedTiles.coordinates.push({ x: worldX, y: worldY });
                
                // Get tile ID from active layer
                const tile = activeLayer.getTileAt(worldX, worldY);
                const tileId = tile ? tile.index : -1;
                this.selectedTiles.grid[y][x] = tileId;
                
                if(tileId !== -1) {
                    this.selectedTileSet.add(tileId);
                }
            }  
        }
    }

    clearSelection(){
        this.isSelecting = false;
        this.selectionBox.clear();
        this.selectionStart = new Phaser.Math.Vector2(0, 0);
        this.selectionEnd = new Phaser.Math.Vector2(0, 0);
        this.selectedTiles = {
            coordinates: [],
            dimensions: { width: 0, height: 0 },
            grid: []
        };
        console.log('Selection cleared');
    }

    getSelection(): generatorInput {
        return {
            grid: this.selectedTiles.grid.map(row => [...row]),
            width: this.selectedTiles.dimensions.width,
            height: this.selectedTiles.dimensions.height,
        };
    }

    // Switch to a different editing layer (1, 2, or 3)
    public switchLayer(layerIndex: number) {
        if (layerIndex < 1 || layerIndex > 3) {
            console.warn(`Invalid layer index: ${layerIndex}. Must be 1, 2, or 3.`);
            return;
        }

        this.activeLayerIndex = layerIndex;
        this.updateSelectionColor();

        // Keep the selection rectangle, just recolor it
        // If you want switching layers to clear selection instead, call this.clearSelection() instead of drawSelectionBox().
        this.drawSelectionBox();

        console.log(`Switched to layer ${layerIndex}`);
        window.dispatchEvent(new CustomEvent('layerSwitched', { detail: layerIndex }));
    }

    getTilePriority(tileIndex: number): number {
        if (tileIndex === -1) {
            return TILE_PRIORITY.EMPTY; // -1
        }
        if ([44, 45, 46, 56, 58, 68, 69, 70].includes(tileIndex)) {
             return TILE_PRIORITY.FENCE; // 3
        }

        if ((tileIndex >= 48 && tileIndex <= 67) || (tileIndex >= 72 && tileIndex <= 91)) {
            return TILE_PRIORITY.HOUSE; // 4
        }

        if ( (tileIndex >= 3 && tileIndex <= 23) || (tileIndex >= 27 && tileIndex <= 35) ) {
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

    async putFeatureAtSelection(generatedData: completedSection, worldOverride = false, acceptneg = false, undoing = false) {
        let startX = 0;
        let startY = 0;
        const changed: { x: number; y: number }[] = [];

        if (!worldOverride) {
            if (this.selectionStart && this.selectionEnd && (this.selectionStart.x !== this.selectionEnd.x || this.selectionStart.y !== this.selectionEnd.y || this.isSelecting || this.selectedTiles.dimensions.width > 0)) {
                startX = Math.min(this.selectionStart.x, this.selectionEnd.x);
                startY = Math.min(this.selectionStart.y, this.selectionEnd.y);
            } else {
                this.clearSelection();
            }
        }

        // Store previous state for undo
        if (!acceptneg) {
            this.LastData = {
                name: 'Undo State',
                description: 'Previous map state',
                grid: this.GetFlattenedTileMap(),
                points_of_interest: new Map(),
            };
        }

        const gridToPlace = generatedData.grid;
        const gridHeight = gridToPlace.length;
        const gridWidth = gridHeight > 0 ? (gridToPlace[0]?.length ?? 0) : 0;

        if (gridWidth === 0 || gridHeight === 0) {
            return;
        }

        // Get the active layer to place tiles on
        const activeLayer = this.activeLayerIndex === 1 ? this.layer1 : 
                           this.activeLayerIndex === 2 ? this.layer2 : this.layer3;

        // Placement logic - only place on active layer
        for (let yOffset = 0; yOffset < gridHeight; yOffset++) {
            for (let xOffset = 0; xOffset < gridWidth; xOffset++) {
                const placeX = startX + xOffset;
                const placeY = startY + yOffset;

                if (placeX < 0 || placeX >= this.CANVAS_WIDTH || placeY < 0 || placeY >= this.CANVAS_HEIGHT) {
                    continue;
                }

                const newTileIndex = gridToPlace[yOffset]?.[xOffset];
                if (newTileIndex === undefined) {
                    continue;
                }

                // Clear tile if -2 and acceptneg
                if (acceptneg && newTileIndex === -2) {
                    activeLayer.putTileAt(-1, placeX, placeY);
                    changed.push({ x: placeX, y: placeY });
                    continue;
                }

                // Skip empty tiles unless undoing
                if (newTileIndex === -1 && !undoing) {
                    continue;
                }

                // Place tile on active layer
                activeLayer.putTileAt(newTileIndex, placeX, placeY);
                changed.push({ x: placeX, y: placeY });
            }
        }

        // Prune broken multi-tile structures
        this.pruneBrokenTrees(changed);
    }

    pruneBrokenTrees(changed?: { x: number; y: number }[]): void {
        // Get the active layer
        const activeLayer = this.activeLayerIndex === 1 ? this.layer1 : 
                           this.activeLayerIndex === 2 ? this.layer2 : this.layer3;
        if (!activeLayer) return;
    
        const EXPANSION = 2; // Expand the search area by this many tiles

        let minX = 0;
        let minY = 0;
        let maxX = this.CANVAS_WIDTH - 1;
        let maxY = this.CANVAS_HEIGHT - 1;
    
        if (changed && changed.length) {
            const xs = changed.map(c => c.x);
            const ys = changed.map(c => c.y);
            minX = Math.max(0, Math.min(...xs) - EXPANSION);
            minY = Math.max(0, Math.min(...ys) - EXPANSION);
            maxX = Math.min(this.CANVAS_WIDTH - 1, Math.max(...xs) + EXPANSION);
            maxY = Math.min(this.CANVAS_HEIGHT - 1, Math.max(...ys) + EXPANSION);
        }
    
        const toRemove: { x: number; y: number }[] = [];
    
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const tile = activeLayer.getTileAt(x, y);
                if (!tile) continue;
        
                const rules = MULTI_TILE_NEIGHBOUR_RULES.get(tile.index);
                if (!rules) continue;
        
                const broken = rules.some(({ dx, dy, expected }) => {
                    const n = activeLayer.getTileAt(x + dx, y + dy);
                    return !n || n.index !== expected;
                });
        
                if (broken) toRemove.push({ x, y });
            }
        }
    
        toRemove.forEach(({ x, y }) => activeLayer.putTileAt(-1, x, y));
    }

    highlightTile(pointer: Phaser.Input.Pointer): void {
        // Convert screen coordinates to tile coordinates
        const worldPoint = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
        const x: number = Math.floor(worldPoint.x / (16 * this.SCALE));
        const y: number = Math.floor(worldPoint.y / (16 * this.SCALE));

        // Only highlight if within map bounds
        if (x >= 0 && x < this.CANVAS_WIDTH && y >= 0 && y < this.CANVAS_HEIGHT) {
            this.drawHighlightBox(x, y, 0xFF0000); // Red outline
        } else {
            // Clear highlight if out of bounds
            this.highlightBox.clear();
        }
    }

    drawHighlightBox(x: number, y: number, color:number): void {
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
            16 * this.SCALE
        );

        // Optionally, you can fill the tile with a semi-transparent color to highlight it
        this.highlightBox.fillRect(
            x * 16 * this.SCALE, 
            y * 16 * this.SCALE, 
            16 * this.SCALE, 
            16 * this.SCALE
        );
    }

    //Merge all three layers with priority: Layer 3 > Layer 2 > Layer 1
    public GetFlattenedTileMap(): number[][] {
        const flattened: number[][] = Array(this.CANVAS_HEIGHT)
            .fill(null)
            .map(() => Array(this.CANVAS_WIDTH).fill(-1));
        
        // Start with layer 1
        for (let y = 0; y < this.CANVAS_HEIGHT; y++) {
            for (let x = 0; x < this.CANVAS_WIDTH; x++) {
                const tile = this.layer1.getTileAt(x, y);
                if (tile && tile.index !== -1) {
                    flattened[y][x] = tile.index;
                }
            }
        }
        
        // Overlay layer 2
        for (let y = 0; y < this.CANVAS_HEIGHT; y++) {
            for (let x = 0; x < this.CANVAS_WIDTH; x++) {
                const tile = this.layer2.getTileAt(x, y);
                if (tile && tile.index !== -1) {
                    flattened[y][x] = tile.index;
                }
            }
        }
        
        // Overlay layer 3
        for (let y = 0; y < this.CANVAS_HEIGHT; y++) {
            for (let x = 0; x < this.CANVAS_WIDTH; x++) {
                const tile = this.layer3.getTileAt(x, y);
                if (tile && tile.index !== -1) {
                    flattened[y][x] = tile.index;
                }
            }
        }
        
        return flattened;
    }    public loadMapFromJSON(mapData: number[][]): void {
        // Clear all three layers
        this.layer1.forEachTile((tile: Phaser.Tilemaps.Tile) => {
            this.layer1.removeTileAt(tile.x, tile.y);
        });
        this.layer2.forEachTile((tile: Phaser.Tilemaps.Tile) => {
            this.layer2.removeTileAt(tile.x, tile.y);
        });
        this.layer3.forEachTile((tile: Phaser.Tilemaps.Tile) => {
            this.layer3.removeTileAt(tile.x, tile.y);
        });
        
        this.clearSelection();
        
        // Load map data into layer1 (the base layer)
        for (let y = 0; y < Math.min(mapData.length, this.CANVAS_HEIGHT); y++) {
            for (let x = 0; x < Math.min(mapData[y].length, this.CANVAS_WIDTH); x++) {
                const tileId = mapData[y][x];
                if (tileId >= 0) {
                    this.layer1.putTileAt(tileId, x, y);
                }
            }
        }
        
        console.log('Map loaded from JSON data');
    }
}

export function createGame(attachPoint: HTMLDivElement) {
    const config = {
        type: Phaser.AUTO,
        width: 640,
        height: 400,
        parent: attachPoint,
        scene: [Preload, TinyTownScene]
    };

    return new Phaser.Game(config);
}
