const WALKTHROUGH_STORAGE_KEY = "pewter_walkthrough_completed";

export interface WalkthroughStep {
  id: number;
  title: string;
  content: string;
  targetSelector?: string;
  position?: "top" | "bottom" | "left" | "right" | "center";
  actionRequired?: string; // Event or action that triggers next step
  showButton?: boolean;
  buttonText?: string;
}

export const WALKTHROUGH_STEPS: WalkthroughStep[] = [
  {
    id: 0,
    title: "Welcome to Pewter Platformer!",
    content: "A topdown 2D level generator. Would you like a tour?",
    position: "center",
    showButton: true,
    buttonText: "Yes",
  },
  {
    id: 1,
    title: "Selection Tool",
    content:
      "Click and drag on the map to form a selection box. This is how you define areas to make edits.",
    targetSelector: "#map",
    position: "top",
    actionRequired: "selection",
  },
  {
    id: 2,
    title: "AI Agent",
    content:
      'Write a prompt for the design of the level here. Try something like "Make a house in a glade".',
    targetSelector: "#llm-chat-input",
    position: "left",
  },
  {
    id: 3,
    title: "Clear Tiles",
    content:
      "Hit this button to return the tiles in your selection to their original state.",
    targetSelector: "#clear-selected-tiles",
    position: "bottom",
    actionRequired: "clear-tiles-click",
  },
  {
    id: 4,
    title: "Clear Selection",
    content: "Hit this button to clear the selection box.",
    targetSelector: "#clear-selection",
    position: "bottom",
    actionRequired: "clear-selection-click",
  },
  {
    id: 5,
    title: "Manual Edits",
    content:
      "Here you can see all the tiles that can be used. You can prompt the AI agent to create different scenes or place tiles manually.",
    targetSelector: "#tab-manual",
    position: "left",
    showButton: true,
    buttonText: "Complete Walkthrough",
  },
];

export class WalkthroughManager {
  private currentStep: number = -1;
  private overlay: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private welcomeModal: HTMLElement | null = null;
  private isActive: boolean = false;
  private actionCallbacks: Map<string, () => void> = new Map();

  constructor() {
    this.initializeElements();
  }

  private initializeElements() {
    this.overlay = document.getElementById("walkthrough-overlay");
    this.tooltip = document.getElementById("walkthrough-tooltip");
    this.welcomeModal = document.getElementById("walkthrough-welcome-modal");
  }

  public shouldShowWalkthrough(): boolean {
    const completed = localStorage.getItem(WALKTHROUGH_STORAGE_KEY);
    return completed !== "true";
  }

  public startWalkthrough() {
    if (!this.shouldShowWalkthrough()) {
      return;
    }

    this.isActive = true;
    this.currentStep = 0;
    this.showStep(0);
  }

  public showStep(stepIndex: number) {
    if (stepIndex < 0 || stepIndex >= WALKTHROUGH_STEPS.length) {
      this.completeWalkthrough();
      return;
    }

    const step = WALKTHROUGH_STEPS[stepIndex];
    this.currentStep = stepIndex;

    if (step.position === "center") {
      this.showWelcomeModal(step);
    } else {
      this.showTooltip(step);
    }
  }

  private showWelcomeModal(step: WalkthroughStep) {
    if (!this.welcomeModal || !this.overlay) return;

    const titleEl = this.welcomeModal.querySelector(
      ".walkthrough-title",
    ) as HTMLElement;
    const contentEl = this.welcomeModal.querySelector(
      ".walkthrough-content",
    ) as HTMLElement;
    const yesButton = this.welcomeModal.querySelector(
      ".walkthrough-yes",
    ) as HTMLElement;
    const noButton = this.welcomeModal.querySelector(
      ".walkthrough-no",
    ) as HTMLElement;
    const closeButton = this.welcomeModal.querySelector(
      ".walkthrough-close",
    ) as HTMLElement;

    if (titleEl) titleEl.textContent = step.title;
    if (contentEl) contentEl.textContent = step.content;

    this.overlay.classList.remove("hidden");
    this.welcomeModal.classList.remove("hidden");

    // Remove existing listeners
    const newYesButton = yesButton?.cloneNode(true) as HTMLElement;
    const newNoButton = noButton?.cloneNode(true) as HTMLElement;
    const newCloseButton = closeButton?.cloneNode(true) as HTMLElement;

    if (yesButton?.parentNode) {
      yesButton.parentNode.replaceChild(newYesButton, yesButton);
      newYesButton.addEventListener("click", () => {
        this.hideWelcomeModal();
        this.showStep(1);
      });
    }

    if (noButton?.parentNode) {
      noButton.parentNode.replaceChild(newNoButton, noButton);
      newNoButton.addEventListener("click", () => {
        this.completeWalkthrough();
      });
    }

    if (closeButton?.parentNode) {
      closeButton.parentNode.replaceChild(newCloseButton, closeButton);
      newCloseButton.addEventListener("click", () => {
        this.completeWalkthrough();
      });
    }
  }

  private showTooltip(step: WalkthroughStep) {
    if (!this.tooltip || !this.overlay || !step.targetSelector) return;

    const targetElement = document.querySelector(step.targetSelector);
    if (!targetElement) {
      console.warn(`Target element not found: ${step.targetSelector}`);
      this.nextStep();
      return;
    }

    const titleEl = this.tooltip.querySelector(
      ".walkthrough-tooltip-title",
    ) as HTMLElement;
    const contentEl = this.tooltip.querySelector(
      ".walkthrough-tooltip-content",
    ) as HTMLElement;
    const closeButton = this.tooltip.querySelector(
      ".walkthrough-tooltip-close",
    ) as HTMLElement;
    const nextButton = this.tooltip.querySelector(
      ".walkthrough-tooltip-next",
    ) as HTMLElement;
    const completeButton = this.tooltip.querySelector(
      ".walkthrough-tooltip-complete",
    ) as HTMLElement;

    if (titleEl) titleEl.textContent = step.title;
    if (contentEl) contentEl.textContent = step.content;

    // Show/hide buttons
    if (nextButton) {
      nextButton.style.display = step.showButton ? "none" : "block";
      if (!step.showButton) {
        const newNextButton = nextButton.cloneNode(true) as HTMLElement;
        nextButton.parentNode?.replaceChild(newNextButton, nextButton);
        newNextButton.addEventListener("click", () => this.nextStep());
      }
    }

    if (completeButton) {
      completeButton.style.display = step.showButton ? "block" : "none";
      if (step.showButton) {
        const newCompleteButton = completeButton.cloneNode(true) as HTMLElement;
        if (completeButton.parentNode) {
          completeButton.parentNode.replaceChild(
            newCompleteButton,
            completeButton,
          );
        }
        if (step.buttonText) {
          newCompleteButton.textContent = step.buttonText;
        }
        newCompleteButton.addEventListener("click", () => {
          this.completeWalkthrough();
        });
      }
    }

    // Position tooltip
    this.positionTooltip(targetElement as HTMLElement, step.position || "top");

    this.overlay.classList.remove("hidden");
    this.tooltip.classList.remove("hidden");

    // Close button
    if (closeButton) {
      const newCloseButton = closeButton.cloneNode(true) as HTMLElement;
      closeButton.parentNode?.replaceChild(newCloseButton, closeButton);
      newCloseButton.addEventListener("click", () => {
        this.completeWalkthrough();
      });
    }

    // Highlight target element
    this.highlightElement(targetElement as HTMLElement);
  }

  private positionTooltip(
    targetElement: HTMLElement,
    position: "top" | "bottom" | "left" | "right",
  ) {
    if (!this.tooltip) return;

    const targetRect = targetElement.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const padding = 20;
    let top = 0;
    let left = 0;
    let arrowClass = "";

    switch (position) {
      case "top":
        top = targetRect.top - tooltipRect.height - padding;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        arrowClass = "arrow-bottom";
        break;
      case "bottom":
        top = targetRect.bottom + padding;
        left = targetRect.left + targetRect.width / 2 - tooltipRect.width / 2;
        arrowClass = "arrow-top";
        break;
      case "left":
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.left - tooltipRect.width - padding;
        arrowClass = "arrow-right";
        break;
      case "right":
        top = targetRect.top + targetRect.height / 2 - tooltipRect.height / 2;
        left = targetRect.right + padding;
        arrowClass = "arrow-left";
        break;
    }

    // Keep tooltip within viewport
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    if (left < padding) left = padding;
    if (left + tooltipRect.width > viewportWidth - padding) {
      left = viewportWidth - tooltipRect.width - padding;
    }
    if (top < padding) top = padding;
    if (top + tooltipRect.height > viewportHeight - padding) {
      top = viewportHeight - tooltipRect.height - padding;
    }

    this.tooltip.style.top = `${top}px`;
    this.tooltip.style.left = `${left}px`;

    // Update arrow class
    this.tooltip.className = `walkthrough-tooltip ${arrowClass}`;
  }

  private highlightElement(element: HTMLElement) {
    element.style.outline = "3px solid #4ade80";
    element.style.outlineOffset = "4px";
    element.style.zIndex = "3000";
    element.style.position = "relative";
  }

  private removeHighlight(element: HTMLElement) {
    element.style.outline = "";
    element.style.outlineOffset = "";
    element.style.zIndex = "";
    element.style.position = "";
  }

  private hideWelcomeModal() {
    if (this.welcomeModal) {
      this.welcomeModal.classList.add("hidden");
    }
  }

  public nextStep() {
    if (!this.isActive) return;

    // Remove highlight from current step
    const currentStep = WALKTHROUGH_STEPS[this.currentStep];
    if (currentStep?.targetSelector) {
      const targetElement = document.querySelector(
        currentStep.targetSelector,
      ) as HTMLElement;
      if (targetElement) {
        this.removeHighlight(targetElement);
      }
    }

    if (this.tooltip) {
      this.tooltip.classList.add("hidden");
    }

    this.showStep(this.currentStep + 1);
  }

  public completeWalkthrough() {
    this.isActive = false;
    localStorage.setItem(WALKTHROUGH_STORAGE_KEY, "true");

    // Remove highlights
    WALKTHROUGH_STEPS.forEach((step) => {
      if (step.targetSelector) {
        const element = document.querySelector(
          step.targetSelector,
        ) as HTMLElement;
        if (element) {
          this.removeHighlight(element);
        }
      }
    });

    if (this.overlay) {
      this.overlay.classList.add("hidden");
    }
    if (this.tooltip) {
      this.tooltip.classList.add("hidden");
    }
    if (this.welcomeModal) {
      this.welcomeModal.classList.add("hidden");
    }
  }

  public registerAction(action: string, callback: () => void) {
    this.actionCallbacks.set(action, callback);
  }

  public triggerAction(action: string) {
    if (!this.isActive) return;

    const currentStep = WALKTHROUGH_STEPS[this.currentStep];
    if (currentStep?.actionRequired === action) {
      // Small delay to let the action complete
      setTimeout(() => {
        this.nextStep();
      }, 300);
    }

    const callback = this.actionCallbacks.get(action);
    if (callback) {
      callback();
    }
  }

  public isWalkthroughActive(): boolean {
    return this.isActive;
  }
}
