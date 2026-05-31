// script.js — ED Recovery Resource Map

// ============================================================
// STATE
// ============================================================
let state = {
  entries: [],
  tasks: [],
  categories: {},  // { "Category Name": ["sub1","sub2"] }
  plan: { diagnosis:"BED", concerns:[], targets:[] },
  editing: null,
  viewingEntry: null,
  expandedEntry: null,
  tagOptions: null,
  openSubcategories: [],
  concernOptions: null,
  quickCaptures: [],
  changelog: []
};

let newCatMode = null; // 'category' or 'subcategory'
let managingTagGroup = null;
let newCatParentCategory = null;
let workspaceEntryId = null;
let quickCaptureToConvert = null;

const DEFAULT_TAG_OPTIONS = {
  diagnosis: ["ALL", "BED", "AN", "BN", "ARFID", "OSFED", "Atypical AN", "ED + neurodivergence", "ED + GI concerns", "ED + sports/dance"],
  behaviors: ["Restriction", "Binge eating", "Meal skipping", "Long gaps", "Post-binge restriction", "Food rules", "Shame", "Secretive eating", "Compensatory behaviors", "Calorie counting", "Body checking", "Avoidance"],
  skills: ["Regular eating", "Adequate intake", "Post-binge repair", "Flexible structure", "Urge coping", "Fullness tolerance", "Meal planning", "Relapse prevention", "Food flexibility"],
  status: ["ready", "draft", "idea", "link to resources", "in production", "needs revision", "priority build", "resource gap"]
};

const CATEGORY_SCHEMA_VERSION = '2026-05-30-clean-approved-category-set-v3-empty-folders';

const STARTER_SAMPLE_ENTRY_IDS = new Set([
  't001','t002','t003','t004','t005','t006','t007','t008','t009','t010','t011','t012','t013','t014','t015',
  'c001','c002','c003','r001','r002','r003','r004','r005','r006','r007','r008','r009','r010','r011','cr001'
]);
const STARTER_SAMPLE_TASK_IDS = new Set(['task001','task002','task003','task004','task005','task006','task007']);

const LEGACY_CATEGORY_MAP = {
  'Treatment Target': { category: 'Treatment Targets', subcategory: 'Regular Eating' },
  'Recovery Goal': { category: 'Treatment Targets', subcategory: 'Early Engagement' },
  'Benchmark': { category: 'Treatment Targets', subcategory: 'Adequacy' },
  'Concept': { category: 'Nutrition Education', subcategory: 'Food Groups' },
  'Patient Resource': { category: 'Resources / References', subcategory: 'Handouts' },
  'Clinician Resource': { category: 'Resources / References', subcategory: 'Guidelines' },
  'Intervention Idea': { category: 'Interventions', subcategory: 'Behavioral Experiments' },
  'Research Note': { category: 'Resources / References', subcategory: 'Articles' },
  'Future Project': { category: 'Projects / Ideas', subcategory: 'Future Handouts' }
};

// ============================================================
// INIT
// ============================================================
function init() {
  loadState();
  ensureCoreStateFields();
  if (state.entries.length === 0 && state.tasks.length === 0) {
    state.entries   = JSON.parse(JSON.stringify(STARTER_ENTRIES));
    state.tasks     = JSON.parse(JSON.stringify(STARTER_TASKS));
    state.categories= JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
    saveState();
  }
  if (!state.categories || Object.keys(state.categories).length === 0) { state.categories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES)); saveState(); }
  if (!Array.isArray(state.openSubcategories)) state.openSubcategories = [];
  ensureCoreStateFields();
  applyApprovedCategorySchema();
  ensureTagOptions();

  bindNav();
  bindLibrary();
  bindBuilder();
  bindTasks();
  bindModals();
  bindExport();
  bindQuickCapture();
  bindDiagAll();
  bindTaskLinkTabs();
  bindTagManager();
  bindRichEditors(document);

  renderLibrary();
  renderBuilder();
  renderTasks();
  renderQuickCaptures();
  renderRecentUpdates();
  updatePlanCount();
  populateCategoryFilters();
}

function loadState() {
  try { const s=localStorage.getItem('edRecoveryMap2'); if(s) state=JSON.parse(s); } catch(e){}
  // Migrate old task statuses
  if(state.tasks) {
    state.tasks.forEach(t=>{
      if(t.status==='backlog') t.status='not started';
      else if(t.status==='next') t.status='in progress';
      else if(t.status==='done') t.status='completed';
    });
  }
}

function ensureCoreStateFields() {
  if (!state || typeof state !== 'object') state = {};
  if (!Array.isArray(state.entries)) state.entries = [];
  if (!Array.isArray(state.tasks)) state.tasks = [];
  if (!state.categories || typeof state.categories !== 'object') state.categories = {};
  if (!Array.isArray(state.quickCaptures)) state.quickCaptures = [];
  if (!Array.isArray(state.changelog)) state.changelog = [];
  if (!Array.isArray(state.concernOptions)) state.concernOptions = [...BED_CONCERNS];
  if (!state.plan) state.plan = { diagnosis: 'BED', concerns: [], targets: [] };
  if (!Array.isArray(state.plan.concerns)) state.plan.concerns = [];
  if (!Array.isArray(state.plan.targets)) state.plan.targets = [];
  state.plan.targets.forEach(pt=>{
    if (typeof pt.introduced === 'undefined') pt.introduced = false;
    if (typeof pt.upcoming === 'undefined') pt.upcoming = false;
  });
  migrateTaskTypes();
}

function applyApprovedCategorySchema(){
  if (state.categorySchemaVersion === CATEGORY_SCHEMA_VERSION) return;
  const approved = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));

  // This version is intended to start as a clean index.
  // Clear any old demo/sample entries/tasks that may have been saved in browser storage
  // from earlier prototype versions. User-created entries added after this migration will persist.
  state.entries = [];
  state.tasks = [];
  state.categories = approved;
  state.openSubcategories = [];
  state.expandedEntry = null;
  state.categorySchemaVersion = CATEGORY_SCHEMA_VERSION;
  saveState();
}


function migrateTaskTypes(){
  const map = {
    'create patient resource':'create new resource',
    'create clinician resource':'create new resource',
    'add resources to tag':'add/link resources',
    'link existing resources':'add/link resources',
    'revise draft':'revise existing resource',
    'add benchmarks':'review/revise/expand section',
    'review concept':'review/revise/expand section',
    'consider product version':'misc / other'
  };
  (state.tasks||[]).forEach(t=>{ if(map[t.type]) t.type = map[t.type]; });
}

function logChange(type, label, detail='') {
  if(!Array.isArray(state.changelog)) state.changelog = [];
  state.changelog.unshift({
    id:'chg'+Date.now()+Math.random().toString(36).slice(2,6),
    type, label, detail,
    timestamp:new Date().toISOString()
  });
  state.changelog = state.changelog.slice(0, 200);
}

function saveState() { localStorage.setItem('edRecoveryMap2',JSON.stringify(state)); }

// ============================================================
// NAV
// ============================================================
function bindNav() {
  document.querySelectorAll('.nav-link').forEach(link=>{
    link.addEventListener('click',e=>{
      e.preventDefault();
      document.querySelectorAll('.nav-link').forEach(l=>l.classList.remove('active'));
      document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
      link.classList.add('active');
      document.getElementById('page-'+link.dataset.page).classList.add('active');
      if(link.dataset.page==='quick') renderQuickCaptures();
      if(link.dataset.page==='updates') renderRecentUpdates();
    });
  });
}

// ============================================================
// LIBRARY — INDEX VIEW
// ============================================================
function bindLibrary() {
  document.getElementById('btnAddEntry').addEventListener('click', openAddEntryModal);
  const topTaskBtn = document.getElementById('btnAddTaskTop');
  if(topTaskBtn) topTaskBtn.addEventListener('click', ()=>openAddTaskModal());
  const topCatBtn = document.getElementById('btnAddCategoryTop');
  if(topCatBtn) topCatBtn.addEventListener('click', ()=>openNewCatModal('choose'));
  document.getElementById('librarySearch').addEventListener('input', renderLibrary);
  document.getElementById('filterCategory').addEventListener('change', renderLibrary);
  document.getElementById('filterDiagnosis').addEventListener('change', renderLibrary);
  document.getElementById('filterStatus').addEventListener('change', renderLibrary);
  document.getElementById('btnSaveEntry').addEventListener('click', saveEntry);
  const delEntryBtn=document.getElementById('btnDeleteEntry');
  if(delEntryBtn) delEntryBtn.addEventListener('click', deleteCurrentEntry);
  document.getElementById('btnAddCategory').addEventListener('click', ()=>openNewCatModal('category'));
  document.getElementById('btnAddSubcategory').addEventListener('click', ()=>openNewCatModal('subcategory'));
  document.getElementById('entryCategory').addEventListener('change', ()=>{ populateSubcategorySelect(); toggleDescField(); });
  document.getElementById('btnAddResource').addEventListener('click', addResourceRow);
  document.getElementById('btnSaveNewCat').addEventListener('click', saveNewCat);
  const newCatType = document.getElementById('newCatType');
  if(newCatType) newCatType.addEventListener('change', updateNewCatTypeUI);
  const openCatManager = document.getElementById('btnOpenCategoryManager');
  if(openCatManager) openCatManager.addEventListener('click', openCategoryManager);
  const saveCatManager = document.getElementById('btnSaveCategoryManager');
  if(saveCatManager) saveCatManager.addEventListener('click', saveCategoryManager);
  const workspaceSave = document.getElementById('btnWorkspaceSave');
  if(workspaceSave) workspaceSave.addEventListener('click', saveEntryWorkspace);
  const workspaceAddRes = document.getElementById('btnWorkspaceAddResource');
  if(workspaceAddRes) workspaceAddRes.addEventListener('click', addWorkspaceResourceRow);
  const workspaceExpand = document.getElementById('btnWorkspaceExpand');
  if(workspaceExpand) workspaceExpand.addEventListener('click', expandWorkspaceToFullEdit);
}

function populateCategoryFilters() {
  const sel = document.getElementById('filterCategory');
  const current = sel.value;
  sel.innerHTML = '<option value="">All Categories</option>';
  Object.keys(state.categories).sort().forEach(cat=>{
    const o = document.createElement('option');
    o.value = cat; o.textContent = cat;
    if (cat === current) o.selected = true;
    sel.appendChild(o);
  });
}

function renderLibrary() {
  const search   = document.getElementById('librarySearch').value.toLowerCase();
  const catFilter= document.getElementById('filterCategory').value;
  const diagFilter=document.getElementById('filterDiagnosis').value;
  const statFilter=document.getElementById('filterStatus').value;
  const isSearching = search.length > 0;

  let entries = state.entries.filter(e=>{
    if (catFilter && e.category !== catFilter) return false;
    if (diagFilter && !(e.tags.diagnosis||[]).includes(diagFilter) && !(e.tags.diagnosis||[]).includes('ALL')) return false;
    if (statFilter && e.tags.status !== statFilter) return false;
    if (search) {
      const blob=[e.title,e.notes,e.category,e.subcategory,...(e.tags.diagnosis||[]),...(e.tags.behaviors||[]),...(e.tags.skills||[])].join(' ').toLowerCase();
      if (!blob.includes(search)) return false;
    }
    return true;
  });

  // Group by category then subcategory
  const grouped = {};
  entries.forEach(e=>{
    const cat = e.category||'Uncategorized';
    const sub = e.subcategory||'General';
    if (!grouped[cat]) grouped[cat]={};
    if (!grouped[cat][sub]) grouped[cat][sub]=[];
    grouped[cat][sub].push(e);
  });

  // Always show the full preloaded folder structure when no filters/search are active,
  // even if some categories/subcategories do not have entries yet.
  const showFullFolderStructure = !search && !catFilter && !diagFilter && !statFilter;
  if (showFullFolderStructure) {
    Object.keys(state.categories || {}).forEach(cat=>{
      if (!grouped[cat]) grouped[cat] = {};
      const subs = state.categories[cat] || [];
      if (subs.length === 0) grouped[cat]['General'] = [];
      subs.forEach(sub=>{ if (!grouped[cat][sub]) grouped[cat][sub] = []; });
    });
  }

  const container = document.getElementById('libraryIndex');
  if (Object.keys(grouped).length === 0) {
    container.innerHTML='<div class="empty-state"><p>No entries match your filters.</p></div>';
    return;
  }

  const sortedCats = Object.keys(grouped).sort((a,b) => a.localeCompare(b));

  container.innerHTML = sortedCats.map(cat=>{
    const subs = grouped[cat];
    const total = Object.values(subs).reduce((n,arr)=>n+arr.length,0);
    const subOrder = state.categories[cat]||[];
    const sortedSubs = Object.keys(subs).sort((a,b)=>{
      const ai=subOrder.indexOf(a),bi=subOrder.indexOf(b);
      if(ai===-1&&bi===-1) return a.localeCompare(b);
      if(ai===-1) return 1; if(bi===-1) return -1;
      return ai-bi;
    });
    const subsHTML = sortedSubs.map(sub=>{
      const rows = subs[sub].length ? subs[sub].map(e=>indexRowHTML(e)).join('') : '<tr class="index-empty-row"><td colspan="2" class="index-empty-cell">No entries yet.</td></tr>';
      const subKey = cat + '::' + sub;
      const isSubOpen = isSearching || (state.openSubcategories || []).includes(subKey);
      return `<div class="index-subcategory-block">
        <div class="index-subcategory-header" data-cat="${esc(cat)}" data-sub="${esc(sub)}">
          <span class="index-subcategory-title">${esc(sub)}</span>
          <span class="index-subcategory-count">${subs[sub].length}</span>
        </div>
        <div class="index-entry-table-wrap ${isSubOpen?'open':''}">
          <table class="index-row-table"><tbody>${rows}</tbody></table>
        </div>
      </div>`;
    }).join('');
    return `<div class="index-category-block">
      <div class="index-category-header" data-cat="${esc(cat)}">
        <span class="index-category-title">${esc(cat)}</span>
        <span class="index-category-count">${total}</span>
      </div>
      <div class="index-category-body">${subsHTML}</div>
    </div>`;
  }).join('');

  // Category collapse toggle
  container.querySelectorAll('.index-category-header').forEach(hdr=>{
    hdr.addEventListener('click',()=>{
      const body=hdr.nextElementSibling;
      body.style.display = body.style.display === 'none' ? '' : 'none';
    });
  });

  // Sub-category toggle — shows/hides entries
  container.querySelectorAll('.index-subcategory-header').forEach(hdr=>{
    hdr.addEventListener('click', e=>{
      const wrap=hdr.nextElementSibling;
      const key = hdr.dataset.cat + '::' + hdr.dataset.sub;
      if(!Array.isArray(state.openSubcategories)) state.openSubcategories = [];
      wrap.classList.toggle('open');
      const isOpen = wrap.classList.contains('open');
      if(isOpen && !state.openSubcategories.includes(key)) state.openSubcategories.push(key);
      if(!isOpen) state.openSubcategories = state.openSubcategories.filter(k=>k!==key);
      saveState();
    });
  });


  // Row click = expand details instead of opening edit directly
  container.querySelectorAll('.index-row-table tbody tr[data-id]').forEach(row=>{
    row.addEventListener('click',e=>{
      e.stopPropagation();
      if(e.target.closest('.card-btn')) return;
      state.expandedEntry = state.expandedEntry === row.dataset.id ? null : row.dataset.id;
      renderLibrary();
    });
  });
  bindExpandedEntryActions(container);
  container.querySelectorAll('.card-btn.task-btn').forEach(btn=>{
    btn.addEventListener('click',e=>{e.stopPropagation();openAddTaskModalFromEntry(btn.dataset.id);});
  });
}

function indexRowHTML(e) {
  const dotColor = statusDotColor(e.tags.status);
  const detail = state.expandedEntry === e.id ? entryDetailHTML(e) : '';
  return `<tr data-id="${e.id}" class="index-entry-row" title="Click to view details">
    <td class="index-title-cell">
      <span class="status-dot" style="background:${dotColor}" title="${esc(e.tags.status||'')}"></span>
      ${esc(e.title)}
    </td>
    <td class="index-actions-cell" style="width:90px">
      <button class="card-btn task-btn" data-id="${e.id}">+ Task</button>
    </td>
  </tr>${detail}`;
}

function entryDetailHTML(e) {
  const notes = e.notes ? `<div class="entry-detail-notes">${formatRichText(e.notes)}</div>` : '<div class="entry-detail-empty">No notes yet.</div>';
  const resources = (e.linkedResources||[]).length ? `<div class="entry-detail-resources">${(e.linkedResources||[]).map(r=>{
    const label = esc(r.title || r.url || 'Untitled resource');
    const link = r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${label}</a>` : `<span>${label}</span>`;
    return `<div class="entry-detail-resource">${link}${r.notes?`<div class="entry-detail-resource-note">${formatRichText(r.notes)}</div>`:''}</div>`;
  }).join('')}</div>` : '<div class="entry-detail-empty">No linked resources yet.</div>';
  return `<tr class="index-entry-detail-row" data-detail-for="${e.id}"><td colspan="2">
    <div class="entry-detail-panel">
      ${notes}
      ${resources}
    </div>
  </td></tr>`;
}

function bindExpandedEntryActions(scope) {
  scope.querySelectorAll('.entry-detail-panel').forEach(panel=>{
    panel.addEventListener('click',e=>{
      if(e.target.closest('a')) return;
      e.stopPropagation();
      const row = panel.closest('[data-detail-for]');
      const id = row ? row.dataset.detailFor : null;
      if(id) openEntryWorkspace(id);
    });
  });
}

function openEntryWorkspace(entryId){
  const entry = state.entries.find(x=>x.id===entryId);
  if(!entry) return;
  workspaceEntryId = entryId;
  document.getElementById('workspaceTitle').textContent = entry.title + ' — Notes & Resources';
  setRichEditorHTML('workspaceExistingNotes', entry.notes || '');
  setRichEditorHTML('workspaceNewNote', '');
  renderWorkspaceResourceRows(entry.linkedResources || []);
  showModal('modalEntryWorkspace');
  setTimeout(()=>document.getElementById('workspaceNewNote').focus(), 50);
}

function saveEntryWorkspace(){
  if(!workspaceEntryId) return;
  const entry = state.entries.find(x=>x.id===workspaceEntryId);
  if(!entry) return;
  const existing = getRichEditorHTML('workspaceExistingNotes');
  const newNote = getRichEditorHTML('workspaceNewNote');
  const today = new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
  entry.notes = existing;
  if(newNote){
    entry.notes = combineRichNotes(entry.notes, '<p><strong>[' + today + ']</strong></p>' + newNote);
  }
  entry.linkedResources = collectResourceRows('#workspaceResourcesList');
  entry.updated = new Date().toISOString().split('T')[0];
  saveState();
  hideModal('modalEntryWorkspace');
  workspaceEntryId = null;
  renderLibrary();
}

function expandWorkspaceToFullEdit(){
  if(!workspaceEntryId) return;
  const id = workspaceEntryId;
  saveEntryWorkspace();
  openEditEntryModal(id);
}

function renderWorkspaceResourceRows(resources){
  const list = document.getElementById('workspaceResourcesList');
  list.innerHTML = '';
  (resources||[]).forEach((r,i)=>list.appendChild(buildResourceRow(r,i)));
}

function addWorkspaceResourceRow(){
  const list = document.getElementById('workspaceResourcesList');
  list.appendChild(buildResourceRow({url:'',title:'',notes:''}, list.children.length));
}

function resolveDisplayDiag(tags) {
  if (tags.includes('ALL')) return ['All diagnoses'];
  return tags;
}



function deleteCurrentEntry(){
  if(!state.editing) return;
  const entry = state.entries.find(e=>e.id===state.editing);
  if(!entry) return;
  state.entries = state.entries.filter(e=>e.id!==state.editing);
  state.plan.targets = (state.plan.targets||[]).filter(t=>t.entryId!==state.editing);
  logChange('deleted entry', entry.title, entry.category || '');
  state.editing = null;
  saveState();
  hideModal('modalEntry');
  renderLibrary(); renderBuilder(); updatePlanCount(); renderRecentUpdates();
}

// ============================================================
// TAG OPTIONS / TAG MANAGER
// ============================================================
function ensureTagOptions(){
  if(!state.tagOptions) {
    state.tagOptions = JSON.parse(JSON.stringify(DEFAULT_TAG_OPTIONS));
    saveState();
    return;
  }
  Object.keys(DEFAULT_TAG_OPTIONS).forEach(group=>{
    if(!Array.isArray(state.tagOptions[group])) state.tagOptions[group] = [...DEFAULT_TAG_OPTIONS[group]];
  });
  saveState();
}

function renderTagOptions(){
  ensureTagOptions();
  const groups = ['diagnosis','behaviors','skills','status'];
  groups.forEach(group=>{
    const box = document.querySelector(`.tag-options[data-group="${group}"]`);
    if(!box) return;
    if(group==='status'){
      box.innerHTML = state.tagOptions.status.map(v=>`<label class="tag-check"><input type="radio" name="statusTag" value="${esc(v)}"> <span class="status-dot" style="background:${statusDotColor(v)}"></span> ${esc(titleCase(v))}</label>`).join('');
    } else if(group==='diagnosis'){
      box.innerHTML = state.tagOptions.diagnosis.map(v=>`<label class="tag-check" ${v==='ALL'?'id="diagAllLabel"':''}><input type="checkbox" ${v==='ALL'?'id="diagAll"':''} value="${esc(v)}"> ${esc(v==='ALL'?'All':v)}</label>`).join('');
    } else {
      box.innerHTML = state.tagOptions[group].map(v=>`<label class="tag-check"><input type="checkbox" value="${esc(v)}"> ${esc(v)}</label>`).join('');
    }
  });
  bindDiagAll();
  makeTagLabelsClickable();
}

function makeTagLabelsClickable(){
  document.querySelectorAll('#modalEntry .tag-row').forEach(row=>{
    const label = row.querySelector('.tag-row-label');
    const group = row.querySelector('.tag-options')?.dataset.group;
    if(!label || !group) return;
    const button = document.createElement('button');
    button.type='button';
    button.className='tag-row-label tag-manager-link';
    button.textContent=label.textContent;
    button.addEventListener('click',()=>openTagManager(group));
    label.replaceWith(button);
  });
}

function ensureTagSectionAtEnd(){
  const body=document.querySelector('#modalEntry .modal-body');
  const tagSection=document.querySelector('#modalEntry .tag-section');
  if(body && tagSection) body.appendChild(tagSection);
}

function bindTagManager(){
  const add=document.getElementById('btnAddManagedTag');
  const save=document.getElementById('btnSaveManagedTags');
  if(add) add.addEventListener('click',()=>addTagManagerRow(''));
  if(save) save.addEventListener('click',saveManagedTags);
}

function openTagManager(group){
  managingTagGroup=group;
  document.getElementById('modalTagManagerTitle').textContent='Manage '+titleCase(group)+' Tags';
  const rows=document.getElementById('tagManagerRows');
  rows.innerHTML='';
  (state.tagOptions[group]||[]).forEach(v=>addTagManagerRow(v));
  showModal('modalTagManager');
}

function addTagManagerRow(value){
  const rows=document.getElementById('tagManagerRows');
  const div=document.createElement('div');
  div.className='tag-manager-row';
  div.innerHTML=`<input type="text" value="${esc(value||'')}" placeholder="Tag name"><button type="button">Remove</button>`;
  div.querySelector('button').addEventListener('click',()=>div.remove());
  rows.appendChild(div);
}

function getCurrentTagSelections(){
  return {
    diagnosis: [...document.querySelectorAll('[data-group="diagnosis"] input[type="checkbox"]:checked')].map(c=>c.value),
    behaviors: [...document.querySelectorAll('[data-group="behaviors"] input:checked')].map(c=>c.value),
    skills: [...document.querySelectorAll('[data-group="skills"] input:checked')].map(c=>c.value),
    status: document.querySelector('input[name="statusTag"]:checked')?.value || ''
  };
}

function applyTagSelections(selection){
  if(!selection) return;
  (selection.diagnosis || []).forEach(v=>{
    const cb=document.querySelector(`[data-group="diagnosis"] input[value="${CSS.escape(v)}"]`);
    if(cb) cb.checked=true;
  });
  if((selection.diagnosis || []).includes('ALL')) setDiagAll(true);
  (selection.behaviors || []).forEach(v=>{
    const cb=document.querySelector(`[data-group="behaviors"] input[value="${CSS.escape(v)}"]`);
    if(cb) cb.checked=true;
  });
  (selection.skills || []).forEach(v=>{
    const cb=document.querySelector(`[data-group="skills"] input[value="${CSS.escape(v)}"]`);
    if(cb) cb.checked=true;
  });
  if(selection.status){
    const rb=document.querySelector(`input[name="statusTag"][value="${CSS.escape(selection.status)}"]`);
    if(rb) rb.checked=true;
  }
  document.querySelectorAll('#modalEntry .tag-check input').forEach(inp => {
    inp.closest('.tag-check').classList.toggle('selected', inp.checked);
  });
}

function saveManagedTags(){
  if(!managingTagGroup) return;
  const selection = getCurrentTagSelections();
  const vals=[...document.querySelectorAll('#tagManagerRows input')].map(i=>i.value.trim()).filter(Boolean);
  const unique=[...new Set(vals)];
  if(managingTagGroup==='diagnosis' && !unique.includes('ALL')) unique.unshift('ALL');
  state.tagOptions[managingTagGroup]=unique;
  saveState();
  hideModal('modalTagManager');
  renderTagOptions();
  applyTagSelections(selection);
  renderLibrary();
}

function titleCase(s){return String(s||'').replace(/\b\w/g,c=>c.toUpperCase());}

// ============================================================
// ENTRY MODAL — open/populate/save
// ============================================================
function populateCategorySelect(selectedCat) {
  const sel = document.getElementById('entryCategory');
  sel.innerHTML = '<option value="">Select category…</option>';
  Object.keys(state.categories).sort().forEach(cat=>{
    const o=document.createElement('option');
    o.value=cat; o.textContent=cat;
    if(cat===selectedCat) o.selected=true;
    sel.appendChild(o);
  });
}


function toggleDescField() {
  const row = document.getElementById('entryDescRow');
  if (row) row.style.display = 'none';
}
function populateSubcategorySelect() {
  const cat = document.getElementById('entryCategory').value;
  const sel = document.getElementById('entrySubcategory');
  const current = sel.value;
  sel.innerHTML = '<option value="">None</option>';
  const subs = (state.categories[cat]||[]);
  subs.forEach(sub=>{
    const o=document.createElement('option');
    o.value=sub; o.textContent=sub;
    if(sub===current) o.selected=true;
    sel.appendChild(o);
  });
}

function openAddEntryModal(prefill = {}) {
  if (prefill && prefill.target) prefill = {};
  state.editing = null;
  quickCaptureToConvert = prefill.quickCaptureId || null;
  document.getElementById('modalEntryTitle').textContent = 'Add Library Entry';
  const del=document.getElementById('btnDeleteEntry'); if(del) del.classList.add('hidden');
  clearEntryForm();
  renderTagOptions();
  ensureTagSectionAtEnd();
  populateCategorySelect('');
  populateSubcategorySelect();
  toggleDescField();
  renderResourceRows([]);
  if (prefill.title) document.getElementById('entryTitle').value = prefill.title;
  if (prefill.notes) setRichEditorHTML('entryNotes', plainTextToHTML(prefill.notes));
  if (prefill.link) renderResourceRows([{title: prefill.title || 'Quick capture link', url: prefill.link, notes: '', linkType: 'url'}]);
  // Default: All diagnosis checked
  setDiagAll(true);
  document.getElementById('chkAddTask').checked = true;
  showModal('modalEntry');
}

function openEditEntryModal(id) {
  const e = state.entries.find(x=>x.id===id);
  if(!e) return;
  state.editing = id;
  quickCaptureToConvert = null;
  document.getElementById('modalEntryTitle').textContent = 'Edit Entry';
  const del=document.getElementById('btnDeleteEntry'); if(del) del.classList.remove('hidden');
  clearEntryForm();
  renderTagOptions();
  ensureTagSectionAtEnd();
  populateCategorySelect(e.category||'');
  populateSubcategorySelect();
  toggleDescField();
  document.getElementById('entrySubcategory').value = e.subcategory||'';
  document.getElementById('entryTitle').value  = e.title||'';
  setRichEditorHTML('entryNotes', e.notes||'');

  // Tags
  const allDiag = ALL_DIAG;
  const diagTags = e.tags.diagnosis||[];
  const isAll = diagTags.includes('ALL') || (allDiag.every(d=>diagTags.includes(d)));
  if (isAll) {
    setDiagAll(true);
  } else {
    setDiagAll(false);
    diagTags.forEach(d=>{
      const cb=document.querySelector(`[data-group="diagnosis"] input[value="${CSS.escape(d)}"]`);
      if(cb) cb.checked=true;
    });
  }
  (e.tags.behaviors||[]).forEach(b=>{
    const cb=document.querySelector(`[data-group="behaviors"] input[value="${CSS.escape(b)}"]`);
    if(cb) cb.checked=true;
  });
  (e.tags.skills||[]).forEach(s=>{
    const cb=document.querySelector(`[data-group="skills"] input[value="${CSS.escape(s)}"]`);
    if(cb) cb.checked=true;
  });
  if(e.tags.status){
    const rb=document.querySelector(`input[name="statusTag"][value="${CSS.escape(e.tags.status)}"]`);
    if(rb) rb.checked=true;
  }

  renderResourceRows(e.linkedResources||[]);
  document.getElementById('chkAddTask').checked = true;
  // Sync .selected class for all checked inputs
  document.querySelectorAll('#modalEntry .tag-check input').forEach(inp => {
    inp.closest('.tag-check').classList.toggle('selected', inp.checked);
  });
  showModal('modalEntry');
}

function clearEntryForm() {
  ['entryTitle','entryDesc'].forEach(id=>{ const el=document.getElementById(id); if(el) el.value=''; });
  setRichEditorHTML('entryNotes','');
  document.querySelectorAll('#modalEntry input[type="checkbox"]').forEach(c=>{if(c.id!=='chkAddTask')c.checked=false;});
  document.querySelectorAll('#modalEntry input[type="radio"]').forEach(r=>r.checked=false);
  renderResourceRows([]);
}

function saveEntry() {
  const title = document.getElementById('entryTitle').value.trim();
  const cat   = document.getElementById('entryCategory').value;
  if(!title||!cat){alert('Please fill in Title and Category.');return;}

  const diagAll = document.getElementById('diagAll').checked;
  let diagTags;
  if(diagAll) {
    diagTags = ['ALL'];
  } else {
    diagTags = [...document.querySelectorAll('[data-group="diagnosis"] input[type="checkbox"]:checked')]
      .map(c=>c.value).filter(v=>v!=='ALL');
  }

  const behavTags = [...document.querySelectorAll('[data-group="behaviors"] input:checked')].map(c=>c.value);
  const skillTags = [...document.querySelectorAll('[data-group="skills"] input:checked')].map(c=>c.value);
  const statusTag = document.querySelector('input[name="statusTag"]:checked')?.value||'draft';
  const linked    = collectResourceRows();

  const entry = {
    id: state.editing||'e'+Date.now(),
    title,
    category: cat,
    subcategory: document.getElementById('entrySubcategory').value||'',
    desc:  '',
    notes: getRichEditorHTML('entryNotes'),
    tags: { diagnosis:diagTags, behaviors:behavTags, skills:skillTags, status:statusTag },
    linkedResources: linked,
    updated: new Date().toISOString().split('T')[0]
  };

  if(state.editing) {
    state.entries = state.entries.map(e=>e.id===state.editing?entry:e);
  } else {
    state.entries.push(entry);
    if (quickCaptureToConvert) {
      state.quickCaptures = (state.quickCaptures || []).filter(q => q.id !== quickCaptureToConvert);
      quickCaptureToConvert = null;
    }
  }

  // Auto-create task if checkbox checked
  if(document.getElementById('chkAddTask').checked) {
    state.tasks.push({
      id:'task'+Date.now(),
      title:`Link resources to: ${title}`,
      type:'link existing resources',
      related: cat+(entry.subcategory?' / '+entry.subcategory:''),
      priority:'medium',
      status:'backlog',
      notes:'Auto-created on entry save.',
      created: new Date().toISOString().split('T')[0]
    });
  }

  logChange(state.editing ? 'edited entry' : 'added entry', entry.title, entry.category || '');
  saveState();
  hideModal('modalEntry');
  renderLibrary();
  renderRecentUpdates();
  renderQuickCaptures();
  renderBuilder();
  renderTasks();
  populateCategoryFilters();
}

// ============================================================
// DIAGNOSIS "ALL" TOGGLE
// ============================================================
function bindDiagAll() {
  const diagAll = document.getElementById('diagAll');
  if(diagAll){
    diagAll.addEventListener('change', function(){ setDiagAll(this.checked); });
  }
  document.querySelectorAll('#modalEntry .tag-check input').forEach(inp => {
    inp.addEventListener('change', () => {
      if (inp.type === 'radio') {
        document.querySelectorAll(`#modalEntry input[name="${inp.name}"]`).forEach(r => {
          r.closest('.tag-check').classList.toggle('selected', r.checked);
        });
      } else {
        inp.closest('.tag-check').classList.toggle('selected', inp.checked);
      }
    });
  });
}

function setDiagAll(checked) {
  const allCb = document.getElementById('diagAll');
  if(!allCb) return;
  allCb.checked = checked;
  const others = document.querySelectorAll('[data-group="diagnosis"] input[type="checkbox"]:not(#diagAll)');
  others.forEach(cb=>{ cb.checked=checked; cb.disabled=checked; cb.closest('.tag-check').classList.toggle('selected', checked); });
  const allLabel = document.getElementById('diagAllLabel');
  if(allLabel) allLabel.classList.toggle('selected', checked);
}

// ============================================================
// NEW CATEGORY / SUBCATEGORY MODAL
// ============================================================
function openNewCatModal(mode) {
  newCatMode = mode === 'choose' ? 'category' : mode;
  newCatParentCategory = null;
  populateNewCatParentSelect();
  const typeSel = document.getElementById('newCatType');
  if(typeSel){
    typeSel.disabled = mode !== 'choose';
    typeSel.value = newCatMode === 'subcategory' ? 'subcategory' : 'category';
  }
  document.getElementById('newCatName').value = '';
  updateNewCatTypeUI();
  showModal('modalNewCat');
  setTimeout(()=>document.getElementById('newCatName').focus(),100);
}

function populateNewCatParentSelect(){
  const sel = document.getElementById('newCatParentSelect');
  if(!sel) return;
  const current = document.getElementById('entryCategory')?.value || document.getElementById('filterCategory')?.value || '';
  sel.innerHTML = '';
  Object.keys(state.categories).sort().forEach(cat=>{
    const o=document.createElement('option');
    o.value=cat; o.textContent=cat;
    if(cat===current) o.selected=true;
    sel.appendChild(o);
  });
}

function updateNewCatTypeUI(){
  const type = document.getElementById('newCatType')?.value || 'category';
  newCatMode = type;
  document.getElementById('modalNewCatTitle').textContent = type==='category'?'Add Category':'Add Subcategory';
  document.getElementById('newCatLabel').textContent = type==='category'?'Category name':'Subcategory name';
  const parentRow = document.getElementById('newCatParentRow');
  if(parentRow) parentRow.style.display = type==='subcategory' ? '' : 'none';
}

function saveNewCat() {
  const name = document.getElementById('newCatName').value.trim();
  if(!name){alert('Please enter a name.');return;}
  const mode = document.getElementById('newCatType')?.value || newCatMode || 'category';
  if(mode==='category'){
    if(!state.categories[name]) state.categories[name]=[];
    saveState();
    populateCategorySelect(name);
    populateCategoryFilters();
  } else {
    const cat = document.getElementById('newCatParentSelect')?.value || document.getElementById('entryCategory')?.value;
    if(!cat){alert('Please select a Category first.');return;}
    if(!state.categories[cat]) state.categories[cat]=[];
    if(!state.categories[cat].includes(name)) state.categories[cat].push(name);
    saveState();
    if(!document.getElementById('modalEntry').classList.contains('hidden')){
      populateCategorySelect(cat);
      document.getElementById('entryCategory').value = cat;
      populateSubcategorySelect();
      document.getElementById('entrySubcategory').value = name;
    }
    populateCategoryFilters();
  }
  hideModal('modalNewCat');
  if(!document.getElementById('modalCategoryManager')?.classList.contains('hidden')) renderCategoryManagerRows();
  renderLibrary();
}

function openCategoryManager(){
  renderCategoryManagerRows();
  showModal('modalCategoryManager');
}

function renderCategoryManagerRows(){
  const box=document.getElementById('categoryManagerRows');
  box.innerHTML='';
  Object.keys(state.categories).sort().forEach(cat=>{
    const wrap=document.createElement('div');
    wrap.className='category-manager-block';
    wrap.innerHTML=`<div class="category-manager-category"><input type="text" class="cm-cat-name" value="${esc(cat)}"><button type="button" class="cm-remove-cat">Remove</button></div><div class="category-manager-subs"></div>`;
    const subsBox=wrap.querySelector('.category-manager-subs');
    (state.categories[cat]||[]).forEach(sub=>{
      const row=document.createElement('div');
      row.className='category-manager-sub';
      row.innerHTML=`<span>Subcategory</span><input type="text" class="cm-sub-name" value="${esc(sub)}"><button type="button" class="cm-remove-sub">Remove</button>`;
      row.querySelector('.cm-remove-sub').addEventListener('click',()=>row.remove());
      subsBox.appendChild(row);
    });
    wrap.querySelector('.cm-remove-cat').addEventListener('click',()=>wrap.remove());
    box.appendChild(wrap);
  });
}

function saveCategoryManager(){
  const next={};
  document.querySelectorAll('#categoryManagerRows .category-manager-block').forEach(block=>{
    const cat=block.querySelector('.cm-cat-name').value.trim();
    if(!cat) return;
    next[cat]=[...block.querySelectorAll('.cm-sub-name')].map(i=>i.value.trim()).filter(Boolean);
  });
  state.categories=next;
  saveState();
  hideModal('modalCategoryManager');
  populateCategoryFilters();
  populateCategorySelect(document.getElementById('entryCategory')?.value || '');
  populateSubcategorySelect();
  renderLibrary();
}

// ============================================================
// LINKED RESOURCES — row-based UI
// ============================================================
function renderResourceRows(resources) {
  const list = document.getElementById('linkedResourcesList');
  list.innerHTML = '';
  (resources||[]).forEach((r,i)=>list.appendChild(buildResourceRow(r,i)));
}

function addResourceRow() {
  const list = document.getElementById('linkedResourcesList');
  const idx = list.children.length;
  list.appendChild(buildResourceRow({url:'',title:'',notes:''},idx));
}

function buildResourceRow(r, idx) {
  const div = document.createElement('div');
  div.className = 'linked-resource-item';
  const linkType = r.linkType || 'url';
  div.innerHTML = `
    <div class="linked-resource-fields">
      <div class="linked-resource-row">
        <input type="text" class="res-title" placeholder="Resource name / title" value="${esc(r.title||'')}" style="flex:1.2"/>
      </div>
      <div style="margin-top:4px">
        <div class="res-type-tabs">
          <button type="button" class="res-type-tab ${linkType==='url'?'active':''}" data-type="url">URL</button>
          <button type="button" class="res-type-tab ${linkType==='onedrive'?'active':''}" data-type="onedrive">OneDrive</button>
          <button type="button" class="res-type-tab ${linkType==='local'?'active':''}" data-type="local">Local</button>
        </div>
        <input type="text" class="res-url form-input ${linkType!=='none'?'visible':''}" placeholder="${linkType==='local'?'File path (e.g. /Users/you/Documents/file.pdf)':linkType==='onedrive'?'Paste OneDrive sharing link…':'Paste URL…'}" value="${esc(r.url||'')}" style="margin-top:4px;font-size:12px"/>
        <div class="res-onedrive-note ${linkType==='onedrive'?'visible':''}">Paste the sharing link from OneDrive (Share → Copy link)</div>
      </div>
      <div class="resource-notes-row" style="margin-top:4px">
        <div class="rich-editor-wrap" style="flex:1">
          <div class="rich-toolbar mini-toolbar">
            <button type="button" data-cmd="bold"><strong>B</strong></button>
            <button type="button" data-cmd="italic"><em>I</em></button>
            <button type="button" data-cmd="underline"><u>U</u></button>
            <button type="button" data-cmd="insertUnorderedList">• List</button>
            <button type="button" data-cmd="insertOrderedList">1. List</button>
            <button type="button" data-cmd="createLink">Link</button>
          </div>
          <div class="res-notes rich-editor resource-notes-rich" contenteditable="true" data-placeholder="Notes about this resource…">${normalizeRichForEdit(r.notes||'')}</div>
        </div>
        <button type="button" class="btn-cal" title="Insert today's date">📅</button>
      </div>
    </div>
    <button type="button" class="btn-remove-resource" title="Remove">✕</button>`;

  // Link type tab switching
  div.querySelectorAll('.res-type-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      div.querySelectorAll('.res-type-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const type = tab.dataset.type;
      const urlInp = div.querySelector('.res-url');
      const note = div.querySelector('.res-onedrive-note');
      urlInp.classList.add('visible');
      if (type === 'url') { urlInp.placeholder = 'Paste URL…'; note.classList.remove('visible'); }
      else if (type === 'onedrive') { urlInp.placeholder = 'Paste OneDrive sharing link…'; note.classList.add('visible'); }
      else { urlInp.placeholder = 'File path (e.g. /Users/you/Documents/file.pdf)'; note.classList.remove('visible'); }
      urlInp.focus();
    });
  });

  bindRichEditors(div);
  div.querySelector('.btn-cal').addEventListener('click',()=>{
    const editor=div.querySelector('.res-notes');
    const today=new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'});
    editor.focus();
    document.execCommand('insertHTML', false, '<strong>['+today+']</strong> ');
  });
  div.querySelector('.btn-remove-resource').addEventListener('click',()=>div.remove());
  return div;
}

function collectResourceRows(selector = '#linkedResourcesList') {
  const rows = document.querySelectorAll(selector + ' .linked-resource-item');
  return [...rows].map(row=>({
    title: row.querySelector('.res-title').value.trim(),
    url:   row.querySelector('.res-url').value.trim(),
    linkType: (row.querySelector('.res-type-tab.active')||{}).dataset?.type || 'url',
    notes: sanitizeRichHTML(row.querySelector('.res-notes').innerHTML)
  })).filter(r=>r.title||r.url);
}

// ============================================================
// VIEW MODAL
// ============================================================
function openViewModal(id) {
  const e = state.entries.find(x=>x.id===id);
  if(!e) return;
  state.viewingEntry = id;
  document.getElementById('viewTitle').textContent = e.title;

  const diagTags = resolveDisplayDiag(e.tags.diagnosis||[]);
  const allTags = [
    ...diagTags.map(t=>`<span class="tag-chip diag">${esc(t)}</span>`),
    ...(e.tags.behaviors||[]).map(t=>`<span class="tag-chip">${esc(t)}</span>`),
    ...(e.tags.skills||[]).map(t=>`<span class="tag-chip">${esc(t)}</span>`)
  ].join('');

  const resourcesHTML = (e.linkedResources||[]).length?
    e.linkedResources.map(r=>{
      const linkPart = r.url
        ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title||r.url)}</a>`
        : `<span>${esc(r.title||'Untitled')}</span>`;
      return `<div class="view-resource-item">
        <div class="view-resource-link">${linkPart}</div>
        ${r.notes?`<div class="view-resource-notes">${formatRichText(r.notes)}</div>`:''}
      </div>`;
    }).join('')
    :'<span style="color:var(--text-light);font-size:12px">None linked yet</span>';

  document.getElementById('viewBody').innerHTML=`
    <div class="view-section">
      <div class="view-label">Category / Sub-Category</div>
      <div class="view-value">${esc(e.category||'—')}${e.subcategory?' → '+esc(e.subcategory):''}</div>
    </div>
    ${e.notes?`<div class="view-section"><div class="view-label">Notes <em style="font-style:italic;font-weight:400;color:var(--text-light)">(private)</em></div><div class="view-value">${formatRichText(e.notes)}</div></div>`:''}
    <div class="view-section">
      <div class="view-label">Tags</div>
      <div class="view-tags">${allTags||'<span style="color:var(--text-light);font-size:12px">None</span>'}
        <span class="status-pill ${statusClass(e.tags.status)}">${esc(e.tags.status||'')}</span>
      </div>
    </div>
    <div class="view-section">
      <div class="view-label">Linked Resources</div>
      ${resourcesHTML}
    </div>
    <div style="color:var(--text-light);font-size:11px">Last updated: ${e.updated||'—'}</div>`;

  showModal('modalView');
}

// ============================================================
// PLAN BUILDER
// ============================================================
const BED_CONCERNS=["Binge eating","Chaotic eating","Meal skipping","Long gaps without food","Post-binge restriction","Compensatory behaviors/urges","Food rules","Forbidden foods","Shame after binges","Secretive eating","Weight cycling / diet history","Strong weight-loss focus","Body checking","Emotional triggers","Night eating / grazing","Low meal planning skills","Low cooking confidence","Decision fatigue","Low appetite or nausea","ADHD / executive functioning barriers","Busy schedule","Limited support","Food insecurity"];

function bindBuilder() {
  const clearBtn = document.getElementById('btnClearPlan');
  if(clearBtn) clearBtn.addEventListener('click',clearPlan);
  const exportBtn = document.getElementById('btnExport');
  if(exportBtn) exportBtn.addEventListener('click',openExport);
  const btnEditConcerns=document.getElementById('btnEditConcerns');
  if(btnEditConcerns) btnEditConcerns.addEventListener('click',openConcernManager);
  const saveConcerns=document.getElementById('btnSaveConcerns');
  if(saveConcerns) saveConcerns.addEventListener('click',saveConcernManager);
}
function renderConcernChips(){
  ensureCoreStateFields();
  const chipGroup=document.getElementById('concernChips');
  if(!chipGroup) return;
  chipGroup.innerHTML=(state.concernOptions||[]).map(c=>`<button class="chip concern-chip" data-concern="${esc(c)}">${esc(c)}</button>`).join('');
  chipGroup.querySelectorAll('.concern-chip').forEach(chip=>{
    if(state.plan.concerns.includes(chip.dataset.concern)) chip.classList.add('active');
    chip.addEventListener('click',()=>{
      chip.classList.toggle('active');
      const c=chip.dataset.concern;
      if(state.plan.concerns.includes(c)) state.plan.concerns=state.plan.concerns.filter(x=>x!==c);
      else state.plan.concerns.push(c);
      saveState(); renderSuggestedTargets();
    });
  });
}

function openConcernManager(){
  ensureCoreStateFields();
  document.getElementById('concernManagerText').value=(state.concernOptions||[]).join('\n');
  showModal('modalConcernManager');
}
function saveConcernManager(){
  const vals=document.getElementById('concernManagerText').value.split('\n').map(v=>v.trim()).filter(Boolean);
  state.concernOptions=[...new Set(vals)];
  state.plan.concerns=(state.plan.concerns||[]).filter(c=>state.concernOptions.includes(c));
  logChange('edited concerns','Plan Builder concern buttons', `${state.concernOptions.length} concerns available`);
  saveState(); hideModal('modalConcernManager'); renderConcernChips(); renderSuggestedTargets(); renderRecentUpdates();
}

function renderBuilder() {
  if(!document.getElementById('suggestedTargets') || !document.getElementById('planTargets')) return;
  renderConcernChips(); renderSuggestedTargets(); renderPlanTargets();
}

function renderSuggestedTargets() {
  const container=document.getElementById('suggestedTargets');
  const activeConcerns=state.plan.concerns||[];
  let targets=state.entries.filter(e=>['Treatment Target','Recovery Goal','Benchmark'].includes(e.category)&&((e.tags.diagnosis||[]).includes('BED')||(e.tags.diagnosis||[]).includes('ALL')));
  targets=targets.map(t=>{
    const overlap=(t.tags.behaviors||[]).filter(b=>activeConcerns.some(c=>c.toLowerCase().includes(b.toLowerCase())||b.toLowerCase().includes(c.toLowerCase().split('/')[0].trim()))).length;
    return{...t,score:overlap};
  });
  const domainOrder=Object.values(state.categories['Treatment Target']||[]);
  targets.sort((a,b)=>b.score!==a.score?b.score-a.score:(domainOrder.indexOf(a.subcategory)||99)-(domainOrder.indexOf(b.subcategory)||99));
  if(!targets.length){container.innerHTML='<div class="empty-state"><p>No treatment targets found.</p></div>';return;}
  const inPlanIds=new Set((state.plan.targets||[]).map(t=>t.entryId));
  container.innerHTML=targets.map(t=>{
    const inPlan=inPlanIds.has(t.id);
    return`<div class="target-card ${inPlan?'in-plan':''}" data-id="${t.id}" role="button" tabindex="0" title="${inPlan?'Click to remove from plan':'Click to add to plan'}">
      <div class="target-card-body">
        <div class="target-card-title">${esc(t.title)}</div>
        <div class="target-card-domain">${esc(t.subcategory||'')}</div>
      </div>
      ${!inPlan?'<div class="target-add-btn">+</div>':'<div style="font-size:11px;color:var(--accent);margin-top:2px">✓ Added<br><span style="color:var(--text-light)">click to remove</span></div>'}
    </div>`;
  }).join('');
  container.querySelectorAll('.target-card').forEach(card=>{
    card.addEventListener('click',()=>togglePlanTarget(card.dataset.id));
  });
}

function togglePlanTarget(entryId){
  if((state.plan.targets||[]).some(t=>t.entryId===entryId)) removePlanTarget(entryId, false);
  else addToPlan(entryId);
}

function addToPlan(entryId) {
  if(state.plan.targets.some(t=>t.entryId===entryId)) return;
  const entry=state.entries.find(e=>e.id===entryId);
  state.plan.targets.push({entryId,notes:'',introduced:false,upcoming:false});
  logChange('added to plan', entry ? entry.title : entryId, 'Plan Builder');
  saveState(); renderSuggestedTargets(); renderPlanTargets(); updatePlanCount(); renderLibrary(); renderRecentUpdates();
}

function removePlanTarget(id, isSubcat) {
  if(isSubcat) state.plan.targets=state.plan.targets.filter(t=>!(t.isSubcat && t.subcatKey===id));
  else state.plan.targets=state.plan.targets.filter(t=>t.entryId!==id);
  logChange('removed from plan', id, 'Plan Builder');
  saveState(); renderSuggestedTargets(); renderPlanTargets(); updatePlanCount(); renderLibrary(); renderRecentUpdates();
}

function renderPlanTargets() {
  const container=document.getElementById('planTargets');
  const empty=document.getElementById('planEmpty');
  if(!state.plan.targets.length){empty.style.display='';container.innerHTML='';return;}
  empty.style.display='none';
  container.innerHTML=state.plan.targets.map(pt=>{
    const entry=state.entries.find(e=>e.id===pt.entryId);
    if(!entry) return '';
    const resHTML=(entry.linkedResources||[]).map(r=>`<span class="plan-resource-chip">${esc(r.title||r.url||'')}</span>`).join('');
    return`<div class="plan-item" data-id="${pt.entryId}">
      <div class="plan-item-header">
        <div class="plan-item-title">${esc(entry.title)}</div>
        <button class="plan-item-remove" data-id="${pt.entryId}">✕</button>
      </div>
      <div class="plan-item-body">
        <div class="plan-check-row">
          <label class="checkbox-label"><input type="checkbox" class="plan-introduced-input" data-id="${pt.entryId}" ${pt.introduced?'checked':''}> <span>Introduced</span></label>
          <label class="checkbox-label"><input type="checkbox" class="plan-upcoming-input" data-id="${pt.entryId}" ${pt.upcoming?'checked':''}> <span>Upcoming</span></label>
        </div>
        <div class="plan-field-label">Notes</div>
        <textarea class="plan-notes-input" data-id="${pt.entryId}" rows="2" placeholder="Notes…">${pt.notes||''}</textarea>
        ${resHTML?`<div class="plan-linked-resources"><div class="plan-field-label">Linked resources</div>${resHTML}</div>`:''}
      </div>
    </div>`;
  }).join('');
  container.querySelectorAll('.plan-item-remove').forEach(btn=>btn.addEventListener('click',()=>removePlanTarget(btn.dataset.id, false)));
  container.querySelectorAll('.plan-notes-input').forEach(ta=>ta.addEventListener('blur',()=>{const pt=state.plan.targets.find(t=>t.entryId===ta.dataset.id);if(pt){pt.notes=ta.value;saveState();}}));
  container.querySelectorAll('.plan-introduced-input').forEach(inp=>inp.addEventListener('change',()=>{const pt=state.plan.targets.find(t=>t.entryId===inp.dataset.id);if(pt){pt.introduced=inp.checked;saveState();}}));
  container.querySelectorAll('.plan-upcoming-input').forEach(inp=>inp.addEventListener('change',()=>{const pt=state.plan.targets.find(t=>t.entryId===inp.dataset.id);if(pt){pt.upcoming=inp.checked;saveState();}}));
}

function clearPlan() {
  if(!confirm('Clear the working plan?')) return;
  state.plan.targets=[]; state.plan.concerns=[];
  logChange('cleared plan','Working plan','');
  saveState(); renderBuilder(); updatePlanCount(); renderRecentUpdates();
}
function updatePlanCount(){
  const num = document.getElementById('planCountNum');
  if(num) num.textContent = (state.plan?.targets || []).length;
}

// ============================================================
// TASKS
// ============================================================
let editingTaskId=null;
function bindTasks(){
  document.getElementById('btnAddTask').addEventListener('click',openAddTaskModal);
  document.getElementById('filterTaskStatus').addEventListener('change',renderTasks);
  document.getElementById('filterTaskType').addEventListener('change',renderTasks);
  document.getElementById('btnSaveTask').addEventListener('click',saveTask);
}
function renderTasks(){
  const fs=document.getElementById('filterTaskStatus').value;
  const ft=document.getElementById('filterTaskType').value;
  const statusOrder={'in progress':0,'brainstorming':1,'nearly done':2,'not started':3,'postponed':4,'completed':5};
  let filtered=state.tasks.filter(t=>{
    if(fs&&t.status!==fs) return false;
    if(ft&&t.type!==ft) return false;
    return true;
  }).sort((a,b)=>{
    const ao=statusOrder[a.status]??99, bo=statusOrder[b.status]??99;
    return ao!==bo ? ao-bo : (a.title||'').localeCompare(b.title||'');
  });
  const list=document.getElementById('taskList');
  if(!filtered.length){list.innerHTML='<div class="empty-state"><p>No tasks match your filters.</p></div>';return;}

  list.innerHTML=`<table class="task-table">
    <thead><tr>
      <th style="width:32px"></th>
      <th>Task</th>
      <th>Status</th>
      <th>Type / Related</th>
      <th>Actions</th>
    </tr></thead>
    <tbody>
    ${filtered.map(t=>{
      const done=t.status==='completed';
      const sc='ts-'+t.status.replace(/\s+/g,'-');
      const pc='priority-'+(t.priority||'low');
      const notesPreview=t.notes?`<div class="task-notes-preview">${esc(t.notes)}</div>`:'';
      const linkPreview=t.link?`<div class="task-link-preview"><a href="${esc(t.link)}" target="_blank" rel="noopener">↗ ${esc(t.link.length>40?t.link.substring(0,40)+'…':t.link)}</a></div>`:'';
      return`<tr data-id="${t.id}" class="${done?'task-row-done':''}">
        <td><input type="checkbox" class="task-check" data-id="${t.id}" ${done?'checked':''}></td>
        <td class="task-col-title">
          <div>${esc(t.title)}</div>
          ${notesPreview}${linkPreview}
        </td>
        <td class="task-col-status">
          <select class="task-status-select ${sc}" data-id="${t.id}">
            <option value="not started" ${t.status==='not started'?'selected':''}>Not started</option>
            <option value="in progress" ${t.status==='in progress'?'selected':''}>In progress</option>
            <option value="brainstorming" ${t.status==='brainstorming'?'selected':''}>Brainstorming</option>
            <option value="nearly done" ${t.status==='nearly done'?'selected':''}>Nearly done</option>
            <option value="completed" ${t.status==='completed'?'selected':''}>Completed</option>
            <option value="postponed" ${t.status==='postponed'?'selected':''}>Postponed</option>
          </select>
        </td>
        <td class="task-col-meta">
          <div>${esc(t.type||'')}</div>
          ${t.related?`<div style="color:var(--text-light);font-size:11px">${esc(t.related)}</div>`:''}
          <div class="${pc}" style="font-size:11px">${esc(t.priority||'low')} priority</div>
        </td>
        <td class="task-col-actions">
          <button class="btn-note" data-id="${t.id}" data-focus="notes">+Note</button>
          <button class="btn-link-shortcut" data-id="${t.id}" data-focus="link">+Link</button>
          <button class="card-btn edit-btn" data-id="${t.id}" style="margin-left:4px">Edit</button>
          <button class="card-btn task-delete-btn" data-id="${t.id}" style="margin-left:2px;color:var(--text-light)">✕</button>
        </td>
      </tr>`;
    }).join('')}
    </tbody>
  </table>`;

  // Checkbox toggling — now maps to completed/not started
  list.querySelectorAll('.task-check').forEach(chk=>chk.addEventListener('change',()=>{
    const task=state.tasks.find(t=>t.id===chk.dataset.id);
    if(task){task.status=chk.checked?'completed':'not started';saveState();renderTasks();}
  }));

  // Inline status dropdown change
  list.querySelectorAll('.task-status-select').forEach(sel=>sel.addEventListener('change',e=>{
    e.stopPropagation();
    const task=state.tasks.find(t=>t.id===sel.dataset.id);
    if(task){task.status=sel.value;saveState();renderTasks();}
  }));

  // Row click → edit (excluding interactive cells)
  list.querySelectorAll('tbody tr[data-id]').forEach(row=>{
    row.addEventListener('click',e=>{
      if(e.target.closest('button')||e.target.closest('select')||e.target.closest('input')) return;
      openEditTaskModal(row.dataset.id);
    });
  });

  // Edit button
  list.querySelectorAll('.card-btn.edit-btn').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();openEditTaskModal(btn.dataset.id);}));

  // Delete (X) button
  list.querySelectorAll('.task-delete-btn').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    const task=state.tasks.find(t=>t.id===btn.dataset.id);
    state.tasks=state.tasks.filter(t=>t.id!==btn.dataset.id);
    if(task) logChange('deleted task', task.title, task.type||'');
    saveState();renderTasks();renderRecentUpdates();
  }));

  // +Note button: open edit modal with cursor in notes
  list.querySelectorAll('.btn-note').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    openEditTaskModal(btn.dataset.id, 'notes');
  }));

  // +Link button: open edit modal with cursor in link field
  list.querySelectorAll('.btn-link-shortcut').forEach(btn=>btn.addEventListener('click',e=>{
    e.stopPropagation();
    openEditTaskModal(btn.dataset.id, 'link');
  }));
}
function openAddTaskModal(){editingTaskId=null;document.getElementById('modalTaskTitle').textContent='Add Task';clearTaskForm();showModal('modalTask');}
function openAddTaskModalFromEntry(entryId){
  const entry=state.entries.find(e=>e.id===entryId);
  editingTaskId=null;document.getElementById('modalTaskTitle').textContent='Add Task';clearTaskForm();
  if(entry){document.getElementById('taskTitle').value='Create resource for: '+entry.title;document.getElementById('taskRelated').value=entry.title;}
  showModal('modalTask');
}
function openEditTaskModal(id, focusField){
  const task=state.tasks.find(t=>t.id===id);if(!task)return;
  editingTaskId=id;document.getElementById('modalTaskTitle').textContent='Edit Task';
  document.getElementById('taskTitle').value=task.title||'';
  document.getElementById('taskType').value=task.type||'log new idea';
  document.getElementById('taskPriority').value=task.priority||'medium';
  document.getElementById('taskStatus').value=task.status||'not started';
  document.getElementById('taskRelated').value=task.related||'';
  document.getElementById('taskNotes').value=task.notes||'';
  document.getElementById('taskLink').value=task.link||'';
  showModal('modalTask');
  // Focus the right field after modal opens
  setTimeout(()=>{
    if(focusField==='notes') document.getElementById('taskNotes').focus();
    else if(focusField==='link') document.getElementById('taskLink').focus();
  }, 80);
}
function clearTaskForm(){
  ['taskTitle','taskRelated','taskNotes','taskLink'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('taskType').value='log new idea';
  document.getElementById('taskPriority').value='medium';
  document.getElementById('taskStatus').value='not started';
}
function saveTask(){
  const title=document.getElementById('taskTitle').value.trim();
  if(!title){alert('Please enter a task title.');return;}
  const task={
    id:editingTaskId||'task'+Date.now(),
    title,
    type:document.getElementById('taskType').value,
    priority:document.getElementById('taskPriority').value,
    status:document.getElementById('taskStatus').value,
    related:document.getElementById('taskRelated').value.trim(),
    notes:document.getElementById('taskNotes').value.trim(),
    link:document.getElementById('taskLink').value.trim(),
    created:new Date().toISOString().split('T')[0]
  };
  if(editingTaskId) state.tasks=state.tasks.map(t=>t.id===editingTaskId?task:t);
  else state.tasks.push(task);
  logChange(editingTaskId ? 'edited task' : 'added task', task.title, task.type);
  saveState();hideModal('modalTask');renderTasks();renderRecentUpdates();
}

// Task link type tab switching
function bindTaskLinkTabs(){
  document.querySelectorAll('#taskLinkTypeTabs .res-type-tab').forEach(tab=>{
    tab.addEventListener('click',()=>{
      document.querySelectorAll('#taskLinkTypeTabs .res-type-tab').forEach(t=>t.classList.remove('active'));
      tab.classList.add('active');
      const type=tab.dataset.type;
      const inp=document.getElementById('taskLink');
      const note=document.getElementById('taskOneDriveNote');
      if(type==='url'){inp.placeholder='Paste URL…';note.classList.remove('visible');}
      else if(type==='onedrive'){inp.placeholder='Paste OneDrive sharing link…';note.classList.add('visible');}
      else{inp.placeholder='File path (e.g. /Users/you/Documents/file.pdf)';note.classList.remove('visible');}
    });
  });
}

// ============================================================
// EXPORT
// ============================================================
function bindExport(){
  document.querySelectorAll('.export-tab').forEach(tab=>tab.addEventListener('click',()=>{
    document.querySelectorAll('.export-tab').forEach(t=>t.classList.remove('active'));
    tab.classList.add('active');generateExport(tab.dataset.format);
  }));
  document.getElementById('btnCopyExport').addEventListener('click',()=>{
    const ta=document.getElementById('exportText');ta.select();document.execCommand('copy');
    document.getElementById('btnCopyExport').textContent='Copied!';
    setTimeout(()=>document.getElementById('btnCopyExport').textContent='Copy to Clipboard',1800);
  });
  document.getElementById('btnPrint').addEventListener('click',()=>window.print());
  const exportBackup=document.getElementById('btnExportBackup');
  if(exportBackup) exportBackup.addEventListener('click',exportFullBackup);
  const importBackup=document.getElementById('btnImportBackup');
  const fileInput=document.getElementById('backupFileInput');
  if(importBackup && fileInput){
    importBackup.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',importFullBackup);
  }
}
function openExport(){
  if(!state.plan.targets.length){alert('No targets in plan to export.');return;}
  generateExport('markdown');showModal('modalExport');
}
function generateExport(format){
  const targets=state.plan.targets.map(pt=>({entry:state.entries.find(e=>e.id===pt.entryId),pt})).filter(x=>x.entry);
  const today=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
  let md=`# Treatment Plan Outline\n**Diagnosis / Pattern:** ${state.plan.diagnosis}\n**Generated:** ${today}\n\n`;
  if(state.plan.concerns.length){md+=`## Active Concerns / Barriers\n`;state.plan.concerns.forEach(c=>{md+=`- ${c}\n`;});md+='\n';}
  md+=`## Treatment Targets\n\n`;
  targets.forEach(({entry,pt},i)=>{
    md+=`### ${i+1}. ${entry.title}\n`;
    if(entry.subcategory) md+=`**Domain:** ${entry.subcategory}\n`;
    if(entry.desc)        md+=`**Description:** ${entry.desc}\n`;
    const labels=[]; if(pt.introduced) labels.push('Introduced'); if(pt.upcoming) labels.push('Upcoming');
    if(labels.length) md+=`**Plan Label:** ${labels.join(', ')}\n`;
    if(pt.notes)          md+=`**Notes:** ${stripHTML(pt.notes)}\n`;
    const res=(entry.linkedResources||[]).filter(r=>r.title||r.url);
    if(res.length){md+=`**Linked Resources:** `+res.map(r=>r.url?`[${r.title||r.url}](${r.url})`:r.title).join(', ')+'\n';}
    md+='\n';
  });
  const allRes=[...new Set(targets.flatMap(({entry})=>(entry.linkedResources||[]).map(r=>r.title||r.url).filter(Boolean)))];
  if(allRes.length){md+=`## Resource List\n`;allRes.forEach(r=>{md+=`- ${r}\n`;});}
  document.getElementById('exportText').value=md;
}
function exportFullBackup(){
  const payload={
    exportedAt:new Date().toISOString(),
    app:'ED Recovery Resource Map',
    version:'local-json-backup-v1',
    data:state
  };
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  const date=new Date().toISOString().slice(0,10);
  a.href=URL.createObjectURL(blob);
  a.download=`ed-resource-index-backup-${date}.json`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  logChange('exported backup','Full JSON backup',''); saveState(); renderRecentUpdates();
}
function importFullBackup(event){
  const file=event.target.files && event.target.files[0];
  if(!file) return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const parsed=JSON.parse(reader.result);
      const data=parsed.data || parsed;
      if(!data || !Array.isArray(data.entries) || !Array.isArray(data.tasks)) throw new Error('Backup is missing entries or tasks.');
      state=data; ensureCoreStateFields(); ensureTagOptions(); logChange('imported backup', file.name, 'Full app data imported'); saveState();
      renderLibrary(); renderBuilder(); renderTasks(); renderQuickCaptures(); renderRecentUpdates(); updatePlanCount(); populateCategoryFilters();
      alert('Backup imported.');
    }catch(err){ alert('Could not import backup: '+err.message); }
    event.target.value='';
  };
  reader.readAsText(file);
}


// ============================================================
// QUICK CAPTURE + RECENT UPDATES
// ============================================================
function bindQuickCapture(){
  const btn=document.getElementById('btnSaveQuickCapture');
  if(btn && btn.dataset.bound!=='true'){
    btn.dataset.bound='true';
    btn.addEventListener('click',saveQuickCapture);
  }
}
function saveQuickCapture(){
  const title=document.getElementById('quickTitle').value.trim() || 'Untitled capture';
  const item={
    id:'qc'+Date.now(),
    title,
    type:document.getElementById('quickType').value,
    note:document.getElementById('quickNote').value.trim(),
    link:document.getElementById('quickLink').value.trim(),
    created:new Date().toISOString()
  };
  state.quickCaptures.unshift(item);
  state.tasks.unshift({id:'task'+Date.now(),title:'File quick capture: '+title,type:'file in index later',related:item.type,priority:'medium',status:'not started',notes:item.note,link:item.link,created:new Date().toISOString().split('T')[0]});
  logChange('quick capture', title, item.type);
  saveState();
  ['quickTitle','quickNote','quickLink'].forEach(id=>document.getElementById(id).value='');
  renderQuickCaptures(); renderTasks(); renderRecentUpdates();
}
function renderQuickCaptures(){
  bindQuickCapture();
  const list=document.getElementById('quickCaptureList');
  if(!list) return;
  if(!state.quickCaptures || !state.quickCaptures.length){list.innerHTML='<div class="empty-state"><p>No unfiled captures yet.</p></div>';return;}
  list.innerHTML=state.quickCaptures.map(q=>`<div class="task-item">
    <div class="task-body">
      <div class="task-title">${esc(q.title)}</div>
      <div class="task-meta"><span>${esc(q.type)}</span><span>${formatDateTime(q.created)}</span></div>
      ${q.note?`<div class="task-notes-preview">${esc(q.note)}</div>`:''}
      ${q.link?`<div class="task-link-preview"><a href="${esc(q.link)}" target="_blank" rel="noopener">Open link</a></div>`:''}
    </div>
    <div class="task-actions quick-actions" style="opacity:1">
      <button class="btn-note btn-quick-to-entry" data-id="${q.id}">+ Entry</button>
      <button class="btn-note btn-delete-quick" data-id="${q.id}">Delete</button>
    </div>
  </div>`).join('');
  list.querySelectorAll('.btn-quick-to-entry').forEach(btn=>btn.addEventListener('click',()=>{
    const item=state.quickCaptures.find(q=>q.id===btn.dataset.id);
    if(!item) return;
    openAddEntryModal({quickCaptureId:item.id, title:item.title, notes:item.note, link:item.link});
  }));
  list.querySelectorAll('.btn-delete-quick').forEach(btn=>btn.addEventListener('click',()=>{
    const item=state.quickCaptures.find(q=>q.id===btn.dataset.id);
    state.quickCaptures=state.quickCaptures.filter(q=>q.id!==btn.dataset.id);
    if(item) logChange('deleted quick capture', item.title, '');
    saveState(); renderQuickCaptures(); renderRecentUpdates();
  }));
}
function renderRecentUpdates(){
  const list=document.getElementById('recentUpdatesList');
  if(!list) return;
  const changes=state.changelog||[];
  if(!changes.length){list.innerHTML='<div class="empty-state"><p>No updates logged yet.</p></div>';return;}
  list.innerHTML=changes.slice(0,80).map(c=>`<div class="update-item">
    <div class="update-type">${esc(c.type)}</div>
    <div class="update-main"><strong>${esc(c.label)}</strong>${c.detail?`<div>${esc(c.detail)}</div>`:''}</div>
    <div class="update-time">${formatDateTime(c.timestamp)}</div>
  </div>`).join('');
}
function formatDateTime(value){
  if(!value) return '';
  const d=new Date(value);
  if(Number.isNaN(d.getTime())) return value;
  return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
}
function stripHTML(value){
  const tmp=document.createElement('div'); tmp.innerHTML=value||''; return tmp.textContent||tmp.innerText||'';
}

// ============================================================
// MODALS
// ============================================================
function bindModals(){
  document.querySelectorAll('[data-close]').forEach(btn=>btn.addEventListener('click',()=>hideModal(btn.dataset.close)));
  document.querySelectorAll('.modal-overlay').forEach(overlay=>overlay.addEventListener('click',e=>{if(e.target===overlay)hideModal(overlay.id);}));
}
function showModal(id){document.getElementById(id).classList.remove('hidden');}
function hideModal(id){document.getElementById(id).classList.add('hidden');}

// ============================================================
// HELPERS
// ============================================================
function esc(s){if(!s)return'';return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function isProbablyHTML(value){
  return /<\/?(p|div|br|ul|ol|li|strong|b|em|i|a)(\s|>|\/)/i.test(String(value||''));
}
function plainTextToHTML(value){
  if(!value) return '';
  const linked = esc(value).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  return linked.split(/\n{2,}/).map(block=>'<p>'+block.replace(/\n/g,'<br>')+'</p>').join('');
}
function sanitizeRichHTML(html){
  if(!html) return '';
  html = String(html).replace(/&nbsp;/g, ' ').replace(/\u00a0/g, ' ');
  const template = document.createElement('template');
  template.innerHTML = html;
  const allowed = new Set(['P','DIV','BR','UL','OL','LI','STRONG','B','EM','I','A','U','HR']);
  const walk = (node)=>{
    [...node.childNodes].forEach(child=>{
      if(child.nodeType === Node.ELEMENT_NODE){
        if(!allowed.has(child.tagName)){
          child.replaceWith(...child.childNodes);
          return;
        }
        [...child.attributes].forEach(attr=>{
          if(child.tagName === 'A' && attr.name === 'href'){
            const href = child.getAttribute('href') || '';
            if(!/^(https?:|mailto:|file:)/i.test(href)) child.removeAttribute('href');
          } else {
            child.removeAttribute(attr.name);
          }
        });
        if(child.tagName === 'A'){
          child.setAttribute('target','_blank');
          child.setAttribute('rel','noopener');
        }
        walk(child);
      }
    });
  };
  walk(template.content);
  return template.innerHTML.trim();
}
function normalizeRichForEdit(value){
  return sanitizeRichHTML(isProbablyHTML(value) ? value : plainTextToHTML(value));
}
function formatRichText(value){
  return normalizeRichForEdit(value);
}
function formatNoteText(text){ return formatRichText(text); }
function setRichEditorHTML(id, value){
  const el = document.getElementById(id);
  if(el) el.innerHTML = normalizeRichForEdit(value || '');
}
function getRichEditorHTML(id){
  const el = document.getElementById(id);
  if(!el) return '';
  return sanitizeRichHTML(el.innerHTML)
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/^(<br\s*\/?>(\s*)?)+$/i,'')
    .trim();
}
function combineRichNotes(existing, addition){
  const left = normalizeRichForEdit(existing || '');
  const right = normalizeRichForEdit(addition || '');
  return [left,right].filter(Boolean).join('<hr>');
}
function insertLinkIntoEditor(){
  const url = prompt('Paste the link URL');
  if(!url) return;
  const selection = window.getSelection();
  let text = selection && selection.toString() ? selection.toString() : prompt('What should the link say?', url);
  if(!text) text = url;
  document.execCommand('insertHTML', false, `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`);
}
function handleMarkdownBulletShortcut(editor, event){
  if(event.key !== ' ') return;
  const sel = window.getSelection();
  if(!sel || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const text = range.startContainer.textContent || '';
  const before = text.slice(0, range.startOffset);
  if(before === '*' || before.endsWith('\n*')){
    event.preventDefault();
    if(range.startContainer.nodeType === Node.TEXT_NODE){
      range.startContainer.textContent = text.slice(0, Math.max(0, range.startOffset-1)) + text.slice(range.startOffset);
    }
    document.execCommand('insertUnorderedList');
  }
}
function bindRichEditors(scope=document){
  scope.querySelectorAll('.rich-toolbar').forEach(toolbar=>{
    if(toolbar.dataset.bound === 'true') return;
    toolbar.dataset.bound = 'true';
    toolbar.querySelectorAll('button[data-cmd]').forEach(btn=>{
      btn.addEventListener('click',e=>{
        e.preventDefault();
        let editor = toolbar.dataset.editor ? document.getElementById(toolbar.dataset.editor) : toolbar.parentElement.querySelector('.rich-editor');
        if(editor) editor.focus();
        const cmd = btn.dataset.cmd;
        if(cmd === 'createLink') insertLinkIntoEditor();
        else document.execCommand(cmd, false, null);
      });
    });
  });
  scope.querySelectorAll('.rich-editor').forEach(editor=>{
    if(editor.dataset.bound === 'true') return;
    editor.dataset.bound = 'true';
    editor.addEventListener('keydown',e=>{
      if ((e.metaKey || e.ctrlKey) && ['b','i','u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        const cmd = e.key.toLowerCase() === 'b' ? 'bold' : e.key.toLowerCase() === 'i' ? 'italic' : 'underline';
        document.execCommand(cmd, false, null);
        return;
      }
      handleMarkdownBulletShortcut(editor,e);
    });
    editor.addEventListener('paste',e=>{
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData('text/plain');
      document.execCommand('insertText', false, text);
    });
  });
}
function typeClass(t){if(!t)return'type-other';if(t.toLowerCase().includes('target'))return'type-target';if(t.toLowerCase().includes('concept'))return'type-concept';if(t.toLowerCase().includes('goal')||t.toLowerCase().includes('benchmark'))return'type-goal';if(t.toLowerCase().includes('placeholder'))return'type-placeholder';if(t.toLowerCase().includes('resource')||t.toLowerCase().includes('clinician')||t.toLowerCase().includes('patient'))return'type-resource';return'type-other';}

function statusDotColor(s){if(!s)return'#cac4bc';if(s==='ready')return'#4a8c4a';if(s.includes('draft'))return'#8a6fa8';if(s.includes('idea'))return'#b8860b';if(s.includes('link'))return'#3c7aaa';if(s.includes('production'))return'#4a7a6a';if(s.includes('priority'))return'#b84a2a';if(s.includes('gap'))return'#b84a2a';return'#cac4bc';}
function statusClass(s){if(!s)return'';if(s==='ready')return'status-ready';if(s.includes('draft'))return'status-draft';if(s.includes('idea'))return'status-idea';if(s.includes('link'))return'status-link';if(s.includes('production'))return'status-production';if(s.includes('gap'))return'status-gap';if(s.includes('priority'))return'status-priority';return'status-draft';}

document.addEventListener('DOMContentLoaded',init);
