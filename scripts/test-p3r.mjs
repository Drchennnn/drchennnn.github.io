import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { initReload } from '../src/scripts/reload.mjs';
import vm from 'node:vm';
const flush = async () => { for(let i=0;i<6;i++) await Promise.resolve(); };
class Element {
  dataset={}; attrs={}; handlers={}; children={}; textContent=''; disabled=false; hidden=false; offsetWidth=290;
  classList={items:new Set(),add:(v)=>this.classList.items.add(v),remove:(v)=>this.classList.items.delete(v),toggle:(v,on)=>on?this.classList.items.add(v):this.classList.items.delete(v),contains:(v)=>this.classList.items.has(v)};
  addEventListener(k,fn){(this.handlers[k]??=[]).push(fn)}
  emit(k,e={}){for(const fn of this.handlers[k]??[])fn(e)}
  querySelector(s){return this.children[s]??null}
  setAttribute(k,v){this.attrs[k]=v}
  getAttribute(k){return this.attrs[k]??null}
  contains(n){return n===this || Object.values(this.children).includes(n)}
  focus(){this.focused=true}
  scrollBy(v){this.lastScroll=v}
}
function mount({saved={},reduce=false,storageDenied=false,saveData=false,home=true,reject=false}={}) {
  const keys=['.motion-toggle','[data-scene-time]','.back-top','.menu-toggle','#main-nav'];
  if(home)keys.push('[data-hero-video]','.chapter-gallery','[data-gallery-prev]','[data-gallery-next]','.chapter-section');
  const nodes=Object.fromEntries(keys.map(k=>[k,new Element()]));
  nodes['[data-scene-time]'].children['[data-time-label]']=new Element();
  const doc=new Element();doc.documentElement=new Element();doc.documentElement.dataset={mode:'day',motion:'on'};doc.hidden=false;
  doc.querySelector=s=>nodes[s]??null;
  const card=new Element();card.dataset.chapter='1';const reveals=[new Element()];
  doc.querySelectorAll=s=>s==='[data-chapter]'&&home?[card]:s==='[data-reveal]'?reveals:[];
  const win=new Element(), prefs={...saved}, reduced=new Element();reduced.matches=reduce;
  win.localStorage={getItem:k=>{if(storageDenied)throw Error('denied');return prefs[k]??null},setItem:(k,v)=>{if(storageDenied)throw Error('denied');prefs[k]=v}};
  win.matchMedia=()=>reduced;win.navigator={connection:{saveData}};win.scrollY=0;win.scrollTo=x=>win.lastScroll=x;
  const observers=[];win.IntersectionObserver=class {constructor(fn,options){this.fn=fn;this.options=options;this.targets=[];observers.push(this)}observe(x){this.targets.push(x)}unobserve(x){this.targets=this.targets.filter(v=>v!==x)}};
  if(home){
    nodes['.chapter-gallery'].children['.chapter-card']=card;
    const video=nodes['[data-hero-video]'];video.dataset.src='/p3r/hero-loop.mp4';video.paused=true;video.plays=0;
    Object.defineProperty(video,'src',{get(){return this.attrs.src},set(v){this.attrs.src=v}});
    video.play=async()=>{video.plays++;if(reject)throw Error('autoplay denied');video.paused=false};video.pause=()=>{video.paused=true};
  }
  if (process.argv.includes('--compiled')) {
    const built = readFileSync('dist/index.html','utf8');
    const startup = [...built.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].find(m=>m[1].includes('localStorage'))[1];
    const moduleTag = built.match(/<script([^>]*type="module"[^>]*)>([\s\S]*?)<\/script>/);
    const modulePath = moduleTag[1].match(/src="([^"]+)"/)?.[1];
    const moduleCode = modulePath ? readFileSync(`dist${modulePath}`,'utf8') : moduleTag[2];
    const context = vm.createContext({document:doc,window:win,localStorage:win.localStorage,matchMedia:win.matchMedia});
    vm.runInContext(startup,context);vm.runInContext(moduleCode,context);
  } else initReload(doc,win);return {doc,win,nodes,reduced,prefs,observers,card,reveals,setReject:v=>{reject=v}};
}
const page=mount();await flush();
const video=page.nodes['[data-hero-video]'];
assert.equal(video.getAttribute('src'),'/p3r/hero-loop.mp4');assert.equal(video.muted,true);assert.equal(video.paused,false);assert(video.classList.contains('is-playing'));assert(!page.nodes['.film-toggle']);
page.nodes['.motion-toggle'].emit('click');await flush();assert(video.paused);assert.equal(page.prefs['reload-video'],undefined);
page.nodes['.motion-toggle'].emit('click');await flush();assert(!video.paused);
page.doc.hidden=true;page.doc.emit('visibilitychange');await flush();assert(video.paused);
page.doc.hidden=false;page.doc.emit('visibilitychange');await flush();assert(!video.paused);
const viewport=page.observers.find(o=>o.targets.includes(video));viewport.fn([{isIntersecting:false}]);await flush();assert(video.paused);viewport.fn([{isIntersecting:true}]);await flush();assert(!video.paused);
page.nodes['.motion-toggle'].emit('click');await flush();assert(video.paused);assert.equal(page.doc.documentElement.dataset.motion,'off');
page.nodes['.motion-toggle'].emit('click');await flush();assert(!video.paused);
page.reduced.matches=true;page.reduced.emit('change');await flush();assert(video.paused);assert(page.nodes['.motion-toggle'].disabled);
page.reduced.matches=false;page.reduced.emit('change');await flush();assert(!video.paused);
page.win.emit('pagehide');assert(video.paused);page.win.emit('pageshow');await flush();assert(!video.paused);
assert.equal(page.prefs['leblanc-mode'],undefined);
const reduced=mount({reduce:true});await flush();assert.equal(reduced.nodes['[data-hero-video]'].plays,0);assert.equal(reduced.nodes['[data-hero-video]'].getAttribute('src'),null);
for(const opts of [{saved:{'journal-motion':'off'}},{saveData:true}]){const p=mount(opts);await flush();assert.equal(p.nodes['[data-hero-video]'].plays,0)}
const blocked=mount({reject:true});await flush();assert(!blocked.nodes['[data-hero-video]'].classList.contains('is-playing'));blocked.setReject(false);blocked.doc.emit('click',{target:new Element(),pointerType:'touch'});await flush();assert(!blocked.nodes['[data-hero-video]'].paused);
blocked.nodes['[data-hero-video]'].emit('error');assert(!blocked.nodes['[data-hero-video]'].classList.contains('is-playing'));assert(blocked.nodes['[data-hero-video]'].paused);const failedPlays=blocked.nodes['[data-hero-video]'].plays;blocked.doc.emit('click',{target:new Element(),pointerType:'touch'});await flush();assert.equal(blocked.nodes['[data-hero-video]'].plays,failedPlays);
const later=mount({reject:true});await flush();const laterVideo=later.nodes['[data-hero-video]'];const laterViewport=later.observers.find(o=>o.targets.includes(laterVideo));laterViewport.fn([{isIntersecting:false}]);later.setReject(false);later.doc.emit('click',{target:new Element(),pointerType:'touch'});await flush();assert(laterVideo.paused);laterViewport.fn([{isIntersecting:true}]);await flush();assert(!laterVideo.paused, 'Offscreen interaction unlocks playback when returning to the hero');
const denied=mount({storageDenied:true});await flush();denied.nodes['.motion-toggle'].emit('click');await flush();assert.equal(denied.doc.documentElement.dataset.motion,'off');
const nonhome=mount({home:false});await flush();assert.equal(nonhome.prefs['leblanc-mode'],undefined);
const revisit=mount({saved:{'reload-video':'off','leblanc-mode':'night','leblanc-weather':'rain'}});await flush();assert(!revisit.nodes['[data-hero-video]'].paused, 'A new visit defaults to video regardless of the old per-video pause key');assert.equal(revisit.doc.documentElement.dataset.mode,'day');
const menu=page.nodes['.menu-toggle'], nav=page.nodes['#main-nav'];menu.emit('click');assert.equal(menu.attrs['aria-expanded'],'true');page.doc.emit('keydown',{key:'Escape'});assert.equal(menu.attrs['aria-expanded'],'false');assert(menu.focused);menu.emit('click');page.doc.emit('click',{target:new Element()});assert(!nav.classList.contains('is-open'));menu.emit('click');nav.emit('click',{target:{closest:()=>({})}});assert(!nav.classList.contains('is-open'));
page.nodes['[data-gallery-next]'].emit('click');assert.equal(page.nodes['.chapter-gallery'].lastScroll.left,315);page.nodes['.chapter-gallery'].emit('keydown',{target:page.nodes['.chapter-gallery'],key:'ArrowLeft',preventDefault(){}});assert.equal(page.nodes['.chapter-gallery'].lastScroll.left,-315);
page.win.scrollY=800;page.win.emit('scroll');assert(!page.nodes['.back-top'].hidden);page.nodes['.back-top'].emit('click');assert.equal(page.win.lastScroll.top,0);
const html=readFileSync('dist/index.html','utf8');assert(html.includes('RELOAD'));assert(html.includes('YOUR DAYS.'));assert(html.includes('LINK RELOAD'));assert(html.includes('青蓝档案'));assert(html.includes('P3R-RELOAD-1'));assert(!html.includes('film-toggle'));assert(!html.includes('播放背景影像'));assert(!html.includes('P3R PREVIEW'));assert(html.includes('/brand-reload.svg'));assert(!html.includes('data-scene-time'));assert(!html.includes('leblanc-mode'));assert(!html.includes('theme-toggle'));assert(html.includes('data-hero-video'));assert(!html.includes('data-scene-rain'));assert(!html.includes('rain-texture'));assert(!html.includes('leblanc-weather'));assert(!html.includes('雨歇之前'));
for(const href of ['/daily/','/study/','/photos/','/play/','/search/','/about/'])assert(html.includes(`href="${href}"`));
const css=readdirSync('dist/_astro').filter(n=>n.endsWith('.css')).map(n=>readFileSync(`dist/_astro/${n}`,'utf8')).join('');assert(css.includes('prefers-reduced-motion'));assert(css.includes('object-fit:cover'));
console.log('PASS: P3R autoplay, global pause/interaction retry, hidden/offscreen/reduced motion, storage failure, menu, gallery, no day/weather UI, labels and built assets.');
