import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Archive, ClipboardList, Home, Link2, MapPin, MapPinned, Plus, Printer, Save, Search, Trash2, X } from 'lucide-react';
import './styles.css';
import {
  archiveLocation, configured, getShowId, loadLocationWorkspace, permanentDeleteLocation,
  saveLocationRecord, session, subscribeLocations, supabase
} from './supabase';

function TaylorScoutLogo({ compact = false }) {
  return <span className={`ts-logo ${compact ? 'compact' : ''}`} aria-label="Taylor Scout"><svg viewBox="0 0 74 92" role="img" aria-hidden="true"><path className="pin-outline" d="M37 3C18 3 5 17 5 36c0 22 17 40 32 53 15-13 32-31 32-53C69 17 56 3 37 3Z"/><path className="mountain" d="M16 39l15-13 8 7 10-10 12 14-12-8-10 10-8-7-15 7Z"/><path className="road" d="M19 69c12-14 24-18 31-27-3 14-12 22-20 31l7 8-9 2-9-14Z"/><path className="star" d="M21 17l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z"/></svg><span className="ts-wordmark"><b>TAYLOR SCOUT</b><small>PRODUCTION TOOLS</small></span></span>;
}

const uid = () => crypto.randomUUID();
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const statuses = ['Needed','Researching','Contacted','Scout Scheduled','Scouted','Submitted','Director Approved','On Hold','Rejected','Selected'];
const emptyWorkspace = { show: { name: 'Production', logo: '', season: '', theme: null }, units: [], sets: [], team: [], locations: [] };

function newLocation(showId) {
  return {
    id: uid(), showId, links: [], set: '', name: '', address: '', city: '', state: 'CA', zip: '', area: '',
    placeId: '', latitude: null, longitude: null, contact: '', phone: '', email: '', scout: '', date: today(),
    status: 'Needed', notes: '', isFinal: false, metadata: {}
  };
}

function loadLocal(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; }
}

function physicalLocationKey(row) {
  const clean = value => String(value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const address = clean([row.address,row.city,row.state,row.zip].filter(Boolean).join(' '));
  const name = clean(row.name);
  return address || (name && name !== 'tbd' ? `name:${name}` : '');
}

function mergeCanonicalLinks(...groups) {
  const unique = new Map();
  groups.flat().filter(Boolean).forEach(link => unique.set(`${link.setId}:${link.unitId || ''}`, link));
  return [...unique.values()];
}

function consolidatePhysicalLocations(rows) {
  return [...rows.reduce((grouped,row) => {
    const key=physicalLocationKey(row)||`id:${row.id}`;
    const current=grouped.get(key);
    if(!current){grouped.set(key,row);return grouped;}
    grouped.set(key,{
      ...current,
      links:mergeCanonicalLinks(current.links||[],row.links||[]),
      metadata:{
        ...(current.metadata||{}),
        grouped_location_ids:[...new Set([...(current.metadata?.grouped_location_ids||[]),current.id,row.id])]
      }
    });
    return grouped;
  },new Map()).values()];
}

function App() {
  const showId = getShowId();
  const localKey = `ts-location-scouts:${showId || 'local'}`;
  const [workspace, setWorkspace] = useState(emptyWorkspace);
  const [scouts, setScouts] = useState(() => loadLocal(localKey, []));
  const [finals, setFinals] = useState(() => loadLocal(`ts-location-finals:${showId || 'local'}`, []));
  const [cloudState, setCloudState] = useState(configured ? 'Connecting…' : 'Saved locally');
  const [tab, setTab] = useState('tracker');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ set: '', city: '', scout: '', status: '', date: '' });
  const [episodeFilter, setEpisodeFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [sort, setSort] = useState('name-asc');
  const [pendingWorkspace, setPendingWorkspace] = useState(null);

  function applyWorkspace(next) {
    setWorkspace(next);
    setScouts(consolidatePhysicalLocations(next.locations.filter(location => !location.isFinal)));
    setCloudState('Saved');
  }

  useEffect(() => { localStorage.setItem(localKey, JSON.stringify(scouts)); }, [scouts, localKey]);
  useEffect(() => { localStorage.setItem(`ts-location-finals:${showId || 'local'}`, JSON.stringify(finals)); }, [finals, showId]);
  useEffect(() => {
    if (!configured || !showId) return;
    let live = true;
    session().then(current => {
      if (!current) { setCloudState('Sign in required'); return null; }
      return loadLocationWorkspace(showId);
    }).then(next => { if (live && next) applyWorkspace(next); }).catch(error => { console.error(error); setCloudState(`Sync error: ${error?.message || 'Unable to load'}`); });
    const unsubscribe = subscribeLocations(showId, async () => {
      try {
        const next = await loadLocationWorkspace(showId);
        if (!live) return;
        const active = document.activeElement;
        const typing = editing || (active && ['INPUT','TEXTAREA','SELECT'].includes(active.tagName));
        if (typing) { setPendingWorkspace(next); setCloudState('Updates available'); }
        else applyWorkspace(next);
      } catch (error) { console.error('Location List realtime refresh failed', error); }
    });
    return () => { live = false; unsubscribe(); };
  }, [showId, Boolean(editing)]);

  const setMap = useMemo(() => new Map(workspace.sets.map(set => [set.id, set])), [workspace.sets]);
  const unitMap = useMemo(() => new Map(workspace.units.map(unit => [unit.id, unit])), [workspace.units]);
  const filtered = useMemo(() => {
    const rows = scouts.filter(row => {
      const linkText = (row.links || []).map(link => `${link.setName} ${link.unitName} ${link.unitCode}`).join(' ');
      const haystack = `${Object.values(row).filter(value => typeof value !== 'object').join(' ')} ${linkText}`.toLowerCase();
      const setLabels = (row.links || []).map(link => link.setName);
      return haystack.includes(query.toLowerCase())
        && (episodeFilter === 'all' || (row.links || []).some(link => link.unitId === episodeFilter))
        && (!filters.set || setLabels.includes(filters.set) || row.set === filters.set)
        && (!filters.city || row.city === filters.city)
        && (!filters.scout || row.scout === filters.scout)
        && (!filters.status || row.status === filters.status)
        && (!filters.date || row.date === filters.date);
    });
    return [...rows].sort((a,b) => {
      if (sort === 'name-asc') return (a.name || '').localeCompare(b.name || '');
      if (sort === 'name-desc') return (b.name || '').localeCompare(a.name || '');
      if (sort === 'date-new') return (b.date || '').localeCompare(a.date || '');
      if (sort === 'date-old') return (a.date || '').localeCompare(b.date || '');
      if (sort === 'city') return (a.city || '').localeCompare(b.city || '');
      if (sort === 'scout') return (a.scout || '').localeCompare(b.scout || '');
      return 0;
    });
  }, [scouts, query, filters, sort, episodeFilter]);

  function update(id, key, value) {
    setScouts(current => current.map(row => row.id === id ? { ...row, [key]: value } : row));
  }
  async function persist(row) {
    if (!configured || !showId) { setCloudState('Saved locally'); return row; }
    setCloudState('Saving…');
    try { await saveLocationRecord(showId, row); setCloudState('Saved'); return row; }
    catch (error) { setCloudState(`Sync error: ${error?.message || 'Save failed'}`); throw error; }
  }
  async function saveEditor(row) {
    const key = physicalLocationKey(row);
    const match = !row.showId && key ? scouts.find(item => item.id !== row.id && physicalLocationKey(item) === key) : null;
    const next = match ? {
      ...match, ...row, id: match.id, showId: match.showId,
      links: mergeCanonicalLinks(match.links || [], row.links || [])
    } : row;
    await persist(next);
    setScouts(current => {
      const withoutUnsavedDuplicate = current.filter(item => item.id !== row.id || item.id === next.id);
      return withoutUnsavedDuplicate.some(item => item.id === next.id)
        ? withoutUnsavedDuplicate.map(item => item.id === next.id ? next : item)
        : [next, ...withoutUnsavedDuplicate];
    });
    if (match) setCloudState(`Saved · added to ${match.name}`);
    setEditing(null);
  }
  async function saveInline(row) {
    try { await persist(row); } catch (error) { console.error(error); }
  }
  function promote(row) {
    setFinals(current => current.some(item => item.sourceScoutId === row.id) ? current : [...current, {
      id: uid(), sourceScoutId: row.id, episode: row.links?.[0]?.unitCode || '', location: row.name,
      address: row.address, city: [row.city,row.state,row.zip].filter(Boolean).join(', '),
      contacts: [row.contact,row.phone,row.email].filter(Boolean).join('\n'),
      sets: row.links?.map(link => link.setName).filter(Boolean).join('\n') || row.set, scenes: '', key: row.scout, dates: '', support: []
    }]);
  }
  async function changeStatus(row, value) {
    const next = { ...row, status: value };
    update(row.id, 'status', value);
    if (value === 'Selected') promote(next);
    try { await persist(next); } catch (error) { console.error(error); }
  }

  async function archiveRecord(row) {
    if (!configured || !showId || !row?.showId) return alert('Archive is available after the shared location is saved.');
    if (!confirm(`Archive “${row.name || 'this location'}”?\n\nBudget, Bible, Security, vendor orders, and history will be preserved.`)) return;
    setCloudState('Archiving…');
    try { await archiveLocation(showId,row.id,'Archived from Location List'); setScouts(current=>current.filter(item=>item.id!==row.id)); setEditing(null); setCloudState('Saved'); }
    catch (error) { setCloudState('Sync error'); alert(error.message || 'Archive failed'); }
  }
  async function permanentlyDeleteRecord(row) {
    if (!configured || !showId || !row?.showId) return alert('Permanent delete is available only for connected shared locations.');
    if (!confirm(`PERMANENTLY DELETE “${row.name || 'this location'}”?\n\nThis removes the canonical location and scoped Budget/Bible records. A deletion tombstone is retained.`)) return;
    const typed = prompt(`Type the exact canonical Location ID to continue:\n\n${row.id}`, '');
    if (typed !== row.id) return typed !== null && alert('Location ID did not match. Nothing was deleted.');
    if (!confirm('Final confirmation: permanently delete this location now?')) return;
    setCloudState('Deleting…');
    try { await permanentDeleteLocation(showId,row.id,{reason:'Permanent delete from Location List',confirmationLocationId:typed}); setScouts(current=>current.filter(item=>item.id!==row.id)); setEditing(null); setCloudState('Saved'); }
    catch (error) { setCloudState('Sync error'); alert(error.message || 'Permanent delete failed'); }
  }

  const theme = workspace.show.theme || {};
  const shellStyle = { '--ts-navy': theme.primary || '#061f33', '--ts-navy-2': theme.secondary || '#0b2e46', '--ts-teal': theme.accent || '#2fb5b2', '--ts-font': theme.font || 'Inter' };
  const setOptions = [...new Set(scouts.flatMap(row => (row.links || []).map(link => link.setName)).concat(scouts.map(row => row.set)).filter(Boolean))].sort();
  const openNew = () => setEditing(newLocation(showId));

  return <div className="suite-shell" style={shellStyle}>
    <header className="suite-topbar">
      <button className="suite-brand" onClick={()=>location.href=import.meta.env.VITE_HUB_URL||'https://www.taylorscout.com'} title="Taylor Scout dashboard"><span className="brand-icon-bg"><TaylorScoutLogo compact/></span><span className="brand-copy"><b>TAYLOR SCOUT</b><small>PRODUCTION TOOLS</small></span></button>
      <div className="canonical-center-mark" aria-label="Taylor Scout"/>
      <div className="suite-top-actions"><span className={`cloud-state ${cloudState.startsWith('Sync error')?'error':''}`}>{cloudState}</span><button onClick={()=>window.print()}><Printer/>Print</button><button className="primary" onClick={openNew}><Plus/>Add Location</button></div>
    </header>
    <aside className="suite-sidebar">
      <div className="sidebar-show">{workspace.show.logo&&<img className="sidebar-show-logo" src={workspace.show.logo} alt=""/>}<h2>{workspace.show.name}</h2><span>LOCATION LIST</span></div>
      <button className="sidebar-new" onClick={openNew}><Plus/>New Location</button>
      <div className="sidebar-label">VIEWS</div>
      <button className={`sidebar-link ${tab==='tracker'?'active':''}`} onClick={()=>setTab('tracker')}><ClipboardList/>Scout Tracker</button>
      <button className={`sidebar-link ${tab==='final'?'active':''}`} onClick={()=>setTab('final')}><MapPinned/>Final Locations</button>
      <div className="sidebar-label">EPISODES / UNITS</div>
      <button className={`episode-side episode-filter ${episodeFilter==='all'?'active':''}`} onClick={()=>setEpisodeFilter('all')}><span>All Episodes</span><b>{scouts.length}</b></button>
      {workspace.units.map(unit => <button className={`episode-side episode-filter ${episodeFilter===unit.id?'active':''}`} key={unit.id} onClick={()=>setEpisodeFilter(unit.id)}><span>{unit.code || unit.name}</span><b>{scouts.filter(row=>(row.links||[]).some(link=>link.unitId===unit.id)).length}</b></button>)}
      <div className="sidebar-spacer"/>
      <button className="sidebar-link" onClick={()=>location.href=import.meta.env.VITE_HUB_URL||'https://www.taylorscout.com'}><Home/>Show Dashboard</button>
    </aside>
    <main className="suite-main">
      <div className="title"><div><p>LOCATIONS DEPARTMENT</p><h1>Location List</h1><span>Choose an episode, then select only the canonical sets entered in Set List.</span></div></div>
      {tab === 'tracker' ? <>
        <section className="filters">
          <label className="search"><Search/><input placeholder="Search name, address, set, city, scout, notes…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
          <select value={filters.set} onChange={event=>setFilters({...filters,set:event.target.value})}><option value="">All sets</option>{setOptions.map(value=><option key={value}>{value}</option>)}</select>
          {['city','scout','status'].map(keyName => <select key={keyName} value={filters[keyName]} onChange={event=>setFilters({...filters,[keyName]:event.target.value})}><option value="">All {keyName}s</option>{[...new Set(scouts.map(row=>row[keyName]).filter(Boolean))].sort().map(value=><option key={value}>{value}</option>)}</select>)}
          <input type="date" value={filters.date} onChange={event=>setFilters({...filters,date:event.target.value})}/>
          <select value={sort} onChange={event=>setSort(event.target.value)} aria-label="Sort locations"><option value="name-asc">Name A–Z</option><option value="name-desc">Name Z–A</option><option value="date-new">Newest scout date</option><option value="date-old">Oldest scout date</option><option value="city">City</option><option value="scout">Scout</option></select>
          {pendingWorkspace&&<button className="refresh-updates" onClick={()=>{applyWorkspace(pendingWorkspace);setPendingWorkspace(null)}}>Refresh updates</button>}
        </section>
        <div className="table-wrap"><table><thead><tr><th>Set List links</th><th>Name / Address</th><th>Property Contact</th><th>Area</th><th>Scouted By</th><th>Scout Date</th><th>Status</th><th>Notes</th></tr></thead><tbody>{filtered.map(row => <tr key={row.id}>
          <td><button className="linked-set-cell" onClick={()=>setEditing(row)}>{row.links?.length ? row.links.map(link=><span key={`${link.setId}:${link.unitId}`}><b>{link.unitCode || link.unitName || 'All'}</b>{link.setName}</span>) : <span className="unlinked"><Link2 size={12}/>{row.set || 'Choose set'}</span>}</button></td>
          <td><button className="name" onClick={()=>setEditing(row)}>{row.name||'Untitled'}</button><small>{row.address}<br/>{[row.city,row.state,row.zip].filter(Boolean).join(', ')}</small></td>
          <td><input value={row.contact} placeholder="Contact" onChange={event=>update(row.id,'contact',event.target.value)} onBlur={event=>saveInline({...row,contact:event.target.value})}/><small>{row.phone}{row.email&&<><br/>{row.email}</>}</small></td>
          <td><input value={row.area} onChange={event=>update(row.id,'area',event.target.value)} onBlur={event=>saveInline({...row,area:event.target.value})}/></td>
          <td><select value={row.scout} onChange={event=>{const next={...row,scout:event.target.value};update(row.id,'scout',event.target.value);saveInline(next)}}><option value="">Unassigned</option>{row.scout&&!workspace.team.some(member=>(member.display_name||member.email)===row.scout)&&<option>{row.scout}</option>}{workspace.team.map(member=><option key={member.user_id} value={member.display_name||member.email}>{member.display_name||member.email}</option>)}</select></td>
          <td><input type="date" value={row.date} onChange={event=>update(row.id,'date',event.target.value)} onBlur={event=>saveInline({...row,date:event.target.value})}/></td>
          <td><select className={'status s-'+row.status.replaceAll(' ','-').toLowerCase()} value={row.status} onChange={event=>changeStatus(row,event.target.value)}>{statuses.map(status=><option key={status}>{status}</option>)}</select></td>
          <td><textarea value={row.notes} onChange={event=>update(row.id,'notes',event.target.value)} onBlur={event=>saveInline({...row,notes:event.target.value})}/></td>
        </tr>)}</tbody></table></div>
      </> : <FinalList rows={finals} setRows={setFinals} query={query} setQuery={setQuery}/>}</main>
    {editing&&<Editor row={editing} units={workspace.units} sets={workspace.sets} team={workspace.team} setMap={setMap} unitMap={unitMap} onClose={()=>setEditing(null)} onSave={saveEditor} onArchive={archiveRecord} onPermanentDelete={permanentlyDeleteRecord}/>}
  </div>;
}

function AddressAutocomplete({ record, onChange }) {
  const [items,setItems]=useState([]);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    const query=record.address?.trim();
    if(!query||query.length<4||record.placeId){setItems([]);return;}
    const controller=new AbortController();
    const timer=setTimeout(async()=>{
      setBusy(true);
      try{
        const response=await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&countrycodes=us&limit=6&q=${encodeURIComponent(query)}`,{
          signal:controller.signal,
          headers:{'Accept-Language':'en-US'}
        });
        const data=await response.json();
        setItems(Array.isArray(data)?data:[]);
      }catch(error){if(error.name!=='AbortError')setItems([]);}
      finally{setBusy(false);}
    },350);
    return()=>{clearTimeout(timer);controller.abort();};
  },[record.address,record.placeId]);

  function choose(item){
    const address=item.address||{};
    const street=[address.house_number,address.road||address.pedestrian||address.highway].filter(Boolean).join(' ');
    const city=address.city||address.town||address.village||address.hamlet||address.county||'';
    const state=(address['ISO3166-2-lvl4']||'').split('-')[1]||address.state||'CA';
    const area=address.neighbourhood||address.suburb||address.city_district||address.borough||city||address.county||'';
    onChange({
      address:street||item.display_name,city,state,zip:address.postcode||'',area,
      placeId:String(item.place_id||''),latitude:Number(item.lat),longitude:Number(item.lon)
    });
    setItems([]);
  }

  return <label className="address-field">Smart address<input autoComplete="off" value={record.address||''} placeholder="Start typing an address…" onChange={event=>onChange({address:event.target.value,placeId:'',latitude:null,longitude:null})}/>{(busy||items.length>0)&&<div className="address-suggestions">{busy&&<span>Checking addresses…</span>}{items.map(item=><button type="button" key={item.place_id} onClick={()=>choose(item)}><MapPin/>{item.display_name}</button>)}</div>}<small>Select a suggested address to fill city, state, ZIP, and area.</small></label>;
}

function Editor({ row, units, sets, team, setMap, unitMap, onClose, onSave, onArchive, onPermanentDelete }) {
  const [record,setRecord]=useState({...row,links:[...(row.links||[])]});
  const [unitId,setUnitId]=useState(units.length ? (row.links?.[0]?.unitId || '') : '');
  const [setId,setSetId]=useState('');
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const connected=Boolean(row.showId);
  const availableSets=sets.filter(set=>set.work_type==='location'&&(!unitId||!set.unitIds.length||set.unitIds.includes(unitId)));
  const update=(key,value)=>setRecord(current=>({...current,[key]:value}));
  function addLink(){
    if(!setId)return;
    if(record.links.some(link=>link.setId===setId&&(link.unitId||'')===(unitId||'')))return setMessage('That episode and set are already linked.');
    const set=setMap.get(setId);const unit=unitMap.get(unitId);
    update('links',[...record.links,{setId,unitId:unitId||'',setName:set?.name||'',unitName:unit?.name||'',unitCode:unit?.code||''}]);
    setSetId('');setMessage('');
  }
  async function save(){setBusy(true);setMessage('');try{await onSave(record)}catch(error){setMessage(error?.message||String(error));setBusy(false)}}
  const existingScout=record.scout&&!team.some(member=>(member.display_name||member.email)===record.scout);
  return <div className="modal-bg"><div className="modal location-editor"><button className="close" onClick={onClose} disabled={busy}><X/></button><p>SCOUT RECORD</p><h2>{record.name||'New Location'}</h2>
    <section className="set-link-section"><div><h3>Set List assignment</h3><p>Select the episode or spot first. The set menu then shows only On Location sets available for it.</p></div><div className="set-link-controls">{units.length?<select value={unitId} onChange={event=>{setUnitId(event.target.value);setSetId('')}}><option value="">Select episode / unit</option>{units.map(unit=><option key={unit.id} value={unit.id}>{unit.code ? `${unit.code} · ` : ''}{unit.name}</option>)}</select>:<span className="production-wide-label">Production-wide</span>}<select value={setId} onChange={event=>setSetId(event.target.value)} disabled={Boolean(units.length&&!unitId)}><option value="">Select canonical set</option>{availableSets.map(set=><option key={set.id} value={set.id}>{set.int_ext}. {set.name}</option>)}</select><button type="button" onClick={addLink} disabled={!setId}><Plus size={16}/>Link set</button></div>
    <div className="set-link-chips">{record.links.length?record.links.map((link,index)=><span key={`${link.setId}:${link.unitId}:${index}`}><b>{link.unitCode||link.unitName||'All'}</b>{link.setName}<button type="button" onClick={()=>update('links',record.links.filter((_,itemIndex)=>itemIndex!==index))} aria-label={`Remove ${link.setName}`}><X size={13}/></button></span>):<p>No canonical set linked yet.{row.set&&<> Existing label: <b>{row.set}</b>.</>}</p>}</div></section>
    <div className="form">
      <label>Name<input value={record.name||''} onChange={event=>update('name',event.target.value)}/></label>
      <AddressAutocomplete record={record} onChange={patch=>setRecord(current=>({...current,...patch}))}/>
      <label>City<input value={record.city||''} onChange={event=>setRecord(current=>({...current,city:event.target.value,area:current.area||event.target.value}))}/></label>
      <label>State<input value={record.state||''} onChange={event=>update('state',event.target.value)}/></label>
      <label>ZIP<input value={record.zip||''} onChange={event=>update('zip',event.target.value)}/></label>
      <label>Area<input value={record.area||''} onChange={event=>update('area',event.target.value)}/></label>
      <label>Contact<input value={record.contact||''} onChange={event=>update('contact',event.target.value)}/></label>
      <label>Phone<input value={record.phone||''} onChange={event=>update('phone',event.target.value)}/></label>
      <label>Email<input type="email" value={record.email||''} onChange={event=>update('email',event.target.value)}/></label>
      <label>Scouted by<select value={record.scout||''} onChange={event=>update('scout',event.target.value)}><option value="">Unassigned</option>{existingScout&&<option>{record.scout}</option>}{team.map(member=><option key={member.user_id} value={member.display_name||member.email}>{member.display_name||member.email}</option>)}</select></label>
      <label>Scout date<input type="date" value={record.date||''} onChange={event=>update('date',event.target.value)}/></label>
      <label>Status<select value={record.status} onChange={event=>update('status',event.target.value)}>{statuses.map(status=><option key={status}>{status}</option>)}</select></label>
      <label className="full">Notes<textarea value={record.notes||''} onChange={event=>update('notes',event.target.value)}/></label>
    </div>
    {message&&<div className="editor-message">{message}</div>}
    <div className="editor-actions"><div>{connected&&<><button type="button" onClick={()=>onArchive(row)}><Archive size={16}/>Archive Location</button><button type="button" className="permanent-delete" onClick={()=>onPermanentDelete(row)}><Trash2 size={16}/>Permanent Delete</button></>}</div><button className="primary save-location" onClick={save} disabled={busy}><Save/>{busy?'Saving…':'Save Location'}</button></div>
    {connected&&<small className="canonical-id">Canonical Location ID: {row.id}</small>}
  </div></div>;
}

function FinalList({ rows, setRows, query, setQuery }) {
  const visible=rows.filter(row=>Object.values(row).join(' ').toLowerCase().includes(query.toLowerCase()));
  const groups=[...new Set(visible.map(row=>row.episode||'Unassigned'))].sort();
  return <section className="final"><div className="final-tools"><label className="search"><Search/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search location, address, set, scene, key…"/></label><button className="primary" onClick={()=>setRows(current=>[...current,{id:uid(),episode:'',location:'New Location',address:'',city:'',contacts:'',sets:'',scenes:'',key:'',dates:'',support:[]}])}><Plus/>Add Final Location</button></div><div className="print-title">FINAL LOCATION LIST</div>{groups.map(episode=><section className="episode-section" key={episode}><div className="episode-break"><span>EPISODE</span><h2>{episode}</h2></div>{visible.filter(row=>(row.episode||'Unassigned')===episode).map(row=><article className="location-block" key={row.id}><div className="bar"><span>LOCATION INFORMATION</span><span>EPISODE / SET / SCENE</span><span>LOCATION DEPT CONTACT & DATES</span></div><div className="cols"><div><h3 contentEditable suppressContentEditableWarning onBlur={event=>editFinal(setRows,row.id,'location',event.currentTarget.innerText)}>{row.location}</h3><p contentEditable suppressContentEditableWarning onBlur={event=>editFinal(setRows,row.id,'address',event.currentTarget.innerText)}>{row.address}</p><p contentEditable suppressContentEditableWarning onBlur={event=>editFinal(setRows,row.id,'city',event.currentTarget.innerText)}>{row.city}</p><pre contentEditable suppressContentEditableWarning onBlur={event=>editFinal(setRows,row.id,'contacts',event.currentTarget.innerText)}>{row.contacts}</pre></div><div><label className="episode-edit">Episode<input value={row.episode||''} onChange={event=>editFinal(setRows,row.id,'episode',event.target.value)}/></label><p><b>{row.sets}</b></p><p>Scenes: {row.scenes}</p></div><div><p><b>{row.key}</b></p><pre>{row.dates}</pre></div></div>{(row.support||[]).map((support,index)=><div className="support" key={index}><div>{support.use}</div><div>{support.place}</div><div>{support.contact}</div></div>)}</article>)}</section>)}</section>;
}

function editFinal(setRows,id,key,value){setRows(current=>current.map(row=>row.id===id?{...row,[key]:value}:row));}

createRoot(document.getElementById('root')).render(<App/>);
