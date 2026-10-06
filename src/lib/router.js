import { useEffect, useState } from 'react';

// Hash routing (#/orbits). It needs no server configuration, so the built
// app runs from any static host or folder, including GitHub Pages.

const readPath = () => {
  const hash = window.location.hash.replace(/^#/, '');
  return hash.startsWith('/') ? hash : '/';
};

export function useHashPath() {
  const [path, setPath] = useState(readPath);

  useEffect(() => {
    const onChange = () => setPath(readPath());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return path;
}

export const hrefFor = (path) => `#${path}`;
