/**
 * True when the OS asks for reduced motion. JS-driven choreography (count-ups,
 * phase handoffs that wait on an animation) checks this and skips straight to
 * the settled state; pure-CSS animation is silenced by the media query in
 * globals.css instead.
 */
export const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
