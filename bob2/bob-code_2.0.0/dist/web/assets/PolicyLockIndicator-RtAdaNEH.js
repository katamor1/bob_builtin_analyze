import{n as e,Y as t,Z as o,r as s,_ as i,$ as n,a0 as r,a1 as a,a2 as l,a3 as c,j as d,B as h,i as p,a4 as u,R as v,a5 as b,a6 as f,a7 as g,a8 as m}from"./index-B650KlTs.js";import{L as _,s as y,D as x,a as w,b as C,c as k,d as S,e as $}from"./ErrorNotification-CO5NEzcK.js";import{I as E}from"./bucket-0-BMxu7PG6.js";import"./checkbox-BW1-S11u.js";import{L as I}from"./zap-BHF3SHMg.js";var A,O;const P=e(O?A:(O=1,A={area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0}));var R=/\s([^'"/\s><]+?)[\s/>]|([^\s=]+)=\s?(".*?"|'.*?')/g;function B(e){var t={type:"tag",name:"",voidElement:!1,attrs:{},children:[]},o=e.match(/<\/?([^\s]+?)[/\s>]/);if(o&&(t.name=o[1],(P[o[1]]||"/"===e.charAt(e.length-2))&&(t.voidElement=!0),t.name.startsWith("!--"))){var s=e.indexOf("--\x3e");return{type:"comment",comment:-1!==s?e.slice(4,s):""}}for(var i=new RegExp(R),n=null;null!==(n=i.exec(e));)if(n[0].trim())if(n[1]){var r=n[1].trim(),a=[r,""];r.indexOf("=")>-1&&(a=r.split("=")),t.attrs[a[0]]=a[1],i.lastIndex--}else n[2]&&(t.attrs[n[2]]=n[3].trim().substring(1,n[3].length-1));return t}var z=/<[a-zA-Z0-9\-\!\/](?:"[^"]*"|'[^']*'|[^'">])*>/g,V=/^\s*$/,D=Object.create(null);var L=function(e,t){t||(t={}),t.components||(t.components=D);var o,s=[],i=[],n=-1,r=!1;if(0!==e.indexOf("<")){var a=e.indexOf("<");s.push({type:"text",content:-1===a?e:e.substring(0,a)})}return e.replace(z,function(a,l){if(r){if(a!=="</"+o.name+">")return;r=!1}var c,d="/"!==a.charAt(1),h=a.startsWith("\x3c!--"),p=l+a.length,u=e.charAt(p);if(h){var v=B(a);return n<0?(s.push(v),s):((c=i[n]).children.push(v),s)}if(d&&(n++,"tag"===(o=B(a)).type&&t.components[o.name]&&(o.type="component",r=!0),o.voidElement||r||!u||"<"===u||o.children.push({type:"text",content:e.slice(p,e.indexOf("<",p))}),0===n&&s.push(o),(c=i[n-1])&&c.children.push(o),i[n]=o),(!d||o.voidElement)&&(n>-1&&(o.voidElement||o.name===a.slice(2,-1))&&(n--,o=-1===n?s:i[n]),!r&&"<"!==u&&u)){c=-1===n?s:i[n].children;var b=e.indexOf("<",p),f=e.slice(p,-1===b?void 0:b);V.test(f)&&(f=" "),(b>-1&&n+c.length>=0||" "!==f)&&c.push({type:"text",content:f})}}),s};const M=(e,t)=>{if(!e)return!1;const o=e.props?.children??e.children;return t?o.length>0:!!o},T=e=>{if(!e)return[];const t=e.props?.children??e.children;return e.props?.i18nIsDynamicList?F(t):t},F=e=>Array.isArray(e)?e:[e],N=(e,t,o,i)=>{if(!e)return"";let l="";const c=F(e),d=t?.transSupportBasicHtmlNodes?t.transKeepBasicHtmlNodesFor??[]:[];return c.forEach((e,c)=>{if(n(e))l+=`${e}`;else{if(s.isValidElement(e)){const{props:s,type:r}=e,a=Object.keys(s).length,h=d.indexOf(r)>-1,p=s.children;if(!p&&h&&!a)return void(l+=`<${r}/>`);if(!p&&(!h||a)||s.i18nIsDynamicList)return void(l+=`<${c}></${c}>`);if(h&&1===a&&n(p))return void(l+=`<${r}>${p}</${r}>`);const u=N(p,t,o,i);return void(l+=`<${c}>${u}</${c}>`)}if(null!==e){if(a(e)){const{format:t,...s}=e,n=Object.keys(s);if(1===n.length){const e=t?`${n[0]}, ${t}`:n[0];return void(l+=`{{${e}}}`)}return void r(o,"TRANS_INVALID_OBJ","Invalid child - Object should only have keys {{ value, format }} (format is optional).",{i18nKey:i,child:e})}r(o,"TRANS_INVALID_VAR","Passed in a variable like {number} - pass variables for interpolation as full objects like {{number}}.",{i18nKey:i,child:e})}else r(o,"TRANS_NULL_VALUE","Passed in a null value as child",{i18nKey:i})}}),l},j=(e,t,o,i,r,l,c)=>{if(""===o)return[];const d=r.transKeepBasicHtmlNodesFor||[],h=o&&new RegExp(d.map(e=>`<${e}`).join("|")).test(o);if(!(e||t||h||c))return[o];const p=t??{},u=e=>{F(e).forEach(e=>{n(e)||(M(e)?u(T(e)):a(e)&&!s.isValidElement(e)&&Object.assign(p,e))})};u(e);const v=L(`<0>${o}</0>`),b={...p,...l},f=(e,t,o)=>{const i=T(e),n=m(i,t.children,o);return(e=>Array.isArray(e)&&e.every(s.isValidElement))(i)&&0===n.length||e.props?.i18nIsDynamicList?i:n},g=(e,t,o,i,n)=>{e.dummy?(e.children=t,o.push(s.cloneElement(e,{key:i},n?void 0:t))):o.push(...s.Children.map([e],e=>{const o={...e.props};return delete o.i18nIsDynamicList,s.createElement(e.type,{...o,key:i,ref:e.props.ref??e.ref},n?null:t)}))},m=(e,o,l)=>{const p=F(e);return F(o).reduce((e,o,u)=>{const v=o.children?.[0]?.content&&i.services.interpolator.interpolate(o.children[0].content,b,i.language);if("tag"===o.type){let c=p[parseInt(o.name,10)];!c&&t&&(c=t[o.name]),1!==l.length||c||(c=l[0][o.name]),c||(c={});const _=0!==Object.keys(o.attrs).length?((e,t)=>{const o={...t};return o.props=Object.assign(e.props,t.props),o})({props:o.attrs},c):c,y=s.isValidElement(_),x=y&&M(o,!0)&&!o.voidElement,w=h&&a(_)&&_.dummy&&!y,C=a(t)&&Object.hasOwnProperty.call(t,o.name);if(n(_)){const t=i.services.interpolator.interpolate(_,b,i.language);e.push(t)}else if(M(_)||x){const t=f(_,o,l);g(_,t,e,u)}else if(w){const t=m(p,o.children,l);g(_,t,e,u)}else if(Number.isNaN(parseFloat(o.name)))if(C){const t=f(_,o,l);g(_,t,e,u,o.voidElement)}else if(r.transSupportBasicHtmlNodes&&d.indexOf(o.name)>-1)if(o.voidElement)e.push(s.createElement(o.name,{key:`${o.name}-${u}`}));else{const t=m(p,o.children,l);e.push(s.createElement(o.name,{key:`${o.name}-${u}`},t))}else if(o.voidElement)e.push(`<${o.name} />`);else{const t=m(p,o.children,l);e.push(`<${o.name}>${t}</${o.name}>`)}else if(a(_)&&!y){const t=o.children[0]?v:null;t&&e.push(t)}else g(_,v,e,u,1!==o.children.length||!v)}else if("text"===o.type){const t=r.transWrapTextNodes,n=c?r.unescape(i.services.interpolator.interpolate(o.content,b,i.language)):i.services.interpolator.interpolate(o.content,b,i.language);t?e.push(s.createElement(t,{key:`${o.name}-${u}`},n)):e.push(n)}return e},[])},_=m([{dummy:!0,children:e||[]}],v,F(e||[]));return T(_[0])},H=(e,t,o)=>{const i=e.key||t,n=s.cloneElement(e,{key:i});if(!n.props||!n.props.children||o.indexOf(`${t}/>`)<0&&o.indexOf(`${t} />`)<0)return n;return s.createElement(function(){return s.createElement(s.Fragment,null,n)},{key:i})},q=(e,o,s,i)=>e?Array.isArray(e)?((e,t)=>e.map((e,o)=>H(e,o,t)))(e,o):a(e)?((e,t)=>{const o={};return Object.keys(e).forEach(s=>{Object.assign(o,{[s]:H(e[s],s,t)})}),o})(e,o):(t(s,"TRANS_INVALID_COMPONENTS",'<Trans /> "components" prop expects an object or array',{i18nKey:i}),null):null;function U({children:e,count:r,parent:l,i18nKey:c,context:d,tOptions:h={},values:p,defaults:u,components:v,ns:b,i18n:f,t:g,shouldUnescape:m,..._}){const y=f||i();if(!y)return t(y,"NO_I18NEXT_INSTANCE","Trans: You need to pass in an i18next instance using i18nextReactModule",{i18nKey:c}),e;const x=g||y.t.bind(y)||(e=>e),w={...o(),...y.options?.react};let C=b||x.ns||y.options?.defaultNS;C=n(C)?[C]:C||["translation"];const k=N(e,w,y,c),S=u||k||w.transEmptyNodeValue||c,{hashTransKey:$}=w,E=c||($?$(k||S):k||S);y.options?.interpolation?.defaultVariables&&(p=p&&Object.keys(p).length>0?{...p,...y.options.interpolation.defaultVariables}:{...y.options.interpolation.defaultVariables});const I=p||void 0!==r&&!y.options?.interpolation?.alwaysFormat||!e?h.interpolation:{interpolation:{...h.interpolation,prefix:"#$?",suffix:"?$#"}},A={...h,context:d||h.context,count:r,...p,...I,defaultValue:S,ns:C},O=E?x(E,A):S,P=q(v,O,y,c);let R=P||e,B=null;var z;a(z=P)&&!Array.isArray(z)&&Object.keys(z).reduce((e,t)=>e&&Number.isNaN(Number.parseFloat(t)),!0)&&(B=P,R=e);const V=j(R,B,O,y,w,A,m),D=l??w.defaultTransParent;return D?s.createElement(D,_,V):V}function W({children:e,count:t,parent:o,i18nKey:n,context:r,tOptions:a={},values:c,defaults:d,components:h,ns:p,i18n:u,t:v,shouldUnescape:b,...f}){const{i18n:g,defaultNS:m}=s.useContext(l)||{},_=u||g||i(),y=v||_?.t.bind(_);return U({children:e,count:t,parent:o,i18nKey:n,context:r,tOptions:a,values:c,defaults:d,components:h,ns:p||y?.ns||m||_?.options?.defaultNS,i18n:_,t:v,shouldUnescape:b,...f})}function K(){const e=c("docs-link");return(t,o)=>function(e,t,o){if(t){const s=t.replace(/^\//,""),[i,n]=s.split("#");if(o){const t=`${e}/${i}/#${encodeURIComponent(o)}`;return n?`${t}#${n}`:t}return`${e}/${i}`}return e}(e,t,o)}const G=s.forwardRef(({href:e,external:t=!1,children:o,...s},i)=>{const n=t?{target:"_blank",rel:"noopener noreferrer"}:{};return d.jsx(h,{asChild:!0,...s,children:d.jsx("a",{href:e,ref:i,...n,children:o})})});G.displayName="ButtonLink";function Y(){const{t:e}=p();return d.jsxs("div",{className:"mb-4 flex flex-col items-center",children:[d.jsx(h,{size:"lg",onClick:()=>{u.postMessage({type:"sign-in"})},className:"mt-4 rounded-lg px-10",variant:"primary",children:e("common:signIn.signInSSO")}),d.jsx("p",{className:"text-vscode-descriptionForeground mb-0 mt-8 font-medium max-w-75",children:e("common:signIn.noSubscription")}),d.jsx(G,{href:"https://bob.ibm.com/trial?source=ibm-bob",className:"rounded-lg px-8 mt-2",variant:"secondary",external:!0,children:e("common:signIn.signUp")}),d.jsx(_,{href:"https://www.ibm.com/privacy",className:"block mt-2",children:e("common:signIn.privacyPolicy")})]})}const X=v.forwardRef(function({children:e,size:t=16,...o},s){return v.createElement(E,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 32 32",fill:"currentColor",...o},d.jsx("path",{d:"M28.07 21 22 15 28.07 9 29.5 10.41 24.86 15 29.5 19.59 28.07 21z"}),d.jsx("path",{d:"M22,30H20V25a5,5,0,0,0-5-5H9a5,5,0,0,0-5,5v5H2V25a7,7,0,0,1,7-7h6a7,7,0,0,1,7,7Z"}),d.jsx("path",{d:"M12,4A5,5,0,1,1,7,9a5,5,0,0,1,5-5m0-2a7,7,0,1,0,7,7A7,7,0,0,0,12,2Z"}),e)}),Z=v.forwardRef(function({children:e,size:t=16,...o},s){return 16===t||"16"===t||"16px"===t?v.createElement(E,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...o},d.jsx("path",{d:"M15.5,7.8C14.3,4.7,11.3,2.6,8,2.5C4.7,2.6,1.7,4.7,0.5,7.8c0,0.1,0,0.2,0,0.3c1.2,3.1,4.1,5.2,7.5,5.3 c3.3-0.1,6.3-2.2,7.5-5.3C15.5,8.1,15.5,7.9,15.5,7.8z M8,12.5c-2.7,0-5.4-2-6.5-4.5c1-2.5,3.8-4.5,6.5-4.5s5.4,2,6.5,4.5 C13.4,10.5,10.6,12.5,8,12.5z"}),d.jsx("path",{d:"M8,5C6.3,5,5,6.3,5,8s1.3,3,3,3s3-1.3,3-3S9.7,5,8,5z M8,10c-1.1,0-2-0.9-2-2s0.9-2,2-2s2,0.9,2,2S9.1,10,8,10z"}),e):v.createElement(E,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 32 32",fill:"currentColor",...o},d.jsx("path",{d:"M30.94,15.66A16.69,16.69,0,0,0,16,5,16.69,16.69,0,0,0,1.06,15.66a1,1,0,0,0,0,.68A16.69,16.69,0,0,0,16,27,16.69,16.69,0,0,0,30.94,16.34,1,1,0,0,0,30.94,15.66ZM16,25c-5.3,0-10.9-3.93-12.93-9C5.1,10.93,10.7,7,16,7s10.9,3.93,12.93,9C26.9,21.07,21.3,25,16,25Z"}),d.jsx("path",{d:"M16,10a6,6,0,1,0,6,6A6,6,0,0,0,16,10Zm0,10a4,4,0,1,1,4-4A4,4,0,0,1,16,20Z"}),e)}),J=v.forwardRef(function({children:e,size:t=16,...o},s){return 16===t||"16"===t||"16px"===t?v.createElement(E,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...o},d.jsx("path",{d:"M14.5,14h-13c-0.2,0-0.3-0.1-0.4-0.2c-0.1-0.2-0.1-0.3,0-0.5l6.5-12C7.7,1,8,0.9,8.2,1.1c0.1,0,0.2,0.1,0.2,0.2l6.5,12 c0.1,0.2,0.1,0.3,0,0.5C14.9,13.9,14.7,14,14.5,14z M2.3,13h11.3L8,2.5L2.3,13z"}),d.jsx("path",{d:"M7.5 6H8.5V9.5H7.5z"}),d.jsx("path",{d:"M8,10.8c-0.4,0-0.8,0.3-0.8,0.8s0.3,0.8,0.8,0.8c0.4,0,0.8-0.3,0.8-0.8S8.4,10.8,8,10.8z"}),e):v.createElement(E,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 32 32",fill:"currentColor",...o},d.jsx("path",{d:"M16,23a1.5,1.5,0,1,0,1.5,1.5A1.5,1.5,0,0,0,16,23Z"}),d.jsx("path",{d:"M15 12H17V21H15z"}),d.jsx("path",{d:"M29,30H3a1,1,0,0,1-.8872-1.4614l13-25a1,1,0,0,1,1.7744,0l13,25A1,1,0,0,1,29,30ZM4.6507,28H27.3493l.002-.0033L16.002,6.1714h-.004L4.6487,27.9967Z"}),e)}),Q=new Set(["children","localName","ref","style","className"]),ee=new WeakMap,te=(e,t,o,s,i)=>{const n=i?.[t];void 0===n?(e[t]=o,null==o&&t in HTMLElement.prototype&&e.removeAttribute(t)):o!==s&&((e,t,o)=>{let s=ee.get(e);void 0===s&&ee.set(e,s=new Map);let i=s.get(t);void 0!==o?void 0===i?(s.set(t,i={handleEvent:o}),e.addEventListener(t,i)):i.handleEvent=o:void 0!==i&&(s.delete(t),e.removeEventListener(t,i))})(e,n,o)},oe=({react:e,tagName:t,elementClass:o,events:s,displayName:i})=>{const n=new Set(Object.keys(s??{})),r=e.forwardRef((i,r)=>{const a=e.useRef(new Map),l=e.useRef(null),c={},d={};for(const[e,t]of Object.entries(i))Q.has(e)?c["className"===e?"class":e]=t:n.has(e)||e in o.prototype?d[e]=t:c[e]=t;return e.useLayoutEffect(()=>{if(null===l.current)return;const e=new Map;for(const t in d)te(l.current,t,i[t],a.current.get(t),s),a.current.delete(t),e.set(t,i[t]);for(const[t,o]of a.current)te(l.current,t,void 0,o,s);a.current=e}),e.useLayoutEffect(()=>{l.current?.removeAttribute("defer-hydration")},[]),c.suppressHydrationWarning=!0,e.createElement(t,{...c,ref:e.useCallback(e=>{l.current=e,"function"==typeof r?r(e):null!==r&&(r.current=e)},[r])})});return r.displayName=i??o.name,r},se=globalThis,ie=se.ShadowRoot&&(void 0===se.ShadyCSS||se.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,ne=Symbol(),re=new WeakMap;let ae=class{constructor(e,t,o){if(this._$cssResult$=!0,o!==ne)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(ie&&void 0===e){const o=void 0!==t&&1===t.length;o&&(e=re.get(t)),void 0===e&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),o&&re.set(t,e))}return e}toString(){return this.cssText}};const le=e=>new ae("string"==typeof e?e:e+"",void 0,ne),ce=(e,...t)=>{const o=1===e.length?e[0]:t.reduce((t,o,s)=>t+(e=>{if(!0===e._$cssResult$)return e.cssText;if("number"==typeof e)return e;throw Error("Value passed to 'css' function must be a 'css' function result: "+e+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(o)+e[s+1],e[0]);return new ae(o,e,ne)},de=ie?e=>e:e=>e instanceof CSSStyleSheet?(e=>{let t="";for(const o of e.cssRules)t+=o.cssText;return le(t)})(e):e,{is:he,defineProperty:pe,getOwnPropertyDescriptor:ue,getOwnPropertyNames:ve,getOwnPropertySymbols:be,getPrototypeOf:fe}=Object,ge=globalThis,me=ge.trustedTypes,_e=me?me.emptyScript:"",ye=ge.reactiveElementPolyfillSupport,xe=(e,t)=>e,we={toAttribute(e,t){switch(t){case Boolean:e=e?_e:null;break;case Object:case Array:e=null==e?e:JSON.stringify(e)}return e},fromAttribute(e,t){let o=e;switch(t){case Boolean:o=null!==e;break;case Number:o=null===e?null:Number(e);break;case Object:case Array:try{o=JSON.parse(e)}catch(s){o=null}}return o}},Ce=(e,t)=>!he(e,t),ke={attribute:!0,type:String,converter:we,reflect:!1,useDefault:!1,hasChanged:Ce};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),ge.litPropertyMetadata??(ge.litPropertyMetadata=new WeakMap);let Se=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=ke){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const o=Symbol(),s=this.getPropertyDescriptor(e,o,t);void 0!==s&&pe(this.prototype,e,s)}}static getPropertyDescriptor(e,t,o){const{get:s,set:i}=ue(this.prototype,e)??{get(){return this[t]},set(e){this[t]=e}};return{get:s,set(t){const n=s?.call(this);i?.call(this,t),this.requestUpdate(e,n,o)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??ke}static _$Ei(){if(this.hasOwnProperty(xe("elementProperties")))return;const e=fe(this);e.finalize(),void 0!==e.l&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(xe("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(xe("properties"))){const e=this.properties,t=[...ve(e),...be(e)];for(const o of t)this.createProperty(o,e[o])}const e=this[Symbol.metadata];if(null!==e){const t=litPropertyMetadata.get(e);if(void 0!==t)for(const[e,o]of t)this.elementProperties.set(e,o)}this._$Eh=new Map;for(const[t,o]of this.elementProperties){const e=this._$Eu(t,o);void 0!==e&&this._$Eh.set(e,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const o=new Set(e.flat(1/0).reverse());for(const e of o)t.unshift(de(e))}else void 0!==e&&t.push(de(e));return t}static _$Eu(e,t){const o=t.attribute;return!1===o?void 0:"string"==typeof o?o:"string"==typeof e?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??(this._$EO=new Set)).add(e),void 0!==this.renderRoot&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const o of t.keys())this.hasOwnProperty(o)&&(e.set(o,this[o]),delete this[o]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((e,t)=>{if(ie)e.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(const o of t){const t=document.createElement("style"),s=se.litNonce;void 0!==s&&t.setAttribute("nonce",s),t.textContent=o.cssText,e.appendChild(t)}})(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,o){this._$AK(e,o)}_$ET(e,t){const o=this.constructor.elementProperties.get(e),s=this.constructor._$Eu(e,o);if(void 0!==s&&!0===o.reflect){const i=(void 0!==o.converter?.toAttribute?o.converter:we).toAttribute(t,o.type);this._$Em=e,null==i?this.removeAttribute(s):this.setAttribute(s,i),this._$Em=null}}_$AK(e,t){const o=this.constructor,s=o._$Eh.get(e);if(void 0!==s&&this._$Em!==s){const e=o.getPropertyOptions(s),i="function"==typeof e.converter?{fromAttribute:e.converter}:void 0!==e.converter?.fromAttribute?e.converter:we;this._$Em=s;const n=i.fromAttribute(t,e.type);this[s]=n??this._$Ej?.get(s)??n,this._$Em=null}}requestUpdate(e,t,o,s=!1,i){if(void 0!==e){const n=this.constructor;if(!1===s&&(i=this[e]),o??(o=n.getPropertyOptions(e)),!((o.hasChanged??Ce)(i,t)||o.useDefault&&o.reflect&&i===this._$Ej?.get(e)&&!this.hasAttribute(n._$Eu(e,o))))return;this.C(e,t,o)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(e,t,{useDefault:o,reflect:s,wrapped:i},n){o&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,n??t??this[e]),!0!==i||void 0!==n)||(this._$AL.has(e)||(this.hasUpdated||o||(t=void 0),this._$AL.set(e,t)),!0===s&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return null!=e&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[e,t]of this._$Ep)this[e]=t;this._$Ep=void 0}const e=this.constructor.elementProperties;if(e.size>0)for(const[t,o]of e){const{wrapped:e}=o,s=this[t];!0!==e||this._$AL.has(t)||void 0===s||this.C(t,void 0,o,s)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(e=>e.hostUpdate?.()),this.update(t)):this._$EM()}catch(o){throw e=!1,this._$EM(),o}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(e=>this._$ET(e,this[e]))),this._$EM()}updated(e){}firstUpdated(e){}};Se.elementStyles=[],Se.shadowRootOptions={mode:"open"},Se[xe("elementProperties")]=new Map,Se[xe("finalized")]=new Map,ye?.({ReactiveElement:Se}),(ge.reactiveElementVersions??(ge.reactiveElementVersions=[])).push("2.1.2");const $e=globalThis,Ee=e=>e,Ie=$e.trustedTypes,Ae=Ie?Ie.createPolicy("lit-html",{createHTML:e=>e}):void 0,Oe="$lit$",Pe=`lit$${Math.random().toFixed(9).slice(2)}$`,Re="?"+Pe,Be=`<${Re}>`,ze=document,Ve=()=>ze.createComment(""),De=e=>null===e||"object"!=typeof e&&"function"!=typeof e,Le=Array.isArray,Me="[ \t\n\f\r]",Te=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,Fe=/-->/g,Ne=/>/g,je=RegExp(`>|${Me}(?:([^\\s"'>=/]+)(${Me}*=${Me}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),He=/'/g,qe=/"/g,Ue=/^(?:script|style|textarea|title)$/i,We=e=>(t,...o)=>({_$litType$:e,strings:t,values:o}),Ke=We(1),Ge=We(2),Ye=Symbol.for("lit-noChange"),Xe=Symbol.for("lit-nothing"),Ze=new WeakMap,Je=ze.createTreeWalker(ze,129);function Qe(e,t){if(!Le(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==Ae?Ae.createHTML(t):t}class et{constructor({strings:e,_$litType$:t},o){let s;this.parts=[];let i=0,n=0;const r=e.length-1,a=this.parts,[l,c]=((e,t)=>{const o=e.length-1,s=[];let i,n=2===t?"<svg>":3===t?"<math>":"",r=Te;for(let a=0;a<o;a++){const t=e[a];let o,l,c=-1,d=0;for(;d<t.length&&(r.lastIndex=d,l=r.exec(t),null!==l);)d=r.lastIndex,r===Te?"!--"===l[1]?r=Fe:void 0!==l[1]?r=Ne:void 0!==l[2]?(Ue.test(l[2])&&(i=RegExp("</"+l[2],"g")),r=je):void 0!==l[3]&&(r=je):r===je?">"===l[0]?(r=i??Te,c=-1):void 0===l[1]?c=-2:(c=r.lastIndex-l[2].length,o=l[1],r=void 0===l[3]?je:'"'===l[3]?qe:He):r===qe||r===He?r=je:r===Fe||r===Ne?r=Te:(r=je,i=void 0);const h=r===je&&e[a+1].startsWith("/>")?" ":"";n+=r===Te?t+Be:c>=0?(s.push(o),t.slice(0,c)+Oe+t.slice(c)+Pe+h):t+Pe+(-2===c?a:h)}return[Qe(e,n+(e[o]||"<?>")+(2===t?"</svg>":3===t?"</math>":"")),s]})(e,t);if(this.el=et.createElement(l,o),Je.currentNode=this.el.content,2===t||3===t){const e=this.el.content.firstChild;e.replaceWith(...e.childNodes)}for(;null!==(s=Je.nextNode())&&a.length<r;){if(1===s.nodeType){if(s.hasAttributes())for(const e of s.getAttributeNames())if(e.endsWith(Oe)){const t=c[n++],o=s.getAttribute(e).split(Pe),r=/([.?@])?(.*)/.exec(t);a.push({type:1,index:i,name:r[2],strings:o,ctor:"."===r[1]?nt:"?"===r[1]?rt:"@"===r[1]?at:it}),s.removeAttribute(e)}else e.startsWith(Pe)&&(a.push({type:6,index:i}),s.removeAttribute(e));if(Ue.test(s.tagName)){const e=s.textContent.split(Pe),t=e.length-1;if(t>0){s.textContent=Ie?Ie.emptyScript:"";for(let o=0;o<t;o++)s.append(e[o],Ve()),Je.nextNode(),a.push({type:2,index:++i});s.append(e[t],Ve())}}}else if(8===s.nodeType)if(s.data===Re)a.push({type:2,index:i});else{let e=-1;for(;-1!==(e=s.data.indexOf(Pe,e+1));)a.push({type:7,index:i}),e+=Pe.length-1}i++}}static createElement(e,t){const o=ze.createElement("template");return o.innerHTML=e,o}}function tt(e,t,o=e,s){if(t===Ye)return t;let i=void 0!==s?o._$Co?.[s]:o._$Cl;const n=De(t)?void 0:t._$litDirective$;return i?.constructor!==n&&(i?._$AO?.(!1),void 0===n?i=void 0:(i=new n(e),i._$AT(e,o,s)),void 0!==s?(o._$Co??(o._$Co=[]))[s]=i:o._$Cl=i),void 0!==i&&(t=tt(e,i._$AS(e,t.values),i,s)),t}class ot{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:o}=this._$AD,s=(e?.creationScope??ze).importNode(t,!0);Je.currentNode=s;let i=Je.nextNode(),n=0,r=0,a=o[0];for(;void 0!==a;){if(n===a.index){let t;2===a.type?t=new st(i,i.nextSibling,this,e):1===a.type?t=new a.ctor(i,a.name,a.strings,this,e):6===a.type&&(t=new lt(i,this,e)),this._$AV.push(t),a=o[++r]}n!==a?.index&&(i=Je.nextNode(),n++)}return Je.currentNode=ze,s}p(e){let t=0;for(const o of this._$AV)void 0!==o&&(void 0!==o.strings?(o._$AI(e,o,t),t+=o.strings.length-2):o._$AI(e[t])),t++}}class st{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,o,s){this.type=2,this._$AH=Xe,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=o,this.options=s,this._$Cv=s?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return void 0!==t&&11===e?.nodeType&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=tt(this,e,t),De(e)?e===Xe||null==e||""===e?(this._$AH!==Xe&&this._$AR(),this._$AH=Xe):e!==this._$AH&&e!==Ye&&this._(e):void 0!==e._$litType$?this.$(e):void 0!==e.nodeType?this.T(e):(e=>Le(e)||"function"==typeof e?.[Symbol.iterator])(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==Xe&&De(this._$AH)?this._$AA.nextSibling.data=e:this.T(ze.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:o}=e,s="number"==typeof o?this._$AC(e):(void 0===o.el&&(o.el=et.createElement(Qe(o.h,o.h[0]),this.options)),o);if(this._$AH?._$AD===s)this._$AH.p(t);else{const e=new ot(s,this),o=e.u(this.options);e.p(t),this.T(o),this._$AH=e}}_$AC(e){let t=Ze.get(e.strings);return void 0===t&&Ze.set(e.strings,t=new et(e)),t}k(e){Le(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let o,s=0;for(const i of e)s===t.length?t.push(o=new st(this.O(Ve()),this.O(Ve()),this,this.options)):o=t[s],o._$AI(i),s++;s<t.length&&(this._$AR(o&&o._$AB.nextSibling,s),t.length=s)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const t=Ee(e).nextSibling;Ee(e).remove(),e=t}}setConnected(e){void 0===this._$AM&&(this._$Cv=e,this._$AP?.(e))}}class it{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,o,s,i){this.type=1,this._$AH=Xe,this._$AN=void 0,this.element=e,this.name=t,this._$AM=s,this.options=i,o.length>2||""!==o[0]||""!==o[1]?(this._$AH=Array(o.length-1).fill(new String),this.strings=o):this._$AH=Xe}_$AI(e,t=this,o,s){const i=this.strings;let n=!1;if(void 0===i)e=tt(this,e,t,0),n=!De(e)||e!==this._$AH&&e!==Ye,n&&(this._$AH=e);else{const s=e;let r,a;for(e=i[0],r=0;r<i.length-1;r++)a=tt(this,s[o+r],t,r),a===Ye&&(a=this._$AH[r]),n||(n=!De(a)||a!==this._$AH[r]),a===Xe?e=Xe:e!==Xe&&(e+=(a??"")+i[r+1]),this._$AH[r]=a}n&&!s&&this.j(e)}j(e){e===Xe?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class nt extends it{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===Xe?void 0:e}}class rt extends it{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==Xe)}}class at extends it{constructor(e,t,o,s,i){super(e,t,o,s,i),this.type=5}_$AI(e,t=this){if((e=tt(this,e,t,0)??Xe)===Ye)return;const o=this._$AH,s=e===Xe&&o!==Xe||e.capture!==o.capture||e.once!==o.once||e.passive!==o.passive,i=e!==Xe&&(o===Xe||s);s&&this.element.removeEventListener(this.name,this,o),i&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class lt{constructor(e,t,o){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=o}get _$AU(){return this._$AM._$AU}_$AI(e){tt(this,e)}}const ct={I:st},dt=$e.litHtmlPolyfillSupport;dt?.(et,st),($e.litHtmlVersions??($e.litHtmlVersions=[])).push("3.3.3");const ht=(e,t,o)=>{const s=o?.renderBefore??t;let i=s._$litPart$;if(void 0===i){const e=o?.renderBefore??null;s._$litPart$=i=new st(t.insertBefore(Ve(),e),e,void 0,o??{})}return i._$AI(e),i},pt=globalThis;let ut=class extends Se{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e;const t=super.createRenderRoot();return(e=this.renderOptions).renderBefore??(e.renderBefore=t.firstChild),t}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=ht(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return Ye}};ut._$litElement$=!0,ut.finalized=!0,pt.litElementHydrateSupport?.({LitElement:ut});const vt=pt.litElementPolyfillSupport;vt?.({LitElement:ut}),(pt.litElementVersions??(pt.litElementVersions=[])).push("4.2.2");const bt={attribute:!0,type:String,converter:we,reflect:!1,hasChanged:Ce},ft=(e=bt,t,o)=>{const{kind:s,metadata:i}=o;let n=globalThis.litPropertyMetadata.get(i);if(void 0===n&&globalThis.litPropertyMetadata.set(i,n=new Map),"setter"===s&&((e=Object.create(e)).wrapped=!0),n.set(o.name,e),"accessor"===s){const{name:s}=o;return{set(o){const i=t.get.call(this);t.set.call(this,o),this.requestUpdate(s,i,e,!0,o)},init(t){return void 0!==t&&this.C(s,void 0,e,t),t}}}if("setter"===s){const{name:s}=o;return function(o){const i=this[s];t.call(this,o),this.requestUpdate(s,i,e,!0,o)}}throw Error("Unsupported decorator location: "+s)};function gt(e){return(t,o)=>"object"==typeof o?ft(e,t,o):((e,t,o)=>{const s=t.hasOwnProperty(o);return t.constructor.createProperty(o,e),s?Object.getOwnPropertyDescriptor(t,o):void 0})(e,t,o)}function mt(e){return gt({...e,state:!0,attribute:!1})}const _t=(e,t,o)=>(o.configurable=!0,o.enumerable=!0,Reflect.decorate&&"object"!=typeof t&&Object.defineProperty(e,t,o),o);function yt(e,t){return(o,s,i)=>{const n=t=>t.renderRoot?.querySelector(e)??null;if(t){const{get:e,set:t}="object"==typeof s?o:i??(()=>{const e=Symbol();return{get(){return this[e]},set(t){this[e]=t}}})();return _t(o,s,{get(){let o=e.call(this);return void 0===o&&(o=n(this),(null!==o||this.hasUpdated)&&t.call(this,o)),o}})}return _t(o,s,{get(){return n(this)}})}}let xt;function wt(e){return(t,o)=>{const{slot:s,selector:i}=e??{},n="slot"+(s?`[name=${s}]`:":not([name])");return _t(t,o,{get(){const t=this.renderRoot?.querySelector(n),o=t?.assignedElements(e)??[];return void 0===i?o:o.filter(e=>e.matches(i))}})}}const Ct="2.5.1",kt="__vscodeElements_disableRegistryWarning__",St=(e,t)=>{t?console.warn(`[VSCode Elements] ${e}\n%o`,t):console.warn(`${e}\n%o`,t)};class $t extends ut{get version(){return Ct}warn(e){St(e,this)}}const Et=e=>t=>{if(!customElements.get(e))return void customElements.define(e,t);if(kt in window)return;const o=document.createElement(e),s=o?.version;let i="";s?s!==Ct?(i+="is already registered by a different version of VSCode Elements. ",i+=`This version is "${Ct}", while the other one is "${s}".`):i+=`is already registered by the same version of VSCode Elements (${Ct}).`:i+="is already registered by an unknown custom element handler class.",St(`The custom element "${e}" ${i}\nTo suppress this warning, set window.${kt} to true`)},It=ce`
  :host([hidden]) {
    display: none;
  }

  :host([disabled]),
  :host(:disabled) {
    cursor: not-allowed;
    opacity: 0.4;
    pointer-events: none;
  }
`,At=16/13;function Ot(){return navigator.userAgent.indexOf("Linux")>-1?'system-ui, "Ubuntu", "Droid Sans", sans-serif':navigator.userAgent.indexOf("Mac")>-1?"-apple-system, BlinkMacSystemFont, sans-serif":navigator.userAgent.indexOf("Windows")>-1?'"Segoe WPC", "Segoe UI", sans-serif':"sans-serif"}const Pt=[It,ce`
    :host {
      display: inline-block;
    }

    .root {
      background-color: var(--vscode-badge-background, #616161);
      border: 1px solid var(--vscode-contrastBorder, transparent);
      border-radius: 2px;
      box-sizing: border-box;
      color: var(--vscode-badge-foreground, #f8f8f8);
      display: block;
      font-family: var(--vscode-font-family, ${le(Ot())});
      font-size: 11px;
      font-weight: 400;
      line-height: 14px;
      min-width: 18px;
      padding: 2px 3px;
      text-align: center;
      white-space: nowrap;
    }

    :host([variant='counter']) .root {
      border-radius: 11px;
      line-height: 11px;
      min-height: 18px;
      min-width: 18px;
      padding: 3px 6px;
    }

    :host([variant='activity-bar-counter']) .root {
      background-color: var(--vscode-activityBarBadge-background, #0078d4);
      border-radius: 20px;
      color: var(--vscode-activityBarBadge-foreground, #ffffff);
      font-size: 9px;
      font-weight: 600;
      line-height: 16px;
      padding: 0 4px;
    }

    :host([variant='tab-header-counter']) .root {
      background-color: var(--vscode-activityBarBadge-background, #0078d4);
      border-radius: 10px;
      color: var(--vscode-activityBarBadge-foreground, #ffffff);
      line-height: 10px;
      min-height: 16px;
      min-width: 16px;
      padding: 3px 5px;
    }
  `];var Rt=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Bt=class extends $t{constructor(){super(...arguments),this.variant="default"}render(){return Ke`<div class="root"><slot></slot></div>`}};Bt.styles=Pt,Rt([gt({reflect:!0})],Bt.prototype,"variant",void 0),Bt=Rt([Et("vscode-badge")],Bt);const zt=oe({tagName:"vscode-badge",elementClass:Bt,react:v,displayName:"VscodeBadge"}),Vt=1,Dt=2,Lt=3,Mt=e=>(...t)=>({_$litDirective$:e,values:t});let Tt=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,o){this._$Ct=e,this._$AM=t,this._$Ci=o}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};const Ft=Mt(class extends Tt{constructor(e){if(super(e),e.type!==Vt||"class"!==e.name||e.strings?.length>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(e){return" "+Object.keys(e).filter(t=>e[t]).join(" ")+" "}update(e,[t]){if(void 0===this.st){this.st=new Set,void 0!==e.strings&&(this.nt=new Set(e.strings.join(" ").split(/\s/).filter(e=>""!==e)));for(const e in t)t[e]&&!this.nt?.has(e)&&this.st.add(e);return this.render(t)}const o=e.element.classList;for(const s of this.st)s in t||(o.remove(s),this.st.delete(s));for(const s in t){const e=!!t[s];e===this.st.has(s)||this.nt?.has(s)||(e?(o.add(s),this.st.add(s)):(o.remove(s),this.st.delete(s)))}return Ye}}),Nt=e=>e??Xe;const jt=Mt(class extends Tt{constructor(e){if(super(e),this._prevProperties={},e.type!==Lt||"style"!==e.name)throw new Error("The `stylePropertyMap` directive must be used in the `style` property")}update(e,[t]){return Object.entries(t).forEach(([t,o])=>{this._prevProperties[t]!==o&&(t.startsWith("--")?e.element.style.setProperty(t,o):e.element.style[t]=o,this._prevProperties[t]=o)}),Ye}render(e){return Ye}}),Ht=[It,ce`
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
  `];var qt,Ut=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Wt=qt=class extends $t{constructor(){super(...arguments),this.label="",this.name="",this.size=16,this.spin=!1,this.spinDuration=1.5,this.actionIcon=!1,this._onButtonClick=e=>{this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:e}}))}}connectedCallback(){super.connectedCallback();const{href:e,nonce:t}=this._getStylesheetConfig();qt.stylesheetHref=e,qt.nonce=t}_getStylesheetConfig(){if("undefined"==typeof document)return{nonce:void 0,href:void 0};const e=document.getElementById("vscode-codicon-stylesheet"),t=e?.getAttribute("href")||void 0,o=e?.nonce||void 0;if(!e){let e='To use the Icon component, the codicons.css file must be included in the page with the id "vscode-codicon-stylesheet"! ';e+="See https://vscode-elements.github.io/components/icon/ for more details.",this.warn(e)}return{nonce:o,href:t}}render(){const{stylesheetHref:e,nonce:t}=qt,o=Ke`<span
      class=${Ft({codicon:!0,["codicon-"+this.name]:!0,spin:this.spin})}
      .style=${jt({animationDuration:String(this.spinDuration)+"s",fontSize:this.size+"px",height:this.size+"px",width:this.size+"px"})}
    ></span>`,s=this.actionIcon?Ke` <button
          class="button"
          @click=${this._onButtonClick}
          aria-label=${this.label}
        >
          ${o}
        </button>`:Ke` <span class="icon" aria-hidden="true" role="presentation"
          >${o}</span
        >`;return Ke`
      <link
        rel="stylesheet"
        href=${Nt(e)}
        nonce=${Nt(t)}
      />
      ${s}
    `}};Wt.styles=Ht,Wt.stylesheetHref="",Wt.nonce="",Ut([gt()],Wt.prototype,"label",void 0),Ut([gt({type:String})],Wt.prototype,"name",void 0),Ut([gt({type:Number})],Wt.prototype,"size",void 0),Ut([gt({type:Boolean,reflect:!0})],Wt.prototype,"spin",void 0),Ut([gt({type:Number,attribute:"spin-duration"})],Wt.prototype,"spinDuration",void 0),Ut([gt({type:Boolean,reflect:!0,attribute:"action-icon"})],Wt.prototype,"actionIcon",void 0),Wt=qt=Ut([Et("vscode-icon")],Wt);const Kt=[It,ce`
    :host {
      cursor: pointer;
      display: inline-block;
      width: auto;
    }

    :host([block]) {
      display: block;
      width: 100%;
    }

    .base {
      align-items: center;
      background-color: var(--vscode-button-background, #0078d4);
      border-bottom-left-radius: var(--vsc-border-left-radius, 4px);
      border-bottom-right-radius: var(--vsc-border-right-radius, 4px);
      border-bottom-width: 1px;
      border-color: var(--vscode-button-border, transparent);
      border-left-width: var(--vsc-border-left-width, 1px);
      border-right-width: var(--vsc-border-right-width, 1px);
      border-style: solid;
      border-top-left-radius: var(--vsc-border-left-radius, 4px);
      border-top-right-radius: var(--vsc-border-right-radius, 4px);
      border-top-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-button-foreground, #ffffff);
      display: flex;
      font-family: var(--vscode-font-family, ${le(Ot())});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      height: 100%;
      justify-content: center;
      line-height: 22px;
      overflow: hidden;
      padding: 1px calc(13px + var(--vsc-base-additional-right-padding, 0px))
        1px 13px;
      position: relative;
      user-select: none;
      white-space: nowrap;
      width: 100%;
    }

    :host([block]) .base {
      min-height: 28px;
      text-align: center;
      width: 100%;
    }

    .base:after {
      background-color: var(
        --vscode-button-separator,
        rgba(255, 255, 255, 0.4)
      );
      content: var(--vsc-base-after-content);
      display: var(--vsc-divider-display, none);
      position: absolute;
      right: 0;
      top: 4px;
      bottom: 4px;
      width: 1px;
    }

    :host([secondary]) .base:after {
      background-color: var(--vscode-button-secondaryForeground, #cccccc);
      opacity: 0.4;
    }

    :host([secondary]) .base {
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

    :host(:hover) .base {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }

    :host([disabled]:hover) .base {
      background-color: var(--vscode-button-background, #0078d4);
    }

    :host([secondary]:hover) .base {
      background-color: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
    }

    :host([secondary][disabled]:hover) .base {
      background-color: var(--vscode-button-secondaryBackground, #313131);
    }

    :host(:focus),
    :host(:active) {
      outline: none;
    }

    :host(:focus) .base {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: 2px;
    }

    :host([disabled]:focus) .base {
      background-color: var(--vscode-button-background, #0078d4);
      outline: 0;
    }

    :host([secondary]:focus) .base {
      background-color: var(--vscode-button-secondaryHoverBackground, #3c3c3c);
    }

    :host([secondary][disabled]:focus) .base {
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

    .content {
      display: flex;
      position: relative;
      width: 100%;
      height: 100%;
      padding: 1px 13px;
    }

    :host(:empty) .base,
    .base.icon-only {
      min-height: 24px;
      min-width: 26px;
      padding: 1px 4px;
    }

    slot {
      align-items: center;
      display: flex;
      height: 100%;
    }

    .has-content-before slot[name='content-before'] {
      margin-right: 4px;
    }

    .has-content-after slot[name='content-after'] {
      margin-left: 4px;
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
  `];var Gt=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Yt=class extends $t{get form(){return this._internals.form}constructor(){super(),this.autofocus=!1,this.tabIndex=0,this.secondary=!1,this.block=!1,this.role="button",this.disabled=!1,this.icon="",this.iconSpin=!1,this.iconAfter="",this.iconAfterSpin=!1,this.focused=!1,this.name=void 0,this.iconOnly=!1,this.type="button",this.value="",this._prevTabindex=0,this._hasContentBefore=!1,this._hasContentAfter=!1,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1},this.addEventListener("keydown",this._handleKeyDown.bind(this)),this.addEventListener("click",this._handleClick.bind(this)),this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.autofocus&&(this.tabIndex<0&&(this.tabIndex=0),this.updateComplete.then(()=>{this.focus(),this.requestUpdate()})),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}update(e){super.update(e),e.has("value")&&this._internals.setFormValue(this.value),e.has("disabled")&&(this.disabled?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):this.tabIndex=this._prevTabindex)}_executeAction(){"submit"===this.type&&this._internals.form&&this._internals.form.requestSubmit(),"reset"===this.type&&this._internals.form&&this._internals.form.reset()}_handleKeyDown(e){if(("Enter"===e.key||" "===e.key)&&!this.hasAttribute("disabled")){const e=new MouseEvent("click",{bubbles:!0,cancelable:!0});e.synthetic=!0,this.dispatchEvent(e),this._executeAction()}}_handleClick(e){e.synthetic||this.hasAttribute("disabled")||this._executeAction()}_handleSlotChange(e){const t=e.target;"content-before"===t.name&&(this._hasContentBefore=t.assignedElements().length>0),"content-after"===t.name&&(this._hasContentAfter=t.assignedElements().length>0)}render(){const e=""!==this.icon,t=""!==this.iconAfter,o={base:!0,"icon-only":this.iconOnly,"has-content-before":this._hasContentBefore,"has-content-after":this._hasContentAfter},s=e?Ke`<vscode-icon
          name=${this.icon}
          ?spin=${this.iconSpin}
          spin-duration=${Nt(this.iconSpinDuration)}
          class="icon"
        ></vscode-icon>`:Xe,i=t?Ke`<vscode-icon
          name=${this.iconAfter}
          ?spin=${this.iconAfterSpin}
          spin-duration=${Nt(this.iconAfterSpinDuration)}
          class="icon-after"
        ></vscode-icon>`:Xe;return Ke`
      <div
        class=${Ft(o)}
        part="base"
        @slotchange=${this._handleSlotChange}
      >
        <slot name="content-before"></slot>
        ${s}
        <slot></slot>
        ${i}
        <slot name="content-after"></slot>
      </div>
    `}};Yt.styles=Kt,Yt.formAssociated=!0,Gt([gt({type:Boolean,reflect:!0})],Yt.prototype,"autofocus",void 0),Gt([gt({type:Number,reflect:!0})],Yt.prototype,"tabIndex",void 0),Gt([gt({type:Boolean,reflect:!0})],Yt.prototype,"secondary",void 0),Gt([gt({type:Boolean,reflect:!0})],Yt.prototype,"block",void 0),Gt([gt({reflect:!0})],Yt.prototype,"role",void 0),Gt([gt({type:Boolean,reflect:!0})],Yt.prototype,"disabled",void 0),Gt([gt()],Yt.prototype,"icon",void 0),Gt([gt({type:Boolean,reflect:!0,attribute:"icon-spin"})],Yt.prototype,"iconSpin",void 0),Gt([gt({type:Number,reflect:!0,attribute:"icon-spin-duration"})],Yt.prototype,"iconSpinDuration",void 0),Gt([gt({attribute:"icon-after"})],Yt.prototype,"iconAfter",void 0),Gt([gt({type:Boolean,reflect:!0,attribute:"icon-after-spin"})],Yt.prototype,"iconAfterSpin",void 0),Gt([gt({type:Number,reflect:!0,attribute:"icon-after-spin-duration"})],Yt.prototype,"iconAfterSpinDuration",void 0),Gt([gt({type:Boolean,reflect:!0})],Yt.prototype,"focused",void 0),Gt([gt({type:String,reflect:!0})],Yt.prototype,"name",void 0),Gt([gt({type:Boolean,reflect:!0,attribute:"icon-only"})],Yt.prototype,"iconOnly",void 0),Gt([gt({reflect:!0})],Yt.prototype,"type",void 0),Gt([gt()],Yt.prototype,"value",void 0),Gt([mt()],Yt.prototype,"_hasContentBefore",void 0),Gt([mt()],Yt.prototype,"_hasContentAfter",void 0),Yt=Gt([Et("vscode-button")],Yt),oe({tagName:"vscode-button",elementClass:Yt,react:v,displayName:"VscodeButton"});const Xt=[It,ce`
    :host {
      display: inline-block;
    }

    .root {
      align-items: stretch;
      display: flex;
      width: 100%;
    }

    ::slotted(vscode-button:not(:first-child)) {
      --vsc-border-left-width: 0;
      --vsc-border-left-radius: 0;
      --vsc-border-left-width: 0;
    }

    ::slotted(vscode-button:not(:last-child)) {
      --vsc-divider-display: block;
      --vsc-base-additional-right-padding: 1px;
      --vsc-base-after-content: '';
      --vsc-border-right-width: 0;
      --vsc-border-right-radius: 0;
      --vsc-border-right-width: 0;
    }

    ::slotted(vscode-button:focus) {
      z-index: 1;
    }

    ::slotted(vscode-button:not(:empty)) {
      width: 100%;
    }
  `];let Zt=class extends $t{render(){return Ke`<div class="root"><slot></slot></div>`}};Zt.styles=Xt,Zt=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r}([Et("vscode-button-group")],Zt),oe({tagName:"vscode-button-group",elementClass:Zt,react:v,displayName:"VscodeButtonGroup"});class Jt extends $t{constructor(){super(),this.focused=!1,this._prevTabindex=0,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1}}connectedCallback(){super.connectedCallback(),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o),"disabled"===e&&this.hasAttribute("disabled")?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):"disabled"!==e||this.hasAttribute("disabled")||(this.tabIndex=this._prevTabindex)}}!function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);n>3&&r&&Object.defineProperty(t,o,r)}([gt({type:Boolean,reflect:!0})],Jt.prototype,"focused",void 0);const Qt=e=>{class t extends e{constructor(){super(...arguments),this._label="",this._slottedText=""}set label(e){this._label=e,""===this._slottedText&&this.setAttribute("aria-label",e)}get label(){return this._label}_handleSlotChange(){this._slottedText=this.textContent?this.textContent.trim():"",""!==this._slottedText&&this.setAttribute("aria-label",this._slottedText)}_renderLabelAttribute(){return""===this._slottedText?Ke`<span class="label-attr">${this._label}</span>`:Ke`${Xe}`}}return function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);n>3&&r&&Object.defineProperty(t,o,r)}([gt()],t.prototype,"label",null),t},eo=[ce`
    :host {
      display: inline-block;
    }

    :host(:focus) {
      outline: none;
    }

    :host([disabled]) {
      opacity: 0.4;
    }

    .wrapper {
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 18px;
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
      clip: rect(1px, 1px, 1px, 1px);
      height: 1px;
      left: 9px;
      margin: 0;
      overflow: hidden;
      position: absolute;
      top: 17px;
      white-space: nowrap;
      width: 1px;
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
  `],to=[It,eo,ce`
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

    /* Toggle appearance */
    :host([toggle]) .icon {
      /* Track */
      width: 36px;
      height: 20px;
      border-radius: 999px;
      background-color: var(--vscode-button-secondaryBackground, #313131);
      border-color: var(--vscode-button-border, transparent);
      justify-content: flex-start;
      position: absolute;
    }

    :host(:focus):host([toggle]):host(:not([disabled])) .icon {
      outline-offset: 2px;
    }

    /* Reserve space for the wider toggle track so text doesn't overlap */
    :host([toggle]) .label-inner {
      padding-left: 45px; /* 36px track + 9px spacing */
    }

    :host([toggle]) .label {
      min-height: 20px;
    }

    :host([toggle]) .wrapper {
      min-height: 20px;
      line-height: 20px;
    }

    :host([toggle]) .thumb {
      /* Thumb */
      box-sizing: border-box;
      display: block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background-color: var(--vscode-button-secondaryForeground, #cccccc);
      margin-left: 1px;
      transition: transform 120ms ease-in-out;
    }

    :host([toggle][checked]) .icon {
      background-color: var(--vscode-button-background, #04395e);
      border-color: var(--vscode-button-border, transparent);
    }

    :host([toggle][checked]) .thumb {
      transform: translateX(16px);
      background-color: var(--vscode-button-foreground, #ffffff);
    }

    :host([toggle]):host(:invalid) .icon {
      background-color: var(--vscode-inputValidation-errorBackground, #5a1d1d);
      border-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    :host([toggle]):host(:invalid) .thumb {
      background-color: var(--vscode-inputValidation-errorBorder, #be1100);
    }

    :host([toggle]) .check-icon,
    :host([toggle]) .indeterminate-icon {
      display: none;
    }

    :host([toggle]:focus):host(:not([disabled])) .icon {
      outline: 1px solid var(--vscode-focusBorder, #0078d4);
      outline-offset: -1px;
    }
  `];var oo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let so=class extends(Qt(Jt)){set checked(e){this._checked=e,this._manageRequired(),this.requestUpdate()}get checked(){return this._checked}set required(e){this._required=e,this._manageRequired(),this.requestUpdate()}get required(){return this._required}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}constructor(){super(),this.autofocus=!1,this._checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name=void 0,this.toggle=!1,this.value="",this.disabled=!1,this.indeterminate=!1,this._required=!1,this.type="checkbox",this._handleClick=e=>{e.preventDefault(),this.disabled||this._toggleState()},this._handleKeyDown=e=>{this.disabled||"Enter"!==e.key&&" "!==e.key||(e.preventDefault()," "===e.key&&this._toggleState(),"Enter"===e.key&&this._internals.form?.requestSubmit())},this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleKeyDown),this.updateComplete.then(()=>{this._manageRequired(),this._setActualFormValue()})}disconnectedCallback(){this.removeEventListener("keydown",this._handleKeyDown)}formResetCallback(){this.checked=this.defaultChecked}formStateRestoreCallback(e,t){e&&(this.checked=!0)}_setActualFormValue(){let e="";e=this.checked?this.value?this.value:"on":null,this._internals.setFormValue(e)}_toggleState(){this.checked=!this.checked,this.indeterminate=!1,this._setActualFormValue(),this._manageRequired(),this.dispatchEvent(new Event("change",{bubbles:!0}))}_manageRequired(){!this.checked&&this.required?this._internals.setValidity({valueMissing:!0},"Please check this box if you want to proceed.",this._inputEl??void 0):this._internals.setValidity({})}render(){const e=Ft({icon:!0,checked:this.checked,indeterminate:this.indeterminate}),t=Ft({"label-inner":!0}),o=Ke`<svg
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
    </svg>`,s=this.checked&&!this.indeterminate?o:Xe,i=this.indeterminate?Ke`<span class="indeterminate-icon"></span>`:Xe,n=this.toggle?Ke`<span class="thumb"></span>`:Ke`${i}${s}`;return Ke`
      <div class="wrapper">
        <input
          ?autofocus=${this.autofocus}
          id="input"
          class="checkbox"
          type="checkbox"
          ?checked=${this.checked}
          role=${Nt(this.toggle?"switch":void 0)}
          aria-checked=${Nt(this.toggle?this.checked?"true":"false":void 0)}
          value=${this.value}
        />
        <div class=${e}>${n}</div>
        <label for="input" class="label" @click=${this._handleClick}>
          <span class=${t}>
            ${this._renderLabelAttribute()}
            <slot @slotchange=${this._handleSlotChange}></slot>
          </span>
        </label>
      </div>
    `}};so.styles=to,so.formAssociated=!0,so.shadowRootOptions={...ut.shadowRootOptions,delegatesFocus:!0},oo([gt({type:Boolean,reflect:!0})],so.prototype,"autofocus",void 0),oo([gt({type:Boolean,reflect:!0})],so.prototype,"checked",null),oo([gt({type:Boolean,reflect:!0,attribute:"default-checked"})],so.prototype,"defaultChecked",void 0),oo([gt({type:Boolean,reflect:!0})],so.prototype,"invalid",void 0),oo([gt({reflect:!0})],so.prototype,"name",void 0),oo([gt({type:Boolean,reflect:!0})],so.prototype,"toggle",void 0),oo([gt()],so.prototype,"value",void 0),oo([gt({type:Boolean,reflect:!0})],so.prototype,"disabled",void 0),oo([gt({type:Boolean,reflect:!0})],so.prototype,"indeterminate",void 0),oo([gt({type:Boolean,reflect:!0})],so.prototype,"required",null),oo([gt()],so.prototype,"type",void 0),oo([yt("#input")],so.prototype,"_inputEl",void 0),so=oo([Et("vscode-checkbox")],so),oe({tagName:"vscode-checkbox",elementClass:so,react:v,displayName:"VscodeCheckbox",events:{onChange:"change"}});const io=[It,ce`
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
  `];var no=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ro=class extends $t{constructor(){super(...arguments),this.role="group",this.variant="horizontal"}render(){return Ke`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};ro.styles=io,no([gt({reflect:!0})],ro.prototype,"role",void 0),no([gt({reflect:!0})],ro.prototype,"variant",void 0),ro=no([Et("vscode-checkbox-group")],ro),oe({tagName:"vscode-checkbox-group",elementClass:ro,react:v,displayName:"VscodeCheckboxGroup"});const ao=[It,ce`
    :host {
      display: block;
    }

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

    .collapsible.open .actions.always-visible,
    .collapsible.open:hover .actions {
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
  `];var lo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let co=class extends $t{constructor(){super(...arguments),this.alwaysShowHeaderActions=!1,this.title="",this.heading="",this.description="",this.open=!1}_emitToggleEvent(){this.dispatchEvent(new CustomEvent("vsc-collapsible-toggle",{detail:{open:this.open}}))}_onHeaderClick(){this.open=!this.open,this._emitToggleEvent()}_onHeaderKeyDown(e){"Enter"===e.key&&(this.open=!this.open,this._emitToggleEvent())}_onHeaderSlotClick(e){e.stopPropagation()}render(){const e={collapsible:!0,open:this.open},t={actions:!0,"always-visible":this.alwaysShowHeaderActions},o=this.heading?this.heading:this.title,s=Ke`<svg
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
    </svg>`,i=this.description?Ke`<span class="description">${this.description}</span>`:Xe;return Ke`
      <div class=${Ft(e)}>
        <div
          class="collapsible-header"
          tabindex="0"
          @click=${this._onHeaderClick}
          @keydown=${this._onHeaderKeyDown}
        >
          ${s}
          <h3 class="title">${o}${i}</h3>
          <div class="header-slots">
            <div class=${Ft(t)}>
              <slot name="actions" @click=${this._onHeaderSlotClick}></slot>
            </div>
            <div class="decorations">
              <slot name="decorations" @click=${this._onHeaderSlotClick}></slot>
            </div>
          </div>
        </div>
        <div class="collapsible-body" part="body">
          <slot></slot>
        </div>
      </div>
    `}};co.styles=ao,lo([gt({type:Boolean,reflect:!0,attribute:"always-show-header-actions"})],co.prototype,"alwaysShowHeaderActions",void 0),lo([gt({type:String})],co.prototype,"title",void 0),lo([gt()],co.prototype,"heading",void 0),lo([gt()],co.prototype,"description",void 0),lo([gt({type:Boolean,reflect:!0})],co.prototype,"open",void 0),co=lo([Et("vscode-collapsible")],co),oe({tagName:"vscode-collapsible",elementClass:co,react:v,displayName:"VscodeCollapsible"});const ho=[It,ce`
    :host {
      display: block;
      outline: none;
      position: relative;
    }

    .context-menu-item {
      background-color: var(--vscode-menu-background, #1f1f1f);
      color: var(--vscode-menu-foreground, #cccccc);
      display: flex;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.4em;
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
  `];var po=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let uo=class extends $t{constructor(){super(...arguments),this.label="",this.keybinding="",this.value="",this.separator=!1,this.tabindex=0}onItemClick(){this.dispatchEvent(new CustomEvent("vsc-click",{detail:{label:this.label,keybinding:this.keybinding,value:this.value||this.label,separator:this.separator,tabindex:this.tabindex},bubbles:!0,composed:!0}))}render(){return Ke`
      ${this.separator?Ke`
            <div class="context-menu-item separator">
              <span class="ruler"></span>
            </div>
          `:Ke`
            <div class="context-menu-item">
              <a @click=${this.onItemClick}>
                ${this.label?Ke`<span class="label">${this.label}</span>`:Xe}
                ${this.keybinding?Ke`<span class="keybinding">${this.keybinding}</span>`:Xe}
              </a>
            </div>
          `}
    `}};uo.styles=ho,po([gt({type:String})],uo.prototype,"label",void 0),po([gt({type:String})],uo.prototype,"keybinding",void 0),po([gt({type:String})],uo.prototype,"value",void 0),po([gt({type:Boolean,reflect:!0})],uo.prototype,"separator",void 0),po([gt({type:Number})],uo.prototype,"tabindex",void 0),uo=po([Et("vscode-context-menu-item")],uo);const vo=[It,ce`
    :host {
      display: block;
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
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 1.4em;
      padding: 4px 0;
      white-space: nowrap;
    }

    .context-menu:focus {
      outline: 0;
    }
  `];var bo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let fo=class extends $t{set data(e){this._data=e;const t=[];e.forEach((e,o)=>{e.separator||t.push(o)}),this._clickableItemIndexes=t}get data(){return this._data}set show(e){this._show=e,this._selectedClickableItemIndex=-1,e&&this.updateComplete.then(()=>{this._wrapperEl&&this._wrapperEl.focus(),requestAnimationFrame(()=>{document.addEventListener("click",this._onClickOutsideBound,{once:!0})})})}get show(){return this._show}constructor(){super(),this.preventClose=!1,this.tabIndex=0,this._selectedClickableItemIndex=-1,this._show=!1,this._data=[],this._clickableItemIndexes=[],this._onClickOutsideBound=this._onClickOutside.bind(this),this.addEventListener("keydown",this._onKeyDown)}_onClickOutside(e){e.composedPath().includes(this)||(this.show=!1)}_onKeyDown(e){const{key:t}=e;switch("ArrowUp"!==t&&"ArrowDown"!==t&&"Escape"!==t&&"Enter"!==t||e.preventDefault(),t){case"ArrowUp":this._handleArrowUp();break;case"ArrowDown":this._handleArrowDown();break;case"Escape":this._handleEscape();break;case"Enter":this._handleEnter()}}_handleArrowUp(){0===this._selectedClickableItemIndex?this._selectedClickableItemIndex=this._clickableItemIndexes.length-1:this._selectedClickableItemIndex-=1}_handleArrowDown(){this._selectedClickableItemIndex+1<this._clickableItemIndexes.length?this._selectedClickableItemIndex+=1:this._selectedClickableItemIndex=0}_handleEscape(){this.show=!1,document.removeEventListener("click",this._onClickOutsideBound)}_dispatchSelectEvent(e){const{keybinding:t,label:o,value:s,separator:i,tabindex:n}=e;this.dispatchEvent(new CustomEvent("vsc-context-menu-select",{detail:{keybinding:t,label:o,separator:i,tabindex:n,value:s}}))}_handleEnter(){if(-1===this._selectedClickableItemIndex)return;const e=this._clickableItemIndexes[this._selectedClickableItemIndex],t=this._wrapperEl.querySelectorAll("vscode-context-menu-item")[e];this._dispatchSelectEvent(t),this.preventClose||(this.show=!1,document.removeEventListener("click",this._onClickOutsideBound))}_onItemClick(e){const t=e.currentTarget;this._dispatchSelectEvent(t),this.preventClose||(this.show=!1)}_onItemMouseOver(e){const t=e.target,o=t.dataset.index?+t.dataset.index:-1,s=this._clickableItemIndexes.findIndex(e=>e===o);-1!==s&&(this._selectedClickableItemIndex=s)}_onItemMouseOut(){this._selectedClickableItemIndex=-1}render(){if(!this._show)return Ke`${Xe}`;const e=this._clickableItemIndexes[this._selectedClickableItemIndex];return Ke`
      <div class="context-menu" tabindex="0">
        ${this.data?this.data.map(({label:t="",keybinding:o="",value:s="",separator:i=!1,tabindex:n=0},r)=>Ke`
                <vscode-context-menu-item
                  label=${t}
                  keybinding=${o}
                  value=${s}
                  ?separator=${i}
                  ?selected=${r===e}
                  tabindex=${n}
                  @vsc-click=${this._onItemClick}
                  @mouseover=${this._onItemMouseOver}
                  @mouseout=${this._onItemMouseOut}
                  data-index=${r}
                ></vscode-context-menu-item>
              `):Ke`<slot></slot>`}
      </div>
    `}};fo.styles=vo,bo([gt({type:Array,attribute:!1})],fo.prototype,"data",null),bo([gt({type:Boolean,reflect:!0,attribute:"prevent-close"})],fo.prototype,"preventClose",void 0),bo([gt({type:Boolean,reflect:!0})],fo.prototype,"show",null),bo([gt({type:Number,reflect:!0})],fo.prototype,"tabIndex",void 0),bo([mt()],fo.prototype,"_selectedClickableItemIndex",void 0),bo([mt()],fo.prototype,"_show",void 0),bo([yt(".context-menu")],fo.prototype,"_wrapperEl",void 0),fo=bo([Et("vscode-context-menu")],fo),oe({tagName:"vscode-context-menu",elementClass:fo,react:v,displayName:"VscodeContextMenu",events:{onVscContextMenuSelect:"vsc-context-menu-select"}}),oe({tagName:"vscode-context-menu-item",elementClass:uo,react:v,displayName:"VscodeContextMenuItem"});const go=[It,ce`
    :host {
      display: block;
      margin-bottom: 10px;
      margin-top: 10px;
    }

    div {
      background-color: var(--vscode-foreground, #cccccc);
      height: 1px;
      opacity: 0.4;
    }
  `];var mo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let _o=class extends $t{constructor(){super(...arguments),this.role="separator"}render(){return Ke`<div></div>`}};_o.styles=go,mo([gt({reflect:!0})],_o.prototype,"role",void 0),_o=mo([Et("vscode-divider")],_o),oe({tagName:"vscode-divider",elementClass:_o,react:v,displayName:"VscodeDivider"});const yo=[It,ce`
    :host {
      display: block;
      max-width: 727px;
    }
  `];var xo,wo,Co=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};(wo=xo||(xo={})).HORIZONTAL="horizontal",wo.VERTICAL="vertical";let ko=class extends $t{constructor(){super(...arguments),this.breakpoint=490,this._responsive=!1,this._firstUpdateComplete=!1,this._resizeObserverCallbackBound=this._resizeObserverCallback.bind(this)}set responsive(e){this._responsive=e,this._firstUpdateComplete&&(e?this._activateResponsiveLayout():this._deactivateResizeObserver())}get responsive(){return this._responsive}_toggleCompactLayout(e){this._assignedFormGroups.forEach(t=>{t.dataset.originalVariant||(t.dataset.originalVariant=t.variant);const o=t.dataset.originalVariant;e===xo.VERTICAL&&"horizontal"===o?t.variant="vertical":t.variant=o;t.querySelectorAll("vscode-checkbox-group, vscode-radio-group").forEach(t=>{t.dataset.originalVariant||(t.dataset.originalVariant=t.variant);const o=t.dataset.originalVariant;e===xo.HORIZONTAL&&o===xo.HORIZONTAL?t.variant="horizontal":t.variant="vertical"})})}_resizeObserverCallback(e){let t=0;for(const s of e)t=s.contentRect.width;const o=t<this.breakpoint?xo.VERTICAL:xo.HORIZONTAL;o!==this._currentFormGroupLayout&&(this._toggleCompactLayout(o),this._currentFormGroupLayout=o)}_activateResponsiveLayout(){this._resizeObserver=new ResizeObserver(this._resizeObserverCallbackBound),this._resizeObserver.observe(this._wrapperElement)}_deactivateResizeObserver(){this._resizeObserver?.disconnect(),this._resizeObserver=null}firstUpdated(){this._firstUpdateComplete=!0,this._responsive&&this._activateResponsiveLayout()}render(){return Ke`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};ko.styles=yo,Co([gt({type:Boolean,reflect:!0})],ko.prototype,"responsive",null),Co([gt({type:Number})],ko.prototype,"breakpoint",void 0),Co([yt(".wrapper")],ko.prototype,"_wrapperElement",void 0),Co([wt({selector:"vscode-form-group"})],ko.prototype,"_assignedFormGroups",void 0),ko=Co([Et("vscode-form-container")],ko),oe({tagName:"vscode-form-container",elementClass:ko,react:v,displayName:"VscodeFormContainer"});const So=[It,ce`
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
  `];var $o=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Eo=class extends $t{constructor(){super(...arguments),this.variant="horizontal"}render(){return Ke`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};Eo.styles=So,$o([gt({reflect:!0})],Eo.prototype,"variant",void 0),Eo=$o([Et("vscode-form-group")],Eo),oe({tagName:"vscode-form-group",elementClass:Eo,react:v,displayName:"VscodeFormGroup"});const Io=[It,ce`
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
  `];let Ao;"undefined"!=typeof CSSStyleSheet&&(Ao=new CSSStyleSheet,Ao.replaceSync("\n    vscode-form-helper * {\n      margin: 0;\n    }\n\n    vscode-form-helper *:not(:last-child) {\n      margin-bottom: 8px;\n    }\n  "));let Oo=class extends $t{constructor(){super(),this._injectLightDOMStyles()}_injectLightDOMStyles(){if("undefined"==typeof document||!Ao)return;document.adoptedStyleSheets.find(e=>e===Ao)||document.adoptedStyleSheets.push(Ao)}render(){return Ke`<slot></slot>`}};Oo.styles=Io,Oo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r}([Et("vscode-form-helper")],Oo),oe({tagName:"vscode-form-helper",elementClass:Oo,react:v,displayName:"VscodeFormHelper"}),oe({tagName:"vscode-icon",elementClass:Wt,react:v,displayName:"VscodeIcon"});let Po=0;const Ro=(e="")=>(Po++,`${e}${Po}`),Bo=[It,ce`
    :host {
      display: block;
    }

    .wrapper {
      color: var(--vscode-foreground, #cccccc);
      cursor: default;
      display: block;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: 600;
      line-height: ${At};
      padding: 5px 0;
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
  `];var zo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Vo=class extends $t{constructor(){super(...arguments),this.required=!1,this._id="",this._htmlFor="",this._connected=!1}set htmlFor(e){this._htmlFor=e,this.setAttribute("for",e),this._connected&&this._connectWithTarget()}get htmlFor(){return this._htmlFor}set id(e){this._id=e}get id(){return this._id}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o)}connectedCallback(){super.connectedCallback(),this._connected=!0,""===this._id&&(this._id=Ro("vscode-label-"),this.setAttribute("id",this._id)),this._connectWithTarget()}_getTarget(){let e=null;if(this._htmlFor){const t=this.getRootNode({composed:!1});t&&(e=t.querySelector(`#${this._htmlFor}`))}return e}async _connectWithTarget(){await this.updateComplete;const e=this._getTarget();["vscode-radio-group","vscode-checkbox-group"].includes(e?.tagName.toLowerCase()??"")&&e.setAttribute("aria-labelledby",this._id);let t="";this.textContent&&(t=this.textContent.trim()),e&&"label"in e&&["vscode-textfield","vscode-textarea","vscode-single-select","vscode-multi-select"].includes(e?.tagName.toLowerCase()??"")&&(e.label=t)}_handleClick(){const e=this._getTarget();e&&"focus"in e&&e.focus()}render(){return Ke`
      <label
        class=${Ft({wrapper:!0,required:this.required})}
        @click=${this._handleClick}
        ><slot></slot
      ></label>
    `}};Vo.styles=Bo,zo([gt({reflect:!0,attribute:"for"})],Vo.prototype,"htmlFor",null),zo([gt()],Vo.prototype,"id",null),zo([gt({type:Boolean,reflect:!0})],Vo.prototype,"required",void 0),Vo=zo([Et("vscode-label")],Vo),oe({tagName:"vscode-label",elementClass:Vo,react:v,displayName:"VscodeLabel"});const Do=Ke`
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
`,Lo=Ge`<svg
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
</svg>`,{I:Mo}=ct,To=e=>e,Fo=()=>document.createComment(""),No=(e,t,o)=>{const s=e._$AA.parentNode,i=void 0===t?e._$AB:t._$AA;if(void 0===o){const t=s.insertBefore(Fo(),i),n=s.insertBefore(Fo(),i);o=new Mo(t,n,e,e.options)}else{const t=o._$AB.nextSibling,n=o._$AM,r=n!==e;if(r){let t;o._$AQ?.(e),o._$AM=e,void 0!==o._$AP&&(t=e._$AU)!==n._$AU&&o._$AP(t)}if(t!==i||r){let e=o._$AA;for(;e!==t;){const t=To(e).nextSibling;To(s).insertBefore(e,i),e=t}}}return o},jo=(e,t,o=e)=>(e._$AI(t,o),e),Ho={},qo=e=>{e._$AR(),e._$AA.remove()},Uo=(e,t,o)=>{const s=new Map;for(let i=t;i<=o;i++)s.set(e[i],i);return s},Wo=Mt(class extends Tt{constructor(e){if(super(e),e.type!==Dt)throw Error("repeat() can only be used in text expressions")}dt(e,t,o){let s;void 0===o?o=t:void 0!==t&&(s=t);const i=[],n=[];let r=0;for(const a of e)i[r]=s?s(a,r):r,n[r]=o(a,r),r++;return{values:n,keys:i}}render(e,t,o){return this.dt(e,t,o).values}update(e,[t,o,s]){const i=e._$AH,{values:n,keys:r}=this.dt(t,o,s);if(!Array.isArray(i))return this.ut=r,n;const a=this.ut??(this.ut=[]),l=[];let c,d,h=0,p=i.length-1,u=0,v=n.length-1;for(;h<=p&&u<=v;)if(null===i[h])h++;else if(null===i[p])p--;else if(a[h]===r[u])l[u]=jo(i[h],n[u]),h++,u++;else if(a[p]===r[v])l[v]=jo(i[p],n[v]),p--,v--;else if(a[h]===r[v])l[v]=jo(i[h],n[v]),No(e,l[v+1],i[h]),h++,v--;else if(a[p]===r[u])l[u]=jo(i[p],n[u]),No(e,i[h],i[p]),p--,u++;else if(void 0===c&&(c=Uo(r,u,v),d=Uo(a,h,p)),c.has(a[h]))if(c.has(a[p])){const t=d.get(r[u]),o=void 0!==t?i[t]:null;if(null===o){const t=No(e,i[h]);jo(t,n[u]),l[u]=t}else l[u]=jo(o,n[u]),No(e,i[h],o),i[t]=null;u++}else qo(i[p]),p--;else qo(i[h]),h++;for(;u<=v;){const t=No(e,l[v+1]);jo(t,n[u]),l[u++]=t}for(;h<=p;){const e=i[h++];null!==e&&qo(e)}return this.ut=r,((e,t=Ho)=>{e._$AH=t})(e,l),Ye}});var Ko=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Go=class extends $t{constructor(){super(...arguments),this.description="",this.selected=!1,this.disabled=!1,this._initialized=!1,this._handleSlotChange=()=>{this._initialized&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._initialized=!0})}willUpdate(e){this._initialized&&(e.has("description")||e.has("value")||e.has("selected")||e.has("disabled"))&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}render(){return Ke`<slot @slotchange=${this._handleSlotChange}></slot>`}};Go.styles=It,Ko([gt({type:String})],Go.prototype,"value",void 0),Ko([gt({type:String})],Go.prototype,"description",void 0),Ko([gt({type:Boolean,reflect:!0})],Go.prototype,"selected",void 0),Ko([gt({type:Boolean,reflect:!0})],Go.prototype,"disabled",void 0),Go=Ko([Et("vscode-option")],Go);const Yo=(e,t)=>{const o={match:!1,ranges:[]},s=e.toLowerCase(),i=t.toLowerCase(),n=s.split(" ");let r=0;return n.forEach((t,s)=>{if(s>0&&(r+=n[s-1].length+1),o.match)return;const a=t.indexOf(i),l=i.length;0===a&&(o.match=!0,o.ranges.push([r+a,Math.min(r+a+l,e.length)]))}),o},Xo=(e,t)=>{const o={match:!1,ranges:[]};return 0===e.toLowerCase().indexOf(t.toLowerCase())&&(o.match=!0,o.ranges=[[0,t.length]]),o},Zo=(e,t)=>{const o={match:!1,ranges:[]},s=e.toLowerCase().indexOf(t.toLowerCase());return s>-1&&(o.match=!0,o.ranges=[[s,s+t.length]]),o},Jo=(e,t)=>{const o={match:!1,ranges:[]};let s=0,i=0;const n=t.length-1,r=e.toLowerCase(),a=t.toLowerCase();for(let l=0;l<=n;l++){if(i=r.indexOf(a[l],s),-1===i)return{match:!1,ranges:[]};o.match=!0,o.ranges.push([i,i+1]),s=i+1}return o},Qo=e=>{const t=[];return" "===e?(t.push(Ke`&nbsp;`),t):(0===e.indexOf(" ")&&t.push(Ke`&nbsp;`),t.push(Ke`${e.trimStart().trimEnd()}`),e.lastIndexOf(" ")===e.length-1&&t.push(Ke`&nbsp;`),t)};class es{constructor(e){this._activeIndex=-1,this._options=[],this._filterPattern="",this._filterMethod="fuzzy",this._combobox=!1,this._indexByValue=new Map,this._indexByLabel=new Map,this._selectedIndex=-1,this._selectedIndexes=new Set,this._multiSelect=!1,this._numOfVisibleOptions=0,(this._host=e).addController(this)}hostConnected(){}get activeIndex(){return this._activeIndex}set activeIndex(e){this._activeIndex=e,this._host.requestUpdate()}get relativeActiveIndex(){return this._options[this._activeIndex]?.filteredIndex??-1}set comboboxMode(e){this._combobox=e,this._host.requestUpdate()}get comboboxMode(){return this._combobox}get multiSelect(){return this._multiSelect}set multiSelect(e){this._selectedIndex=-1,this._selectedIndexes.clear(),this._multiSelect=e,this._host.requestUpdate()}get selectedIndex(){return this._selectedIndex}set selectedIndex(e){var t;-1!==this._selectedIndex&&this._options[this._selectedIndex]&&((t=this._options[this._selectedIndex]).selected??(t.selected=!1));const o=this.getOptionByIndex(e);this._selectedIndex=o?e:-1,this._host.requestUpdate()}get selectedIndexes(){return Array.from(this._selectedIndexes)}set selectedIndexes(e){this._selectedIndexes.forEach(e=>{this._options[e].selected=!1}),this._selectedIndexes=new Set(e),e.forEach(e=>{void 0!==this._options[e]&&(this._options[e].selected=!0)}),this._host.requestUpdate()}set value(e){if(this._multiSelect){const t=e.map(e=>this._indexByValue.get(e)).filter(e=>void 0!==e);this._selectedIndexes=new Set(t)}else this._selectedIndex=this._indexByValue.get(e)??-1;this._host.requestUpdate()}get value(){return this._multiSelect?this._selectedIndexes.size>0?Array.from(this._selectedIndexes).filter(e=>e>=0&&e<this._options.length).map(e=>this._options[e].value):[]:this._selectedIndex>-1&&this._selectedIndex<this._options.length?this._options[this._selectedIndex].value:""}set multiSelectValue(e){const t=e.map(e=>this._indexByValue.get(e)).filter(e=>void 0!==e);this._selectedIndexes=new Set(t)}get multiSelectValue(){return this._selectedIndexes.size>0?Array.from(this._selectedIndexes).map(e=>this._options[e].value):[]}get filterPattern(){return this._filterPattern}set filterPattern(e){e!==this._filterPattern&&(this._filterPattern=e,this._updateState())}get filterMethod(){return this._filterMethod}set filterMethod(e){e!==this._filterMethod&&(this._filterMethod=e,this._updateState())}get options(){return this._options}get numOfVisibleOptions(){return this._numOfVisibleOptions}get numOptions(){return this._options.length}populate(e){this._indexByValue.clear(),this._indexByLabel.clear(),this._options=e.map((e,t)=>(this._indexByValue.set(e.value??"",t),this._indexByLabel.set(e.label??"",t),{description:e.description??"",disabled:e.disabled??!1,label:e.label??"",selected:e.selected??!1,value:e.value??"",index:t,filteredIndex:t,ranges:[],visible:!0})),this._numOfVisibleOptions=this._options.length}add(e){const t=this._options.length,{description:o,disabled:s,label:i,selected:n,value:r}=e;let a=!0,l=[];if(this._combobox&&""!==this._filterPattern){const e=this._searchByPattern(i??"");a=e.match,l=e.ranges}this._indexByValue.set(r??"",t),this._indexByLabel.set(i??"",t),n&&(this._selectedIndex=t,this._selectedIndexes.add(t),this._activeIndex=t),this._options.push({index:t,filteredIndex:t,description:o??"",disabled:s??!1,label:i??"",selected:n??!1,value:r??"",visible:a,ranges:l}),a&&(this._numOfVisibleOptions+=1)}clear(){this._options=[],this._indexByValue.clear(),this._indexByLabel.clear(),this._numOfVisibleOptions=0,this._selectedIndex=-1,this._selectedIndexes.clear(),this._activeIndex=-1}getIsIndexSelected(e){return this._multiSelect?this._selectedIndexes.has(e):this._selectedIndex===e}expandMultiSelection(e){e.forEach(e=>{const t=this._indexByValue.get(e)??-1;-1!==t&&this._selectedIndexes.add(t)}),this._host.requestUpdate()}toggleActiveMultiselectOption(){const e=this._options[this._activeIndex]??null;if(!e)return;this._selectedIndexes.has(e.index)?this._selectedIndexes.delete(e.index):this._selectedIndexes.add(e.index),this._host.requestUpdate()}toggleOptionSelected(e){const t=this._selectedIndexes.has(e);this._options[e].selected=!this._options[e].selected,t?this._selectedIndexes.delete(e):this._selectedIndexes.add(e),this._host.requestUpdate()}getActiveOption(){return this._options[this._activeIndex]??null}getSelectedOption(){return this._options[this._selectedIndex]??null}getOptionByIndex(e){return this._options[e]??null}findOptionIndex(e){return this._indexByValue.get(e)??-1}getOptionByValue(e,t=!1){const o=this._indexByValue.get(e)??-1;return-1===o?null:t||this._options[o].visible?this._options[o]:null}getOptionByLabel(e){const t=this._indexByLabel.get(e)??-1;return-1===t?null:this._options[t]}next(e){let t=-1;for(let o=(e??this._activeIndex)+1;o<this._options.length;o++)if(this._options[o]&&!this._options[o].disabled&&this._options[o].visible){t=o;break}return t>-1?this._options[t]:null}prev(e){let t=-1;for(let o=(e??this._activeIndex)-1;o>=0;o--)if(this._options[o]&&!this._options[o].disabled&&this._options[o].visible){t=o;break}return t>-1?this._options[t]:null}activateDefault(){if(this._multiSelect){if(this._selectedIndexes.size>0){const e=this._selectedIndexes.values().next();this._activeIndex=e.value?e.value:0}}else this._selectedIndex>-1?this._activeIndex=this._selectedIndex:this._activeIndex=0;this._host.requestUpdate()}selectAll(){this._multiSelect&&(this._options.forEach((e,t)=>{this._options[t].selected=!0,this._selectedIndexes.add(t)}),this._host.requestUpdate())}selectNone(){this._multiSelect&&(this._options.forEach((e,t)=>{this._options[t].selected=!1}),this._selectedIndexes.clear(),this._host.requestUpdate())}_searchByPattern(e){let t;switch(this._filterMethod){case"startsWithPerTerm":t=Yo(e,this._filterPattern);break;case"startsWith":t=Xo(e,this._filterPattern);break;case"contains":t=Zo(e,this._filterPattern);break;default:t=Jo(e,this._filterPattern)}return t}_updateState(){if(this._combobox&&""!==this._filterPattern){let e=-1;this._numOfVisibleOptions=0,this._options.forEach(({label:t},o)=>{const s=this._searchByPattern(t);this._options[o].visible=s.match,this._options[o].ranges=s.ranges,this._options[o].filteredIndex=s.match?++e:-1,s.match&&(this._numOfVisibleOptions+=1)})}else this._options.forEach((e,t)=>{this._options[t].visible=!0,this._options[t].ranges=[]}),this._numOfVisibleOptions=this._options.length;this._host.requestUpdate()}}const ts=[It,ce`
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
  `];var os=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ss=class extends $t{set scrollPos(e){this._scrollPos=this._limitScrollPos(e),this._updateScrollbar(),this._updateThumbPosition(),this.requestUpdate()}get scrollPos(){return this._scrollPos}get scrollMax(){return this._scrollableContainer?this._scrollableContainer.scrollHeight-this._scrollableContainer.clientHeight:0}constructor(){super(),this.alwaysVisible=!1,this.fastScrollSensitivity=5,this.minThumbSize=20,this.mouseWheelScrollSensitivity=1,this.shadow=!0,this.scrolled=!1,this._scrollPos=0,this._isDragging=!1,this._thumbHeight=0,this._thumbY=0,this._thumbVisible=!1,this._thumbFade=!1,this._thumbActive=!1,this._componentHeight=0,this._contentHeight=0,this._scrollThumbStartY=0,this._mouseStartY=0,this._scrollbarVisible=!0,this._scrollbarTrackZ=0,this._resizeObserverCallback=()=>{this._componentHeight=this.offsetHeight,this._contentHeight=this._contentElement.offsetHeight,this._updateScrollbar(),this._updateThumbPosition()},this._handleSlotChange=()=>{this._updateScrollbar(),this._updateThumbPosition(),this._zIndexFix()},this._handleScrollThumbMouseMove=e=>{const t=this._scrollThumbStartY+(e.screenY-this._mouseStartY);this._thumbY=this._limitThumbPos(t),this.scrollPos=this._calculateScrollPosFromThumbPos(this._thumbY),this.dispatchEvent(new CustomEvent("vsc-scrollable-scroll",{detail:this.scrollPos}))},this._handleScrollThumbMouseUp=e=>{this._isDragging=!1,this._thumbActive=!1;const t=this.getBoundingClientRect(),{x:o,y:s,width:i,height:n}=t,{pageX:r,pageY:a}=e;(r>o+i||r<o||a>s+n||a<s)&&(this._thumbFade=!0,this._thumbVisible=!1),document.removeEventListener("mousemove",this._handleScrollThumbMouseMove),document.removeEventListener("mouseup",this._handleScrollThumbMouseUp)},this._handleComponentMouseOver=()=>{this._thumbVisible=!0,this._thumbFade=!1},this._handleComponentMouseOut=()=>{this._thumbActive||(this._thumbVisible=!1,this._thumbFade=!0)},this._handleComponentWheel=e=>{if(this._contentHeight<=this._componentHeight)return;e.preventDefault();const t=e.altKey?this.mouseWheelScrollSensitivity*this.fastScrollSensitivity:this.mouseWheelScrollSensitivity;this.scrollPos=this._limitScrollPos(this.scrollPos+e.deltaY*t),this.dispatchEvent(new CustomEvent("vsc-scrollable-scroll",{detail:this.scrollPos}))},this._handleScrollableContainerScroll=e=>{e.currentTarget&&(this.scrollPos=e.currentTarget.scrollTop)},this.addEventListener("mouseover",this._handleComponentMouseOver),this.addEventListener("mouseout",this._handleComponentMouseOut),this.addEventListener("wheel",this._handleComponentWheel)}connectedCallback(){super.connectedCallback(),this._hostResizeObserver=new ResizeObserver(this._resizeObserverCallback),this._contentResizeObserver=new ResizeObserver(this._resizeObserverCallback),this.requestUpdate(),this.updateComplete.then(()=>{this._hostResizeObserver.observe(this),this._contentResizeObserver.observe(this._contentElement),this._updateThumbPosition()})}disconnectedCallback(){super.disconnectedCallback(),this._hostResizeObserver.unobserve(this),this._hostResizeObserver.disconnect(),this._contentResizeObserver.unobserve(this._contentElement),this._contentResizeObserver.disconnect()}firstUpdated(e){this._updateThumbPosition()}_calcThumbHeight(){const e=this.offsetHeight,t=e*(e/(this._contentElement?.offsetHeight??0));return Math.max(this.minThumbSize,t)}_updateScrollbar(){const e=this._contentElement?.offsetHeight??0;this.offsetHeight>=e?this._scrollbarVisible=!1:(this._scrollbarVisible=!0,this._thumbHeight=this._calcThumbHeight()),this.requestUpdate()}_zIndexFix(){let e=0;this._assignedElements.forEach(t=>{if("style"in t){const o=window.getComputedStyle(t).zIndex;/([0-9-])+/g.test(o)&&(e=Number(o)>e?Number(o):e)}}),this._scrollbarTrackZ=e+1,this.requestUpdate()}_updateThumbPosition(){if(!this._scrollableContainer)return;this.scrolled=this.scrollPos>0;const e=this.offsetHeight,t=this._thumbHeight,o=this._contentElement.offsetHeight-e,s=this.scrollPos/o,i=e-t;this._thumbY=Math.min(s*(e-t),i)}_calculateScrollPosFromThumbPos(e){const t=this.getBoundingClientRect().height,o=e/(t-this._scrollThumbElement.getBoundingClientRect().height)*(this._contentElement.getBoundingClientRect().height-t);return this._limitScrollPos(o)}_limitScrollPos(e){return e<0?0:e>this.scrollMax?this.scrollMax:e}_limitThumbPos(e){const t=this.getBoundingClientRect().height,o=this._scrollThumbElement.getBoundingClientRect().height;return e<0?0:e>t-o?t-o:e}_handleScrollThumbMouseDown(e){const t=this.getBoundingClientRect(),o=this._scrollThumbElement.getBoundingClientRect();this._mouseStartY=e.screenY,this._scrollThumbStartY=o.top-t.top,this._isDragging=!0,this._thumbActive=!0,document.addEventListener("mousemove",this._handleScrollThumbMouseMove),document.addEventListener("mouseup",this._handleScrollThumbMouseUp)}_handleScrollbarTrackPress(e){e.target===e.currentTarget&&(this._thumbY=e.offsetY-this._thumbHeight/2,this.scrollPos=this._calculateScrollPosFromThumbPos(this._thumbY))}render(){return Ke`
      <div
        class="scrollable-container"
        .style=${jt({userSelect:this._isDragging?"none":"auto"})}
        .scrollTop=${this.scrollPos}
        @scroll=${this._handleScrollableContainerScroll}
      >
        <div
          class=${Ft({shadow:!0,visible:this.scrolled})}
          .style=${jt({zIndex:String(this._scrollbarTrackZ)})}
        ></div>
        ${this._isDragging?Ke`<div class="prevent-interaction"></div>`:Xe}
        <div
          class=${Ft({"scrollbar-track":!0,hidden:!this._scrollbarVisible})}
          @mousedown=${this._handleScrollbarTrackPress}
        >
          <div
            class=${Ft({"scrollbar-thumb":!0,visible:!!this.alwaysVisible||this._thumbVisible,fade:!this.alwaysVisible&&this._thumbFade,active:this._thumbActive})}
            .style=${jt({height:`${this._thumbHeight}px`,top:`${this._thumbY}px`})}
            @mousedown=${this._handleScrollThumbMouseDown}
          ></div>
        </div>
        <div class="content">
          <slot @slotchange=${this._handleSlotChange}></slot>
        </div>
      </div>
    `}};ss.styles=ts,os([gt({type:Boolean,reflect:!0,attribute:"always-visible"})],ss.prototype,"alwaysVisible",void 0),os([gt({type:Number,attribute:"fast-scroll-sensitivity"})],ss.prototype,"fastScrollSensitivity",void 0),os([gt({type:Number,attribute:"min-thumb-size"})],ss.prototype,"minThumbSize",void 0),os([gt({type:Number,attribute:"mouse-wheel-scroll-sensitivity"})],ss.prototype,"mouseWheelScrollSensitivity",void 0),os([gt({type:Boolean,reflect:!0})],ss.prototype,"shadow",void 0),os([gt({type:Boolean,reflect:!0})],ss.prototype,"scrolled",void 0),os([gt({type:Number,attribute:"scroll-pos"})],ss.prototype,"scrollPos",null),os([mt()],ss.prototype,"_isDragging",void 0),os([mt()],ss.prototype,"_thumbHeight",void 0),os([mt()],ss.prototype,"_thumbY",void 0),os([mt()],ss.prototype,"_thumbVisible",void 0),os([mt()],ss.prototype,"_thumbFade",void 0),os([mt()],ss.prototype,"_thumbActive",void 0),os([yt(".content")],ss.prototype,"_contentElement",void 0),os([yt(".scrollbar-thumb",!0)],ss.prototype,"_scrollThumbElement",void 0),os([yt(".scrollable-container")],ss.prototype,"_scrollableContainer",void 0),os([wt()],ss.prototype,"_assignedElements",void 0),ss=os([Et("vscode-scrollable")],ss);var is=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const ns=22;class rs extends $t{set combobox(e){this._opts.comboboxMode=e}get combobox(){return this._opts.comboboxMode}set disabled(e){this._disabled=e,this.ariaDisabled=e?"true":"false",!0===e?(this._originalTabIndex=this.tabIndex,this.tabIndex=-1):(this.tabIndex=this._originalTabIndex??0,this._originalTabIndex=void 0),this.requestUpdate()}get disabled(){return this._disabled}set filter(e){let t;["contains","fuzzy","startsWith","startsWithPerTerm"].includes(e)?t=e:(this.warn(`Invalid filter: "${e}", fallback to default. Valid values are: "contains", "fuzzy", "startsWith", "startsWithPerm".`),t="fuzzy"),this._opts.filterMethod=t}get filter(){return this._opts.filterMethod}set options(e){this._opts.populate(e)}get options(){return this._opts.options.map(({label:e,value:t,description:o,selected:s,disabled:i})=>({label:e,value:t,description:o,selected:s,disabled:i}))}constructor(){super(),this.creatable=!1,this.label="",this.invalid=!1,this.focused=!1,this.open=!1,this.position="below",this._prevXPos=0,this._prevYPos=0,this._opts=new es(this),this._firstUpdateCompleted=!1,this._currentDescription="",this._filter="fuzzy",this._selectedIndexes=[],this._options=[],this._value="",this._values=[],this._isPlaceholderOptionActive=!1,this._isBeingFiltered=!1,this._optionListScrollPos=0,this._isHoverForbidden=!1,this._disabled=!1,this._originalTabIndex=void 0,this._onMouseMove=()=>{this._isHoverForbidden=!1,window.removeEventListener("mousemove",this._onMouseMove)},this._onOptionListScroll=e=>{this._optionListScrollPos=e.detail},this._onComponentKeyDown=e=>{[" ","ArrowUp","ArrowDown","Escape"].includes(e.key)&&(e.stopPropagation(),e.preventDefault()),"Enter"===e.key&&this._onEnterKeyDown(e)," "===e.key&&this._onSpaceKeyDown(),"Escape"===e.key&&this._onEscapeKeyDown(),"ArrowUp"===e.key&&this._onArrowUpKeyDown(),"ArrowDown"===e.key&&this._onArrowDownKeyDown()},this._onComponentFocus=()=>{this.focused=!0},this._onComponentBlur=()=>{this.focused=!1},this._handleWindowScroll=()=>{const{x:e,y:t}=this.getBoundingClientRect();e===this._prevXPos&&t===this._prevYPos||(this.open=!1)},this.addEventListener("vsc-option-state-change",e=>{e.stopPropagation(),this._setStateFromSlottedElements(),this.requestUpdate()})}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._onComponentKeyDown),this.addEventListener("focus",this._onComponentFocus),this.addEventListener("blur",this._onComponentBlur),this._setAutoFocus()}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._onComponentKeyDown),this.removeEventListener("focus",this._onComponentFocus),this.removeEventListener("blur",this._onComponentBlur)}firstUpdated(e){this._firstUpdateCompleted=!0}willUpdate(e){if(e.has("required")&&this._firstUpdateCompleted&&this._manageRequired(),e.has("open")&&this._firstUpdateCompleted)if(this.open){this._dropdownEl.showPopover();const{x:e,y:t}=this.getBoundingClientRect();this._prevXPos=e,this._prevYPos=t,window.addEventListener("scroll",this._handleWindowScroll,{capture:!0}),this._opts.activateDefault(),this._scrollActiveElementToTop()}else this._dropdownEl.hidePopover(),window.removeEventListener("scroll",this._handleWindowScroll)}get _filteredOptions(){return this.combobox&&""!==this._opts.filterPattern?((e,t,o)=>{const s=[];return e.forEach(e=>{let i;switch(o){case"startsWithPerTerm":i=Yo(e.label,t);break;case"startsWith":i=Xo(e.label,t);break;case"contains":i=Zo(e.label,t);break;default:i=Jo(e.label,t)}i.match&&s.push({...e,ranges:i.ranges})}),s})(this._options,this._opts.filterPattern,this._filter):this._options}_setAutoFocus(){this.hasAttribute("autofocus")&&(this.tabIndex<0&&(this.tabIndex=0),this.combobox?this.updateComplete.then(()=>{this.shadowRoot?.querySelector(".combobox-input").focus()}):this.updateComplete.then(()=>{this.shadowRoot?.querySelector(".select-face").focus()}))}get _isSuggestedOptionVisible(){if(!this.combobox||!this.creatable)return!1;const e=null!==this._opts.getOptionByValue(this._opts.filterPattern),t=this._opts.filterPattern.length>0;return!e&&t}_manageRequired(){}_setStateFromSlottedElements(){const e=this._assignedOptions??[];this._opts.clear(),e.forEach(e=>{const{innerText:t,description:o,disabled:s}=e,i="string"==typeof e.value?e.value:t.trim(),n=e.selected??!1,r={label:t.trim(),value:i,description:o,selected:n,disabled:s};this._opts.add(r)})}_createSuggestedOption(){const e=this._opts.numOptions,t=document.createElement("vscode-option");return t.value=this._opts.filterPattern,ht(this._opts.filterPattern,t),this.appendChild(t),e}_dispatchChangeEvent(){this.dispatchEvent(new Event("change")),this.dispatchEvent(new Event("input"))}async _createAndSelectSuggestedOption(){}_toggleComboboxDropdown(){this._opts.filterPattern="",this.open=!this.open}_scrollActiveElementToTop(){this._optionListScrollPos=Math.floor(this._opts.relativeActiveIndex*ns)}async _adjustOptionListScrollPos(e,t){let o=this._opts.numOfVisibleOptions;if(this._isSuggestedOptionVisible&&(o+=1),o<=10)return;this._isHoverForbidden=!0,window.addEventListener("mousemove",this._onMouseMove);const s=this._optionListScrollPos,i=t*ns,n=i>=s&&i<=s+220-ns;"down"===e&&(n||(this._optionListScrollPos=t*ns-198)),"up"===e&&(n||(this._optionListScrollPos=Math.floor(this._opts.relativeActiveIndex*ns)))}_onFaceClick(){this.open=!this.open}_handleDropdownToggle(e){this.open="open"===e.newState}_onComboboxButtonClick(){this._toggleComboboxDropdown()}_onComboboxButtonKeyDown(e){"Enter"===e.key&&this._toggleComboboxDropdown()}_onOptionMouseOver(e){if(this._isHoverForbidden)return;const t=e.target;t.matches(".option")&&(t.matches(".placeholder")?(this._isPlaceholderOptionActive=!0,this._opts.activeIndex=-1):(this._isPlaceholderOptionActive=!1,this._opts.activeIndex=+t.dataset.index))}_onPlaceholderOptionMouseOut(){this._isPlaceholderOptionActive=!1}_onNoOptionsClick(e){e.stopPropagation()}_onEnterKeyDown(e){this._isBeingFiltered=!1;!!e?.composedPath&&e.composedPath().find(e=>!!e.matches&&e.matches("vscode-button.button-accept"))}_onSpaceKeyDown(){this.open||(this.open=!0)}_onArrowUpKeyDown(){if(this.open){if(this._opts.activeIndex<=0&&(!this.combobox||!this.creatable))return;if(this._isPlaceholderOptionActive){const e=this._opts.numOfVisibleOptions-1;this._opts.activeIndex=e,this._isPlaceholderOptionActive=!1}else{const e=this._opts.prev();if(null!==e){this._opts.activeIndex=e?.index??-1;const t=e?.filteredIndex??-1;t>-1&&this._adjustOptionListScrollPos("up",t)}}}else this.open=!0,this._opts.activateDefault()}_onArrowDownKeyDown(){let e=this._opts.numOfVisibleOptions;const t=this._isSuggestedOptionVisible;if(t&&(e+=1),this.open){if(this._isPlaceholderOptionActive&&-1===this._opts.activeIndex)return;const o=this._opts.next();if(t&&null===o)this._isPlaceholderOptionActive=!0,this._adjustOptionListScrollPos("down",e-1),this._opts.activeIndex=-1;else if(null!==o){const e=o?.filteredIndex??-1;this._opts.activeIndex=o?.index??-1,e>-1&&this._adjustOptionListScrollPos("down",e)}}else this.open=!0,this._opts.activateDefault()}_onEscapeKeyDown(){this.open=!1}_onSlotChange(){this._setStateFromSlottedElements(),this.requestUpdate()}_onComboboxInputFocus(e){e.target.select(),this._isBeingFiltered=!1,this._opts.filterPattern=""}_onComboboxInputBlur(){this._isBeingFiltered=!1}_onComboboxInputInput(e){this._isBeingFiltered=!0,this._opts.filterPattern=e.target.value,this._opts.activeIndex=-1,this.open=!0}_onComboboxInputClick(){this._isBeingFiltered=""!==this._opts.filterPattern,this.open=!0}_onComboboxInputSpaceKeyDown(e){" "===e.key&&e.stopPropagation()}_onOptionClick(e){this._isBeingFiltered=!1}_renderCheckbox(e,t){return Ke`<span class=${Ft({"checkbox-icon":!0,checked:e})}>${Lo}</span
      ><span class="option-label">${t}</span>`}_renderOptions(){const e=this._opts.options;return Ke`
      <ul
        aria-label=${Nt(this.label??void 0)}
        aria-multiselectable=${Nt(this._opts.multiSelect?"true":void 0)}
        class="options"
        id="select-listbox"
        role="listbox"
        tabindex="-1"
        @click=${this._onOptionClick}
        @mouseover=${this._onOptionMouseOver}
      >
        ${Wo(e,e=>e.index,(e,t)=>{if(!e.visible)return Xe;const o=e.index===this._opts.activeIndex&&!e.disabled,s=this._opts.getIsIndexSelected(e.index),i={active:o,disabled:e.disabled,option:!0,"single-select":!this._opts.multiSelect,"multi-select":this._opts.multiSelect,selected:s},n=e.ranges?.length?((e,t)=>{const o=[],s=t.length;return s<1?Ke`${e}`:(t.forEach((i,n)=>{const r=e.substring(i[0],i[1]);0===n&&0!==i[0]&&o.push(...Qo(e.substring(0,t[0][0]))),n>0&&n<s&&i[0]-t[n-1][1]!==0&&o.push(...Qo(e.substring(t[n-1][1],i[0]))),o.push(Ke`<b>${Qo(r)}</b>`),n===s-1&&i[1]<e.length&&o.push(...Qo(e.substring(i[1],e.length)))}),o)})(e.label,e.ranges??[]):e.label;return Ke`
              <li
                aria-selected=${s?"true":"false"}
                class=${Ft(i)}
                data-index=${e.index}
                data-filtered-index=${t}
                id=${`op-${e.index}`}
                role="option"
                tabindex="-1"
              >
                ${r=this._opts.multiSelect,a=()=>this._renderCheckbox(s,n),l=()=>n,r?a(r):l?.(r)}
              </li>
            `;var r,a,l})}
        ${this._renderPlaceholderOption(this._opts.numOfVisibleOptions<1)}
      </ul>
    `}_renderPlaceholderOption(e){if(!this.combobox)return Xe;return this._opts.getOptionByLabel(this._opts.filterPattern)?Xe:this.creatable&&this._opts.filterPattern.length>0?Ke`<li
        class=${Ft({option:!0,placeholder:!0,active:this._isPlaceholderOptionActive})}
        @mouseout=${this._onPlaceholderOptionMouseOut}
      >
        Add "${this._opts.filterPattern}"
      </li>`:e?Ke`<li class="no-options" @click=${this._onNoOptionsClick}>
            No options
          </li>`:Xe}_renderDescription(){const e=this._opts.getActiveOption();if(!e)return Xe;const{description:t}=e;return t?Ke`<div class="description">${t}</div>`:Xe}_renderSelectFace(){return Ke`${Xe}`}_renderComboboxFace(){return Ke`${Xe}`}_renderDropdownControls(){return Ke`${Xe}`}_renderDropdown(){const e={dropdown:!0,multiple:this._opts.multiSelect,open:this.open},t=this._isSuggestedOptionVisible||0===this._opts.numOfVisibleOptions?this._opts.numOfVisibleOptions+1:this._opts.numOfVisibleOptions,o=Math.min(t*ns,220),s=this.getBoundingClientRect(),i={width:`${s.width}px`,left:`${s.left}px`,top:"below"===this.position?`${s.top+s.height}px`:"unset",bottom:"below"===this.position?"unset":document.documentElement.clientHeight-s.top+"px"};return Ke`
      <div
        class=${Ft(e)}
        popover="auto"
        @toggle=${this._handleDropdownToggle}
        .style=${jt(i)}
      >
        ${"above"===this.position?this._renderDescription():Xe}
        <vscode-scrollable
          always-visible
          class="scrollable"
          min-thumb-size="40"
          tabindex="-1"
          @vsc-scrollable-scroll=${this._onOptionListScroll}
          .scrollPos=${this._optionListScrollPos}
          .style=${jt({height:`${o}px`})}
        >
          ${this._renderOptions()} ${this._renderDropdownControls()}
        </vscode-scrollable>
        ${"below"===this.position?this._renderDescription():Xe}
      </div>
    `}}is([gt({type:Boolean,reflect:!0})],rs.prototype,"creatable",void 0),is([gt({type:Boolean,reflect:!0})],rs.prototype,"combobox",null),is([gt({reflect:!0})],rs.prototype,"label",void 0),is([gt({type:Boolean,reflect:!0})],rs.prototype,"disabled",null),is([gt({type:Boolean,reflect:!0})],rs.prototype,"invalid",void 0),is([gt()],rs.prototype,"filter",null),is([gt({type:Boolean,reflect:!0})],rs.prototype,"focused",void 0),is([gt({type:Boolean,reflect:!0})],rs.prototype,"open",void 0),is([gt({type:Array})],rs.prototype,"options",null),is([gt({reflect:!0})],rs.prototype,"position",void 0),is([wt({flatten:!0,selector:"vscode-option"})],rs.prototype,"_assignedOptions",void 0),is([yt(".dropdown",!0)],rs.prototype,"_dropdownEl",void 0),is([mt()],rs.prototype,"_currentDescription",void 0),is([mt()],rs.prototype,"_filter",void 0),is([mt()],rs.prototype,"_filteredOptions",null),is([mt()],rs.prototype,"_selectedIndexes",void 0),is([mt()],rs.prototype,"_options",void 0),is([mt()],rs.prototype,"_value",void 0),is([mt()],rs.prototype,"_values",void 0),is([mt()],rs.prototype,"_isPlaceholderOptionActive",void 0),is([mt()],rs.prototype,"_isBeingFiltered",void 0),is([mt()],rs.prototype,"_optionListScrollPos",void 0);const as=[It,ce`
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
      border-radius: 4px;
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
      padding-right: 20px;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      outline: none;
    }

    :host(:focus:not([open])) .select-face,
    :host(:focus:not([open])) .combobox-face,
    :host([focused]:not([open])) .select-face,
    :host([focused]:not([open])) .combobox-face {
      border-color: var(--vscode-focusBorder, #0078d4);
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
      border-radius: 4px;
      border-style: solid;
      border-width: 1px;
      bottom: unset;
      box-shadow: 0 2px 8px var(--vscode-widget-shadow, rgba(0, 0, 0, 0.36));
      box-sizing: border-box;
      display: none;
      padding: 0;
      right: unset;
    }

    .dropdown.open {
      display: block;
    }

    :host([position='above']) .dropdown {
      bottom: 26px;
      padding-bottom: 0;
      padding-top: 2px;
      top: unset;
    }

    .scrollable {
      display: block;
      max-height: 222px;
      margin: 0;
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
      box-sizing: border-box;
      color: var(--vscode-foreground, #cccccc);
      cursor: pointer;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      height: 22px;
      line-height: 20px;
      min-height: calc(var(--vscode-font-size) * 1.3);
      padding: 1px 3px;
      user-select: none;
      outline-color: transparent;
      outline-offset: -1px;
      outline-style: solid;
      outline-width: 1px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .option.single-select {
      display: block;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .option.multi-select {
      align-items: center;
      display: flex;
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
      overflow: hidden;
      pointer-events: none;
      text-overflow: ellipsis;
      white-space: nowrap;
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
      border-radius: 2px;
      border: 1px solid var(--vscode-checkbox-border);
      box-sizing: border-box;
      color: var(--vscode-checkbox-foreground);
      display: flex;
      flex-basis: 15px;
      flex-shrink: 0;
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
  `];var ls=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let cs=class extends rs{set selectedIndexes(e){this._opts.selectedIndexes=e}get selectedIndexes(){return this._opts.selectedIndexes}set value(e){this._opts.multiSelectValue=e,this._opts.selectedIndexes.length>0?this._requestedValueToSetLater=[]:this._requestedValueToSetLater=Array.isArray(e)?e:[e],this._setFormValue(),this._manageRequired()}get value(){return this._opts.multiSelectValue}get form(){return this._internals.form}get type(){return"select-multiple"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}selectAll(){this._opts.selectAll()}selectNone(){this._opts.selectNone()}constructor(){super(),this.defaultValue=[],this.required=!1,this.name=void 0,this._requestedValueToSetLater=[],this._onOptionClick=e=>{const t=e.composedPath().find(e=>"matches"in e&&e.matches("li.option"));if(!t)return;if(t.classList.contains("placeholder"))return void this._createAndSelectSuggestedOption();const o=Number(t.dataset.index);this._opts.toggleOptionSelected(o),this._setFormValue(),this._manageRequired(),this._dispatchChangeEvent()},this._opts.multiSelect=!0,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._setDefaultValue(),this._manageRequired()})}formResetCallback(){this.updateComplete.then(()=>{this.value=this.defaultValue})}formStateRestoreCallback(e,t){const o=Array.from(e.entries()).map(e=>String(e[1]));this.updateComplete.then(()=>{this.value=o})}_setDefaultValue(){if(Array.isArray(this.defaultValue)&&this.defaultValue.length>0){const e=this.defaultValue.map(e=>String(e));this.value=e}}_dispatchChangeEvent(){super._dispatchChangeEvent()}_onFaceClick(){super._onFaceClick(),this._opts.activeIndex=0}_toggleComboboxDropdown(){super._toggleComboboxDropdown(),this._opts.activeIndex=-1}_manageRequired(){const{value:e}=this;0===e.length&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._faceElement):this._internals.setValidity({})}_setFormValue(){const e=new FormData;this._values.forEach(t=>{e.append(this.name??"",t)}),this._internals.setFormValue(e)}async _createAndSelectSuggestedOption(){super._createAndSelectSuggestedOption();const e=this._createSuggestedOption();await this.updateComplete,this.selectedIndexes=[...this.selectedIndexes,e],this._dispatchChangeEvent();const t=new CustomEvent("vsc-multi-select-create-option",{detail:{value:this._opts.getOptionByIndex(e)?.value??""}});this.dispatchEvent(t),this.open=!1,this._isPlaceholderOptionActive=!1}_onSlotChange(){super._onSlotChange(),this._requestedValueToSetLater.length>0&&(this._opts.expandMultiSelection(this._requestedValueToSetLater),this._requestedValueToSetLater=this._requestedValueToSetLater.filter(e=>-1===this._opts.findOptionIndex(e)))}_onEnterKeyDown(e){super._onEnterKeyDown(e),this.open?this._isPlaceholderOptionActive?this._createAndSelectSuggestedOption():(this._opts.toggleActiveMultiselectOption(),this._setFormValue(),this._manageRequired(),this._dispatchChangeEvent()):(this._opts.filterPattern="",this.open=!0)}_onMultiAcceptClick(){this.open=!1}_onMultiDeselectAllClick(){this._opts.selectedIndexes=[],this._values=[],this._options=this._options.map(e=>({...e,selected:!1})),this._manageRequired(),this._dispatchChangeEvent()}_onMultiSelectAllClick(){this._opts.selectedIndexes=[],this._values=[],this._options=this._options.map(e=>({...e,selected:!0})),this._options.forEach((e,t)=>{this._selectedIndexes.push(t),this._values.push(e.value),this._dispatchChangeEvent()}),this._setFormValue(),this._manageRequired()}_onComboboxInputBlur(){super._onComboboxInputBlur(),this._opts.filterPattern=""}_renderLabel(){return 0===this._opts.selectedIndexes.length?Ke`<span class="select-face-badge no-item">0 Selected</span>`:Ke`<span class="select-face-badge"
          >${this._opts.selectedIndexes.length} Selected</span
        >`}_renderComboboxFace(){const e=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",t=this.open?"true":"false";return Ke`
      <div class="combobox-face face">
        ${this._opts.multiSelect?this._renderLabel():Xe}
        <input
          aria-activedescendant=${e}
          aria-autocomplete="list"
          aria-controls="select-listbox"
          aria-expanded=${t}
          aria-haspopup="listbox"
          aria-label=${Nt(this.label)}
          class="combobox-input"
          role="combobox"
          spellcheck="false"
          type="text"
          autocomplete="off"
          .value=${this._opts.filterPattern}
          @focus=${this._onComboboxInputFocus}
          @blur=${this._onComboboxInputBlur}
          @input=${this._onComboboxInputInput}
          @click=${this._onComboboxInputClick}
          @keydown=${this._onComboboxInputSpaceKeyDown}
        />
        <button
          aria-label="Open the list of options"
          class="combobox-button"
          type="button"
          @click=${this._onComboboxButtonClick}
          @keydown=${this._onComboboxButtonKeyDown}
          tabindex="-1"
        >
          ${Do}
        </button>
      </div>
    `}_renderSelectFace(){const e=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",t=this.open?"true":"false";return Ke`
      <div
        aria-activedescendant=${Nt(this._opts.multiSelect?void 0:e)}
        aria-controls="select-listbox"
        aria-expanded=${Nt(this._opts.multiSelect?void 0:t)}
        aria-haspopup="listbox"
        aria-label=${Nt(this.label??void 0)}
        class="select-face face multiselect"
        @click=${this._onFaceClick}
        .tabIndex=${this.disabled?-1:0}
      >
        ${this._renderLabel()} ${Do}
      </div>
    `}_renderDropdownControls(){return this._filteredOptions.length>0?Ke`
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
        `:Ke`${Xe}`}render(){return Ke`
      <div class="multi-select">
        <slot class="main-slot" @slotchange=${this._onSlotChange}></slot>
        ${this.combobox?this._renderComboboxFace():this._renderSelectFace()}
        ${this._renderDropdown()}
      </div>
    `}};cs.styles=as,cs.shadowRootOptions={...ut.shadowRootOptions,delegatesFocus:!0},cs.formAssociated=!0,ls([gt({type:Array,attribute:"default-value"})],cs.prototype,"defaultValue",void 0),ls([gt({type:Boolean,reflect:!0})],cs.prototype,"required",void 0),ls([gt({reflect:!0})],cs.prototype,"name",void 0),ls([gt({type:Array,attribute:!1})],cs.prototype,"selectedIndexes",null),ls([gt({type:Array})],cs.prototype,"value",null),ls([yt(".face")],cs.prototype,"_faceElement",void 0),cs=ls([Et("vscode-multi-select")],cs),oe({tagName:"vscode-multi-select",elementClass:cs,react:v,displayName:"VscodeMultiSelect",events:{onChange:"change",onInvalid:"invalid",onVscMultiSelectCreateOption:"vsc-multi-select-create-option"}}),oe({tagName:"vscode-option",elementClass:Go,react:v,displayName:"VscodeOption"});const ds=[It,ce`
    :host {
      display: block;
      height: 2px;
      width: 100%;
      outline: none;
    }

    .container {
      position: relative;
      width: 100%;
      height: 100%;
      overflow: hidden;
    }

    .track {
      position: absolute;
      inset: 0;
      background: transparent;
    }

    .indicator {
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      height: 100%;
      background: var(--vscode-progressBar-background, #0078d4);
      will-change: transform, width, left;
    }

    /* Determinate mode: width is set inline via style attribute */
    .discrete .indicator {
      transition: width 100ms linear;
    }

    /* Indeterminate mode: VS Code style progress bit */
    .infinite .indicator {
      width: 2%;
      animation-name: progress;
      animation-duration: 4s;
      animation-iteration-count: infinite;
      animation-timing-function: linear;
      transform: translate3d(0px, 0px, 0px);
    }

    /* Long running: reduce GPU pressure using stepped animation */
    .infinite.infinite-long-running .indicator {
      animation-timing-function: steps(100);
    }

    /* Keyframes adapted from VS Code */
    @keyframes progress {
      from {
        transform: translateX(0%) scaleX(1);
      }
      50% {
        transform: translateX(2500%) scaleX(3);
      }
      to {
        transform: translateX(4900%) scaleX(1);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .discrete .indicator {
        transition: none;
      }
      .infinite .indicator,
      .infinite-long-running .indicator {
        animation: none;
        width: 100%;
      }
    }
  `];var hs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ps=class extends $t{constructor(){super(...arguments),this.ariaLabel="Loading",this.max=100,this.indeterminate=!1,this.longRunningThreshold=15e3,this._longRunning=!1}get _isDeterminate(){return!this.indeterminate&&"number"==typeof this.value&&isFinite(this.value)}connectedCallback(){super.connectedCallback(),this._maybeStartLongRunningTimer()}disconnectedCallback(){super.disconnectedCallback(),this._clearLongRunningTimer()}willUpdate(){this._maybeStartLongRunningTimer()}render(){const e=this.max>0?this.max:100,t=this._isDeterminate?Math.min(Math.max(this.value??0,0),e):0,o=this._isDeterminate?t/e*100:0,s={container:!0,discrete:this._isDeterminate,infinite:!this._isDeterminate,"infinite-long-running":this._longRunning&&!this._isDeterminate};return Ke`
      <div
        class=${Ft(s)}
        part="container"
        role="progressbar"
        aria-label=${this.ariaLabel}
        aria-valuemin="0"
        aria-valuemax=${String(e)}
        aria-valuenow=${Nt(this._isDeterminate?String(Math.round(t)):void 0)}
      >
        <div class="track" part="track"></div>
        <div
          class="indicator"
          part="indicator"
          .style=${jt({width:this._isDeterminate?`${o}%`:void 0})}
        ></div>
      </div>
    `}_maybeStartLongRunningTimer(){if(!(!this._isDeterminate&&this.longRunningThreshold>0&&this.isConnected))return this._clearLongRunningTimer(),void(this._longRunning=!1);this._longRunningHandle||(this._longRunningHandle=setTimeout(()=>{this._longRunning=!0,this._longRunningHandle=void 0,this.requestUpdate()},this.longRunningThreshold))}_clearLongRunningTimer(){this._longRunningHandle&&(clearTimeout(this._longRunningHandle),this._longRunningHandle=void 0)}};ps.styles=ds,hs([gt({reflect:!0,attribute:"aria-label"})],ps.prototype,"ariaLabel",void 0),hs([gt({type:Number,reflect:!0})],ps.prototype,"value",void 0),hs([gt({type:Number,reflect:!0})],ps.prototype,"max",void 0),hs([gt({type:Boolean,reflect:!0})],ps.prototype,"indeterminate",void 0),hs([gt({type:Number,attribute:"long-running-threshold"})],ps.prototype,"longRunningThreshold",void 0),hs([mt()],ps.prototype,"_longRunning",void 0),ps=hs([Et("vscode-progress-bar")],ps),oe({tagName:"vscode-progress-bar",elementClass:ps,react:v,displayName:"VscodeProgressBar"});const us=[It,ce`
    :host {
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
  `];var vs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let bs=class extends $t{constructor(){super(...arguments),this.ariaLabel="Loading",this.ariaLive="assertive",this.role="alert"}render(){return Ke`<svg class="progress" part="progress" viewBox="0 0 16 16">
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
    </svg>`}};bs.styles=us,vs([gt({reflect:!0,attribute:"aria-label"})],bs.prototype,"ariaLabel",void 0),vs([gt({reflect:!0,attribute:"aria-live"})],bs.prototype,"ariaLive",void 0),vs([gt({reflect:!0})],bs.prototype,"role",void 0),bs=vs([Et("vscode-progress-ring")],bs);const fs=oe({tagName:"vscode-progress-ring",elementClass:bs,react:v,displayName:"VscodeProgressRing"}),gs=[It,eo,ce`
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
  `];var ms=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let _s=class extends(Qt(Jt)){get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}constructor(){super(),this.autofocus=!1,this.checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name="",this.type="radio",this.value="",this.disabled=!1,this.required=!1,this.tabIndex=0,this._slottedText="",this._handleClick=()=>{this.disabled||this.checked||(this._checkButton(),this._handleValueChange(),this.dispatchEvent(new Event("change",{bubbles:!0})))},this._handleKeyDown=e=>{this.disabled||"Enter"!==e.key&&" "!==e.key||(e.preventDefault()," "!==e.key||this.checked||(this.checked=!0,this._handleValueChange(),this.dispatchEvent(new Event("change",{bubbles:!0}))),"Enter"===e.key&&this._internals.form?.requestSubmit())},this._internals=this.attachInternals(),this.addEventListener("keydown",this._handleKeyDown),this.addEventListener("click",this._handleClick)}connectedCallback(){super.connectedCallback(),this._handleValueChange()}update(e){super.update(e),e.has("checked")&&this._handleValueChange(),e.has("required")&&this._handleValueChange()}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}formResetCallback(){this._getRadios().forEach(e=>{e.checked=e.defaultChecked}),this.updateComplete.then(()=>{this._handleValueChange()})}formStateRestoreCallback(e,t){this.value===e&&""!==e&&(this.checked=!0)}setComponentValidity(e){e?this._internals.setValidity({}):this._internals.setValidity({valueMissing:!0},"Please select one of these options.",this._inputEl)}_getRadios(){const e=this.getRootNode({composed:!1});if(!e)return[];const t=e.querySelectorAll(`vscode-radio[name="${this.name}"]`);return Array.from(t)}_uncheckOthers(e){e.forEach(e=>{e!==this&&(e.checked=!1)})}_checkButton(){const e=this._getRadios();this.checked=!0,e.forEach(e=>{e!==this&&(e.checked=!1)})}_setGroupValidity(e,t){this.updateComplete.then(()=>{e.forEach(e=>{e.setComponentValidity(t)})})}_setActualFormValue(){let e="";e=this.checked?this.value?this.value:"on":null,this._internals.setFormValue(e)}_handleValueChange(){const e=this._getRadios(),t=e.some(e=>e.required);if(this._setActualFormValue(),this.checked)this._uncheckOthers(e),this._setGroupValidity(e,!0);else{const o=!!e.find(e=>e.checked),s=t&&!o;this._setGroupValidity(e,!s)}}render(){const e=Ft({icon:!0,checked:this.checked}),t=Ft({"label-inner":!0,"is-slot-empty":""===this._slottedText});return Ke`
      <div class="wrapper">
        <input
          ?autofocus=${this.autofocus}
          id="input"
          class="radio"
          type="checkbox"
          ?checked=${this.checked}
          value=${this.value}
          tabindex=${this.tabIndex}
        />
        <div class=${e}></div>
        <label for="input" class="label" @click=${this._handleClick}>
          <span class=${t}>
            ${this._renderLabelAttribute()}
            <slot @slotchange=${this._handleSlotChange}></slot>
          </span>
        </label>
      </div>
    `}};_s.styles=gs,_s.formAssociated=!0,_s.shadowRootOptions={...ut.shadowRootOptions,delegatesFocus:!0},ms([gt({type:Boolean,reflect:!0})],_s.prototype,"autofocus",void 0),ms([gt({type:Boolean,reflect:!0})],_s.prototype,"checked",void 0),ms([gt({type:Boolean,reflect:!0,attribute:"default-checked"})],_s.prototype,"defaultChecked",void 0),ms([gt({type:Boolean,reflect:!0})],_s.prototype,"invalid",void 0),ms([gt({reflect:!0})],_s.prototype,"name",void 0),ms([gt()],_s.prototype,"type",void 0),ms([gt()],_s.prototype,"value",void 0),ms([gt({type:Boolean,reflect:!0})],_s.prototype,"disabled",void 0),ms([gt({type:Boolean,reflect:!0})],_s.prototype,"required",void 0),ms([gt({type:Number,reflect:!0})],_s.prototype,"tabIndex",void 0),ms([mt()],_s.prototype,"_slottedText",void 0),ms([yt("#input")],_s.prototype,"_inputEl",void 0),_s=ms([Et("vscode-radio")],_s),oe({tagName:"vscode-radio",elementClass:_s,react:v,displayName:"VscodeRadio",events:{onChange:"change",onInvalid:"invalid"}});const ys=[It,ce`
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
  `];var xs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ws=class extends $t{constructor(){super(),this.variant="horizontal",this.role="radiogroup",this._focusedRadio=-1,this._checkedRadio=-1,this._firstContentLoaded=!1,this._handleKeyDown=e=>{const{key:t}=e;["ArrowLeft","ArrowUp","ArrowRight","ArrowDown"].includes(t)&&e.preventDefault(),"ArrowRight"!==t&&"ArrowDown"!==t||this._checkNext(),"ArrowLeft"!==t&&"ArrowUp"!==t||this._checkPrev()},this.addEventListener("keydown",this._handleKeyDown)}_uncheckPreviousChecked(e,t){-1!==e&&(this._radios[e].checked=!1),-1!==t&&(this._radios[t].tabIndex=-1)}_afterCheck(){this._focusedRadio=this._checkedRadio,this._radios[this._checkedRadio].checked=!0,this._radios[this._checkedRadio].tabIndex=0,this._radios[this._checkedRadio].focus()}_checkPrev(){const e=this._radios.findIndex(e=>e.checked),t=this._radios.findIndex(e=>e.focused),o=-1!==t?t:e;this._uncheckPreviousChecked(e,t),this._checkedRadio=-1===o?this._radios.length-1:o-1>=0?o-1:this._radios.length-1,this._afterCheck()}_checkNext(){const e=this._radios.findIndex(e=>e.checked),t=this._radios.findIndex(e=>e.focused),o=-1!==t?t:e;this._uncheckPreviousChecked(e,t),-1===o?this._checkedRadio=0:o+1<this._radios.length?this._checkedRadio=o+1:this._checkedRadio=0,this._afterCheck()}_handleChange(e){const t=this._radios.findIndex(t=>t===e.target);-1!==t&&(-1!==this._focusedRadio&&(this._radios[this._focusedRadio].tabIndex=-1),-1!==this._checkedRadio&&this._checkedRadio!==t&&(this._radios[this._checkedRadio].checked=!1),this._focusedRadio=t,this._checkedRadio=t,this._radios[t].tabIndex=0)}_handleSlotChange(){if(!this._firstContentLoaded){const e=this._radios.findIndex(e=>e.autofocus);e>-1&&(this._focusedRadio=e),this._firstContentLoaded=!0}let e=-1;this._radios.forEach((t,o)=>{this._focusedRadio>-1?t.tabIndex=o===this._focusedRadio?0:-1:t.tabIndex=0===o?0:-1,t.defaultChecked&&(e>-1&&(this._radios[e].defaultChecked=!1),e=o)}),e>-1&&(this._radios[e].checked=!0)}render(){return Ke`
      <div class="wrapper">
        <slot
          @slotchange=${this._handleSlotChange}
          @change=${this._handleChange}
        ></slot>
      </div>
    `}};ws.styles=ys,xs([gt({reflect:!0})],ws.prototype,"variant",void 0),xs([gt({reflect:!0})],ws.prototype,"role",void 0),xs([wt({selector:"vscode-radio"})],ws.prototype,"_radios",void 0),xs([mt()],ws.prototype,"_focusedRadio",void 0),xs([mt()],ws.prototype,"_checkedRadio",void 0),ws=xs([Et("vscode-radio-group")],ws),oe({tagName:"vscode-radio-group",elementClass:ws,react:v,displayName:"VscodeRadioGroup",events:{onChange:"change"}}),oe({tagName:"vscode-scrollable",elementClass:ss,react:v,displayName:"VscodeScrollable"});var Cs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ks=class extends rs{set selectedIndex(e){this._opts.selectedIndex=e;const t=this._opts.getOptionByIndex(e);t?(this._opts.activeIndex=e,this._value=t.value,this._internals.setFormValue(this._value),this._manageRequired()):(this._value="",this._internals.setFormValue(""),this._manageRequired())}get selectedIndex(){return this._opts.selectedIndex}set value(e){this._opts.value=e,this._opts.selectedIndex>-1?this._requestedValueToSetLater="":this._requestedValueToSetLater=e,this._internals.setFormValue(this._value),this._manageRequired()}get value(){return this._opts.value}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}updateInputValue(){if(!this.combobox)return;const e=this.renderRoot.querySelector(".combobox-input");if(e){const t=this._opts.getSelectedOption();e.value=t?.label??""}}constructor(){super(),this.defaultValue="",this.name=void 0,this.required=!1,this._requestedValueToSetLater="",this._opts.multiSelect=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._manageRequired()})}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(e,t){this.updateComplete.then(()=>{this.value=e})}get type(){return"select-one"}get form(){return this._internals.form}async _createAndSelectSuggestedOption(){const e=this._createSuggestedOption();await this.updateComplete,this._opts.selectedIndex=e,this._dispatchChangeEvent();const t=new CustomEvent("vsc-single-select-create-option",{detail:{value:this._opts.getOptionByIndex(e)?.value??""}});this.dispatchEvent(t),this.open=!1,this._isPlaceholderOptionActive=!1}_setStateFromSlottedElements(){super._setStateFromSlottedElements(),this.combobox||0!==this._opts.selectedIndexes.length||(this._opts.selectedIndex=this._opts.options.length>0?0:-1)}_onSlotChange(){if(super._onSlotChange(),this._requestedValueToSetLater){const e=this._opts.getOptionByValue(this._requestedValueToSetLater);e&&(this._opts.selectedIndex=e.index,this._requestedValueToSetLater="")}this._opts.selectedIndex>-1&&this._opts.numOptions>0?(this._internals.setFormValue(this._opts.value),this._manageRequired()):(this._internals.setFormValue(null),this._manageRequired())}_onEnterKeyDown(e){super._onEnterKeyDown(e);let t=!1;this.combobox?this.open?this._isPlaceholderOptionActive?this._createAndSelectSuggestedOption():(t=this._opts.activeIndex!==this._opts.selectedIndex,this._opts.selectedIndex=this._opts.activeIndex,this.open=!1):(this.open=!0,this._scrollActiveElementToTop()):this.open?(t=this._opts.activeIndex!==this._opts.selectedIndex,this._opts.selectedIndex=this._opts.activeIndex,this.open=!1):(this.open=!0,this._scrollActiveElementToTop()),t&&(this._dispatchChangeEvent(),this.updateInputValue(),this._internals.setFormValue(this._opts.value),this._manageRequired())}_onOptionClick(e){super._onOptionClick(e);const t=e.composedPath().find(e=>{if("matches"in e)return e.matches("li.option")});if(!t||t.matches(".disabled"))return;t.classList.contains("placeholder")?this.creatable&&this._createAndSelectSuggestedOption():(this._opts.selectedIndex=Number(t.dataset.index),this.open=!1,this._internals.setFormValue(this._opts.value),this._manageRequired(),this._dispatchChangeEvent())}_manageRequired(){const{value:e}=this;""===e&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._face):this._internals.setValidity({})}_renderSelectFace(){const e=this._opts.getSelectedOption(),t=e?.label??"",o=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"";return Ke`
      <div
        aria-activedescendant=${o}
        aria-controls="select-listbox"
        aria-expanded=${this.open?"true":"false"}
        aria-haspopup="listbox"
        aria-label=${Nt(this.label)}
        class="select-face face"
        @click=${this._onFaceClick}
        role="combobox"
        tabindex="0"
      >
        <span class="text">${t}</span> ${Do}
      </div>
    `}_renderComboboxFace(){let e="";if(this._isBeingFiltered)e=this._opts.filterPattern;else{const t=this._opts.getSelectedOption();e=t?.label??""}const t=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",o=this.open?"true":"false";return Ke`
      <div class="combobox-face face">
        <input
          aria-activedescendant=${t}
          aria-autocomplete="list"
          aria-controls="select-listbox"
          aria-expanded=${o}
          aria-haspopup="listbox"
          aria-label=${Nt(this.label)}
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
        />
        <button
          aria-label="Open the list of options"
          class="combobox-button"
          type="button"
          @click=${this._onComboboxButtonClick}
          @keydown=${this._onComboboxButtonKeyDown}
          tabindex="-1"
        >
          ${Do}
        </button>
      </div>
    `}render(){return Ke`
      <div class="single-select">
        <slot class="main-slot" @slotchange=${this._onSlotChange}></slot>
        ${this.combobox?this._renderComboboxFace():this._renderSelectFace()}
        ${this._renderDropdown()}
      </div>
    `}};ks.styles=as,ks.shadowRootOptions={...ut.shadowRootOptions,delegatesFocus:!0},ks.formAssociated=!0,Cs([gt({attribute:"default-value"})],ks.prototype,"defaultValue",void 0),Cs([gt({reflect:!0})],ks.prototype,"name",void 0),Cs([gt({type:Number,attribute:"selected-index"})],ks.prototype,"selectedIndex",null),Cs([gt({type:String})],ks.prototype,"value",null),Cs([gt({type:Boolean,reflect:!0})],ks.prototype,"required",void 0),Cs([yt(".face")],ks.prototype,"_face",void 0),ks=Cs([Et("vscode-single-select")],ks),oe({tagName:"vscode-single-select",elementClass:ks,react:v,displayName:"VscodeSingleSelect",events:{onChange:"change",onInvalid:"invalid",onVscSingleSelectCreateOption:"vsc-single-select-create-option"}});const Ss=[It,ce`
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
  `];var $s,Es=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const Is=e=>{if(!e)return{value:0,unit:"pixel"};let t,o;e.endsWith("%")?(t="percent",o=+e.substring(0,e.length-1)):e.endsWith("px")?(t="pixel",o=+e.substring(0,e.length-2)):(t="pixel",o=+e);return{unit:t,value:isNaN(o)?0:o}},As=(e,t)=>0===t?0:Math.min(100,e/t*100),Os=(e,t)=>t*(e/100);let Ps=$s=class extends $t{set split(e){this._split!==e&&(this._split=e,this.resetHandlePosition())}get split(){return this._split}set handlePosition(e){this._rawHandlePosition=e,this._handlePositionPropChanged()}get handlePosition(){return this._rawHandlePosition}set fixedPane(e){this._fixedPane=e,this._fixedPanePropChanged()}get fixedPane(){return this._fixedPane}set minStart(e){const t=e??void 0;this._minStart!==t&&(this._minStart=t,this._applyMinSizeConstraints())}get minStart(){return this._minStart}set minEnd(e){const t=e??void 0;this._minEnd!==t&&(this._minEnd=t,this._applyMinSizeConstraints())}get minEnd(){return this._minEnd}constructor(){super(),this._split="vertical",this.resetOnDblClick=!1,this.handleSize=4,this.initialHandlePosition="50%",this._fixedPane="none",this._handlePosition=0,this._isDragActive=!1,this._hover=!1,this._hide=!1,this._boundRect=new DOMRect,this._handleOffset=0,this._wrapperObserved=!1,this._fixedPaneSize=0,this._handleResize=e=>{const t=e[0].contentRect,{width:o,height:s}=t;this._boundRect=t;const i="vertical"===this.split?o:s;"start"===this.fixedPane&&(this._handlePosition=this._fixedPaneSize),"end"===this.fixedPane&&(this._handlePosition=i-this._fixedPaneSize),this._handlePosition=this._clampHandlePosition(this._handlePosition,i),this._updateFixedPaneSize(i)},this._handleMouseUp=e=>{this._isDragActive=!1,e.target!==this&&(this._hover=!1,this._hide=!0),window.removeEventListener("mouseup",this._handleMouseUp),window.removeEventListener("mousemove",this._handleMouseMove);const{width:t,height:o}=this._boundRect,s="vertical"===this.split?t:o,i=As(this._handlePosition,s);this.dispatchEvent(new CustomEvent("vsc-split-layout-change",{detail:{position:this._handlePosition,positionInPercentage:i},composed:!0}))},this._handleMouseMove=e=>{const{clientX:t,clientY:o}=e,{left:s,top:i,height:n,width:r}=this._boundRect,a="vertical"===this.split,l=a?r:n,c=(a?t-s:o-i)-this._handleOffset+this.handleSize/2;this._handlePosition=this._clampHandlePosition(c,l),this._updateFixedPaneSize(l)},this._resizeObserver=new ResizeObserver(this._handleResize)}resetHandlePosition(){if(!this._wrapperEl)return void(this._handlePosition=0);const{width:e,height:t}=this._wrapperEl.getBoundingClientRect(),o="vertical"===this.split?e:t,{value:s,unit:i}=Is(this.initialHandlePosition??"50%"),n="percent"===i?Os(s,o):s;this._handlePosition=this._clampHandlePosition(n,o),this._updateFixedPaneSize(o)}connectedCallback(){super.connectedCallback()}firstUpdated(e){"none"!==this.fixedPane&&(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0),this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:t,unit:o}=this.handlePosition?Is(this.handlePosition):Is(this.initialHandlePosition);this._setPosition(t,o),this._initFixedPane()}_handlePositionPropChanged(){if(this.handlePosition&&this._wrapperEl){this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:e,unit:t}=Is(this.handlePosition);this._setPosition(e,t)}}_fixedPanePropChanged(){this._wrapperEl&&this._initFixedPane()}_initFixedPane(){if("none"===this.fixedPane)this._wrapperObserved&&(this._resizeObserver.unobserve(this._wrapperEl),this._wrapperObserved=!1);else{const{width:e,height:t}=this._boundRect,o="vertical"===this.split?e:t;this._fixedPaneSize="start"===this.fixedPane?this._handlePosition:o-this._handlePosition,this._wrapperObserved||(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0)}}_applyMinSizeConstraints(){if(!this._wrapperEl)return;this._boundRect=this._wrapperEl.getBoundingClientRect();const{width:e,height:t}=this._boundRect,o="vertical"===this.split?e:t;this._handlePosition=this._clampHandlePosition(this._handlePosition,o),this._updateFixedPaneSize(o)}_resolveMinSizePx(e,t){if(!e)return 0;const{unit:o,value:s}=Is(e),i="percent"===o?Os(s,t):s;return isFinite(i)?Math.max(0,Math.min(i,t)):0}_clampHandlePosition(e,t){if(!isFinite(t)||t<=0)return 0;const o=this._resolveMinSizePx(this._minStart,t),s=this._resolveMinSizePx(this._minEnd,t),i=Math.min(o,t),n=Math.max(i,t-s),r=Math.max(i,Math.min(e,n));return Math.max(0,Math.min(r,t))}_updateFixedPaneSize(e){"start"===this.fixedPane?this._fixedPaneSize=this._handlePosition:"end"===this.fixedPane&&(this._fixedPaneSize=e-this._handlePosition)}_setPosition(e,t){const{width:o,height:s}=this._boundRect,i="vertical"===this.split?o:s,n="percent"===t?Os(e,i):e;this._handlePosition=this._clampHandlePosition(n,i),this._updateFixedPaneSize(i)}_handleMouseOver(){this._hover=!0,this._hide=!1}_handleMouseOut(e){1!==e.buttons&&(this._hover=!1,this._hide=!0)}_handleMouseDown(e){e.stopPropagation(),e.preventDefault(),this._boundRect=this._wrapperEl.getBoundingClientRect();const{left:t,top:o}=this._boundRect,{left:s,top:i}=this._handleEl.getBoundingClientRect(),n=e.clientX-t,r=e.clientY-o;"vertical"===this.split&&(this._handleOffset=n-(s-t)),"horizontal"===this.split&&(this._handleOffset=r-(i-o)),this._isDragActive=!0,window.addEventListener("mouseup",this._handleMouseUp),window.addEventListener("mousemove",this._handleMouseMove)}_handleDblClick(){this.resetOnDblClick&&this.resetHandlePosition()}_handleSlotChange(){[...this._nestedLayoutsAtStart,...this._nestedLayoutsAtEnd].forEach(e=>{e instanceof $s&&e.resetHandlePosition()})}render(){const{width:e,height:t}=this._boundRect,o="vertical"===this.split?e:t,s="none"!==this.fixedPane?`${this._handlePosition}px`:`${As(this._handlePosition,o)}%`;let i="";i="start"===this.fixedPane?`0 0 ${this._fixedPaneSize}px`:`1 1 ${As(this._handlePosition,o)}%`;let n="";n="end"===this.fixedPane?`0 0 ${this._fixedPaneSize}px`:`1 1 ${As(o-this._handlePosition,o)}%`;const r={left:"vertical"===this.split?s:"0",top:"vertical"===this.split?"0":s},a=this.handleSize??4;"vertical"===this.split&&(r.marginLeft=0-a/2+"px",r.width=`${a}px`),"horizontal"===this.split&&(r.height=`${a}px`,r.marginTop=0-a/2+"px");const l=Ft({"handle-overlay":!0,active:this._isDragActive,"split-vertical":"vertical"===this.split,"split-horizontal":"horizontal"===this.split}),c=Ft({handle:!0,hover:this._hover,hide:this._hide,"split-vertical":"vertical"===this.split,"split-horizontal":"horizontal"===this.split}),d={wrapper:!0,horizontal:"horizontal"===this.split};return Ke`
      <div class=${Ft(d)}>
        <div class="start" .style=${jt({flex:i})}>
          <slot name="start" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class="end" .style=${jt({flex:n})}>
          <slot name="end" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class=${l}></div>
        <div
          class=${c}
          .style=${jt(r)}
          @mouseover=${this._handleMouseOver}
          @mouseout=${this._handleMouseOut}
          @mousedown=${this._handleMouseDown}
          @dblclick=${this._handleDblClick}
        ></div>
      </div>
    `}};Ps.styles=Ss,Es([gt({reflect:!0})],Ps.prototype,"split",null),Es([gt({type:Boolean,reflect:!0,attribute:"reset-on-dbl-click"})],Ps.prototype,"resetOnDblClick",void 0),Es([gt({type:Number,reflect:!0,attribute:"handle-size"})],Ps.prototype,"handleSize",void 0),Es([gt({reflect:!0,attribute:"initial-handle-position"})],Ps.prototype,"initialHandlePosition",void 0),Es([gt({attribute:"handle-position"})],Ps.prototype,"handlePosition",null),Es([gt({attribute:"fixed-pane"})],Ps.prototype,"fixedPane",null),Es([gt({attribute:"min-start"})],Ps.prototype,"minStart",null),Es([gt({attribute:"min-end"})],Ps.prototype,"minEnd",null),Es([mt()],Ps.prototype,"_handlePosition",void 0),Es([mt()],Ps.prototype,"_isDragActive",void 0),Es([mt()],Ps.prototype,"_hover",void 0),Es([mt()],Ps.prototype,"_hide",void 0),Es([yt(".wrapper")],Ps.prototype,"_wrapperEl",void 0),Es([yt(".handle")],Ps.prototype,"_handleEl",void 0),Es([wt({slot:"start",selector:"vscode-split-layout"})],Ps.prototype,"_nestedLayoutsAtStart",void 0),Es([wt({slot:"end",selector:"vscode-split-layout"})],Ps.prototype,"_nestedLayoutsAtEnd",void 0),Ps=$s=Es([Et("vscode-split-layout")],Ps),oe({tagName:"vscode-split-layout",elementClass:Ps,react:v,displayName:"VscodeSplitLayout",events:{onVscSplitLayoutChange:"vsc-split-layout-change"}});const Rs=[It,ce`
    :host {
      cursor: pointer;
      display: block;
      user-select: none;
    }

    .wrapper {
      align-items: center;
      border-bottom: 1px solid transparent;
      color: var(--vscode-foreground, #cccccc);
      display: flex;
      min-height: 20px;
      overflow: hidden;
      padding: 7px 8px;
      position: relative;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    :host([active]) .wrapper {
      border-bottom-color: var(--vscode-panelTitle-activeForeground, #cccccc);
      color: var(--vscode-panelTitle-activeForeground, #cccccc);
    }

    :host([panel]) .wrapper {
      border-bottom: 0;
      margin-bottom: 0;
      padding: 0;
    }

    :host(:focus-visible) {
      outline: none;
    }

    .wrapper {
      align-items: center;
      color: var(--vscode-foreground, #cccccc);
      display: flex;
      min-height: 20px;
      overflow: inherit;
      text-overflow: inherit;
      position: relative;
    }

    .wrapper.panel {
      color: var(--vscode-panelTitle-inactiveForeground, #9d9d9d);
    }

    .wrapper.panel.active,
    .wrapper.panel:hover {
      color: var(--vscode-panelTitle-activeForeground, #cccccc);
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
      border-top: 1px solid var(--vscode-panelTitle-activeBorder, #0078d4);
      bottom: 4px;
      display: block;
      left: 8px;
      pointer-events: none;
      position: absolute;
      right: 8px;
    }

    :host(:focus-visible) .wrapper {
      outline-color: var(--vscode-focusBorder, #0078d4);
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
  `];var Bs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let zs=class extends $t{constructor(){super(...arguments),this.active=!1,this.ariaControls="",this.panel=!1,this.role="tab",this.tabId=-1}attributeChangedCallback(e,t,o){if(super.attributeChangedCallback(e,t,o),"active"===e){const e=null!==o;this.ariaSelected=e?"true":"false",this.tabIndex=e?0:-1}}render(){return Ke`
      <div
        class=${Ft({wrapper:!0,active:this.active,panel:this.panel})}
      >
        <div class="before"><slot name="content-before"></slot></div>
        <div class="main"><slot></slot></div>
        <div class="after"><slot name="content-after"></slot></div>
        <span
          class=${Ft({"active-indicator":!0,active:this.active,panel:this.panel})}
        ></span>
      </div>
    `}};zs.styles=Rs,Bs([gt({type:Boolean,reflect:!0})],zs.prototype,"active",void 0),Bs([gt({reflect:!0,attribute:"aria-controls"})],zs.prototype,"ariaControls",void 0),Bs([gt({type:Boolean,reflect:!0})],zs.prototype,"panel",void 0),Bs([gt({reflect:!0})],zs.prototype,"role",void 0),Bs([gt({type:Number,reflect:!0,attribute:"tab-id"})],zs.prototype,"tabId",void 0),zs=Bs([Et("vscode-tab-header")],zs),oe({tagName:"vscode-tab-header",elementClass:zs,react:v,displayName:"VscTabHeader"});const Vs=e=>e,Ds=[{test:e=>/^-?\d+(\.\d+)?%$/.test(e),parse:e=>Number(e.slice(0,-1))},{test:e=>/^-?\d+(\.\d+)?px$/.test(e),parse:(e,t)=>Number(e.slice(0,-2))/t*100},{test:e=>/^-?\d+(\.\d+)?$/.test(e),parse:(e,t)=>Number(e)/t*100}],Ls=(e,t)=>{if(!Number.isFinite(t)||0===t)return null;if("number"==typeof e)return Number.isFinite(e)?e/t*100:null;const o=e.trim(),s=Ds.find(e=>e.test(o));return s?s.parse(o,t):null},Ms=[It,ce`
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
      --vsc-row-even-background: var(
        --vscode-keybindingTable-rowsBackground,
        rgba(204, 204, 204, 0.04)
      );
    }

    :host([zebra-odd]) {
      --vsc-row-odd-background: var(
        --vscode-keybindingTable-rowsBackground,
        rgba(204, 204, 204, 0.04)
      );
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
      background-color: var(
        --vscode-editorGroup-border,
        rgba(255, 255, 255, 0.09)
      );
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
      background-color: var(
        --vscode-editorGroup-border,
        rgba(255, 255, 255, 0.09)
      );
      height: calc(100% - 30px);
      position: absolute;
      top: 30px;
      width: ${1}px;
    }

    .sash.hover .sash-visible {
      background-color: var(--vscode-sash-hoverBorder, #0078d4);
      transition: background-color 50ms linear 300ms;
    }

    .sash .sash-clickable {
      height: 100%;
      left: ${-2}px;
      position: absolute;
      width: ${5}px;
    }
  `];class Ts{constructor(e){this._hostWidth=0,this._hostX=0,this._activeSplitter=null,this._columnMinWidths=new Map,this._columnWidths=[],this._dragState=null,this._cachedSplitterPositions=null,(this._host=e).addController(this)}hostConnected(){this.saveHostDimensions()}get isDragging(){return null!==this._dragState}get splitterPositions(){if(this._cachedSplitterPositions)return this._cachedSplitterPositions;const e=[];let t=0;for(let o=0;o<this._columnWidths.length-1;o++)t=Vs(t+this._columnWidths[o]),e.push(t);return this._cachedSplitterPositions=e,e}getActiveSplitterCalculatedPosition(){const e=this.splitterPositions;if(!this._dragState)return 0;const t=e[this._dragState.splitterIndex];return this._toPx(t)}get columnWidths(){return this._columnWidths}get columnMinWidths(){return new Map(this._columnMinWidths)}saveHostDimensions(){const e=this._host.getBoundingClientRect(),{width:t,x:o}=e;return this._hostWidth=t,this._hostX=o,this}setActiveSplitter(e){return this._activeSplitter=e,this}getActiveSplitter(){return this._activeSplitter}setColumnMinWidthAt(e,t){return this._columnMinWidths.set(e,t),this._host.requestUpdate(),this}setColumWidths(e){return this._columnWidths=e,this._cachedSplitterPositions=null,this._host.requestUpdate(),this}shouldDrag(e){return+e.currentTarget.dataset.index===this._dragState?.splitterIndex}startDrag(e){if(e.stopPropagation(),this._dragState)return;this._activeSplitter?.setPointerCapture(e.pointerId);const t=e.pageX,o=e.currentTarget,s=t-o.getBoundingClientRect().x;this._dragState={dragOffset:s,pointerId:e.pointerId,splitterIndex:+o.dataset.index,prevX:t-s},this._host.requestUpdate()}drag(e){if(e.stopPropagation(),!e?.currentTarget?.hasPointerCapture?.(e.pointerId))return;if(!this._dragState)return;if(e.pointerId!==this._dragState.pointerId)return;if(!this.shouldDrag(e))return;const t=e.pageX,o=t-this._dragState.dragOffset,s=o-this._dragState.prevX,i=this._toPercent(s);this._dragState.prevX=o;const n=this.getActiveSplitterCalculatedPosition();s<=0&&t>n+this._hostX||s>0&&t<n+this._hostX||(this._columnWidths=function(e,t,o,s){const i=[...e];if(0===o||t<0||t>=e.length-1)return i;const n=Math.abs(o);let r=n;const a=[],l=[];for(let u=t;u>=0;u--)a.push(u);for(let u=t+1;u<e.length;u++)l.push(u);const c=o>0?l:a,d=o>0?a:l;let h=0;for(const u of c){const e=Math.max(0,i[u]-(s.get(u)??0));h=Vs(h+e)}if(h<r)return i;for(const u of c){if(0===r)break;const e=Math.max(0,i[u]-(s.get(u)??0)),t=Math.min(e,r);i[u]=Vs(i[u]-t),r=Vs(r-t)}let p=n;for(const u of d){if(0===p)break;i[u]=Vs(i[u]+p),p=Vs(0)}return i}(this._columnWidths,this._dragState.splitterIndex,i,this._columnMinWidths),this._cachedSplitterPositions=null,this._host.requestUpdate())}stopDrag(e){if(e.stopPropagation(),!this._dragState)return;const t=e.currentTarget;try{t.releasePointerCapture(this._dragState.pointerId)}catch(o){}this._dragState=null,this._activeSplitter=null,this._host.requestUpdate()}_toPercent(e){return((e,t)=>e/t*100)(e,this._hostWidth)}_toPx(e){return t=e,o=this._hostWidth,t/100*o;var t,o}}var Fs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Ns=class extends $t{set columns(e){if(!Array.isArray(e))return this.warn('Invalid value for "columns": expected an array.'),void(this._columns=[]);this._columns=e,this.isConnected&&this._initDefaultColumnSizes()}get columns(){return this._columns}constructor(){super(),this.role="table",this.resizable=!1,this.responsive=!1,this.bordered=!1,this.borderedColumns=!1,this.borderedRows=!1,this.breakpoint=300,this.minColumnWidth="50px",this.delayedResizing=!1,this.compact=!1,this.zebra=!1,this.zebraOdd=!1,this._sashPositions=[],this._isDragging=!1,this._sashHovers=[],this._columns=[],this._activeSashElementIndex=-1,this._componentH=0,this._componentW=0,this._headerCells=[],this._cellsOfFirstRow=[],this._prevHeaderHeight=0,this._prevComponentHeight=0,this._columnResizeController=new Ts(this),this._componentResizeObserverCallback=()=>{this._memoizeComponentDimensions(),this._updateResizeHandlersSize(),this.responsive&&this._toggleCompactView(),this._resizeTableBody()},this._headerResizeObserverCallback=()=>{this._updateResizeHandlersSize()},this._bodyResizeObserverCallback=()=>{this._resizeTableBody()},this._handleSplitterPointerMove=e=>{this._columnResizeController.shouldDrag(e)&&(this._columnResizeController.drag(e),this.delayedResizing?this._resizeColumns(!1):this._resizeColumns(!0))},this._handleSplitterPointerUp=e=>{this._stopDrag(e)},this._handleSplitterPointerCancel=e=>{this._stopDrag(e)},this._handleMinColumnWidthChange=e=>{const{columnIndex:t,propertyValue:o}=e.detail,s=Ls(o,this._componentW);s&&this._columnResizeController.setColumnMinWidthAt(t,s)},this.addEventListener("vsc-table-change-min-column-width",this._handleMinColumnWidthChange)}connectedCallback(){super.connectedCallback(),this._memoizeComponentDimensions(),this._initDefaultColumnSizes()}disconnectedCallback(){super.disconnectedCallback(),this._componentResizeObserver?.unobserve(this),this._componentResizeObserver?.disconnect(),this._bodyResizeObserver?.disconnect()}willUpdate(e){if(e.has("minColumnWidth")){const e=Ls(this.minColumnWidth,this._componentW)??0,t=this._columnResizeController.columnMinWidths,o=this._columnResizeController.columnWidths;for(let s=0;s<o.length;s++)t.has(s)||this._columnResizeController.setColumnMinWidthAt(s,e)}}_memoizeComponentDimensions(){const e=this.getBoundingClientRect();this._componentH=e.height,this._componentW=e.width}_queryHeaderCells(){const e=this._assignedHeaderElements;return e&&e[0]?Array.from(e[0].querySelectorAll("vscode-table-header-cell")):[]}_getHeaderCells(){return this._headerCells.length||(this._headerCells=this._queryHeaderCells()),this._headerCells}_queryCellsOfFirstRow(){const e=this._assignedBodyElements;return e&&e[0]?Array.from(e[0].querySelectorAll("vscode-table-row:first-child vscode-table-cell")):[]}_getCellsOfFirstRow(){return this._cellsOfFirstRow.length||(this._cellsOfFirstRow=this._queryCellsOfFirstRow()),this._cellsOfFirstRow}_resizeTableBody(){let e=0,t=0;const o=this.getBoundingClientRect().height;this._assignedHeaderElements&&this._assignedHeaderElements.length&&(e=this._assignedHeaderElements[0].getBoundingClientRect().height),this._assignedBodyElements&&this._assignedBodyElements.length&&(t=this._assignedBodyElements[0].getBoundingClientRect().height);const s=t-e-o;this._scrollableElement.style.height=s>0?o-e+"px":"auto"}_initResizeObserver(){this._componentResizeObserver=new ResizeObserver(this._componentResizeObserverCallback),this._componentResizeObserver.observe(this),this._headerResizeObserver=new ResizeObserver(this._headerResizeObserverCallback),this._headerResizeObserver.observe(this._headerElement)}_calculateInitialColumnWidths(){const e=this._getHeaderCells().length;let t=this.columns.slice(0,e);const o=t.filter(e=>"auto"===e).length+e-t.length;let s=100;if(t=t.map(e=>{const t=Ls(e,this._componentW);return null===t?"auto":(s-=t,t)}),t.length<e)for(let i=t.length;i<e;i++)t.push("auto");return t=t.map(e=>"auto"===e?s/o:e),t}_initHeaderCellSizes(e){this._getHeaderCells().forEach((t,o)=>{t.style.width=`${e[o]}%`})}_initBodyColumnSizes(e){this._getCellsOfFirstRow().forEach((t,o)=>{t.style.width=`${e[o]}%`})}_initSashes(e){const t=e.length;let o=0;this._sashPositions=[],e.forEach((e,s)=>{if(s<t-1){const t=o+e;this._sashPositions.push(t),o=t}})}_initDefaultColumnSizes(){const e=this._calculateInitialColumnWidths();this._columnResizeController.setColumWidths(e.map(e=>e)),this._initHeaderCellSizes(e),this._initBodyColumnSizes(e),this._initSashes(e)}_updateResizeHandlersSize(){const e=this._headerElement.getBoundingClientRect();if(e.height===this._prevHeaderHeight&&this._componentH===this._prevComponentHeight)return;this._prevHeaderHeight=e.height,this._prevComponentHeight=this._componentH;const t=this._componentH-e.height;this._sashVisibleElements.forEach(o=>{o.style.height=`${t}px`,o.style.top=`${e.height}px`})}_applyCompactViewColumnLabels(){const e=this._getHeaderCells().map(e=>e.innerText);this.querySelectorAll("vscode-table-row").forEach(t=>{t.querySelectorAll("vscode-table-cell").forEach((t,o)=>{t.columnLabel=e[o],t.compact=!0})})}_clearCompactViewColumnLabels(){this.querySelectorAll("vscode-table-cell").forEach(e=>{e.columnLabel="",e.compact=!1})}_toggleCompactView(){const e=this.getBoundingClientRect().width<this.breakpoint;this.compact!==e&&(this.compact=e,e?this._applyCompactViewColumnLabels():this._clearCompactViewColumnLabels())}_stopDrag(e){const t=this._columnResizeController.getActiveSplitter();t&&(t.removeEventListener("pointermove",this._handleSplitterPointerMove),t.removeEventListener("pointerup",this._handleSplitterPointerUp),t.removeEventListener("pointercancel",this._handleSplitterPointerCancel)),this._columnResizeController.stopDrag(e),this._resizeColumns(!0),this._sashHovers[this._activeSashElementIndex]=!1,this._isDragging=!1,this._activeSashElementIndex=-1}_onDefaultSlotChange(){this._assignedElements.forEach(e=>{"vscode-table-header"!==e.tagName.toLowerCase()?"vscode-table-body"!==e.tagName.toLowerCase()||(e.slot="body"):e.slot="header"})}_onHeaderSlotChange(){this._headerCells=this._queryHeaderCells();[].fill(0,0,this._headerCells.length-1),this._headerCells.forEach((e,t)=>{if(e.index=t,e.minWidth){const o=Ls(e.minWidth,this._componentW)??0;this._columnResizeController.setColumnMinWidthAt(t,o)}})}_onBodySlotChange(){if(this._initDefaultColumnSizes(),this._initResizeObserver(),this._updateResizeHandlersSize(),!this._bodyResizeObserver){const e=this._assignedBodyElements[0]??null;e&&(this._bodyResizeObserver=new ResizeObserver(this._bodyResizeObserverCallback),this._bodyResizeObserver.observe(e))}}_onSashMouseOver(e){if(this._isDragging)return;const t=e.currentTarget,o=Number(t.dataset.index);this._sashHovers[o]=!0,this.requestUpdate()}_onSashMouseOut(e){if(e.stopPropagation(),this._isDragging)return;const t=e.currentTarget,o=Number(t.dataset.index);this._sashHovers[o]=!1,this.requestUpdate()}_resizeColumns(e=!0){const t=this._columnResizeController.columnWidths;if(this._getHeaderCells().forEach((e,o)=>e.style.width=`${t[o]}%`),e){this._getCellsOfFirstRow().forEach((e,o)=>e.style.width=`${t[o]}%`)}}_handleSplitterPointerDown(e){e.stopPropagation();const t=e.currentTarget;this._columnResizeController.saveHostDimensions().setActiveSplitter(t).startDrag(e),t.addEventListener("pointermove",this._handleSplitterPointerMove),t.addEventListener("pointerup",this._handleSplitterPointerUp),t.addEventListener("pointercancel",this._handleSplitterPointerCancel)}render(){const e=this._columnResizeController.splitterPositions.map((e,t)=>{const o=Ft({sash:!0,hover:this._sashHovers[t],resizable:this.resizable}),s=`${e}%`;return this.resizable?Ke`
            <div
              class=${o}
              data-index=${t}
              .style=${jt({left:s})}
              @pointerdown=${this._handleSplitterPointerDown}
              @mouseover=${this._onSashMouseOver}
              @mouseout=${this._onSashMouseOut}
            >
              <div class="sash-visible"></div>
              <div class="sash-clickable"></div>
            </div>
          `:Ke`<div
            class=${o}
            data-index=${t}
            .style=${jt({left:s})}
          >
            <div class="sash-visible"></div>
          </div>`}),t=Ft({wrapper:!0,"select-disabled":this._columnResizeController.isDragging,"resize-cursor":this._columnResizeController.isDragging,"compact-view":this.compact});return Ke`
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
    `}};var js;Ns.styles=Ms,Fs([gt({reflect:!0})],Ns.prototype,"role",void 0),Fs([gt({type:Boolean,reflect:!0})],Ns.prototype,"resizable",void 0),Fs([gt({type:Boolean,reflect:!0})],Ns.prototype,"responsive",void 0),Fs([gt({type:Boolean,reflect:!0})],Ns.prototype,"bordered",void 0),Fs([gt({type:Boolean,reflect:!0,attribute:"bordered-columns"})],Ns.prototype,"borderedColumns",void 0),Fs([gt({type:Boolean,reflect:!0,attribute:"bordered-rows"})],Ns.prototype,"borderedRows",void 0),Fs([gt({type:Number})],Ns.prototype,"breakpoint",void 0),Fs([gt({type:Array})],Ns.prototype,"columns",null),Fs([gt({attribute:"min-column-width"})],Ns.prototype,"minColumnWidth",void 0),Fs([gt({type:Boolean,reflect:!0,attribute:"delayed-resizing"})],Ns.prototype,"delayedResizing",void 0),Fs([gt({type:Boolean,reflect:!0})],Ns.prototype,"compact",void 0),Fs([gt({type:Boolean,reflect:!0})],Ns.prototype,"zebra",void 0),Fs([gt({type:Boolean,reflect:!0,attribute:"zebra-odd"})],Ns.prototype,"zebraOdd",void 0),Fs([yt(".header")],Ns.prototype,"_headerElement",void 0),Fs([yt(".scrollable")],Ns.prototype,"_scrollableElement",void 0),Fs([(js=".sash-visible",(e,t)=>_t(e,t,{get(){return(this.renderRoot??xt??(xt=document.createDocumentFragment())).querySelectorAll(js)}}))],Ns.prototype,"_sashVisibleElements",void 0),Fs([wt({flatten:!0,selector:"vscode-table-header, vscode-table-body"})],Ns.prototype,"_assignedElements",void 0),Fs([wt({slot:"header",flatten:!0,selector:"vscode-table-header"})],Ns.prototype,"_assignedHeaderElements",void 0),Fs([wt({slot:"body",flatten:!0,selector:"vscode-table-body"})],Ns.prototype,"_assignedBodyElements",void 0),Fs([mt()],Ns.prototype,"_sashPositions",void 0),Fs([mt()],Ns.prototype,"_isDragging",void 0),Ns=Fs([Et("vscode-table")],Ns),oe({tagName:"vscode-table",elementClass:Ns,react:v,displayName:"VscodeTable"});const Hs=[It,ce`
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
  `];var qs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Us=class extends $t{constructor(){super(...arguments),this.role="rowgroup"}render(){return Ke` <slot></slot> `}};Us.styles=Hs,qs([gt({reflect:!0})],Us.prototype,"role",void 0),Us=qs([Et("vscode-table-body")],Us),oe({tagName:"vscode-table-body",elementClass:Us,react:v,displayName:"VscodeTableBody"});const Ws=[It,ce`
    :host {
      border-bottom-color: var(
        --vscode-editorGroup-border,
        rgba(255, 255, 255, 0.09)
      );
      border-bottom-style: solid;
      border-bottom-width: var(--vsc-row-border-bottom-width);
      box-sizing: border-box;
      color: var(--vscode-foreground, #cccccc);
      display: table-cell;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
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
  `];var Ks=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Gs=class extends $t{constructor(){super(...arguments),this.role="cell",this.columnLabel="",this.compact=!1}render(){const e=this.columnLabel?Ke`<div class="column-label" role="presentation">
          ${this.columnLabel}
        </div>`:Xe;return Ke`
      <div class="wrapper">
        ${e}
        <slot></slot>
      </div>
    `}};Gs.styles=Ws,Ks([gt({reflect:!0})],Gs.prototype,"role",void 0),Ks([gt({attribute:"column-label"})],Gs.prototype,"columnLabel",void 0),Ks([gt({type:Boolean,reflect:!0})],Gs.prototype,"compact",void 0),Gs=Ks([Et("vscode-table-cell")],Gs),oe({tagName:"vscode-table-cell",elementClass:Gs,react:v,displayName:"VscodeTableCell"});const Ys=[It,ce`
    :host {
      background-color: var(
        --vscode-keybindingTable-headerBackground,
        rgba(204, 204, 204, 0.04)
      );
      display: table;
      table-layout: fixed;
      width: 100%;
    }
  `];var Xs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Zs=class extends $t{constructor(){super(...arguments),this.role="rowgroup"}render(){return Ke` <slot></slot> `}};Zs.styles=Ys,Xs([gt({reflect:!0})],Zs.prototype,"role",void 0),Zs=Xs([Et("vscode-table-header")],Zs),oe({tagName:"vscode-table-header",elementClass:Zs,react:v,displayName:"VscodeTableHeader"});const Js=[It,ce`
    :host {
      box-sizing: border-box;
      color: var(--vscode-foreground, #cccccc);
      display: table-cell;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
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
  `];var Qs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ei=class extends $t{constructor(){super(...arguments),this.minWidth="0",this.index=-1,this.role="columnheader"}willUpdate(e){e.has("minWidth")&&this.index>-1&&this.dispatchEvent(new CustomEvent("vsc-table-change-min-column-width",{detail:{columnIndex:this.index,propertyValue:this.minWidth},bubbles:!0}))}render(){return Ke`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};ei.styles=Js,Qs([gt({attribute:"min-width"})],ei.prototype,"minWidth",void 0),Qs([gt({type:Number})],ei.prototype,"index",void 0),Qs([gt({reflect:!0})],ei.prototype,"role",void 0),ei=Qs([Et("vscode-table-header-cell")],ei),oe({tagName:"vscode-table-header-cell",elementClass:ei,react:v,displayName:"VscodeTableHeaderCell"});const ti=[It,ce`
    :host {
      border-top-color: var(
        --vscode-editorGroup-border,
        rgba(255, 255, 255, 0.09)
      );
      border-top-style: solid;
      border-top-width: var(--vsc-row-border-top-width);
      display: var(--vsc-row-display);
      width: 100%;
    }
  `];var oi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let si=class extends $t{constructor(){super(...arguments),this.role="row"}render(){return Ke` <slot></slot> `}};si.styles=ti,oi([gt({reflect:!0})],si.prototype,"role",void 0),si=oi([Et("vscode-table-row")],si),oe({tagName:"vscode-table-row",elementClass:si,react:v,displayName:"VscodeTableRow"});const ii=[It,ce`
    :host {
      display: block;
      overflow: hidden;
    }

    :host(:focus-visible) {
      outline-color: var(--vscode-focusBorder, #0078d4);
      outline-offset: 3px;
      outline-style: solid;
      outline-width: 1px;
    }

    :host([panel]) {
      background-color: var(--vscode-panel-background, #181818);
    }
  `];var ni=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ri=class extends $t{constructor(){super(...arguments),this.hidden=!1,this.ariaLabelledby="",this.panel=!1,this.role="tabpanel",this.tabIndex=0}render(){return Ke` <slot></slot> `}};ri.styles=ii,ni([gt({type:Boolean,reflect:!0})],ri.prototype,"hidden",void 0),ni([gt({reflect:!0,attribute:"aria-labelledby"})],ri.prototype,"ariaLabelledby",void 0),ni([gt({type:Boolean,reflect:!0})],ri.prototype,"panel",void 0),ni([gt({reflect:!0})],ri.prototype,"role",void 0),ni([gt({type:Number,reflect:!0})],ri.prototype,"tabIndex",void 0),ri=ni([Et("vscode-tab-panel")],ri),oe({tagName:"vscode-tab-panel",elementClass:ri,react:v,displayName:"VscodeTabPanel"});const ai=[It,ce`
    :host {
      display: block;
    }

    .header {
      align-items: center;
      display: flex;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      width: 100%;
    }

    .header {
      border-bottom-color: var(--vscode-settings-headerBorder, #2b2b2b);
      border-bottom-style: solid;
      border-bottom-width: 1px;
    }

    .header.panel {
      background-color: var(--vscode-panel-background, #181818);
      border-bottom-width: 0;
      box-sizing: border-box;
      padding-left: 8px;
      padding-right: 8px;
    }

    .tablist {
      display: flex;
      margin-bottom: -1px;
    }

    slot[name='addons'] {
      display: block;
      margin-left: auto;
    }
  `];var li=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ci=class extends $t{constructor(){super(),this.panel=!1,this.selectedIndex=0,this._tabHeaders=[],this._tabPanels=[],this._componentId="",this._tabFocus=0,this._componentId=Ro()}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o),"selected-index"===e&&this._setActiveTab(),"panel"===e&&(this._tabHeaders.forEach(e=>e.panel=null!==o),this._tabPanels.forEach(e=>e.panel=null!==o))}_dispatchSelectEvent(){this.dispatchEvent(new CustomEvent("vsc-tabs-select",{detail:{selectedIndex:this.selectedIndex},composed:!0}))}_setActiveTab(){this._tabFocus=this.selectedIndex,this._tabPanels.forEach((e,t)=>{e.hidden=t!==this.selectedIndex}),this._tabHeaders.forEach((e,t)=>{e.active=t===this.selectedIndex})}_focusPrevTab(){0===this._tabFocus?this._tabFocus=this._tabHeaders.length-1:this._tabFocus-=1}_focusNextTab(){this._tabFocus===this._tabHeaders.length-1?this._tabFocus=0:this._tabFocus+=1}_onHeaderKeyDown(e){"ArrowLeft"!==e.key&&"ArrowRight"!==e.key||(e.preventDefault(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","-1"),"ArrowLeft"===e.key?this._focusPrevTab():"ArrowRight"===e.key&&this._focusNextTab(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","0"),this._tabHeaders[this._tabFocus].focus()),"Enter"===e.key&&(e.preventDefault(),this.selectedIndex=this._tabFocus,this._dispatchSelectEvent())}_moveHeadersToHeaderSlot(){const e=this._mainSlotElements.filter(e=>e instanceof zs);e.length>0&&e.forEach(e=>e.setAttribute("slot","header"))}_onMainSlotChange(){this._moveHeadersToHeaderSlot(),this._tabPanels=this._mainSlotElements.filter(e=>e instanceof ri),this._tabPanels.forEach((e,t)=>{e.ariaLabelledby=`t${this._componentId}-h${t}`,e.id=`t${this._componentId}-p${t}`,e.panel=this.panel}),this._setActiveTab()}_onHeaderSlotChange(){this._tabHeaders=this._headerSlotElements.filter(e=>e instanceof zs),this._tabHeaders.forEach((e,t)=>{e.tabId=t,e.id=`t${this._componentId}-h${t}`,e.ariaControls=`t${this._componentId}-p${t}`,e.panel=this.panel,e.active=t===this.selectedIndex})}_onHeaderClick(e){const t=e.composedPath().find(e=>e instanceof zs);t&&(this.selectedIndex=t.tabId,this._setActiveTab(),this._dispatchSelectEvent())}render(){return Ke`
      <div
        class=${Ft({header:!0,panel:this.panel})}
        @click=${this._onHeaderClick}
        @keydown=${this._onHeaderKeyDown}
      >
        <div role="tablist" class="tablist">
          <slot
            name="header"
            @slotchange=${this._onHeaderSlotChange}
            role="tablist"
          ></slot>
        </div>
        <slot name="addons"></slot>
      </div>
      <slot @slotchange=${this._onMainSlotChange}></slot>
    `}};ci.styles=ai,li([gt({type:Boolean,reflect:!0})],ci.prototype,"panel",void 0),li([gt({type:Number,reflect:!0,attribute:"selected-index"})],ci.prototype,"selectedIndex",void 0),li([wt({slot:"header"})],ci.prototype,"_headerSlotElements",void 0),li([wt()],ci.prototype,"_mainSlotElements",void 0),ci=li([Et("vscode-tabs")],ci),oe({tagName:"vscode-tabs",elementClass:ci,react:v,events:{onVscTabsSelect:"vsc-tabs-select"},displayName:"VscodeTabs"});const di=[It,ce`
    :host {
      display: inline-block;
      height: auto;
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
      border-radius: 4px;
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
  `];var hi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let pi=class extends $t{set value(e){this._value=e,this._internals.setFormValue(e)}get value(){return this._value}get wrappedElement(){return this._textareaEl}get form(){return this._internals.form}get type(){return"textarea"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}set minlength(e){this.minLength=e}get minlength(){return this.minLength}set maxlength(e){this.maxLength=e}get maxlength(){return this.maxLength}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.invalid=!1,this.label="",this.maxLength=void 0,this.minLength=void 0,this.rows=void 0,this.cols=void 0,this.name=void 0,this.placeholder=void 0,this.readonly=!1,this.resize="none",this.required=!1,this.spellcheck=!1,this.monospace=!1,this._value="",this._textareaPointerCursor=!1,this._shadow=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._textareaEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._textareaEl.value)})}updated(e){const t=["maxLength","minLength","required"];for(const o of e.keys())if(t.includes(String(o))){this.updateComplete.then(()=>{this._setValidityFromInput()});break}}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(e,t){this.updateComplete.then(()=>{this._value=e})}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}_setValidityFromInput(){this._internals.setValidity(this._textareaEl.validity,this._textareaEl.validationMessage,this._textareaEl)}_dataChanged(){this._value=this._textareaEl.value,this._internals.setFormValue(this._textareaEl.value)}_handleChange(){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change"))}_handleInput(){this._dataChanged(),this._setValidityFromInput()}_handleMouseMove(e){if(this._textareaEl.clientHeight>=this._textareaEl.scrollHeight)return void(this._textareaPointerCursor=!1);const t=this._textareaEl.getBoundingClientRect(),o=e.clientX;this._textareaPointerCursor=o>=t.left+t.width-14-2}_handleScroll(){this._shadow=this._textareaEl.scrollTop>0}render(){return Ke`
      <div
        class=${Ft({shadow:!0,visible:this._shadow})}
      ></div>
      <textarea
        autocomplete=${Nt(this.autocomplete)}
        ?autofocus=${this.autofocus}
        ?disabled=${this.disabled}
        aria-label=${this.label}
        id="textarea"
        class=${Ft({monospace:this.monospace,"cursor-pointer":this._textareaPointerCursor})}
        maxlength=${Nt(this.maxLength)}
        minlength=${Nt(this.minLength)}
        rows=${Nt(this.rows)}
        cols=${Nt(this.cols)}
        name=${Nt(this.name)}
        placeholder=${Nt(this.placeholder)}
        ?readonly=${this.readonly}
        .style=${jt({resize:this.resize})}
        ?required=${this.required}
        spellcheck=${this.spellcheck}
        @change=${this._handleChange}
        @input=${this._handleInput}
        @mousemove=${this._handleMouseMove}
        @scroll=${this._handleScroll}
        .value=${this._value}
      ></textarea>
    `}};pi.styles=di,pi.formAssociated=!0,pi.shadowRootOptions={...ut.shadowRootOptions,delegatesFocus:!0},hi([gt()],pi.prototype,"autocomplete",void 0),hi([gt({type:Boolean,reflect:!0})],pi.prototype,"autofocus",void 0),hi([gt({attribute:"default-value"})],pi.prototype,"defaultValue",void 0),hi([gt({type:Boolean,reflect:!0})],pi.prototype,"disabled",void 0),hi([gt({type:Boolean,reflect:!0})],pi.prototype,"invalid",void 0),hi([gt({attribute:!1})],pi.prototype,"label",void 0),hi([gt({type:Number})],pi.prototype,"maxLength",void 0),hi([gt({type:Number})],pi.prototype,"minLength",void 0),hi([gt({type:Number})],pi.prototype,"rows",void 0),hi([gt({type:Number})],pi.prototype,"cols",void 0),hi([gt()],pi.prototype,"name",void 0),hi([gt()],pi.prototype,"placeholder",void 0),hi([gt({type:Boolean,reflect:!0})],pi.prototype,"readonly",void 0),hi([gt()],pi.prototype,"resize",void 0),hi([gt({type:Boolean,reflect:!0})],pi.prototype,"required",void 0),hi([gt({type:Boolean})],pi.prototype,"spellcheck",void 0),hi([gt({type:Boolean,reflect:!0})],pi.prototype,"monospace",void 0),hi([gt()],pi.prototype,"value",null),hi([yt("#textarea")],pi.prototype,"_textareaEl",void 0),hi([mt()],pi.prototype,"_value",void 0),hi([mt()],pi.prototype,"_textareaPointerCursor",void 0),hi([mt()],pi.prototype,"_shadow",void 0),pi=hi([Et("vscode-textarea")],pi);const ui=oe({tagName:"vscode-textarea",elementClass:pi,react:v,displayName:"VscodeTextarea",events:{onChange:"change",onInput:"input",onInvalid:"invalid"}}),vi=le(Ot()),bi=[It,ce`
    :host {
      display: inline-block;
      width: 320px;
    }

    .root {
      align-items: center;
      background-color: var(--vscode-settings-textInputBackground, #313131);
      border-color: var(
        --vscode-settings-textInputBorder,
        var(--vscode-settings-textInputBackground, #3c3c3c)
      );
      border-radius: 4px;
      border-style: solid;
      border-width: 1px;
      box-sizing: border-box;
      color: var(--vscode-settings-textInputForeground, #cccccc);
      display: flex;
      max-width: 100%;
      position: relative;
      width: 100%;
    }

    :host([focused]) .root {
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
      font-family: var(--vscode-font-family, ${vi});
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
      font-family: var(--vscode-font-family, ${vi});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, 'normal');
      line-height: 20px;
      padding: 0 14px;
    }

    input[type='file']::file-selector-button:hover {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }
  `];var fi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let gi=class extends $t{set type(e){this._type=["color","date","datetime-local","email","file","month","number","password","search","tel","text","time","url","week"].includes(e)?e:"text"}get type(){return this._type}set value(e){"file"!==this.type&&(this._value=e,this._internals.setFormValue(e)),this.updateComplete.then(()=>{this._setValidityFromInput()})}get value(){return this._value}set minlength(e){this.minLength=e}get minlength(){return this.minLength}set maxlength(e){this.maxLength=e}get maxlength(){return this.maxLength}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._setValidityFromInput(),this._internals.checkValidity()}reportValidity(){return this._setValidityFromInput(),this._internals.reportValidity()}get wrappedElement(){return this._inputEl}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.focused=!1,this.invalid=!1,this.label="",this.max=void 0,this.maxLength=void 0,this.min=void 0,this.minLength=void 0,this.multiple=!1,this.name=void 0,this.pattern=void 0,this.placeholder=void 0,this.readonly=!1,this.required=!1,this.step=void 0,this._value="",this._type="text",this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._inputEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._inputEl.value)})}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o);["max","maxlength","min","minlength","pattern","required","step"].includes(e)&&this.updateComplete.then(()=>{this._setValidityFromInput()})}formResetCallback(){this.value=this.defaultValue,this.requestUpdate()}formStateRestoreCallback(e,t){this.value=e}_dataChanged(){if(this._value=this._inputEl.value,"file"===this.type&&this._inputEl.files)for(const e of this._inputEl.files)this._internals.setFormValue(e);else this._internals.setFormValue(this._inputEl.value)}_setValidityFromInput(){this._inputEl&&this._internals.setValidity(this._inputEl.validity,this._inputEl.validationMessage,this._inputEl)}_onInput(){this._dataChanged(),this._setValidityFromInput()}_onChange(){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change"))}_onFocus(){this.focused=!0}_onBlur(){this.focused=!1}_onKeyDown(e){"Enter"===e.key&&this._internals.form&&this._internals.form?.requestSubmit()}render(){return Ke`
      <div class="root">
        <slot name="content-before"></slot>
        <input
          id="input"
          type=${this.type}
          ?autofocus=${this.autofocus}
          autocomplete=${Nt(this.autocomplete)}
          aria-label=${this.label}
          ?disabled=${this.disabled}
          max=${Nt(this.max)}
          maxlength=${Nt(this.maxLength)}
          min=${Nt(this.min)}
          minlength=${Nt(this.minLength)}
          ?multiple=${this.multiple}
          name=${Nt(this.name)}
          pattern=${Nt(this.pattern)}
          placeholder=${Nt(this.placeholder)}
          ?readonly=${this.readonly}
          ?required=${this.required}
          step=${Nt(this.step)}
          .value=${this._value}
          @blur=${this._onBlur}
          @change=${this._onChange}
          @focus=${this._onFocus}
          @input=${this._onInput}
          @keydown=${this._onKeyDown}
        />
        <slot name="content-after"></slot>
      </div>
    `}};gi.styles=bi,gi.formAssociated=!0,gi.shadowRootOptions={...ut.shadowRootOptions,delegatesFocus:!0},fi([gt()],gi.prototype,"autocomplete",void 0),fi([gt({type:Boolean,reflect:!0})],gi.prototype,"autofocus",void 0),fi([gt({attribute:"default-value"})],gi.prototype,"defaultValue",void 0),fi([gt({type:Boolean,reflect:!0})],gi.prototype,"disabled",void 0),fi([gt({type:Boolean,reflect:!0})],gi.prototype,"focused",void 0),fi([gt({type:Boolean,reflect:!0})],gi.prototype,"invalid",void 0),fi([gt({attribute:!1})],gi.prototype,"label",void 0),fi([gt({type:Number})],gi.prototype,"max",void 0),fi([gt({type:Number})],gi.prototype,"maxLength",void 0),fi([gt({type:Number})],gi.prototype,"min",void 0),fi([gt({type:Number})],gi.prototype,"minLength",void 0),fi([gt({type:Boolean,reflect:!0})],gi.prototype,"multiple",void 0),fi([gt({reflect:!0})],gi.prototype,"name",void 0),fi([gt()],gi.prototype,"pattern",void 0),fi([gt()],gi.prototype,"placeholder",void 0),fi([gt({type:Boolean,reflect:!0})],gi.prototype,"readonly",void 0),fi([gt({type:Boolean,reflect:!0})],gi.prototype,"required",void 0),fi([gt({type:Number})],gi.prototype,"step",void 0),fi([gt({reflect:!0})],gi.prototype,"type",null),fi([gt()],gi.prototype,"value",null),fi([yt("#input")],gi.prototype,"_inputEl",void 0),fi([mt()],gi.prototype,"_value",void 0),fi([mt()],gi.prototype,"_type",void 0),gi=fi([Et("vscode-textfield")],gi);const mi=oe({tagName:"vscode-textfield",elementClass:gi,react:v,displayName:"VscodeTextfield",events:{onChange:"change",onInput:"input",onInvalid:"invalid"}}),_i=[It,ce`
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
  `];var yi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let xi=class extends $t{constructor(){super(...arguments),this.icon="",this.label=void 0,this.toggleable=!1,this.checked=!1,this._isSlotEmpty=!0}_handleSlotChange(){this._isSlotEmpty=!((this._assignedNodes?.length??0)>0)}_handleButtonClick(){this.toggleable&&(this.checked=!this.checked,this.dispatchEvent(new Event("change")))}render(){const e=this.checked?"true":"false";return Ke`
      <button
        type="button"
        aria-label=${Nt(this.label)}
        role=${Nt(this.toggleable?"switch":void 0)}
        aria-checked=${Nt(this.toggleable?e:void 0)}
        class=${Ft({checked:this.toggleable&&this.checked})}
        @click=${this._handleButtonClick}
      >
        ${this.icon?Ke`<vscode-icon name=${this.icon}></vscode-icon>`:Xe}
        <slot
          @slotchange=${this._handleSlotChange}
          class=${Ft({empty:this._isSlotEmpty,textOnly:!this.icon})}
        ></slot>
      </button>
    `}};var wi;xi.styles=_i,yi([gt({reflect:!0})],xi.prototype,"icon",void 0),yi([gt()],xi.prototype,"label",void 0),yi([gt({type:Boolean,reflect:!0})],xi.prototype,"toggleable",void 0),yi([gt({type:Boolean,reflect:!0})],xi.prototype,"checked",void 0),yi([mt()],xi.prototype,"_isSlotEmpty",void 0),yi([(e,t)=>{const{slot:o}={},s="slot"+(o?`[name=${o}]`:":not([name])");return _t(e,t,{get(){const e=this.renderRoot?.querySelector(s);return e?.assignedNodes(wi)??[]}})}],xi.prototype,"_assignedNodes",void 0),xi=yi([Et("vscode-toolbar-button")],xi),oe({tagName:"vscode-toolbar-button",elementClass:xi,react:v,displayName:"VscodeToolbarButton",events:{onChange:"change"}});const Ci=[It,ce`
    :host {
      display: block;
    }

    div {
      gap: 4px;
      display: flex;
      align-items: center;
    }
  `];let ki=class extends $t{render(){return Ke`<div><slot></slot></div>`}};ki.styles=Ci,ki=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r}([Et("vscode-toolbar-container")],ki),oe({tagName:"vscode-toolbar-container",elementClass:ki,react:v,displayName:"VscodeToolbarContainer"});let Si=class extends Event{constructor(e,t,o,s){super("context-request",{bubbles:!0,composed:!0}),this.context=e,this.contextTarget=t,this.callback=o,this.subscribe=s??!1}};let $i=class{constructor(e,t,o,s){if(this.subscribe=!1,this.provided=!1,this.value=void 0,this.t=(e,t)=>{this.unsubscribe&&(this.unsubscribe!==t&&(this.provided=!1,this.unsubscribe()),this.subscribe||this.unsubscribe()),this.value=e,this.host.requestUpdate(),this.provided&&!this.subscribe||(this.provided=!0,this.callback&&this.callback(e,t)),this.unsubscribe=t},this.host=e,void 0!==t.context){const e=t;this.context=e.context,this.callback=e.callback,this.subscribe=e.subscribe??!1}else this.context=t,this.callback=o,this.subscribe=s??!1;this.host.addController(this)}hostConnected(){this.dispatchRequest()}hostDisconnected(){this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=void 0)}dispatchRequest(){this.host.dispatchEvent(new Si(this.context,this.host,this.t,this.subscribe))}};class Ei{get value(){return this.o}set value(e){this.setValue(e)}setValue(e,t=!1){const o=t||!Object.is(e,this.o);this.o=e,o&&this.updateObservers()}constructor(e){this.subscriptions=new Map,this.updateObservers=()=>{for(const[e,{disposer:t}]of this.subscriptions)e(this.o,t)},void 0!==e&&(this.value=e)}addCallback(e,t,o){if(!o)return void e(this.value);this.subscriptions.has(e)||this.subscriptions.set(e,{disposer:()=>{this.subscriptions.delete(e)},consumerHost:t});const{disposer:s}=this.subscriptions.get(e);e(this.value,s)}clearCallbacks(){this.subscriptions.clear()}}let Ii=class extends Event{constructor(e,t){super("context-provider",{bubbles:!0,composed:!0}),this.context=e,this.contextTarget=t}};class Ai extends Ei{constructor(e,t,o){super(void 0!==t.context?t.initialValue:o),this.onContextRequest=e=>{if(e.context!==this.context)return;const t=e.contextTarget??e.composedPath()[0];t!==this.host&&(e.stopPropagation(),this.addCallback(e.callback,t,e.subscribe))},this.onProviderRequest=e=>{if(e.context!==this.context)return;if((e.contextTarget??e.composedPath()[0])===this.host)return;const t=new Set;for(const[o,{consumerHost:s}]of this.subscriptions)t.has(o)||(t.add(o),s.dispatchEvent(new Si(this.context,s,o,!0)));e.stopPropagation()},this.host=e,void 0!==t.context?this.context=t.context:this.context=t,this.attachListeners(),this.host.addController?.(this)}attachListeners(){this.host.addEventListener("context-request",this.onContextRequest),this.host.addEventListener("context-provider",this.onProviderRequest)}hostConnected(){this.host.dispatchEvent(new Ii(this.context,this.host))}}function Oi({context:e}){return(t,o)=>{const s=new WeakMap;if("object"==typeof o)return{get(){return t.get.call(this)},set(e){return s.get(this).setValue(e),t.set.call(this,e)},init(t){return s.set(this,new Ai(this,{context:e,initialValue:t})),t}};{t.constructor.addInitializer(t=>{s.set(t,new Ai(t,{context:e}))});const i=Object.getOwnPropertyDescriptor(t,o);let n;if(void 0===i){const e=new WeakMap;n={get(){return e.get(this)},set(t){s.get(this).setValue(t),e.set(this,t)},configurable:!0,enumerable:!0}}else{const e=i.set;n={...i,set(t){s.get(this).setValue(t),e?.call(this,t)}}}return void Object.defineProperty(t,o,n)}}}function Pi({context:e,subscribe:t}){return(o,s)=>{"object"==typeof s?s.addInitializer(function(){new $i(this,{context:e,callback:e=>{o.set.call(this,e)},subscribe:t})}):o.constructor.addInitializer(o=>{new $i(o,{context:e,callback:e=>{o[s]=e},subscribe:t})})}}const Ri=[It,ce`
    :host {
      --vsc-tree-item-arrow-display: flex;
      --internal-selectionBackground: var(
        --vscode-list-inactiveSelectionBackground,
        #37373d
      );
      --internal-selectionForeground: var(--vscode-foreground, #cccccc);
      --internal-selectionIconForeground: var(
        --vscode-icon-foreground,
        #cccccc
      );
      --internal-defaultIndentGuideDisplay: none;
      --internal-highlightedIndentGuideDisplay: block;

      display: block;
    }

    :host(:hover) {
      --internal-defaultIndentGuideDisplay: block;
      --internal-highlightedIndentGuideDisplay: block;
    }

    :host(:focus-within) {
      --internal-selectionBackground: var(
        --vscode-list-activeSelectionBackground,
        #04395e
      );
      --internal-selectionForeground: var(
        --vscode-list-activeSelectionForeground,
        #ffffff
      );
      --internal-selectionIconForeground: var(
        --vscode-list-activeSelectionIconForeground,
        #ffffff
      );
    }

    :host([hide-arrows]) {
      --vsc-tree-item-arrow-display: none;
    }

    :host([indent-guides='none']),
    :host([indent-guides='none']:hover) {
      --internal-defaultIndentGuideDisplay: none;
      --internal-highlightedIndentGuideDisplay: none;
    }

    :host([indent-guides='always']),
    :host([indent-guides='always']:hover) {
      --internal-defaultIndentGuideDisplay: block;
      --internal-highlightedIndentGuideDisplay: block;
    }
  `],Bi="vscode-list",zi=Symbol("configContext"),Vi=e=>e instanceof Element&&e.matches("vscode-tree-item"),Di=(e,t)=>{const o=t.length,s=(i=e)instanceof Element&&i.matches("vscode-tree")?-1:e.level;var i;"branch"in e&&(e.branch=o>0),t.forEach((t,o)=>{t.path="path"in e?[...e.path,o]:[o],t.level=s+1,t.dataset.path=t.path.join(".")})},Li=e=>{const t=e.lastElementChild;return t&&Vi(t)?t.branch&&t.open?Li(t):t:e},Mi=e=>{if(!e.parentElement)return null;if(!Vi(e.parentElement))return null;const t=Ti(e.parentElement);return t||Mi(e.parentElement)},Ti=e=>{let t=e.nextElementSibling;for(;t&&!Vi(t);)t=t.nextElementSibling;return t};function Fi(e){return e.parentElement&&Vi(e.parentElement)?e.parentElement:null}var Ni=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const ji="singleClick",Hi="doubleClick",qi="none",Ui=[" ","ArrowDown","ArrowUp","ArrowLeft","ArrowRight","Enter","Escape","Shift"];let Wi=class extends $t{constructor(){super(),this.expandMode="singleClick",this.hideArrows=!1,this.indent=8,this.indentGuides="onHover",this.multiSelect=!1,this._treeContextState={isShiftPressed:!1,activeItem:null,selectedItems:new Set,hoveredItem:null,allItems:null,itemListUpToDate:!1,focusedItem:null,prevFocusedItem:null,hasBranchItem:!1,rootElement:this,highlightedItems:new Set,highlightIndentGuides:()=>{this._highlightIndentGuides()},emitSelectEvent:()=>{this._emitSelectEvent()}},this._configContext={hideArrows:this.hideArrows,expandMode:this.expandMode,indent:this.indent,indentGuides:this.indentGuides,multiSelect:this.multiSelect},this._handleComponentKeyDown=e=>{const t=e.key;switch(Ui.includes(t)&&(e.stopPropagation(),e.preventDefault()),t){case" ":case"Enter":this._handleEnterPress();break;case"ArrowDown":this._handleArrowDownPress();break;case"ArrowLeft":this._handleArrowLeftPress(e);break;case"ArrowRight":this._handleArrowRightPress();break;case"ArrowUp":this._handleArrowUpPress();break;case"Shift":this._handleShiftPress()}},this._handleComponentKeyUp=e=>{"Shift"===e.key&&(this._treeContextState.isShiftPressed=!1)},this._handleSlotChange=()=>{this._treeContextState.itemListUpToDate=!1,Di(this,this._assignedTreeItems),this.updateComplete.then(()=>{if(null===this._treeContextState.activeItem){const e=this.querySelector(":scope > vscode-tree-item");e&&(e.active=!0)}})},this.addEventListener("keyup",this._handleComponentKeyUp),this.addEventListener("keydown",this._handleComponentKeyDown)}connectedCallback(){super.connectedCallback(),this.role="tree"}willUpdate(e){this._updateConfigContext(e),e.has("multiSelect")&&(this.ariaMultiSelectable=this.multiSelect?"true":"false")}expandAll(){this.querySelectorAll("vscode-tree-item").forEach(e=>{e.branch&&(e.open=!0)})}collapseAll(){this.querySelectorAll("vscode-tree-item").forEach(e=>{e.branch&&(e.open=!1)})}updateHasBranchItemFlag(){const e=this._assignedTreeItems.some(e=>e.branch);this._treeContextState={...this._treeContextState,hasBranchItem:e}}_emitSelectEvent(){const e=new CustomEvent("vsc-tree-select",{detail:Array.from(this._treeContextState.selectedItems)});this.dispatchEvent(e)}_highlightIndentGuideOfItem(e){if(e.branch&&e.open)e.highlightedGuides=!0,this._treeContextState.highlightedItems?.add(e);else{const t=Fi(e);t&&(t.highlightedGuides=!0,this._treeContextState.highlightedItems?.add(t))}}_highlightIndentGuides(){this.indentGuides!==qi&&(this._treeContextState.highlightedItems?.forEach(e=>e.highlightedGuides=!1),this._treeContextState.highlightedItems?.clear(),this._treeContextState.activeItem&&this._highlightIndentGuideOfItem(this._treeContextState.activeItem),this._treeContextState.selectedItems.forEach(e=>{this._highlightIndentGuideOfItem(e)}))}_updateConfigContext(e){const{hideArrows:t,expandMode:o,indent:s,indentGuides:i,multiSelect:n}=this;e.has("hideArrows")&&(this._configContext={...this._configContext,hideArrows:t}),e.has("expandMode")&&(this._configContext={...this._configContext,expandMode:o}),e.has("indent")&&(this._configContext={...this._configContext,indent:s}),e.has("indentGuides")&&(this._configContext={...this._configContext,indentGuides:i}),e.has("multiSelect")&&(this._configContext={...this._configContext,multiSelect:n})}_focusItem(e){e.active=!0,e.updateComplete.then(()=>{e.focus(),this._highlightIndentGuides()})}_focusPrevItem(){if(this._treeContextState.focusedItem){const e=(e=>{const{parentElement:t}=e;if(!t||!Vi(e))return null;let o=e.previousElementSibling;for(;o&&!Vi(o);)o=o.previousElementSibling;if(!o&&Vi(t))return t;if(o&&o.branch&&o.open)return Li(o);return o})(this._treeContextState.focusedItem);e&&(this._focusItem(e),this._treeContextState.isShiftPressed&&this.multiSelect&&(e.selected=!e.selected,this._emitSelectEvent()))}}_focusNextItem(){if(this._treeContextState.focusedItem){const e=(e=>{const{parentElement:t}=e;if(!t||!Vi(e))return null;let o;if(e.branch&&e.open){const t=e.querySelector("vscode-tree-item");t?o=t:(o=Ti(e),o||(o=Mi(e)))}else o=Ti(e),o||(o=Mi(e));return o||e})(this._treeContextState.focusedItem);e&&(this._focusItem(e),this._treeContextState.isShiftPressed&&this.multiSelect&&(e.selected=!e.selected,this._emitSelectEvent()))}}_handleArrowRightPress(){if(!this._treeContextState.focusedItem)return;const{focusedItem:e}=this._treeContextState;e.branch&&(e.open?this._focusNextItem():e.open=!0)}_handleArrowLeftPress(e){if(e.ctrlKey)return void this.collapseAll();if(!this._treeContextState.focusedItem)return;const{focusedItem:t}=this._treeContextState,o=Fi(t);t.branch&&t.open?t.open=!1:o&&o.branch&&this._focusItem(o)}_handleArrowDownPress(){this._treeContextState.focusedItem?this._focusNextItem():this._focusItem(this._assignedTreeItems[0])}_handleArrowUpPress(){this._treeContextState.focusedItem?this._focusPrevItem():this._focusItem(this._assignedTreeItems[0])}_handleEnterPress(){const{focusedItem:e}=this._treeContextState;e&&(this._treeContextState.selectedItems.forEach(e=>e.selected=!1),this._treeContextState.selectedItems.clear(),this._highlightIndentGuides(),e.selected=!0,this._emitSelectEvent(),e.branch&&(e.open=!e.open))}_handleShiftPress(){this._treeContextState.isShiftPressed=!0}render(){return Ke`<div>
      <slot @slotchange=${this._handleSlotChange}></slot>
    </div>`}};Wi.styles=Ri,Ni([gt({type:String,attribute:"expand-mode"})],Wi.prototype,"expandMode",void 0),Ni([gt({type:Boolean,reflect:!0,attribute:"hide-arrows"})],Wi.prototype,"hideArrows",void 0),Ni([gt({type:Number,reflect:!0})],Wi.prototype,"indent",void 0),Ni([gt({type:String,attribute:"indent-guides",useDefault:!0,reflect:!0})],Wi.prototype,"indentGuides",void 0),Ni([gt({type:Boolean,reflect:!0,attribute:"multi-select"})],Wi.prototype,"multiSelect",void 0),Ni([Oi({context:Bi})],Wi.prototype,"_treeContextState",void 0),Ni([Oi({context:zi})],Wi.prototype,"_configContext",void 0),Ni([wt({selector:"vscode-tree-item"})],Wi.prototype,"_assignedTreeItems",void 0),Wi=Ni([Et("vscode-tree")],Wi),oe({tagName:"vscode-tree",elementClass:Wi,react:v,displayName:"VscodeTree",events:{onVscTreeSelect:"vsc-tree-select"}});const Ki=[It,ce`
    :host {
      --hover-outline-color: transparent;
      --hover-outline-style: solid;
      --hover-outline-width: 0;

      --selected-outline-color: transparent;
      --selected-outline-style: solid;
      --selected-outline-width: 0;

      cursor: pointer;
      display: block;
      user-select: none;
    }

    ::slotted(vscode-icon) {
      display: block;
    }

    .root {
      display: block;
    }

    .wrapper {
      align-items: flex-start;
      color: var(--vscode-foreground, #cccccc);
      display: flex;
      flex-wrap: nowrap;
      font-family: var(--vscode-font-family, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, normal);
      line-height: 22px;
      min-height: 22px;
      outline-offset: -1px;
      padding-right: 12px;
    }

    .wrapper:hover {
      background-color: var(--vscode-list-hoverBackground, #2a2d2e);
      color: var(
        --vscode-list-hoverForeground,
        var(--vscode-foreground, #cccccc)
      );
    }

    :host([selected]) .wrapper {
      color: var(--internal-selectionForeground);
      background-color: var(--internal-selectionBackground);
    }

    :host([selected]) ::slotted(vscode-icon) {
      color: var(--internal-selectionForeground);
    }

    :host(:focus) {
      outline: none;
    }

    :host(:focus) .wrapper.active {
      outline-color: var(
        --vscode-list-focusAndSelectionOutline,
        var(--vscode-list-focusOutline, #0078d4)
      );
      outline-style: solid;
      outline-width: 1px;
    }

    .arrow-container {
      align-items: center;
      display: var(--vsc-tree-item-arrow-display);
      height: 22px;
      justify-content: center;
      padding-left: 8px;
      padding-right: 6px;
      width: 16px;
    }

    .arrow-container svg {
      display: block;
      fill: var(--vscode-icon-foreground, #cccccc);
    }

    .arrow-container.icon-rotated svg {
      transform: rotate(90deg);
    }

    :host([selected]) .arrow-container svg {
      fill: var(--internal-selectionIconForeground);
    }

    .icon-container {
      align-items: center;
      display: flex;
      justify-content: center;
      margin-right: 3px;
      min-height: 22px;
      overflow: hidden;
    }

    .icon-container slot {
      display: block;
    }

    .icon-container.has-icon {
      min-width: 22px;
      max-width: 22px;
      max-height: 22px;
    }

    :host(:is(:--show-actions, :state(show-actions))) .icon-container {
      overflow: visible;
    }

    .children {
      position: relative;
    }

    .children.guide:before {
      background-color: var(
        --vscode-tree-inactiveIndentGuidesStroke,
        rgba(88, 88, 88, 0.4)
      );
      content: '';
      display: none;
      height: 100%;
      left: var(--indentation-guide-left);
      pointer-events: none;
      position: absolute;
      width: 1px;
      z-index: 1;
    }

    .children.guide.default-guide:before {
      display: var(--internal-defaultIndentGuideDisplay);
    }

    .children.guide.highlighted-guide:before {
      display: var(--internal-highlightedIndentGuideDisplay);
      background-color: var(--vscode-tree-indentGuidesStroke, #585858);
    }

    .content {
      display: flex;
      align-items: center;
      flex-wrap: nowrap; /* prevent wrapping; allow ellipses via min-width: 0 */
      min-width: 0;
      width: 100%;
      line-height: 22px;
    }

    .label {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .description {
      color: var(--vscode-foreground, #cccccc);
      opacity: 0.7;
      display: none;
      flex: 0 1 auto;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .content.has-description .description {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      flex: 1 1 0%; /* description takes remaining space, yields first when shrinking */
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      margin-left: 0.5em;
    }

    .content.has-description .label {
      flex: 0 1 auto; /* label only grows when description missing */
    }

    .content:not(.has-description) .label {
      flex: 1 1 auto;
    }

    .label ::slotted(*) {
      display: inline-block;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .description ::slotted(*) {
      display: inline-block;
      max-width: 100%;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .actions {
      align-items: center;
      align-self: center;
      display: none;
      flex: 0 0 auto;
      gap: 2px;
      margin-left: auto;
      min-height: 22px;
      color: inherit;
    }

    .actions ::slotted(*) {
      align-items: center;
      display: inline-flex;
      height: 22px;
    }

    .actions ::slotted(button) {
      cursor: pointer;
    }

    .actions ::slotted([hidden]) {
      display: none !important;
    }

    :host(
        :is(
          :--has-actions:--show-actions,
          :--has-actions:state(show-actions),
          :state(has-actions):--show-actions,
          :state(has-actions):state(show-actions)
        )
      )
      .actions {
      display: inline-flex;
    }

    .decoration {
      align-items: center;
      align-self: center;
      color: inherit;
      display: none;
      flex: 0 0 auto;
      gap: 4px;
      margin-left: auto;
      min-height: 22px;
    }

    :host(:is(:--has-decoration, :state(has-decoration))) .decoration {
      display: inline-flex;
    }

    :host(:is(:--show-actions, :state(show-actions))) .decoration {
      margin-left: 6px;
    }

    :host([selected]) ::slotted([slot='decoration']),
    :host([selected]) ::slotted([slot='decoration']) * {
      color: inherit !important;
    }

    :host([selected]) .description {
      color: var(--internal-selectionForeground, #ffffff);
      opacity: 0.8;
    }

    :host([selected]) :is(:state(focus-visible), :--focus-visible) .description,
    :host([selected]:focus-within) .description {
      opacity: 0.95;
    }

    :host([branch]) ::slotted(vscode-tree-item) {
      display: none;
    }

    :host([branch][open]) ::slotted(vscode-tree-item) {
      display: block;
    }
  `];var Gi,Yi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const Xi=Ke`<svg
  width="16"
  height="16"
  viewBox="0 0 16 16"
  xmlns="http://www.w3.org/2000/svg"
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M10.072 8.024L5.715 3.667l.618-.62L11 7.716v.618L6.333 13l-.618-.619 4.357-4.357z"
  />
</svg>`;let Zi=Gi=class extends $t{set selected(e){this._selected=e,e?this._treeContextState.selectedItems.add(this):this._treeContextState.selectedItems.delete(this),this.ariaSelected=e?"true":"false",this._updateActionsVisibility()}get selected(){return this._selected}set path(e){this._path=e}get path(){return this._path}constructor(){super(),this.active=!1,this.branch=!1,this.hasActiveItem=!1,this.hasSelectedItem=!1,this.highlightedGuides=!1,this.open=!1,this.level=0,this._selected=!1,this._path=[],this._hasBranchIcon=!1,this._hasBranchOpenedIcon=!1,this._hasLeafIcon=!1,this._hasDescriptionSlotContent=!1,this._hasActionsSlotContent=!1,this._hasDecorationSlotContent=!1,this._treeContextState={isShiftPressed:!1,selectedItems:new Set,hoveredItem:null,allItems:null,itemListUpToDate:!1,focusedItem:null,prevFocusedItem:null,hasBranchItem:!1,rootElement:null,activeItem:null},this._isPointerInside=!1,this._hasKeyboardFocus=!1,this._handleMainSlotChange=()=>{this._mainSlotChange(),this._treeContextState.itemListUpToDate=!1},this._handleComponentFocus=()=>{this._treeContextState.focusedItem&&this._treeContextState.focusedItem!==this&&(this._treeContextState.isShiftPressed||(this._treeContextState.prevFocusedItem=this._treeContextState.focusedItem),this._treeContextState.focusedItem=null),this._treeContextState.focusedItem=this},this._handlePointerEnter=()=>{this._isPointerInside=!0,this._claimHover()},this._handlePointerLeave=e=>{this._isPointerInside=!1,this._treeContextState.hoveredItem===this&&(this._treeContextState.hoveredItem=null),this._clearHoverState();const t=e.relatedTarget;if(t instanceof Element){const e=t.closest("vscode-tree-item");e&&e!==this&&e.isConnected&&e._adoptHoverFromSibling()}},this._handleFocusIn=()=>{this._updateFocusState()},this._handleFocusOut=()=>{this._updateFocusState()},this._internals=this.attachInternals(),this.addEventListener("focus",this._handleComponentFocus),this.addEventListener("pointerenter",this._handlePointerEnter),this.addEventListener("pointerleave",this._handlePointerLeave),this.addEventListener("focusin",this._handleFocusIn),this.addEventListener("focusout",this._handleFocusOut)}connectedCallback(){super.connectedCallback(),this._mainSlotChange(),this.role="treeitem",this.ariaDisabled="false"}firstUpdated(e){super.firstUpdated(e),this._refreshDescriptionSlotState(),this._refreshActionsSlotState(),this._refreshDecorationSlotState(),this.matches(":hover")?(this._isPointerInside=!0,this._claimHover()):this._updateActionsVisibility()}willUpdate(e){e.has("active")&&this._toggleActiveState(),(e.has("open")||e.has("branch"))&&this._setAriaExpanded()}_setAriaExpanded(){this.branch?this.ariaExpanded=this.open?"true":"false":this.ariaExpanded=null}_setHasActiveItemFlagOnParent(e,t){const o=function(e){return e.parentElement&&e.parentElement instanceof Zi?e.parentElement:null}(e);o&&(o.hasActiveItem=t)}_refreshDescriptionSlotState(){const e=(this._descriptionSlotElements?.length??0)>0;this._hasDescriptionSlotContent=e,this._setCustomState("has-description",e)}_refreshActionsSlotState(){const e=(this._actionsSlotElements?.length??0)>0;this._hasActionsSlotContent=e,this._setCustomState("has-actions",e),this._updateActionsVisibility()}_refreshDecorationSlotState(){const e=(this._decorationSlotElements?.length??0)>0,t=this._hasDecorationSlotContent;this._hasDecorationSlotContent=e,this._setCustomState("has-decoration",e),t!==e&&this.requestUpdate()}_setCustomState(e,t){if(this._internals?.states)try{t?this._internals.states.add(e):this._internals.states.delete(e)}catch{t?this._internals.states.add(`--${e}`):this._internals.states.delete(`--${e}`)}}_getActiveElement(){const e=this.getRootNode({composed:!0});return e instanceof Document?e.activeElement instanceof Element?e.activeElement:null:e instanceof ShadowRoot&&e.activeElement instanceof Element?e.activeElement:null}_isActiveElementInActions(e){return!!e&&(this._actionsSlotElements??[]).some(t=>t===e||t.contains(e))}_updateActionsVisibility(){if(!this._hasActionsSlotContent)return void this._setCustomState("show-actions",!1);const e=this._getActiveElement(),t=this._isActiveElementInActions(e),o=this.selected||this._isPointerInside||this._hasKeyboardFocus||t;this._setCustomState("show-actions",o)}_updateFocusState(){const e=this.matches(":focus-visible");this._setCustomState("focus-visible",e);const t=this._getActiveElement();let o=null;if(t instanceof Element&&(o=t.closest("vscode-tree-item"),!o)){const e=t.getRootNode();e instanceof ShadowRoot&&e.host instanceof Gi&&(o=e.host)}const s=o===this;this._hasKeyboardFocus=s,this._setCustomState("keyboard-focus",s),this._updateActionsVisibility()}_clearHoverState(){this._isPointerInside=!1,this._setCustomState("hover",!1),this._updateActionsVisibility()}_adoptHoverFromSibling(){this._isPointerInside=!0,this._claimHover()}_claimHover(){const e=this._treeContextState;e.hoveredItem&&e.hoveredItem!==this&&e.hoveredItem._clearHoverState(),e.hoveredItem=this,this._setCustomState("hover",!0),this._updateActionsVisibility()}_toggleActiveState(){this.active?(this._treeContextState.activeItem&&(this._treeContextState.activeItem.active=!1,this._setHasActiveItemFlagOnParent(this._treeContextState.activeItem,!1)),this._treeContextState.activeItem=this,this._setHasActiveItemFlagOnParent(this,!0),this.tabIndex=0,this._setCustomState("active",!0)):(this._treeContextState.activeItem===this&&(this._treeContextState.activeItem=null,this._setHasActiveItemFlagOnParent(this,!1)),this.tabIndex=-1,this._setCustomState("active",!1))}_selectItem(e){const{selectedItems:t}=this._treeContextState,{multiSelect:o}=this._configContext,s=new Set(t);o&&e?this.selected=!this.selected:(Array.from(t).forEach(e=>{e!==this&&(e.selected=!1)}),t.clear(),this.selected=!0);const i=new Set([...s,...t]);i.add(this),i.forEach(e=>e._updateActionsVisibility())}_selectRange(){const e=this._treeContextState.prevFocusedItem;if(!e||e===this)return;const t=new Set(this._treeContextState.selectedItems);this._treeContextState.itemListUpToDate||(this._treeContextState.allItems=this._treeContextState.rootElement.querySelectorAll("vscode-tree-item"),this._treeContextState.allItems&&this._treeContextState.allItems.forEach((e,t)=>{e.dataset.score=t.toString()}),this._treeContextState.itemListUpToDate=!0);let o=+(e.dataset.score??-1),s=+(this.dataset.score??-1);o>s&&([o,s]=[s,o]),Array.from(this._treeContextState.selectedItems).forEach(e=>e.selected=!1),this._treeContextState.selectedItems.clear(),this._selectItemsAndAllVisibleDescendants(o,s);const i=new Set([...t,...this._treeContextState.selectedItems]);i.add(this),i.forEach(e=>e._updateActionsVisibility())}_selectItemsAndAllVisibleDescendants(e,t){let o=e;for(;o<=t;)if(this._treeContextState.allItems){const e=this._treeContextState.allItems[o];if(e.branch&&!e.open){e.selected=!0;o+=e.querySelectorAll("vscode-tree-item").length}else e.branch&&e.open?(e.selected=!0,o+=this._selectItemsAndAllVisibleDescendants(o+1,t)):(e.selected=!0,o+=1)}return o}_mainSlotChange(){this._initiallyAssignedTreeItems.forEach(e=>{e.setAttribute("slot","children")})}_handleChildrenSlotChange(){Di(this,this._childrenTreeItems),this._treeContextState.rootElement&&this._treeContextState.rootElement.updateHasBranchItemFlag()}_handleDescriptionSlotChange(){this._refreshDescriptionSlotState()}_handleActionsSlotChange(){this._refreshActionsSlotState()}_handleDecorationSlotChange(){this._refreshDecorationSlotState()}_handleContentClick(e){e.stopPropagation();const t=e.ctrlKey||e.metaKey,o=e.shiftKey;o&&this._configContext.multiSelect?(this._selectRange(),this._treeContextState.emitSelectEvent?.(),this.updateComplete.then(()=>{this._treeContextState.highlightIndentGuides?.()})):(this._selectItem(t),this._treeContextState.emitSelectEvent?.(),this.updateComplete.then(()=>{this._treeContextState.highlightIndentGuides?.()}),this._configContext.expandMode===ji&&(!this.branch||this._configContext.multiSelect&&t||(this.open=!this.open))),this.active=!0,o||(this._treeContextState.prevFocusedItem=this)}_handleDoubleClick(e){this._configContext.expandMode===Hi&&(!this.branch||this._configContext.multiSelect&&(e.ctrlKey||e.metaKey)||(this.open=!this.open))}_handleIconSlotChange(e){const t=e.target,o=t.assignedElements().length>0;switch(t.name){case"icon-branch":this._hasBranchIcon=o;break;case"icon-branch-opened":this._hasBranchOpenedIcon=o;break;case"icon-leaf":this._hasLeafIcon=o}}render(){const{hideArrows:e,indent:t,indentGuides:o}=this._configContext,{hasBranchItem:s}=this._treeContextState;let i=3+this.level*t;const n=e?3:13,r=3+this.level*t+n;this.branch||e||!s||(i+=30);const a=this._hasBranchIcon&&this.branch||this._hasBranchOpenedIcon&&this.branch&&this.open||this._hasLeafIcon&&!this.branch,l={wrapper:!0,active:this.active,"has-description":this._hasDescriptionSlotContent,"has-actions":this._hasActionsSlotContent,"has-decoration":this._hasDecorationSlotContent},c={children:!0,guide:o!==qi,"default-guide":o!==qi,"highlighted-guide":this.highlightedGuides},d={"icon-container":!0,"has-icon":a},h={content:!0,"has-description":this._hasDescriptionSlotContent,"has-decoration":this._hasDecorationSlotContent};return Ke` <div class="root">
      <div
        class=${Ft(l)}
        part="wrapper"
        @click=${this._handleContentClick}
        @dblclick=${this._handleDoubleClick}
        .style=${jt({paddingLeft:`${i}px`})}
      >
        ${this.branch&&!e?Ke`<div
              class=${Ft({"arrow-container":!0,"icon-rotated":this.open})}
              part="arrow-icon-container"
            >
              ${Xi}
            </div>`:Xe}
        <div class=${Ft(d)} part="icon-container">
          ${this.branch&&!this.open?Ke`<slot
                name="icon-branch"
                @slotchange=${this._handleIconSlotChange}
              ></slot>`:Xe}
          ${this.branch&&this.open?Ke`<slot
                name="icon-branch-opened"
                @slotchange=${this._handleIconSlotChange}
              ></slot>`:Xe}
          ${this.branch?Xe:Ke`<slot
                name="icon-leaf"
                @slotchange=${this._handleIconSlotChange}
              ></slot>`}
        </div>
        <div class=${Ft(h)} part="content">
          <span class="label" part="label">
            <slot @slotchange=${this._handleMainSlotChange}></slot>
          </span>
          <span
            class="description"
            part="description"
            ?hidden=${!this._hasDescriptionSlotContent}
          >
            <slot
              name="description"
              @slotchange=${this._handleDescriptionSlotChange}
            ></slot>
          </span>
          <div class="actions" part="actions">
            <slot
              name="actions"
              @slotchange=${this._handleActionsSlotChange}
            ></slot>
          </div>
          <div class="decoration" part="decoration">
            <slot
              name="decoration"
              @slotchange=${this._handleDecorationSlotChange}
            ></slot>
          </div>
        </div>
      </div>
      <div
        class=${Ft(c)}
        .style=${jt({"--indentation-guide-left":`${r}px`})}
        role="group"
        part="children"
      >
        <slot
          name="children"
          @slotchange=${this._handleChildrenSlotChange}
        ></slot>
      </div>
    </div>`}};Zi.styles=Ki,Yi([gt({type:Boolean})],Zi.prototype,"active",void 0),Yi([gt({type:Boolean,reflect:!0})],Zi.prototype,"branch",void 0),Yi([gt({type:Boolean})],Zi.prototype,"hasActiveItem",void 0),Yi([gt({type:Boolean})],Zi.prototype,"hasSelectedItem",void 0),Yi([gt({type:Boolean})],Zi.prototype,"highlightedGuides",void 0),Yi([gt({type:Boolean,reflect:!0})],Zi.prototype,"open",void 0),Yi([gt({type:Number,reflect:!0})],Zi.prototype,"level",void 0),Yi([gt({type:Boolean,reflect:!0})],Zi.prototype,"selected",null),Yi([mt()],Zi.prototype,"_hasBranchIcon",void 0),Yi([mt()],Zi.prototype,"_hasBranchOpenedIcon",void 0),Yi([mt()],Zi.prototype,"_hasLeafIcon",void 0),Yi([mt()],Zi.prototype,"_hasDescriptionSlotContent",void 0),Yi([mt()],Zi.prototype,"_hasActionsSlotContent",void 0),Yi([mt()],Zi.prototype,"_hasDecorationSlotContent",void 0),Yi([Pi({context:Bi,subscribe:!0})],Zi.prototype,"_treeContextState",void 0),Yi([Pi({context:zi,subscribe:!0})],Zi.prototype,"_configContext",void 0),Yi([wt({selector:"vscode-tree-item"})],Zi.prototype,"_initiallyAssignedTreeItems",void 0),Yi([wt({selector:"vscode-tree-item",slot:"children"})],Zi.prototype,"_childrenTreeItems",void 0),Yi([wt({slot:"description",flatten:!0})],Zi.prototype,"_descriptionSlotElements",void 0),Yi([wt({slot:"actions",flatten:!0})],Zi.prototype,"_actionsSlotElements",void 0),Yi([wt({slot:"decoration",flatten:!0})],Zi.prototype,"_decorationSlotElements",void 0),Zi=Gi=Yi([Et("vscode-tree-item")],Zi),oe({tagName:"vscode-tree-item",elementClass:Zi,react:v,displayName:"VscodeTreeItem"});const Ji=()=>{const{t:e}=p("chat"),t=b(e=>e.activeProfile),[o,i]=s.useState(!1),n=e("budget.unlimited"),r=s.useMemo(()=>((e,t)=>{if(!e)return null;const{usage:o,budget_limit:s,user_id:i}=e;return null==o?null:{percentage:s?Math.floor(100-o/s*100):100,spend:y.formatCost(o),limit:s?y.formatCost(s):t,email:i||""}})(t,n),[t,n]),a=async()=>{i(!0);try{await f("all"),await g(!1)}finally{i(!1)}};return s.useEffect(()=>{a()},[]),{budget:r,isLoading:o,fetchBudget:a}},Qi="Manage Subscription Clicked",en=({isOpen:e,title:t,message:o,confirmText:s,cancelText:i,isLoading:n=!1,error:r,onConfirm:a,onCancel:l,isDestructive:c=!1})=>d.jsx(x,{open:e,onOpenChange:e=>!e&&l(),children:d.jsxs(w,{showCloseButton:!1,children:[d.jsxs(C,{children:[d.jsx(k,{children:t}),d.jsx(S,{children:o})]}),d.jsxs($,{children:[r&&d.jsx("p",{className:"text-xs text-vscode-errorForeground me-auto",children:r}),d.jsx(h,{onClick:l,disabled:n,children:i}),d.jsx(h,{variant:c?"destructive":"primary",onClick:a,disabled:n,children:s})]})]})});function tn({className:e}){const{t:t}=p();return d.jsx(m,{content:t("settings:policy.lockedByAdmin"),asChild:!1,children:d.jsx(I,{size:12,className:e??"text-vscode-foreground/60 shrink-0"})})}export{G as B,en as C,Qi as M,tn as P,Y as S,W as T,X as U,ui as V,J as W,mi as a,K as b,zt as c,fs as d,Z as e,Ji as u};
