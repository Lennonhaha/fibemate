// inp.js - FIBEMATE Input Plugin System Stub
// Defines global objects expected by main.js
window.fibemate_plugins = window.fibemate_plugins || [];

window.usePlugin = function(name) {
  console.warn('[Plugin] Stub: usePlugin("' + name + '")');
  return window.fibemate_plugins.find(function(p) { return p.name === name; });
};

window.inp = window.inp || {};
window.inp.init = function() {
  console.log('[inp] Stub: init called');
};
window.inp.execute = function(cmd) {
  console.warn('[inp] Stub: execute("' + cmd + '")');
  return null;
};