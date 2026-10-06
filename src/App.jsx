import { useEffect } from 'react';
import { useHashPath } from './lib/router.js';
import { PAGES, pageByPath } from './pages/registry.js';
import { FootLink, TopBar } from './components/Shell.jsx';
import { hrefFor } from './lib/router.js';
import BuyMeCoffeeButton from './components/BuyMeCoffee.jsx';

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
  const index = page ? PAGES.findIndex((p) => p.path === page.path) : -1;
  const prev = index > 0 ? PAGES[index - 1] : null;
  const next = index >= 0 && index < PAGES.length - 1 ? PAGES[index + 1] : null;

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
      <footer className="site-foot">
        <div className="site-foot-brand">
          <a href="https://awm11.github.io/" aria-label="awm Physics home page">
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width="44" height="44" />
          </a>
          <p>
            <strong>awm Physics</strong>
            Free physics simulations for students and teachers. If these have helped, you can{' '}
            <a href="https://www.buymeacoffee.com/awmPhysics" target="_blank" rel="noreferrer">
              support the project
            </a>{' '}
            with a coffee, or{' '}
            <a href="https://awm11.github.io/">see more simulations</a>.
          </p>
        </div>
        {page && (
          <nav className="site-foot-nav" aria-label="Previous and next page">
            <FootLink href={hrefFor(prev ? prev.path : '/')} kicker={prev ? 'Previous' : 'Back to'} title={prev ? prev.title : 'Contents'} />
            <FootLink
              next
              href={hrefFor(next ? next.path : '/')}
              kicker={next ? 'Next' : 'Finished'}
              title={next ? next.title : 'Back to contents'}
            />
          </nav>
        )}
        <div className="site-foot-coffee">
          <BuyMeCoffeeButton />
        </div>
      </footer>
    </>
  );
}
