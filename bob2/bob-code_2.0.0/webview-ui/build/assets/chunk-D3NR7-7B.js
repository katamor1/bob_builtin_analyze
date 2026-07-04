import{r as Dt,I as Mo}from"./chunk-Xih6_Bxx.js";function gi({i18n:n,defaultNS:e,children:t}){const o=Dt.useMemo(()=>({i18n:n,defaultNS:e}),[n,e]);return Dt.createElement(Mo.Provider,{value:o},t)}/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const et=globalThis,Et=et.ShadowRoot&&(et.ShadyCSS===void 0||et.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Ot=Symbol(),Ft=new WeakMap;let ao=class{constructor(e,t,o){if(this._$cssResult$=!0,o!==Ot)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(Et&&e===void 0){const o=t!==void 0&&t.length===1;o&&(e=Ft.get(t)),e===void 0&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),o&&Ft.set(t,e))}return e}toString(){return this.cssText}};const ht=n=>new ao(typeof n=="string"?n:n+"",void 0,Ot),b=(n,...e)=>{const t=n.length===1?n[0]:e.reduce(((o,i,s)=>o+(r=>{if(r._$cssResult$===!0)return r.cssText;if(typeof r=="number")return r;throw Error("Value passed to 'css' function must be a 'css' function result: "+r+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(i)+n[s+1]),n[0]);return new ao(t,n,Ot)},Ho=(n,e)=>{if(Et)n.adoptedStyleSheets=e.map((t=>t instanceof CSSStyleSheet?t:t.styleSheet));else for(const t of e){const o=document.createElement("style"),i=et.litNonce;i!==void 0&&o.setAttribute("nonce",i),o.textContent=t.cssText,n.appendChild(o)}},Mt=Et?n=>n:n=>n instanceof CSSStyleSheet?(e=>{let t="";for(const o of e.cssRules)t+=o.cssText;return ht(t)})(n):n;/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{is:jo,defineProperty:qo,getOwnPropertyDescriptor:Uo,getOwnPropertyNames:No,getOwnPropertySymbols:Wo,getPrototypeOf:Ko}=Object,re=globalThis,Ht=re.trustedTypes,Go=Ht?Ht.emptyScript:"",_t=re.reactiveElementPolyfillSupport,je=(n,e)=>n,tt={toAttribute(n,e){switch(e){case Boolean:n=n?Go:null;break;case Object:case Array:n=n==null?n:JSON.stringify(n)}return n},fromAttribute(n,e){let t=n;switch(e){case Boolean:t=n!==null;break;case Number:t=n===null?null:Number(n);break;case Object:case Array:try{t=JSON.parse(n)}catch{t=null}}return t}},Pt=(n,e)=>!jo(n,e),jt={attribute:!0,type:String,converter:tt,reflect:!1,useDefault:!1,hasChanged:Pt};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),re.litPropertyMetadata??(re.litPropertyMetadata=new WeakMap);let ke=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=jt){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const o=Symbol(),i=this.getPropertyDescriptor(e,o,t);i!==void 0&&qo(this.prototype,e,i)}}static getPropertyDescriptor(e,t,o){const{get:i,set:s}=Uo(this.prototype,e)??{get(){return this[t]},set(r){this[t]=r}};return{get:i,set(r){const l=i==null?void 0:i.call(this);s==null||s.call(this,r),this.requestUpdate(e,l,o)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??jt}static _$Ei(){if(this.hasOwnProperty(je("elementProperties")))return;const e=Ko(this);e.finalize(),e.l!==void 0&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(je("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(je("properties"))){const t=this.properties,o=[...No(t),...Wo(t)];for(const i of o)this.createProperty(i,t[i])}const e=this[Symbol.metadata];if(e!==null){const t=litPropertyMetadata.get(e);if(t!==void 0)for(const[o,i]of t)this.elementProperties.set(o,i)}this._$Eh=new Map;for(const[t,o]of this.elementProperties){const i=this._$Eu(t,o);i!==void 0&&this._$Eh.set(i,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const o=new Set(e.flat(1/0).reverse());for(const i of o)t.unshift(Mt(i))}else e!==void 0&&t.push(Mt(e));return t}static _$Eu(e,t){const o=t.attribute;return o===!1?void 0:typeof o=="string"?o:typeof e=="string"?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){var e;this._$ES=new Promise((t=>this.enableUpdating=t)),this._$AL=new Map,this._$E_(),this.requestUpdate(),(e=this.constructor.l)==null||e.forEach((t=>t(this)))}addController(e){var t;(this._$EO??(this._$EO=new Set)).add(e),this.renderRoot!==void 0&&this.isConnected&&((t=e.hostConnected)==null||t.call(e))}removeController(e){var t;(t=this._$EO)==null||t.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const o of t.keys())this.hasOwnProperty(o)&&(e.set(o,this[o]),delete this[o]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return Ho(e,this.constructor.elementStyles),e}connectedCallback(){var e;this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),(e=this._$EO)==null||e.forEach((t=>{var o;return(o=t.hostConnected)==null?void 0:o.call(t)}))}enableUpdating(e){}disconnectedCallback(){var e;(e=this._$EO)==null||e.forEach((t=>{var o;return(o=t.hostDisconnected)==null?void 0:o.call(t)}))}attributeChangedCallback(e,t,o){this._$AK(e,o)}_$ET(e,t){var s;const o=this.constructor.elementProperties.get(e),i=this.constructor._$Eu(e,o);if(i!==void 0&&o.reflect===!0){const r=(((s=o.converter)==null?void 0:s.toAttribute)!==void 0?o.converter:tt).toAttribute(t,o.type);this._$Em=e,r==null?this.removeAttribute(i):this.setAttribute(i,r),this._$Em=null}}_$AK(e,t){var s,r;const o=this.constructor,i=o._$Eh.get(e);if(i!==void 0&&this._$Em!==i){const l=o.getPropertyOptions(i),c=typeof l.converter=="function"?{fromAttribute:l.converter}:((s=l.converter)==null?void 0:s.fromAttribute)!==void 0?l.converter:tt;this._$Em=i;const h=c.fromAttribute(t,l.type);this[i]=h??((r=this._$Ej)==null?void 0:r.get(i))??h,this._$Em=null}}requestUpdate(e,t,o){var i;if(e!==void 0){const s=this.constructor,r=this[e];if(o??(o=s.getPropertyOptions(e)),!((o.hasChanged??Pt)(r,t)||o.useDefault&&o.reflect&&r===((i=this._$Ej)==null?void 0:i.get(e))&&!this.hasAttribute(s._$Eu(e,o))))return;this.C(e,t,o)}this.isUpdatePending===!1&&(this._$ES=this._$EP())}C(e,t,{useDefault:o,reflect:i,wrapped:s},r){o&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,r??t??this[e]),s!==!0||r!==void 0)||(this._$AL.has(e)||(this.hasUpdated||o||(t=void 0),this._$AL.set(e,t)),i===!0&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return e!=null&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var o;if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[s,r]of this._$Ep)this[s]=r;this._$Ep=void 0}const i=this.constructor.elementProperties;if(i.size>0)for(const[s,r]of i){const{wrapped:l}=r,c=this[s];l!==!0||this._$AL.has(s)||c===void 0||this.C(s,void 0,r,c)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),(o=this._$EO)==null||o.forEach((i=>{var s;return(s=i.hostUpdate)==null?void 0:s.call(i)})),this.update(t)):this._$EM()}catch(i){throw e=!1,this._$EM(),i}e&&this._$AE(t)}willUpdate(e){}_$AE(e){var t;(t=this._$EO)==null||t.forEach((o=>{var i;return(i=o.hostUpdated)==null?void 0:i.call(o)})),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach((t=>this._$ET(t,this[t])))),this._$EM()}updated(e){}firstUpdated(e){}};ke.elementStyles=[],ke.shadowRootOptions={mode:"open"},ke[je("elementProperties")]=new Map,ke[je("finalized")]=new Map,_t==null||_t({ReactiveElement:ke}),(re.reactiveElementVersions??(re.reactiveElementVersions=[])).push("2.1.1");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const qe=globalThis,ot=qe.trustedTypes,qt=ot?ot.createPolicy("lit-html",{createHTML:n=>n}):void 0,co="$lit$",ne=`lit$${Math.random().toFixed(9).slice(2)}$`,ho="?"+ne,Yo=`<${ho}>`,ge=document,Ue=()=>ge.createComment(""),Ne=n=>n===null||typeof n!="object"&&typeof n!="function",At=Array.isArray,Xo=n=>At(n)||typeof(n==null?void 0:n[Symbol.iterator])=="function",gt=`[ 	
\f\r]`,De=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Ut=/-->/g,Nt=/>/g,pe=RegExp(`>|${gt}(?:([^\\s"'>=/]+)(${gt}*=${gt}*(?:[^ 	
\f\r"'\`<>=]|("|')|))|$)`,"g"),Wt=/'/g,Kt=/"/g,uo=/^(?:script|style|textarea|title)$/i,po=n=>(e,...t)=>({_$litType$:n,strings:e,values:t}),d=po(1),Zo=po(2),ee=Symbol.for("lit-noChange"),p=Symbol.for("lit-nothing"),Gt=new WeakMap,be=ge.createTreeWalker(ge,129);function fo(n,e){if(!At(n)||!n.hasOwnProperty("raw"))throw Error("invalid template strings array");return qt!==void 0?qt.createHTML(e):e}const Jo=(n,e)=>{const t=n.length-1,o=[];let i,s=e===2?"<svg>":e===3?"<math>":"",r=De;for(let l=0;l<t;l++){const c=n[l];let h,f,u=-1,m=0;for(;m<c.length&&(r.lastIndex=m,f=r.exec(c),f!==null);)m=r.lastIndex,r===De?f[1]==="!--"?r=Ut:f[1]!==void 0?r=Nt:f[2]!==void 0?(uo.test(f[2])&&(i=RegExp("</"+f[2],"g")),r=pe):f[3]!==void 0&&(r=pe):r===pe?f[0]===">"?(r=i??De,u=-1):f[1]===void 0?u=-2:(u=r.lastIndex-f[2].length,h=f[1],r=f[3]===void 0?pe:f[3]==='"'?Kt:Wt):r===Kt||r===Wt?r=pe:r===Ut||r===Nt?r=De:(r=pe,i=void 0);const w=r===pe&&n[l+1].startsWith("/>")?" ":"";s+=r===De?c+Yo:u>=0?(o.push(h),c.slice(0,u)+co+c.slice(u)+ne+w):c+ne+(u===-2?l:w)}return[fo(n,s+(n[t]||"<?>")+(e===2?"</svg>":e===3?"</math>":"")),o]};class We{constructor({strings:e,_$litType$:t},o){let i;this.parts=[];let s=0,r=0;const l=e.length-1,c=this.parts,[h,f]=Jo(e,t);if(this.el=We.createElement(h,o),be.currentNode=this.el.content,t===2||t===3){const u=this.el.content.firstChild;u.replaceWith(...u.childNodes)}for(;(i=be.nextNode())!==null&&c.length<l;){if(i.nodeType===1){if(i.hasAttributes())for(const u of i.getAttributeNames())if(u.endsWith(co)){const m=f[r++],w=i.getAttribute(u).split(ne),B=/([.?@])?(.*)/.exec(m);c.push({type:1,index:s,name:B[2],strings:w,ctor:B[1]==="."?es:B[1]==="?"?ts:B[1]==="@"?os:ut}),i.removeAttribute(u)}else u.startsWith(ne)&&(c.push({type:6,index:s}),i.removeAttribute(u));if(uo.test(i.tagName)){const u=i.textContent.split(ne),m=u.length-1;if(m>0){i.textContent=ot?ot.emptyScript:"";for(let w=0;w<m;w++)i.append(u[w],Ue()),be.nextNode(),c.push({type:2,index:++s});i.append(u[m],Ue())}}}else if(i.nodeType===8)if(i.data===ho)c.push({type:2,index:s});else{let u=-1;for(;(u=i.data.indexOf(ne,u+1))!==-1;)c.push({type:7,index:s}),u+=ne.length-1}s++}}static createElement(e,t){const o=ge.createElement("template");return o.innerHTML=e,o}}function Ie(n,e,t=n,o){var r,l;if(e===ee)return e;let i=o!==void 0?(r=t._$Co)==null?void 0:r[o]:t._$Cl;const s=Ne(e)?void 0:e._$litDirective$;return(i==null?void 0:i.constructor)!==s&&((l=i==null?void 0:i._$AO)==null||l.call(i,!1),s===void 0?i=void 0:(i=new s(n),i._$AT(n,t,o)),o!==void 0?(t._$Co??(t._$Co=[]))[o]=i:t._$Cl=i),i!==void 0&&(e=Ie(n,i._$AS(n,e.values),i,o)),e}let Qo=class{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:o}=this._$AD,i=((e==null?void 0:e.creationScope)??ge).importNode(t,!0);be.currentNode=i;let s=be.nextNode(),r=0,l=0,c=o[0];for(;c!==void 0;){if(r===c.index){let h;c.type===2?h=new Ae(s,s.nextSibling,this,e):c.type===1?h=new c.ctor(s,c.name,c.strings,this,e):c.type===6&&(h=new ss(s,this,e)),this._$AV.push(h),c=o[++l]}r!==(c==null?void 0:c.index)&&(s=be.nextNode(),r++)}return be.currentNode=ge,i}p(e){let t=0;for(const o of this._$AV)o!==void 0&&(o.strings!==void 0?(o._$AI(e,o,t),t+=o.strings.length-2):o._$AI(e[t])),t++}};class Ae{get _$AU(){var e;return((e=this._$AM)==null?void 0:e._$AU)??this._$Cv}constructor(e,t,o,i){this.type=2,this._$AH=p,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=o,this.options=i,this._$Cv=(i==null?void 0:i.isConnected)??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return t!==void 0&&(e==null?void 0:e.nodeType)===11&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=Ie(this,e,t),Ne(e)?e===p||e==null||e===""?(this._$AH!==p&&this._$AR(),this._$AH=p):e!==this._$AH&&e!==ee&&this._(e):e._$litType$!==void 0?this.$(e):e.nodeType!==void 0?this.T(e):Xo(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==p&&Ne(this._$AH)?this._$AA.nextSibling.data=e:this.T(ge.createTextNode(e)),this._$AH=e}$(e){var s;const{values:t,_$litType$:o}=e,i=typeof o=="number"?this._$AC(e):(o.el===void 0&&(o.el=We.createElement(fo(o.h,o.h[0]),this.options)),o);if(((s=this._$AH)==null?void 0:s._$AD)===i)this._$AH.p(t);else{const r=new Qo(i,this),l=r.u(this.options);r.p(t),this.T(l),this._$AH=r}}_$AC(e){let t=Gt.get(e.strings);return t===void 0&&Gt.set(e.strings,t=new We(e)),t}k(e){At(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let o,i=0;for(const s of e)i===t.length?t.push(o=new Ae(this.O(Ue()),this.O(Ue()),this,this.options)):o=t[i],o._$AI(s),i++;i<t.length&&(this._$AR(o&&o._$AB.nextSibling,i),t.length=i)}_$AR(e=this._$AA.nextSibling,t){var o;for((o=this._$AP)==null?void 0:o.call(this,!1,!0,t);e!==this._$AB;){const i=e.nextSibling;e.remove(),e=i}}setConnected(e){var t;this._$AM===void 0&&(this._$Cv=e,(t=this._$AP)==null||t.call(this,e))}}class ut{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,o,i,s){this.type=1,this._$AH=p,this._$AN=void 0,this.element=e,this.name=t,this._$AM=i,this.options=s,o.length>2||o[0]!==""||o[1]!==""?(this._$AH=Array(o.length-1).fill(new String),this.strings=o):this._$AH=p}_$AI(e,t=this,o,i){const s=this.strings;let r=!1;if(s===void 0)e=Ie(this,e,t,0),r=!Ne(e)||e!==this._$AH&&e!==ee,r&&(this._$AH=e);else{const l=e;let c,h;for(e=s[0],c=0;c<s.length-1;c++)h=Ie(this,l[o+c],t,c),h===ee&&(h=this._$AH[c]),r||(r=!Ne(h)||h!==this._$AH[c]),h===p?e=p:e!==p&&(e+=(h??"")+s[c+1]),this._$AH[c]=h}r&&!i&&this.j(e)}j(e){e===p?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class es extends ut{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===p?void 0:e}}class ts extends ut{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==p)}}class os extends ut{constructor(e,t,o,i,s){super(e,t,o,i,s),this.type=5}_$AI(e,t=this){if((e=Ie(this,e,t,0)??p)===ee)return;const o=this._$AH,i=e===p&&o!==p||e.capture!==o.capture||e.once!==o.once||e.passive!==o.passive,s=e!==p&&(o===p||i);i&&this.element.removeEventListener(this.name,this,o),s&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){var t;typeof this._$AH=="function"?this._$AH.call(((t=this.options)==null?void 0:t.host)??this.element,e):this._$AH.handleEvent(e)}}class ss{constructor(e,t,o){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=o}get _$AU(){return this._$AM._$AU}_$AI(e){Ie(this,e)}}const is={I:Ae},mt=qe.litHtmlPolyfillSupport;mt==null||mt(We,Ae),(qe.litHtmlVersions??(qe.litHtmlVersions=[])).push("3.3.1");const vo=(n,e,t)=>{const o=(t==null?void 0:t.renderBefore)??e;let i=o._$litPart$;if(i===void 0){const s=(t==null?void 0:t.renderBefore)??null;o._$litPart$=i=new Ae(e.insertBefore(Ue(),s),s,void 0,t??{})}return i._$AI(n),i};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const _e=globalThis;let K=class extends ke{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var t;const e=super.createRenderRoot();return(t=this.renderOptions).renderBefore??(t.renderBefore=e.firstChild),e}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=vo(t,this.renderRoot,this.renderOptions)}connectedCallback(){var e;super.connectedCallback(),(e=this._$Do)==null||e.setConnected(!0)}disconnectedCallback(){var e;super.disconnectedCallback(),(e=this._$Do)==null||e.setConnected(!1)}render(){return ee}};var lo;K._$litElement$=!0,K.finalized=!0,(lo=_e.litElementHydrateSupport)==null||lo.call(_e,{LitElement:K});const yt=_e.litElementPolyfillSupport;yt==null||yt({LitElement:K});(_e.litElementVersions??(_e.litElementVersions=[])).push("4.2.1");/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const ns=n=>(e,t)=>{t!==void 0?t.addInitializer((()=>{customElements.define(n,e)})):customElements.define(n,e)};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const rs={attribute:!0,type:String,converter:tt,reflect:!1,hasChanged:Pt},ls=(n=rs,e,t)=>{const{kind:o,metadata:i}=t;let s=globalThis.litPropertyMetadata.get(i);if(s===void 0&&globalThis.litPropertyMetadata.set(i,s=new Map),o==="setter"&&((n=Object.create(n)).wrapped=!0),s.set(t.name,n),o==="accessor"){const{name:r}=t;return{set(l){const c=e.get.call(this);e.set.call(this,l),this.requestUpdate(r,c,n)},init(l){return l!==void 0&&this.C(r,void 0,n,l),l}}}if(o==="setter"){const{name:r}=t;return function(l){const c=this[r];e.call(this,l),this.requestUpdate(r,c,n)}}throw Error("Unsupported decorator location: "+o)};function a(n){return(e,t)=>typeof t=="object"?ls(n,e,t):((o,i,s)=>{const r=i.hasOwnProperty(s);return i.constructor.createProperty(s,o),r?Object.getOwnPropertyDescriptor(i,s):void 0})(n,e,t)}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function v(n){return a({...n,state:!0,attribute:!1})}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Ke=(n,e,t)=>(t.configurable=!0,t.enumerable=!0,Reflect.decorate&&typeof e!="object"&&Object.defineProperty(n,e,t),t);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function H(n,e){return(t,o,i)=>{const s=r=>{var l;return((l=r.renderRoot)==null?void 0:l.querySelector(n))??null};if(e){const{get:r,set:l}=typeof o=="object"?t:i??(()=>{const c=Symbol();return{get(){return this[c]},set(h){this[c]=h}}})();return Ke(t,o,{get(){let c=r.call(this);return c===void 0&&(c=s(this),(c!==null||this.hasUpdated)&&l.call(this,c)),c}})}return Ke(t,o,{get(){return s(this)}})}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */let as;function cs(n){return(e,t)=>Ke(e,t,{get(){return(this.renderRoot??as??(as=document.createDocumentFragment())).querySelectorAll(n)}})}/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function J(n){return(e,t)=>{const{slot:o,selector:i}=n??{},s="slot"+(o?`[name=${o}]`:":not([name])");return Ke(e,t,{get(){var c;const r=(c=this.renderRoot)==null?void 0:c.querySelector(s),l=(r==null?void 0:r.assignedElements(n))??[];return i===void 0?l:l.filter((h=>h.matches(i)))}})}}/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function ds(n){return(e,t)=>{const{slot:o}={},i="slot"+(o?`[name=${o}]`:":not([name])");return Ke(e,t,{get(){var r;const s=(r=this.renderRoot)==null?void 0:r.querySelector(i);return(s==null?void 0:s.assignedNodes(n))??[]}})}}const wt="1.17.0",Yt="__vscodeElements_disableRegistryWarning__";class x extends K{get version(){return wt}}const _=n=>e=>{if(!customElements.get(n)){customElements.define(n,e);return}if(Yt in window)return;const o=document.createElement(n),i=o==null?void 0:o.version;let s="";i?i!==wt?(s+="is already registered by a different version of VSCode Elements. ",s+=`This version is "${wt}", while the other one is "${i}".`):s+="is already registered by the same version of VSCode Elements. ":(console.warn(n,"is already registered by an unknown custom element handler class."),s+="is already registered by an unknown custom element handler class."),console.warn(`[VSCode Elements] ${n} ${s}
To suppress this warning, set window.${Yt} to true`)},g=b`
  :host([hidden]) {
    display: none;
  }

  :host([disabled]),
  :host(:disabled) {
    cursor: not-allowed;
    opacity: 0.4;
    pointer-events: none;
  }
`,hs=16,us=13,ps=hs/us;function Rt(){return navigator.userAgent.indexOf("Linux")>-1?'system-ui, "Ubuntu", "Droid Sans", sans-serif':navigator.userAgent.indexOf("Mac")>-1?"-apple-system, BlinkMacSystemFont, sans-serif":navigator.userAgent.indexOf("Windows")>-1?'"Segoe WPC", "Segoe UI", sans-serif':"sans-serif"}const fs=ht(Rt()),vs=[g,b`
    :host {
      background-color: var(--vscode-badge-background, #616161);
      border: 1px solid var(--vscode-contrastBorder, transparent);
      border-radius: 2px;
      box-sizing: border-box;
      color: var(--vscode-badge-foreground, #f8f8f8);
      display: inline-block;
      font-family: var(--vscode-font-family, ${fs});
      font-size: 11px;
      font-weight: 400;
      line-height: 14px;
      min-width: 18px;
      padding: 2px 3px;
      text-align: center;
      white-space: nowrap;
    }

    :host([variant='counter']) {
      border-radius: 11px;
      line-height: 11px;
      min-height: 18px;
      min-width: 18px;
      padding: 3px 6px;
    }

    :host([variant='activity-bar-counter']) {
      background-color: var(--vscode-activityBarBadge-background, #0078d4);
      border-radius: 20px;
      color: var(--vscode-activityBarBadge-foreground, #ffffff);
      font-size: 9px;
      font-weight: 600;
      line-height: 16px;
      padding: 0 4px;
    }

    :host([variant='tab-header-counter']) {
      background-color: var(--vscode-activityBarBadge-background, #0078d4);
      border-radius: 10px;
      color: var(--vscode-activityBarBadge-foreground, #ffffff);
      line-height: 10px;
      min-height: 16px;
      min-width: 16px;
      padding: 3px 5px;
    }
  `];var bo=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let st=class extends x{constructor(){super(...arguments),this.variant="default"}render(){return d` <slot></slot> `}};st.styles=vs;bo([a({reflect:!0})],st.prototype,"variant",void 0);st=bo([_("vscode-badge")],st);/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const Bt={ATTRIBUTE:1,CHILD:2,PROPERTY:3},Vt=n=>(...e)=>({_$litDirective$:n,values:e});class zt{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,o){this._$Ct=e,this._$AM=t,this._$Ci=o}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}}/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const $=Vt(class extends zt{constructor(n){var e;if(super(n),n.type!==Bt.ATTRIBUTE||n.name!=="class"||((e=n.strings)==null?void 0:e.length)>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(n){return" "+Object.keys(n).filter((e=>n[e])).join(" ")+" "}update(n,[e]){var o,i;if(this.st===void 0){this.st=new Set,n.strings!==void 0&&(this.nt=new Set(n.strings.join(" ").split(/\s/).filter((s=>s!==""))));for(const s in e)e[s]&&!((o=this.nt)!=null&&o.has(s))&&this.st.add(s);return this.render(e)}const t=n.element.classList;for(const s of this.st)s in e||(t.remove(s),this.st.delete(s));for(const s in e){const r=!!e[s];r===this.st.has(s)||(i=this.nt)!=null&&i.has(s)||(r?(t.add(s),this.st.add(s)):(t.remove(s),this.st.delete(s)))}return ee}});/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const y=n=>n??p;class bs extends zt{constructor(e){if(super(e),this._prevProperties={},e.type!==Bt.PROPERTY||e.name!=="style")throw new Error("The `stylePropertyMap` directive must be used in the `style` property")}update(e,[t]){return Object.entries(t).forEach(([o,i])=>{this._prevProperties[o]!==i&&(o.startsWith("--")?e.element.style.setProperty(o,i):e.element.style[o]=i,this._prevProperties[o]=i)}),ee}render(e){return ee}}const F=Vt(bs),_s=[g,b`
    :host {
      color: var(--vscode-icon-foreground, #cccccc);
      display: inline-block;
    }

    .codicon[class*='codicon-'] {
      display: block;
    }

    .icon,
    .button {
      background-color: transparent;
      display: block;
      padding: 0;
    }

    .button {
      border-color: transparent;
      border-style: solid;
      border-width: 1px;
      border-radius: 5px;
      color: currentColor;
      cursor: pointer;
      padding: 2px;
    }

    .button:hover {
      background-color: var(
        --vscode-toolbar-hoverBackground,
        rgba(90, 93, 94, 0.31)
      );
    }

    .button:active {
      background-color: var(
        --vscode-toolbar-activeBackground,
        rgba(99, 102, 103, 0.31)
      );
    }

    .button:focus {
      outline: none;
    }

    .button:focus-visible {
      border-color: var(--vscode-focusBorder, #0078d4);
    }

    @keyframes icon-spin {
      100% {
        transform: rotate(360deg);
      }
    }

    .spin {
      animation-name: icon-spin;
      animation-timing-function: linear;
      animation-iteration-count: infinite;
    }
  `];var ye=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s},He;let Y=He=class extends x{constructor(){super(...arguments),this.label="",this.name="",this.size=16,this.spin=!1,this.spinDuration=1.5,this.actionIcon=!1,this._onButtonClick=e=>{this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:e}}))}}connectedCallback(){super.connectedCallback();const{href:e,nonce:t}=this._getStylesheetConfig();He.stylesheetHref=e,He.nonce=t}_getStylesheetConfig(){const e=document.getElementById("vscode-codicon-stylesheet"),t=(e==null?void 0:e.getAttribute("href"))||void 0,o=(e==null?void 0:e.nonce)||void 0;if(!e){let i="[VSCode Elements] To use the Icon component, the codicons.css file must be included in the page with the id `vscode-codicon-stylesheet`! ";i+="See https://vscode-elements.github.io/components/icon/ for more details.",console.warn(i)}return{nonce:o,href:t}}render(){const{stylesheetHref:e,nonce:t}=He,o=d`<span
      class=${$({codicon:!0,["codicon-"+this.name]:!0,spin:this.spin})}
      .style=${F({animationDuration:String(this.spinDuration)+"s",fontSize:this.size+"px",height:this.size+"px",width:this.size+"px"})}
    ></span>`,i=this.actionIcon?d` <button
          class="button"
          @click=${this._onButtonClick}
          aria-label=${this.label}
        >
          ${o}
        </button>`:d` <span class="icon" aria-hidden="true" role="presentation"
          >${o}</span
        >`;return d`
      <link
        rel="stylesheet"
        href=${y(e)}
        nonce=${y(t)}
      >
      ${i}
    `}};Y.styles=_s;Y.stylesheetHref="";Y.nonce="";ye([a()],Y.prototype,"label",void 0);ye([a({type:String})],Y.prototype,"name",void 0);ye([a({type:Number})],Y.prototype,"size",void 0);ye([a({type:Boolean,reflect:!0})],Y.prototype,"spin",void 0);ye([a({type:Number,attribute:"spin-duration"})],Y.prototype,"spinDuration",void 0);ye([a({type:Boolean,reflect:!0,attribute:"action-icon"})],Y.prototype,"actionIcon",void 0);Y=He=ye([_("vscode-icon")],Y);const gs=ht(Rt()),ms=[g,b`
    :host {
      background-color: var(--vscode-button-background, #0078d4);
      border-color: var(--vscode-button-border, transparent);
      border-style: solid;
      border-radius: 2px;
      border-width: 1px;
      color: var(--vscode-button-foreground, #ffffff);
      cursor: pointer;
      display: inline-flex;
      font-family: var(--vscode-font-family, ${gs});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 22px;
      overflow: hidden;
      padding: 0;
      user-select: none;
      white-space: nowrap;
    }

    :host([secondary]) {
      color: var(--vscode-button-secondaryForeground, #cccccc);
      background-color: var(--vscode-button-secondaryBackground, #313131);
      border-color: var(
        --vscode-button-border,
        var(--vscode-button-secondaryBackground, rgba(255, 255, 255, 0.07))
      );
    }

    :host([disabled]) {
      cursor: default;
      opacity: 0.4;
      pointer-events: none;
    }

    :host(:hover) {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }

    :host([disabled]:hover) {
      background-color: var(--vscode-button-background, #0078d4);
    }

    :host([secondary]:hover) {
      background-color: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
    }

    :host([secondary][disabled]:hover) {
      background-color: var(--vscode-button-secondaryBackground, #313131);
    }

    :host(:focus),
    :host(:active) {
      outline: none;
    }

    :host(:focus) {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: 2px;
    }

    :host([disabled]:focus) {
      background-color: var(--vscode-button-background, #0078d4);
      outline: 0;
    }

    :host([secondary]:focus) {
      background-color: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
    }

    :host([secondary][disabled]:focus) {
      background-color: var(--vscode-button-secondaryBackground, #313131);
    }

    ::slotted(*) {
      display: inline-block;
      margin-left: 4px;
      margin-right: 4px;
    }

    ::slotted(*:first-child) {
      margin-left: 0;
    }

    ::slotted(*:last-child) {
      margin-right: 0;
    }

    ::slotted(vscode-icon) {
      color: inherit;
    }

    .wrapper {
      align-items: center;
      box-sizing: border-box;
      display: flex;
      justify-content: center;
      position: relative;
      width: var(--wrapper-width, 100%);
      height: 100%;
      padding: 1px 13px;
    }

    :host(:empty) .wrapper,
    :host([icon-only]) .wrapper {
      min-height: 24px;
      min-width: 16px;
      padding: 1px 5px;
    }

    slot {
      align-items: center;
      display: flex;
      height: 100%;
    }

    .icon,
    .icon-after {
      color: inherit;
      display: block;
    }

    :host(:not(:empty)) .icon {
      margin-right: 3px;
    }

    :host(:not(:empty)) .icon-after,
    :host([icon]) .icon-after {
      margin-left: 3px;
    }

    .divider {
      display: var(--divider-display, none);
      background-color: transparent;
      padding: 4px 0;
      box-sizing: border-box;
    }

    :host(:hover) .divider,
    :host(:focus) .divider {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }

    :host([secondary]) .divider {
      background-color: var(--vscode-button-secondaryBackground, #313131);
    }

    :host([secondary]:hover) .divider,
    :host([secondary]:focus) .divider {
      background-color: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
    }

    .divider > div {
      background-color: var(
        --vscode-button-separator,
        rgba(255, 255, 255, 0.4)
      );
      height: 100%;
      width: 1px;
      margin: 0;
    }

    :host([secondary]) .divider > div {
      background-color: var(--vscode-button-secondaryForeground, #cccccc);
      opacity: 0.4;
    }
  `];var D=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let V=class extends x{get form(){return this._internals.form}constructor(){super(),this.autofocus=!1,this.tabIndex=0,this.secondary=!1,this.role="button",this.disabled=!1,this.icon="",this.iconSpin=!1,this.iconAfter="",this.iconAfterSpin=!1,this.focused=!1,this.name=void 0,this.iconOnly=!1,this.type="button",this.value="",this._prevTabindex=0,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1},this.addEventListener("keydown",this._handleKeyDown.bind(this)),this.addEventListener("click",this._handleClick.bind(this)),this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.autofocus&&(this.tabIndex<0&&(this.tabIndex=0),this.updateComplete.then(()=>{this.focus(),this.requestUpdate()})),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}update(e){super.update(e),e.has("value")&&this._internals.setFormValue(this.value),e.has("disabled")&&(this.disabled?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):this.tabIndex=this._prevTabindex)}_executeAction(){this.type==="submit"&&this._internals.form&&this._internals.form.requestSubmit(),this.type==="reset"&&this._internals.form&&this._internals.form.reset()}_handleKeyDown(e){if((e.key==="Enter"||e.key===" ")&&!this.hasAttribute("disabled")){this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:new MouseEvent("click")}}));const t=new MouseEvent("click",{bubbles:!0,cancelable:!0});t.synthetic=!0,this.dispatchEvent(t),this._executeAction()}}_handleClick(e){e.synthetic||this.hasAttribute("disabled")||(this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:e}})),this._executeAction())}render(){const e=this.icon!=="",t=this.iconAfter!=="",o={wrapper:!0,"has-icon-before":e,"has-icon-after":t,"icon-only":this.iconOnly},i=e?d`<vscode-icon
          name=${this.icon}
          ?spin=${this.iconSpin}
          spin-duration=${y(this.iconSpinDuration)}
          class="icon"
        ></vscode-icon>`:p,s=t?d`<vscode-icon
          name=${this.iconAfter}
          ?spin=${this.iconAfterSpin}
          spin-duration=${y(this.iconAfterSpinDuration)}
          class="icon-after"
        ></vscode-icon>`:p;return d`
      <span class=${$(o)}>
        ${i}
        <slot></slot>
        ${s}
      </span>
      <div class="divider"><div></div></div>
    `}};V.styles=ms;V.formAssociated=!0;D([a({type:Boolean,reflect:!0})],V.prototype,"autofocus",void 0);D([a({type:Number,reflect:!0})],V.prototype,"tabIndex",void 0);D([a({type:Boolean,reflect:!0})],V.prototype,"secondary",void 0);D([a({reflect:!0})],V.prototype,"role",void 0);D([a({type:Boolean,reflect:!0})],V.prototype,"disabled",void 0);D([a()],V.prototype,"icon",void 0);D([a({type:Boolean,reflect:!0,attribute:"icon-spin"})],V.prototype,"iconSpin",void 0);D([a({type:Number,reflect:!0,attribute:"icon-spin-duration"})],V.prototype,"iconSpinDuration",void 0);D([a({attribute:"icon-after"})],V.prototype,"iconAfter",void 0);D([a({type:Boolean,reflect:!0,attribute:"icon-after-spin"})],V.prototype,"iconAfterSpin",void 0);D([a({type:Number,reflect:!0,attribute:"icon-after-spin-duration"})],V.prototype,"iconAfterSpinDuration",void 0);D([a({type:Boolean,reflect:!0})],V.prototype,"focused",void 0);D([a({type:String,reflect:!0})],V.prototype,"name",void 0);D([a({type:Boolean,reflect:!0,attribute:"icon-only"})],V.prototype,"iconOnly",void 0);D([a({reflect:!0})],V.prototype,"type",void 0);D([a()],V.prototype,"value",void 0);V=D([_("vscode-button")],V);const ys=[g,b`
    :host {
      display: inline-flex;
      align-items: stretch;
      padding: 0;
      border: none;
      overflow: hidden;
    }

    ::slotted(vscode-button:not(:first-child)) {
      border-top-left-radius: 0;
      border-bottom-left-radius: 0;
      border-left-width: 0;
    }

    ::slotted(vscode-button:not(:last-child)) {
      --divider-display: block;
      --wrapper-width: calc(100% - 1px);

      border-top-right-radius: 0;
      border-bottom-right-radius: 0;
      border-right-width: 0;
    }

    ::slotted(vscode-button:focus) {
      z-index: 1;
    }
  `];var xs=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let $t=class extends x{render(){return d` <slot></slot> `}};$t.styles=ys;$t=xs([ns("vscode-button-group")],$t);var ws=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};class Tt extends x{constructor(){super(),this.focused=!1,this._prevTabindex=0,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1}}connectedCallback(){super.connectedCallback(),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o),e==="disabled"&&this.hasAttribute("disabled")?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):e==="disabled"&&!this.hasAttribute("disabled")&&(this.tabIndex=this._prevTabindex)}}ws([a({type:Boolean,reflect:!0})],Tt.prototype,"focused",void 0);var $s=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};const _o=n=>{class e extends n{constructor(){super(...arguments),this._label="",this._slottedText=""}set label(o){this._label=o,this._slottedText===""&&this.setAttribute("aria-label",o)}get label(){return this._label}_handleSlotChange(){this._slottedText=this.textContent?this.textContent.trim():"",this._slottedText!==""&&this.setAttribute("aria-label",this._slottedText)}_renderLabelAttribute(){return this._slottedText===""?d`<span class="label-attr">${this._label}</span>`:d`${p}`}}return $s([a()],e.prototype,"label",null),e},go=[b`
    :host {
      color: var(--vscode-foreground, #cccccc);
      display: inline-block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 18px;
    }

    :host(:focus) {
      outline: none;
    }

    :host([disabled]) {
      opacity: 0.4;
    }

    .wrapper {
      cursor: pointer;
      display: block;
      font-size: var(--vscode-font-size, 13px);
      margin-bottom: 4px;
      margin-top: 4px;
      min-height: 18px;
      position: relative;
      user-select: none;
    }

    :host([disabled]) .wrapper {
      cursor: default;
    }

    input {
      position: absolute;
      height: 1px;
      left: 9px;
      margin: 0;
      top: 17px;
      width: 1px;
      overflow: hidden;
      clip: rect(1px, 1px, 1px, 1px);
      white-space: nowrap;
    }

    .icon {
      align-items: center;
      background-color: var(--vscode-settings-checkboxBackground, #313131);
      background-size: 16px;
      border: 1px solid var(--vscode-settings-checkboxBorder, #3c3c3c);
      box-sizing: border-box;
      color: var(--vscode-settings-checkboxForeground, #cccccc);
      display: flex;
      height: 18px;
      justify-content: center;
      left: 0;
      margin-left: 0;
      margin-right: 9px;
      padding: 0;
      pointer-events: none;
      position: absolute;
      top: 0;
      width: 18px;
    }

    .icon.before-empty-label {
      margin-right: 0;
    }

    .label {
      cursor: pointer;
      display: block;
      min-height: 18px;
      min-width: 18px;
    }

    .label-inner {
      display: block;
      opacity: 0.9;
      padding-left: 27px;
    }

    .label-inner.empty {
      padding-left: 0;
    }

    :host([disabled]) .label {
      cursor: default;
    }
  `],Cs=[g,go,b`
    :host(:invalid) .icon,
    :host([invalid]) .icon {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    .icon {
      border-radius: 3px;
    }

    .indeterminate-icon {
      background-color: currentColor;
      position: absolute;
      height: 1px;
      width: 12px;
    }

    :host(:focus):host(:not([disabled])) .icon {
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: -1px;
    }
  `];var W=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let M=class extends _o(Tt){set checked(e){this._checked=e,this._manageRequired(),this.requestUpdate()}get checked(){return this._checked}set required(e){this._required=e,this._manageRequired(),this.requestUpdate()}get required(){return this._required}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}constructor(){super(),this.autofocus=!1,this._checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name=void 0,this.value="",this.disabled=!1,this.indeterminate=!1,this._required=!1,this.type="checkbox",this._handleClick=e=>{e.preventDefault(),!this.disabled&&this._toggleState()},this._handleKeyDown=e=>{var t;!this.disabled&&(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),e.key===" "&&this._toggleState(),e.key==="Enter"&&((t=this._internals.form)==null||t.requestSubmit()))},this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleKeyDown),this.updateComplete.then(()=>{this._manageRequired(),this._setActualFormValue()})}disconnectedCallback(){this.removeEventListener("keydown",this._handleKeyDown)}update(e){super.update(e),e.has("checked")&&(this.ariaChecked=this.checked?"true":"false")}formResetCallback(){this.checked=this.defaultChecked}formStateRestoreCallback(e,t){e&&(this.checked=!0)}_setActualFormValue(){let e="";this.checked?e=this.value?this.value:"on":e=null,this._internals.setFormValue(e)}_toggleState(){this.checked=!this.checked,this.indeterminate=!1,this._setActualFormValue(),this._manageRequired(),this.dispatchEvent(new Event("change",{bubbles:!0})),this.dispatchEvent(new CustomEvent("vsc-change",{detail:{checked:this.checked,label:this.label,value:this.value},bubbles:!0,composed:!0}))}_manageRequired(){!this.checked&&this.required?this._internals.setValidity({valueMissing:!0},"Please check this box if you want to proceed.",this._inputEl??void 0):this._internals.setValidity({})}render(){const e=$({icon:!0,checked:this.checked,indeterminate:this.indeterminate}),t=$({"label-inner":!0}),o=d`<svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      class="check-icon"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"
      />
    </svg>`,i=this.checked&&!this.indeterminate?o:p,s=this.indeterminate?d`<span class="indeterminate-icon"></span>`:p;return d`
      <div class="wrapper">
        <input
          ?autofocus=${this.autofocus}
          id="input"
          class="checkbox"
          type="checkbox"
          ?checked=${this.checked}
          value=${this.value}
        >
        <div class=${e}>${s}${i}</div>
        <label for="input" class="label" @click=${this._handleClick}>
          <span class=${t}>
            ${this._renderLabelAttribute()}
            <slot @slotchange=${this._handleSlotChange}></slot>
          </span>
        </label>
      </div>
    `}};M.styles=Cs;M.formAssociated=!0;M.shadowRootOptions={...K.shadowRootOptions,delegatesFocus:!0};W([a({type:Boolean,reflect:!0})],M.prototype,"autofocus",void 0);W([a({type:Boolean,reflect:!0})],M.prototype,"checked",null);W([a({type:Boolean,reflect:!0,attribute:"default-checked"})],M.prototype,"defaultChecked",void 0);W([a({type:Boolean,reflect:!0})],M.prototype,"invalid",void 0);W([a({reflect:!0})],M.prototype,"name",void 0);W([a()],M.prototype,"value",void 0);W([a({type:Boolean,reflect:!0})],M.prototype,"disabled",void 0);W([a({type:Boolean,reflect:!0})],M.prototype,"indeterminate",void 0);W([a({type:Boolean,reflect:!0})],M.prototype,"required",null);W([a()],M.prototype,"type",void 0);W([H("#input")],M.prototype,"_inputEl",void 0);M=W([_("vscode-checkbox")],M);const ks=[g,b`
    :host {
      display: block;
    }

    .wrapper {
      display: flex;
      flex-wrap: wrap;
    }

    :host([variant='vertical']) .wrapper {
      display: block;
    }

    ::slotted(vscode-checkbox) {
      margin-right: 20px;
    }

    ::slotted(vscode-checkbox:last-child) {
      margin-right: 0;
    }

    :host([variant='vertical']) ::slotted(vscode-checkbox) {
      display: block;
      margin-bottom: 15px;
    }

    :host([variant='vertical']) ::slotted(vscode-checkbox:last-child) {
      margin-bottom: 0;
    }
  `];var Lt=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let Ge=class extends x{constructor(){super(...arguments),this.role="group",this.variant="horizontal"}render(){return d`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};Ge.styles=ks;Lt([a({reflect:!0})],Ge.prototype,"role",void 0);Lt([a({reflect:!0})],Ge.prototype,"variant",void 0);Ge=Lt([_("vscode-checkbox-group")],Ge);const Is=[g,b`
    .collapsible {
      background-color: var(--vscode-sideBar-background, #181818);
    }

    .collapsible-header {
      align-items: center;
      background-color: var(--vscode-sideBarSectionHeader-background, #181818);
      cursor: pointer;
      display: flex;
      height: 22px;
      line-height: 22px;
      user-select: none;
    }

    .collapsible-header:focus {
      opacity: 1;
      outline-offset: -1px;
      outline-style: solid;
      outline-width: 1px;
      outline-color: var(--vscode-focusBorder, #0078d4);
    }

    .title {
      color: var(--vscode-sideBarTitle-foreground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: 11px;
      font-weight: 700;
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      text-transform: uppercase;
      white-space: nowrap;
    }

    .title .description {
      font-weight: 400;
      margin-left: 10px;
      text-transform: none;
      opacity: 0.6;
    }

    .header-icon {
      color: var(--vscode-icon-foreground, #cccccc);
      display: block;
      flex-shrink: 0;
      margin: 0 3px;
    }

    .collapsible.open .header-icon {
      transform: rotate(90deg);
    }

    .header-slots {
      align-items: center;
      display: flex;
      height: 22px;
      margin-left: auto;
      margin-right: 4px;
    }

    .actions {
      display: none;
    }

    .collapsible.open .actions {
      display: block;
    }

    .header-slots slot {
      display: flex;
      max-height: 22px;
      overflow: hidden;
    }

    .header-slots slot::slotted(div) {
      align-items: center;
      display: flex;
    }

    .collapsible-body {
      display: none;
      overflow: hidden;
    }

    .collapsible.open .collapsible-body {
      display: block;
    }
  `];var pt=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let Se=class extends x{constructor(){super(...arguments),this.title="",this.description="",this.open=!1}_emitToggleEvent(){this.dispatchEvent(new CustomEvent("vsc-collapsible-toggle",{detail:{open:this.open}}))}_onHeaderClick(){this.open=!this.open,this._emitToggleEvent()}_onHeaderKeyDown(e){e.key==="Enter"&&(this.open=!this.open,this._emitToggleEvent())}render(){const e=$({collapsible:!0,open:this.open}),t=d`<svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      class="header-icon"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"
      />
    </svg>`,o=this.description?d`<span class="description">${this.description}</span>`:p;return d`
      <div class=${e}>
        <div
          class="collapsible-header"
          tabindex="0"
          title=${this.title}
          @click=${this._onHeaderClick}
          @keydown=${this._onHeaderKeyDown}
        >
          ${t}
          <h3 class="title">${this.title}${o}</h3>
          <div class="header-slots">
            <div class="actions"><slot name="actions"></slot></div>
            <div class="decorations"><slot name="decorations"></slot></div>
          </div>
        </div>
        <div class="collapsible-body" part="body">
          <slot></slot>
        </div>
      </div>
    `}};Se.styles=Is;pt([a({type:String})],Se.prototype,"title",void 0);pt([a()],Se.prototype,"description",void 0);pt([a({type:Boolean,reflect:!0})],Se.prototype,"open",void 0);Se=pt([_("vscode-collapsible")],Se);const Ss=[g,b`
    :host {
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.4em;
      outline: none;
      position: relative;
    }

    .context-menu-item {
      background-color: var(--vscode-menu-background, #1f1f1f);
      color: var(--vscode-menu-foreground, #cccccc);
      display: flex;
      user-select: none;
      white-space: nowrap;
    }

    .ruler {
      border-bottom: 1px solid var(--vscode-menu-separatorBackground, #454545);
      display: block;
      margin: 0 0 4px;
      padding-top: 4px;
      width: 100%;
    }

    .context-menu-item a {
      align-items: center;
      border-color: transparent;
      border-radius: 3px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-menu-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      flex: 1 1 auto;
      height: 2em;
      margin-left: 4px;
      margin-right: 4px;
      outline: none;
      position: relative;
      text-decoration: inherit;
    }

    :host([selected]) .context-menu-item a {
      background-color: var(--vscode-menu-selectionBackground, #0078d4);
      border-color: var(--vscode-menu-selectionBorder, transparent);
      color: var(--vscode-menu-selectionForeground, #ffffff);
    }

    .label {
      background: none;
      display: flex;
      flex: 1 1 auto;
      font-size: 12px;
      line-height: 1;
      padding: 0 22px;
      text-decoration: none;
    }

    .keybinding {
      display: block;
      flex: 2 1 auto;
      line-height: 1;
      padding: 0 22px;
      text-align: right;
    }
  `];var Re=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let le=class extends x{constructor(){super(...arguments),this.label="",this.keybinding="",this.value="",this.separator=!1,this.tabindex=0}onItemClick(){this.dispatchEvent(new CustomEvent("vsc-click",{detail:{label:this.label,keybinding:this.keybinding,value:this.value||this.label,separator:this.separator,tabindex:this.tabindex},bubbles:!0,composed:!0}))}render(){return d`
      ${this.separator?d`
            <div class="context-menu-item separator">
              <span class="ruler"></span>
            </div>
          `:d`
            <div class="context-menu-item">
              <a @click=${this.onItemClick}>
                ${this.label?d`<span class="label">${this.label}</span>`:p}
                ${this.keybinding?d`<span class="keybinding">${this.keybinding}</span>`:p}
              </a>
            </div>
          `}
    `}};le.styles=Ss;Re([a({type:String})],le.prototype,"label",void 0);Re([a({type:String})],le.prototype,"keybinding",void 0);Re([a({type:String})],le.prototype,"value",void 0);Re([a({type:Boolean,reflect:!0})],le.prototype,"separator",void 0);Re([a({type:Number})],le.prototype,"tabindex",void 0);le=Re([_("vscode-context-menu-item")],le);const Es=[g,b`
    :host {
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.4em;
      position: relative;
    }

    .context-menu {
      background-color: var(--vscode-menu-background, #1f1f1f);
      border-color: var(--vscode-menu-border, #454545);
      border-radius: 5px;
      border-style: solid;
      border-width: 1px;
      box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
      color: var(--vscode-menu-foreground, #cccccc);
      padding: 4px 0;
      white-space: nowrap;
    }

    .context-menu:focus {
      outline: 0;
    }
  `];var he=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let te=class extends x{set data(e){this._data=e;const t=[];e.forEach((o,i)=>{o.separator||t.push(i)}),this._clickableItemIndexes=t}get data(){return this._data}set show(e){this._show=e,this._selectedClickableItemIndex=-1,e&&this.updateComplete.then(()=>{this._wrapperEl&&this._wrapperEl.focus(),requestAnimationFrame(()=>{document.addEventListener("click",this._onClickOutsideBound,{once:!0})})})}get show(){return this._show}constructor(){super(),this.preventClose=!1,this.tabIndex=0,this._selectedClickableItemIndex=-1,this._show=!1,this._data=[],this._clickableItemIndexes=[],this._onClickOutsideBound=this._onClickOutside.bind(this),this.addEventListener("keydown",this._onKeyDown)}_onClickOutside(e){e.composedPath().includes(this)||(this.show=!1)}_onKeyDown(e){const{key:t}=e;switch((t==="ArrowUp"||t==="ArrowDown"||t==="Escape"||t==="Enter")&&e.preventDefault(),t){case"ArrowUp":this._handleArrowUp();break;case"ArrowDown":this._handleArrowDown();break;case"Escape":this._handleEscape();break;case"Enter":this._handleEnter();break}}_handleArrowUp(){this._selectedClickableItemIndex===0?this._selectedClickableItemIndex=this._clickableItemIndexes.length-1:this._selectedClickableItemIndex-=1}_handleArrowDown(){this._selectedClickableItemIndex+1<this._clickableItemIndexes.length?this._selectedClickableItemIndex+=1:this._selectedClickableItemIndex=0}_handleEscape(){this.show=!1,document.removeEventListener("click",this._onClickOutsideBound)}_dispatchSelectEvent(e){const{keybinding:t,label:o,value:i,separator:s,tabindex:r}=e;this.dispatchEvent(new CustomEvent("vsc-context-menu-select",{detail:{keybinding:t,label:o,separator:s,tabindex:r,value:i}}))}_dispatchLegacySelectEvent(e){const{keybinding:t,label:o,value:i,separator:s,tabindex:r}=e,l={keybinding:t,label:o,value:i,separator:s,tabindex:r};this.dispatchEvent(new CustomEvent("vsc-select",{detail:l,bubbles:!0,composed:!0}))}_handleEnter(){if(this._selectedClickableItemIndex===-1)return;const e=this._clickableItemIndexes[this._selectedClickableItemIndex],o=this._wrapperEl.querySelectorAll("vscode-context-menu-item")[e];this._dispatchLegacySelectEvent(o),this._dispatchSelectEvent(o),this.preventClose||(this.show=!1,document.removeEventListener("click",this._onClickOutsideBound))}_onItemClick(e){const t=e.currentTarget;this._dispatchLegacySelectEvent(t),this._dispatchSelectEvent(t),this.preventClose||(this.show=!1)}_onItemMouseOver(e){const t=e.target,o=t.dataset.index?+t.dataset.index:-1,i=this._clickableItemIndexes.findIndex(s=>s===o);i!==-1&&(this._selectedClickableItemIndex=i)}_onItemMouseOut(){this._selectedClickableItemIndex=-1}render(){if(!this._show)return d`${p}`;const e=this._clickableItemIndexes[this._selectedClickableItemIndex];return d`
      <div class="context-menu" tabindex="0">
        ${this.data?this.data.map(({label:t="",keybinding:o="",value:i="",separator:s=!1,tabindex:r=0},l)=>d`
                <vscode-context-menu-item
                  label=${t}
                  keybinding=${o}
                  value=${i}
                  ?separator=${s}
                  ?selected=${l===e}
                  tabindex=${r}
                  @vsc-click=${this._onItemClick}
                  @mouseover=${this._onItemMouseOver}
                  @mouseout=${this._onItemMouseOut}
                  data-index=${l}
                ></vscode-context-menu-item>
              `):d`<slot></slot>`}
      </div>
    `}};te.styles=Es;he([a({type:Array,attribute:!1})],te.prototype,"data",null);he([a({type:Boolean,reflect:!0,attribute:"prevent-close"})],te.prototype,"preventClose",void 0);he([a({type:Boolean,reflect:!0})],te.prototype,"show",null);he([a({type:Number,reflect:!0})],te.prototype,"tabIndex",void 0);he([v()],te.prototype,"_selectedClickableItemIndex",void 0);he([v()],te.prototype,"_show",void 0);he([H(".context-menu")],te.prototype,"_wrapperEl",void 0);te=he([_("vscode-context-menu")],te);const Os=[g,b`
    :host {
      background-color: var(--vscode-foreground, #cccccc);
      display: block;
      height: 1px;
      margin-bottom: 10px;
      margin-top: 10px;
      opacity: 0.4;
    }
  `];var mo=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let it=class extends x{constructor(){super(...arguments),this.role="separator"}render(){return d``}};it.styles=Os;mo([a({reflect:!0})],it.prototype,"role",void 0);it=mo([_("vscode-divider")],it);const Ps=[g,b`
    :host {
      display: block;
      max-width: 727px;
    }
  `];var Be=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s},ve;(function(n){n.HORIZONTAL="horizontal",n.VERTICAL="vertical"})(ve||(ve={}));const As=n=>["vscode-textfield","vscode-textarea"].includes(n.tagName.toLocaleLowerCase()),Rs=n=>n.tagName.toLocaleLowerCase()==="vscode-single-select",Bs=n=>n.tagName.toLocaleLowerCase()==="vscode-multi-select",Xt=n=>n.tagName.toLocaleLowerCase()==="vscode-checkbox",Zt=n=>n.tagName.toLocaleLowerCase()==="vscode-radio";let ae=class extends x{constructor(){super(...arguments),this.breakpoint=490,this._responsive=!1,this._firstUpdateComplete=!1,this._resizeObserverCallbackBound=this._resizeObserverCallback.bind(this)}set responsive(e){this._responsive=e,this._firstUpdateComplete&&(e?this._activateResponsiveLayout():this._deactivateResizeObserver())}get responsive(){return this._responsive}get data(){return this._collectFormData()}_collectFormData(){const e=["vscode-textfield","vscode-textarea","vscode-single-select","vscode-multi-select","vscode-checkbox","vscode-radio"].join(","),t=this.querySelectorAll(e),o={};return t.forEach(i=>{if(!i.hasAttribute("name"))return;const s=i.getAttribute("name");s&&(Xt(i)&&i.checked?o[s]=Array.isArray(o[s])?[...o[s],i.value]:[i.value]:Bs(i)?o[s]=i.value:Xt(i)&&!i.checked?o[s]=Array.isArray(o[s])?o[s]:[]:Zt(i)&&i.checked||As(i)||Rs(i)?o[s]=i.value:Zt(i)&&!i.checked&&(o[s]=o[s]?o[s]:""))}),o}_toggleCompactLayout(e){this._assignedFormGroups.forEach(t=>{t.dataset.originalVariant||(t.dataset.originalVariant=t.variant);const o=t.dataset.originalVariant;e===ve.VERTICAL&&o==="horizontal"?t.variant="vertical":t.variant=o,t.querySelectorAll("vscode-checkbox-group, vscode-radio-group").forEach(s=>{s.dataset.originalVariant||(s.dataset.originalVariant=s.variant);const r=s.dataset.originalVariant;e===ve.HORIZONTAL&&r===ve.HORIZONTAL?s.variant="horizontal":s.variant="vertical"})})}_resizeObserverCallback(e){let t=0;for(const i of e)t=i.contentRect.width;const o=t<this.breakpoint?ve.VERTICAL:ve.HORIZONTAL;o!==this._currentFormGroupLayout&&(this._toggleCompactLayout(o),this._currentFormGroupLayout=o)}_activateResponsiveLayout(){this._resizeObserver=new ResizeObserver(this._resizeObserverCallbackBound),this._resizeObserver.observe(this._wrapperElement)}_deactivateResizeObserver(){var e;(e=this._resizeObserver)==null||e.disconnect(),this._resizeObserver=null}firstUpdated(){this._firstUpdateComplete=!0,this._responsive&&this._activateResponsiveLayout()}render(){return d`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};ae.styles=Ps;Be([a({type:Boolean,reflect:!0})],ae.prototype,"responsive",null);Be([a({type:Number})],ae.prototype,"breakpoint",void 0);Be([a({type:Object})],ae.prototype,"data",null);Be([H(".wrapper")],ae.prototype,"_wrapperElement",void 0);Be([J({selector:"vscode-form-group"})],ae.prototype,"_assignedFormGroups",void 0);ae=Be([_("vscode-form-container")],ae);const Vs=[g,b`
    :host {
      --label-right-margin: 14px;
      --label-width: 150px;

      display: block;
      margin: 15px 0;
    }

    :host([variant='settings-group']) {
      margin: 0;
      padding: 12px 14px 18px;
      max-width: 727px;
    }

    .wrapper {
      display: flex;
      flex-wrap: wrap;
    }

    :host([variant='vertical']) .wrapper,
    :host([variant='settings-group']) .wrapper {
      display: block;
    }

    :host([variant='horizontal']) ::slotted(vscode-checkbox-group),
    :host([variant='horizontal']) ::slotted(vscode-radio-group) {
      width: calc(100% - calc(var(--label-width) + var(--label-right-margin)));
    }

    :host([variant='horizontal']) ::slotted(vscode-label) {
      margin-right: var(--label-right-margin);
      text-align: right;
      width: var(--label-width);
    }

    :host([variant='settings-group']) ::slotted(vscode-label) {
      height: 18px;
      line-height: 18px;
      margin-bottom: 4px;
      margin-right: 0;
      padding: 0;
    }

    ::slotted(vscode-form-helper) {
      margin-left: calc(var(--label-width) + var(--label-right-margin));
    }

    :host([variant='vertical']) ::slotted(vscode-form-helper),
    :host([variant='settings-group']) ::slotted(vscode-form-helper) {
      display: block;
      margin-left: 0;
    }

    :host([variant='settings-group']) ::slotted(vscode-form-helper) {
      margin-bottom: 0;
      margin-top: 0;
    }

    :host([variant='vertical']) ::slotted(vscode-label),
    :host([variant='settings-group']) ::slotted(vscode-label) {
      display: block;
      margin-left: 0;
      text-align: left;
    }

    :host([variant='settings-group']) ::slotted(vscode-inputbox),
    :host([variant='settings-group']) ::slotted(vscode-textfield),
    :host([variant='settings-group']) ::slotted(vscode-textarea),
    :host([variant='settings-group']) ::slotted(vscode-single-select),
    :host([variant='settings-group']) ::slotted(vscode-multi-select) {
      margin-top: 9px;
    }

    ::slotted(vscode-button:first-child) {
      margin-left: calc(var(--label-width) + var(--label-right-margin));
    }

    :host([variant='vertical']) ::slotted(vscode-button) {
      margin-left: 0;
    }

    ::slotted(vscode-button) {
      margin-right: 4px;
    }
  `];var yo=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let nt=class extends x{constructor(){super(...arguments),this.variant="horizontal"}render(){return d`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};nt.styles=Vs;yo([a({reflect:!0})],nt.prototype,"variant",void 0);nt=yo([_("vscode-form-group")],nt);const zs=[g,b`
    :host {
      display: block;
      line-height: 1.4em;
      margin-bottom: 4px;
      margin-top: 4px;
      max-width: 720px;
      opacity: 0.9;
    }

    :host([vertical]) {
      margin-left: 0;
    }
  `];var Ts=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};const Ct=new CSSStyleSheet;Ct.replaceSync(`
  vscode-form-helper * {
    margin: 0;
  }

  vscode-form-helper *:not(:last-child) {
    margin-bottom: 8px;
  }
`);let kt=class extends x{constructor(){super(),this._injectLightDOMStyles()}_injectLightDOMStyles(){document.adoptedStyleSheets.find(t=>t===Ct)||document.adoptedStyleSheets.push(Ct)}render(){return d`<slot></slot>`}};kt.styles=zs;kt=Ts([_("vscode-form-helper")],kt);let Jt=0;const xo=(n="")=>(Jt++,`${n}${Jt}`),Ls=[g,b`
    :host {
      color: var(--vscode-foreground, #cccccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: 600;
      line-height: ${ps};
      cursor: default;
      display: block;
      padding: 5px 0;
    }

    .wrapper {
      display: block;
    }

    .wrapper.required:after {
      content: ' *';
    }

    ::slotted(.normal) {
      font-weight: normal;
    }

    ::slotted(.lightened) {
      color: var(--vscode-foreground, #cccccc);
      opacity: 0.9;
    }
  `];var ft=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let Ee=class extends x{constructor(){super(...arguments),this.required=!1,this._id="",this._htmlFor="",this._connected=!1}set htmlFor(e){this._htmlFor=e,this.setAttribute("for",e),this._connected&&this._connectWithTarget()}get htmlFor(){return this._htmlFor}set id(e){this._id=e}get id(){return this._id}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o)}connectedCallback(){super.connectedCallback(),this._connected=!0,this._id===""&&(this._id=xo("vscode-label-"),this.setAttribute("id",this._id)),this._connectWithTarget()}_getTarget(){let e=null;if(this._htmlFor){const t=this.getRootNode({composed:!1});t&&(e=t.querySelector(`#${this._htmlFor}`))}return e}async _connectWithTarget(){await this.updateComplete;const e=this._getTarget();["vscode-radio-group","vscode-checkbox-group"].includes((e==null?void 0:e.tagName.toLowerCase())??"")&&e.setAttribute("aria-labelledby",this._id);let t="";this.textContent&&(t=this.textContent.trim()),e&&"label"in e&&["vscode-textfield","vscode-textarea","vscode-single-select","vscode-multi-select"].includes((e==null?void 0:e.tagName.toLowerCase())??"")&&(e.label=t)}_handleClick(){const e=this._getTarget();e&&"focus"in e&&e.focus()}render(){return d`
      <label
        class=${$({wrapper:!0,required:this.required})}
        @click=${this._handleClick}
        ><slot></slot
      ></label>
    `}};Ee.styles=Ls;ft([a({reflect:!0,attribute:"for"})],Ee.prototype,"htmlFor",null);ft([a()],Ee.prototype,"id",null);ft([a({type:Boolean,reflect:!0})],Ee.prototype,"required",void 0);Ee=ft([_("vscode-label")],Ee);const rt=d`
  <span class="icon">
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M7.976 10.072l4.357-4.357.62.618L8.284 11h-.618L3 6.333l.619-.618 4.357 4.357z"
      />
    </svg>
  </span>
`,Ds=Zo`<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
  fill="currentColor"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M14.431 3.323l-8.47 10-.79-.036-3.35-4.77.818-.574 2.978 4.24 8.051-9.506.764.646z"
  />
</svg>`;/**
 * @license
 * Copyright 2020 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const{I:Fs}=is,Qt=()=>document.createComment(""),Fe=(n,e,t)=>{var s;const o=n._$AA.parentNode,i=e===void 0?n._$AB:e._$AA;if(t===void 0){const r=o.insertBefore(Qt(),i),l=o.insertBefore(Qt(),i);t=new Fs(r,l,n,n.options)}else{const r=t._$AB.nextSibling,l=t._$AM,c=l!==n;if(c){let h;(s=t._$AQ)==null||s.call(t,n),t._$AM=n,t._$AP!==void 0&&(h=n._$AU)!==l._$AU&&t._$AP(h)}if(r!==i||c){let h=t._$AA;for(;h!==r;){const f=h.nextSibling;o.insertBefore(h,i),h=f}}}return t},fe=(n,e,t=n)=>(n._$AI(e,t),n),Ms={},Hs=(n,e=Ms)=>n._$AH=e,js=n=>n._$AH,xt=n=>{n._$AR(),n._$AA.remove()};/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */const eo=(n,e,t)=>{const o=new Map;for(let i=e;i<=t;i++)o.set(n[i],i);return o},qs=Vt(class extends zt{constructor(n){if(super(n),n.type!==Bt.CHILD)throw Error("repeat() can only be used in text expressions")}dt(n,e,t){let o;t===void 0?t=e:e!==void 0&&(o=e);const i=[],s=[];let r=0;for(const l of n)i[r]=o?o(l,r):r,s[r]=t(l,r),r++;return{values:s,keys:i}}render(n,e,t){return this.dt(n,e,t).values}update(n,[e,t,o]){const i=js(n),{values:s,keys:r}=this.dt(e,t,o);if(!Array.isArray(i))return this.ut=r,s;const l=this.ut??(this.ut=[]),c=[];let h,f,u=0,m=i.length-1,w=0,B=s.length-1;for(;u<=m&&w<=B;)if(i[u]===null)u++;else if(i[m]===null)m--;else if(l[u]===r[w])c[w]=fe(i[u],s[w]),u++,w++;else if(l[m]===r[B])c[B]=fe(i[m],s[B]),m--,B--;else if(l[u]===r[B])c[B]=fe(i[u],s[B]),Fe(n,c[B+1],i[u]),u++,B--;else if(l[m]===r[w])c[w]=fe(i[m],s[w]),Fe(n,i[u],i[m]),m--,w++;else if(h===void 0&&(h=eo(r,w,B),f=eo(l,u,m)),h.has(l[u]))if(h.has(l[m])){const U=f.get(r[w]),Ce=U!==void 0?i[U]:null;if(Ce===null){const ue=Fe(n,i[u]);fe(ue,s[w]),c[w]=ue}else c[w]=fe(Ce,s[w]),Fe(n,i[u],Ce),i[U]=null;w++}else xt(i[m]),m--;else xt(i[u]),u++;for(;w<=B;){const U=Fe(n,c[B+1]);fe(U,s[w]),c[w++]=U}for(;u<=m;){const U=i[u++];U!==null&&xt(U)}return this.ut=r,Hs(n,c),ee}});/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function Us(n,e,t){return n?e(n):t==null?void 0:t(n)}var Ye=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let me=class extends x{constructor(){super(...arguments),this.description="",this.selected=!1,this.disabled=!1,this._initialized=!1,this._handleSlotChange=()=>{this._initialized&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._initialized=!0})}willUpdate(e){this._initialized&&(e.has("description")||e.has("value")||e.has("selected")||e.has("disabled"))&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}render(){return d`<slot @slotchange=${this._handleSlotChange}></slot>`}};me.styles=g;Ye([a({type:String})],me.prototype,"value",void 0);Ye([a({type:String})],me.prototype,"description",void 0);Ye([a({type:Boolean,reflect:!0})],me.prototype,"selected",void 0);Ye([a({type:Boolean,reflect:!0})],me.prototype,"disabled",void 0);me=Ye([_("vscode-option")],me);const wo=(n,e)=>{const t={match:!1,ranges:[]},o=n.toLowerCase(),i=e.toLowerCase(),s=o.split(" ");let r=0;return s.forEach((l,c)=>{if(c>0&&(r+=s[c-1].length+1),t.match)return;const h=l.indexOf(i),f=i.length;h===0&&(t.match=!0,t.ranges.push([r+h,Math.min(r+h+f,n.length)]))}),t},$o=(n,e)=>{const t={match:!1,ranges:[]};return n.toLowerCase().indexOf(e.toLowerCase())===0&&(t.match=!0,t.ranges=[[0,e.length]]),t},Co=(n,e)=>{const t={match:!1,ranges:[]},o=n.toLowerCase().indexOf(e.toLowerCase());return o>-1&&(t.match=!0,t.ranges=[[o,o+e.length]]),t},ko=(n,e)=>{const t={match:!1,ranges:[]};let o=0,i=0;const s=e.length-1,r=n.toLowerCase(),l=e.toLowerCase();for(let c=0;c<=s;c++){if(i=r.indexOf(l[c],o),i===-1)return{match:!1,ranges:[]};t.match=!0,t.ranges.push([i,i+1]),o=i+1}return t},Ns=(n,e,t)=>{const o=[];return n.forEach(i=>{let s;switch(t){case"startsWithPerTerm":s=wo(i.label,e);break;case"startsWith":s=$o(i.label,e);break;case"contains":s=Co(i.label,e);break;default:s=ko(i.label,e)}s.match&&o.push({...i,ranges:s.ranges})}),o},Xe=n=>{const e=[];return n===" "?(e.push(d`&nbsp;`),e):(n.indexOf(" ")===0&&e.push(d`&nbsp;`),e.push(d`${n.trimStart().trimEnd()}`),n.lastIndexOf(" ")===n.length-1&&e.push(d`&nbsp;`),e)},Ws=(n,e)=>{const t=[],o=e.length;return o<1?d`${n}`:(e.forEach((i,s)=>{const r=n.substring(i[0],i[1]);s===0&&i[0]!==0&&t.push(...Xe(n.substring(0,e[0][0]))),s>0&&s<o&&i[0]-e[s-1][1]!==0&&t.push(...Xe(n.substring(e[s-1][1],i[0]))),t.push(d`<b>${Xe(r)}</b>`),s===o-1&&i[1]<n.length&&t.push(...Xe(n.substring(i[1],n.length)))}),t)};class Ks{constructor(e){this._activeIndex=-1,this._options=[],this._filterPattern="",this._filterMethod="fuzzy",this._combobox=!1,this._indexByValue=new Map,this._indexByLabel=new Map,this._selectedIndex=-1,this._selectedIndexes=new Set,this._multiSelect=!1,this._numOfVisibleOptions=0,(this._host=e).addController(this)}hostConnected(){}get activeIndex(){return this._activeIndex}set activeIndex(e){this._activeIndex=e,this._host.requestUpdate()}get relativeActiveIndex(){var e;return((e=this._options[this._activeIndex])==null?void 0:e.filteredIndex)??-1}set comboboxMode(e){this._combobox=e,this._host.requestUpdate()}get comboboxMode(){return this._combobox}get multiSelect(){return this._multiSelect}set multiSelect(e){this._selectedIndex=-1,this._selectedIndexes.clear(),this._multiSelect=e,this._host.requestUpdate()}get selectedIndex(){return this._selectedIndex}set selectedIndex(e){var o;this._selectedIndex!==-1&&((o=this._options[this._selectedIndex]).selected??(o.selected=!1));const t=this.getOptionByIndex(e);this._selectedIndex=t?e:-1,this._host.requestUpdate()}get selectedIndexes(){return Array.from(this._selectedIndexes)}set selectedIndexes(e){this._selectedIndexes.forEach(t=>{this._options[t].selected=!1}),this._selectedIndexes=new Set(e),e.forEach(t=>{this._options[t]!==void 0&&(this._options[t].selected=!0)}),this._host.requestUpdate()}set value(e){if(this._multiSelect){const t=e.map(o=>this._indexByValue.get(o)).filter(o=>o!==void 0);this._selectedIndexes=new Set(t)}else this._selectedIndex=this._indexByValue.get(e)??-1;this._host.requestUpdate()}get value(){return this._multiSelect?this._selectedIndexes.size>0?Array.from(this._selectedIndexes).map(e=>this._options[e].value):[]:this._selectedIndex>-1?this._options[this._selectedIndex].value:""}set multiSelectValue(e){const t=e.map(o=>this._indexByValue.get(o)).filter(o=>o!==void 0);this._selectedIndexes=new Set(t)}get multiSelectValue(){return this._selectedIndexes.size>0?Array.from(this._selectedIndexes).map(e=>this._options[e].value):[]}get filterPattern(){return this._filterPattern}set filterPattern(e){e!==this._filterPattern&&(this._filterPattern=e,this._updateState())}get filterMethod(){return this._filterMethod}set filterMethod(e){e!==this._filterMethod&&(this._filterMethod=e,this._updateState())}get options(){return this._options}get numOfVisibleOptions(){return this._numOfVisibleOptions}get numOptions(){return this._options.length}populate(e){this._indexByValue.clear(),this._indexByLabel.clear(),this._options=e.map((t,o)=>(this._indexByValue.set(t.value??"",o),this._indexByLabel.set(t.label??"",o),{description:t.description??"",disabled:t.disabled??!1,label:t.label??"",selected:t.selected??!1,value:t.value??"",index:o,filteredIndex:o,ranges:[],visible:!0})),this._numOfVisibleOptions=this._options.length}add(e){const t=this._options.length,{description:o,disabled:i,label:s,selected:r,value:l}=e;let c=!0,h=[];if(this._combobox&&this._filterPattern!==""){const f=this._searchByPattern(s??"");c=f.match,h=f.ranges}this._indexByValue.set(l??"",t),this._indexByLabel.set(s??"",t),r&&(this._selectedIndex=t,this._selectedIndexes.add(t),this._activeIndex=t),this._options.push({index:t,filteredIndex:t,description:o??"",disabled:i??!1,label:s??"",selected:r??!1,value:l??"",visible:c,ranges:h}),c&&(this._numOfVisibleOptions+=1)}clear(){this._options=[],this._indexByValue.clear(),this._indexByLabel.clear(),this._numOfVisibleOptions=0}getIsIndexSelected(e){return this._multiSelect?this._selectedIndexes.has(e):this._selectedIndex===e}expandMultiSelection(e){e.forEach(t=>{const o=this._indexByValue.get(t)??-1;o!==-1&&this._selectedIndexes.add(o)}),this._host.requestUpdate()}toggleActiveMultiselectOption(){const e=this._options[this._activeIndex]??null;if(!e)return;this._selectedIndexes.has(e.index)?this._selectedIndexes.delete(e.index):this._selectedIndexes.add(e.index),this._host.requestUpdate()}toggleOptionSelected(e){const t=this._selectedIndexes.has(e);this._options[e].selected=!this._options[e].selected,t?this._selectedIndexes.delete(e):this._selectedIndexes.add(e),this._host.requestUpdate()}getActiveOption(){return this._options[this._activeIndex]??null}getSelectedOption(){return this._options[this._selectedIndex]??null}getOptionByIndex(e){return this._options[e]??null}findOptionIndex(e){return this._indexByValue.get(e)??-1}getOptionByValue(e,t=!1){const o=this._indexByValue.get(e)??-1;return o===-1?null:t?this._options[o]:this._options[o].visible?this._options[o]:null}getOptionByLabel(e){const t=this._indexByLabel.get(e)??-1;return t===-1?null:this._options[t]}next(e){const t=e??this._activeIndex;let o=-1;for(let i=t+1;i<this._options.length;i++)if(this._options[i]&&!this._options[i].disabled&&this._options[i].visible){o=i;break}return o>-1?this._options[o]:null}prev(e){const t=e??this._activeIndex;let o=-1;for(let i=t-1;i>=0;i--)if(this._options[i]&&!this._options[i].disabled&&this._options[i].visible){o=i;break}return o>-1?this._options[o]:null}activateDefault(){if(this._multiSelect){if(this._selectedIndexes.size>0){const t=this._selectedIndexes.values().next();this._activeIndex=t.value?t.value:0}}else this._selectedIndex>-1?this._activeIndex=this._selectedIndex:this._activeIndex=0;this._host.requestUpdate()}selectAll(){this._multiSelect&&(this._options.forEach((e,t)=>{this._options[t].selected=!0,this._selectedIndexes.add(t)}),this._host.requestUpdate())}selectNone(){this._multiSelect&&(this._options.forEach((e,t)=>{this._options[t].selected=!1}),this._selectedIndexes.clear(),this._host.requestUpdate())}_searchByPattern(e){let t;switch(this._filterMethod){case"startsWithPerTerm":t=wo(e,this._filterPattern);break;case"startsWith":t=$o(e,this._filterPattern);break;case"contains":t=Co(e,this._filterPattern);break;default:t=ko(e,this._filterPattern)}return t}_updateState(){if(!this._combobox||this._filterPattern==="")this._options.forEach((e,t)=>{this._options[t].visible=!0,this._options[t].ranges=[]}),this._numOfVisibleOptions=this._options.length;else{let e=-1;this._numOfVisibleOptions=0,this._options.forEach(({label:t},o)=>{const i=this._searchByPattern(t);this._options[o].visible=i.match,this._options[o].ranges=i.ranges,this._options[o].filteredIndex=i.match?++e:-1,i.match&&(this._numOfVisibleOptions+=1)})}this._host.requestUpdate()}}const Gs=[g,b`
    :host {
      display: block;
      position: relative;
    }

    .scrollable-container {
      height: 100%;
      overflow: auto;
    }

    .scrollable-container::-webkit-scrollbar {
      cursor: default;
      width: 0;
    }

    .scrollable-container {
      scrollbar-width: none;
    }

    .shadow {
      box-shadow: var(--vscode-scrollbar-shadow, #000000) 0 6px 6px -6px inset;
      display: none;
      height: 3px;
      left: 0;
      pointer-events: none;
      position: absolute;
      top: 0;
      z-index: 1;
      width: 100%;
    }

    .shadow.visible {
      display: block;
    }

    .scrollbar-track {
      height: 100%;
      position: absolute;
      right: 0;
      top: 0;
      width: 10px;
      z-index: 100;
    }

    .scrollbar-track.hidden {
      display: none;
    }

    .scrollbar-thumb {
      background-color: transparent;
      min-height: var(--min-thumb-height, 20px);
      opacity: 0;
      position: absolute;
      right: 0;
      width: 10px;
    }

    .scrollbar-thumb.visible {
      background-color: var(
        --vscode-scrollbarSlider-background,
        rgba(121, 121, 121, 0.4)
      );
      opacity: 1;
      transition: opacity 100ms;
    }

    .scrollbar-thumb.fade {
      background-color: var(
        --vscode-scrollbarSlider-background,
        rgba(121, 121, 121, 0.4)
      );
      opacity: 0;
      transition: opacity 800ms;
    }

    .scrollbar-thumb.visible:hover {
      background-color: var(
        --vscode-scrollbarSlider-hoverBackground,
        rgba(100, 100, 100, 0.7)
      );
    }

    .scrollbar-thumb.visible.active,
    .scrollbar-thumb.visible.active:hover {
      background-color: var(
        --vscode-scrollbarSlider-activeBackground,
        rgba(191, 191, 191, 0.4)
      );
    }

    .prevent-interaction {
      bottom: 0;
      left: 0;
      right: 0;
      top: 0;
      position: absolute;
      z-index: 99;
    }

    .content {
      overflow: hidden;
    }
  `];var z=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let A=class extends x{set scrollPos(e){this._scrollPos=e,this._updateScrollbar(),this._updateThumbPosition(),this.requestUpdate()}get scrollPos(){return this._scrollPos}get scrollMax(){return this._scrollableContainer?this._scrollableContainer.scrollHeight:0}constructor(){super(),this.alwaysVisible=!1,this.fastScrollSensitivity=5,this.minThumbSize=20,this.mouseWheelScrollSensitivity=1,this.shadow=!0,this.scrolled=!1,this._scrollPos=0,this._isDragging=!1,this._thumbHeight=0,this._thumbY=0,this._thumbVisible=!1,this._thumbFade=!1,this._thumbActive=!1,this._scrollThumbStartY=0,this._mouseStartY=0,this._scrollbarVisible=!0,this._scrollbarTrackZ=0,this._resizeObserverCallback=()=>{this._updateScrollbar(),this._updateThumbPosition()},this._handleSlotChange=()=>{this._updateScrollbar(),this._updateThumbPosition(),this._zIndexFix()},this._handleScrollThumbMouseMove=e=>{const t=this._scrollThumbStartY+(e.screenY-this._mouseStartY);this._thumbY=this._limitThumbPos(t),this.scrollPos=this._calculateScrollPosFromThumbPos(this._thumbY),this.dispatchEvent(new CustomEvent("vsc-scrollable-scroll",{detail:this.scrollPos}))},this._handleScrollThumbMouseUp=e=>{this._isDragging=!1,this._thumbActive=!1;const t=this.getBoundingClientRect(),{x:o,y:i,width:s,height:r}=t,{pageX:l,pageY:c}=e;(l>o+s||l<o||c>i+r||c<i)&&(this._thumbFade=!0,this._thumbVisible=!1),document.removeEventListener("mousemove",this._handleScrollThumbMouseMove),document.removeEventListener("mouseup",this._handleScrollThumbMouseUp)},this._handleComponentMouseOver=()=>{this._thumbVisible=!0,this._thumbFade=!1},this._handleComponentMouseOut=()=>{this._thumbActive||(this._thumbVisible=!1,this._thumbFade=!0)},this._handleComponentWheel=e=>{e.preventDefault();const t=e.altKey?this.mouseWheelScrollSensitivity*this.fastScrollSensitivity:this.mouseWheelScrollSensitivity;this.scrollPos=this._limitScrollPos(this.scrollPos+e.deltaY*t),this.dispatchEvent(new CustomEvent("vsc-scrollable-scroll",{detail:this.scrollPos}))},this._handleScrollableContainerScroll=e=>{e.currentTarget&&(this.scrollPos=e.currentTarget.scrollTop)},this.addEventListener("mouseover",this._handleComponentMouseOver),this.addEventListener("mouseout",this._handleComponentMouseOut),this.addEventListener("wheel",this._handleComponentWheel)}connectedCallback(){super.connectedCallback(),this._hostResizeObserver=new ResizeObserver(this._resizeObserverCallback),this._contentResizeObserver=new ResizeObserver(this._resizeObserverCallback),this.requestUpdate(),this.updateComplete.then(()=>{this._hostResizeObserver.observe(this),this._contentResizeObserver.observe(this._contentElement),this._updateThumbPosition()})}disconnectedCallback(){super.disconnectedCallback(),this._hostResizeObserver.unobserve(this),this._hostResizeObserver.disconnect(),this._contentResizeObserver.unobserve(this._contentElement),this._contentResizeObserver.disconnect()}firstUpdated(e){this._updateThumbPosition()}_calcThumbHeight(){var i;const e=this.offsetHeight,t=((i=this._contentElement)==null?void 0:i.offsetHeight)??0,o=e*(e/t);return Math.max(this.minThumbSize,o)}_updateScrollbar(){var o;const e=((o=this._contentElement)==null?void 0:o.offsetHeight)??0;this.offsetHeight>=e?this._scrollbarVisible=!1:(this._scrollbarVisible=!0,this._thumbHeight=this._calcThumbHeight()),this.requestUpdate()}_zIndexFix(){let e=0;this._assignedElements.forEach(t=>{if("style"in t){const o=window.getComputedStyle(t).zIndex;/([0-9-])+/g.test(o)&&(e=Number(o)>e?Number(o):e)}}),this._scrollbarTrackZ=e+1,this.requestUpdate()}_updateThumbPosition(){if(!this._scrollableContainer)return;const e=this._scrollPos;this.scrolled=e>0;const t=this.offsetHeight,o=this._thumbHeight,s=this._contentElement.offsetHeight-t,r=e/s,l=t-o;this._thumbY=Math.min(r*(t-o),l)}_calculateScrollPosFromThumbPos(e){const t=this.getBoundingClientRect().height,o=this._scrollThumbElement.getBoundingClientRect().height,i=this._contentElement.getBoundingClientRect().height,s=e/(t-o)*(i-t);return this._limitScrollPos(s)}_limitScrollPos(e){return e<0?0:e>this.scrollMax?this.scrollMax:e}_limitThumbPos(e){const t=this.getBoundingClientRect().height,o=this._scrollThumbElement.getBoundingClientRect().height;return e<0?0:e>t-o?t-o:e}_handleScrollThumbMouseDown(e){const t=this.getBoundingClientRect(),o=this._scrollThumbElement.getBoundingClientRect();this._mouseStartY=e.screenY,this._scrollThumbStartY=o.top-t.top,this._isDragging=!0,this._thumbActive=!0,document.addEventListener("mousemove",this._handleScrollThumbMouseMove),document.addEventListener("mouseup",this._handleScrollThumbMouseUp)}_handleScrollbarTrackPress(e){e.target===e.currentTarget&&(this._thumbY=e.offsetY-this._thumbHeight/2,this.scrollPos=this._calculateScrollPosFromThumbPos(this._thumbY))}render(){return d`
      <div
        class="scrollable-container"
        .style=${F({userSelect:this._isDragging?"none":"auto"})}
        .scrollTop=${this._scrollPos}
        @scroll=${this._handleScrollableContainerScroll}
      >
        <div
          class=${$({shadow:!0,visible:this.scrolled})}
          .style=${F({zIndex:String(this._scrollbarTrackZ)})}
        ></div>
        ${this._isDragging?d`<div class="prevent-interaction"></div>`:p}
        <div
          class=${$({"scrollbar-track":!0,hidden:!this._scrollbarVisible})}
          @mousedown=${this._handleScrollbarTrackPress}
        >
          <div
            class=${$({"scrollbar-thumb":!0,visible:this.alwaysVisible?!0:this._thumbVisible,fade:this.alwaysVisible?!1:this._thumbFade,active:this._thumbActive})}
            .style=${F({height:`${this._thumbHeight}px`,top:`${this._thumbY}px`})}
            @mousedown=${this._handleScrollThumbMouseDown}
          ></div>
        </div>
        <div class="content">
          <slot @slotchange=${this._handleSlotChange}></slot>
        </div>
      </div>
    `}};A.styles=Gs;z([a({type:Boolean,reflect:!0,attribute:"always-visible"})],A.prototype,"alwaysVisible",void 0);z([a({type:Number,attribute:"fast-scroll-sensitivity"})],A.prototype,"fastScrollSensitivity",void 0);z([a({type:Number,attribute:"min-thumb-size"})],A.prototype,"minThumbSize",void 0);z([a({type:Number,attribute:"mouse-wheel-scroll-sensitivity"})],A.prototype,"mouseWheelScrollSensitivity",void 0);z([a({type:Boolean,reflect:!0})],A.prototype,"shadow",void 0);z([a({type:Boolean,reflect:!0})],A.prototype,"scrolled",void 0);z([a({type:Number,attribute:"scroll-pos"})],A.prototype,"scrollPos",null);z([a({type:Number,attribute:"scroll-max"})],A.prototype,"scrollMax",null);z([v()],A.prototype,"_isDragging",void 0);z([v()],A.prototype,"_thumbHeight",void 0);z([v()],A.prototype,"_thumbY",void 0);z([v()],A.prototype,"_thumbVisible",void 0);z([v()],A.prototype,"_thumbFade",void 0);z([v()],A.prototype,"_thumbActive",void 0);z([H(".content")],A.prototype,"_contentElement",void 0);z([H(".scrollbar-thumb",!0)],A.prototype,"_scrollThumbElement",void 0);z([H(".scrollable-container")],A.prototype,"_scrollableContainer",void 0);z([J()],A.prototype,"_assignedElements",void 0);A=z([_("vscode-scrollable")],A);var R=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};const Ze=10,oe=22;class E extends x{set combobox(e){this._opts.comboboxMode=e}get combobox(){return this._opts.comboboxMode}set disabled(e){this._disabled=e,this.ariaDisabled=e?"true":"false",e===!0?(this._originalTabIndex=this.tabIndex,this.tabIndex=-1):(this.tabIndex=this._originalTabIndex??0,this._originalTabIndex=void 0),this.requestUpdate()}get disabled(){return this._disabled}set filter(e){const t=["contains","fuzzy","startsWith","startsWithPerTerm"];let o;t.includes(e)?o=e:(console.warn(`[VSCode Webview Elements] Invalid filter: "${e}", fallback to default. Valid values are: "contains", "fuzzy", "startsWith", "startsWithPerm".`,this),o="fuzzy"),this._opts.filterMethod=o}get filter(){return this._opts.filterMethod}set options(e){this._opts.populate(e)}get options(){return this._opts.options.map(({label:e,value:t,description:o,selected:i,disabled:s})=>({label:e,value:t,description:o,selected:i,disabled:s}))}constructor(){super(),this.creatable=!1,this.label="",this.invalid=!1,this.focused=!1,this.open=!1,this.position="below",this._opts=new Ks(this),this._firstUpdateCompleted=!1,this._currentDescription="",this._filter="fuzzy",this._selectedIndexes=[],this._options=[],this._value="",this._values=[],this._isPlaceholderOptionActive=!1,this._isBeingFiltered=!1,this._optionListScrollPos=0,this._isHoverForbidden=!1,this._disabled=!1,this._originalTabIndex=void 0,this._onClickOutside=e=>{e.composedPath().findIndex(i=>i===this)===-1&&(this.open=!1)},this._onMouseMove=()=>{this._isHoverForbidden=!1,window.removeEventListener("mousemove",this._onMouseMove)},this._onOptionListScroll=e=>{this._optionListScrollPos=e.detail},this._onComponentKeyDown=e=>{[" ","ArrowUp","ArrowDown","Escape"].includes(e.key)&&(e.stopPropagation(),e.preventDefault()),e.key==="Enter"&&this._onEnterKeyDown(e),e.key===" "&&this._onSpaceKeyDown(),e.key==="Escape"&&this._onEscapeKeyDown(),e.key==="ArrowUp"&&this._onArrowUpKeyDown(),e.key==="ArrowDown"&&this._onArrowDownKeyDown()},this._onComponentFocus=()=>{this.focused=!0},this._onComponentBlur=()=>{this.focused=!1},this.addEventListener("vsc-option-state-change",e=>{e.stopPropagation(),this._setStateFromSlottedElements(),this.requestUpdate()})}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._onComponentKeyDown),this.addEventListener("focus",this._onComponentFocus),this.addEventListener("blur",this._onComponentBlur),this._setAutoFocus()}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._onComponentKeyDown),this.removeEventListener("focus",this._onComponentFocus),this.removeEventListener("blur",this._onComponentBlur)}firstUpdated(e){this._firstUpdateCompleted=!0}willUpdate(e){e.has("required")&&this._firstUpdateCompleted&&this._manageRequired()}update(e){super.update(e),e.has("open")&&(this.open?(this._opts.activateDefault(),this._scrollActiveElementToTop(),window.addEventListener("click",this._onClickOutside)):window.removeEventListener("click",this._onClickOutside))}get _filteredOptions(){return!this.combobox||this._opts.filterPattern===""?this._options:Ns(this._options,this._opts.filterPattern,this._filter)}_setAutoFocus(){this.hasAttribute("autofocus")&&(this.tabIndex<0&&(this.tabIndex=0),this.combobox?this.updateComplete.then(()=>{var e;(e=this.shadowRoot)==null||e.querySelector(".combobox-input").focus()}):this.updateComplete.then(()=>{var e;(e=this.shadowRoot)==null||e.querySelector(".select-face").focus()}))}get _isSuggestedOptionVisible(){if(!(this.combobox&&this.creatable))return!1;const e=this._opts.getOptionByValue(this._opts.filterPattern)!==null,t=this._opts.filterPattern.length>0;return!e&&t}_manageRequired(){}_setStateFromSlottedElements(){const e=this._assignedOptions??[];this._opts.clear(),e.forEach(t=>{const{innerText:o,description:i,disabled:s}=t,r=typeof t.value=="string"?t.value:o.trim(),l=t.selected??!1,c={label:o.trim(),value:r,description:i,selected:l,disabled:s};this._opts.add(c)})}_createSuggestedOption(){const e=this._opts.numOptions,t=document.createElement("vscode-option");return t.value=this._opts.filterPattern,vo(this._opts.filterPattern,t),this.appendChild(t),e}_dispatchChangeEvent(){this.dispatchEvent(new Event("change")),this.dispatchEvent(new Event("input"))}async _createAndSelectSuggestedOption(){}_toggleComboboxDropdown(){this._opts.filterPattern="",this.open=!this.open}_scrollActiveElementToTop(){this._optionListScrollPos=Math.floor(this._opts.relativeActiveIndex*oe)}async _adjustOptionListScrollPos(e,t){let o=this._opts.numOfVisibleOptions;if(this._isSuggestedOptionVisible&&(o+=1),o<=Ze)return;this._isHoverForbidden=!0,window.addEventListener("mousemove",this._onMouseMove);const s=this._optionListScrollPos,r=t*oe,l=r>=s&&r<=s+Ze*oe-oe;e==="down"&&(l||(this._optionListScrollPos=t*oe-(Ze-1)*oe)),e==="up"&&(l||(this._optionListScrollPos=Math.floor(this._opts.relativeActiveIndex*oe)))}_onFaceClick(){this.open=!this.open}_onComboboxButtonClick(){this._toggleComboboxDropdown()}_onComboboxButtonKeyDown(e){e.key==="Enter"&&this._toggleComboboxDropdown()}_onOptionMouseOver(e){if(this._isHoverForbidden)return;const t=e.target;t.matches(".option")&&(t.matches(".placeholder")?(this._isPlaceholderOptionActive=!0,this._opts.activeIndex=-1):(this._isPlaceholderOptionActive=!1,this._opts.activeIndex=+t.dataset.index))}_onPlaceholderOptionMouseOut(){this._isPlaceholderOptionActive=!1}_onNoOptionsClick(e){e.stopPropagation()}_onEnterKeyDown(e){this._isBeingFiltered=!1,e!=null&&e.composedPath&&e.composedPath().find(o=>o.matches?o.matches("vscode-button.button-accept"):!1)}_onSpaceKeyDown(){if(!this.open){this.open=!0;return}}_onArrowUpKeyDown(){if(this.open){if(this._opts.activeIndex<=0&&!(this.combobox&&this.creatable))return;if(this._isPlaceholderOptionActive){const e=this._opts.numOfVisibleOptions-1;this._opts.activeIndex=e,this._isPlaceholderOptionActive=!1}else{const e=this._opts.prev();if(e!==null){this._opts.activeIndex=(e==null?void 0:e.index)??-1;const t=(e==null?void 0:e.filteredIndex)??-1;t>-1&&this._adjustOptionListScrollPos("up",t)}}}else this.open=!0,this._opts.activateDefault()}_onArrowDownKeyDown(){let e=this._opts.numOfVisibleOptions;const t=this._isSuggestedOptionVisible;if(t&&(e+=1),this.open){if(this._isPlaceholderOptionActive&&this._opts.activeIndex===-1)return;const o=this._opts.next();if(t&&o===null)this._isPlaceholderOptionActive=!0,this._adjustOptionListScrollPos("down",e-1),this._opts.activeIndex=-1;else if(o!==null){const i=(o==null?void 0:o.filteredIndex)??-1;this._opts.activeIndex=(o==null?void 0:o.index)??-1,i>-1&&this._adjustOptionListScrollPos("down",i)}}else this.open=!0,this._opts.activateDefault()}_onEscapeKeyDown(){this.open=!1}_onSlotChange(){this._setStateFromSlottedElements(),this.requestUpdate()}_onComboboxInputFocus(e){e.target.select(),this._isBeingFiltered=!1,this._opts.filterPattern=""}_onComboboxInputBlur(){this._isBeingFiltered=!1}_onComboboxInputInput(e){this._isBeingFiltered=!0,this._opts.filterPattern=e.target.value,this._opts.activeIndex=-1,this.open=!0}_onComboboxInputClick(){this._isBeingFiltered=this._opts.filterPattern!=="",this.open=!0}_onComboboxInputSpaceKeyDown(e){e.key===" "&&e.stopPropagation()}_onOptionClick(e){this._isBeingFiltered=!1}_renderCheckbox(e,t){return d`<span class=${$({"checkbox-icon":!0,checked:e})}>${Ds}</span
      ><span class="option-label">${t}</span>`}_renderOptions(){const e=this._opts.options;return d`
      <ul
        aria-label=${y(this.label??void 0)}
        aria-multiselectable=${y(this._opts.multiSelect?"true":void 0)}
        class="options"
        id="select-listbox"
        role="listbox"
        tabindex="-1"
        @click=${this._onOptionClick}
        @mouseover=${this._onOptionMouseOver}
      >
        ${qs(e,t=>t.index,(t,o)=>{var c;if(!t.visible)return p;const i=t.index===this._opts.activeIndex&&!t.disabled,s=this._opts.getIsIndexSelected(t.index),r={active:i,disabled:t.disabled,option:!0,selected:s},l=((c=t.ranges)==null?void 0:c.length)??!1?Ws(t.label,t.ranges??[]):t.label;return d`
              <li
                aria-selected=${s?"true":"false"}
                class=${$(r)}
                data-index=${t.index}
                data-filtered-index=${o}
                id=${`op-${t.index}`}
                role="option"
                tabindex="-1"
              >
                ${Us(this._opts.multiSelect,()=>this._renderCheckbox(s,l),()=>l)}
              </li>
            `})}
        ${this._renderPlaceholderOption(this._opts.numOfVisibleOptions<1)}
      </ul>
    `}_renderPlaceholderOption(e){return!this.combobox||this._opts.getOptionByLabel(this._opts.filterPattern)?p:this.creatable&&this._opts.filterPattern.length>0?d`<li
        class=${$({option:!0,placeholder:!0,active:this._isPlaceholderOptionActive})}
        @mouseout=${this._onPlaceholderOptionMouseOut}
      >
        Add "${this._opts.filterPattern}"
      </li>`:e?d`<li class="no-options" @click=${this._onNoOptionsClick}>
            No options
          </li>`:p}_renderDescription(){const e=this._opts.getActiveOption();if(!e)return p;const{description:t}=e;return t?d`<div class="description">${t}</div>`:p}_renderSelectFace(){return d`${p}`}_renderComboboxFace(){return d`${p}`}_renderDropdownControls(){return d`${p}`}_renderDropdown(){const e={dropdown:!0,multiple:this._opts.multiSelect,open:this.open},t=this._isSuggestedOptionVisible||this._opts.numOfVisibleOptions===0?this._opts.numOfVisibleOptions+1:this._opts.numOfVisibleOptions,o=Math.min(t*oe,Ze*oe);return d`
      <div class=${$(e)}>
        ${this.position==="above"?this._renderDescription():p}
        <vscode-scrollable
          always-visible
          class="scrollable"
          min-thumb-size="40"
          tabindex="-1"
          @vsc-scrollable-scroll=${this._onOptionListScroll}
          .scrollPos=${this._optionListScrollPos}
          .style=${F({height:`${o}px`})}
        >
          ${this._renderOptions()} ${this._renderDropdownControls()}
        </vscode-scrollable>
        ${this.position==="below"?this._renderDescription():p}
      </div>
    `}}R([a({type:Boolean,reflect:!0})],E.prototype,"creatable",void 0);R([a({type:Boolean,reflect:!0})],E.prototype,"combobox",null);R([a({reflect:!0})],E.prototype,"label",void 0);R([a({type:Boolean,reflect:!0})],E.prototype,"disabled",null);R([a({type:Boolean,reflect:!0})],E.prototype,"invalid",void 0);R([a()],E.prototype,"filter",null);R([a({type:Boolean,reflect:!0})],E.prototype,"focused",void 0);R([a({type:Boolean,reflect:!0})],E.prototype,"open",void 0);R([a({type:Array})],E.prototype,"options",null);R([a({reflect:!0})],E.prototype,"position",void 0);R([J({flatten:!0,selector:"vscode-option"})],E.prototype,"_assignedOptions",void 0);R([v()],E.prototype,"_currentDescription",void 0);R([v()],E.prototype,"_filter",void 0);R([v()],E.prototype,"_filteredOptions",null);R([v()],E.prototype,"_selectedIndexes",void 0);R([v()],E.prototype,"_options",void 0);R([v()],E.prototype,"_value",void 0);R([v()],E.prototype,"_values",void 0);R([v()],E.prototype,"_isPlaceholderOptionActive",void 0);R([v()],E.prototype,"_isBeingFiltered",void 0);R([v()],E.prototype,"_optionListScrollPos",void 0);const Io=[g,b`
    :host {
      display: inline-block;
      max-width: 100%;
      outline: none;
      position: relative;
      width: 320px;
    }

    .main-slot {
      display: none;
    }

    .select-face,
    .combobox-face {
      background-color: var(--vscode-settings-dropdownBackground, #313131);
      border-color: var(--vscode-settings-dropdownBorder, #3c3c3c);
      border-radius: 2px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-settings-dropdownForeground, #cccccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 18px;
      position: relative;
      user-select: none;
      width: 100%;
    }

    :host([invalid]) .select-face,
    :host(:invalid) .select-face,
    :host([invalid]) .combobox-face,
    :host(:invalid) .combobox-face {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    .select-face {
      cursor: pointer;
      display: block;
      padding: 3px 4px;
    }

    .select-face .text {
      display: block;
      height: 18px;
      overflow: hidden;
    }

    .select-face.multiselect {
      padding: 0;
    }

    .select-face-badge {
      background-color: var(--vscode-badge-background, #616161);
      border-radius: 2px;
      color: var(--vscode-badge-foreground, #f8f8f8);
      display: inline-block;
      flex-shrink: 0;
      font-size: 11px;
      line-height: 16px;
      margin: 2px;
      padding: 2px 3px;
      white-space: nowrap;
    }

    .select-face-badge.no-item {
      background-color: transparent;
      color: inherit;
    }

    .combobox-face {
      display: flex;
    }

    :host(:focus) .select-face,
    :host(:focus) .combobox-face,
    :host([focused]) .select-face,
    :host([focused]) .combobox-face {
      border-color: var(--vscode-focusBorder, #0078d4);
      outline: none;
    }

    .combobox-input {
      background-color: transparent;
      box-sizing: border-box;
      border: 0;
      color: var(--vscode-foreground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      line-height: 16px;
      padding: 4px;
      width: 100%;
    }

    .combobox-input:focus {
      outline: none;
    }

    .combobox-button {
      align-items: center;
      background-color: transparent;
      border: 0;
      border-radius: 2px;
      box-sizing: content-box;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      flex-shrink: 0;
      height: 16px;
      justify-content: center;
      margin: 1px 1px 0 0;
      padding: 3px;
      width: 22px;
    }

    .combobox-button:hover,
    .combobox-button:focus-visible {
      background-color: var(
        --vscode-toolbar-hoverBackground,
        rgba(90, 93, 94, 0.31)
      );
      outline-style: dashed;
      outline-color: var(--vscode-toolbar-hoverOutline, transparent);
    }

    .combobox-button:focus-visible {
      outline: none;
    }

    .icon {
      color: var(--vscode-foreground, #cccccc);
      display: block;
      height: 14px;
      pointer-events: none;
      width: 14px;
    }

    .select-face .icon {
      position: absolute;
      right: 6px;
      top: 5px;
    }

    .icon svg {
      color: var(--vscode-foreground, #cccccc);
      height: 100%;
      width: 100%;
    }

    .dropdown {
      background-color: var(--vscode-settings-dropdownBackground, #313131);
      border-color: var(--vscode-settings-dropdownListBorder, #454545);
      border-radius: 0 0 3px 3px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      display: none;
      left: 0;
      padding-bottom: 2px;
      position: absolute;
      top: 100%;
      width: 100%;
      z-index: var(--dropdown-z-index, 2);
    }

    .dropdown.open {
      display: block;
    }

    :host([position='above']) .dropdown {
      border-radius: 3px 3px 0 0;
      bottom: 26px;
      padding-bottom: 0;
      padding-top: 2px;
      top: auto;
    }

    :host(:focus) .dropdown,
    :host([focused]) .dropdown {
      border-color: var(--vscode-focusBorder, #0078d4);
    }

    .scrollable {
      display: block;
      max-height: 222px;
      margin: 1px;
      outline: none;
      overflow: hidden;
    }

    .options {
      box-sizing: border-box;
      cursor: pointer;
      list-style: none;
      margin: 0;
      padding: 0;
    }

    .option {
      align-items: center;
      box-sizing: border-box;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      height: 22px;
      line-height: 18px;
      min-height: calc(var(--vscode-font-size) * 1.3);
      padding: 1px 3px;
      user-select: none;
      outline-color: transparent;
      outline-offset: -1px;
      outline-style: solid;
      outline-width: 1px;
    }

    .option b {
      color: var(--vscode-list-highlightForeground, #2aaaff);
    }

    .option.active b {
      color: var(--vscode-list-focusHighlightForeground, #2aaaff);
    }

    .option:not(.disabled):hover {
      background-color: var(--vscode-list-hoverBackground, #2a2d2e);
      color: var(--vscode-list-hoverForeground, #ffffff);
    }

    :host-context(body[data-vscode-theme-kind='vscode-high-contrast'])
      .option:hover,
    :host-context(body[data-vscode-theme-kind='vscode-high-contrast-light'])
      .option:hover {
      outline-style: dotted;
      outline-color: var(--vscode-list-focusOutline, #0078d4);
      outline-width: 1px;
    }

    .option.disabled {
      cursor: not-allowed;
      opacity: 0.4;
    }

    .option.active,
    .option.active:hover {
      background-color: var(--vscode-list-activeSelectionBackground, #04395e);
      color: var(--vscode-list-activeSelectionForeground, #ffffff);
      outline-color: var(--vscode-list-activeSelectionBackground, #04395e);
      outline-style: solid;
      outline-width: 1px;
    }

    .no-options {
      align-items: center;
      border-color: transparent;
      border-style: solid;
      border-width: 1px;
      color: var(--vscode-foreground, #cccccc);
      cursor: default;
      display: flex;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 18px;
      min-height: calc(var(--vscode-font-size) * 1.3);
      opacity: 0.85;
      padding: 1px 3px;
      user-select: none;
    }

    .placeholder {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .placeholder span {
      font-weight: bold;
    }

    .placeholder:not(.disabled):hover {
      color: var(--vscode-list-activeSelectionForeground, #ffffff);
    }

    :host-context(body[data-vscode-theme-kind='vscode-high-contrast'])
      .option.active,
    :host-context(body[data-vscode-theme-kind='vscode-high-contrast-light'])
      .option.active:hover {
      outline-color: var(--vscode-list-focusOutline, #0078d4);
      outline-style: dashed;
    }

    .option-label {
      display: block;
      pointer-events: none;
      width: 100%;
    }

    .dropdown.multiple .option.selected {
      background-color: var(--vscode-list-hoverBackground, #2a2d2e);
      outline-color: var(--vscode-list-hoverBackground, #2a2d2e);
    }

    .dropdown.multiple .option.selected.active {
      background-color: var(--vscode-list-activeSelectionBackground, #04395e);
      color: var(--vscode-list-activeSelectionForeground, #ffffff);
      outline-color: var(--vscode-list-activeSelectionBackground, #04395e);
    }

    .checkbox-icon {
      align-items: center;
      background-color: var(--vscode-checkbox-background, #313131);
      border: 1px solid var(--vscode-checkbox-border);
      border-radius: 2px;
      box-sizing: border-box;
      color: var(--vscode-checkbox-foreground);
      display: inline-flex;
      height: 15px;
      justify-content: center;
      margin-right: 5px;
      overflow: hidden;
      position: relative;
      width: 15px;
    }

    .checkbox-icon svg {
      display: none;
      height: 13px;
      width: 13px;
    }

    .checkbox-icon.checked svg {
      display: block;
    }

    .dropdown-controls {
      display: flex;
      justify-content: flex-end;
      padding: 4px;
    }

    .dropdown-controls :not(:last-child) {
      margin-right: 4px;
    }

    .action-icon {
      align-items: center;
      background-color: transparent;
      border: 0;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      height: 24px;
      justify-content: center;
      padding: 0;
      width: 24px;
    }

    .action-icon:focus {
      outline: none;
    }

    .action-icon:focus-visible {
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: -1px;
    }

    .description {
      border-color: var(--vscode-settings-dropdownBorder, #3c3c3c);
      border-style: solid;
      border-width: 1px 0 0;
      color: var(--vscode-foreground, #cccccc);
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.3;
      padding: 6px 4px;
      word-wrap: break-word;
    }

    :host([position='above']) .description {
      border-width: 0 0 1px;
    }
  `];var xe=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let X=class extends E{set selectedIndexes(e){this._opts.selectedIndexes=e}get selectedIndexes(){return this._opts.selectedIndexes}set value(e){this._opts.multiSelectValue=e,this._opts.selectedIndexes.length>0?this._requestedValueToSetLater=[]:this._requestedValueToSetLater=Array.isArray(e)?e:[e],this._setFormValue(),this._manageRequired()}get value(){return this._opts.multiSelectValue}get form(){return this._internals.form}get type(){return"select-multiple"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}selectAll(){this._opts.selectAll()}selectNone(){this._opts.selectNone()}constructor(){super(),this.defaultValue=[],this.required=!1,this.name=void 0,this._requestedValueToSetLater=[],this._onOptionClick=e=>{const o=e.composedPath().find(r=>"matches"in r?r.matches("li.option"):!1);if(!o)return;if(o.classList.contains("placeholder")){this._createAndSelectSuggestedOption();return}const s=Number(o.dataset.index);this._opts.toggleOptionSelected(s),this._setFormValue(),this._manageRequired(),this._dispatchChangeEvent()},this._opts.multiSelect=!0,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._setDefaultValue(),this._manageRequired()})}formResetCallback(){this.updateComplete.then(()=>{this.value=this.defaultValue})}formStateRestoreCallback(e,t){const o=Array.from(e.entries()).map(i=>String(i[1]));this.updateComplete.then(()=>{this.value=o})}_setDefaultValue(){if(Array.isArray(this.defaultValue)&&this.defaultValue.length>0){const e=this.defaultValue.map(t=>String(t));this.value=e}}_dispatchChangeEvent(){this.dispatchEvent(new CustomEvent("vsc-change",{detail:{selectedIndexes:this._opts.selectedIndexes,value:this._opts.multiSelectValue}})),super._dispatchChangeEvent()}_onFaceClick(){super._onFaceClick(),this._opts.activeIndex=0}_toggleComboboxDropdown(){super._toggleComboboxDropdown(),this._opts.activeIndex=-1}_manageRequired(){const{value:e}=this;e.length===0&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._faceElement):this._internals.setValidity({})}_setFormValue(){const e=new FormData;this._values.forEach(t=>{e.append(this.name??"",t)}),this._internals.setFormValue(e)}async _createAndSelectSuggestedOption(){var o;super._createAndSelectSuggestedOption();const e=this._createSuggestedOption();await this.updateComplete,this.selectedIndexes=[...this.selectedIndexes,e],this._dispatchChangeEvent();const t=new CustomEvent("vsc-multi-select-create-option",{detail:{value:((o=this._opts.getOptionByIndex(e))==null?void 0:o.value)??""}});this.dispatchEvent(t),this.open=!1,this._isPlaceholderOptionActive=!1}_onSlotChange(){super._onSlotChange(),this._requestedValueToSetLater.length>0&&(this._opts.expandMultiSelection(this._requestedValueToSetLater),this._requestedValueToSetLater=this._requestedValueToSetLater.filter(e=>this._opts.findOptionIndex(e)===-1))}_onEnterKeyDown(e){super._onEnterKeyDown(e),this.open?this._isPlaceholderOptionActive?this._createAndSelectSuggestedOption():(this._opts.toggleActiveMultiselectOption(),this._setFormValue(),this._manageRequired(),this._dispatchChangeEvent()):(this._opts.filterPattern="",this.open=!0)}_onMultiAcceptClick(){this.open=!1}_onMultiDeselectAllClick(){this._opts.selectedIndexes=[],this._values=[],this._options=this._options.map(e=>({...e,selected:!1})),this._manageRequired(),this._dispatchChangeEvent()}_onMultiSelectAllClick(){this._opts.selectedIndexes=[],this._values=[],this._options=this._options.map(e=>({...e,selected:!0})),this._options.forEach((e,t)=>{this._selectedIndexes.push(t),this._values.push(e.value),this._dispatchChangeEvent()}),this._setFormValue(),this._manageRequired()}_renderLabel(){switch(this._opts.selectedIndexes.length){case 0:return d`<span class="select-face-badge no-item">0 Selected</span>`;default:return d`<span class="select-face-badge"
          >${this._opts.selectedIndexes.length} Selected</span
        >`}}_renderComboboxFace(){let e="";if(this._isBeingFiltered)e=this._opts.filterPattern;else{const i=this._opts.getSelectedOption();e=(i==null?void 0:i.label)??""}const t=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",o=this.open?"true":"false";return d`
      <div class="combobox-face face">
        ${this._opts.multiSelect?this._renderLabel():p}
        <input
          aria-activedescendant=${t}
          aria-autocomplete="list"
          aria-controls="select-listbox"
          aria-expanded=${o}
          aria-haspopup="listbox"
          aria-label=${y(this.label)}
          class="combobox-input"
          role="combobox"
          spellcheck="false"
          type="text"
          autocomplete="off"
          .value=${e}
          @focus=${this._onComboboxInputFocus}
          @blur=${this._onComboboxInputBlur}
          @input=${this._onComboboxInputInput}
          @click=${this._onComboboxInputClick}
          @keydown=${this._onComboboxInputSpaceKeyDown}
        >
        <button
          aria-label="Open the list of options"
          class="combobox-button"
          type="button"
          @click=${this._onComboboxButtonClick}
          @keydown=${this._onComboboxButtonKeyDown}
          tabindex="-1"
        >
          ${rt}
        </button>
      </div>
    `}_renderSelectFace(){const e=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",t=this.open?"true":"false";return d`
      <div
        aria-activedescendant=${y(this._opts.multiSelect?void 0:e)}
        aria-controls="select-listbox"
        aria-expanded=${y(this._opts.multiSelect?void 0:t)}
        aria-haspopup="listbox"
        aria-label=${y(this.label??void 0)}
        class="select-face face multiselect"
        @click=${this._onFaceClick}
        .tabIndex=${this.disabled?-1:0}
      >
        ${this._renderLabel()} ${rt}
      </div>
    `}_renderDropdownControls(){return this._filteredOptions.length>0?d`
          <div class="dropdown-controls">
            <button
              type="button"
              @click=${this._onMultiSelectAllClick}
              title="Select all"
              class="action-icon"
              id="select-all"
            >
              <vscode-icon name="checklist"></vscode-icon>
            </button>
            <button
              type="button"
              @click=${this._onMultiDeselectAllClick}
              title="Deselect all"
              class="action-icon"
              id="select-none"
            >
              <vscode-icon name="clear-all"></vscode-icon>
            </button>
            <vscode-button
              class="button-accept"
              @click=${this._onMultiAcceptClick}
              >OK</vscode-button
            >
          </div>
        `:d`${p}`}render(){return d`
      <div class="multi-select">
        <slot class="main-slot" @slotchange=${this._onSlotChange}></slot>
        ${this.combobox?this._renderComboboxFace():this._renderSelectFace()}
        ${this._renderDropdown()}
      </div>
    `}};X.styles=Io;X.shadowRootOptions={...K.shadowRootOptions,delegatesFocus:!0};X.formAssociated=!0;xe([a({type:Array,attribute:"default-value"})],X.prototype,"defaultValue",void 0);xe([a({type:Boolean,reflect:!0})],X.prototype,"required",void 0);xe([a({reflect:!0})],X.prototype,"name",void 0);xe([a({type:Array,attribute:!1})],X.prototype,"selectedIndexes",null);xe([a({type:Array})],X.prototype,"value",null);xe([H(".face")],X.prototype,"_faceElement",void 0);X=xe([_("vscode-multi-select")],X);const Ys=[g,b`
    :host {
      align-items: center;
      display: block;
      height: 28px;
      margin: 0;
      outline: none;
      width: 28px;
    }

    .progress {
      height: 100%;
      width: 100%;
    }

    .background {
      fill: none;
      stroke: transparent;
      stroke-width: 2px;
    }

    .indeterminate-indicator-1 {
      fill: none;
      stroke: var(--vscode-progressBar-background, #0078d4);
      stroke-width: 2px;
      stroke-linecap: square;
      transform-origin: 50% 50%;
      transform: rotate(-90deg);
      transition: all 0.2s ease-in-out;
      animation: spin-infinite 2s linear infinite;
    }

    @keyframes spin-infinite {
      0% {
        stroke-dasharray: 0.01px 43.97px;
        transform: rotate(0deg);
      }
      50% {
        stroke-dasharray: 21.99px 21.99px;
        transform: rotate(450deg);
      }
      100% {
        stroke-dasharray: 0.01px 43.97px;
        transform: rotate(1080deg);
      }
    }
  `];var vt=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let Oe=class extends x{constructor(){super(...arguments),this.ariaLabel="Loading",this.ariaLive="assertive",this.role="alert"}render(){return d`<svg class="progress" part="progress" viewBox="0 0 16 16">
      <circle
        class="background"
        part="background"
        cx="8px"
        cy="8px"
        r="7px"
      ></circle>
      <circle
        class="indeterminate-indicator-1"
        part="indeterminate-indicator-1"
        cx="8px"
        cy="8px"
        r="7px"
      ></circle>
    </svg>`}};Oe.styles=Ys;vt([a({reflect:!0,attribute:"aria-label"})],Oe.prototype,"ariaLabel",void 0);vt([a({reflect:!0,attribute:"aria-live"})],Oe.prototype,"ariaLive",void 0);vt([a({reflect:!0})],Oe.prototype,"role",void 0);Oe=vt([_("vscode-progress-ring")],Oe);const Xs=[g,go,b`
    :host(:invalid) .icon,
    :host([invalid]) .icon {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    .icon {
      border-radius: 9px;
    }

    .icon.checked:before {
      background-color: currentColor;
      border-radius: 4px;
      content: '';
      height: 8px;
      left: 50%;
      margin: -4px 0 0 -4px;
      position: absolute;
      top: 50%;
      width: 8px;
    }

    :host(:focus):host(:not([disabled])) .icon {
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: -1px;
    }
  `];var q=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let T=class extends _o(Tt){constructor(){super(),this.autofocus=!1,this.checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name="",this.value="",this.disabled=!1,this.required=!1,this.role="radio",this.tabIndex=0,this._slottedText="",this.type="radio",this._handleClick=()=>{this.disabled||this.checked||(this._checkButton(),this._handleValueChange(),this._dispatchCustomEvent(),this.dispatchEvent(new Event("change",{bubbles:!0})))},this._handleKeyDown=e=>{var t;!this.disabled&&(e.key==="Enter"||e.key===" ")&&(e.preventDefault(),e.key===" "&&!this.checked&&(this.checked=!0,this._handleValueChange(),this._dispatchCustomEvent(),this.dispatchEvent(new Event("change",{bubbles:!0}))),e.key==="Enter"&&((t=this._internals.form)==null||t.requestSubmit()))},this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleKeyDown),this.addEventListener("click",this._handleClick),this._handleValueChange()}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._handleKeyDown),this.removeEventListener("click",this._handleClick)}update(e){super.update(e),e.has("checked")&&this._handleValueChange(),e.has("required")&&this._handleValueChange()}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}formResetCallback(){this._getRadios().forEach(t=>{t.checked=t.defaultChecked}),this.updateComplete.then(()=>{this._handleValueChange()})}formStateRestoreCallback(e,t){this.value===e&&e!==""&&(this.checked=!0)}_dispatchCustomEvent(){this.dispatchEvent(new CustomEvent("vsc-change",{detail:{checked:this.checked,label:this.label,value:this.value},bubbles:!0,composed:!0}))}_getRadios(){const e=this.getRootNode({composed:!0});if(!e)return[];const t=e.querySelectorAll(`vscode-radio[name="${this.name}"]`);return Array.from(t)}_uncheckOthers(e){e.forEach(t=>{t!==this&&(t.checked=!1)})}_checkButton(){const e=this._getRadios();this.checked=!0,e.forEach(t=>{t!==this&&(t.checked=!1)})}setComponentValidity(e){e?this._internals.setValidity({}):this._internals.setValidity({valueMissing:!0},"Please select one of these options.",this._inputEl)}_setGroupValidity(e,t){this.updateComplete.then(()=>{e.forEach(o=>{o.setComponentValidity(t)})})}_setActualFormValue(){let e="";this.checked?e=this.value?this.value:"on":e=null,this._internals.setFormValue(e)}_handleValueChange(){const e=this._getRadios(),t=e.some(o=>o.required);if(this._setActualFormValue(),this.checked)this._uncheckOthers(e),this._setGroupValidity(e,!0);else{const o=!!e.find(s=>s.checked),i=t&&!o;this._setGroupValidity(e,!i)}}render(){const e=$({icon:!0,checked:this.checked}),t=$({"label-inner":!0,"is-slot-empty":this._slottedText===""});return d`
      <div class="wrapper">
        <input
          ?autofocus=${this.autofocus}
          id="input"
          class="radio"
          type="checkbox"
          ?checked=${this.checked}
          value=${this.value}
          tabindex=${this.tabIndex}
        >
        <div class=${e}></div>
        <label for="input" class="label" @click=${this._handleClick}>
          <span class=${t}>
            ${this._renderLabelAttribute()}
            <slot @slotchange=${this._handleSlotChange}></slot>
          </span>
        </label>
      </div>
    `}};T.styles=Xs;T.formAssociated=!0;T.shadowRootOptions={...K.shadowRootOptions,delegatesFocus:!0};q([a({type:Boolean,reflect:!0})],T.prototype,"autofocus",void 0);q([a({type:Boolean,reflect:!0})],T.prototype,"checked",void 0);q([a({type:Boolean,reflect:!0,attribute:"default-checked"})],T.prototype,"defaultChecked",void 0);q([a({type:Boolean,reflect:!0})],T.prototype,"invalid",void 0);q([a({reflect:!0})],T.prototype,"name",void 0);q([a()],T.prototype,"value",void 0);q([a({type:Boolean,reflect:!0})],T.prototype,"disabled",void 0);q([a({type:Boolean,reflect:!0})],T.prototype,"required",void 0);q([a({reflect:!0})],T.prototype,"role",void 0);q([a({type:Number,reflect:!0})],T.prototype,"tabIndex",void 0);q([v()],T.prototype,"_slottedText",void 0);q([H("#input")],T.prototype,"_inputEl",void 0);q([a()],T.prototype,"type",void 0);T=q([_("vscode-radio")],T);const Zs=[g,b`
    :host {
      display: block;
    }

    .wrapper {
      display: flex;
      flex-wrap: wrap;
    }

    :host([variant='vertical']) .wrapper {
      display: block;
    }

    ::slotted(vscode-radio) {
      margin-right: 20px;
    }

    ::slotted(vscode-radio:last-child) {
      margin-right: 0;
    }

    :host([variant='vertical']) ::slotted(vscode-radio) {
      display: block;
      margin-bottom: 15px;
    }

    :host([variant='vertical']) ::slotted(vscode-radio:last-child) {
      margin-bottom: 0;
    }
  `];var Ve=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let ce=class extends x{constructor(){super(...arguments),this.variant="horizontal",this.role="radiogroup",this._focusedRadio=-1,this._checkedRadio=-1,this._firstContentLoaded=!1,this._onKeyDownBound=this._onKeyDown.bind(this)}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._onKeyDownBound)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._onKeyDownBound)}_uncheckPreviousChecked(e,t){e!==-1&&(this._radios[e].checked=!1),t!==-1&&(this._radios[t].tabIndex=-1)}_afterCheck(){this._focusedRadio=this._checkedRadio,this._radios[this._checkedRadio].checked=!0,this._radios[this._checkedRadio].tabIndex=0,this._radios[this._checkedRadio].focus()}_checkPrev(){const e=this._radios.findIndex(i=>i.checked),t=this._radios.findIndex(i=>i.focused),o=t!==-1?t:e;this._uncheckPreviousChecked(e,t),o===-1?this._checkedRadio=this._radios.length-1:o-1>=0?this._checkedRadio=o-1:this._checkedRadio=this._radios.length-1,this._afterCheck()}_checkNext(){const e=this._radios.findIndex(i=>i.checked),t=this._radios.findIndex(i=>i.focused),o=t!==-1?t:e;this._uncheckPreviousChecked(e,t),o===-1?this._checkedRadio=0:o+1<this._radios.length?this._checkedRadio=o+1:this._checkedRadio=0,this._afterCheck()}_onKeyDown(e){const{key:t}=e;["ArrowLeft","ArrowUp","ArrowRight","ArrowDown"].includes(t)&&e.preventDefault(),(t==="ArrowRight"||t==="ArrowDown")&&this._checkNext(),(t==="ArrowLeft"||t==="ArrowUp")&&this._checkPrev()}_onChange(e){const t=this._radios.findIndex(o=>o===e.target);t!==-1&&(this._focusedRadio!==-1&&(this._radios[this._focusedRadio].tabIndex=-1),this._checkedRadio!==-1&&this._checkedRadio!==t&&(this._radios[this._checkedRadio].checked=!1),this._focusedRadio=t,this._checkedRadio=t,this._radios[t].tabIndex=0)}_onSlotChange(){if(!this._firstContentLoaded){const e=this._radios.findIndex(t=>t.autofocus);e>-1&&(this._focusedRadio=e),this._firstContentLoaded=!0}this._radios.forEach((e,t)=>{this._focusedRadio>-1?e.tabIndex=t===this._focusedRadio?0:-1:e.tabIndex=t===0?0:-1})}render(){return d`
      <div class="wrapper">
        <slot
          @slotchange=${this._onSlotChange}
          @vsc-change=${this._onChange}
        ></slot>
      </div>
    `}};ce.styles=Zs;Ve([a({reflect:!0})],ce.prototype,"variant",void 0);Ve([a({reflect:!0})],ce.prototype,"role",void 0);Ve([J({selector:"vscode-radio"})],ce.prototype,"_radios",void 0);Ve([v()],ce.prototype,"_focusedRadio",void 0);Ve([v()],ce.prototype,"_checkedRadio",void 0);ce=Ve([_("vscode-radio-group")],ce);var we=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let Z=class extends E{set selectedIndex(e){this._opts.selectedIndex=e;const t=this._opts.getOptionByIndex(e);t?(this._opts.activeIndex=e,this._value=t.value,this._internals.setFormValue(this._value),this._manageRequired()):(this._value="",this._internals.setFormValue(""),this._manageRequired())}get selectedIndex(){return this._opts.selectedIndex}set value(e){this._opts.value=e,this._opts.selectedIndex>-1?this._requestedValueToSetLater="":this._requestedValueToSetLater=e,this._internals.setFormValue(this._value),this._manageRequired()}get value(){return this._opts.value}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}updateInputValue(){if(!this.combobox)return;const e=this.renderRoot.querySelector(".combobox-input");if(e){const t=this._opts.getSelectedOption();e.value=(t==null?void 0:t.label)??""}}constructor(){super(),this.defaultValue="",this.name=void 0,this.required=!1,this._requestedValueToSetLater="",this._opts.multiSelect=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._manageRequired()})}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(e,t){this.updateComplete.then(()=>{this.value=e})}get type(){return"select-one"}get form(){return this._internals.form}async _createAndSelectSuggestedOption(){var o;const e=this._createSuggestedOption();await this.updateComplete,this._opts.selectedIndex=e,this._dispatchChangeEvent();const t=new CustomEvent("vsc-single-select-create-option",{detail:{value:((o=this._opts.getOptionByIndex(e))==null?void 0:o.value)??""}});this.dispatchEvent(t),this.open=!1,this._isPlaceholderOptionActive=!1}_dispatchChangeEvent(){this.dispatchEvent(new CustomEvent("vsc-change",{detail:{selectedIndex:this._opts.selectedIndex,value:this._value}})),super._dispatchChangeEvent()}_setStateFromSlottedElements(){super._setStateFromSlottedElements(),!this.combobox&&this._opts.selectedIndexes.length===0&&(this._opts.selectedIndex=this._opts.options.length>0?0:-1)}_onSlotChange(){if(super._onSlotChange(),this._requestedValueToSetLater){const e=this._opts.getOptionByValue(this._requestedValueToSetLater);e&&(this._opts.selectedIndex=e.index,this._requestedValueToSetLater="")}this._opts.selectedIndex>-1&&this._opts.numOptions>0?(this._internals.setFormValue(this._opts.value),this._manageRequired()):(this._internals.setFormValue(null),this._manageRequired())}_onEnterKeyDown(e){super._onEnterKeyDown(e);let t=!1;this.combobox?this.open?this._isPlaceholderOptionActive?this._createAndSelectSuggestedOption():(t=this._opts.activeIndex!==this._opts.selectedIndex,this._opts.selectedIndex=this._opts.activeIndex,this.open=!1):(this.open=!0,this._scrollActiveElementToTop()):this.open?(t=this._opts.activeIndex!==this._opts.selectedIndex,this._opts.selectedIndex=this._opts.activeIndex,this.open=!1):(this.open=!0,this._scrollActiveElementToTop()),t&&(this._dispatchChangeEvent(),this.updateInputValue(),this._internals.setFormValue(this._opts.value),this._manageRequired())}_onOptionClick(e){super._onOptionClick(e);const o=e.composedPath().find(s=>{const r=s;if("matches"in r)return r.matches("li.option")});if(!o||o.matches(".disabled"))return;o.classList.contains("placeholder")?this.creatable&&this._createAndSelectSuggestedOption():(this._opts.selectedIndex=Number(o.dataset.index),this.open=!1,this._internals.setFormValue(this._value),this._manageRequired(),this._dispatchChangeEvent())}_manageRequired(){const{value:e}=this;e===""&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._face):this._internals.setValidity({})}_renderSelectFace(){const e=this._opts.getSelectedOption(),t=(e==null?void 0:e.label)??"",o=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"";return d`
      <div
        aria-activedescendant=${o}
        aria-controls="select-listbox"
        aria-expanded=${this.open?"true":"false"}
        aria-haspopup="listbox"
        aria-label=${y(this.label)}
        class="select-face face"
        @click=${this._onFaceClick}
        role="combobox"
        tabindex="0"
      >
        <span class="text">${t}</span> ${rt}
      </div>
    `}_renderComboboxFace(){let e="";if(this._isBeingFiltered)e=this._opts.filterPattern;else{const i=this._opts.getSelectedOption();e=(i==null?void 0:i.label)??""}const t=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",o=this.open?"true":"false";return d`
      <div class="combobox-face face">
        <input
          aria-activedescendant=${t}
          aria-autocomplete="list"
          aria-controls="select-listbox"
          aria-expanded=${o}
          aria-haspopup="listbox"
          aria-label=${y(this.label)}
          class="combobox-input"
          role="combobox"
          spellcheck="false"
          type="text"
          autocomplete="off"
          .value=${e}
          @focus=${this._onComboboxInputFocus}
          @blur=${this._onComboboxInputBlur}
          @input=${this._onComboboxInputInput}
          @click=${this._onComboboxInputClick}
          @keydown=${this._onComboboxInputSpaceKeyDown}
        >
        <button
          aria-label="Open the list of options"
          class="combobox-button"
          type="button"
          @click=${this._onComboboxButtonClick}
          @keydown=${this._onComboboxButtonKeyDown}
          tabindex="-1"
        >
          ${rt}
        </button>
      </div>
    `}render(){return d`
      <div class="single-select">
        <slot class="main-slot" @slotchange=${this._onSlotChange}></slot>
        ${this.combobox?this._renderComboboxFace():this._renderSelectFace()}
        ${this._renderDropdown()}
      </div>
    `}};Z.styles=Io;Z.shadowRootOptions={...K.shadowRootOptions,delegatesFocus:!0};Z.formAssociated=!0;we([a({attribute:"default-value"})],Z.prototype,"defaultValue",void 0);we([a({reflect:!0})],Z.prototype,"name",void 0);we([a({type:Number,attribute:"selected-index"})],Z.prototype,"selectedIndex",null);we([a({type:String})],Z.prototype,"value",null);we([a({type:Boolean,reflect:!0})],Z.prototype,"required",void 0);we([H(".face")],Z.prototype,"_face",void 0);Z=we([_("vscode-single-select")],Z);const Js=[g,b`
    :host {
      --separator-border: var(--vscode-editorWidget-border, #454545);

      border: 1px solid var(--vscode-editorWidget-border, #454545);
      display: block;
      overflow: hidden;
      position: relative;
    }

    ::slotted(*) {
      height: 100%;
      width: 100%;
    }

    ::slotted(vscode-split-layout) {
      border: 0;
    }

    .wrapper {
      display: flex;
      height: 100%;
      width: 100%;
    }

    .wrapper.horizontal {
      flex-direction: column;
    }

    .start {
      box-sizing: border-box;
      flex: 1;
      min-height: 0;
      min-width: 0;
    }

    :host([split='vertical']) .start {
      border-right: 1px solid var(--separator-border);
    }

    :host([split='horizontal']) .start {
      border-bottom: 1px solid var(--separator-border);
    }

    .end {
      flex: 1;
      min-height: 0;
      min-width: 0;
    }

    :host([split='vertical']) .start,
    :host([split='vertical']) .end {
      height: 100%;
    }

    :host([split='horizontal']) .start,
    :host([split='horizontal']) .end {
      width: 100%;
    }

    .handle-overlay {
      display: none;
      height: 100%;
      left: 0;
      position: absolute;
      top: 0;
      width: 100%;
      z-index: 1;
    }

    .handle-overlay.active {
      display: block;
    }

    .handle-overlay.split-vertical {
      cursor: ew-resize;
    }

    .handle-overlay.split-horizontal {
      cursor: ns-resize;
    }

    .handle {
      background-color: transparent;
      position: absolute;
      z-index: 2;
    }

    .handle.hover {
      transition: background-color 0.1s ease-out 0.3s;
      background-color: var(--vscode-sash-hoverBorder, #0078d4);
    }

    .handle.hide {
      background-color: transparent;
      transition: background-color 0.1s ease-out;
    }

    .handle.split-vertical {
      cursor: ew-resize;
      height: 100%;
    }

    .handle.split-horizontal {
      cursor: ns-resize;
      width: 100%;
    }
  `];var j=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s},It;const to="50%",Qs=4,Je=n=>{if(!n)return{value:0,unit:"pixel"};let e,t;n.endsWith("%")?(e="percent",t=+n.substring(0,n.length-1)):n.endsWith("px")?(e="pixel",t=+n.substring(0,n.length-2)):(e="pixel",t=+n);const o=isNaN(t)?0:t;return{unit:e,value:o}},Qe=(n,e)=>e===0?0:Math.min(100,n/e*100),oo=(n,e)=>e*(n/100);let L=It=class extends x{set split(e){this._split!==e&&(this._split=e,this.resetHandlePosition())}get split(){return this._split}set handlePosition(e){this._rawHandlePosition=e,this._handlePositionPropChanged()}get handlePosition(){return this._rawHandlePosition}set fixedPane(e){this._fixedPane=e,this._fixedPanePropChanged()}get fixedPane(){return this._fixedPane}constructor(){super(),this._split="vertical",this.resetOnDblClick=!1,this.handleSize=4,this.initialHandlePosition=to,this._fixedPane="none",this._handlePosition=0,this._isDragActive=!1,this._hover=!1,this._hide=!1,this._boundRect=new DOMRect,this._handleOffset=0,this._wrapperObserved=!1,this._fixedPaneSize=0,this._handleResize=e=>{const t=e[0].contentRect,{width:o,height:i}=t;this._boundRect=t;const s=this.split==="vertical"?o:i;this.fixedPane==="start"&&(this._handlePosition=this._fixedPaneSize),this.fixedPane==="end"&&(this._handlePosition=s-this._fixedPaneSize)},this._handleMouseUp=e=>{this._isDragActive=!1,e.target!==this&&(this._hover=!1,this._hide=!0),window.removeEventListener("mouseup",this._handleMouseUp),window.removeEventListener("mousemove",this._handleMouseMove);const{width:t,height:o}=this._boundRect,i=this.split==="vertical"?t:o,s=Qe(this._handlePosition,i);this.dispatchEvent(new CustomEvent("vsc-split-layout-change",{detail:{position:this._handlePosition,positionInPercentage:s},composed:!0}))},this._handleMouseMove=e=>{const{clientX:t,clientY:o}=e,{left:i,top:s,height:r,width:l}=this._boundRect,c=this.split==="vertical",h=c?l:r,f=c?t-i:o-s;this._handlePosition=Math.max(0,Math.min(f-this._handleOffset+this.handleSize/2,h)),this.fixedPane==="start"&&(this._fixedPaneSize=this._handlePosition),this.fixedPane==="end"&&(this._fixedPaneSize=h-this._handlePosition)},this._resizeObserver=new ResizeObserver(this._handleResize)}resetHandlePosition(){if(!this._wrapperEl){this._handlePosition=0;return}const{width:e,height:t}=this._wrapperEl.getBoundingClientRect(),o=this.split==="vertical"?e:t,{value:i,unit:s}=Je(this.initialHandlePosition??to);s==="percent"?this._handlePosition=oo(i,o):this._handlePosition=i}connectedCallback(){super.connectedCallback()}firstUpdated(e){this.fixedPane!=="none"&&(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0),this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:t,unit:o}=this.handlePosition?Je(this.handlePosition):Je(this.initialHandlePosition);this._setPosition(t,o),this._initFixedPane()}_handlePositionPropChanged(){if(this.handlePosition&&this._wrapperEl){this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:e,unit:t}=Je(this.handlePosition);this._setPosition(e,t)}}_fixedPanePropChanged(){this._wrapperEl&&this._initFixedPane()}_initFixedPane(){if(this.fixedPane==="none")this._wrapperObserved&&(this._resizeObserver.unobserve(this._wrapperEl),this._wrapperObserved=!1);else{const{width:e,height:t}=this._boundRect,o=this.split==="vertical"?e:t;this._fixedPaneSize=this.fixedPane==="start"?this._handlePosition:o-this._handlePosition,this._wrapperObserved||(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0)}}_setPosition(e,t){const{width:o,height:i}=this._boundRect,s=this.split==="vertical"?o:i;this._handlePosition=t==="percent"?oo(e,s):e}_handleMouseOver(){this._hover=!0,this._hide=!1}_handleMouseOut(e){e.buttons!==1&&(this._hover=!1,this._hide=!0)}_handleMouseDown(e){e.stopPropagation(),e.preventDefault(),this._boundRect=this._wrapperEl.getBoundingClientRect();const{left:t,top:o}=this._boundRect,{left:i,top:s}=this._handleEl.getBoundingClientRect(),r=e.clientX-t,l=e.clientY-o;this.split==="vertical"&&(this._handleOffset=r-(i-t)),this.split==="horizontal"&&(this._handleOffset=l-(s-o)),this._isDragActive=!0,window.addEventListener("mouseup",this._handleMouseUp),window.addEventListener("mousemove",this._handleMouseMove)}_handleDblClick(){this.resetOnDblClick&&this.resetHandlePosition()}_handleSlotChange(){[...this._nestedLayoutsAtStart,...this._nestedLayoutsAtEnd].forEach(t=>{t instanceof It&&t.resetHandlePosition()})}render(){const{width:e,height:t}=this._boundRect,o=this.split==="vertical"?e:t,i=this.fixedPane!=="none"?`${this._handlePosition}px`:`${Qe(this._handlePosition,o)}%`;let s="";this.fixedPane==="start"?s=`0 0 ${this._fixedPaneSize}px`:s=`1 1 ${Qe(this._handlePosition,o)}%`;let r="";this.fixedPane==="end"?r=`0 0 ${this._fixedPaneSize}px`:r=`1 1 ${Qe(o-this._handlePosition,o)}%`;const l={left:this.split==="vertical"?i:"0",top:this.split==="vertical"?"0":i},c=this.handleSize??Qs;this.split==="vertical"&&(l.marginLeft=`${0-c/2}px`,l.width=`${c}px`),this.split==="horizontal"&&(l.height=`${c}px`,l.marginTop=`${0-c/2}px`);const h=$({"handle-overlay":!0,active:this._isDragActive,"split-vertical":this.split==="vertical","split-horizontal":this.split==="horizontal"}),f=$({handle:!0,hover:this._hover,hide:this._hide,"split-vertical":this.split==="vertical","split-horizontal":this.split==="horizontal"}),u={wrapper:!0,horizontal:this.split==="horizontal"};return d`
      <div class=${$(u)}>
        <div class="start" .style=${F({flex:s})}>
          <slot name="start" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class="end" .style=${F({flex:r})}>
          <slot name="end" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class=${h}></div>
        <div
          class=${f}
          .style=${F(l)}
          @mouseover=${this._handleMouseOver}
          @mouseout=${this._handleMouseOut}
          @mousedown=${this._handleMouseDown}
          @dblclick=${this._handleDblClick}
        ></div>
      </div>
    `}};L.styles=Js;j([a({reflect:!0})],L.prototype,"split",null);j([a({type:Boolean,reflect:!0,attribute:"reset-on-dbl-click"})],L.prototype,"resetOnDblClick",void 0);j([a({type:Number,reflect:!0,attribute:"handle-size"})],L.prototype,"handleSize",void 0);j([a({reflect:!0,attribute:"initial-handle-position"})],L.prototype,"initialHandlePosition",void 0);j([a({attribute:"handle-position"})],L.prototype,"handlePosition",null);j([a({attribute:"fixed-pane"})],L.prototype,"fixedPane",null);j([v()],L.prototype,"_handlePosition",void 0);j([v()],L.prototype,"_isDragActive",void 0);j([v()],L.prototype,"_hover",void 0);j([v()],L.prototype,"_hide",void 0);j([H(".wrapper")],L.prototype,"_wrapperEl",void 0);j([H(".handle")],L.prototype,"_handleEl",void 0);j([J({slot:"start",selector:"vscode-split-layout"})],L.prototype,"_nestedLayoutsAtStart",void 0);j([J({slot:"end",selector:"vscode-split-layout"})],L.prototype,"_nestedLayoutsAtEnd",void 0);L=It=j([_("vscode-split-layout")],L);const ei=[g,b`
    :host {
      border-bottom: 1px solid transparent;
      cursor: pointer;
      display: block;
      margin-bottom: -1px;
      overflow: hidden;
      padding: 7px 8px;
      text-overflow: ellipsis;
      user-select: none;
      white-space: nowrap;
    }

    :host([active]) {
      border-bottom-color: var(--vscode-panelTitle-activeForeground);
      color: var(--vscode-panelTitle-activeForeground);
    }

    :host([panel]) {
      border-bottom: 0;
      margin-bottom: 0;
      padding: 0;
    }

    :host(:focus-visible) {
      outline: none;
    }

    .wrapper {
      align-items: center;
      color: var(--vscode-foreground);
      display: flex;
      min-height: 20px;
      overflow: inherit;
      text-overflow: inherit;
      position: relative;
    }

    .wrapper.panel {
      color: var(--vscode-panelTitle-inactiveForeground);
    }

    .wrapper.panel.active,
    .wrapper.panel:hover {
      color: var(--vscode-panelTitle-activeForeground);
    }

    :host([panel]) .wrapper {
      display: flex;
      font-size: 11px;
      height: 31px;
      padding: 2px 10px;
      text-transform: uppercase;
    }

    .main {
      overflow: inherit;
      text-overflow: inherit;
    }

    .active-indicator {
      display: none;
    }

    .active-indicator.panel.active {
      border-top: 1px solid var(--vscode-panelTitle-activeBorder);
      bottom: 4px;
      display: block;
      left: 8px;
      pointer-events: none;
      position: absolute;
      right: 8px;
    }

    :host(:focus-visible) .wrapper {
      outline-color: var(--vscode-focusBorder);
      outline-offset: 3px;
      outline-style: solid;
      outline-width: 1px;
    }

    :host(:focus-visible) .wrapper.panel {
      outline-offset: -2px;
    }

    slot[name='content-before']::slotted(vscode-badge) {
      margin-right: 8px;
    }

    slot[name='content-after']::slotted(vscode-badge) {
      margin-left: 8px;
    }
  `];var ze=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let G=class extends x{constructor(){super(...arguments),this.active=!1,this.ariaControls="",this.panel=!1,this.role="tab",this.tabId=-1}attributeChangedCallback(e,t,o){if(super.attributeChangedCallback(e,t,o),e==="active"){const i=o!==null;this.ariaSelected=i?"true":"false",this.tabIndex=i?0:-1}}render(){return d`
      <div
        class=${$({wrapper:!0,active:this.active,panel:this.panel})}
      >
        <div class="before"><slot name="content-before"></slot></div>
        <div class="main"><slot></slot></div>
        <div class="after"><slot name="content-after"></slot></div>
        <span
          class=${$({"active-indicator":!0,active:this.active,panel:this.panel})}
        ></span>
      </div>
    `}};G.styles=ei;ze([a({type:Boolean,reflect:!0})],G.prototype,"active",void 0);ze([a({reflect:!0,attribute:"aria-controls"})],G.prototype,"ariaControls",void 0);ze([a({type:Boolean,reflect:!0})],G.prototype,"panel",void 0);ze([a({reflect:!0})],G.prototype,"role",void 0);ze([a({type:Number,reflect:!0,attribute:"tab-id"})],G.prototype,"tabId",void 0);G=ze([_("vscode-tab-header")],G);const ti=[g,b`
    :host {
      display: block;
      overflow: hidden;
    }

    :host(:focus-visible) {
      outline-color: var(--vscode-focusBorder);
      outline-offset: 3px;
      outline-style: solid;
      outline-width: 1px;
    }

    :host([panel]) {
      background-color: var(--vscode-panel-background);
    }
  `];var Te=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let se=class extends x{constructor(){super(...arguments),this.hidden=!1,this.ariaLabelledby="",this.panel=!1,this.role="tabpanel",this.tabIndex=0}render(){return d` <slot></slot> `}};se.styles=ti;Te([a({type:Boolean,reflect:!0})],se.prototype,"hidden",void 0);Te([a({reflect:!0,attribute:"aria-labelledby"})],se.prototype,"ariaLabelledby",void 0);Te([a({type:Boolean,reflect:!0})],se.prototype,"panel",void 0);Te([a({reflect:!0})],se.prototype,"role",void 0);Te([a({type:Number,reflect:!0})],se.prototype,"tabIndex",void 0);se=Te([_("vscode-tab-panel")],se);const oi=[g,b`
    :host {
      display: table;
      table-layout: fixed;
      width: 100%;
    }

    ::slotted(vscode-table-row:nth-child(even)) {
      background-color: var(--vsc-row-even-background);
    }

    ::slotted(vscode-table-row:nth-child(odd)) {
      background-color: var(--vsc-row-odd-background);
    }
  `];var So=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let lt=class extends x{constructor(){super(...arguments),this.role="rowgroup"}render(){return d` <slot></slot> `}};lt.styles=oi;So([a({reflect:!0})],lt.prototype,"role",void 0);lt=So([_("vscode-table-body")],lt);const si=[g,b`
    :host {
      border-bottom-color: var(--vscode-editorGroup-border);
      border-bottom-style: solid;
      border-bottom-width: var(--vsc-row-border-bottom-width);
      box-sizing: border-box;
      color: var(--vscode-foreground);
      display: table-cell;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      height: 24px;
      overflow: hidden;
      padding-left: 10px;
      text-overflow: ellipsis;
      vertical-align: middle;
      white-space: nowrap;
    }

    :host([compact]) {
      display: block;
      height: auto;
      padding-bottom: 5px;
      width: 100% !important;
    }

    :host([compact]:first-child) {
      padding-top: 10px;
    }

    :host([compact]:last-child) {
      padding-bottom: 10px;
    }

    .wrapper {
      overflow: inherit;
      text-overflow: inherit;
      white-space: inherit;
      width: 100%;
    }

    .column-label {
      font-weight: bold;
    }
  `];var bt=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let Pe=class extends x{constructor(){super(...arguments),this.role="cell",this.columnLabel="",this.compact=!1}render(){const e=this.columnLabel?d`<div class="column-label" role="presentation">
          ${this.columnLabel}
        </div>`:p;return d`
      <div class="wrapper">
        ${e}
        <slot></slot>
      </div>
    `}};Pe.styles=si;bt([a({reflect:!0})],Pe.prototype,"role",void 0);bt([a({attribute:"column-label"})],Pe.prototype,"columnLabel",void 0);bt([a({type:Boolean,reflect:!0})],Pe.prototype,"compact",void 0);Pe=bt([_("vscode-table-cell")],Pe);const ii=[g,b`
    :host {
      background-color: var(--vscode-keybindingTable-headerBackground);
      display: table;
      table-layout: fixed;
      width: 100%;
    }
  `];var Eo=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let at=class extends x{constructor(){super(...arguments),this.role="rowgroup"}render(){return d` <slot></slot> `}};at.styles=ii;Eo([a({reflect:!0})],at.prototype,"role",void 0);at=Eo([_("vscode-table-header")],at);const ni=[g,b`
    :host {
      box-sizing: border-box;
      color: var(--vscode-foreground);
      display: table-cell;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: bold;
      line-height: 20px;
      overflow: hidden;
      padding-bottom: 5px;
      padding-left: 10px;
      padding-right: 0;
      padding-top: 5px;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .wrapper {
      box-sizing: inherit;
      overflow: inherit;
      text-overflow: inherit;
      white-space: inherit;
      width: 100%;
    }
  `];var Oo=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let ct=class extends x{constructor(){super(...arguments),this.role="columnheader"}render(){return d`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};ct.styles=ni;Oo([a({reflect:!0})],ct.prototype,"role",void 0);ct=Oo([_("vscode-table-header-cell")],ct);const ri=[g,b`
    :host {
      border-top-color: var(--vscode-editorGroup-border);
      border-top-style: solid;
      border-top-width: var(--vsc-row-border-top-width);
      display: var(--vsc-row-display);
      width: 100%;
    }
  `];var Po=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let dt=class extends x{constructor(){super(...arguments),this.role="row"}render(){return d` <slot></slot> `}};dt.styles=ri;Po([a({reflect:!0})],dt.prototype,"role",void 0);dt=Po([_("vscode-table-row")],dt);const so=(n,e)=>typeof n=="number"&&!Number.isNaN(n)?n/e*100:typeof n=="string"&&/^[0-9.]+$/.test(n)?Number(n)/e*100:typeof n=="string"&&/^[0-9.]+%$/.test(n)?Number(n.substring(0,n.length-1)):typeof n=="string"&&/^[0-9.]+px$/.test(n)?Number(n.substring(0,n.length-2))/e*100:null,li=[g,b`
    :host {
      display: block;
      --vsc-row-even-background: transparent;
      --vsc-row-odd-background: transparent;
      --vsc-row-border-bottom-width: 0;
      --vsc-row-border-top-width: 0;
      --vsc-row-display: table-row;
    }

    :host([bordered]),
    :host([bordered-rows]) {
      --vsc-row-border-bottom-width: 1px;
    }

    :host([compact]) {
      --vsc-row-display: block;
    }

    :host([bordered][compact]),
    :host([bordered-rows][compact]) {
      --vsc-row-border-bottom-width: 0;
      --vsc-row-border-top-width: 1px;
    }

    :host([zebra]) {
      --vsc-row-even-background: var(--vscode-keybindingTable-rowsBackground);
    }

    :host([zebra-odd]) {
      --vsc-row-odd-background: var(--vscode-keybindingTable-rowsBackground);
    }

    ::slotted(vscode-table-row) {
      width: 100%;
    }

    .wrapper {
      height: 100%;
      max-width: 100%;
      overflow: hidden;
      position: relative;
      width: 100%;
    }

    .wrapper.select-disabled {
      user-select: none;
    }

    .wrapper.resize-cursor {
      cursor: ew-resize;
    }

    .wrapper.compact-view .header-slot-wrapper {
      height: 0;
      overflow: hidden;
    }

    .scrollable {
      height: 100%;
    }

    .scrollable:before {
      background-color: transparent;
      content: '';
      display: block;
      height: 1px;
      position: absolute;
      width: 100%;
    }

    .wrapper:not(.compact-view) .scrollable:not([scrolled]):before {
      background-color: var(--vscode-editorGroup-border);
    }

    .sash {
      visibility: hidden;
    }

    :host([bordered-columns]) .sash,
    :host([bordered]) .sash {
      visibility: visible;
    }

    :host([resizable]) .wrapper:hover .sash {
      visibility: visible;
    }

    .sash {
      height: 100%;
      position: absolute;
      top: 0;
      width: 1px;
    }

    .wrapper.compact-view .sash {
      display: none;
    }

    .sash.resizable {
      cursor: ew-resize;
    }

    .sash-visible {
      background-color: var(--vscode-editorGroup-border);
      height: 100%;
      position: absolute;
      top: 30px;
      width: 1px;
    }

    .sash.hover .sash-visible {
      background-color: var(--vscode-sash-hoverBorder);
      transition: background-color 50ms linear 300ms;
    }

    .sash .sash-clickable {
      background-color: transparent;
      height: 100%;
      left: -2px;
      position: absolute;
      width: 5px;
    }
  `];var O=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};const io=100;let I=class extends x{constructor(){super(...arguments),this.role="table",this.resizable=!1,this.responsive=!1,this.bordered=!1,this.borderedColumns=!1,this.borderedRows=!1,this.breakpoint=300,this.minColumnWidth="50px",this.delayedResizing=!1,this.compact=!1,this.zebra=!1,this.zebraOdd=!1,this._sashPositions=[],this._isDragging=!1,this._sashHovers=[],this._columns=[],this._activeSashElementIndex=-1,this._activeSashCursorOffset=0,this._componentX=0,this._componentH=0,this._componentW=0,this._headerCells=[],this._cellsOfFirstRow=[],this._prevHeaderHeight=0,this._prevComponentHeight=0,this._componentResizeObserverCallback=()=>{this._memoizeComponentDimensions(),this._updateResizeHandlersSize(),this.responsive&&this._toggleCompactView(),this._resizeTableBody()},this._headerResizeObserverCallback=()=>{this._updateResizeHandlersSize()},this._bodyResizeObserverCallback=()=>{this._resizeTableBody()},this._onResizingMouseMove=e=>{e.stopPropagation(),this._updateActiveSashPosition(e.pageX),this.delayedResizing?this._resizeColumns(!1):this._resizeColumns(!0)},this._onResizingMouseUp=e=>{this._resizeColumns(!0),this._updateActiveSashPosition(e.pageX),this._sashHovers[this._activeSashElementIndex]=!1,this._isDragging=!1,this._activeSashElementIndex=-1,document.removeEventListener("mousemove",this._onResizingMouseMove),document.removeEventListener("mouseup",this._onResizingMouseUp)}}set columns(e){this._columns=e,this.isConnected&&this._initDefaultColumnSizes()}get columns(){return this._columns}connectedCallback(){super.connectedCallback(),this._memoizeComponentDimensions(),this._initDefaultColumnSizes()}disconnectedCallback(){var e,t,o;super.disconnectedCallback(),(e=this._componentResizeObserver)==null||e.unobserve(this),(t=this._componentResizeObserver)==null||t.disconnect(),(o=this._bodyResizeObserver)==null||o.disconnect()}_px2Percent(e){return e/this._componentW*100}_percent2Px(e){return this._componentW*e/100}_memoizeComponentDimensions(){const e=this.getBoundingClientRect();this._componentH=e.height,this._componentW=e.width,this._componentX=e.x}_queryHeaderCells(){const e=this._assignedHeaderElements;return e&&e[0]?Array.from(e[0].querySelectorAll("vscode-table-header-cell")):[]}_getHeaderCells(){return this._headerCells.length||(this._headerCells=this._queryHeaderCells()),this._headerCells}_queryCellsOfFirstRow(){const e=this._assignedBodyElements;return e&&e[0]?Array.from(e[0].querySelectorAll("vscode-table-row:first-child vscode-table-cell")):[]}_getCellsOfFirstRow(){return this._cellsOfFirstRow.length||(this._cellsOfFirstRow=this._queryCellsOfFirstRow()),this._cellsOfFirstRow}_resizeTableBody(){let e=0,t=0;const o=this.getBoundingClientRect().height;this._assignedHeaderElements&&this._assignedHeaderElements.length&&(e=this._assignedHeaderElements[0].getBoundingClientRect().height),this._assignedBodyElements&&this._assignedBodyElements.length&&(t=this._assignedBodyElements[0].getBoundingClientRect().height);const i=t-e-o;this._scrollableElement.style.height=i>0?`${o-e}px`:"auto"}_initResizeObserver(){this._componentResizeObserver=new ResizeObserver(this._componentResizeObserverCallback),this._componentResizeObserver.observe(this),this._headerResizeObserver=new ResizeObserver(this._headerResizeObserverCallback),this._headerResizeObserver.observe(this._headerElement)}_calcColWidthPercentages(){const e=this._getHeaderCells().length;let t=this.columns.slice(0,e);const o=t.filter(s=>s==="auto").length+e-t.length;let i=100;if(t=t.map(s=>{const r=so(s,this._componentW);return r===null?"auto":(i-=r,r)}),t.length<e)for(let s=t.length;s<e;s++)t.push("auto");return t=t.map(s=>s==="auto"?i/o:s),t}_initHeaderCellSizes(e){this._getHeaderCells().forEach((t,o)=>{t.style.width=`${e[o]}%`})}_initBodyColumnSizes(e){this._getCellsOfFirstRow().forEach((t,o)=>{t.style.width=`${e[o]}%`})}_initSashes(e){const t=e.length;let o=0;this._sashPositions=[],e.forEach((i,s)=>{if(s<t-1){const r=o+i;this._sashPositions.push(r),o=r}})}_initDefaultColumnSizes(){const e=this._calcColWidthPercentages();this._initHeaderCellSizes(e),this._initBodyColumnSizes(e),this._initSashes(e)}_updateResizeHandlersSize(){const e=this._headerElement.getBoundingClientRect();if(e.height===this._prevHeaderHeight&&this._componentH===this._prevComponentHeight)return;this._prevHeaderHeight=e.height,this._prevComponentHeight=this._componentH;const t=this._componentH-e.height;this._sashVisibleElements.forEach(o=>{o.style.height=`${t}px`,o.style.top=`${e.height}px`})}_applyCompactViewColumnLabels(){const t=this._getHeaderCells().map(i=>i.innerText);this.querySelectorAll("vscode-table-row").forEach(i=>{i.querySelectorAll("vscode-table-cell").forEach((r,l)=>{r.columnLabel=t[l],r.compact=!0})})}_clearCompactViewColumnLabels(){this.querySelectorAll("vscode-table-cell").forEach(e=>{e.columnLabel="",e.compact=!1})}_toggleCompactView(){const t=this.getBoundingClientRect().width<this.breakpoint;this.compact!==t&&(this.compact=t,t?this._applyCompactViewColumnLabels():this._clearCompactViewColumnLabels())}_onDefaultSlotChange(){this._assignedElements.forEach(e=>{if(e.tagName.toLowerCase()==="vscode-table-header"){e.slot="header";return}if(e.tagName.toLowerCase()==="vscode-table-body"){e.slot="body";return}})}_onHeaderSlotChange(){this._headerCells=this._queryHeaderCells()}_onBodySlotChange(){if(this._initDefaultColumnSizes(),this._initResizeObserver(),this._updateResizeHandlersSize(),!this._bodyResizeObserver){const e=this._assignedBodyElements[0]??null;e&&(this._bodyResizeObserver=new ResizeObserver(this._bodyResizeObserverCallback),this._bodyResizeObserver.observe(e))}}_onSashMouseOver(e){if(this._isDragging)return;const t=e.currentTarget,o=Number(t.dataset.index);this._sashHovers[o]=!0,this.requestUpdate()}_onSashMouseOut(e){if(e.stopPropagation(),this._isDragging)return;const t=e.currentTarget,o=Number(t.dataset.index);this._sashHovers[o]=!1,this.requestUpdate()}_onSashMouseDown(e){e.stopPropagation();const{pageX:t,currentTarget:o}=e,i=o,s=Number(i.dataset.index),l=i.getBoundingClientRect().x;this._isDragging=!0,this._activeSashElementIndex=s,this._sashHovers[this._activeSashElementIndex]=!0,this._activeSashCursorOffset=this._px2Percent(t-l);const c=this._getHeaderCells();this._headerCellsToResize=[],this._headerCellsToResize.push(c[s]),c[s+1]&&(this._headerCellsToResize[1]=c[s+1]);const f=this._bodySlot.assignedElements()[0].querySelectorAll("vscode-table-row:first-child > vscode-table-cell");this._cellsToResize=[],this._cellsToResize.push(f[s]),f[s+1]&&this._cellsToResize.push(f[s+1]),document.addEventListener("mousemove",this._onResizingMouseMove),document.addEventListener("mouseup",this._onResizingMouseUp)}_updateActiveSashPosition(e){const{prevSashPos:t,nextSashPos:o}=this._getSashPositions();let i=so(this.minColumnWidth,this._componentW);i===null&&(i=0);const s=t?t+i:i,r=o?o-i:io-i;let l=this._px2Percent(e-this._componentX-this._percent2Px(this._activeSashCursorOffset));l=Math.max(l,s),l=Math.min(l,r),this._sashPositions[this._activeSashElementIndex]=l,this.requestUpdate()}_getSashPositions(){const e=this._sashPositions[this._activeSashElementIndex],t=this._sashPositions[this._activeSashElementIndex-1]||0,o=this._sashPositions[this._activeSashElementIndex+1]||io;return{sashPos:e,prevSashPos:t,nextSashPos:o}}_resizeColumns(e=!0){const{sashPos:t,prevSashPos:o,nextSashPos:i}=this._getSashPositions(),s=t-o,r=i-t,l=`${s}%`,c=`${r}%`;this._headerCellsToResize[0].style.width=l,this._headerCellsToResize[1]&&(this._headerCellsToResize[1].style.width=c),e&&(this._cellsToResize[0].style.width=l,this._cellsToResize[1]&&(this._cellsToResize[1].style.width=c))}render(){const e=this._sashPositions.map((o,i)=>{const s=$({sash:!0,hover:this._sashHovers[i],resizable:this.resizable}),r=`${o}%`;return this.resizable?d`
            <div
              class=${s}
              data-index=${i}
              .style=${F({left:r})}
              @mousedown=${this._onSashMouseDown}
              @mouseover=${this._onSashMouseOver}
              @mouseout=${this._onSashMouseOut}
            >
              <div class="sash-visible"></div>
              <div class="sash-clickable"></div>
            </div>
          `:d`<div
            class=${s}
            data-index=${i}
            .style=${F({left:r})}
          >
            <div class="sash-visible"></div>
          </div>`}),t=$({wrapper:!0,"select-disabled":this._isDragging,"resize-cursor":this._isDragging,"compact-view":this.compact});return d`
      <div class=${t}>
        <div class="header">
          <slot name="caption"></slot>
          <div class="header-slot-wrapper">
            <slot name="header" @slotchange=${this._onHeaderSlotChange}></slot>
          </div>
        </div>
        <vscode-scrollable class="scrollable">
          <div>
            <slot name="body" @slotchange=${this._onBodySlotChange}></slot>
          </div>
        </vscode-scrollable>
        ${e}
        <slot @slotchange=${this._onDefaultSlotChange}></slot>
      </div>
    `}};I.styles=li;O([a({reflect:!0})],I.prototype,"role",void 0);O([a({type:Boolean,reflect:!0})],I.prototype,"resizable",void 0);O([a({type:Boolean,reflect:!0})],I.prototype,"responsive",void 0);O([a({type:Boolean,reflect:!0})],I.prototype,"bordered",void 0);O([a({type:Boolean,reflect:!0,attribute:"bordered-columns"})],I.prototype,"borderedColumns",void 0);O([a({type:Boolean,reflect:!0,attribute:"bordered-rows"})],I.prototype,"borderedRows",void 0);O([a({type:Number})],I.prototype,"breakpoint",void 0);O([a({type:Array})],I.prototype,"columns",null);O([a({attribute:"min-column-width"})],I.prototype,"minColumnWidth",void 0);O([a({type:Boolean,reflect:!0,attribute:"delayed-resizing"})],I.prototype,"delayedResizing",void 0);O([a({type:Boolean,reflect:!0})],I.prototype,"compact",void 0);O([a({type:Boolean,reflect:!0})],I.prototype,"zebra",void 0);O([a({type:Boolean,reflect:!0,attribute:"zebra-odd"})],I.prototype,"zebraOdd",void 0);O([H('slot[name="body"]')],I.prototype,"_bodySlot",void 0);O([H(".header")],I.prototype,"_headerElement",void 0);O([H(".scrollable")],I.prototype,"_scrollableElement",void 0);O([cs(".sash-visible")],I.prototype,"_sashVisibleElements",void 0);O([J({flatten:!0,selector:"vscode-table-header, vscode-table-body"})],I.prototype,"_assignedElements",void 0);O([J({slot:"header",flatten:!0,selector:"vscode-table-header"})],I.prototype,"_assignedHeaderElements",void 0);O([J({slot:"body",flatten:!0,selector:"vscode-table-body"})],I.prototype,"_assignedBodyElements",void 0);O([v()],I.prototype,"_sashPositions",void 0);O([v()],I.prototype,"_isDragging",void 0);I=O([_("vscode-table")],I);const ai=[g,b`
    :host {
      display: block;
    }

    .header {
      align-items: center;
      display: flex;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
      width: 100%;
    }

    .header {
      border-bottom-color: var(--vscode-settings-headerBorder);
      border-bottom-style: solid;
      border-bottom-width: 1px;
    }

    .header.panel {
      background-color: var(--vscode-panel-background);
      border-bottom-width: 0;
      box-sizing: border-box;
      padding-left: 8px;
      padding-right: 8px;
    }

    slot[name='addons'] {
      display: block;
      margin-left: auto;
    }
  `];var Le=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let de=class extends x{constructor(){super(),this.panel=!1,this.role="tablist",this.selectedIndex=0,this._tabHeaders=[],this._tabPanels=[],this._componentId="",this._tabFocus=0,this._componentId=xo()}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o),e==="selected-index"&&this._setActiveTab(),e==="panel"&&(this._tabHeaders.forEach(i=>i.panel=o!==null),this._tabPanels.forEach(i=>i.panel=o!==null))}_dispatchSelectEvent(){this.dispatchEvent(new CustomEvent("vsc-select",{detail:{selectedIndex:this.selectedIndex},composed:!0})),this.dispatchEvent(new CustomEvent("vsc-tabs-select",{detail:{selectedIndex:this.selectedIndex},composed:!0}))}_setActiveTab(){this._tabFocus=this.selectedIndex,this._tabPanels.forEach((e,t)=>{e.hidden=t!==this.selectedIndex}),this._tabHeaders.forEach((e,t)=>{e.active=t===this.selectedIndex})}_focusPrevTab(){this._tabFocus===0?this._tabFocus=this._tabHeaders.length-1:this._tabFocus-=1}_focusNextTab(){this._tabFocus===this._tabHeaders.length-1?this._tabFocus=0:this._tabFocus+=1}_onHeaderKeyDown(e){(e.key==="ArrowLeft"||e.key==="ArrowRight")&&(e.preventDefault(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","-1"),e.key==="ArrowLeft"?this._focusPrevTab():e.key==="ArrowRight"&&this._focusNextTab(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","0"),this._tabHeaders[this._tabFocus].focus()),e.key==="Enter"&&(e.preventDefault(),this.selectedIndex=this._tabFocus,this._dispatchSelectEvent())}_moveHeadersToHeaderSlot(){const e=this._mainSlotElements.filter(t=>t instanceof G);e.length>0&&e.forEach(t=>t.setAttribute("slot","header"))}_onMainSlotChange(){this._moveHeadersToHeaderSlot(),this._tabPanels=this._mainSlotElements.filter(e=>e instanceof se),this._tabPanels.forEach((e,t)=>{e.ariaLabelledby=`t${this._componentId}-h${t}`,e.id=`t${this._componentId}-p${t}`,e.panel=this.panel}),this._setActiveTab()}_onHeaderSlotChange(){this._tabHeaders=this._headerSlotElements.filter(e=>e instanceof G),this._tabHeaders.forEach((e,t)=>{e.tabId=t,e.id=`t${this._componentId}-h${t}`,e.ariaControls=`t${this._componentId}-p${t}`,e.panel=this.panel,e.active=t===this.selectedIndex})}_onHeaderClick(e){const o=e.composedPath().find(i=>i instanceof G);o&&(this.selectedIndex=o.tabId,this._setActiveTab(),this._dispatchSelectEvent())}render(){return d`
      <div
        class=${$({header:!0,panel:this.panel})}
        @click=${this._onHeaderClick}
        @keydown=${this._onHeaderKeyDown}
      >
        <slot name="header" @slotchange=${this._onHeaderSlotChange}></slot>
        <slot name="addons"></slot>
      </div>
      <slot @slotchange=${this._onMainSlotChange}></slot>
    `}};de.styles=ai;Le([a({type:Boolean,reflect:!0})],de.prototype,"panel",void 0);Le([a({reflect:!0})],de.prototype,"role",void 0);Le([a({type:Number,reflect:!0,attribute:"selected-index"})],de.prototype,"selectedIndex",void 0);Le([J({slot:"header"})],de.prototype,"_headerSlotElements",void 0);Le([J()],de.prototype,"_mainSlotElements",void 0);de=Le([_("vscode-tabs")],de);const ci=[g,b`
    :host {
      display: inline-block;
      height: 40px;
      position: relative;
      width: 320px;
    }

    :host([cols]) {
      width: auto;
    }

    :host([rows]) {
      height: auto;
    }

    .shadow {
      box-shadow: var(--vscode-scrollbar-shadow, #000000) 0 6px 6px -6px inset;
      display: none;
      inset: 0 0 auto 0;
      height: 6px;
      pointer-events: none;
      position: absolute;
      width: 100%;
    }

    .shadow.visible {
      display: block;
    }

    textarea {
      background-color: var(--vscode-settings-textInputBackground, #313131);
      border-color: var(--vscode-settings-textInputBorder, transparent);
      border-radius: 2px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-settings-textInputForeground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      height: 100%;
      width: 100%;
    }

    :host([cols]) textarea {
      width: auto;
    }

    :host([rows]) textarea {
      height: auto;
    }

    :host([invalid]) textarea,
    :host(:invalid) textarea {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    textarea.monospace {
      background-color: var(--vscode-editor-background, #1f1f1f);
      color: var(--vscode-editor-foreground, #cccccc);
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: var(--vscode-editor-font-size, 14px);
      font-weight: var(--vscode-editor-font-weight, normal);
    }

    .textarea.monospace::placeholder {
      color: var(
        --vscode-editor-inlineValuesForeground,
        rgba(255, 255, 255, 0.5)
      );
    }

    textarea.cursor-pointer {
      cursor: pointer;
    }

    textarea:focus {
      border-color: var(--vscode-focusBorder, #0078d4);
      outline: none;
    }

    textarea::placeholder {
      color: var(--vscode-input-placeholderForeground, #989898);
      opacity: 1;
    }

    textarea::-webkit-scrollbar-track {
      background-color: transparent;
    }

    textarea::-webkit-scrollbar {
      width: 14px;
    }

    textarea::-webkit-scrollbar-thumb {
      background-color: transparent;
    }

    textarea:hover::-webkit-scrollbar-thumb {
      background-color: var(
        --vscode-scrollbarSlider-background,
        rgba(121, 121, 121, 0.4)
      );
    }

    textarea::-webkit-scrollbar-thumb:hover {
      background-color: var(
        --vscode-scrollbarSlider-hoverBackground,
        rgba(100, 100, 100, 0.7)
      );
    }

    textarea::-webkit-scrollbar-thumb:active {
      background-color: var(
        --vscode-scrollbarSlider-activeBackground,
        rgba(191, 191, 191, 0.4)
      );
    }

    textarea::-webkit-scrollbar-corner {
      background-color: transparent;
    }

    textarea::-webkit-resizer {
      background-image: url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAcAAAAHCAYAAADEUlfTAAAAAXNSR0IB2cksfwAAAAlwSFlzAAALEwAACxMBAJqcGAAAACJJREFUeJxjYMAOZuIQZ5j5//9/rJJESczEKYGsG6cEXgAAsEEefMxkua4AAAAASUVORK5CYII=');
      background-repeat: no-repeat;
      background-position: right bottom;
    }
  `];var P=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let k=class extends x{set value(e){this._value=e,this._internals.setFormValue(e)}get value(){return this._value}get wrappedElement(){return this._textareaEl}get form(){return this._internals.form}get type(){return"textarea"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}set minlength(e){this.minLength=e}get minlength(){return this.minLength}set maxlength(e){this.maxLength=e}get maxlength(){return this.maxLength}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.invalid=!1,this.label="",this.maxLength=void 0,this.minLength=void 0,this.rows=void 0,this.cols=void 0,this.name=void 0,this.placeholder=void 0,this.readonly=!1,this.resize="none",this.required=!1,this.spellcheck=!1,this.monospace=!1,this._value="",this._textareaPointerCursor=!1,this._shadow=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._textareaEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._textareaEl.value)})}updated(e){const t=["maxLength","minLength","required"];for(const o of e.keys())if(t.includes(String(o))){this.updateComplete.then(()=>{this._setValidityFromInput()});break}}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(e,t){this.updateComplete.then(()=>{this._value=e})}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}_setValidityFromInput(){this._internals.setValidity(this._textareaEl.validity,this._textareaEl.validationMessage,this._textareaEl)}_dataChanged(){this._value=this._textareaEl.value,this._internals.setFormValue(this._textareaEl.value)}_handleChange(e){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change")),this.dispatchEvent(new CustomEvent("vsc-change",{detail:{data:this.value,originalEvent:e}}))}_handleInput(e){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new CustomEvent("vsc-input",{detail:{data:e.data,originalEvent:e}}))}_handleMouseMove(e){if(this._textareaEl.clientHeight>=this._textareaEl.scrollHeight){this._textareaPointerCursor=!1;return}const t=14,o=1,i=this._textareaEl.getBoundingClientRect(),s=e.clientX;this._textareaPointerCursor=s>=i.left+i.width-t-o*2}_handleScroll(){this._shadow=this._textareaEl.scrollTop>0}render(){return d`
      <div
        class=${$({shadow:!0,visible:this._shadow})}
      ></div>
      <textarea
        autocomplete=${y(this.autocomplete)}
        ?autofocus=${this.autofocus}
        ?disabled=${this.disabled}
        aria-label=${this.label}
        id="textarea"
        class=${$({monospace:this.monospace,"cursor-pointer":this._textareaPointerCursor})}
        maxlength=${y(this.maxLength)}
        minlength=${y(this.minLength)}
        rows=${y(this.rows)}
        cols=${y(this.cols)}
        name=${y(this.name)}
        placeholder=${y(this.placeholder)}
        ?readonly=${this.readonly}
        .style=${F({resize:this.resize})}
        ?required=${this.required}
        spellcheck=${this.spellcheck}
        @change=${this._handleChange}
        @input=${this._handleInput}
        @mousemove=${this._handleMouseMove}
        @scroll=${this._handleScroll}
        .value=${this._value}
      ></textarea>
    `}};k.styles=ci;k.formAssociated=!0;k.shadowRootOptions={...K.shadowRootOptions,delegatesFocus:!0};P([a()],k.prototype,"autocomplete",void 0);P([a({type:Boolean,reflect:!0})],k.prototype,"autofocus",void 0);P([a({attribute:"default-value"})],k.prototype,"defaultValue",void 0);P([a({type:Boolean,reflect:!0})],k.prototype,"disabled",void 0);P([a({type:Boolean,reflect:!0})],k.prototype,"invalid",void 0);P([a({attribute:!1})],k.prototype,"label",void 0);P([a({type:Number})],k.prototype,"maxLength",void 0);P([a({type:Number})],k.prototype,"minLength",void 0);P([a({type:Number})],k.prototype,"rows",void 0);P([a({type:Number})],k.prototype,"cols",void 0);P([a()],k.prototype,"name",void 0);P([a()],k.prototype,"placeholder",void 0);P([a({type:Boolean,reflect:!0})],k.prototype,"readonly",void 0);P([a()],k.prototype,"resize",void 0);P([a({type:Boolean,reflect:!0})],k.prototype,"required",void 0);P([a({type:Boolean})],k.prototype,"spellcheck",void 0);P([a({type:Boolean,reflect:!0})],k.prototype,"monospace",void 0);P([a()],k.prototype,"value",null);P([H("#textarea")],k.prototype,"_textareaEl",void 0);P([v()],k.prototype,"_value",void 0);P([v()],k.prototype,"_textareaPointerCursor",void 0);P([v()],k.prototype,"_shadow",void 0);k=P([_("vscode-textarea")],k);const no=ht(Rt()),di=[g,b`
    :host {
      align-items: center;
      background-color: var(--vscode-settings-textInputBackground, #313131);
      border-color: var(
        --vscode-settings-textInputBorder,
        var(--vscode-settings-textInputBackground, #3c3c3c)
      );
      border-radius: 2px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-settings-textInputForeground, #cccccc);
      display: inline-flex;
      max-width: 100%;
      position: relative;
      width: 320px;
    }

    :host([focused]) {
      border-color: var(--vscode-focusBorder, #0078d4);
    }

    :host([invalid]),
    :host(:invalid) {
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    :host([invalid]) input,
    :host(:invalid) input {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    }

    ::slotted([slot='content-before']) {
      display: block;
      margin-left: 2px;
    }

    ::slotted([slot='content-after']) {
      display: block;
      margin-right: 2px;
    }

    slot[name='content-before'],
    slot[name='content-after'] {
      align-items: center;
      display: flex;
    }

    input {
      background-color: var(--vscode-settings-textInputBackground, #313131);
      border: 0;
      box-sizing: border-box;
      color: var(--vscode-settings-textInputForeground, #cccccc);
      display: block;
      font-family: var(--vscode-font-family, ${no});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, 'normal');
      line-height: 18px;
      outline: none;
      padding-bottom: 3px;
      padding-left: 4px;
      padding-right: 4px;
      padding-top: 3px;
      width: 100%;
    }

    input:read-only:not([type='file']) {
      cursor: not-allowed;
    }

    input::placeholder {
      color: var(--vscode-input-placeholderForeground, #989898);
      opacity: 1;
    }

    input[type='file'] {
      line-height: 24px;
      padding-bottom: 0;
      padding-left: 2px;
      padding-top: 0;
    }

    input[type='file']::file-selector-button {
      background-color: var(--vscode-button-background, #0078d4);
      border: 0;
      border-radius: 2px;
      color: var(--vscode-button-foreground, #ffffff);
      cursor: pointer;
      font-family: var(--vscode-font-family, ${no});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, 'normal');
      line-height: 20px;
      padding: 0 14px;
    }

    input[type='file']::file-selector-button:hover {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }
  `];var S=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let C=class extends x{set type(e){const t=["color","date","datetime-local","email","file","month","number","password","search","tel","text","time","url","week"];this._type=t.includes(e)?e:"text"}get type(){return this._type}set value(e){this.type!=="file"&&(this._value=e,this._internals.setFormValue(e)),this.updateComplete.then(()=>{this._setValidityFromInput()})}get value(){return this._value}set minlength(e){this.minLength=e}get minlength(){return this.minLength}set maxlength(e){this.maxLength=e}get maxlength(){return this.maxLength}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._setValidityFromInput(),this._internals.checkValidity()}reportValidity(){return this._setValidityFromInput(),this._internals.reportValidity()}get wrappedElement(){return this._inputEl}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.focused=!1,this.invalid=!1,this.label="",this.max=void 0,this.maxLength=void 0,this.min=void 0,this.minLength=void 0,this.multiple=!1,this.name=void 0,this.pattern=void 0,this.placeholder=void 0,this.readonly=!1,this.required=!1,this.step=void 0,this._value="",this._type="text",this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._inputEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._inputEl.value)})}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o),["max","maxlength","min","minlength","pattern","required","step"].includes(e)&&this.updateComplete.then(()=>{this._setValidityFromInput()})}formResetCallback(){this.value=this.defaultValue,this.requestUpdate()}formStateRestoreCallback(e,t){this.value=e}_dataChanged(){if(this._value=this._inputEl.value,this.type==="file"&&this._inputEl.files)for(const e of this._inputEl.files)this._internals.setFormValue(e);else this._internals.setFormValue(this._inputEl.value)}_setValidityFromInput(){this._inputEl&&this._internals.setValidity(this._inputEl.validity,this._inputEl.validationMessage,this._inputEl)}_onInput(e){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new CustomEvent("vsc-input",{detail:{data:e.data,originalEvent:e}}))}_onChange(e){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change")),this.dispatchEvent(new CustomEvent("vsc-change",{detail:{data:this.value,originalEvent:e}}))}_onFocus(){this.focused=!0}_onBlur(){this.focused=!1}_onKeyDown(e){var t;e.key==="Enter"&&this._internals.form&&((t=this._internals.form)==null||t.requestSubmit())}render(){return d`
      <slot name="content-before"></slot>
      <input
        id="input"
        type=${this.type}
        ?autofocus=${this.autofocus}
        autocomplete=${y(this.autocomplete)}
        aria-label=${this.label}
        ?disabled=${this.disabled}
        max=${y(this.max)}
        maxlength=${y(this.maxLength)}
        min=${y(this.min)}
        minlength=${y(this.minLength)}
        ?multiple=${this.multiple}
        name=${y(this.name)}
        pattern=${y(this.pattern)}
        placeholder=${y(this.placeholder)}
        ?readonly=${this.readonly}
        ?required=${this.required}
        step=${y(this.step)}
        .value=${this._value}
        @blur=${this._onBlur}
        @change=${this._onChange}
        @focus=${this._onFocus}
        @input=${this._onInput}
        @keydown=${this._onKeyDown}
      >
      <slot name="content-after"></slot>
    `}};C.styles=di;C.formAssociated=!0;C.shadowRootOptions={...K.shadowRootOptions,delegatesFocus:!0};S([a()],C.prototype,"autocomplete",void 0);S([a({type:Boolean,reflect:!0})],C.prototype,"autofocus",void 0);S([a({attribute:"default-value"})],C.prototype,"defaultValue",void 0);S([a({type:Boolean,reflect:!0})],C.prototype,"disabled",void 0);S([a({type:Boolean,reflect:!0})],C.prototype,"focused",void 0);S([a({type:Boolean,reflect:!0})],C.prototype,"invalid",void 0);S([a({attribute:!1})],C.prototype,"label",void 0);S([a({type:Number})],C.prototype,"max",void 0);S([a({type:Number})],C.prototype,"maxLength",void 0);S([a({type:Number})],C.prototype,"min",void 0);S([a({type:Number})],C.prototype,"minLength",void 0);S([a({type:Boolean,reflect:!0})],C.prototype,"multiple",void 0);S([a({reflect:!0})],C.prototype,"name",void 0);S([a()],C.prototype,"pattern",void 0);S([a()],C.prototype,"placeholder",void 0);S([a({type:Boolean,reflect:!0})],C.prototype,"readonly",void 0);S([a({type:Boolean,reflect:!0})],C.prototype,"required",void 0);S([a({type:Number})],C.prototype,"step",void 0);S([a({reflect:!0})],C.prototype,"type",null);S([a()],C.prototype,"value",null);S([H("#input")],C.prototype,"_inputEl",void 0);S([v()],C.prototype,"_value",void 0);S([v()],C.prototype,"_type",void 0);C=S([_("vscode-textfield")],C);const hi=[g,b`
    :host {
      display: inline-flex;
    }

    button {
      align-items: center;
      background-color: transparent;
      border: 0;
      border-radius: 5px;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      display: flex;
      outline-offset: -1px;
      outline-width: 1px;
      padding: 0;
      user-select: none;
    }

    button:focus-visible {
      outline-color: var(--vscode-focusBorder, #0078d4);
      outline-style: solid;
    }

    button:hover {
      background-color: var(
        --vscode-toolbar-hoverBackground,
        rgba(90, 93, 94, 0.31)
      );
      outline-style: dashed;
      outline-color: var(--vscode-toolbar-hoverOutline, transparent);
    }

    button:active {
      background-color: var(
        --vscode-toolbar-activeBackground,
        rgba(99, 102, 103, 0.31)
      );
    }

    button.checked {
      background-color: var(
        --vscode-inputOption-activeBackground,
        rgba(36, 137, 219, 0.51)
      );
      outline-color: var(--vscode-inputOption-activeBorder, #2488db);
      outline-style: solid;
      color: var(--vscode-inputOption-activeForeground, #ffffff);
    }

    button.checked vscode-icon {
      color: var(--vscode-inputOption-activeForeground, #ffffff);
    }

    vscode-icon {
      display: block;
      padding: 3px;
    }

    slot:not(.empty) {
      align-items: center;
      display: flex;
      height: 22px;
      padding: 0 5px 0 2px;
    }

    slot.textOnly:not(.empty) {
      padding: 0 5px;
    }
  `];var $e=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let ie=class extends x{constructor(){super(...arguments),this.icon="",this.label=void 0,this.toggleable=!1,this.checked=!1,this._isSlotEmpty=!0}_handleSlotChange(){var e;this._isSlotEmpty=!((((e=this._assignedNodes)==null?void 0:e.length)??0)>0)}_handleButtonClick(){this.toggleable&&(this.checked=!this.checked,this.dispatchEvent(new Event("change")))}render(){const e=this.checked?"true":"false";return d`
      <button
        type="button"
        aria-label=${y(this.label)}
        role=${y(this.toggleable?"switch":void 0)}
        aria-checked=${y(this.toggleable?e:void 0)}
        class=${$({checked:this.toggleable&&this.checked})}
        @click=${this._handleButtonClick}
      >
        ${this.icon?d`<vscode-icon name=${this.icon}></vscode-icon>`:p}
        <slot
          @slotchange=${this._handleSlotChange}
          class=${$({empty:this._isSlotEmpty,textOnly:!this.icon})}
        ></slot>
      </button>
    `}};ie.styles=hi;$e([a({reflect:!0})],ie.prototype,"icon",void 0);$e([a()],ie.prototype,"label",void 0);$e([a({type:Boolean,reflect:!0})],ie.prototype,"toggleable",void 0);$e([a({type:Boolean,reflect:!0})],ie.prototype,"checked",void 0);$e([v()],ie.prototype,"_isSlotEmpty",void 0);$e([ds()],ie.prototype,"_assignedNodes",void 0);ie=$e([_("vscode-toolbar-button")],ie);const ui=[g,b`
    :host {
      gap: 4px;
      display: flex;
      align-items: center;
    }
  `];var pi=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};let St=class extends x{render(){return d` <slot></slot> `}};St.styles=ui;St=pi([_("vscode-toolbar-container")],St);const fi=[g,b`
    :host {
      --hover-outline-color: transparent;
      --hover-outline-style: solid;
      --hover-outline-width: 0;
      --selected-outline-color: transparent;
      --selected-outline-style: solid;
      --selected-outline-width: 0;

      display: block;
      outline: none;
      user-select: none;
    }

    .wrapper {
      height: 100%;
    }

    li {
      list-style: none;
    }

    ul,
    li {
      margin: 0;
      padding: 0;
    }

    ul {
      position: relative;
    }

    :host([indent-guides]) ul ul:before {
      content: '';
      display: block;
      height: 100%;
      position: absolute;
      bottom: 0;
      left: var(--indent-guide-pos);
      top: 0;
      pointer-events: none;
      width: 1px;
      z-index: 1;
    }

    .contents {
      align-items: center;
      display: flex;
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      font-weight: var(--vscode-font-weight);
      outline-offset: -1px;
      padding-right: 12px;
    }

    .multi .contents {
      align-items: flex-start;
    }

    .contents:hover {
      cursor: pointer;
    }

    .arrow-container {
      align-items: center;
      display: flex;
      height: 22px;
      justify-content: center;
      padding-left: 8px;
      padding-right: 6px;
      width: 16px;
    }

    .icon-arrow {
      color: currentColor;
      display: block;
    }

    .theme-icon {
      display: block;
      flex-shrink: 0;
      margin-right: 6px;
    }

    .image-icon {
      background-repeat: no-repeat;
      background-position: 0 center;
      background-size: 16px;
      display: block;
      flex-shrink: 0;
      margin-right: 6px;
      height: 22px;
      width: 16px;
    }

    .multi .contents .theme-icon {
      margin-top: 3px;
    }

    .text-content {
      display: flex;
      line-height: 22px;
    }

    .single .text-content {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      width: 100%;
    }

    .description {
      font-size: 0.9em;
      line-height: 22px;
      margin-left: 0.5em;
      opacity: 0.95;
      white-space: pre;
    }

    .actions {
      display: none;
    }

    .contents.selected > .actions,
    .contents.focused > .actions,
    .contents:hover > .actions {
      display: flex;
    }

    .decorations {
      align-items: center;
      display: flex;
      height: 22px;
      margin-left: 5px;
    }

    .filled-circle {
      margin-right: 3px;
      opacity: 0.4;
    }

    .decoration-text {
      font-size: 90%;
      font-weight: 600;
      margin-right: 3px;
      opacity: 0.75;
    }

    .filled-circle,
    .decoration-text {
      color: var(--color, currentColor);
    }

    .contents:hover .filled-circle,
    .contents:hover .decoration-text {
      color: var(--hover-color, var(--color));
    }

    .contents.focused .filled-circle,
    .contents.focused .decoration-text {
      color: var(--focused-color, var(--color));
    }

    .contents.selected .filled-circle,
    .contents.selected .decoration-text {
      color: var(--selected-color, var(--color));
    }

    /* Theme colors */
    :host(:focus) .wrapper.has-not-focused-item {
      outline: 1px solid var(--vscode-focusBorder);
    }

    :host(:focus) .contents.selected,
    :host(:focus) .contents.focused.selected {
      color: var(--vscode-list-activeSelectionForeground);
      background-color: var(--vscode-list-activeSelectionBackground);
    }

    :host(:focus) .contents.selected .icon-arrow,
    :host(:focus) .contents.selected.focused .icon-arrow,
    :host(:focus) .contents.selected .theme-icon,
    :host(:focus) .contents.selected.focused .theme-icon,
    :host(:focus) .contents.selected .action-icon,
    :host(:focus) .contents.selected.focused .action-icon {
      color: var(--vscode-list-activeSelectionIconForeground);
    }

    :host(:focus) .contents.focused {
      color: var(--vscode-list-focusForeground);
      background-color: var(--vscode-list-focusBackground);
    }

    :host(:focus) .contents.selected.focused {
      outline-color: var(
        --vscode-list-focusAndSelectionOutline,
        var(--vscode-list-focusOutline)
      );
    }

    .contents:hover {
      background-color: var(--vscode-list-hoverBackground);
      color: var(--vscode-list-hoverForeground);
    }

    .contents:hover,
    .contents.selected:hover {
      outline-color: var(--hover-outline-color);
      outline-style: var(--hover-outline-style);
      outline-width: var(--hover-outline-width);
    }

    .contents.selected,
    .contents.selected.focused {
      background-color: var(--vscode-list-inactiveSelectionBackground);
      color: var(--vscode-list-inactiveSelectionForeground);
    }

    .contents.selected,
    .contents.selected.focused {
      outline-color: var(--selected-outline-color);
      outline-style: var(--selected-outline-style);
      outline-width: var(--selected-outline-width);
    }

    .contents.selected .theme-icon {
      color: var(--vscode-list-inactiveSelectionIconForeground);
    }

    .contents.focused {
      background-color: var(--vscode-list-inactiveFocusBackground);
      outline: 1px dotted var(--vscode-list-inactiveFocusOutline);
    }

    :host(:focus) .contents.focused {
      outline: 1px solid var(--vscode-list-focusOutline);
    }

    :host([indent-guides]) ul ul:before {
      background-color: var(--vscode-tree-inactiveIndentGuidesStroke);
    }

    :host([indent-guides]) ul ul.has-active-item:before {
      background-color: var(--vscode-tree-indentGuidesStroke);
    }
  `];var Q=function(n,e,t,o){var i=arguments.length,s=i<3?e:o===null?o=Object.getOwnPropertyDescriptor(e,t):o,r;if(typeof Reflect=="object"&&typeof Reflect.decorate=="function")s=Reflect.decorate(n,e,t,o);else for(var l=n.length-1;l>=0;l--)(r=n[l])&&(s=(i<3?r(s):i>3?r(e,t,s):r(e,t))||s);return i>3&&s&&Object.defineProperty(e,t,s),s};const vi=30,bi=16,ro=3,Ao=(n,e=[])=>{const t=[];return n.forEach((o,i)=>{const s=[...e,i],r={...o,path:s};o.subItems&&(r.subItems=Ao(o.subItems,s)),t.push(r)}),t},Me=n=>{var e;return!!(n.subItems&&Array.isArray(n.subItems)&&((e=n==null?void 0:n.subItems)==null?void 0:e.length)>0)};let N=class extends x{constructor(){super(...arguments),this.indent=8,this.arrows=!1,this.multiline=!1,this.tabindex=0,this.indentGuides=!1,this._data=[],this._selectedItem=null,this._focusedItem=null,this._selectedBranch=null,this._focusedBranch=null,this._handleComponentKeyDownBound=this._handleComponentKeyDown.bind(this)}set data(e){const t=this._data;this._data=Ao(e),this.requestUpdate("data",t)}get data(){return this._data}closeAll(){this._closeSubTreeRecursively(this.data),this.requestUpdate()}deselectAll(){this._deselectItemsRecursively(this.data),this.requestUpdate()}getItemByPath(e){return this._getItemByPath(e)}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleComponentKeyDownBound)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._handleComponentKeyDownBound)}_getItemByPath(e){let t=this._data,o=null;return e.forEach((i,s)=>{s===e.length-1?o=t[i]:t=t[i].subItems}),o}_handleActionClick(e){e.stopPropagation();const t=e.target,o=t.dataset.itemPath,i=t.dataset.index;let s=null,r="",l="";if(o){const c=o.split("/").map(h=>Number(h));if(s=this._getItemByPath(c),s!=null&&s.actions){const h=Number(i);s.actions[h]&&(r=s.actions[h].actionId)}s!=null&&s.value&&(l=s.value)}this.dispatchEvent(new CustomEvent("vsc-run-action",{detail:{actionId:r,item:s,value:l}})),this.dispatchEvent(new CustomEvent("vsc-tree-action",{detail:{actionId:r,item:s,value:l}}))}_renderIconVariant(e){const{type:t,value:o}=e;return t==="themeicon"?d`<vscode-icon name=${o} class="theme-icon"></vscode-icon>`:d`<span
        class="image-icon"
        .style=${F({backgroundImage:`url(${o})`})}
      ></span>`}_renderIcon(e){const t={branch:{value:"folder",type:"themeicon"},open:{value:"folder-opened",type:"themeicon"},leaf:{value:"file",type:"themeicon"}};if(e.iconUrls)e.iconUrls.branch&&(t.branch={value:e.iconUrls.branch,type:"image"}),e.iconUrls.leaf&&(t.leaf={value:e.iconUrls.leaf,type:"image"}),e.iconUrls.open&&(t.open={value:e.iconUrls.open,type:"image"});else if(typeof e.icons=="object")e.icons.branch&&(t.branch={value:e.icons.branch,type:"themeicon"}),e.icons.leaf&&(t.leaf={value:e.icons.leaf,type:"themeicon"}),e.icons.open&&(t.open={value:e.icons.open,type:"themeicon"});else if(!e.icons)return d`${p}`;return Me(e)?e.open?this._renderIconVariant(t.open):this._renderIconVariant(t.branch):this._renderIconVariant(t.leaf)}_renderArrow(e){if(!this.arrows||!Me(e))return d`${p}`;const{open:t=!1}=e;return d`
      <div class="arrow-container">
        <vscode-icon name=${t?"chevron-down":"chevron-right"} class="icon-arrow"></vscode-icon>
      </div>
    `}_renderActions(e){const t=[];return e.actions&&Array.isArray(e.actions)&&e.actions.forEach((o,i)=>{var s;if(o.icon){const r=d`<vscode-icon
            name=${o.icon}
            action-icon
            title=${y(o.tooltip)}
            data-item-path=${y((s=e.path)==null?void 0:s.join("/"))}
            data-index=${i}
            class="action-icon"
            @click=${this._handleActionClick}
          ></vscode-icon>`;t.push(r)}}),t.length>0?d`<div class="actions">${t}</div>`:d`${p}`}_renderDecorations(e){const t=[];return e.decorations&&Array.isArray(e.decorations)&&e.decorations.forEach(o=>{const{appearance:i="text",visibleWhen:s="always",content:r="",color:l="",focusedColor:c="",hoverColor:h="",selectedColor:f=""}=o,u=`visible-when-${s}`,m={};switch(l&&(m["--color"]=l),c&&(m["--focused-color"]=c),h&&(m["--hover-color"]=h),f&&(m["--selected-color"]=f),i){case"counter-badge":t.push(d`<vscode-badge
                variant="counter"
                class=${["counter-badge",u].join(" ")}
                part="counter-badge-decoration"
                >${r}</vscode-badge
              >`);break;case"filled-circle":t.push(d`<vscode-icon
                name="circle-filled"
                size="14"
                class=${["filled-circle",u].join(" ")}
                part="filled-circle-decoration"
                .style=${F(m)}
              ></vscode-icon>`);break;case"text":t.push(d`<div
                class=${["decoration-text",u].join(" ")}
                part="caption-decoration"
                .style=${F(m)}
              >
                ${r}
              </div>`);break}}),t.length>0?d`<div class="decorations" part="decorations">
        ${t}
      </div>`:d`${p}`}_renderTreeItem(e,t){const{open:o=!1,label:i,description:s="",tooltip:r,selected:l=!1,focused:c=!1,subItems:h=[]}=e,{path:f,itemType:u,hasFocusedItem:m=!1,hasSelectedItem:w=!1}=t,B=f.length-1,U=["contents"],Ce=o?["open"]:[],ue=B*this.indent,Ro=this.arrows&&u==="leaf"?vi+ue:ue,Bo=this._renderArrow(e),Vo=this._renderIcon(e),zo=this.arrows?ue+bi:ue+ro,To=o&&u==="branch"?d`<ul
            .style=${F({"--indent-guide-pos":`${zo}px`})}
            class=${$({"has-active-item":m||w})}
          >
            ${this._renderTree(h,f)}
          </ul>`:p,Lo=s?d`<span class="description" part="description">${s}</span>`:p,Do=this._renderActions(e),Fo=this._renderDecorations(e);return Ce.push(u),l&&U.push("selected"),c&&U.push("focused"),d`
      <li data-path=${f.join("/")} class=${Ce.join(" ")}>
        <div
          class=${U.join(" ")}
          .style=${F({paddingLeft:`${Ro+ro}px`})}
        >
          ${Bo}${Vo}<span
            class="text-content"
            part="text-content"
            title=${y(r)}
            >${i}${Lo}</span
          >
          ${Do} ${Fo}
        </div>
        ${To}
      </li>
    `}_renderTree(e,t=[]){const o=[];return e?(e.forEach((i,s)=>{const r=[...t,s],l=Me(i)?"branch":"leaf",{selected:c=!1,focused:h=!1,hasFocusedItem:f=!1,hasSelectedItem:u=!1}=i;c&&(this._selectedItem=i),h&&(this._focusedItem=i),o.push(this._renderTreeItem(i,{path:r,itemType:l,hasFocusedItem:f,hasSelectedItem:u}))}),o):p}_selectItem(e){var o,i;this._selectedItem&&(this._selectedItem.selected=!1),this._focusedItem&&(this._focusedItem.focused=!1),this._selectedItem=e,e.selected=!0,this._focusedItem=e,e.focused=!0,this._selectedBranch&&(this._selectedBranch.hasSelectedItem=!1);let t=null;if((o=e.path)!=null&&o.length&&e.path.length>1&&(t=this._getItemByPath(e.path.slice(0,-1))),Me(e))this._selectedBranch=e,e.hasSelectedItem=!0,e.open=!e.open,e.open?(this._selectedBranch=e,e.hasSelectedItem=!0):t&&(this._selectedBranch=t,t.hasSelectedItem=!0);else if((i=e.path)!=null&&i.length&&e.path.length>1){const s=this._getItemByPath(e.path.slice(0,-1));s&&(this._selectedBranch=s,s.hasSelectedItem=!0)}else this._selectedBranch=e,e.hasSelectedItem=!0;this._emitSelectEvent(this._selectedItem,this._selectedItem.path.join("/")),this.requestUpdate()}_focusItem(e){var i,s;this._focusedItem&&(this._focusedItem.focused=!1),this._focusedItem=e,e.focused=!0;const t=!!((i=e==null?void 0:e.subItems)!=null&&i.length);this._focusedBranch&&(this._focusedBranch.hasFocusedItem=!1);let o=null;(s=e.path)!=null&&s.length&&e.path.length>1&&(o=this._getItemByPath(e.path.slice(0,-1))),t?e.open?(this._focusedBranch=e,e.hasFocusedItem=!0):!e.open&&o&&(this._focusedBranch=o,o.hasFocusedItem=!0):o&&(this._focusedBranch=o,o.hasFocusedItem=!0)}_closeSubTreeRecursively(e){e.forEach(t=>{t.open=!1,t.subItems&&t.subItems.length>0&&this._closeSubTreeRecursively(t.subItems)})}_deselectItemsRecursively(e){e.forEach(t=>{t.selected&&(t.selected=!1),t.subItems&&t.subItems.length>0&&this._deselectItemsRecursively(t.subItems)})}_emitSelectEvent(e,t){const{icons:o,label:i,open:s,value:r}=e,l={icons:o,itemType:Me(e)?"branch":"leaf",label:i,open:s||!1,value:r||i,path:t};this.dispatchEvent(new CustomEvent("vsc-select",{bubbles:!0,composed:!0,detail:l})),this.dispatchEvent(new CustomEvent("vsc-tree-select",{detail:l}))}_focusPrevItem(){var t;if(!this._focusedItem){this._focusItem(this._data[0]);return}const{path:e}=this._focusedItem;if(e&&(e==null?void 0:e.length)>0){const o=e[e.length-1],i=e.length>1;if(o>0){const s=[...e];s[s.length-1]=o-1;const r=this._getItemByPath(s);let l=r;if(r!=null&&r.open&&((t=r.subItems)!=null&&t.length)){const{subItems:c}=r;l=c[c.length-1]}this._focusItem(l)}else if(i){const s=[...e];s.pop(),this._focusItem(this._getItemByPath(s))}}else this._focusItem(this._data[0])}_focusNextItem(){if(!this._focusedItem){this._focusItem(this._data[0]);return}const{path:e,open:t}=this._focusedItem;if(t&&Array.isArray(this._focusedItem.subItems)&&this._focusedItem.subItems.length>0){this._focusItem(this._focusedItem.subItems[0]);return}const o=[...e];o[o.length-1]+=1;let i=this._getItemByPath(o);i?this._focusItem(i):(o.pop(),o.length>0&&(o[o.length-1]+=1,i=this._getItemByPath(o),i&&this._focusItem(i)))}_handleClick(e){const o=e.composedPath().find(i=>i.tagName&&i.tagName.toUpperCase()==="LI");if(o){const s=(o.dataset.path||"").split("/").map(l=>Number(l)),r=this._getItemByPath(s);this._selectItem(r)}else this._focusedItem&&(this._focusedItem.focused=!1),this._focusedItem=null}_handleComponentKeyDown(e){const t=[" ","ArrowDown","ArrowUp","Enter","Escape"],o=e.key;t.includes(e.key)&&(e.stopPropagation(),e.preventDefault()),o==="Escape"&&(this._focusedItem=null),o==="ArrowUp"&&this._focusPrevItem(),o==="ArrowDown"&&this._focusNextItem(),(o==="Enter"||o===" ")&&this._focusedItem&&this._selectItem(this._focusedItem)}render(){const e=$({multi:this.multiline,single:!this.multiline,wrapper:!0,"has-not-focused-item":!this._focusedItem,"selection-none":!this._selectedItem,"selection-single":this._selectedItem!==null});return d`
      <div @click=${this._handleClick} class=${e}>
        <ul>
          ${this._renderTree(this._data)}
        </ul>
      </div>
    `}};N.styles=fi;Q([a({type:Array,reflect:!1})],N.prototype,"data",null);Q([a({type:Number})],N.prototype,"indent",void 0);Q([a({type:Boolean,reflect:!0})],N.prototype,"arrows",void 0);Q([a({type:Boolean,reflect:!0})],N.prototype,"multiline",void 0);Q([a({type:Number,reflect:!0})],N.prototype,"tabindex",void 0);Q([a({type:Boolean,reflect:!0,attribute:"indent-guides"})],N.prototype,"indentGuides",void 0);Q([v()],N.prototype,"_selectedItem",void 0);Q([v()],N.prototype,"_focusedItem",void 0);Q([v()],N.prototype,"_selectedBranch",void 0);Q([v()],N.prototype,"_focusedBranch",void 0);N=Q([_("vscode-tree")],N);export{gi as I};
//# sourceMappingURL=chunk-D3NR7-7B.js.map
