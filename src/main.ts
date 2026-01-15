import './style.css'
import {createGame, TinyTownScene} from "./phaser/TinyTownScene.ts";
import './modelChat/chatbox.ts';
// Register tools from the scene to the apiConnector
import { initializeTools, registerTool } from './modelChat/apiConnector.ts';
import { DecorGenerator } from './phaser/featureGenerators/decorGenerator.ts';
import { ForestGenerator } from './phaser/featureGenerators/forestGenerator.ts';
import { HouseGenerator } from './phaser/featureGenerators/houseGenerator.ts';
import { FullFenceGenerator } from './phaser/featureGenerators/fullFenceGenerator.ts';
import { PartialFenceGenerator } from './phaser/featureGenerators/partialFenceGenerator.ts';
import { TilePlacer } from './phaser/simpleTools/placeTile.ts';
import { FullUndo } from './phaser/simpleTools/undo.ts';
import { boxPlacer } from './phaser/simpleTools/placeBox.ts';
import { boxClear } from './phaser/simpleTools/clear.ts';
import {clearChatHistory} from "./modelChat/chatbox.ts";

let gameInstance: Phaser.Game | null = null;

export function getScene(): TinyTownScene {
    if (!gameInstance) throw Error("Scene does not exist >:(")
    console.log(gameInstance.scene.getScene('TinyTown'))
    return gameInstance.scene.getScene('TinyTown') as TinyTownScene;
}

gameInstance = await createGame(document.getElementById('map') as HTMLDivElement);

// Register tools
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
}

Object.values(generators).forEach(generator => {
    if (generator.toolCall) {
        registerTool(generator.toolCall);
    }
});

initializeTools();

// Set page title with random emoji
document.title = "Selection Generation " + getRandEmoji();

// ===== Layer Switching =====
// Create layer buttons in the UI
const layerButtonsContainer = document.getElementById('layer-buttons');

function setActiveLayerButton(layerIndex: number) {
    document.querySelectorAll('.layer-button').forEach(b => b.classList.remove('active'));
    const activeBtn = document.getElementById(`layer-${layerIndex}-btn`);
    if (activeBtn) activeBtn.classList.add('active');
}

if (layerButtonsContainer) {
    layerButtonsContainer.innerHTML = '';

    for (let i = 1; i <= 3; i++) {
        const btn = document.createElement('button');
        btn.id = `layer-${i}-btn`;
        btn.textContent = `Layer ${i}`;
        btn.className = 'layer-button';
        btn.dataset.layer = String(i); // for CSS color hint

        btn.addEventListener('click', () => {
            const scene = getScene();
            scene.switchLayer(i);
            setActiveLayerButton(i); // immediate UI feedback
        });

        layerButtonsContainer.appendChild(btn);
    }

    // Initial active state
    setActiveLayerButton(1);
}

// Sync UI if layer changes from anywhere else (scene dispatches this event)
window.addEventListener('layerSwitched', (e: Event) => {
    const layerIndex = (e as CustomEvent<number>).detail;
    setActiveLayerButton(layerIndex);
});

// ===== Selection Controls =====
// Select all tiles
document.getElementById('all-selection')?.addEventListener('click', () => {
    const scene = getScene();
    if (scene) {
        scene.setSelectionCoordinates(0, 0, scene.CANVAS_WIDTH, scene.CANVAS_HEIGHT);
    }
});

// Clear selected tiles button
document.getElementById('clear-selected-tiles')?.addEventListener('click', () => {
    const scene = getScene();
    if (scene && scene.getSelection()) {
        generators.clear.toolCall.invoke({
            x: 0,
            y: 0,
            width: scene.getSelection().width,
            height: scene.getSelection().height
        });
    }
});

// Clear selection button
document.getElementById('clear-selection')?.addEventListener('click', () => {
    const scene = getScene();
    if (scene) {
        scene.clearSelection();
    }
});
// Get selection coordinates
document.getElementById('get-Coords')?.addEventListener('click', () => {
    const scene = getScene();
    if (scene) {
        console.log("Selection Start: ", scene.selectionStart, " Selection End: ", scene.selectionEnd);
        var text = "[Selection Starts at: (" + scene.selectionStart.x + ", " + scene.selectionStart.y + "). Selection Ends at: (" + scene.selectionEnd.x + ", " + scene.selectionEnd.y + ").]";
        navigator.clipboard.writeText(text).then(() => {
            console.log('Text copied to clipboard:', text);
        }).catch(err => {
            console.error('Error copying text: ', err);
        });
    }
});

// ===== Save/Load Map =====
document.getElementById('saveMap')?.addEventListener('click', () => {
    const scene = getScene();
    if (scene) {
        const tileMap = scene.GetFlattenedTileMap();
        const jsonString = JSON.stringify(tileMap, null, 2);
        
        // Create a blob and trigger download
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'tilemap.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log('Map saved to JSON file');
    }
});

document.getElementById('loadMap')?.addEventListener('click', () => {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json';
    
    fileInput.onchange = (event) => {
        const target = event.target as HTMLInputElement;
        if (!target.files || target.files.length === 0) return;
        
        const file = target.files[0];
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const result = e.target?.result;
                if (typeof result === 'string') {
                    const jsonData = JSON.parse(result);
                    
                    // Validate the data format
                    if (Array.isArray(jsonData) && 
                        jsonData.length > 0 && 
                        Array.isArray(jsonData[0])) {
                        
                        const scene = getScene();
                        scene.loadMapFromJSON(jsonData);
                        
                        // Reset LLM history when loading a new map
                        clearChatHistory();
                        
                        console.log('Map loaded from JSON file');
                    } else {
                        console.error('Invalid map data format');
                        alert('Invalid map data format. Please select a valid map file.');
                    }
                }
            } catch (error) {
                console.error('Error loading map:', error);
                alert('Error loading map file. Please try again.');
            }
        };
        
        reader.readAsText(file);
    };
    
    // Trigger the file dialog
    fileInput.click();
});

function getRandEmoji(): string {
    let emoji = [':)', ':(', '>:(', ':D', '>:D', ':^D', ':(', ':D', 'O_O', ':P', '-_-', 'O_-', 'O_o', '𓆉', 'ジ', '⊂(◉‿◉)つ', '(｡◕‿◕｡)', '(⌐■_■)', '<|°_°|>', '<|^.^|>', ':P', ':>', ':C', ':}', ':/', 'ʕ ● ᴥ ●ʔ','(˶ᵔ ᵕ ᵔ˶)'];
    return emoji[Math.floor(Math.random() * emoji.length)];
}

