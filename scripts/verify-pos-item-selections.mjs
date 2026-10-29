import assert from 'node:assert/strict';
import { initialItemSelections } from '../lib/posItemSelections.mjs';
const item={name:'Juja Trio Milk Tea',variants:[
  {id:'sinkers',name:'Sinkers Selection',options:[{id:1,name:'Black Pearl',price:0}]},
  {id:'addons',name:'Add on',options:[{id:2,name:'Black Pearl',price:20}]},
]};
assert.deepEqual(initialItemSelections({...item,variantDetails:'Black Pearl',selectedOptions:[{id:1,groupId:'sinkers'}]}),{},'New items start blank even with stale catalog selection fields');
const edit=initialItemSelections({...item,editData:{variantDetails:'Black Pearl',selectedOptions:[{id:1,groupId:'sinkers'}]}});
assert.deepEqual(Object.keys(edit),['sinkers'],'Editing free sinkers must not select paid add-ons');
assert.equal(edit.sinkers[0].price,0);
assert.deepEqual(Object.keys(initialItemSelections({...item,editData:{selectedOptions:[{id:2,groupId:'addons'}]}})),['addons']);
assert.deepEqual(Object.keys(initialItemSelections({...item,editData:{variantDetails:'Black Pearl'}})),['sinkers']);
assert.deepEqual(Object.keys(initialItemSelections({...item,editData:{variantDetails:'Black Pearl, Black Pearl'}})),['sinkers','addons']);
assert.deepEqual(initialItemSelections(item),{},'Opening a fresh Trio after editing does not reuse selections');
console.log('PASS: blank new-item sinkers, group-aware edit restore, no automatic paid add-ons, legacy restore');
