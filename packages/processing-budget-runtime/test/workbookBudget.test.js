'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const h=require('./helpers/boundedDocumentFixtures');
const runtime=()=>h.load('workbookBudget'),core=()=>h.load('index');
function trackedLedger(profile){const {ProcessingBudgetLedger}=core();const events=[];class L extends ProcessingBudgetLedger{reserveForTarget(...args){const token=super.reserveForTarget(...args);events.push(['reserve',args[0],args[1],args[2]]);return Object.freeze({...token,commit(actual){token.commit(actual);events.push(['commit',args[0],args[1]]);},release(){token.release();events.push(['release',args[0],args[1]]);}});}}return{ledger:new L(profile),events};}
const usage=(ledger,id)=>ledger.snapshot().categories.find(x=>x.category===id).committed;
const empty=ledger=>assert.equal(ledger.snapshot().categories.every(x=>x.reserved===0),true);

// Break caught: committing a sheet before a later sheet's aggregate reservation succeeds.
test('late_sheet_failure_releases_every_pending_reservation',()=>{
 const {commitWorkbookBudget}=runtime(),{ledger,events}=trackedLedger({limits:{rows_per_sheet:3,total_rows:5}});
 assert.throws(()=>commitWorkbookBudget({ledger,workbookTarget:'failing',sheets:[{name:'A',rowCount:3},{name:'B',rowCount:3}]}),e=>e.details.constrainedCategory==='total_rows');
 assert.equal(usage(ledger,'total_rows'),0);assert.equal(usage(ledger,'total_sheets'),0);assert.equal(events.filter(x=>x[0]==='commit').length,0);empty(ledger);
 assert.deepEqual(events.filter(x=>x[0]==='release').map(x=>x[2]),events.filter(x=>x[0]==='reserve').map(x=>x[2]).reverse());
});

// Break caught: masking a falsey initial failure, or leaving a partial group pending.
test('enumeration_cancellation_and_invalid_count_keep_first_failure',()=>{
 const {commitWorkbookBudget}=runtime();
 for(const reason of [undefined,null,0,new Error('first')]){
  const {ledger,events}=trackedLedger();function* sheets(){yield{name:'A',rowCount:1};throw reason;}let caught=false;
  try{commitWorkbookBudget({ledger,workbookTarget:'enum',sheets:sheets()});}catch(e){caught=true;assert.strictEqual(e,reason);}assert.equal(caught,true);empty(ledger);assert.equal(events.some(x=>x[0]==='commit'),false);
  const c=trackedLedger();caught=false;try{commitWorkbookBudget({ledger:c.ledger,workbookTarget:'cancel',sheets:[{name:'A',rowCount:1},{name:'B',rowCount:1}],cancellation(){if(c.events.filter(x=>x[0]==='reserve').length>=2)throw reason;}});}catch(e){caught=true;assert.strictEqual(e,reason);}assert.equal(caught,true);empty(c.ledger);assert.equal(usage(c.ledger,'total_rows'),0);
 }
 for(const rowCount of [-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1]){const {ledger}=trackedLedger();assert.throws(()=>commitWorkbookBudget({ledger,workbookTarget:'invalid',sheets:[{name:'A',rowCount}]}));empty(ledger);assert.equal(usage(ledger,'total_sheets'),0);}
});

// Break caught: a commit before the final cancellation checkpoint or an asynchronous group.
test('all_reservations_precede_any_commit_and_commit_has_no_await',()=>{
 const {commitWorkbookBudget}=runtime(),{ledger,events}=trackedLedger();
 const result=commitWorkbookBudget({ledger,workbookTarget:'book',sheets:[{name:'A',rowCount:3},{name:'B',rowCount:2}],cancellation(){assert.equal(events.some(x=>x[0]==='commit'),false);}});
 assert.equal(result instanceof Promise,false);assert.deepEqual([result.sheetCount,result.totalRows],[2,5]);assert.equal(Object.isFrozen(result),true);empty(ledger);
 assert.deepEqual(events.map(x=>x[0]),['reserve','reserve','reserve','commit','commit','commit']);assert.equal(usage(ledger,'total_sheets'),2);assert.equal(usage(ledger,'total_rows'),5);
 assert.ok(result.sheets.every(x=>Buffer.byteLength(x.target,'utf8')<=256));
});

// Break caught: applying rollback to a prior workbook or accepting default/max + 1.
test('default_absolute_and_aggregate_sheet_row_boundaries_are_exact',()=>{
 const {commitWorkbookBudget}=runtime();
 for(const [profile,sheetsPerBook,totalSheets,rowsPerSheet,totalRows]of [[undefined,20,100,500,25000],[core().ABSOLUTE_PROCESSING_BUDGET_PROFILE,100,1000,5000,250000]]){
  let {ledger}=trackedLedger(profile);const make=n=>Array.from({length:n},(_,i)=>({name:'S'+i,rowCount:0}));
  commitWorkbookBudget({ledger,workbookTarget:'exact',sheets:make(sheetsPerBook)});assert.equal(usage(ledger,'total_sheets'),sheetsPerBook);
  const over=trackedLedger(profile);assert.throws(()=>commitWorkbookBudget({ledger:over.ledger,workbookTarget:'over',sheets:make(sheetsPerBook+1)}));empty(over.ledger);assert.equal(usage(over.ledger,'total_sheets'),0);
  ({ledger}=trackedLedger(profile));for(let i=0;i<totalSheets/sheetsPerBook;i++)commitWorkbookBudget({ledger,workbookTarget:'sheets-'+i,sheets:make(sheetsPerBook)});
  assert.equal(usage(ledger,'total_sheets'),totalSheets);assert.throws(()=>commitWorkbookBudget({ledger,workbookTarget:'last',sheets:make(1)}),e=>e.details.constrainedCategory==='total_sheets');assert.equal(usage(ledger,'total_sheets'),totalSheets);empty(ledger);
  ({ledger}=trackedLedger(profile));for(let i=0;i<totalRows/rowsPerSheet;i++)commitWorkbookBudget({ledger,workbookTarget:'rows-'+i,sheets:[{name:'S',rowCount:rowsPerSheet}]});assert.equal(usage(ledger,'total_rows'),totalRows);
  assert.throws(()=>commitWorkbookBudget({ledger,workbookTarget:'one-more',sheets:[{name:'S',rowCount:1}]}),e=>e.details.constrainedCategory==='total_rows');assert.equal(usage(ledger,'total_rows'),totalRows);empty(ledger);
  const rowOver=trackedLedger(profile);assert.throws(()=>commitWorkbookBudget({ledger:rowOver.ledger,workbookTarget:'row-over',sheets:[{name:'S',rowCount:rowsPerSheet+1}]}),e=>e.details.constrainedCategory==='rows_per_sheet');empty(rowOver.ledger);assert.equal(usage(rowOver.ledger,'total_sheets'),0);
 }
 const {ledger}=trackedLedger();const zero=commitWorkbookBudget({ledger,workbookTarget:'empty',sheets:[]});assert.deepEqual([zero.sheetCount,zero.totalRows],[0,0]);empty(ledger);
});

// Break caught: validating each row but allowing an unsafe aggregate sum/getter.
test('invalid_shape_and_safe_total_overflow_never_reserve',()=>{
 const {commitWorkbookBudget}=runtime();const {ledger,events}=trackedLedger();
 assert.throws(()=>commitWorkbookBudget({ledger,workbookTarget:'overflow',sheets:[{name:'A',rowCount:Number.MAX_SAFE_INTEGER},{name:'B',rowCount:1}]}),e=>e.code==='processing_budget_reservation_invalid');assert.equal(events.length,0);empty(ledger);
 let getters=0;assert.throws(()=>commitWorkbookBudget({ledger,workbookTarget:'getter',sheets:[{name:'A',get rowCount(){getters++;return 1;}}]}));assert.equal(getters,0);assert.equal(events.length,0);
});
