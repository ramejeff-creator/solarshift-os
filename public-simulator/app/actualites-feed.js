/* Pure selection rules shared by the preview and its future application adapter. */
(function(root){
  'use strict';
  const DAY=86400000;
  function dateValue(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value||'')) return NaN;
    const ms=Date.parse(value+'T00:00:00Z');
    return Number.isFinite(ms)&&new Date(ms).toISOString().slice(0,10)===value?ms:NaN;
  }
  function parisDay(now){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(now||new Date());}
  function archiveDate(item,policy){
    const published=dateValue(item.published_date);
    if(!Number.isFinite(published)) return null;
    const archiveAt=published+policy.archive_after_days*DAY;
    return new Date(archiveAt).toISOString().slice(0,10);
  }
  function isArchived(item,policy,today){const at=archiveDate(item,policy);return at!==null&&today>=at;}
  function select(feed,state,today){
    const visible=feed.items.filter(item=>dateValue(item.published_date)<=dateValue(today));
    const themes=new Set(feed.themes.map(t=>t.id));
    const theme=themes.has(state.theme)?state.theme:'all';
    const recent=visible.filter(i=>!isArchived(i,feed.policy,today));
    const archives=visible.filter(i=>isArchived(i,feed.policy,today));
    const byTheme=items=>items.filter(i=>theme==='all'||i.theme===theme);
    const archiveThemes=byTheme(archives);
    const months=[...new Set(archiveThemes.map(i=>i.published_date.slice(0,7)))].sort().reverse();
    const month=months.includes(state.month)?state.month:'all';
    const view=state.view==='archives'?'archives':'recent';
    const rows=byTheme(view==='archives'?archives:recent)
      .filter(i=>view!=='archives'||month==='all'||i.published_date.startsWith(month))
      .sort((a,b)=>b.published_date.localeCompare(a.published_date)||a.id.localeCompare(b.id));
    const pages=Math.max(1,Math.ceil(rows.length/feed.policy.page_size));
    const requested=Number.parseInt(state.page,10);
    const page=Math.min(pages,Math.max(1,Number.isFinite(requested)?requested:1));
    return {theme,view,month,page,pages,total:rows.length,months,counts:{recent:byTheme(recent).length,archives:archiveThemes.length},items:rows.slice((page-1)*feed.policy.page_size,page*feed.policy.page_size)};
  }
  const api={dateValue,parisDay,archiveDate,isArchived,select};
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  root.OzenoNews=api;
  if(typeof document==='undefined')return;
  if(!document.querySelector('.actualitesMain'))return;
  fetch('./actualites-data.json',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('Le flux Actualités est indisponible.');return response.json();}).then(feed=>{
  const qs=new URLSearchParams(location.search);
  let state={theme:qs.get('theme')||'all',view:qs.get('vue')||'recent',month:qs.get('mois')||'all',page:qs.get('page')||1};
  const el=id=>document.getElementById(id);
  const updated=el('news-updated');
  if(updated&&feed.updated_at)updated.textContent='Sources vérifiées le '+new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(feed.updated_at+'T00:00:00Z'));
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const formatDate=s=>new Intl.DateTimeFormat('fr-FR',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(s+'T00:00:00Z'));
  const formatMonth=s=>new Intl.DateTimeFormat('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(s+'-01T00:00:00Z'));
  const safeLink=url=>{try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}};
  const section=(title,text)=>text?'<p><strong>'+esc(title)+'</strong>'+esc(text)+'</p>':'';
  const statusLabels={published:'Information publiée',adopted:'Texte adopté · effet à venir',in_force:'En vigueur',suspended:'Dépôts suspendus',closed:'Guichet clos',proposal:'Projet · non applicable'};
  const milestoneLabels={effective_date:'Entrée en vigueur',filing_deadline:'Date limite de dépôt',compliance_date:'Échéance de conformité'};
  const profileLabels={developpeurs_photovoltaique:'Développeurs photovoltaïques',investisseurs:'Investisseurs',entreprises:'Entreprises',operateurs_chaleur:'Opérateurs de chaleur renouvelable',professionnels_irve_ouvert_public:'Professionnels IRVE · ouvert au public',proprietaires_systemes_thermiques:'Propriétaires des systèmes thermiques',etablissements_tertiaires_assujettis:'Établissements tertiaires assujettis'};
  const projectLabels={photovoltaique:'Photovoltaïque',stockage:'Stockage',chaleur_renouvelable:'Chaleur renouvelable',renovation_tertiaire:'Rénovation tertiaire',irve:'IRVE',bacs:'BACS',eet:'Éco Énergie Tertiaire'};
  function milestonesFor(item,today){
    const explicit=Array.isArray(item.milestones)?item.milestones:[];
    const fallback=[['effective_date',item.effective_date],['filing_deadline',item.filing_deadline||item.deadline],['compliance_date',item.compliance_date]]
      .filter(([,date])=>date).map(([type,date])=>({type,date,label:milestoneLabels[type]}));
    const rows=[...fallback];
    for(const milestone of explicit){const index=rows.findIndex(row=>row.type===milestone.type&&row.date===milestone.date);if(index<0)rows.push(milestone);else rows[index]={...rows[index],...milestone};}
    return rows.filter(m=>dateValue(m.date)>dateValue(today)&&item.record_status!=='proposal')
      .map(m=>({...m,item}));
  }
  function card(item){
    const theme=feed.themes.find(t=>t.id===item.theme);
    const links=item.sources.map(s=>{const href=safeLink(s.url);return href?'<a href="'+esc(href)+'" target="_blank" rel="noopener noreferrer">'+esc(s.label)+' ↗</a>':'';}).join('');
    const implication=item.impact?'<aside class="oz-news-implication"><strong>'+esc(item.impact_label||'Implication OZENO')+'</strong><p>'+esc(item.impact)+'</p></aside>':'';
    return '<article class="oz-news-card" id="news-item-'+esc(item.id)+'" data-news-id="'+esc(item.id)+'"><div class="oz-news-meta"><span class="oz-news-category '+esc(item.theme)+'">'+esc(theme?.label||item.theme)+'</span>'+(statusLabels[item.record_status]?'<span class="oz-news-meta-status">'+esc(statusLabels[item.record_status])+'</span>':'')+'<time datetime="'+esc(item.published_date)+'">'+esc(item.date_label||'Publié le')+' '+esc(formatDate(item.published_date))+'</time></div><h2>'+esc(item.title)+'</h2><p class="oz-news-summary">'+esc(item.summary)+'</p><div class="oz-news-badges"><span>'+esc(item.kind)+'</span>'+(item.tags||[]).map(t=>'<span>'+esc(t)+'</span>').join('')+'</div>'+implication+'<details class="oz-news-detail"><summary>Détails de la publication</summary><section>'+section('Faits confirmés · '+item.territory,item.facts)+section('Public professionnel concerné',(item.professional_profiles||[]).map(p=>profileLabels[p]||p).join(', '))+section('Montants et calendrier',item.amounts)+section('Impact Funding',item.funding_impact==='direct'?'Direct':item.funding_impact==='indirect'?'Indirect':item.funding_impact==='none'?'Aucun impact Funding identifié':'')+'</section></details><div class="oz-news-sources">'+links+'</div></article>';
  }
  for(const t of feed.themes){const option=document.createElement('option');option.value=t.id;option.textContent=t.label;el('news-theme').append(option);}
  function syncUrl(){
    const url=new URL(location.href);
    for(const [key,value]of [['theme',state.theme==='all'?null:state.theme],['vue',state.view==='recent'?null:state.view],['mois',state.view==='archives'&&state.month!=='all'?state.month:null],['page',state.page>1?state.page:null]]){if(value===null)url.searchParams.delete(key);else url.searchParams.set(key,String(value));}
    try{history.replaceState(null,'',url);}catch{/* Opening a local file may disallow URL replacement. */}
  }
  let allDeadlines=false;
  function renderDeadlines(today){
    const theme=el('news-theme').value||'all';
    const rows=feed.items.filter(i=>theme==='all'||i.theme===theme)
      .flatMap(i=>milestonesFor(i,today))
      .sort((a,b)=>a.date.localeCompare(b.date)||a.item.title.localeCompare(b.item.title));
    const list=el('news-deadline-list'),count=el('news-deadline-count'),empty=el('news-deadline-empty'),toggle=el('news-deadline-toggle');
    count.textContent=rows.length+' date'+(rows.length===1?'':'s');
    empty.hidden=rows.length!==0;
    const limit=feed.policy.deadline_preview_limit||5;
    const shown=allDeadlines?rows:rows.slice(0,limit);
    list.innerHTML=shown.map(m=>'<li class="oz-news-deadline-item"><span class="oz-news-deadline-date">'+esc(formatDate(m.date))+'</span><span class="oz-news-deadline-copy"><span class="oz-news-deadline-type">'+esc(milestoneLabels[m.type]||m.type)+'</span><strong>'+esc(m.label||m.item.title)+'</strong><span>'+esc(m.item.title)+' · '+esc(m.item.territory||'Territoire non précisé')+'</span></span><button type="button" class="oz-news-deadline-open" data-open-news="'+esc(m.item.id)+'">Voir la fiche</button></li>').join('');
    toggle.hidden=rows.length<=limit;
    toggle.setAttribute('aria-expanded',String(allDeadlines));
    toggle.textContent=allDeadlines?'Réduire la liste':'Afficher les '+(rows.length-limit)+' autres dates';
  }
  function render(updateUrl=true){
    const result=select(feed,state,parisDay());state={theme:result.theme,view:result.view,month:result.month,page:result.page};
    el('news-theme').value=state.theme;
    renderDeadlines(parisDay());
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===state.view)));
    document.querySelectorAll('[data-count]').forEach(n=>n.textContent=result.counts[n.dataset.count]);
    el('news-month-field').hidden=state.view!=='archives';
    el('news-month').replaceChildren(new Option('Tous les mois','all'),...result.months.map(m=>new Option(formatMonth(m),m)));
    el('news-month').value=state.month;
    el('news-result-count').textContent=result.total+' actualité'+(result.total===1?'':'s')+(state.view==='archives'?' archivée'+(result.total===1?'':'s'):' à la une');
    el('news-grid').innerHTML=result.items.map(card).join('');
    el('news-empty').hidden=result.total!==0;
    el('news-empty-description').textContent=state.view==='archives'?'Les articles seront accessibles ici après leur archivage automatique. Vous pouvez aussi choisir un autre thème ou un autre mois.':'Essayez une autre thématique ou consultez les archives.';
    el('news-pagination').hidden=result.pages<=1;
    el('news-page').textContent='Page '+result.page+' sur '+result.pages;
    el('news-prev').disabled=result.page<=1;el('news-next').disabled=result.page>=result.pages;
    if(updateUrl)syncUrl();
  }
  function update(patch){state={...state,...patch};render();}
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>update({view:b.dataset.view,page:1,month:'all'})));
  el('news-theme').addEventListener('change',e=>{allDeadlines=false;update({theme:e.target.value,page:1,month:'all'});});
  el('news-deadline-toggle').addEventListener('click',()=>{allDeadlines=!allDeadlines;renderDeadlines(parisDay());});
  el('news-deadline-list').addEventListener('click',e=>{const button=e.target.closest('[data-open-news]');if(!button)return;const item=feed.items.find(i=>i.id===button.dataset.openNews);if(!item)return;const archived=isArchived(item,feed.policy,parisDay());const month=archived?item.published_date.slice(0,7):'all';const rows=feed.items.filter(i=>i.theme===item.theme&&isArchived(i,feed.policy,parisDay())===archived&&( !archived||i.published_date.startsWith(month))).sort((a,b)=>b.published_date.localeCompare(a.published_date)||a.id.localeCompare(b.id));state={theme:item.theme,view:archived?'archives':'recent',month,page:Math.floor(rows.findIndex(i=>i.id===item.id)/feed.policy.page_size)+1};render();requestAnimationFrame(()=>{const cardEl=document.getElementById('news-item-'+item.id);cardEl?.scrollIntoView({behavior:'smooth',block:'center'});const details=cardEl?.querySelector('details');if(details)details.open=true;});});
  el('news-month').addEventListener('change',e=>update({month:e.target.value,page:1}));
  el('news-prev').addEventListener('click',()=>update({page:state.page-1}));
  el('news-next').addEventListener('click',()=>update({page:state.page+1}));
  el('news-reset').addEventListener('click',()=>update({theme:'all',month:'all',page:1}));
  window.addEventListener('popstate',()=>{const p=new URLSearchParams(location.search);state={theme:p.get('theme')||'all',view:p.get('vue')||'recent',month:p.get('mois')||'all',page:p.get('page')||1};render(false);});
  let currentDay=parisDay();
  window.setInterval(()=>{const day=parisDay();if(day!==currentDay){currentDay=day;render();}},60000);
  window.addEventListener('focus',()=>render(false));
  render(false);
  }).catch(error=>{const status=document.getElementById('news-result-count');if(status)status.textContent=error.message||'Impossible de charger les actualités.';});
})(typeof window!=='undefined'?window:globalThis);
