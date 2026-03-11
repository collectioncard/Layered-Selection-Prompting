// Load all .md files from the skills/ directory at build/dev time
const skillModules = import.meta.glob("/skills/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

export interface Skill {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  source: "file" | "user"; // "file" = from skills/ folder, "user" = created in editor
}

const STORAGE_KEY = "pewter-skills";
const skills: Map<string, Skill> = new Map();

// Parse filename into display name: "medieval-village.md" → "Medieval Village"
function filenameToDisplayName(filepath: string): string {
  const filename = filepath.split("/").pop() || filepath;
  return filename
    .replace(/\.md$/, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Generate a unique ID for user-created skills
function generateId(): string {
  return "user-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8);
}

// Load user-created skills from localStorage
function loadUserSkills(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const parsed: Skill[] = JSON.parse(stored);
    for (const skill of parsed) {
      skill.source = "user";
      skills.set(skill.id, skill);
    }
  } catch {
    // Corrupted data — ignore
  }
}

// Save user-created skills to localStorage
function saveUserSkills(): void {
  const userSkills = getAllSkills().filter((s) => s.source === "user");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(userSkills));
}

// Initialize file-based skills from the glob results
for (const [path, content] of Object.entries(skillModules)) {
  const id = path;
  const name = filenameToDisplayName(path);
  skills.set(id, { id, name, content, enabled: false, source: "file" });
}

// Then load user-created skills (may add new entries)
loadUserSkills();

// Callback invoked when a skill is toggled — set by main.ts to avoid circular deps
let onSkillToggle: (() => void) | null = null;

export function setOnSkillToggleCallback(callback: () => void): void {
  onSkillToggle = callback;
}

export function getAllSkills(): Skill[] {
  return Array.from(skills.values());
}

export function toggleSkill(id: string): void {
  const skill = skills.get(id);
  if (skill) {
    skill.enabled = !skill.enabled;
    if (skill.source === "user") saveUserSkills();
  }
}

/**
 * Returns the formatted skill content to append to the system prompt.
 * Returns empty string if no skills are enabled.
 */
export function getEnabledSkillsPrompt(): string {
  const enabled = getAllSkills().filter((s) => s.enabled);
  if (enabled.length === 0) return "";

  let section =
    "\n\n## Active Skills\n" +
    "The following are special design instructions provided by the user. " +
    "Follow them when they are relevant to the current request.\n";

  for (const skill of enabled) {
    section += `\n### Skill: ${skill.name}\n${skill.content}\n`;
  }

  return section;
}

// ===== Skill Editor Modal =====

let editingSkillId: string | null = null;

function getEditorElements() {
  return {
    overlay: document.getElementById("skill-editor-overlay")!,
    title: document.getElementById("skill-editor-title")!,
    nameInput: document.getElementById("skill-editor-name") as HTMLInputElement,
    contentArea: document.getElementById("skill-editor-content") as HTMLTextAreaElement,
    saveBtn: document.getElementById("skill-editor-save")!,
    cancelBtn: document.getElementById("skill-editor-cancel")!,
    closeBtn: document.getElementById("skill-editor-close")!,
    deleteBtn: document.getElementById("skill-editor-delete")!,
  };
}

function openEditor(skill?: Skill): void {
  const els = getEditorElements();
  editingSkillId = skill?.id ?? null;

  if (skill) {
    els.title.textContent = "Edit Skill";
    els.nameInput.value = skill.name;
    els.contentArea.value = skill.content;
    // Only allow deleting user-created skills
    els.deleteBtn.classList.toggle("hidden", skill.source === "file");
  } else {
    els.title.textContent = "New Skill";
    els.nameInput.value = "";
    els.contentArea.value = "";
    els.deleteBtn.classList.add("hidden");
  }

  els.overlay.classList.remove("hidden");
  els.nameInput.focus();
}

function closeEditor(): void {
  const els = getEditorElements();
  els.overlay.classList.add("hidden");
  editingSkillId = null;
}

function saveEditor(): void {
  const els = getEditorElements();
  const name = els.nameInput.value.trim();
  const content = els.contentArea.value.trim();

  if (!name) {
    els.nameInput.focus();
    return;
  }

  if (editingSkillId) {
    // Editing existing skill
    const existing = skills.get(editingSkillId);
    if (existing) {
      existing.name = name;
      existing.content = content;
      if (existing.source === "user") saveUserSkills();
    }
  } else {
    // Creating new skill
    const id = generateId();
    skills.set(id, { id, name, content, enabled: false, source: "user" });
    saveUserSkills();
  }

  closeEditor();
  renderSkillsPanel();
  if (onSkillToggle) onSkillToggle();
}

function deleteSkill(): void {
  if (!editingSkillId) return;
  const skill = skills.get(editingSkillId);
  if (!skill || skill.source !== "user") return;

  skills.delete(editingSkillId);
  saveUserSkills();
  closeEditor();
  renderSkillsPanel();
  if (onSkillToggle) onSkillToggle();
}

function initEditorEvents(): void {
  const els = getEditorElements();

  els.saveBtn.addEventListener("click", saveEditor);
  els.cancelBtn.addEventListener("click", closeEditor);
  els.closeBtn.addEventListener("click", closeEditor);
  els.deleteBtn.addEventListener("click", deleteSkill);

  // Close on overlay background click
  els.overlay.addEventListener("click", (e) => {
    if (e.target === els.overlay) closeEditor();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !els.overlay.classList.contains("hidden")) {
      closeEditor();
    }
  });

  // "New Skill" button
  document.getElementById("skills-add-btn")?.addEventListener("click", () => {
    openEditor();
  });
}

// ===== Skills Panel Rendering =====

/**
 * Render the skills management panel into #skills-list.
 */
export function renderSkillsPanel(): void {
  const container = document.getElementById("skills-list");
  if (!container) return;

  // Initialize editor events once
  if (!container.dataset.editorInit) {
    initEditorEvents();
    container.dataset.editorInit = "1";
  }

  const allSkills = getAllSkills();

  if (allSkills.length === 0) {
    container.innerHTML =
      '<div class="skills-empty">' +
      "<p>No skills yet.</p>" +
      "<p>Click <strong>+ New Skill</strong> above to create one, or add <code>.md</code> files to the <code>skills/</code> folder.</p>" +
      "</div>";
    updateSkillCount();
    return;
  }

  container.innerHTML = "";

  for (const skill of allSkills) {
    const item = document.createElement("div");
    item.className = "skill-item" + (skill.enabled ? " enabled" : "");
    item.dataset.skillId = skill.id;

    item.innerHTML =
      '<div class="skill-header">' +
      `<span class="skill-name">${escapeHtml(skill.name)}</span>` +
      '<div class="skill-header-controls">' +
      '<button class="skill-edit-btn">Edit</button>' +
      '<label class="skill-toggle">' +
      `<input type="checkbox" ${skill.enabled ? "checked" : ""} />` +
      '<span class="skill-toggle-slider"></span>' +
      "</label>" +
      "</div>" +
      "</div>";

    const checkbox = item.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement;
    checkbox.addEventListener("change", () => {
      toggleSkill(skill.id);
      item.classList.toggle("enabled", skill.enabled);
      if (onSkillToggle) onSkillToggle();
      updateSkillCount();
    });

    const editBtn = item.querySelector(".skill-edit-btn") as HTMLButtonElement;
    editBtn.addEventListener("click", () => {
      openEditor(skill);
    });

    container.appendChild(item);
  }

  updateSkillCount();
}

function updateSkillCount(): void {
  const countEl = document.getElementById("skills-count");
  if (!countEl) return;
  const enabled = getAllSkills().filter((s) => s.enabled).length;
  const total = getAllSkills().length;
  countEl.textContent = `${enabled}/${total} active`;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
