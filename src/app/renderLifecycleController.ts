export function createRenderLifecycleController(args: {
  canvas: HTMLCanvasElement;
  onResume: () => void;
}) {
  let pageVisible = !document.hidden;
  let contextAvailable = true;

  const handleVisibility = () => {
    const becameVisible = !pageVisible && !document.hidden;
    pageVisible = !document.hidden;
    if (becameVisible && contextAvailable) args.onResume();
  };
  const handleContextLost = (event: Event) => {
    event.preventDefault();
    contextAvailable = false;
  };
  const handleContextRestored = () => {
    contextAvailable = true;
    if (pageVisible) args.onResume();
  };

  document.addEventListener("visibilitychange", handleVisibility);
  args.canvas.addEventListener("webglcontextlost", handleContextLost);
  args.canvas.addEventListener("webglcontextrestored", handleContextRestored);

  return {
    canRender: () => pageVisible && contextAvailable,
    dispose: () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      args.canvas.removeEventListener("webglcontextlost", handleContextLost);
      args.canvas.removeEventListener("webglcontextrestored", handleContextRestored);
    }
  };
}
