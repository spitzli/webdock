// Runs before paint so a saved preference does not flash the system theme.
export const themeScript = `try{const t=localStorage.getItem('webdock-theme');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch{}`;
