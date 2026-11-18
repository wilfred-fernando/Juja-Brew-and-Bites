import { normalizeUnit, convertQuantity } from './inventory.js';
export function inventoryUnitReference(item, legacy = {}) {
 if (item.small_unit) return {bulkUnit:normalizeUnit(item.bulk_unit),smallUnit:normalizeUnit(item.small_unit),factor:Number(item.units_per_bulk)||1};
 const small=normalizeUnit(legacy.reference_unit || item.unit);
 return small!==normalizeUnit(item.unit) && Number(legacy.reference_quantity)>0
  ? {bulkUnit:normalizeUnit(item.unit),smallUnit:small,factor:Number(legacy.reference_quantity)}
  : {bulkUnit:'',smallUnit:normalizeUnit(item.unit),factor:1};
}
export function inventorySmallQuantity(item, quantity, fromUnit, legacy) {
 const ref=inventoryUnitReference(item,legacy), from=normalizeUnit(fromUnit);
 if(ref.bulkUnit && from===ref.bulkUnit)return Number(quantity)*ref.factor;
 try{return convertQuantity(quantity,from,ref.smallUnit);}catch(error){
  if(!ref.bulkUnit)throw error;
  return convertQuantity(quantity,from,ref.bulkUnit)*ref.factor;
 }
}
export function inventoryStorageQuantity(item, quantity, fromUnit, legacy) {
 if(normalizeUnit(fromUnit)===normalizeUnit(item.unit))return Number(quantity);
 const ref=inventoryUnitReference(item,legacy), small=inventorySmallQuantity(item,quantity,fromUnit,legacy);
 if(ref.bulkUnit && normalizeUnit(item.unit)===ref.bulkUnit)return small/ref.factor;
 try{return convertQuantity(small,ref.smallUnit,item.unit);}catch(error){
  if(!ref.bulkUnit)throw error;
  return convertQuantity(small/ref.factor,ref.bulkUnit,item.unit);
 }
}
export function splitInventoryQuantity(item, quantity, legacy) {
 const ref=inventoryUnitReference(item,legacy), value=Math.round(inventorySmallQuantity(item,quantity,item.unit,legacy)*1000)/1000;
 if(!ref.bulkUnit)return {...ref,bulk:0,small:value};
 const bulk=Math.trunc(value/ref.factor);
 const small=Math.round((value-bulk*ref.factor)*1000)/1000;
 return {...ref,bulk,small};
}
export function combineInventoryQuantity(item, bulk, small, legacy) {
 const ref=inventoryUnitReference(item,legacy);
 return inventoryStorageQuantity(item,(ref.bulkUnit ? Number(bulk||0)*ref.factor : 0)+Number(small||0),ref.smallUnit,legacy);
}
