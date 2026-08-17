// The boot notice's Refresh button. The handler lives in this separate file
// because the CSP (script-src 'self') allows no inline script or inline event
// handler in index.html. reload's boolean forceGet argument is non-standard:
// Firefox still honors it and bypasses the HTTP cache, every other engine
// ignores the argument and performs a plain reload, which the service
// worker's network-first navigation route makes sufficient. This file is
// plain JavaScript outside tsconfig's include set, so the extra argument
// needs no TypeScript cast.
document.getElementById("boot-refresh")?.addEventListener("click", () => {
  window.location.reload(true);
});
