function prefersReducedMotion() {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function withViewTransition(updateFn, direction = null) {
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    updateFn();
    return null;
  }

  if (direction) {
    document.documentElement.setAttribute("data-vt-direction", direction);
  }

  const transition = document.startViewTransition(() => updateFn());
  transition.finished
    .catch(() => {})
    .finally(() => document.documentElement.removeAttribute("data-vt-direction"));
  return transition;
}

export function withThemeViewTransition(updateFn, originEvent) {
  if (typeof document.startViewTransition !== "function" || prefersReducedMotion()) {
    updateFn();
    return null;
  }

  const x = originEvent?.clientX ?? window.innerWidth / 2;
  const y = originEvent?.clientY ?? window.innerHeight / 2;
  const endRadius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y)
  );

  document.documentElement.setAttribute("data-vt-theme", "1");

  const transition = document.startViewTransition(() => updateFn());
  transition.ready
    .then(() => {
      document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${endRadius}px at ${x}px ${y}px)`
          ]
        },
        {
          duration: 480,
          easing: "cubic-bezier(0.4, 0, 0.2, 1)",
          pseudoElement: "::view-transition-new(root)"
        }
      );
    })
    .catch(() => {});

  transition.finished
    .catch(() => {})
    .finally(() => document.documentElement.removeAttribute("data-vt-theme"));

  return transition;
}
