(() => {
  let preference;
  try {
    preference = globalThis.localStorage.getItem('fuel-feet-theme');
  } catch {
    // Storage can be unavailable when the browser blocks persistence.
  }

  const followsSystem = preference !== 'light' && preference !== 'dark';
  const dark = followsSystem ? globalThis.matchMedia('(prefers-color-scheme: dark)').matches : preference === 'dark';
  globalThis.document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
