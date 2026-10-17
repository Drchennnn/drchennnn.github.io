import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Exercise the actual production scripts, including initialization before first paint.
// Run after npm run build; no browser or extra test dependency is required.
const html = readFileSync('dist/index.html', 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
const startup = scripts.find(([,,code]) => code.includes('localStorage'))?.[2];
const interaction = scripts.find(([,attrs]) => attrs.includes('type="module"'))?.[2];
assert(startup && interaction, 'Production page must include preference and interaction scripts');
// Guard the visible loop boundary: endpoint displacement must be a whole tile,
// and the moving surface must cover the window at both ends (no exposed edge).
const scene = readFileSync('src/components/CafeScene.astro', 'utf8');
const css = readFileSync('src/styles/cafe.css', 'utf8');
const tile = scene.match(/id="cafe-rain" width="([\d.]+)" height="([\d.]+)"[^>]*patternTransform="matrix\(([^)]+)\)"/);
const travel = css.match(/@keyframes cafe-rainfall\{to\{transform:translate\(([-\d.]+)px,([-\d.]+)px\)/);
assert(tile && travel, 'Rain needs a repeated pattern and a translation animation');
const [a,b,c,d] = tile[3].split(/\s+/).map(Number);
const [dx,dy] = travel.slice(1).map(Number);
const determinant = a*d-b*c;
const tileX = (d*dx-c*dy)/determinant/Number(tile[1]);
const tileY = (-b*dx+a*dy)/determinant/Number(tile[2]);
assert(Math.abs(tileX-Math.round(tileX)) < 1e-9 && Math.abs(tileY-Math.round(tileY)) < 1e-9,
  'Rain loop must end at an identical pattern phase');
const surface = scene.match(/<rect x="([-\d.]+)" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="url\(#cafe-rain\)"/);
const [x,y,width,height] = surface.slice(1).map(Number);
for (const phase of [0,1]) {
  assert(x+dx*phase <= 497 && x+width+dx*phase >= 889 && y+dy*phase <= 87 && y+height+dy*phase >= 408,
    'Rain surface must cover the window throughout the loop');
}
class Element {
  dataset = {}; style = {}; attrs = {}; handlers = {}; children = {}; textContent = ''; disabled = false;
  addEventListener(name, fn) { (this.handlers[name] ??= []).push(fn); }
  emit(name, event = {}) { for (const fn of this.handlers[name] ?? []) fn(event); }
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
  querySelector(selector) { return this.children[selector]; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 1000, height: 680 }; }
}
function mount({ saved = {}, reduced = false, storageDenied = false, fine = true, home = true } = {}) {
  const root = new Element(); root.dataset = { mode: 'day', weather: 'dry', motion: 'on' };
  const names = ['.motion-toggle','[data-scene-time]','[data-scene-rain]','.back-top','[data-cafe-scene]','[data-scene-status]','[data-cafe-transition]'];
  const nodes = Object.fromEntries(names.map(n => [n,new Element()]));
  nodes['[data-cafe-transition]'].hidden=true;
  if(!home) { delete nodes['[data-cafe-scene]'];delete nodes['[data-cafe-transition]']; }
  nodes['[data-scene-time]'].children['[data-time-label]'] = new Element();
  nodes['[data-scene-rain]'].children['[data-rain-label]'] = new Element();
  const layers = [.3,.6,.2,1].map(depth => { const el=new Element();el.dataset.depth=String(depth);return el; });
  const document = Object.assign(new Element(), { documentElement: root, hidden: false, querySelector: s => nodes[s], querySelectorAll: () => layers });
  const preferences = { ...saved };
  const reduce = Object.assign(new Element(), { matches: reduced });
  const pointer = Object.assign(new Element(), { matches: fine });
  const window = new Element(); window.scrollTo = options => { window.lastScroll = options; };
  const frames = [], timers = new Map();let clock=0, timerId=0;
  const advance = elapsed => {
    const end=clock+elapsed;
    while(true) {
      const next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next)break;
      clock=next[1].at;timers.delete(next[0]);next[1].callback();
    }
    clock=end;
  };
  const context = vm.createContext({ document, window, innerHeight:900, scrollY:0,
    matchMedia: query => query.includes('reduced-motion') ? reduce : pointer,
    localStorage: { getItem(key) { if(storageDenied)throw Error('denied');return preferences[key] ?? null; }, setItem(key,value) { if(storageDenied)throw Error('denied');preferences[key]=value; } },
    requestAnimationFrame: callback => { frames.push(callback); return frames.length; },
    setTimeout: (callback, delay) => { const id=++timerId;timers.set(id,{callback,at:clock+delay});return id; },
    clearTimeout: id => timers.delete(id)
  });
  vm.runInContext(startup,context);vm.runInContext(interaction,context);
  const flush = () => { for(const fn of frames.splice(0)) fn(); };
  flush();
  return { root, nodes, layers, preferences, reduce, pointer, document, window, context, flush, advance, timers };
}
const page = mount();
assert.equal(page.root.dataset.mode,'day');assert.equal(page.root.dataset.weather,'dry');
page.nodes['[data-scene-rain]'].emit('click');
assert.equal(page.root.dataset.weather,'rain');assert.equal(page.root.dataset.mode,'day');
page.nodes['[data-scene-time]'].emit('click');
assert.equal(page.root.dataset.mode,'day','Home lighting waits until pedestrian overlap');
assert.equal(page.nodes['[data-cafe-transition]'].hidden,false);
page.advance(1100);
assert.equal(page.root.dataset.mode,'night');assert.equal(page.root.dataset.weather,'rain');
assert.equal(page.nodes['[data-scene-time]'].attrs['aria-pressed'],'true');
assert.equal(page.nodes['[data-scene-status]'].textContent,'夜晚 · 雨天');
page.advance(1700);
assert.equal(page.nodes['[data-cafe-transition]'].hidden,true);
assert.equal(page.timers.size,0);
const nextPage=mount({saved:page.preferences});
assert.equal(nextPage.root.dataset.mode,'night');assert.equal(nextPage.root.dataset.weather,'rain');
nextPage.nodes['[data-scene-rain]'].emit('click');
assert.equal(nextPage.root.dataset.weather,'dry');assert.equal(nextPage.root.dataset.mode,'night');
page.nodes['[data-cafe-scene]'].emit('pointermove',{pointerType:'mouse',clientX:900,clientY:400});page.flush();
assert.notEqual(page.layers.at(-1).style.transform,'');
page.nodes['.motion-toggle'].emit('click');page.flush();
assert.equal(page.root.dataset.motion,'off');assert.equal(page.layers.at(-1).style.transform,'');
assert.equal(mount({saved:page.preferences}).root.dataset.motion,'off');
const system=mount({reduced:true});
assert.equal(system.root.dataset.motion,'off');assert.equal(system.nodes['.motion-toggle'].disabled,true);
system.reduce.matches=false;system.reduce.emit('change');system.flush();
assert.equal(system.root.dataset.motion,'on');assert.equal(system.nodes['.motion-toggle'].disabled,false);
const denied=mount({storageDenied:true});denied.nodes['[data-scene-time]'].emit('click');denied.advance(2800);assert.equal(denied.root.dataset.mode,'night');
const touch=mount({fine:false});touch.nodes['[data-cafe-scene]'].emit('pointermove',{pointerType:'touch',clientX:900,clientY:400});touch.flush();assert.equal(touch.layers.at(-1).style.transform,'');
page.context.scrollY=800;page.window.emit('scroll');page.flush();assert.equal(page.nodes['.back-top'].hidden,false);
page.nodes['.back-top'].emit('click');assert.equal(page.window.lastScroll.behavior,'instant');
// Other routes must retain the original immediate toggle and contain no crowd.
const articleHtml=readFileSync('dist/about/index.html','utf8');
assert(!/<div[^>]+data-cafe-transition/.test(articleHtml) && !articleHtml.includes('data-cafe-person='));
assert(html.includes('data-cafe-person="staff"') && html.includes('data-cafe-person="guest"'));
const article=mount({home:false});article.nodes['[data-scene-time]'].emit('click');
assert.equal(article.root.dataset.mode,'night');assert.equal(article.timers.size,0);
const quick=mount();quick.nodes['[data-scene-time]'].emit('click');quick.advance(300);quick.nodes['[data-scene-time]'].emit('click');quick.advance(2500);
assert.equal(quick.root.dataset.mode,'day');assert.equal(quick.nodes['[data-cafe-transition]'].hidden,true);
const late=mount();late.nodes['[data-scene-time]'].emit('click');late.advance(1100);late.nodes['[data-scene-time]'].emit('click');late.advance(3000);
assert.equal(late.root.dataset.mode,'day','A late reversal changes during the next pedestrian overlap');
late.advance(2000);assert.equal(late.nodes['[data-cafe-transition]'].hidden,true);assert.equal(late.timers.size,0);
const cancelled=mount();cancelled.nodes['[data-scene-time]'].emit('click');cancelled.advance(1200);
cancelled.nodes['[data-scene-time]'].emit('click');cancelled.advance(1600);
cancelled.nodes['[data-scene-time]'].emit('click');cancelled.advance(32);
assert.equal(cancelled.root.dataset.mode,'night');assert.equal(cancelled.nodes['[data-cafe-transition]'].hidden,true);assert.equal(cancelled.timers.size,0);
cancelled.nodes['[data-scene-time]'].emit('click');cancelled.advance(2800);
assert.equal(cancelled.root.dataset.mode,'day');assert.equal(cancelled.nodes['[data-cafe-transition]'].hidden,true);assert.equal(cancelled.timers.size,0);
for(const interrupt of ['reduce','pause','hide','leave']) {
  const active=mount();active.nodes['[data-scene-time]'].emit('click');active.advance(200);
  if(interrupt==='reduce') {active.reduce.matches=true;active.reduce.emit('change');}
  if(interrupt==='pause') active.nodes['.motion-toggle'].emit('click');
  if(interrupt==='hide') {active.document.hidden=true;active.document.emit('visibilitychange');}
  if(interrupt==='leave') active.window.emit('pagehide');
  assert.equal(active.root.dataset.mode,'night');assert.equal(active.nodes['[data-cafe-transition]'].hidden,true);assert.equal(active.timers.size,0);
  active.advance(6000);assert.equal(active.root.dataset.mode,'night');
}
const staticHome=mount({reduced:true});staticHome.nodes['[data-scene-time]'].emit('click');
assert.equal(staticHome.root.dataset.mode,'night');assert.equal(staticHome.nodes['[data-cafe-transition]'].hidden,true);assert.equal(staticHome.timers.size,0);
console.log('PASS: home-only pedestrian timing, rapid reversals, interruption cleanup, reduced motion, unchanged other-page toggles, seamless rain, preferences, weather, storage, parallax and back-to-top.');
