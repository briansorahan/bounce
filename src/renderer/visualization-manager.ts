export interface Visualization {
  id: string;
  title: string;
  element: HTMLElement;
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
  draw: () => void;
}

export class VisualizationManager {
  private container: HTMLElement;
  private visualizations: Map<string, Visualization> = new Map();
  private nextId: number = 0;

  constructor(containerId: string) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error(`Container ${containerId} not found`);
    }
    this.container = container;
    this.setupResizeHandler();
  }

  private setupResizeHandler(): void {
    window.addEventListener('resize', () => {
      this.visualizations.forEach(viz => {
        this.resizeCanvas(viz);
        viz.draw();
      });
    });
  }

  private resizeCanvas(viz: Visualization): void {
    const rect = viz.canvas.getBoundingClientRect();
    const width = rect.width || viz.canvas.parentElement?.clientWidth || 800;
    const height = rect.height || viz.canvas.parentElement?.clientHeight || 200;
    
    window.electron.debugLog('info', `[VizManager] Resizing canvas: ${viz.id}`, { width, height });
    
    viz.canvas.width = width;
    viz.canvas.height = height;
  }

  addVisualization(title: string, height: number = 250): Visualization {
    const id = `viz-${this.nextId++}`;
    
    window.electron.debugLog('info', '[VizManager] Adding visualization', { title, height, id });
    
    // Create panel container
    const panel = document.createElement('div');
    panel.className = 'visualization-panel';
    panel.style.minHeight = `${height}px`;
    panel.id = id;

    // Create header
    const header = document.createElement('div');
    header.className = 'visualization-panel-header';
    
    const titleEl = document.createElement('span');
    titleEl.className = 'visualization-panel-title';
    titleEl.textContent = title;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'visualization-panel-close';
    closeBtn.textContent = '✕';
    closeBtn.onclick = () => this.removeVisualization(id);
    
    header.appendChild(titleEl);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    // Create canvas container with explicit sizing
    const canvasContainer = document.createElement('div');
    canvasContainer.style.width = '100%';
    canvasContainer.style.height = `${height - 30}px`;
    canvasContainer.style.position = 'relative';
    canvasContainer.style.background = '#252525'; // DEBUG: Make visible

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvasContainer.appendChild(canvas);
    panel.appendChild(canvasContainer);

    // Add to container
    this.container.appendChild(panel);
    
    window.electron.debugLog('info', '[VizManager] Panel added to DOM', { id });

    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Failed to get canvas context');
    }

    const visualization: Visualization = {
      id,
      title,
      element: panel,
      canvas,
      context,
      draw: () => {} // Will be set by the visualization implementation
    };

    this.visualizations.set(id, visualization);
    
    const containerSize = {
      width: canvasContainer.offsetWidth,
      height: canvasContainer.offsetHeight
    };
    window.electron.debugLog('info', '[VizManager] Canvas container size', containerSize);
    
    // Size the canvas after it's in the DOM
    setTimeout(() => {
      window.electron.debugLog('info', '[VizManager] Sizing canvas after timeout', { id });
      this.resizeCanvas(visualization);
      visualization.draw();
    }, 100); // Increased timeout to ensure layout is complete

    return visualization;
  }

  removeVisualization(id: string): void {
    const viz = this.visualizations.get(id);
    if (viz) {
      viz.element.remove();
      this.visualizations.delete(id);
    }
  }

  clearAll(): void {
    this.visualizations.forEach(viz => viz.element.remove());
    this.visualizations.clear();
  }

  hasVisualizations(): boolean {
    return this.visualizations.size > 0;
  }
}
