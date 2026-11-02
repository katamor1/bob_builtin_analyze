'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),r=require('../out'),{fakeClock}=require('./helpers/deadlineClock');
// Breaks: extending a parent or rounding residual duration down admits late work.
test('nested_deadlines_do_not_refresh',()=>{
 const parent=r.createAbsoluteDeadline(50,100);assert.deepEqual(parent,{expires_at_monotonic_ms:150});assert.ok(Object.isFrozen(parent));
 assert.deepEqual(r.constrainAbsoluteDeadline(parent,1000,125),{expires_at_monotonic_ms:150});
 assert.deepEqual(r.constrainAbsoluteDeadline(parent,5,125),{expires_at_monotonic_ms:130});
 for(const [now,want]of [[100,50],[149.2,1],[150,0],[151,0]])assert.equal(r.remainingDeadlineMilliseconds(parent,now),want);
 assert.equal(typeof r.monotonicNowMilliseconds(),'number');
});
test('invalid_deadline_and_clock_fail_closed',()=>{
 let getters=0;const accessor=Object.defineProperty({},'expires_at_monotonic_ms',{enumerable:true,get(){getters++;return 150;}});
 const invalid=[null,[],{expires_at_monotonic_ms:NaN},{expires_at_monotonic_ms:Infinity},{expires_at_monotonic_ms:-1},{expires_at_monotonic_ms:Number.MAX_SAFE_INTEGER+1},{expires_at_monotonic_ms:'2026-11-02'},{expires_at_monotonic_ms:150,extra:0},{expires_at_monotonic_ms:150,[Symbol()]:0},Object.create({expires_at_monotonic_ms:150}),accessor];
 for(const value of invalid)assert.throws(()=>r.remainingDeadlineMilliseconds(value,100),TypeError);
 for(const duration of [0,-1,0.5,NaN,Infinity,Number.MAX_SAFE_INTEGER+1,'1000'])assert.throws(()=>r.createAbsoluteDeadline(duration,100),TypeError);
 assert.throws(()=>r.createAbsoluteDeadline(100,Number.MAX_SAFE_INTEGER),TypeError);assert.equal(getters,0);
 for(const now of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])assert.throws(()=>r.remainingDeadlineMilliseconds({expires_at_monotonic_ms:150},now),TypeError);
 const clock=fakeClock(),scope=r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});clock.set(99);assert.throws(()=>scope.remainingMilliseconds(),TypeError);scope.dispose();
});
test('first_observed_user_cause_wins',()=>{
 const clock=fakeClock(),source=new AbortController(),original=new Error('operator');source.abort(original);
 const scope=r.createCancellationScope({deadline:{expires_at_monotonic_ms:100},signal:source.signal,now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});
 assert.equal(r.cancellationKindFromSignal(scope.signal),'user');assert.equal(r.cancellationOriginalReason(scope.signal),original);
 assert.throws(()=>scope.throwIfCancelled(),e=>e.code==='processing_cancelled'&&e.kind==='user'&&e.original_reason===original);clock.set(200);assert.equal(r.cancellationKindFromSignal(scope.signal),'user');scope.dispose();
});
test('multi_source_snapshot_and_registration_race',()=>{
 const clock=fakeClock(),a=new AbortController(),b=new AbortController(),sources=[a.signal,b.signal,a.signal],original={opaque:true};
 const scope=r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},signals:sources,now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});sources.length=0;b.abort(original);a.abort('later');
 assert.equal(r.cancellationOriginalReason(scope.signal),original);assert.equal(r.cancellationKindFromSignal(scope.signal),'user');scope.dispose();
 const race=new AbortController(),add=race.signal.addEventListener.bind(race.signal);race.signal.addEventListener=(...args)=>{add(...args);race.abort(false);};
 const raced=r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},signal:race.signal,now:clock.now,schedule:clock.schedule,cancelSchedule:clock.cancelSchedule});assert.equal(r.cancellationOriginalReason(raced.signal),false);raced.dispose();
 assert.throws(()=>r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},signal:a.signal,signals:[]}),TypeError);
 assert.throws(()=>r.createCancellationScope({deadline:{expires_at_monotonic_ms:150},signals:[{aborted:false}]}),TypeError);
});
