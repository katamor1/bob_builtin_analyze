'use strict';
const {test,mock}=require('node:test'),assert=require('node:assert/strict'),r=require('../out'),preflight=require('../out/ooxmlPreflight'),prepare=require('../out/ooxmlParserInput'),h=require('./helpers/boundedDocumentFixtures'),{fakeClock}=require('./helpers/deadlineClock');
const limits={maxOoxmlEntries:5000,maxOoxmlDeclaredUncompressedBytes:250*1048576},structural={maxEntries:5000,maxExpandedBytes:250*1048576};
const scoped=clock=>r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});
test('trusted_expiry_in_eocd_search',async()=>{
 const bytes=h.buildZip(h.entries(),{comment:Buffer.alloc(64)}),clock=fakeClock(),scope=scoped(clock),read=Buffer.prototype.readUInt32LE;let reads=0;
 const spy=mock.method(Buffer.prototype,'readUInt32LE',function(...args){const result=read.apply(this,args);reads++;clock.set(150);return result;});
 try{await assert.rejects(()=>preflight.preflightOoxmlArchive(bytes,limits,{signal:scope.signal}),e=>e.code==='processing_cancelled');assert.equal(reads,1);}finally{scope.dispose();spy.mock.restore();}
});
test('trusted_expiry_in_zip_entry_and_crc_loop',async t=>{
 await t.test('central entry',async()=>{const bytes=h.buildZip(h.entries()),clock=fakeClock(),scope=scoped(clock),toString=Buffer.prototype.toString;let names=0;const spy=mock.method(Buffer.prototype,'toString',function(encoding,...args){const result=toString.call(this,encoding,...args);if(encoding==='utf8'){names++;clock.set(150);}return result;});
  try{await assert.rejects(()=>preflight.preflightOoxmlArchive(bytes,limits,{signal:scope.signal}),e=>e.code==='processing_cancelled');assert.equal(names,1);}finally{scope.dispose();spy.mock.restore();}
 });
 await t.test('crc loop',async()=>{const target=131072,bytes=h.buildZip([{name:'[Content_Types].xml',data:'types'},{name:'word/document.xml',data:Buffer.alloc(target,120),method:0}]),clock=fakeClock(),scope=scoped(clock);let visited=0;const arrayPrototype=Object.getPrototypeOf(Uint8Array.prototype),descriptor=Object.getOwnPropertyDescriptor(arrayPrototype,Symbol.iterator),iterator=descriptor.value;Object.defineProperty(arrayPrototype,Symbol.iterator,{...descriptor,value:function*(){for(const byte of iterator.call(this)){if(this.length===target&&++visited===32768)clock.set(150);yield byte;}}});
  try{await assert.rejects(()=>prepare.prepareAdmittedOoxmlSnapshot(bytes,'docx',structural,async()=>h.codec(),scope.signal),e=>e.code==='processing_cancelled');assert.ok(visited<=36864,visited);}finally{scope.dispose();Object.defineProperty(arrayPrototype,Symbol.iterator,descriptor);}
 });
});
test('pre_cancelled_archive_clones_and_reserves_nothing',async()=>{
 const f=await h.request(),clock=fakeClock(),scope=scoped(clock),from=Buffer.from;let cloneCalls=0,parserCalls=0;clock.set(150);const spy=mock.method(Buffer,'from',function(input,...args){if(Buffer.isBuffer(input))cloneCalls++;return from.call(this,input,...args);});
 try{await assert.rejects(()=>require("../out/validatedOoxml").withValidatedOoxmlParserInput({...f.request,signal:scope.signal},async()=>{parserCalls++;}),e=>e.code==='processing_cancelled');assert.deepEqual([cloneCalls,h.events(f.input.ledger).filter(e=>e[0]==='reserve').length,parserCalls],[0,0,0]);}finally{scope.dispose();spy.mock.restore();}
});
