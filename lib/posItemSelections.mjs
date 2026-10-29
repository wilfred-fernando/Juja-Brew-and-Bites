export function initialItemSelections(item) {
  // Catalog items must never carry a previous ticket's modifier selections.
  const source = item?.editData;
  if (!source) return {};
  const groups = item.variants || [];
  const selected = {};
  const add = (group, option) => {
    if (!group || !option) return;
    const options = selected[group.id] || [];
    if (!options.some(value => String(value.id) === String(option.id))) selected[group.id] = [...options, option];
  };
  const saved = source.selectedOptions || source.selected_options;
  if (Array.isArray(saved) && saved.length) {
    for (const option of saved) {
      const groupId = option.groupId ?? option.group_id;
      const group = groups.find(group => groupId != null
        ? String(group.id) === String(groupId)
        : (group.options || []).some(value => String(value.id) === String(option.id)));
      add(group, group?.options?.find(value => String(value.id) === String(option.id)));
    }
    return selected;
  }
  // Legacy lines only have option names. Match each occurrence once, so a
  // free sinker does not also select a paid add-on bearing the same name.
  for (const name of String(source.variantDetails || '').split(', ').filter(Boolean)) {
    for (const group of groups) {
      const option = (group.options || []).find(option => option.name === name
        && !(selected[group.id] || []).some(value => String(value.id) === String(option.id)));
      if (option) { add(group, option); break; }
    }
  }
  return selected;
}
