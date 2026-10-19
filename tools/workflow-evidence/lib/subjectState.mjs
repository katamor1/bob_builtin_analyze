import {reject} from './primitives.mjs';
const subjects=new WeakMap(),results=new WeakMap();
export function makeWorkflowEvidenceSubject(state){const token=Object.freeze(Object.create(null));subjects.set(token,Object.freeze(state));return token;}
export function requireSubjectState(token){const state=subjects.get(token);if(!state)reject('evidence.subject.invalid');return state;}
export function bindSubjectResult(subject,kind,result){requireSubjectState(subject);results.set(result,Object.freeze({subject,kind}));return result;}
export function requireSubjectResult(subject,kind,result){requireSubjectState(subject);const state=results.get(result);if(!state||state.subject!==subject||state.kind!==kind)reject('evidence.subject.invalid');return result;}
