import { createClient } from '@supabase/supabase-js';
const url=import.meta.env.VITE_SUPABASE_URL;
const key=import.meta.env.VITE_SUPABASE_ANON_KEY;
export const configured=Boolean(url&&key);
export const supabase=configured?createClient(url,key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}}):null;
export const getShowId=()=>new URLSearchParams(location.search).get('show')||new URLSearchParams(location.search).get('showId')||'';
export async function session(){if(!configured)return null;const{data,error}=await supabase.auth.getSession();if(error)throw error;return data.session}
export async function loadLocations(showId){const{data,error}=await supabase.from('production_locations').select('*').eq('show_id',showId).order('created_at');if(error)throw error;return data||[]}
export async function upsertLocation(row){const payload={id:row.id,show_id:row.showId,episode_id:row.episodeId||null,episode_name:row.episodeName||null,set_name:row.set||'',location_name:row.name||'Untitled Location',address:row.address||'',city:row.city||'',state:row.state||'',postal_code:row.zip||'',area:row.area||'',contact_name:row.contact||'',contact_phone:row.phone||'',contact_email:row.email||'',scout_name:row.scout||'',scout_date:row.date||null,status:row.status||'Needed',notes:row.notes||'',is_final:Boolean(row.isFinal),source:'location_list',metadata:{final:row.final||null}};const{data,error}=await supabase.from('production_locations').upsert(payload).select().single();if(error)throw error;return data}
export function subscribeLocations(showId,callback){if(!configured||!showId)return()=>{};const ch=supabase.channel(`locations:${showId}`).on('postgres_changes',{event:'*',schema:'public',table:'production_locations',filter:`show_id=eq.${showId}`},callback).subscribe();return()=>supabase.removeChannel(ch)}
