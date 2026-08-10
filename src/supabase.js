import { createSharedCookieStorage } from './sharedAuthStorage';
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: createSharedCookieStorage() }
}) : null;

export const getShowId = () => new URLSearchParams(location.search).get('show') || new URLSearchParams(location.search).get('showId') || '';
export async function session() {
  if (!configured) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

const tombstoneKey = id => `location-tombstone:${id}`;
const throwIf = error => { if (error) throw error; };

export async function loadLocations(showId, { includeArchived = false } = {}) {
  const { data, error } = await supabase.from('production_locations').select('*').eq('show_id', showId).order('created_at');
  throwIf(error);
  return (data || []).filter(row => includeArchived || !row.metadata?.archived_at);
}

export async function loadLocationTaxonomy(showId) {
  const [showResult, settingsResult, unitsResult, setsResult, setUnitsResult, linksResult, teamResult] = await Promise.all([
    supabase.from('shows').select('id,name,payload').eq('id', showId).single(),
    supabase.from('production_settings').select('*').eq('show_id', showId).maybeSingle(),
    supabase.from('production_units').select('*').eq('show_id', showId).eq('active', true).order('sort_order').order('name'),
    supabase.from('production_sets').select('*').eq('show_id', showId).order('sort_order').order('name'),
    supabase.from('production_set_units').select('set_id,unit_id').eq('show_id', showId),
    supabase.from('production_location_sets').select('id,location_id,set_id,unit_id').eq('show_id', showId),
    supabase.rpc('list_show_members', { p_show_id: showId })
  ]);
  [showResult, settingsResult, unitsResult, setsResult, setUnitsResult, linksResult].forEach(result => throwIf(result.error));
  const unitIdsBySet = new Map();
  for (const link of setUnitsResult.data || []) {
    const ids = unitIdsBySet.get(link.set_id) || [];
    ids.push(link.unit_id);
    unitIdsBySet.set(link.set_id, ids);
  }
  const legacy = showResult.data?.payload || {};
  return {
    show: {
      id: showId,
      name: showResult.data?.name || legacy.name || 'Production',
      logo: settingsResult.data?.logo_url || legacy.logo || '',
      season: settingsResult.data?.season || legacy.season || '',
      theme: settingsResult.data?.theme || null
    },
    units: unitsResult.data || [],
    sets: (setsResult.data || []).map(set => ({ ...set, unitIds: unitIdsBySet.get(set.id) || [] })),
    links: linksResult.data || [],
    team: (teamResult.error ? [] : teamResult.data || []).filter(member => member.status === 'active' && member.user_id)
  };
}

export async function loadLocationWorkspace(showId) {
  const [locations, taxonomy] = await Promise.all([loadLocations(showId), loadLocationTaxonomy(showId)]);
  const setMap = new Map(taxonomy.sets.map(set => [set.id, set]));
  const unitMap = new Map(taxonomy.units.map(unit => [unit.id, unit]));
  const linksByLocation = new Map();
  for (const link of taxonomy.links) {
    const list = linksByLocation.get(link.location_id) || [];
    const set = setMap.get(link.set_id);
    const unit = unitMap.get(link.unit_id);
    list.push({ id: link.id, setId: link.set_id, unitId: link.unit_id || '', setName: set?.name || '', unitName: unit?.name || '', unitCode: unit?.code || '' });
    linksByLocation.set(link.location_id, list);
  }
  return {
    ...taxonomy,
    locations: locations.map(row => ({
      id: row.id,
      showId: row.show_id,
      episodeId: row.episode_id || '',
      episodeName: row.episode_name || '',
      set: row.set_name || '',
      links: linksByLocation.get(row.id) || [],
      name: row.location_name || '',
      address: row.address || '', city: row.city || '', state: row.state || 'CA', zip: row.postal_code || '', area: row.area || '',
      placeId: row.metadata?.place_id || '', latitude: row.metadata?.latitude ?? null, longitude: row.metadata?.longitude ?? null,
      contact: row.contact_name || '', phone: row.contact_phone || '', email: row.contact_email || '',
      scout: row.scout_name || '', date: row.scout_date || '', status: row.status || 'Needed', notes: row.notes || '',
      isFinal: Boolean(row.is_final), metadata: row.metadata || {}
    }))
  };
}

export async function saveLocationRecord(showId, row) {
  const { data, error } = await supabase.rpc('save_location_list_record', {
    p_show_id: showId,
    p_location_id: row.id,
    p_record: {
      name: row.name || 'Untitled Location', address: row.address || '', city: row.city || '', state: row.state || '',
      zip: row.zip || '', area: row.area || '', contact: row.contact || '', phone: row.phone || '', email: row.email || '',
      scout: row.scout || '', date: row.date || null, status: row.status || 'Needed', notes: row.notes || '',
      isFinal: Boolean(row.isFinal), metadata: {
        ...(row.metadata || {}),
        place_id: row.placeId || null,
        latitude: row.latitude ?? null,
        longitude: row.longitude ?? null
      }
    },
    p_links: (row.links || []).map(link => ({ set_id: link.setId, unit_id: link.unitId || null }))
  });
  throwIf(error);
  return data;
}

async function lifecycleState(showId, locationId) {
  if (!locationId) return { current: null, deleted: false };
  const [{ data: current, error: loadError }, { data: tombstone, error: tombError }] = await Promise.all([
    supabase.from('production_locations').select('metadata').eq('show_id', showId).eq('id', locationId).maybeSingle(),
    supabase.from('tool_documents').select('tool_key').eq('show_id', showId).eq('tool_key', tombstoneKey(locationId)).maybeSingle()
  ]);
  throwIf(loadError); throwIf(tombError);
  return { current, deleted: Boolean(tombstone) };
}

// Backward-compatible helper used by older imports. New UI saves through saveLocationRecord atomically.
export async function upsertLocation(row) {
  const state = await lifecycleState(row.showId, row.id);
  if (state.deleted || state.current?.metadata?.archived_at) return { skipped: true, reason: state.deleted ? 'deleted' : 'archived', id: row.id };
  await saveLocationRecord(row.showId, { ...row, links: row.links || [] });
  return row;
}

export async function archiveLocation(showId, locationId, reason = 'Archived') {
  const { data: row, error: loadError } = await supabase.from('production_locations').select('metadata,status').eq('show_id', showId).eq('id', locationId).single();
  throwIf(loadError);
  const { data, error } = await supabase.from('production_locations').update({
    status: 'Archived', metadata: { ...(row.metadata || {}), archived_at: new Date().toISOString(), archive_reason: reason, archived_from_status: row.status || null }
  }).eq('show_id', showId).eq('id', locationId).select().single();
  throwIf(error); return data;
}

export async function restoreLocation(showId, locationId) {
  const { data: row, error: loadError } = await supabase.from('production_locations').select('metadata,status').eq('show_id', showId).eq('id', locationId).single();
  throwIf(loadError);
  const metadata = { ...(row.metadata || {}) };
  delete metadata.archived_at; delete metadata.archive_reason;
  const status = metadata.archived_from_status || 'Needed'; delete metadata.archived_from_status;
  const { data, error } = await supabase.from('production_locations').update({ status, metadata }).eq('show_id', showId).eq('id', locationId).select().single();
  throwIf(error); return data;
}

export async function permanentDeleteLocation(showId, locationId, { reason = 'Permanent delete', confirmationLocationId } = {}) {
  if (confirmationLocationId !== locationId) throw new Error('Permanent delete requires the exact canonical Location ID confirmation');
  const keys = [`budget-location:${locationId}`, `bible-location:${locationId}`];
  const [{ data: linked, error: linkedError }, { data: locationRecord, error: locationError }] = await Promise.all([
    supabase.from('tool_documents').select('tool_key,payload,updated_at').eq('show_id', showId).in('tool_key', keys),
    supabase.from('production_locations').select('*').eq('show_id', showId).eq('id', locationId).maybeSingle()
  ]);
  throwIf(linkedError); throwIf(locationError);
  const tombstone = { version: 2, locationId, deletedAt: new Date().toISOString(), reason, locationSnapshot: locationRecord || null, linkedRecords: (linked || []).map(x => ({ toolKey: x.tool_key, payload: x.payload, updatedAt: x.updated_at })) };
  const { error: tombError } = await supabase.from('tool_documents').upsert({ show_id: showId, tool_key: tombstoneKey(locationId), payload: tombstone }, { onConflict: 'show_id,tool_key' });
  throwIf(tombError);
  if (linked?.length) {
    const { error } = await supabase.from('tool_documents').delete().eq('show_id', showId).in('tool_key', linked.map(x => x.tool_key));
    throwIf(error);
  }
  const { error } = await supabase.from('production_locations').delete().eq('show_id', showId).eq('id', locationId);
  throwIf(error); return tombstone;
}

export function subscribeLocations(showId, callback) {
  if (!configured || !showId) return () => {};
  const tables = ['production_locations','production_location_sets','production_sets','production_set_units','production_units'];
  let channel = supabase.channel(`locations:${showId}`);
  tables.forEach(table => {
    channel = channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: `show_id=eq.${showId}` }, callback);
  });
  channel = channel.on('postgres_changes', { event: '*', schema: 'public', table: 'tool_documents', filter: `show_id=eq.${showId}` }, payload => {
    const toolKey = payload.new?.tool_key || payload.old?.tool_key || '';
    if (toolKey.startsWith('budget-location:') || toolKey.startsWith('bible-location:') || toolKey.startsWith('location-tombstone:')) callback(payload);
  }).subscribe();
  return () => supabase.removeChannel(channel);
}
