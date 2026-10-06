import { useEffect } from 'react';
import { useHashPath } from './lib/router.js';
import { pageByPath } from './pages/registry.js';
import { TopBar } from './components/Shell.jsx';

import Home from './pages/Home.jsx';
import Newton from './pages/Newton.jsx';
import FieldLines from './pages/FieldLines.jsx';
import Equipotentials from './pages/Equipotentials.jsx';
import PotentialWell from './pages/PotentialWell.jsx';
import Gradient from './pages/Gradient.jsx';
import EarthMoon from './pages/EarthMoon.jsx';
import FromInfinity from './pages/FromInfinity.jsx';
import Orbits from './pages/Orbits.jsx';
import OrbitalEnergy from './pages/OrbitalEnergy.jsx';
import Cavendish from './pages/Cavendish.jsx';
import Schiehallion from './pages/Schiehallion.jsx';

const COMPONENTS = {
  '/newton': Newton,
  '/field-lines': FieldLines,
  '/equipotentials': Equipotentials,
  '/potential-well': PotentialWell,
  '/gradient': Gradient,
  '/earth-moon': EarthMoon,
  '/from-infinity': FromInfinity,
  '/orbits': Orbits,
  '/orbital-energy': OrbitalEnergy,
  '/cavendish': Cavendish,
  '/schiehallion': Schiehallion,
};

export default function App() {
  const path = useHashPath();
  const page = pageByPath(path);
  const Page = page ? COMPONENTS[page.path] : null;

  useEffect(() => {
    document.title = page ? `${page.title} · Gravitational fields` : 'Gravitational fields';
    window.scrollTo(0, 0);
  }, [path, page]);

  return (
    <>
      <TopBar currentPath={page ? page.path : '/'} />
      <main>
        {Page ? <Page key={page.path} page={page} /> : <Home />}
      </main>
    </>
  );
}
