'use client';

import { useEffect, useRef } from 'react';

export function ThemePicker() {
  const select = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    const scheme = document.documentElement.dataset.theme;
    if (select.current) select.current.value = scheme === 'light' || scheme === 'dark' ? scheme : 'system';
  }, []);

  return <label className="theme-picker">Appearance
    <select ref={select} defaultValue="system" onChange={(event) => {
      const theme = event.target.value;
      if (theme === 'system') delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = theme;
      try { localStorage.setItem('webdock-theme', theme); } catch { /* The selection still works when storage is blocked. */ }
    }}>
      <option value="system">System</option>
      <option value="light">Light</option>
      <option value="dark">Dark</option>
    </select>
  </label>;
}
