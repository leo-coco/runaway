(() => {
  const storedTheme = localStorage.getItem('runaway/marketing-theme');
  const theme =
    storedTheme === 'light' || storedTheme === 'dark'
      ? storedTheme
      : matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#0d0d0d' : '#f5f2ec');
})();
