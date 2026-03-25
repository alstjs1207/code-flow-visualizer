/**
 * Lightweight pan/zoom for SVG containers using CSS transforms.
 */

export interface PanZoomState {
  scale: number;
  translateX: number;
  translateY: number;
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 3;
const ZOOM_SENSITIVITY = 0.001;

export function attachPanZoom(
  container: HTMLElement,
  svgWrapper: HTMLElement
): { destroy: () => void; fitView: () => void; getState: () => PanZoomState } {
  let scale = 1;
  let translateX = 0;
  let translateY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  function applyTransform() {
    svgWrapper.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
    svgWrapper.style.transformOrigin = "0 0";
  }

  function fitView() {
    const svg = svgWrapper.querySelector("svg");
    if (!svg) return;

    const containerRect = container.getBoundingClientRect();
    const svgRect = svg.getBoundingClientRect();

    // Get the actual SVG dimensions from the viewBox or element
    const svgWidth = svg.viewBox?.baseVal?.width || svgRect.width / scale;
    const svgHeight = svg.viewBox?.baseVal?.height || svgRect.height / scale;

    if (svgWidth === 0 || svgHeight === 0) return;

    const padding = 0.9; // 90% of container
    const scaleX = (containerRect.width * padding) / svgWidth;
    const scaleY = (containerRect.height * padding) / svgHeight;
    scale = Math.min(scaleX, scaleY, MAX_SCALE);
    scale = Math.max(scale, MIN_SCALE);

    // Center
    translateX = (containerRect.width - svgWidth * scale) / 2;
    translateY = (containerRect.height - svgHeight * scale) / 2;

    applyTransform();
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const delta = -e.deltaY * ZOOM_SENSITIVITY;
    const newScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * (1 + delta)));

    // Zoom toward mouse position
    const ratio = newScale / scale;
    translateX = mouseX - ratio * (mouseX - translateX);
    translateY = mouseY - ratio * (mouseY - translateY);
    scale = newScale;

    applyTransform();
  }

  function onMouseDown(e: MouseEvent) {
    // Only pan with left button on empty area (not on nodes)
    if (e.button !== 0) return;
    isPanning = true;
    startX = e.clientX - translateX;
    startY = e.clientY - translateY;
    container.style.cursor = "grabbing";
  }

  function onMouseMove(e: MouseEvent) {
    if (!isPanning) return;
    translateX = e.clientX - startX;
    translateY = e.clientY - startY;
    applyTransform();
  }

  function onMouseUp() {
    isPanning = false;
    container.style.cursor = "grab";
  }

  container.style.cursor = "grab";
  container.style.overflow = "hidden";
  container.addEventListener("wheel", onWheel, { passive: false });
  container.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("mouseup", onMouseUp);

  applyTransform();

  return {
    destroy() {
      container.removeEventListener("wheel", onWheel);
      container.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    },
    fitView,
    getState: () => ({ scale, translateX, translateY }),
  };
}
