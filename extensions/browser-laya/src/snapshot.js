(() => {
  if (!document.body) return null;
  const cache = window.__layaFast ||= { ids: new WeakMap(), nodes: new Map(), next: 1 };
  const identity = (e) => {
    if (!cache.ids.has(e)) cache.ids.set(e, cache.next++);
    const id = cache.ids.get(e); cache.nodes.set(id, e); return id;
  };
  for (const [id, e] of cache.nodes) if (!e.isConnected) cache.nodes.delete(id);
  const safe = (e) => !['password','file','hidden'].includes(e.type);
  const visible = (e) => {
    try { return !e.closest('[aria-hidden="true"],[inert]') && e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}); } catch { return true; }
  };
  const name = (e, seen=new Set()) => {
    if (!e || seen.has(e)) return '';
    seen.add(e);
    const ref = (e.getAttribute('aria-labelledby')||'').split(/\s+/).map(id=>{ try{ return name(document.getElementById(id)|| (e.getRootNode && (e.getRootNode()).getElementById && (e.getRootNode()).getElementById(id)), seen); } catch{ return ''; } }).filter(Boolean).join(' ');
    return ref || e.getAttribute('aria-label') || [...(e.labels||[])].map(l=>name(l,seen)).filter(Boolean).join(' ') || (['button','submit','reset'].includes(e.type)?e.value:'') || e.getAttribute('alt') || (e.tagName==='INPUT'?'':[...e.childNodes].map(n=>n.nodeType===3?n.textContent:n.nodeType===1&&n.getAttribute('aria-hidden')!=='true'?name(n,seen):'').join(' ').trim()) || e.getAttribute('title') || e.getAttribute('placeholder') || '';
  };
  const roles=['button','link','checkbox','radio','switch','tab','menuitem','option','gridcell','combobox','textbox','searchbox','spinbutton'];
  const selector='a[href],button,input,textarea,select,summary,[contenteditable="true"],'+roles.map(r=>'[role="'+r+'"]').join(',');
  const role = (e)=>{
    const ex=e.getAttribute('role'); if(roles.includes(ex)) return ex;
    if(e.tagName==='BUTTON'||e.tagName==='SUMMARY') return 'button';
    if(e.tagName==='A') return 'link';
    if(e.tagName==='SELECT') return 'combobox';
    if(e.tagName==='TEXTAREA'||e.isContentEditable) return 'textbox';
    if(e.tagName==='INPUT'){
      if(['checkbox','radio'].includes(e.type)) return e.type;
      if(['button','submit','reset','image'].includes(e.type)) return 'button';
      if(e.type==='search') return 'searchbox';
      if(e.type==='number') return 'spinbutton';
      if(['text','email','url','tel','password'].includes(e.type)) return 'textbox';
    }
    return null;
  };
  cache.pageKey=()=>[performance.timeOrigin,location.href,scrollX,scrollY,innerWidth,innerHeight,[...document.querySelectorAll('input,textarea,select')].filter(safe).map(e=>[identity(e),e.value,e.checked,e.selectedIndex,e.disabled,e.readOnly])];
  cache.guard=(e)=>{
    if(!e?.isConnected||!visible(e)) return null;
    const scope=e.closest('form,dialog,[role="dialog"],article,li,tr,[role="row"]')||e.parentElement;
    return [identity(e),role(e),name(e),e.value??null,e.checked??null,e.selectedIndex??null,e.readOnly??null,e.matches(':disabled'),e.getAttribute('aria-disabled'),e.getAttribute('aria-expanded'),e.getAttribute('aria-checked'),e.getAttribute('aria-selected'),e.getAttribute('href'),scope?.innerText?.slice(0,6000)||''];
  };
  // Collect all roots: document, shadowRoots, same-origin iframes (handles selectorshub shadow/iframe practice page)
  const roots = [document];
  const seenRoots = new Set();
  const queue = [document];
  while (queue.length) {
    const root = queue.shift();
    if (!root || seenRoots.has(root)) continue;
    seenRoots.add(root);
    roots.push(root);
    let els=[];
    try { els = root.querySelectorAll('*'); } catch { continue; }
    for (const el of els) {
      if (el.shadowRoot) queue.push(el.shadowRoot);
      if (el.tagName === 'IFRAME') {
        try {
          const doc = el.contentDocument;
          if (doc) queue.push(doc);
        } catch {}
      }
    }
  }
  const actions=[];
  const addAction = (e) => {
    if(!safe(e)||!visible(e)||e.matches(':disabled')||e.closest('[aria-disabled="true"]')) return;
    const r=e.getBoundingClientRect(), rname=role(e);
    if(!rname||r.width<=0||r.height<=0) return;
    if(rname==='gridcell'&&e.querySelector('button,[role="button"]')) return;
    const onscreen = r.top < innerHeight && r.bottom > 0 && r.left < innerWidth && r.right > 0;
    const base={node:identity(e),role:rname,label:name(e)||rname,rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, onscreen, frame: e.ownerDocument !== document ? 'iframe/shadow' : ''};
    for(const k of ['checked','selected','expanded']){const v=e.getAttribute('aria-'+k); if(v!==null) base[k]=v;}
    if(['checkbox','radio'].includes(e.type)) base.checked=String(e.checked);
    if(e.tagName==='SELECT'){
      for(const o of e.options) if(!o.selected&&!o.disabled&&!o.closest('optgroup[disabled]')) actions.push({...base,kind:'select',value:o.value,current_value:[...e.selectedOptions].map(o=>o.label).join(', '),label:base.label+' → '+o.label});
    } else {
      const editable=!e.readOnly&&e.getAttribute('aria-readonly')!=='true'&&(['textbox','searchbox','spinbutton'].includes(rname)||(rname==='combobox'&&['INPUT','TEXTAREA'].includes(e.tagName)));
      const value='value' in e?String(e.value):e.isContentEditable||rname==='combobox'?e.innerText.trim():'';
      actions.push({...base,kind:editable?'fill':'click',value});
      if(editable) actions.push({...base,kind:'click',value,label:'Open '+base.label});
    }
  };
  for (const root of roots) {
    let nodes=[];
    try { nodes = root.querySelectorAll(selector); } catch { continue; }
    for (const e of nodes) addAction(e);
  }
  // Capture page text across all roots up to 12k
  const MAX_TEXT=12000;
  const words=[]; let length=0;
  const walkRoot = (root) => {
    const body = root.body || root;
    const walker=document.createTreeWalker(body,NodeFilter.SHOW_TEXT);
    let node;
    while((node=walker.nextNode())&&length<MAX_TEXT){
      const v=node.textContent.trim(), p=node.parentElement;
      if(!v||!p||p.closest('script,style,noscript,template')||!visible(p)) continue;
      words.push(v); length+=v.length;
    }
  };
  for (const root of roots) { if(length>=MAX_TEXT) break; try{ walkRoot(root); } catch{} }
  // Also walk shadow roots explicitly for text inside shadow
  const fullText=words.join('\n');
  const text=fullText.slice(0,MAX_TEXT);
  const fullTextLength=fullText.length;
  const height=document.documentElement.scrollHeight;
  const page_key=cache.pageKey(), guards={};
  for(const a of actions) if(!(a.node in guards)) guards[a.node]=cache.guard(cache.nodes.get(a.node));
  const semantics=actions.map(({rect,onscreen,frame,...a})=>a);
  const marker=[performance.timeOrigin,location.href,scrollX,scrollY,innerWidth,innerHeight,document.title,text,semantics,page_key[6]];
  const omitted=Math.max(0,actions.length-250); actions.splice(250);
  actions.forEach((a,i)=>a.id='e'+(i+1));
  if(scrollY+innerHeight<height-2) actions.push({id:'scroll_down',kind:'scroll',label:'Scroll down',delta:560, role:'scroll'});
  if(scrollY>0) actions.push({id:'scroll_up',kind:'scroll',label:'Scroll up',delta:-560, role:'scroll'});
  actions.push({id:'wait',kind:'wait',label:'Wait for the page to update', role:'wait'});
  return {url:location.href,title:document.title,w:innerWidth,h:innerHeight,text,fullTextLength,scroll:{y:scrollY,height},actions,marker,page_key,guards,omitted_actions:omitted,fingerprint:JSON.stringify(marker).slice(0,64)};
})()
