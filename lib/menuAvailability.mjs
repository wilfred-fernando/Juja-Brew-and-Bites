export function applyMenuAvailability(item, saved) {
  if (Date.parse(item.updated_at || '') > Date.parse(saved.updated_at || '')) return item;
  return String(item.id) === String(saved.id) ? { ...item, is_available: saved.is_available,
    global_is_available: saved.is_available, store_is_available: saved.is_available, updated_at: saved.updated_at } : item;
}

export function updateCatalogAvailability(snapshot, saved) {
  return { ...snapshot, catalogFingerprint: null,
    rawItems: (snapshot.rawItems || []).map(item => applyMenuAvailability(item, saved)),
    items: (snapshot.items || []).map(item => applyMenuAvailability(item, saved)) };
}

export function updateCatalogOptionAvailability(snapshot, saved, groupKey, optionKey) {
  const items = (snapshot.items || []).map(item => ({ ...item, variants: Array.isArray(item.variants) ? item.variants.map(group =>
    groupKey(group.name || group.groupName || group.label || group.id) !== saved.group_key ? group : {
      ...group, options: (group.options || []).map(option => optionKey(option.name || option.label || option.id || option.value) !== saved.option_key
        ? option : { ...option, isAvailable: saved.is_available, is_available: saved.is_available }),
    }) : item.variants }));
  const rows = (snapshot.optionSelectionStoreAvailability || []).filter(row => !(row.group_key === saved.group_key && row.option_key === saved.option_key));
  return { ...snapshot, items, optionSelectionStoreAvailability: [...rows, saved] };
}

function clientId() {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    const existing = storage.getItem('juja_availability_client_id');
    if (/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(existing || '')) return existing;
    const value = globalThis.crypto.randomUUID();
    storage.setItem('juja_availability_client_id', value);
    return value;
  } catch { return null; }
}

export async function saveMenuAvailability(client, item, available, source) {
  const { data, error } = await client.rpc('set_shared_menu_availability_checked', {
    p_item_key: String(item.id), p_available: available, p_expected_updated_at: item.updated_at || null,
    p_source: source, p_client_id: clientId(),
  });
  if (error) throw error;
  if (String(data?.id) !== String(item.id) || data?.is_available !== available || !data?.updated_at) throw new Error('Availability update was not confirmed. Refresh the item list.');
  return data;
}
