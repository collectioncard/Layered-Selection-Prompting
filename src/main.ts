import "./style.css";
import { createGame, TinyTownScene } from "./phaser/TinyTownScene.ts";

//LLM Management
import {
  clearChatHistory,
  setMarkNewTurnCallback,
} from "./modelChat/chatbox.ts";
import { createNewAgent, registerTool } from "./modelChat/apiConnector.ts";

//LLM Tools for registration
import { DecorGenerator } from "./phaser/tools/featureGenerators/decorGenerator.ts";
import { ForestGenerator } from "./phaser/tools/featureGenerators/forestGenerator.ts";
import { HouseGenerator } from "./phaser/tools/featureGenerators/houseGenerator.ts";
import { FullFenceGenerator } from "./phaser/tools/featureGenerators/fullFenceGenerator.ts";
import { PartialFenceGenerator } from "./phaser/tools/featureGenerators/partialFenceGenerator.ts";
import { TilePlacer } from "./phaser/tools/simpleTools/placeTile.ts";
import { FullUndo } from "./phaser/tools/simpleTools/undo.ts";
import { boxPlacer } from "./phaser/tools/simpleTools/placeBox.ts";
import { boxClear } from "./phaser/tools/simpleTools/clear.ts";
import {
  ListLayersTool,
  NameLayerTool,
  SelectLayerTool,
  RenameLayerTool,
  DeleteLayerTool,
} from "./phaser/tools/simpleTools/layerTools.ts";
import {
  FindTileTool,
  GetSelectionInfoTool,
  GetTileInfoTool,
  SearchTilesByNameTool,
  GetTileAtTool,
  GetMapInfoTool,
} from "./phaser/tools/simpleTools/queryTools.ts";

////////**** MAIN APP LOGIC ****////////

//Phaser scene ref
let gameInstance: Phaser.Game = createGame(
  document.getElementById("map") as HTMLDivElement,
);

////LLM Tool Registration and Initialization////
const generators = {
  decor: new DecorGenerator(getScene),
  forest: new ForestGenerator(getScene),
  house: new HouseGenerator(getScene),
  full_fence: new FullFenceGenerator(getScene),
  partial_fence: new PartialFenceGenerator(getScene),
  tile_placer: new TilePlacer(getScene),
  undo: new FullUndo(getScene),
  box: new boxPlacer(getScene),
  clear: new boxClear(getScene),
  name_layer: new NameLayerTool(getScene),
  select_layer: new SelectLayerTool(getScene),
  rename_layer: new RenameLayerTool(getScene),
  delete_layer: new DeleteLayerTool(getScene),
  list_layers: new ListLayersTool(getScene),
  // Query tools
  find_tile: new FindTileTool(getScene),
  get_selection_info: new GetSelectionInfoTool(getScene),
  get_tile_info: new GetTileInfoTool(getScene),
  search_tiles: new SearchTilesByNameTool(getScene),
  get_tile_at: new GetTileAtTool(getScene),
  get_map_info: new GetMapInfoTool(getScene),
};
Object.values(generators).forEach((generator) => {
  if (generator.toolCall) {
    registerTool(generator.toolCall);
  }
});

//Once all tools are registered, we can init the LLM
createNewAgent();

// Set up the callback to mark new turns when user sends a message
setMarkNewTurnCallback(() => {
  try {
    const scene = getScene();
    if (scene) {
      scene.markNewTurn();
    }
  } catch (e) {
    console.warn("Could not mark new turn:", e);
  }
});

// Lock selection while model is responding to prevent breaking state
document.addEventListener("chatResponseStart", () => {
  try {
    const scene = getScene();
    if (scene) {
      scene.setSelectionLocked(true);
    }
  } catch (e) {
    console.warn("Could not lock selection:", e);
  }
});

document.addEventListener("chatResponseEnd", () => {
  try {
    const scene = getScene();
    if (scene) {
      scene.setSelectionLocked(false);
    }
  } catch (e) {
    console.warn("Could not unlock selection:", e);
  }
});

let draggedElement: HTMLElement | null = null;

export function getScene(): TinyTownScene {
  if (!gameInstance) throw new Error("Scene does not exist >:(");
  return gameInstance.scene.getScene("TinyTown") as TinyTownScene;
}

//I'll be sad if anyone removes my funny faces. They bring me joy when stuff doesn't work - Thomas
document.title = "Selection Generation " + getRandEmoji();

document.getElementById("all-selection")?.addEventListener("click", () => {
  const scene = getScene();
  if (scene) {
    scene.setSelectionCoordinates(
      0,
      0,
      scene.CANVAS_WIDTH,
      scene.CANVAS_HEIGHT,
    );
  }
});

//Clear selected tiles button
document
  .getElementById("clear-selected-tiles")
  ?.addEventListener("click", () => {
    const scene = getScene();
    if (scene && scene.getSelection()) {
      const selection = scene.getSelection();

      // Count only feature tiles (non-empty, non-grass tiles in the feature grid)
      // Grass tiles are 0, 1, 2 - we only count tiles that will actually be cleared
      let featureTileCount = 0;
      for (let y = 0; y < selection.height; y++) {
        for (let x = 0; x < selection.width; x++) {
          const tileId = selection.grid[y]?.[x];
          // Count tiles that are actual features (not -1 empty and not grass 0-2)
          if (tileId !== undefined && tileId > 2) {
            featureTileCount++;
          }
        }
      }

      // Show confirmation dialog
      const message =
        featureTileCount > 0
          ? `Are you sure you want to clear ${featureTileCount} feature tile(s) in the selected area?`
          : `No feature tiles to clear in the selected area. Clear anyway?`;

      if (confirm(message)) {
        // args of offset are in local space.
        generators.clear.toolCall.invoke({
          x: 0,
          y: 0,
          width: selection.width,
          height: selection.height,
        });
      }
    }
  });

// Clear selection button
document.getElementById("clear-selection")?.addEventListener("click", () => {
  const scene = getScene();
  if (scene) {
    scene.clearSelection();
  }
});

// Get selection button
document.getElementById("get-Coords")?.addEventListener("click", () => {
  const scene = getScene();
  if (scene) {
    console.log(
      "Selection Start: ",
      scene.selectionStart,
      " Selection End: ",
      scene.selectionEnd,
    );
    const text =
      "[Selection Starts at: (" +
      scene.selectionStart.x +
      ", " +
      scene.selectionStart.y +
      "). Selection Ends at: (" +
      scene.selectionEnd.x +
      ", " +
      scene.selectionEnd.y +
      ").]";
    navigator.clipboard
      .writeText(text)
      .then(() => {
        console.log("Text copied to clipboard:", text);
      })
      .catch((err) => {
        console.error("Error copying text: ", err);
      });
  }
});

// Save map to JSON file
document.getElementById("saveMap")?.addEventListener("click", () => {
  const scene = getScene();
  if (scene) {
    const tileMap = scene.GetFlattenedTileMap();
    const jsonString = JSON.stringify(tileMap, null, 2);

    // Create a blob and trigger download
    const blob = new Blob([jsonString], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tilemap.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    console.log("Map saved to JSON file");
  }
});

document.getElementById("loadMap")?.addEventListener("click", () => {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";

  fileInput.onchange = (event) => {
    const target = event.target as HTMLInputElement;
    if (!target.files || target.files.length === 0) return;

    const file = target.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const result = e.target?.result;
        if (typeof result === "string") {
          const jsonData = JSON.parse(result);

          // Validate the data format
          if (
            Array.isArray(jsonData) &&
            jsonData.length > 0 &&
            Array.isArray(jsonData[0])
          ) {
            const scene = getScene();
            scene.loadMapFromJSON(jsonData);

            // Reset LLM history when loading a new map
            clearChatHistory();

            console.log("Map loaded from JSON file");
          } else {
            console.error("Invalid map data format");
            alert("Invalid map data format. Please select a valid map file.");
          }
        }
      } catch (error) {
        console.error("Error loading map:", error);
        alert("Error loading map file. Please try again.");
      }
    };

    reader.readAsText(file);
  };

  // Trigger the file dialog
  fileInput.click();
});

let highlightMode = false;
let currentSelection: string | null = null;

function updateHighlights() {
  const scene = getScene() as any;
  let namesToHighlight: string[];

  if (currentSelection) {
    const node = findNode(currentSelection, scene.layerTree.Root);
    const kids = node?.Children || [];

    if (kids.length > 0) {
      namesToHighlight = kids.map((c: any) => c.Name);
    } else {
      namesToHighlight = [];
    }
  } else {
    namesToHighlight = scene.layerTree.Root.Children.map((c: any) => c.Name);
  }

  scene.clearLayerHighlights();

  if (namesToHighlight.length > 0) {
    scene.drawLayerHighlights(namesToHighlight);
  }

  if (currentSelection) {
    scene.drawSingleHighlight(currentSelection, 0xff8800, 0.8);
  }
}

const deleteModal = document.getElementById("delete-modal") as HTMLDivElement;
const modalLayerName = document.getElementById(
  "modal-layer-name",
) as HTMLSpanElement;
const btnDeleteOnly = document.getElementById(
  "btn-delete-only",
) as HTMLButtonElement;
const btnDeleteWith = document.getElementById(
  "btn-delete-with-assets",
) as HTMLButtonElement;
const btnDeleteCancel = document.getElementById(
  "btn-delete-cancel",
) as HTMLButtonElement;

const ctxMenu = document.getElementById("layer-context-menu") as HTMLDivElement;
const ctxRename = document.getElementById("ctx-rename") as HTMLLIElement;
const ctxDelete = document.getElementById("ctx-delete") as HTMLLIElement;
let contextTarget: string | null = null;

// hide menu on outside click
document.addEventListener("click", () => {
  ctxMenu.style.display = "none";
});

ctxRename.addEventListener("click", () => {
  if (!contextTarget) return;

  const newName = prompt(`Rename "${contextTarget}" to:`)?.trim();
  if (!newName) {
    ctxMenu.style.display = "none";
    return;
  }

  const scene = getScene();
  scene.renameLayer(contextTarget, newName);

  currentSelection = newName;

  scene.selectLayer(newName);
  scene.zoomToLayer(newName);
  scene.setActiveLayer(newName);
  scene.clearSelection();

  buildLayerTree();

  if (highlightMode) updateHighlights();

  ctxMenu.style.display = "none";
});

// Handle delete from context menu
ctxDelete.addEventListener("click", () => {
  if (!contextTarget) return;
  modalLayerName.textContent = contextTarget;
  deleteModal.classList.remove("hidden");
  ctxMenu.style.display = "none";
});

function findParent(childName: string, node: any): any | null {
  for (const c of node.Children) {
    if (c.Name === childName) return node;
    const deeper = findParent(childName, c);
    if (deeper) return deeper;
  }
  return null;
}

function isRoot(node: any, scene: TinyTownScene) {
  return node === (scene as any).layerTree.Root;
}

btnDeleteOnly.addEventListener("click", () => {
  const scene = getScene() as any;
  const root = scene.layerTree.Root;
  const delName = contextTarget!;
  const parentNode = findParent(delName, root);

  scene.deleteLayerOnly(delName);

  // restore selection to parent (or home)
  if (parentNode && !isRoot(parentNode, scene)) {
    const parentName = parentNode.Name;
    currentSelection = parentName;
    scene.zoomToLayer(parentName);
    scene.setActiveLayer(parentName);
  } else {
    currentSelection = null;
    scene.resetView();
    scene.setActiveLayer(null);
  }

  buildLayerTree();
  if (highlightMode) updateHighlights();
  else scene.clearLayerHighlights();

  deleteModal.classList.add("hidden");
});

btnDeleteWith.addEventListener("click", () => {
  const scene = getScene() as any;
  const root = scene.layerTree.Root;
  const delName = contextTarget!;
  const parentNode = findParent(delName, root);

  scene.deleteLayer(delName);

  if (parentNode && !isRoot(parentNode, scene)) {
    const parentName = parentNode.Name;
    currentSelection = parentName;
    scene.zoomToLayer(parentName);
    scene.setActiveLayer(parentName);
  } else {
    currentSelection = null;
    scene.resetView();
    scene.setActiveLayer(null);
  }

  buildLayerTree();
  if (highlightMode) updateHighlights();
  else scene.clearLayerHighlights();

  deleteModal.classList.add("hidden");
});

btnDeleteCancel.addEventListener("click", () => {
  deleteModal.classList.add("hidden");
});

const treeContainer = document.getElementById("layer-tree") as HTMLDivElement;
treeContainer.classList.add("hidden");

// Find a node by name in the tree
function findNode(name: string, node: any): any | null {
  if (node.Name === name) return node;
  for (const child of node.Children) {
    const found = findNode(name, child);
    if (found) return found;
  }
  return null;
}

// Create a <li> for a folder or file node
function makeNodeElement(node: any): HTMLLIElement {
  const li = document.createElement("li");
  let label: HTMLDivElement;

  if (node.Children.length > 0) {
    li.classList.add("folder");
    label = document.createElement("div");
    label.classList.add("folder-label");
  } else {
    li.classList.add("file");
    label = document.createElement("div");
    label.classList.add("file-label");
  }

  label.textContent = node.Name;
  label.dataset.name = node.Name;
  label.setAttribute("draggable", "true");
  label.addEventListener("dragstart", startDrag);
  label.addEventListener("dragover", allowDrop);
  label.addEventListener("drop", drop);

  // highlight if this is the current selection
  if (node.Name === currentSelection) {
    label.classList.add("selected-label");
  }

  li.appendChild(label);

  // if a folder, recursively build its subtree
  if (node.Children.length > 0) {
    const childUl = document.createElement("ul");
    childUl.classList.add("nested");
    node.Children.forEach((child: any) => {
      childUl.appendChild(makeNodeElement(child));
    });
    li.appendChild(childUl);
  }

  // LEFT-CLICK: toggle open & select/zoom
  label.addEventListener("click", (ev) => {
    ev.stopPropagation();
    if (node.Children.length > 0) {
      li.classList.toggle("open");
    }
    const scene = getScene();
    scene.selectLayer(node.Name);
    scene.zoomToLayer(node.Name);
    scene.setActiveLayer(node.Name);
    scene.clearSelection();

    currentSelection = node.Name;

    if (highlightMode) updateHighlights();

    document
      .querySelectorAll("#layer-tree .selected-label")
      .forEach((el) => el.classList.remove("selected-label"));
    label.classList.add("selected-label");

    window.dispatchEvent(
      new CustomEvent("layerSelected", { detail: node.Name }),
    );
  });

  label.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    contextTarget = node.Name;
    ctxMenu.style.top = ev.clientY + "px";
    ctxMenu.style.left = ev.clientX + "px";
    ctxMenu.style.display = "block";
  });

  return li;
}

function allowDrop(event: DragEvent) {
  event.preventDefault();
}

function startDrag(event: DragEvent) {
  const target = event.target as HTMLElement;
  console.log("[dragstart]", target.dataset.name);
  draggedElement = target;
  event.dataTransfer?.setData("text/plain", target.dataset.name || "");
}

function drop(event: DragEvent) {
  event.preventDefault();

  const draggedName = draggedElement?.dataset.name;
  const dropTarget = event.currentTarget as HTMLElement;
  const targetName = dropTarget.dataset.name;

  if (targetName === "ROOT_DROP_ZONE") {
    dropToRoot(draggedName);
    return;
  }

  if (!draggedName || !targetName || draggedName === targetName) return;

  console.log("[drop] Moving", draggedName, "into", targetName);

  const scene = getScene() as any;
  const sourceNode = findNode(draggedName, scene.layerTree.Root);
  const targetNode = findNode(targetName, scene.layerTree.Root);

  if (isDescendant(sourceNode, targetNode)) {
    console.warn("Can't move into own descendant");
    return;
  }

  scene.layerTree.move(draggedName, targetName);
  buildLayerTree();
}

function isDescendant(parent: any, possibleChild: any): boolean {
  if (!parent || !parent.Children) return false;
  for (const child of parent.Children) {
    if (child === possibleChild || isDescendant(child, possibleChild)) {
      return true;
    }
  }
  return false;
}

// NEW: Handle drop to root level
function dropToRoot(draggedName: string | undefined) {
  if (!draggedName) return;

  const scene = getScene() as any;

  // Remove from existing parent
  scene.layerTree.moveToRoot(draggedName);

  console.log("[dropToRoot] Moved", draggedName, "to root");
  buildLayerTree();
}

// Build the entire tree UI
function buildLayerTree() {
  const s = getScene() as any;
  const root = s.layerTree.Root;
  treeContainer.innerHTML = "";
  const ul = document.createElement("ul");

  //Home button
  const homeLi = document.createElement("li");
  const homeLabel = document.createElement("div");
  homeLi.classList.add("file");
  homeLabel.classList.add("file-label");
  homeLabel.textContent = "Home";
  homeLabel.dataset.name = "ROOT_DROP_ZONE";
  homeLabel.addEventListener("dragover", allowDrop);
  homeLabel.addEventListener("drop", drop);
  // highlight “Home” when no layer is selected
  if (currentSelection === null) {
    homeLabel.classList.add("selected-label");
  }
  homeLabel.addEventListener("click", () => {
    s.resetView();
    s.clearSelection();
    s.setActiveLayer(null);
    currentSelection = null;
    buildLayerTree();
    if (highlightMode) updateHighlights();
    else s.clearLayerHighlights();
  });
  homeLi.appendChild(homeLabel);
  ul.appendChild(homeLi);

  root.Children.forEach((child: any) => {
    ul.appendChild(makeNodeElement(child));
  });

  treeContainer.appendChild(ul);
  if (highlightMode) updateHighlights();
}
// Rebuild on layer changes or selection
window.addEventListener("layerCreated", () => {
  buildLayerTree();
  if (highlightMode) updateHighlights();
});

window.addEventListener("layerSelected", () => {
  if (highlightMode) updateHighlights();
});
window.addEventListener("layerRenamed", (e: Event) => {
  const { oldName, newName } = (e as CustomEvent).detail;
  console.log(`Layer renamed: ${oldName} → ${newName}`);

  currentSelection = newName;

  buildLayerTree();

  // if we’re in highlight mode, refresh highlights now that names changed
  if (highlightMode) {
    updateHighlights();
  } else {
    getScene().clearLayerHighlights();
  }
});

window.addEventListener("layerDeleted", (e: Event) => {
  console.log("layerDeleted:", (e as CustomEvent).detail);
  buildLayerTree();
  if (highlightMode) updateHighlights();
});

function getRandEmoji(): string {
  let emoji = [
    ":)",
    ":(",
    ">:(",
    ":D",
    ">:D",
    ":^D",
    ":(",
    ":D",
    "O_O",
    ":P",
    "-_-",
    "O_-",
    "O_o",
    "𓆉",
    "ジ",
    "⊂(◉‿◉)つ",
    "	(｡◕‿‿◕｡)",
    "(⌐■_■)",
    "<|°_°|>",
    "<|^.^|>",
    ":P",
    ":>",
    ":C",
    ":}",
    ":/",
    "ʕ ● ᴥ ●ʔ",
    "(˶ᵔ ᵕ ᵔ˶)",
  ];
  return emoji[Math.floor(Math.random() * emoji.length)];
}

// Tab switching logic for the right panel
function switchToTab(tabName: string) {
  // Update tab button states
  document
    .querySelectorAll(".panel-tab")
    .forEach((t) => t.classList.remove("active"));
  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) activeTab.classList.add("active");

  // Show/hide tab content
  document.querySelectorAll(".tab-content").forEach((content) => {
    content.classList.add("hidden");
    content.classList.remove("active");
  });

  const targetPanel = document.getElementById(`${tabName}-panel`);
  if (targetPanel) {
    targetPanel.classList.remove("hidden");
    targetPanel.classList.add("active");
  }

  // Set placing mode based on which tab is active
  try {
    const scene = getScene();
    scene.setPlacingMode(tabName === "manual");
  } catch (e) {
    console.warn("Scene not ready for mode change:", e);
  }
}

function initTabSwitching() {
  const tabAi = document.getElementById("tab-ai");
  const tabManual = document.getElementById("tab-manual");

  if (tabAi) {
    tabAi.onclick = () => switchToTab("ai");
  }

  if (tabManual) {
    tabManual.onclick = () => switchToTab("manual");
  }
}

// Tile selection in manual mode
function initTileButtons() {
  const buttons = document.querySelectorAll<HTMLButtonElement>(".tile-btn");

  buttons.forEach((button) => {
    button.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const idStr = button.getAttribute("data-tileid");
      const id = idStr ? parseInt(idStr, 10) : null;

      if (id !== null) {
        try {
          const scene = getScene();
          scene.setSelectedTileId(id);

          // Update selected state visually
          document
            .querySelectorAll(".tile-btn")
            .forEach((btn) => btn.classList.remove("selected"));
          button.classList.add("selected");

          // Update preview
          const preview = document.getElementById("selected-tile-preview");
          if (preview) {
            const img = button.querySelector("img");
            const title = button.getAttribute("title") || `Tile ${id}`;
            preview.innerHTML = `<img src="${img?.src}" /> <span>${title} (ID: ${id})</span>`;
          }
        } catch (e) {
          console.error("Could not set tile:", e);
        }
      }
    });
  });
}

// Initialize UI components
function initializeUI() {
  initTabSwitching();
  initTileButtons();

  // Build layer tree after everything else is ready
  try {
    buildLayerTree();
  } catch (e) {
    console.warn("Could not build layer tree on load:", e);
  }
}

// If document is already loaded, initialize immediately
// Otherwise wait for load event
if (document.readyState === "complete") {
  initializeUI();
} else {
  window.addEventListener("load", () => {
    initializeUI();
  });
}
