'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {freshArtifactRoot,packageRoot}=require('../helpers');
const {ProcessingBudgetLedger}=require('../../out/processingBudgetLedger');
const observed=new WeakMap();
class ObservedLedger extends ProcessingBudgetLedger {
  constructor(profile){super(profile);observed.set(this,{open:new Set(),events:[]});}
  reserveForTarget(...args){
    const state=observed.get(this);state.events.push(['reserve',...args]);
    const token=super.reserveForTarget(...args);state.open.add(token);
    return Object.freeze({...token,
      commit(actual){token.commit(actual);state.open.delete(token);state.events.push(['commit',actual]);},
      release(){token.release();state.open.delete(token);state.events.push(['release']);}
    });
  }
}
function observeLedger(profile){return new ObservedLedger(profile);}
function committedTriple(ledger){const r=ledger.snapshot();return ['single_document_bytes','total_document_bytes','total_operation_input_bytes'].map(id=>r.categories.find(x=>x.category===id).committed);}
function openReservations(ledger){return observed.get(ledger)?.open.size??0;}
function fixture(bytes=Buffer.from('source!')){const root=freshArtifactRoot('bounded');const filePath=path.join(root,'source.bin');fs.writeFileSync(filePath,bytes);return{root,filePath,bytes,input:{filePath,rootPath:root,maximumFileBytes:1024,target:'test-document',ledger:observeLedger()}};}
function load(module='boundedDocumentIo'){const file=path.join(packageRoot,'out',module+'.js');assert.ok(fs.existsSync(file),'bounded document runtime must be compiled: '+module);return require(file);}
function wrapHandle(handle,hooks={}){return new Proxy(handle,{get(target,key){if(hooks[key])return (...args)=>hooks[key](target,...args);const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});}
module.exports={fixture,load,observeLedger,committedTriple,openReservations,wrapHandle,events:ledger=>observed.get(ledger).events};
