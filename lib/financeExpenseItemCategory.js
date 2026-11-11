const key = value => String(value || '').trim().toLowerCase();
// Item References are authoritative; never overwrite OP-EX / PERSONAL.
export function expenseItemCategory(expense, references = []) {
 const matches = references.filter(ref => ref.ref_type === 'item' && key(ref.name) === key(expense.description));
 const active = matches.filter(ref=>ref.is_active !== false);
 const categories = new Set((active.length ? active : matches).map(ref=>String(ref.item_category || '').trim()).filter(Boolean));
 return categories.size === 1 ? [...categories][0] : 'Uncategorized';
}
