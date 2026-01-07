/*
TO DO:
- store relative positions (maybe in {structure id, relativePos} format)
- rename QualPos to AbsPos
- edit paper to reflect the changes
*/

interface BoundingBox {
  topLeft: { minX: number; minY: number };
  bottomRight: { maxX: number; maxY: number };
}

interface TileColor {
  colorID: number;
  colorName: string;
  tileIDs: number[];
}

interface StructureType {
  name: string;
  tileIDs: number[];
  features?: Record<string, number[]>;
  substructures?: Record<string, number[]>;
}

interface Direction {
  x: number;
  y: number;
}

interface RelativePosition {
  otherName: string;
  relativePos: string;
}

interface Substructure {
  type: string;
  colors: string[];
}

class Structure {
  type: string;
  id: number;
  boundingBox: BoundingBox;
  absPosition: string;
  features: string[];
  substructures: Substructure[];
  colors: string[];
  relativePos: RelativePosition[];

  constructor(type: string, id: number, boundingBox: BoundingBox) {
    this.type = type;
    this.id = id;
    this.boundingBox = boundingBox;

    // For description generation
    this.absPosition = "";
    this.features = [];
    this.substructures = [];
    this.colors = [];
    this.relativePos = [];
  }
}

export class WorldFactsDatabaseMaker {
  TILE_COLORS: TileColor[] = [
    {
      colorID: 0,
      colorName: "red",
      tileIDs: [52, 53, 54, 55, 64, 65, 66, 67],
    },
    {
      colorID: 1,
      colorName: "yellow",
      tileIDs: [3, 9, 10, 11, 15, 21, 22, 27, 33, 34, 35],
    },
    {
      colorID: 2,
      colorName: "brown",
      tileIDs: [
        72, 73, 74, 75, 84, 85, 86, 87, 44, 45, 46, 47, 56, 58, 59, 68, 69, 70,
        71, 80, 81, 82,
      ],
    },
    {
      colorID: 3,
      colorName: "green",
      tileIDs: [3, 4, 5, 6, 7, 15, 16, 17, 18, 19, 27, 29, 30, 31],
    },
    {
      colorID: 4,
      colorName: "gray",
      tileIDs: [48, 49, 50, 51, 60, 61, 62, 63, 76, 77, 78, 79, 88, 89, 90, 91],
    },
  ];

  STRUCTURE_TYPES: StructureType[] = [
    {
      name: "house",
      tileIDs: [
        48, 49, 50, 51, 52, 53, 54, 55, 56, 61, 62, 63, 64, 65, 66, 67, 68, 73,
        74, 75, 76, 77, 78, 79, 80, 85, 86, 87, 88, 89, 90, 91,
      ],
      features: {
        archway: [74, 78],
        chimney: [51, 55],
        //dormer: [63, 67],
        door: [85, 86, 87, 88, 90, 91],
        window: [84, 88],
      },
      substructures: {
        roof: [
          48,
          49,
          50,
          51,
          52,
          60,
          61,
          62,
          63,
          64, // gray
          53,
          54,
          55,
          56,
          65,
          66,
          67, // red
        ],
      },
    },
    {
      name: "fence",
      tileIDs: [44, 45, 46, 47, 56, 57, 59, 68, 69, 70, 71, 80, 81, 82],
    },
    {
      name: "forest",
      tileIDs: [
        3, 4, 5, 6, 8, 9, 10, 11, 15, 16, 17, 18, 19, 20, 21, 22, 23, 27, 28,
        29, 30, 31, 32, 33, 34, 35, 106, 94,
      ],
      features: {
        log: [106],
        beehive: [94],
        mushroom: [29],
        sprout: [17],
      },
    },
  ];

  DIRECTIONS: Direction[] = [
    { x: 0, y: -1 }, // up
    { x: 0, y: 1 }, // down
    { x: -1, y: 0 }, // left
    { x: 1, y: 0 }, // right
  ];

  MIN_STRUCTURE_SIZE: number = 2; // in tiles

  mapData: number[][];
  mapWidth: number;
  mapHeight: number;
  structRange: number;
  structures: Structure[];

  constructor(
    mapData: number[][],
    mapWidth: number,
    mapHeight: number,
    structRange: number,
  ) {
    this.mapData = mapData;
    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    this.structRange = structRange;
    this.structures = [];
  }

  getWorldFacts(): void {
    // Populate
    console.log(this.mapData);
    this.structures = [];
    for (const type of this.STRUCTURE_TYPES) {
      for (const [index, positionArray] of this.getStructures(
        type.tileIDs,
      ).entries()) {
        let struct = new Structure(
          type.name,
          index,
          this.getBoundingBox(positionArray),
        );

        struct.absPosition = this.getStructureAbsPosition(positionArray);
        struct.features = this.getStructureFeatures(type, positionArray);
        if (type.substructures != null) {
          struct.substructures = this.getSubstructures(type, positionArray);
        }
        let basePosition = this.colorSeparation(type, positionArray);
        struct.colors = this.getColors(basePosition);

        this.structures.push(struct);
      }
    }

    // get relative positions and store
    for (let i = 0; i < this.structures.length; i++) {
      let struct = this.structures[i];
      for (let j = 0; j < this.structures.length; j++) {
        let otherID = this.structures[j].id;
        let otherName = this.structures[j].type;
        if (otherID == struct.id && otherName == struct.type) {
          continue;
        }

        otherName = otherName += otherID;

        let relativePos = this.getStructRelativePosition(
          this.structures[j],
          struct,
        ); // struct is to the DIR of this.structures[j]
        struct.relativePos.push({ otherName, relativePos });
      }
    }
  }

  getStructures(structureTiles: number[]): { x: number; y: number }[][] {
    const visitedTiles = Array.from({ length: this.mapData.length }, () =>
      Array(this.mapData[0].length).fill(false),
    );
    const structures: { x: number; y: number }[][] = [];

    for (let y = 0; y < this.mapData.length; y++) {
      for (let x = 0; x < this.mapData[0].length; x++) {
        // Skip if empty or already visited tiles
        if (this.mapData[y][x] === 0 || visitedTiles[y][x]) continue;
        // Flood fill to find connected structure
        const structure = this.floodFill(x, y, visitedTiles, structureTiles);

        // Store structure if it meets criteria
        if (structure.length > this.MIN_STRUCTURE_SIZE) {
          structures.push(structure);
        }
      }
    }

    return structures;
  }

  floodFill(
    startX: number,
    startY: number,
    visitedTiles: boolean[][],
    structureTiles: number[],
  ): { x: number; y: number }[] {
    const structure: { x: number; y: number }[] = [];
    const stack = [{ x: startX, y: startY }];

    while (stack.length > 0) {
      const { x, y } = stack.pop()!;

      // Skip if:
      if (
        x < 0 ||
        y < 0 ||
        x >= this.mapData[0].length ||
        y >= this.mapData.length || // out of bounds
        visitedTiles[y][x] || // already visited tile
        structureTiles.findIndex((elem) => elem === this.mapData[y][x]) === -1 // tile is not a structure tile
      ) {
        continue;
      }

      // Mark as visited and add to structure
      visitedTiles[y][x] = true;
      structure.push({ x, y });

      // Add neighbors to stack
      for (const dir of this.DIRECTIONS) {
        const nx = x + dir.x;
        const ny = y + dir.y;
        stack.push({ x: nx, y: ny });
      }
    }

    return structure;
  }

  getBoundingBox(structure: { x: number; y: number }[]): BoundingBox {
    let minX: number = structure[0].x;
    let maxX: number = structure[0].x;
    let minY: number = structure[0].y;
    let maxY: number = structure[0].y;

    for (const { x, y } of structure) {
      if (x < minX) minX = x;
      else if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      else if (y > maxY) maxY = y;
    }

    return {
      topLeft: { minX, minY },
      bottomRight: { maxX, maxY },
    };
  }

  // ----- DESCRIPTION GENERATION -----//
  // TODO: make a QnA version

  getDescriptionParagraph(): string {
    let par: string = "";

    for (let i = 0; i < this.structures.length; i++) {
      let struct = this.structures[i];

      // Initial identification
      if (i == 0) {
        par += "There is a";
      } else {
        let relativePos = this.getStructRelativePosition(
          this.structures[i - 1],
          struct,
        );
        par +=
          " To the" +
          relativePos +
          " of that " +
          this.structures[i - 1].type +
          ", there is a";
      }

      // Structure color
      for (let j = 0; j < struct.colors.length; j++) {
        par += " " + struct.colors[j];
        if (j < struct.colors.length - 1) {
          par += " and";
        }
      }

      par += " " + struct.type;
      par += " at the " + struct.absPosition + " of the selection box";

      let topx = struct.boundingBox.topLeft.minX;
      let topy = struct.boundingBox.topLeft.minY;
      let bottomx = struct.boundingBox.bottomRight.maxX;
      let bottomy = struct.boundingBox.bottomRight.maxY;
      par += ` (selection box coordinates: (${topx}, ${topy}) to (${bottomx}, ${bottomy}))`;
      let width =
        struct.boundingBox.bottomRight.maxX - struct.boundingBox.topLeft.minX;
      let height =
        struct.boundingBox.bottomRight.maxY - struct.boundingBox.topLeft.minY;
      par += ` with a size of ${width}×${height}`;
      // Substructures
      let hasSubstructures = false;
      for (let j = 0; j < struct.substructures.length; j++) {
        hasSubstructures = true;
        if (j == 0) {
          par += " with a ";
        }

        par +=
          struct.substructures[j].colors + " " + struct.substructures[j].type;
        if (j == struct.substructures.length - 2) {
          par += ", and ";
        } else if (j < struct.substructures.length - 1) {
          par += ", a ";
        }
      }

      // Features
      for (let j = 0; j < struct.features.length; j++) {
        if (j == 0 && !hasSubstructures) {
          par += " with ";
        } else if (j == 0 && hasSubstructures) {
          par += ", ";
        }

        par += struct.features[j];
        if (j == struct.features.length - 2) {
          par += ", and ";
        } else if (j < struct.features.length - 1) {
          par += ", ";
        }
      }
      par += ". ";
    }

    return par;
  }

  getStructRelativePosition(
    prevStruct: Structure,
    newStruct: Structure,
  ): string {
    let relativePos = "";
    // if the new structure is above the previous
    if (
      newStruct.boundingBox.topLeft.minY < prevStruct.boundingBox.topLeft.minY
    ) {
      relativePos += " top";
    } else if (
      newStruct.boundingBox.topLeft.minY > prevStruct.boundingBox.topLeft.minY
    ) {
      relativePos += " bottom";
    }

    if (
      newStruct.boundingBox.topLeft.minX > prevStruct.boundingBox.topLeft.minX
    ) {
      relativePos += " right";
    } else if (
      newStruct.boundingBox.topLeft.minX < prevStruct.boundingBox.topLeft.minX
    ) {
      relativePos += " left";
    }

    return relativePos;
  }

  getStructureAbsPosition(positions: { x: number; y: number }[]): string {
    return this.getMapZone(positions[0]);
  }

  getStructureFeatures(
    type: StructureType,
    positions: { x: number; y: number }[],
  ): string[] {
    let features = type.features!;
    let structFeaturesList: string[] = [];

    for (let featureType in features) {
      let featureCount: number = 0;
      let featureCoords: string[] = [];

      for (let { x, y } of positions) {
        if (features[featureType].includes(this.mapData[y][x])) {
          featureCount++;
          if (featureType === "door") {
            featureCoords.push(`(${x}, ${y})`);
          }
        }
      }

      if (featureCount > 0) {
        let featureLabel = featureType;
        if (featureCount > 1) {
          featureLabel += "s";
        }

        let featureString = `${featureCount} ${featureLabel}`;
        if (featureType === "door") {
          featureString += ` at ${featureCoords.join(", ")}`;
        }

        structFeaturesList.push(featureString);
      }
    }

    return structFeaturesList;
  }

  getSubstructures(
    type: StructureType,
    positions: { x: number; y: number }[],
  ): Substructure[] {
    let substructures = type.substructures!;
    let substructList: Substructure[] = [];
    let substructPositions: { x: number; y: number }[] = [];

    for (let substructType in substructures) {
      for (let { x, y } of positions) {
        // check for a substructure tile at each position (coord)
        if (substructures[substructType].includes(this.mapData[y][x])) {
          substructPositions.push({ x, y });
        }
      }

      const substruct: Substructure = {
        type: substructType,
        colors: [],
      };
      substructList.push(substruct);
    }

    for (let i = 0; i < substructList.length; i++) {
      substructList[i].colors = this.getColors(substructPositions);
    }

    return substructList;
  }

  getColors(positions: { x: number; y: number }[]): string[] {
    let color1: string = "";
    let color2: string = "";
    let colorsCount: number[] = [];

    // init colorsCount
    for (let i = 0; i < this.TILE_COLORS.length; i++) {
      colorsCount[i] = 0;
    }

    for (let { x, y } of positions) {
      for (const color of this.TILE_COLORS) {
        if (color.tileIDs.includes(this.mapData[y][x])) {
          colorsCount[color.colorID] += 1;
        }
      }
    }

    let maxColorIndex = 0;
    maxColorIndex = this.getMaxColor(colorsCount);
    for (const color of this.TILE_COLORS) {
      if (maxColorIndex == color.colorID) {
        color1 = color.colorName;
      }
    }
    colorsCount[maxColorIndex] = 0;
    maxColorIndex = this.getMaxColor(colorsCount);
    if (maxColorIndex == -1) {
      return [color1];
    }

    for (const color of this.TILE_COLORS) {
      if (maxColorIndex == color.colorID) {
        color2 = color.colorName;
      }
    }

    return [color1, color2];
  }

  getMaxColor(colorsCount: number[]): number {
    let maxColorFrequency: number = 0;
    let maxColorIndex: number = 0;

    for (let i = 0; i < colorsCount.length; i++) {
      if (colorsCount[i] > maxColorFrequency) {
        maxColorFrequency = colorsCount[i];
        maxColorIndex = i;
      }
    }

    if (maxColorFrequency < 1) return -1;

    return maxColorIndex;
  }

  colorSeparation(
    type: StructureType,
    positions: { x: number; y: number }[],
  ): { x: number; y: number }[] {
    if (type.substructures == null) {
      return positions;
    }

    let basePosition: { x: number; y: number }[] = [];
    let substructs = type.substructures;

    for (let { x, y } of positions) {
      for (let substruct in substructs) {
        if (!substructs[substruct].includes(this.mapData[y][x])) {
          basePosition.push({ x, y });
        }
      }
    }

    return basePosition;
  }

  getMapZone(coords: { x: number; y: number }): string {
    let horizontalSliceSize: number = this.mapHeight / 3;
    let verticalSliceSize: number = this.mapWidth / 3;

    let { x, y } = coords;
    let mapZone: string = "";

    if (y < horizontalSliceSize) {
      mapZone = "top";
    } else if (y < 2 * horizontalSliceSize) {
      mapZone = "center";
    } else {
      mapZone = "bottom";
    }

    if (x < verticalSliceSize) {
      mapZone += " left";
    } else if (x < 2 * verticalSliceSize && mapZone !== "center") {
      mapZone += " center";
    } else {
      mapZone += " right";
    }

    return mapZone;
  }

  printWorldFacts(): void {
    console.log("Map structures (world facts database):");
    console.log(this.structures);
  }
}
