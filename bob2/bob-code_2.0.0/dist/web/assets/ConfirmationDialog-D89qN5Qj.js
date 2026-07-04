var e,t,o=Object.defineProperty,s=(e,t,s)=>((e,t,s)=>t in e?o(e,t,{enumerable:!0,configurable:!0,writable:!0,value:s}):e[t]=s)(e,"symbol"!=typeof t?t+"":t,s);import{G as i,a4 as n,a5 as r,r as a,a6 as l,a7 as c,a8 as d,a9 as h,aa as p,u,j as v,d as f,b,f as g,v as m,g as _,t as y,Y as x,B as w,n as C,o as S,a0 as k,N as E,ab as A,Z as O,C as I,_ as $,ac as P,ad as R}from"./index-CIdWFe35.js";import{e as B,u as D,f as M,C as T}from"./select-Czt_lao0.js";import{bn as N,bG as L,bH as j}from"./MarkdownBlock-BucVxj4A.js";import{R as V,C as z,a as F,T as H,D as U,P as q,O as W}from"./index-CjiaMnxM.js";import"./checkbox-BVXnEnPg.js";const K=i(t?e:(t=1,e={area:!0,base:!0,br:!0,col:!0,embed:!0,hr:!0,img:!0,input:!0,link:!0,meta:!0,param:!0,source:!0,track:!0,wbr:!0}));var G=/\s([^'"/\s><]+?)[\s/>]|([^\s=]+)=\s?(".*?"|'.*?')/g;function Y(e){var t={type:"tag",name:"",voidElement:!1,attrs:{},children:[]},o=e.match(/<\/?([^\s]+?)[/\s>]/);if(o&&(t.name=o[1],(K[o[1]]||"/"===e.charAt(e.length-2))&&(t.voidElement=!0),t.name.startsWith("!--"))){var s=e.indexOf("--\x3e");return{type:"comment",comment:-1!==s?e.slice(4,s):""}}for(var i=new RegExp(G),n=null;null!==(n=i.exec(e));)if(n[0].trim())if(n[1]){var r=n[1].trim(),a=[r,""];r.indexOf("=")>-1&&(a=r.split("=")),t.attrs[a[0]]=a[1],i.lastIndex--}else n[2]&&(t.attrs[n[2]]=n[3].trim().substring(1,n[3].length-1));return t}var X=/<[a-zA-Z0-9\-\!\/](?:"[^"]*"|'[^']*'|[^'">])*>/g,Z=/^\s*$/,J=Object.create(null);var Q=function(e,t){t||(t={}),t.components||(t.components=J);var o,s=[],i=[],n=-1,r=!1;if(0!==e.indexOf("<")){var a=e.indexOf("<");s.push({type:"text",content:-1===a?e:e.substring(0,a)})}return e.replace(X,function(a,l){if(r){if(a!=="</"+o.name+">")return;r=!1}var c,d="/"!==a.charAt(1),h=a.startsWith("\x3c!--"),p=l+a.length,u=e.charAt(p);if(h){var v=Y(a);return n<0?(s.push(v),s):((c=i[n]).children.push(v),s)}if(d&&(n++,"tag"===(o=Y(a)).type&&t.components[o.name]&&(o.type="component",r=!0),o.voidElement||r||!u||"<"===u||o.children.push({type:"text",content:e.slice(p,e.indexOf("<",p))}),0===n&&s.push(o),(c=i[n-1])&&c.children.push(o),i[n]=o),(!d||o.voidElement)&&(n>-1&&(o.voidElement||o.name===a.slice(2,-1))&&(n--,o=-1===n?s:i[n]),!r&&"<"!==u&&u)){c=-1===n?s:i[n].children;var f=e.indexOf("<",p),b=e.slice(p,-1===f?void 0:f);Z.test(b)&&(b=" "),(f>-1&&n+c.length>=0||" "!==b)&&c.push({type:"text",content:b})}}),s};const ee=(e,t)=>{if(!e)return!1;const o=e.props?.children??e.children;return t?o.length>0:!!o},te=e=>{if(!e)return[];const t=e.props?.children??e.children;return e.props?.i18nIsDynamicList?oe(t):t},oe=e=>Array.isArray(e)?e:[e],se=(e,t,o,s)=>{if(!e)return"";let i="";const n=oe(e),r=t?.transSupportBasicHtmlNodes?t.transKeepBasicHtmlNodesFor??[]:[];return n.forEach((e,n)=>{if(c(e))i+=`${e}`;else{if(a.isValidElement(e)){const{props:a,type:l}=e,d=Object.keys(a).length,h=r.indexOf(l)>-1,p=a.children;if(!p&&h&&!d)return void(i+=`<${l}/>`);if(!p&&(!h||d)||a.i18nIsDynamicList)return void(i+=`<${n}></${n}>`);if(h&&1===d&&c(p))return void(i+=`<${l}>${p}</${l}>`);const u=se(p,t,o,s);return void(i+=`<${n}>${u}</${n}>`)}if(null!==e){if(h(e)){const{format:t,...n}=e,r=Object.keys(n);if(1===r.length){const e=t?`${r[0]}, ${t}`:r[0];return void(i+=`{{${e}}}`)}return void d(o,"TRANS_INVALID_OBJ","Invalid child - Object should only have keys {{ value, format }} (format is optional).",{i18nKey:s,child:e})}d(o,"TRANS_INVALID_VAR","Passed in a variable like {number} - pass variables for interpolation as full objects like {{number}}.",{i18nKey:s,child:e})}else d(o,"TRANS_NULL_VALUE","Passed in a null value as child",{i18nKey:s})}}),i},ie=(e,t,o,s,i,n,r)=>{if(""===o)return[];const l=i.transKeepBasicHtmlNodesFor||[],d=o&&new RegExp(l.map(e=>`<${e}`).join("|")).test(o);if(!(e||t||d||r))return[o];const p=t??{},u=e=>{oe(e).forEach(e=>{c(e)||(ee(e)?u(te(e)):h(e)&&!a.isValidElement(e)&&Object.assign(p,e))})};u(e);const v=Q(`<0>${o}</0>`),f={...p,...n},b=(e,t,o)=>{const s=te(e),i=m(s,t.children,o);return(e=>Array.isArray(e)&&e.every(a.isValidElement))(s)&&0===i.length||e.props?.i18nIsDynamicList?s:i},g=(e,t,o,s,i)=>{e.dummy?(e.children=t,o.push(a.cloneElement(e,{key:s},i?void 0:t))):o.push(...a.Children.map([e],e=>{const o={...e.props};return delete o.i18nIsDynamicList,a.createElement(e.type,{...o,key:s,ref:e.props.ref??e.ref},i?null:t)}))},m=(e,o,n)=>{const p=oe(e);return oe(o).reduce((e,o,u)=>{const v=o.children?.[0]?.content&&s.services.interpolator.interpolate(o.children[0].content,f,s.language);if("tag"===o.type){let r=p[parseInt(o.name,10)];!r&&t&&(r=t[o.name]),1!==n.length||r||(r=n[0][o.name]),r||(r={});const _=0!==Object.keys(o.attrs).length?((e,t)=>{const o={...t};return o.props=Object.assign(e.props,t.props),o})({props:o.attrs},r):r,y=a.isValidElement(_),x=y&&ee(o,!0)&&!o.voidElement,w=d&&h(_)&&_.dummy&&!y,C=h(t)&&Object.hasOwnProperty.call(t,o.name);if(c(_)){const t=s.services.interpolator.interpolate(_,f,s.language);e.push(t)}else if(ee(_)||x){const t=b(_,o,n);g(_,t,e,u)}else if(w){const t=m(p,o.children,n);g(_,t,e,u)}else if(Number.isNaN(parseFloat(o.name)))if(C){const t=b(_,o,n);g(_,t,e,u,o.voidElement)}else if(i.transSupportBasicHtmlNodes&&l.indexOf(o.name)>-1)if(o.voidElement)e.push(a.createElement(o.name,{key:`${o.name}-${u}`}));else{const t=m(p,o.children,n);e.push(a.createElement(o.name,{key:`${o.name}-${u}`},t))}else if(o.voidElement)e.push(`<${o.name} />`);else{const t=m(p,o.children,n);e.push(`<${o.name}>${t}</${o.name}>`)}else if(h(_)&&!y){const t=o.children[0]?v:null;t&&e.push(t)}else g(_,v,e,u,1!==o.children.length||!v)}else if("text"===o.type){const t=i.transWrapTextNodes,n=r?i.unescape(s.services.interpolator.interpolate(o.content,f,s.language)):s.services.interpolator.interpolate(o.content,f,s.language);t?e.push(a.createElement(t,{key:`${o.name}-${u}`},n)):e.push(n)}return e},[])},_=m([{dummy:!0,children:e||[]}],v,oe(e||[]));return te(_[0])},ne=(e,t,o)=>{const s=e.key||t,i=a.cloneElement(e,{key:s});if(!i.props||!i.props.children||o.indexOf(`${t}/>`)<0&&o.indexOf(`${t} />`)<0)return i;return a.createElement(function(){return a.createElement(a.Fragment,null,i)},{key:s})},re=(e,t,o,s)=>e?Array.isArray(e)?((e,t)=>e.map((e,o)=>ne(e,o,t)))(e,t):h(e)?((e,t)=>{const o={};return Object.keys(e).forEach(s=>{Object.assign(o,{[s]:ne(e[s],s,t)})}),o})(e,t):(n(o,"TRANS_INVALID_COMPONENTS",'<Trans /> "components" prop expects an object or array',{i18nKey:s}),null):null;function ae({children:e,count:t,parent:o,i18nKey:s,context:i,tOptions:d={},values:p,defaults:u,components:v,ns:f,i18n:b,t:g,shouldUnescape:m,..._}){const y=b||l();if(!y)return n(y,"NO_I18NEXT_INSTANCE","Trans: You need to pass in an i18next instance using i18nextReactModule",{i18nKey:s}),e;const x=g||y.t.bind(y)||(e=>e),w={...r(),...y.options?.react};let C=f||x.ns||y.options?.defaultNS;C=c(C)?[C]:C||["translation"];const S=se(e,w,y,s),k=u||S||w.transEmptyNodeValue||s,{hashTransKey:E}=w,A=s||(E?E(S||k):S||k);y.options?.interpolation?.defaultVariables&&(p=p&&Object.keys(p).length>0?{...p,...y.options.interpolation.defaultVariables}:{...y.options.interpolation.defaultVariables});const O=p||void 0!==t&&!y.options?.interpolation?.alwaysFormat||!e?d.interpolation:{interpolation:{...d.interpolation,prefix:"#$?",suffix:"?$#"}},I={...d,context:i||d.context,count:t,...p,...O,defaultValue:k,ns:C},$=A?x(A,I):k,P=re(v,$,y,s);let R=P||e,B=null;var D;h(D=P)&&!Array.isArray(D)&&Object.keys(D).reduce((e,t)=>e&&Number.isNaN(Number.parseFloat(t)),!0)&&(B=P,R=e);const M=ie(R,B,$,y,w,I,m),T=o??w.defaultTransParent;return T?a.createElement(T,_,M):M}function le({children:e,count:t,parent:o,i18nKey:s,context:i,tOptions:n={},values:r,defaults:c,components:d,ns:h,i18n:u,t:v,shouldUnescape:f,...b}){const{i18n:g,defaultNS:m}=a.useContext(p)||{},_=u||g||l(),y=v||_?.t.bind(_);return ae({children:e,count:t,parent:o,i18nKey:s,context:i,tOptions:n,values:r,defaults:c,components:d,ns:h||y?.ns||m||_?.options?.defaultNS,i18n:_,t:v,shouldUnescape:f,...b})}var ce=["PageUp","PageDown"],de=["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"],he={"from-left":["Home","PageDown","ArrowDown","ArrowLeft"],"from-right":["Home","PageDown","ArrowDown","ArrowRight"],"from-bottom":["Home","PageDown","ArrowDown","ArrowLeft"],"from-top":["Home","PageDown","ArrowUp","ArrowLeft"]},pe="Slider",[ue,ve,fe]=B(pe),[be]=_(pe,[fe]),[ge,me]=be(pe),_e=a.forwardRef((e,t)=>{const{name:o,min:s=0,max:i=100,step:n=1,orientation:r="horizontal",disabled:l=!1,minStepsBetweenThumbs:c=0,defaultValue:d=[s],value:h,onValueChange:p=()=>{},onValueCommit:b=()=>{},inverted:g=!1,form:m,..._}=e,y=a.useRef(new Set),x=a.useRef(0),w="horizontal"===r?we:Ce,[C=[],S]=u({prop:h,defaultProp:d,onChange:e=>{const t=[...y.current];t[x.current]?.focus(),p(e)}}),k=a.useRef(C);function E(e,t,{commit:o}={commit:!1}){const r=function(e){return(String(e).split(".")[1]||"").length}(n),a=function(e,t){const o=Math.pow(10,t);return Math.round(e*o)/o}(Math.round((e-s)/n)*n+s,r),l=M(a,[s,i]);S((e=[])=>{const s=function(e=[],t,o){const s=[...e];return s[o]=t,s.sort((e,t)=>e-t)}(e,l,t);if(function(e,t){if(t>0){const o=function(e){return e.slice(0,-1).map((t,o)=>e[o+1]-t)}(e);return Math.min(...o)>=t}return!0}(s,c*n)){x.current=s.indexOf(l);const t=String(s)!==String(e);return t&&o&&b(s),t?s:e}return e})}return v.jsx(ge,{scope:e.__scopeSlider,name:o,disabled:l,min:s,max:i,valueIndexToChangeRef:x,thumbs:y.current,values:C,orientation:r,form:m,children:v.jsx(ue.Provider,{scope:e.__scopeSlider,children:v.jsx(ue.Slot,{scope:e.__scopeSlider,children:v.jsx(w,{"aria-disabled":l,"data-disabled":l?"":void 0,..._,ref:t,onPointerDown:f(_.onPointerDown,()=>{l||(k.current=C)}),min:s,max:i,inverted:g,onSlideStart:l?void 0:function(e){const t=function(e,t){if(1===e.length)return 0;const o=e.map(e=>Math.abs(e-t)),s=Math.min(...o);return o.indexOf(s)}(C,e);E(e,t)},onSlideMove:l?void 0:function(e){E(e,x.current)},onSlideEnd:l?void 0:function(){const e=k.current[x.current];C[x.current]!==e&&b(C)},onHomeKeyDown:()=>!l&&E(s,0,{commit:!0}),onEndKeyDown:()=>!l&&E(i,C.length-1,{commit:!0}),onStepKeyDown:({event:e,direction:t})=>{if(!l){const o=ce.includes(e.key)||e.shiftKey&&de.includes(e.key)?10:1,s=x.current;E(C[s]+n*o*t,s,{commit:!0})}}})})})})});_e.displayName=pe;var[ye,xe]=be(pe,{startEdge:"left",endEdge:"right",size:"width",direction:1}),we=a.forwardRef((e,t)=>{const{min:o,max:s,dir:i,inverted:n,onSlideStart:r,onSlideMove:l,onSlideEnd:c,onStepKeyDown:d,...h}=e,[p,u]=a.useState(null),f=g(t,e=>u(e)),b=a.useRef(void 0),m=D(i),_="ltr"===m,y=_&&!n||!_&&n;function x(e){const t=b.current||p.getBoundingClientRect(),i=De([0,t.width],y?[o,s]:[s,o]);return b.current=t,i(e-t.left)}return v.jsx(ye,{scope:e.__scopeSlider,startEdge:y?"left":"right",endEdge:y?"right":"left",direction:y?1:-1,size:"width",children:v.jsx(Se,{dir:m,"data-orientation":"horizontal",...h,ref:f,style:{...h.style,"--radix-slider-thumb-transform":"translateX(-50%)"},onSlideStart:e=>{const t=x(e.clientX);r?.(t)},onSlideMove:e=>{const t=x(e.clientX);l?.(t)},onSlideEnd:()=>{b.current=void 0,c?.()},onStepKeyDown:e=>{const t=he[y?"from-left":"from-right"].includes(e.key);d?.({event:e,direction:t?-1:1})}})})}),Ce=a.forwardRef((e,t)=>{const{min:o,max:s,inverted:i,onSlideStart:n,onSlideMove:r,onSlideEnd:l,onStepKeyDown:c,...d}=e,h=a.useRef(null),p=g(t,h),u=a.useRef(void 0),f=!i;function b(e){const t=u.current||h.current.getBoundingClientRect(),i=De([0,t.height],f?[s,o]:[o,s]);return u.current=t,i(e-t.top)}return v.jsx(ye,{scope:e.__scopeSlider,startEdge:f?"bottom":"top",endEdge:f?"top":"bottom",size:"height",direction:f?1:-1,children:v.jsx(Se,{"data-orientation":"vertical",...d,ref:p,style:{...d.style,"--radix-slider-thumb-transform":"translateY(50%)"},onSlideStart:e=>{const t=b(e.clientY);n?.(t)},onSlideMove:e=>{const t=b(e.clientY);r?.(t)},onSlideEnd:()=>{u.current=void 0,l?.()},onStepKeyDown:e=>{const t=he[f?"from-bottom":"from-top"].includes(e.key);c?.({event:e,direction:t?-1:1})}})})}),Se=a.forwardRef((e,t)=>{const{__scopeSlider:o,onSlideStart:s,onSlideMove:i,onSlideEnd:n,onHomeKeyDown:r,onEndKeyDown:a,onStepKeyDown:l,...c}=e,d=me(pe,o);return v.jsx(b.span,{...c,ref:t,onKeyDown:f(e.onKeyDown,e=>{"Home"===e.key?(r(e),e.preventDefault()):"End"===e.key?(a(e),e.preventDefault()):ce.concat(de).includes(e.key)&&(l(e),e.preventDefault())}),onPointerDown:f(e.onPointerDown,e=>{const t=e.target;t.setPointerCapture(e.pointerId),e.preventDefault(),d.thumbs.has(t)?t.focus():s(e)}),onPointerMove:f(e.onPointerMove,e=>{e.target.hasPointerCapture(e.pointerId)&&i(e)}),onPointerUp:f(e.onPointerUp,e=>{const t=e.target;t.hasPointerCapture(e.pointerId)&&(t.releasePointerCapture(e.pointerId),n(e))})})}),ke="SliderTrack",Ee=a.forwardRef((e,t)=>{const{__scopeSlider:o,...s}=e,i=me(ke,o);return v.jsx(b.span,{"data-disabled":i.disabled?"":void 0,"data-orientation":i.orientation,...s,ref:t})});Ee.displayName=ke;var Ae="SliderRange",Oe=a.forwardRef((e,t)=>{const{__scopeSlider:o,...s}=e,i=me(Ae,o),n=xe(Ae,o),r=a.useRef(null),l=g(t,r),c=i.values.length,d=i.values.map(e=>Be(e,i.min,i.max)),h=c>1?Math.min(...d):0,p=100-Math.max(...d);return v.jsx(b.span,{"data-orientation":i.orientation,"data-disabled":i.disabled?"":void 0,...s,ref:l,style:{...e.style,[n.startEdge]:h+"%",[n.endEdge]:p+"%"}})});Oe.displayName=Ae;var Ie="SliderThumb",$e=a.forwardRef((e,t)=>{const o=ve(e.__scopeSlider),[s,i]=a.useState(null),n=g(t,e=>i(e)),r=a.useMemo(()=>s?o().findIndex(e=>e.ref.current===s):-1,[o,s]);return v.jsx(Pe,{...e,ref:n,index:r})}),Pe=a.forwardRef((e,t)=>{const{__scopeSlider:o,index:s,name:i,...n}=e,r=me(Ie,o),l=xe(Ie,o),[c,d]=a.useState(null),h=g(t,e=>d(e)),p=!c||(r.form||!!c.closest("form")),u=m(c),_=r.values[s],y=void 0===_?0:Be(_,r.min,r.max),x=function(e,t){return t>2?`Value ${e+1} of ${t}`:2===t?["Minimum","Maximum"][e]:void 0}(s,r.values.length),w=u?.[l.size],C=w?function(e,t,o){const s=e/2,i=De([0,50],[0,s]);return(s-i(t)*o)*o}(w,y,l.direction):0;return a.useEffect(()=>{if(c)return r.thumbs.add(c),()=>{r.thumbs.delete(c)}},[c,r.thumbs]),v.jsxs("span",{style:{transform:"var(--radix-slider-thumb-transform)",position:"absolute",[l.startEdge]:`calc(${y}% + ${C}px)`},children:[v.jsx(ue.ItemSlot,{scope:e.__scopeSlider,children:v.jsx(b.span,{role:"slider","aria-label":e["aria-label"]||x,"aria-valuemin":r.min,"aria-valuenow":_,"aria-valuemax":r.max,"aria-orientation":r.orientation,"data-orientation":r.orientation,"data-disabled":r.disabled?"":void 0,tabIndex:r.disabled?void 0:0,...n,ref:h,style:void 0===_?{display:"none"}:e.style,onFocus:f(e.onFocus,()=>{r.valueIndexToChangeRef.current=s})})}),p&&v.jsx(Re,{name:i??(r.name?r.name+(r.values.length>1?"[]":""):void 0),form:r.form,value:_},s)]})});$e.displayName=Ie;var Re=a.forwardRef(({__scopeSlider:e,value:t,...o},s)=>{const i=a.useRef(null),n=g(i,s),r=y(t);return a.useEffect(()=>{const e=i.current;if(!e)return;const o=window.HTMLInputElement.prototype,s=Object.getOwnPropertyDescriptor(o,"value").set;if(r!==t&&s){const o=new Event("input",{bubbles:!0});s.call(e,t),e.dispatchEvent(o)}},[r,t]),v.jsx(b.input,{style:{display:"none"},...o,ref:n,defaultValue:t})});function Be(e,t,o){return M(100/(o-t)*(e-t),[0,100])}function De(e,t){return o=>{if(e[0]===e[1]||t[0]===t[1])return t[0];const s=(t[1]-t[0])/(e[1]-e[0]);return t[0]+s*(o-e[0])}}Re.displayName="RadioBubbleInput";var Me=_e,Te=Ee,Ne=Oe,Le=$e;function je(){const e=x("docs-link");return(t,o)=>function(e,t,o){if(t){const s=t.replace(/^\//,""),[i,n]=s.split("#");if(o){const t=`${e}/${i}/#${encodeURIComponent(o)}`;return n?`${t}#${n}`:t}return`${e}/${i}`}return e}(e,t,o)}const Ve=a.forwardRef(({href:e,external:t=!1,children:o,...s},i)=>{const n=t?{target:"_blank",rel:"noopener noreferrer"}:{};return v.jsx(w,{asChild:!0,...s,children:v.jsx("a",{href:e,ref:i,...n,children:o})})});Ve.displayName="ButtonLink";const ze=a.forwardRef(({className:e,external:t=!0,children:o,...s},i)=>{const n=t?{target:"_blank",rel:"noopener noreferrer"}:{};return v.jsx("a",{className:C("text-[var(--vscode-textLink-foreground)] hover:text-[var(--vscode-textLink-activeForeground)] underline cursor-pointer",e),ref:i,...n,...s,children:o})});ze.displayName="Link";function Fe(){const{t:e}=S();return v.jsxs("div",{className:"mb-4 flex flex-col items-center",children:[v.jsx(w,{size:"lg",onClick:()=>{k.postMessage({type:"sign-in"})},className:"mt-4 rounded-lg px-10",variant:"primary",children:e("common:signIn.signInSSO")}),v.jsx("p",{className:"text-vscode-descriptionForeground mb-0 mt-8 font-medium max-w-75",children:e("common:signIn.noSubscription")}),v.jsx(Ve,{href:"https://bob.ibm.com/trial?source=ibm-bob",className:"rounded-lg px-8 mt-2",variant:"secondary",external:!0,children:e("common:signIn.signUp")}),v.jsx(ze,{href:"https://www.ibm.com/privacy",className:"block mt-2",children:e("common:signIn.privacyPolicy")})]})}const He=new Set(["children","localName","ref","style","className"]),Ue=new WeakMap,qe=(e,t,o,s,i)=>{const n=i?.[t];void 0===n?(e[t]=o,null==o&&t in HTMLElement.prototype&&e.removeAttribute(t)):o!==s&&((e,t,o)=>{let s=Ue.get(e);void 0===s&&Ue.set(e,s=new Map);let i=s.get(t);void 0!==o?void 0===i?(s.set(t,i={handleEvent:o}),e.addEventListener(t,i)):i.handleEvent=o:void 0!==i&&(s.delete(t),e.removeEventListener(t,i))})(e,n,o)},We=({react:e,tagName:t,elementClass:o,events:s,displayName:i})=>{const n=new Set(Object.keys(s??{})),r=e.forwardRef((i,r)=>{const a=e.useRef(new Map),l=e.useRef(null),c={},d={};for(const[e,t]of Object.entries(i))He.has(e)?c["className"===e?"class":e]=t:n.has(e)||e in o.prototype?d[e]=t:c[e]=t;return e.useLayoutEffect(()=>{if(null===l.current)return;const e=new Map;for(const t in d)qe(l.current,t,i[t],a.current.get(t),s),a.current.delete(t),e.set(t,i[t]);for(const[t,o]of a.current)qe(l.current,t,void 0,o,s);a.current=e}),e.useLayoutEffect(()=>{l.current?.removeAttribute("defer-hydration")},[]),c.suppressHydrationWarning=!0,e.createElement(t,{...c,ref:e.useCallback(e=>{l.current=e,"function"==typeof r?r(e):null!==r&&(r.current=e)},[r])})});return r.displayName=i??o.name,r},Ke=globalThis,Ge=Ke.ShadowRoot&&(void 0===Ke.ShadyCSS||Ke.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,Ye=Symbol(),Xe=new WeakMap;let Ze=class{constructor(e,t,o){if(this._$cssResult$=!0,o!==Ye)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=e,this.t=t}get styleSheet(){let e=this.o;const t=this.t;if(Ge&&void 0===e){const o=void 0!==t&&1===t.length;o&&(e=Xe.get(t)),void 0===e&&((this.o=e=new CSSStyleSheet).replaceSync(this.cssText),o&&Xe.set(t,e))}return e}toString(){return this.cssText}};const Je=e=>new Ze("string"==typeof e?e:e+"",void 0,Ye),Qe=(e,...t)=>{const o=1===e.length?e[0]:t.reduce((t,o,s)=>t+(e=>{if(!0===e._$cssResult$)return e.cssText;if("number"==typeof e)return e;throw Error("Value passed to 'css' function must be a 'css' function result: "+e+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(o)+e[s+1],e[0]);return new Ze(o,e,Ye)},et=Ge?e=>e:e=>e instanceof CSSStyleSheet?(e=>{let t="";for(const o of e.cssRules)t+=o.cssText;return Je(t)})(e):e,{is:tt,defineProperty:ot,getOwnPropertyDescriptor:st,getOwnPropertyNames:it,getOwnPropertySymbols:nt,getPrototypeOf:rt}=Object,at=globalThis,lt=at.trustedTypes,ct=lt?lt.emptyScript:"",dt=at.reactiveElementPolyfillSupport,ht=(e,t)=>e,pt={toAttribute(e,t){switch(t){case Boolean:e=e?ct:null;break;case Object:case Array:e=null==e?e:JSON.stringify(e)}return e},fromAttribute(e,t){let o=e;switch(t){case Boolean:o=null!==e;break;case Number:o=null===e?null:Number(e);break;case Object:case Array:try{o=JSON.parse(e)}catch(s){o=null}}return o}},ut=(e,t)=>!tt(e,t),vt={attribute:!0,type:String,converter:pt,reflect:!1,useDefault:!1,hasChanged:ut};Symbol.metadata??(Symbol.metadata=Symbol("metadata")),at.litPropertyMetadata??(at.litPropertyMetadata=new WeakMap);let ft=class extends HTMLElement{static addInitializer(e){this._$Ei(),(this.l??(this.l=[])).push(e)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(e,t=vt){if(t.state&&(t.attribute=!1),this._$Ei(),this.prototype.hasOwnProperty(e)&&((t=Object.create(t)).wrapped=!0),this.elementProperties.set(e,t),!t.noAccessor){const o=Symbol(),s=this.getPropertyDescriptor(e,o,t);void 0!==s&&ot(this.prototype,e,s)}}static getPropertyDescriptor(e,t,o){const{get:s,set:i}=st(this.prototype,e)??{get(){return this[t]},set(e){this[t]=e}};return{get:s,set(t){const n=s?.call(this);i?.call(this,t),this.requestUpdate(e,n,o)},configurable:!0,enumerable:!0}}static getPropertyOptions(e){return this.elementProperties.get(e)??vt}static _$Ei(){if(this.hasOwnProperty(ht("elementProperties")))return;const e=rt(this);e.finalize(),void 0!==e.l&&(this.l=[...e.l]),this.elementProperties=new Map(e.elementProperties)}static finalize(){if(this.hasOwnProperty(ht("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty(ht("properties"))){const e=this.properties,t=[...it(e),...nt(e)];for(const o of t)this.createProperty(o,e[o])}const e=this[Symbol.metadata];if(null!==e){const t=litPropertyMetadata.get(e);if(void 0!==t)for(const[e,o]of t)this.elementProperties.set(e,o)}this._$Eh=new Map;for(const[t,o]of this.elementProperties){const e=this._$Eu(t,o);void 0!==e&&this._$Eh.set(e,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(e){const t=[];if(Array.isArray(e)){const o=new Set(e.flat(1/0).reverse());for(const e of o)t.unshift(et(e))}else void 0!==e&&t.push(et(e));return t}static _$Eu(e,t){const o=t.attribute;return!1===o?void 0:"string"==typeof o?o:"string"==typeof e?e.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise(e=>this.enableUpdating=e),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach(e=>e(this))}addController(e){(this._$EO??(this._$EO=new Set)).add(e),void 0!==this.renderRoot&&this.isConnected&&e.hostConnected?.()}removeController(e){this._$EO?.delete(e)}_$E_(){const e=new Map,t=this.constructor.elementProperties;for(const o of t.keys())this.hasOwnProperty(o)&&(e.set(o,this[o]),delete this[o]);e.size>0&&(this._$Ep=e)}createRenderRoot(){const e=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((e,t)=>{if(Ge)e.adoptedStyleSheets=t.map(e=>e instanceof CSSStyleSheet?e:e.styleSheet);else for(const o of t){const t=document.createElement("style"),s=Ke.litNonce;void 0!==s&&t.setAttribute("nonce",s),t.textContent=o.cssText,e.appendChild(t)}})(e,this.constructor.elementStyles),e}connectedCallback(){this.renderRoot??(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),this._$EO?.forEach(e=>e.hostConnected?.())}enableUpdating(e){}disconnectedCallback(){this._$EO?.forEach(e=>e.hostDisconnected?.())}attributeChangedCallback(e,t,o){this._$AK(e,o)}_$ET(e,t){const o=this.constructor.elementProperties.get(e),s=this.constructor._$Eu(e,o);if(void 0!==s&&!0===o.reflect){const i=(void 0!==o.converter?.toAttribute?o.converter:pt).toAttribute(t,o.type);this._$Em=e,null==i?this.removeAttribute(s):this.setAttribute(s,i),this._$Em=null}}_$AK(e,t){const o=this.constructor,s=o._$Eh.get(e);if(void 0!==s&&this._$Em!==s){const e=o.getPropertyOptions(s),i="function"==typeof e.converter?{fromAttribute:e.converter}:void 0!==e.converter?.fromAttribute?e.converter:pt;this._$Em=s;const n=i.fromAttribute(t,e.type);this[s]=n??this._$Ej?.get(s)??n,this._$Em=null}}requestUpdate(e,t,o,s=!1,i){if(void 0!==e){const n=this.constructor;if(!1===s&&(i=this[e]),o??(o=n.getPropertyOptions(e)),!((o.hasChanged??ut)(i,t)||o.useDefault&&o.reflect&&i===this._$Ej?.get(e)&&!this.hasAttribute(n._$Eu(e,o))))return;this.C(e,t,o)}!1===this.isUpdatePending&&(this._$ES=this._$EP())}C(e,t,{useDefault:o,reflect:s,wrapped:i},n){o&&!(this._$Ej??(this._$Ej=new Map)).has(e)&&(this._$Ej.set(e,n??t??this[e]),!0!==i||void 0!==n)||(this._$AL.has(e)||(this.hasUpdated||o||(t=void 0),this._$AL.set(e,t)),!0===s&&this._$Em!==e&&(this._$Eq??(this._$Eq=new Set)).add(e))}async _$EP(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const e=this.scheduleUpdate();return null!=e&&await e,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??(this.renderRoot=this.createRenderRoot()),this._$Ep){for(const[e,t]of this._$Ep)this[e]=t;this._$Ep=void 0}const e=this.constructor.elementProperties;if(e.size>0)for(const[t,o]of e){const{wrapped:e}=o,s=this[t];!0!==e||this._$AL.has(t)||void 0===s||this.C(t,void 0,o,s)}}let e=!1;const t=this._$AL;try{e=this.shouldUpdate(t),e?(this.willUpdate(t),this._$EO?.forEach(e=>e.hostUpdate?.()),this.update(t)):this._$EM()}catch(o){throw e=!1,this._$EM(),o}e&&this._$AE(t)}willUpdate(e){}_$AE(e){this._$EO?.forEach(e=>e.hostUpdated?.()),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(e)),this.updated(e)}_$EM(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(e){return!0}update(e){this._$Eq&&(this._$Eq=this._$Eq.forEach(e=>this._$ET(e,this[e]))),this._$EM()}updated(e){}firstUpdated(e){}};ft.elementStyles=[],ft.shadowRootOptions={mode:"open"},ft[ht("elementProperties")]=new Map,ft[ht("finalized")]=new Map,dt?.({ReactiveElement:ft}),(at.reactiveElementVersions??(at.reactiveElementVersions=[])).push("2.1.2");const bt=globalThis,gt=e=>e,mt=bt.trustedTypes,_t=mt?mt.createPolicy("lit-html",{createHTML:e=>e}):void 0,yt="$lit$",xt=`lit$${Math.random().toFixed(9).slice(2)}$`,wt="?"+xt,Ct=`<${wt}>`,St=document,kt=()=>St.createComment(""),Et=e=>null===e||"object"!=typeof e&&"function"!=typeof e,At=Array.isArray,Ot="[ \t\n\f\r]",It=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,$t=/-->/g,Pt=/>/g,Rt=RegExp(`>|${Ot}(?:([^\\s"'>=/]+)(${Ot}*=${Ot}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),Bt=/'/g,Dt=/"/g,Mt=/^(?:script|style|textarea|title)$/i,Tt=e=>(t,...o)=>({_$litType$:e,strings:t,values:o}),Nt=Tt(1),Lt=Tt(2),jt=Symbol.for("lit-noChange"),Vt=Symbol.for("lit-nothing"),zt=new WeakMap,Ft=St.createTreeWalker(St,129);function Ht(e,t){if(!At(e)||!e.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==_t?_t.createHTML(t):t}class Ut{constructor({strings:e,_$litType$:t},o){let s;this.parts=[];let i=0,n=0;const r=e.length-1,a=this.parts,[l,c]=((e,t)=>{const o=e.length-1,s=[];let i,n=2===t?"<svg>":3===t?"<math>":"",r=It;for(let a=0;a<o;a++){const t=e[a];let o,l,c=-1,d=0;for(;d<t.length&&(r.lastIndex=d,l=r.exec(t),null!==l);)d=r.lastIndex,r===It?"!--"===l[1]?r=$t:void 0!==l[1]?r=Pt:void 0!==l[2]?(Mt.test(l[2])&&(i=RegExp("</"+l[2],"g")),r=Rt):void 0!==l[3]&&(r=Rt):r===Rt?">"===l[0]?(r=i??It,c=-1):void 0===l[1]?c=-2:(c=r.lastIndex-l[2].length,o=l[1],r=void 0===l[3]?Rt:'"'===l[3]?Dt:Bt):r===Dt||r===Bt?r=Rt:r===$t||r===Pt?r=It:(r=Rt,i=void 0);const h=r===Rt&&e[a+1].startsWith("/>")?" ":"";n+=r===It?t+Ct:c>=0?(s.push(o),t.slice(0,c)+yt+t.slice(c)+xt+h):t+xt+(-2===c?a:h)}return[Ht(e,n+(e[o]||"<?>")+(2===t?"</svg>":3===t?"</math>":"")),s]})(e,t);if(this.el=Ut.createElement(l,o),Ft.currentNode=this.el.content,2===t||3===t){const e=this.el.content.firstChild;e.replaceWith(...e.childNodes)}for(;null!==(s=Ft.nextNode())&&a.length<r;){if(1===s.nodeType){if(s.hasAttributes())for(const e of s.getAttributeNames())if(e.endsWith(yt)){const t=c[n++],o=s.getAttribute(e).split(xt),r=/([.?@])?(.*)/.exec(t);a.push({type:1,index:i,name:r[2],strings:o,ctor:"."===r[1]?Yt:"?"===r[1]?Xt:"@"===r[1]?Zt:Gt}),s.removeAttribute(e)}else e.startsWith(xt)&&(a.push({type:6,index:i}),s.removeAttribute(e));if(Mt.test(s.tagName)){const e=s.textContent.split(xt),t=e.length-1;if(t>0){s.textContent=mt?mt.emptyScript:"";for(let o=0;o<t;o++)s.append(e[o],kt()),Ft.nextNode(),a.push({type:2,index:++i});s.append(e[t],kt())}}}else if(8===s.nodeType)if(s.data===wt)a.push({type:2,index:i});else{let e=-1;for(;-1!==(e=s.data.indexOf(xt,e+1));)a.push({type:7,index:i}),e+=xt.length-1}i++}}static createElement(e,t){const o=St.createElement("template");return o.innerHTML=e,o}}function qt(e,t,o=e,s){if(t===jt)return t;let i=void 0!==s?o._$Co?.[s]:o._$Cl;const n=Et(t)?void 0:t._$litDirective$;return i?.constructor!==n&&(i?._$AO?.(!1),void 0===n?i=void 0:(i=new n(e),i._$AT(e,o,s)),void 0!==s?(o._$Co??(o._$Co=[]))[s]=i:o._$Cl=i),void 0!==i&&(t=qt(e,i._$AS(e,t.values),i,s)),t}class Wt{constructor(e,t){this._$AV=[],this._$AN=void 0,this._$AD=e,this._$AM=t}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(e){const{el:{content:t},parts:o}=this._$AD,s=(e?.creationScope??St).importNode(t,!0);Ft.currentNode=s;let i=Ft.nextNode(),n=0,r=0,a=o[0];for(;void 0!==a;){if(n===a.index){let t;2===a.type?t=new Kt(i,i.nextSibling,this,e):1===a.type?t=new a.ctor(i,a.name,a.strings,this,e):6===a.type&&(t=new Jt(i,this,e)),this._$AV.push(t),a=o[++r]}n!==a?.index&&(i=Ft.nextNode(),n++)}return Ft.currentNode=St,s}p(e){let t=0;for(const o of this._$AV)void 0!==o&&(void 0!==o.strings?(o._$AI(e,o,t),t+=o.strings.length-2):o._$AI(e[t])),t++}}class Kt{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(e,t,o,s){this.type=2,this._$AH=Vt,this._$AN=void 0,this._$AA=e,this._$AB=t,this._$AM=o,this.options=s,this._$Cv=s?.isConnected??!0}get parentNode(){let e=this._$AA.parentNode;const t=this._$AM;return void 0!==t&&11===e?.nodeType&&(e=t.parentNode),e}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(e,t=this){e=qt(this,e,t),Et(e)?e===Vt||null==e||""===e?(this._$AH!==Vt&&this._$AR(),this._$AH=Vt):e!==this._$AH&&e!==jt&&this._(e):void 0!==e._$litType$?this.$(e):void 0!==e.nodeType?this.T(e):(e=>At(e)||"function"==typeof e?.[Symbol.iterator])(e)?this.k(e):this._(e)}O(e){return this._$AA.parentNode.insertBefore(e,this._$AB)}T(e){this._$AH!==e&&(this._$AR(),this._$AH=this.O(e))}_(e){this._$AH!==Vt&&Et(this._$AH)?this._$AA.nextSibling.data=e:this.T(St.createTextNode(e)),this._$AH=e}$(e){const{values:t,_$litType$:o}=e,s="number"==typeof o?this._$AC(e):(void 0===o.el&&(o.el=Ut.createElement(Ht(o.h,o.h[0]),this.options)),o);if(this._$AH?._$AD===s)this._$AH.p(t);else{const e=new Wt(s,this),o=e.u(this.options);e.p(t),this.T(o),this._$AH=e}}_$AC(e){let t=zt.get(e.strings);return void 0===t&&zt.set(e.strings,t=new Ut(e)),t}k(e){At(this._$AH)||(this._$AH=[],this._$AR());const t=this._$AH;let o,s=0;for(const i of e)s===t.length?t.push(o=new Kt(this.O(kt()),this.O(kt()),this,this.options)):o=t[s],o._$AI(i),s++;s<t.length&&(this._$AR(o&&o._$AB.nextSibling,s),t.length=s)}_$AR(e=this._$AA.nextSibling,t){for(this._$AP?.(!1,!0,t);e!==this._$AB;){const t=gt(e).nextSibling;gt(e).remove(),e=t}}setConnected(e){void 0===this._$AM&&(this._$Cv=e,this._$AP?.(e))}}class Gt{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(e,t,o,s,i){this.type=1,this._$AH=Vt,this._$AN=void 0,this.element=e,this.name=t,this._$AM=s,this.options=i,o.length>2||""!==o[0]||""!==o[1]?(this._$AH=Array(o.length-1).fill(new String),this.strings=o):this._$AH=Vt}_$AI(e,t=this,o,s){const i=this.strings;let n=!1;if(void 0===i)e=qt(this,e,t,0),n=!Et(e)||e!==this._$AH&&e!==jt,n&&(this._$AH=e);else{const s=e;let r,a;for(e=i[0],r=0;r<i.length-1;r++)a=qt(this,s[o+r],t,r),a===jt&&(a=this._$AH[r]),n||(n=!Et(a)||a!==this._$AH[r]),a===Vt?e=Vt:e!==Vt&&(e+=(a??"")+i[r+1]),this._$AH[r]=a}n&&!s&&this.j(e)}j(e){e===Vt?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,e??"")}}class Yt extends Gt{constructor(){super(...arguments),this.type=3}j(e){this.element[this.name]=e===Vt?void 0:e}}class Xt extends Gt{constructor(){super(...arguments),this.type=4}j(e){this.element.toggleAttribute(this.name,!!e&&e!==Vt)}}class Zt extends Gt{constructor(e,t,o,s,i){super(e,t,o,s,i),this.type=5}_$AI(e,t=this){if((e=qt(this,e,t,0)??Vt)===jt)return;const o=this._$AH,s=e===Vt&&o!==Vt||e.capture!==o.capture||e.once!==o.once||e.passive!==o.passive,i=e!==Vt&&(o===Vt||s);s&&this.element.removeEventListener(this.name,this,o),i&&this.element.addEventListener(this.name,this,e),this._$AH=e}handleEvent(e){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,e):this._$AH.handleEvent(e)}}class Jt{constructor(e,t,o){this.element=e,this.type=6,this._$AN=void 0,this._$AM=t,this.options=o}get _$AU(){return this._$AM._$AU}_$AI(e){qt(this,e)}}const Qt={I:Kt},eo=bt.litHtmlPolyfillSupport;eo?.(Ut,Kt),(bt.litHtmlVersions??(bt.litHtmlVersions=[])).push("3.3.3");const to=(e,t,o)=>{const s=o?.renderBefore??t;let i=s._$litPart$;if(void 0===i){const e=o?.renderBefore??null;s._$litPart$=i=new Kt(t.insertBefore(kt(),e),e,void 0,o??{})}return i._$AI(e),i},oo=globalThis;let so=class extends ft{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){var e;const t=super.createRenderRoot();return(e=this.renderOptions).renderBefore??(e.renderBefore=t.firstChild),t}update(e){const t=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(e),this._$Do=to(t,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return jt}};so._$litElement$=!0,so.finalized=!0,oo.litElementHydrateSupport?.({LitElement:so});const io=oo.litElementPolyfillSupport;io?.({LitElement:so}),(oo.litElementVersions??(oo.litElementVersions=[])).push("4.2.2");const no={attribute:!0,type:String,converter:pt,reflect:!1,hasChanged:ut},ro=(e=no,t,o)=>{const{kind:s,metadata:i}=o;let n=globalThis.litPropertyMetadata.get(i);if(void 0===n&&globalThis.litPropertyMetadata.set(i,n=new Map),"setter"===s&&((e=Object.create(e)).wrapped=!0),n.set(o.name,e),"accessor"===s){const{name:s}=o;return{set(o){const i=t.get.call(this);t.set.call(this,o),this.requestUpdate(s,i,e,!0,o)},init(t){return void 0!==t&&this.C(s,void 0,e,t),t}}}if("setter"===s){const{name:s}=o;return function(o){const i=this[s];t.call(this,o),this.requestUpdate(s,i,e,!0,o)}}throw Error("Unsupported decorator location: "+s)};function ao(e){return(t,o)=>"object"==typeof o?ro(e,t,o):((e,t,o)=>{const s=t.hasOwnProperty(o);return t.constructor.createProperty(o,e),s?Object.getOwnPropertyDescriptor(t,o):void 0})(e,t,o)}function lo(e){return ao({...e,state:!0,attribute:!1})}const co=(e,t,o)=>(o.configurable=!0,o.enumerable=!0,Reflect.decorate&&"object"!=typeof t&&Object.defineProperty(e,t,o),o);function ho(e,t){return(o,s,i)=>{const n=t=>t.renderRoot?.querySelector(e)??null;if(t){const{get:e,set:t}="object"==typeof s?o:i??(()=>{const e=Symbol();return{get(){return this[e]},set(t){this[e]=t}}})();return co(o,s,{get(){let o=e.call(this);return void 0===o&&(o=n(this),(null!==o||this.hasUpdated)&&t.call(this,o)),o}})}return co(o,s,{get(){return n(this)}})}}let po;function uo(e){return(t,o)=>{const{slot:s,selector:i}=e??{},n="slot"+(s?`[name=${s}]`:":not([name])");return co(t,o,{get(){const t=this.renderRoot?.querySelector(n),o=t?.assignedElements(e)??[];return void 0===i?o:o.filter(e=>e.matches(i))}})}}const vo="2.5.1",fo="__vscodeElements_disableRegistryWarning__",bo=(e,t)=>{t?console.warn(`[VSCode Elements] ${e}\n%o`,t):console.warn(`${e}\n%o`,t)};class go extends so{get version(){return vo}warn(e){bo(e,this)}}const mo=e=>t=>{if(!customElements.get(e))return void customElements.define(e,t);if(fo in window)return;const o=document.createElement(e),s=o?.version;let i="";s?s!==vo?(i+="is already registered by a different version of VSCode Elements. ",i+=`This version is "${vo}", while the other one is "${s}".`):i+=`is already registered by the same version of VSCode Elements (${vo}).`:i+="is already registered by an unknown custom element handler class.",bo(`The custom element "${e}" ${i}\nTo suppress this warning, set window.${fo} to true`)},_o=Qe`
  :host([hidden]) {
    display: none;
  }

  :host([disabled]),
  :host(:disabled) {
    cursor: not-allowed;
    opacity: 0.4;
    pointer-events: none;
  }
`,yo=16/13;function xo(){return navigator.userAgent.indexOf("Linux")>-1?'system-ui, "Ubuntu", "Droid Sans", sans-serif':navigator.userAgent.indexOf("Mac")>-1?"-apple-system, BlinkMacSystemFont, sans-serif":navigator.userAgent.indexOf("Windows")>-1?'"Segoe WPC", "Segoe UI", sans-serif':"sans-serif"}const wo=[_o,Qe`
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
      font-family: var(--vscode-font-family, ${Je(xo())});
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
  `];var Co=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let So=class extends go{constructor(){super(...arguments),this.variant="default"}render(){return Nt`<div class="root"><slot></slot></div>`}};So.styles=wo,Co([ao({reflect:!0})],So.prototype,"variant",void 0),So=Co([mo("vscode-badge")],So);const ko=We({tagName:"vscode-badge",elementClass:So,react:E,displayName:"VscodeBadge"}),Eo=1,Ao=2,Oo=3,Io=e=>(...t)=>({_$litDirective$:e,values:t});let $o=class{constructor(e){}get _$AU(){return this._$AM._$AU}_$AT(e,t,o){this._$Ct=e,this._$AM=t,this._$Ci=o}_$AS(e,t){return this.update(e,t)}update(e,t){return this.render(...t)}};const Po=Io(class extends $o{constructor(e){if(super(e),e.type!==Eo||"class"!==e.name||e.strings?.length>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(e){return" "+Object.keys(e).filter(t=>e[t]).join(" ")+" "}update(e,[t]){if(void 0===this.st){this.st=new Set,void 0!==e.strings&&(this.nt=new Set(e.strings.join(" ").split(/\s/).filter(e=>""!==e)));for(const e in t)t[e]&&!this.nt?.has(e)&&this.st.add(e);return this.render(t)}const o=e.element.classList;for(const s of this.st)s in t||(o.remove(s),this.st.delete(s));for(const s in t){const e=!!t[s];e===this.st.has(s)||this.nt?.has(s)||(e?(o.add(s),this.st.add(s)):(o.remove(s),this.st.delete(s)))}return jt}}),Ro=e=>e??Vt;const Bo=Io(class extends $o{constructor(e){if(super(e),this._prevProperties={},e.type!==Oo||"style"!==e.name)throw new Error("The `stylePropertyMap` directive must be used in the `style` property")}update(e,[t]){return Object.entries(t).forEach(([t,o])=>{this._prevProperties[t]!==o&&(t.startsWith("--")?e.element.style.setProperty(t,o):e.element.style[t]=o,this._prevProperties[t]=o)}),jt}render(e){return jt}}),Do=[_o,Qe`
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
  `];var Mo,To=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let No=Mo=class extends go{constructor(){super(...arguments),this.label="",this.name="",this.size=16,this.spin=!1,this.spinDuration=1.5,this.actionIcon=!1,this._onButtonClick=e=>{this.dispatchEvent(new CustomEvent("vsc-click",{detail:{originalEvent:e}}))}}connectedCallback(){super.connectedCallback();const{href:e,nonce:t}=this._getStylesheetConfig();Mo.stylesheetHref=e,Mo.nonce=t}_getStylesheetConfig(){if("undefined"==typeof document)return{nonce:void 0,href:void 0};const e=document.getElementById("vscode-codicon-stylesheet"),t=e?.getAttribute("href")||void 0,o=e?.nonce||void 0;if(!e){let e='To use the Icon component, the codicons.css file must be included in the page with the id "vscode-codicon-stylesheet"! ';e+="See https://vscode-elements.github.io/components/icon/ for more details.",this.warn(e)}return{nonce:o,href:t}}render(){const{stylesheetHref:e,nonce:t}=Mo,o=Nt`<span
      class=${Po({codicon:!0,["codicon-"+this.name]:!0,spin:this.spin})}
      .style=${Bo({animationDuration:String(this.spinDuration)+"s",fontSize:this.size+"px",height:this.size+"px",width:this.size+"px"})}
    ></span>`,s=this.actionIcon?Nt` <button
          class="button"
          @click=${this._onButtonClick}
          aria-label=${this.label}
        >
          ${o}
        </button>`:Nt` <span class="icon" aria-hidden="true" role="presentation"
          >${o}</span
        >`;return Nt`
      <link
        rel="stylesheet"
        href=${Ro(e)}
        nonce=${Ro(t)}
      />
      ${s}
    `}};No.styles=Do,No.stylesheetHref="",No.nonce="",To([ao()],No.prototype,"label",void 0),To([ao({type:String})],No.prototype,"name",void 0),To([ao({type:Number})],No.prototype,"size",void 0),To([ao({type:Boolean,reflect:!0})],No.prototype,"spin",void 0),To([ao({type:Number,attribute:"spin-duration"})],No.prototype,"spinDuration",void 0),To([ao({type:Boolean,reflect:!0,attribute:"action-icon"})],No.prototype,"actionIcon",void 0),No=Mo=To([mo("vscode-icon")],No);const Lo=[_o,Qe`
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
      font-family: var(--vscode-font-family, ${Je(xo())});
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
  `];var jo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Vo=class extends go{get form(){return this._internals.form}constructor(){super(),this.autofocus=!1,this.tabIndex=0,this.secondary=!1,this.block=!1,this.role="button",this.disabled=!1,this.icon="",this.iconSpin=!1,this.iconAfter="",this.iconAfterSpin=!1,this.focused=!1,this.name=void 0,this.iconOnly=!1,this.type="button",this.value="",this._prevTabindex=0,this._hasContentBefore=!1,this._hasContentAfter=!1,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1},this.addEventListener("keydown",this._handleKeyDown.bind(this)),this.addEventListener("click",this._handleClick.bind(this)),this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.autofocus&&(this.tabIndex<0&&(this.tabIndex=0),this.updateComplete.then(()=>{this.focus(),this.requestUpdate()})),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}update(e){super.update(e),e.has("value")&&this._internals.setFormValue(this.value),e.has("disabled")&&(this.disabled?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):this.tabIndex=this._prevTabindex)}_executeAction(){"submit"===this.type&&this._internals.form&&this._internals.form.requestSubmit(),"reset"===this.type&&this._internals.form&&this._internals.form.reset()}_handleKeyDown(e){if(("Enter"===e.key||" "===e.key)&&!this.hasAttribute("disabled")){const e=new MouseEvent("click",{bubbles:!0,cancelable:!0});e.synthetic=!0,this.dispatchEvent(e),this._executeAction()}}_handleClick(e){e.synthetic||this.hasAttribute("disabled")||this._executeAction()}_handleSlotChange(e){const t=e.target;"content-before"===t.name&&(this._hasContentBefore=t.assignedElements().length>0),"content-after"===t.name&&(this._hasContentAfter=t.assignedElements().length>0)}render(){const e=""!==this.icon,t=""!==this.iconAfter,o={base:!0,"icon-only":this.iconOnly,"has-content-before":this._hasContentBefore,"has-content-after":this._hasContentAfter},s=e?Nt`<vscode-icon
          name=${this.icon}
          ?spin=${this.iconSpin}
          spin-duration=${Ro(this.iconSpinDuration)}
          class="icon"
        ></vscode-icon>`:Vt,i=t?Nt`<vscode-icon
          name=${this.iconAfter}
          ?spin=${this.iconAfterSpin}
          spin-duration=${Ro(this.iconAfterSpinDuration)}
          class="icon-after"
        ></vscode-icon>`:Vt;return Nt`
      <div
        class=${Po(o)}
        part="base"
        @slotchange=${this._handleSlotChange}
      >
        <slot name="content-before"></slot>
        ${s}
        <slot></slot>
        ${i}
        <slot name="content-after"></slot>
      </div>
    `}};Vo.styles=Lo,Vo.formAssociated=!0,jo([ao({type:Boolean,reflect:!0})],Vo.prototype,"autofocus",void 0),jo([ao({type:Number,reflect:!0})],Vo.prototype,"tabIndex",void 0),jo([ao({type:Boolean,reflect:!0})],Vo.prototype,"secondary",void 0),jo([ao({type:Boolean,reflect:!0})],Vo.prototype,"block",void 0),jo([ao({reflect:!0})],Vo.prototype,"role",void 0),jo([ao({type:Boolean,reflect:!0})],Vo.prototype,"disabled",void 0),jo([ao()],Vo.prototype,"icon",void 0),jo([ao({type:Boolean,reflect:!0,attribute:"icon-spin"})],Vo.prototype,"iconSpin",void 0),jo([ao({type:Number,reflect:!0,attribute:"icon-spin-duration"})],Vo.prototype,"iconSpinDuration",void 0),jo([ao({attribute:"icon-after"})],Vo.prototype,"iconAfter",void 0),jo([ao({type:Boolean,reflect:!0,attribute:"icon-after-spin"})],Vo.prototype,"iconAfterSpin",void 0),jo([ao({type:Number,reflect:!0,attribute:"icon-after-spin-duration"})],Vo.prototype,"iconAfterSpinDuration",void 0),jo([ao({type:Boolean,reflect:!0})],Vo.prototype,"focused",void 0),jo([ao({type:String,reflect:!0})],Vo.prototype,"name",void 0),jo([ao({type:Boolean,reflect:!0,attribute:"icon-only"})],Vo.prototype,"iconOnly",void 0),jo([ao({reflect:!0})],Vo.prototype,"type",void 0),jo([ao()],Vo.prototype,"value",void 0),jo([lo()],Vo.prototype,"_hasContentBefore",void 0),jo([lo()],Vo.prototype,"_hasContentAfter",void 0),Vo=jo([mo("vscode-button")],Vo),We({tagName:"vscode-button",elementClass:Vo,react:E,displayName:"VscodeButton"});const zo=[_o,Qe`
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
  `];let Fo=class extends go{render(){return Nt`<div class="root"><slot></slot></div>`}};Fo.styles=zo,Fo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r}([mo("vscode-button-group")],Fo),We({tagName:"vscode-button-group",elementClass:Fo,react:E,displayName:"VscodeButtonGroup"});class Ho extends go{constructor(){super(),this.focused=!1,this._prevTabindex=0,this._handleFocus=()=>{this.focused=!0},this._handleBlur=()=>{this.focused=!1}}connectedCallback(){super.connectedCallback(),this.addEventListener("focus",this._handleFocus),this.addEventListener("blur",this._handleBlur)}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("focus",this._handleFocus),this.removeEventListener("blur",this._handleBlur)}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o),"disabled"===e&&this.hasAttribute("disabled")?(this._prevTabindex=this.tabIndex,this.tabIndex=-1):"disabled"!==e||this.hasAttribute("disabled")||(this.tabIndex=this._prevTabindex)}}!function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);n>3&&r&&Object.defineProperty(t,o,r)}([ao({type:Boolean,reflect:!0})],Ho.prototype,"focused",void 0);const Uo=e=>{class t extends e{constructor(){super(...arguments),this._label="",this._slottedText=""}set label(e){this._label=e,""===this._slottedText&&this.setAttribute("aria-label",e)}get label(){return this._label}_handleSlotChange(){this._slottedText=this.textContent?this.textContent.trim():"",""!==this._slottedText&&this.setAttribute("aria-label",this._slottedText)}_renderLabelAttribute(){return""===this._slottedText?Nt`<span class="label-attr">${this._label}</span>`:Nt`${Vt}`}}return function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);n>3&&r&&Object.defineProperty(t,o,r)}([ao()],t.prototype,"label",null),t},qo=[Qe`
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
  `],Wo=[_o,qo,Qe`
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
  `];var Ko=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Go=class extends(Uo(Ho)){set checked(e){this._checked=e,this._manageRequired(),this.requestUpdate()}get checked(){return this._checked}set required(e){this._required=e,this._manageRequired(),this.requestUpdate()}get required(){return this._required}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}constructor(){super(),this.autofocus=!1,this._checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name=void 0,this.toggle=!1,this.value="",this.disabled=!1,this.indeterminate=!1,this._required=!1,this.type="checkbox",this._handleClick=e=>{e.preventDefault(),this.disabled||this._toggleState()},this._handleKeyDown=e=>{this.disabled||"Enter"!==e.key&&" "!==e.key||(e.preventDefault()," "===e.key&&this._toggleState(),"Enter"===e.key&&this._internals.form?.requestSubmit())},this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._handleKeyDown),this.updateComplete.then(()=>{this._manageRequired(),this._setActualFormValue()})}disconnectedCallback(){this.removeEventListener("keydown",this._handleKeyDown)}formResetCallback(){this.checked=this.defaultChecked}formStateRestoreCallback(e,t){e&&(this.checked=!0)}_setActualFormValue(){let e="";e=this.checked?this.value?this.value:"on":null,this._internals.setFormValue(e)}_toggleState(){this.checked=!this.checked,this.indeterminate=!1,this._setActualFormValue(),this._manageRequired(),this.dispatchEvent(new Event("change",{bubbles:!0}))}_manageRequired(){!this.checked&&this.required?this._internals.setValidity({valueMissing:!0},"Please check this box if you want to proceed.",this._inputEl??void 0):this._internals.setValidity({})}render(){const e=Po({icon:!0,checked:this.checked,indeterminate:this.indeterminate}),t=Po({"label-inner":!0}),o=Nt`<svg
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
    </svg>`,s=this.checked&&!this.indeterminate?o:Vt,i=this.indeterminate?Nt`<span class="indeterminate-icon"></span>`:Vt,n=this.toggle?Nt`<span class="thumb"></span>`:Nt`${i}${s}`;return Nt`
      <div class="wrapper">
        <input
          ?autofocus=${this.autofocus}
          id="input"
          class="checkbox"
          type="checkbox"
          ?checked=${this.checked}
          role=${Ro(this.toggle?"switch":void 0)}
          aria-checked=${Ro(this.toggle?this.checked?"true":"false":void 0)}
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
    `}};Go.styles=Wo,Go.formAssociated=!0,Go.shadowRootOptions={...so.shadowRootOptions,delegatesFocus:!0},Ko([ao({type:Boolean,reflect:!0})],Go.prototype,"autofocus",void 0),Ko([ao({type:Boolean,reflect:!0})],Go.prototype,"checked",null),Ko([ao({type:Boolean,reflect:!0,attribute:"default-checked"})],Go.prototype,"defaultChecked",void 0),Ko([ao({type:Boolean,reflect:!0})],Go.prototype,"invalid",void 0),Ko([ao({reflect:!0})],Go.prototype,"name",void 0),Ko([ao({type:Boolean,reflect:!0})],Go.prototype,"toggle",void 0),Ko([ao()],Go.prototype,"value",void 0),Ko([ao({type:Boolean,reflect:!0})],Go.prototype,"disabled",void 0),Ko([ao({type:Boolean,reflect:!0})],Go.prototype,"indeterminate",void 0),Ko([ao({type:Boolean,reflect:!0})],Go.prototype,"required",null),Ko([ao()],Go.prototype,"type",void 0),Ko([ho("#input")],Go.prototype,"_inputEl",void 0),Go=Ko([mo("vscode-checkbox")],Go),We({tagName:"vscode-checkbox",elementClass:Go,react:E,displayName:"VscodeCheckbox",events:{onChange:"change"}});const Yo=[_o,Qe`
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
  `];var Xo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Zo=class extends go{constructor(){super(...arguments),this.role="group",this.variant="horizontal"}render(){return Nt`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};Zo.styles=Yo,Xo([ao({reflect:!0})],Zo.prototype,"role",void 0),Xo([ao({reflect:!0})],Zo.prototype,"variant",void 0),Zo=Xo([mo("vscode-checkbox-group")],Zo),We({tagName:"vscode-checkbox-group",elementClass:Zo,react:E,displayName:"VscodeCheckboxGroup"});const Jo=[_o,Qe`
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
  `];var Qo=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let es=class extends go{constructor(){super(...arguments),this.alwaysShowHeaderActions=!1,this.title="",this.heading="",this.description="",this.open=!1}_emitToggleEvent(){this.dispatchEvent(new CustomEvent("vsc-collapsible-toggle",{detail:{open:this.open}}))}_onHeaderClick(){this.open=!this.open,this._emitToggleEvent()}_onHeaderKeyDown(e){"Enter"===e.key&&(this.open=!this.open,this._emitToggleEvent())}_onHeaderSlotClick(e){e.stopPropagation()}render(){const e={collapsible:!0,open:this.open},t={actions:!0,"always-visible":this.alwaysShowHeaderActions},o=this.heading?this.heading:this.title,s=Nt`<svg
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
    </svg>`,i=this.description?Nt`<span class="description">${this.description}</span>`:Vt;return Nt`
      <div class=${Po(e)}>
        <div
          class="collapsible-header"
          tabindex="0"
          @click=${this._onHeaderClick}
          @keydown=${this._onHeaderKeyDown}
        >
          ${s}
          <h3 class="title">${o}${i}</h3>
          <div class="header-slots">
            <div class=${Po(t)}>
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
    `}};es.styles=Jo,Qo([ao({type:Boolean,reflect:!0,attribute:"always-show-header-actions"})],es.prototype,"alwaysShowHeaderActions",void 0),Qo([ao({type:String})],es.prototype,"title",void 0),Qo([ao()],es.prototype,"heading",void 0),Qo([ao()],es.prototype,"description",void 0),Qo([ao({type:Boolean,reflect:!0})],es.prototype,"open",void 0),es=Qo([mo("vscode-collapsible")],es),We({tagName:"vscode-collapsible",elementClass:es,react:E,displayName:"VscodeCollapsible"});const ts=[_o,Qe`
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
  `];var os=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ss=class extends go{constructor(){super(...arguments),this.label="",this.keybinding="",this.value="",this.separator=!1,this.tabindex=0}onItemClick(){this.dispatchEvent(new CustomEvent("vsc-click",{detail:{label:this.label,keybinding:this.keybinding,value:this.value||this.label,separator:this.separator,tabindex:this.tabindex},bubbles:!0,composed:!0}))}render(){return Nt`
      ${this.separator?Nt`
            <div class="context-menu-item separator">
              <span class="ruler"></span>
            </div>
          `:Nt`
            <div class="context-menu-item">
              <a @click=${this.onItemClick}>
                ${this.label?Nt`<span class="label">${this.label}</span>`:Vt}
                ${this.keybinding?Nt`<span class="keybinding">${this.keybinding}</span>`:Vt}
              </a>
            </div>
          `}
    `}};ss.styles=ts,os([ao({type:String})],ss.prototype,"label",void 0),os([ao({type:String})],ss.prototype,"keybinding",void 0),os([ao({type:String})],ss.prototype,"value",void 0),os([ao({type:Boolean,reflect:!0})],ss.prototype,"separator",void 0),os([ao({type:Number})],ss.prototype,"tabindex",void 0),ss=os([mo("vscode-context-menu-item")],ss);const is=[_o,Qe`
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
  `];var ns=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let rs=class extends go{set data(e){this._data=e;const t=[];e.forEach((e,o)=>{e.separator||t.push(o)}),this._clickableItemIndexes=t}get data(){return this._data}set show(e){this._show=e,this._selectedClickableItemIndex=-1,e&&this.updateComplete.then(()=>{this._wrapperEl&&this._wrapperEl.focus(),requestAnimationFrame(()=>{document.addEventListener("click",this._onClickOutsideBound,{once:!0})})})}get show(){return this._show}constructor(){super(),this.preventClose=!1,this.tabIndex=0,this._selectedClickableItemIndex=-1,this._show=!1,this._data=[],this._clickableItemIndexes=[],this._onClickOutsideBound=this._onClickOutside.bind(this),this.addEventListener("keydown",this._onKeyDown)}_onClickOutside(e){e.composedPath().includes(this)||(this.show=!1)}_onKeyDown(e){const{key:t}=e;switch("ArrowUp"!==t&&"ArrowDown"!==t&&"Escape"!==t&&"Enter"!==t||e.preventDefault(),t){case"ArrowUp":this._handleArrowUp();break;case"ArrowDown":this._handleArrowDown();break;case"Escape":this._handleEscape();break;case"Enter":this._handleEnter()}}_handleArrowUp(){0===this._selectedClickableItemIndex?this._selectedClickableItemIndex=this._clickableItemIndexes.length-1:this._selectedClickableItemIndex-=1}_handleArrowDown(){this._selectedClickableItemIndex+1<this._clickableItemIndexes.length?this._selectedClickableItemIndex+=1:this._selectedClickableItemIndex=0}_handleEscape(){this.show=!1,document.removeEventListener("click",this._onClickOutsideBound)}_dispatchSelectEvent(e){const{keybinding:t,label:o,value:s,separator:i,tabindex:n}=e;this.dispatchEvent(new CustomEvent("vsc-context-menu-select",{detail:{keybinding:t,label:o,separator:i,tabindex:n,value:s}}))}_handleEnter(){if(-1===this._selectedClickableItemIndex)return;const e=this._clickableItemIndexes[this._selectedClickableItemIndex],t=this._wrapperEl.querySelectorAll("vscode-context-menu-item")[e];this._dispatchSelectEvent(t),this.preventClose||(this.show=!1,document.removeEventListener("click",this._onClickOutsideBound))}_onItemClick(e){const t=e.currentTarget;this._dispatchSelectEvent(t),this.preventClose||(this.show=!1)}_onItemMouseOver(e){const t=e.target,o=t.dataset.index?+t.dataset.index:-1,s=this._clickableItemIndexes.findIndex(e=>e===o);-1!==s&&(this._selectedClickableItemIndex=s)}_onItemMouseOut(){this._selectedClickableItemIndex=-1}render(){if(!this._show)return Nt`${Vt}`;const e=this._clickableItemIndexes[this._selectedClickableItemIndex];return Nt`
      <div class="context-menu" tabindex="0">
        ${this.data?this.data.map(({label:t="",keybinding:o="",value:s="",separator:i=!1,tabindex:n=0},r)=>Nt`
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
              `):Nt`<slot></slot>`}
      </div>
    `}};rs.styles=is,ns([ao({type:Array,attribute:!1})],rs.prototype,"data",null),ns([ao({type:Boolean,reflect:!0,attribute:"prevent-close"})],rs.prototype,"preventClose",void 0),ns([ao({type:Boolean,reflect:!0})],rs.prototype,"show",null),ns([ao({type:Number,reflect:!0})],rs.prototype,"tabIndex",void 0),ns([lo()],rs.prototype,"_selectedClickableItemIndex",void 0),ns([lo()],rs.prototype,"_show",void 0),ns([ho(".context-menu")],rs.prototype,"_wrapperEl",void 0),rs=ns([mo("vscode-context-menu")],rs),We({tagName:"vscode-context-menu",elementClass:rs,react:E,displayName:"VscodeContextMenu",events:{onVscContextMenuSelect:"vsc-context-menu-select"}}),We({tagName:"vscode-context-menu-item",elementClass:ss,react:E,displayName:"VscodeContextMenuItem"});const as=[_o,Qe`
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
  `];var ls=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let cs=class extends go{constructor(){super(...arguments),this.role="separator"}render(){return Nt`<div></div>`}};cs.styles=as,ls([ao({reflect:!0})],cs.prototype,"role",void 0),cs=ls([mo("vscode-divider")],cs),We({tagName:"vscode-divider",elementClass:cs,react:E,displayName:"VscodeDivider"});const ds=[_o,Qe`
    :host {
      display: block;
      max-width: 727px;
    }
  `];var hs,ps,us=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};(ps=hs||(hs={})).HORIZONTAL="horizontal",ps.VERTICAL="vertical";let vs=class extends go{constructor(){super(...arguments),this.breakpoint=490,this._responsive=!1,this._firstUpdateComplete=!1,this._resizeObserverCallbackBound=this._resizeObserverCallback.bind(this)}set responsive(e){this._responsive=e,this._firstUpdateComplete&&(e?this._activateResponsiveLayout():this._deactivateResizeObserver())}get responsive(){return this._responsive}_toggleCompactLayout(e){this._assignedFormGroups.forEach(t=>{t.dataset.originalVariant||(t.dataset.originalVariant=t.variant);const o=t.dataset.originalVariant;e===hs.VERTICAL&&"horizontal"===o?t.variant="vertical":t.variant=o;t.querySelectorAll("vscode-checkbox-group, vscode-radio-group").forEach(t=>{t.dataset.originalVariant||(t.dataset.originalVariant=t.variant);const o=t.dataset.originalVariant;e===hs.HORIZONTAL&&o===hs.HORIZONTAL?t.variant="horizontal":t.variant="vertical"})})}_resizeObserverCallback(e){let t=0;for(const s of e)t=s.contentRect.width;const o=t<this.breakpoint?hs.VERTICAL:hs.HORIZONTAL;o!==this._currentFormGroupLayout&&(this._toggleCompactLayout(o),this._currentFormGroupLayout=o)}_activateResponsiveLayout(){this._resizeObserver=new ResizeObserver(this._resizeObserverCallbackBound),this._resizeObserver.observe(this._wrapperElement)}_deactivateResizeObserver(){this._resizeObserver?.disconnect(),this._resizeObserver=null}firstUpdated(){this._firstUpdateComplete=!0,this._responsive&&this._activateResponsiveLayout()}render(){return Nt`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};vs.styles=ds,us([ao({type:Boolean,reflect:!0})],vs.prototype,"responsive",null),us([ao({type:Number})],vs.prototype,"breakpoint",void 0),us([ho(".wrapper")],vs.prototype,"_wrapperElement",void 0),us([uo({selector:"vscode-form-group"})],vs.prototype,"_assignedFormGroups",void 0),vs=us([mo("vscode-form-container")],vs),We({tagName:"vscode-form-container",elementClass:vs,react:E,displayName:"VscodeFormContainer"});const fs=[_o,Qe`
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
  `];var bs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let gs=class extends go{constructor(){super(...arguments),this.variant="horizontal"}render(){return Nt`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};gs.styles=fs,bs([ao({reflect:!0})],gs.prototype,"variant",void 0),gs=bs([mo("vscode-form-group")],gs),We({tagName:"vscode-form-group",elementClass:gs,react:E,displayName:"VscodeFormGroup"});const ms=[_o,Qe`
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
  `];let _s;"undefined"!=typeof CSSStyleSheet&&(_s=new CSSStyleSheet,_s.replaceSync("\n    vscode-form-helper * {\n      margin: 0;\n    }\n\n    vscode-form-helper *:not(:last-child) {\n      margin-bottom: 8px;\n    }\n  "));let ys=class extends go{constructor(){super(),this._injectLightDOMStyles()}_injectLightDOMStyles(){if("undefined"==typeof document||!_s)return;document.adoptedStyleSheets.find(e=>e===_s)||document.adoptedStyleSheets.push(_s)}render(){return Nt`<slot></slot>`}};ys.styles=ms,ys=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r}([mo("vscode-form-helper")],ys),We({tagName:"vscode-form-helper",elementClass:ys,react:E,displayName:"VscodeFormHelper"}),We({tagName:"vscode-icon",elementClass:No,react:E,displayName:"VscodeIcon"});let xs=0;const ws=(e="")=>(xs++,`${e}${xs}`),Cs=[_o,Qe`
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
      line-height: ${yo};
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
  `];var Ss=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ks=class extends go{constructor(){super(...arguments),this.required=!1,this._id="",this._htmlFor="",this._connected=!1}set htmlFor(e){this._htmlFor=e,this.setAttribute("for",e),this._connected&&this._connectWithTarget()}get htmlFor(){return this._htmlFor}set id(e){this._id=e}get id(){return this._id}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o)}connectedCallback(){super.connectedCallback(),this._connected=!0,""===this._id&&(this._id=ws("vscode-label-"),this.setAttribute("id",this._id)),this._connectWithTarget()}_getTarget(){let e=null;if(this._htmlFor){const t=this.getRootNode({composed:!1});t&&(e=t.querySelector(`#${this._htmlFor}`))}return e}async _connectWithTarget(){await this.updateComplete;const e=this._getTarget();["vscode-radio-group","vscode-checkbox-group"].includes(e?.tagName.toLowerCase()??"")&&e.setAttribute("aria-labelledby",this._id);let t="";this.textContent&&(t=this.textContent.trim()),e&&"label"in e&&["vscode-textfield","vscode-textarea","vscode-single-select","vscode-multi-select"].includes(e?.tagName.toLowerCase()??"")&&(e.label=t)}_handleClick(){const e=this._getTarget();e&&"focus"in e&&e.focus()}render(){return Nt`
      <label
        class=${Po({wrapper:!0,required:this.required})}
        @click=${this._handleClick}
        ><slot></slot
      ></label>
    `}};ks.styles=Cs,Ss([ao({reflect:!0,attribute:"for"})],ks.prototype,"htmlFor",null),Ss([ao()],ks.prototype,"id",null),Ss([ao({type:Boolean,reflect:!0})],ks.prototype,"required",void 0),ks=Ss([mo("vscode-label")],ks),We({tagName:"vscode-label",elementClass:ks,react:E,displayName:"VscodeLabel"});const Es=Nt`
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
`,As=Lt`<svg
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
</svg>`,{I:Os}=Qt,Is=e=>e,$s=()=>document.createComment(""),Ps=(e,t,o)=>{const s=e._$AA.parentNode,i=void 0===t?e._$AB:t._$AA;if(void 0===o){const t=s.insertBefore($s(),i),n=s.insertBefore($s(),i);o=new Os(t,n,e,e.options)}else{const t=o._$AB.nextSibling,n=o._$AM,r=n!==e;if(r){let t;o._$AQ?.(e),o._$AM=e,void 0!==o._$AP&&(t=e._$AU)!==n._$AU&&o._$AP(t)}if(t!==i||r){let e=o._$AA;for(;e!==t;){const t=Is(e).nextSibling;Is(s).insertBefore(e,i),e=t}}}return o},Rs=(e,t,o=e)=>(e._$AI(t,o),e),Bs={},Ds=e=>{e._$AR(),e._$AA.remove()},Ms=(e,t,o)=>{const s=new Map;for(let i=t;i<=o;i++)s.set(e[i],i);return s},Ts=Io(class extends $o{constructor(e){if(super(e),e.type!==Ao)throw Error("repeat() can only be used in text expressions")}dt(e,t,o){let s;void 0===o?o=t:void 0!==t&&(s=t);const i=[],n=[];let r=0;for(const a of e)i[r]=s?s(a,r):r,n[r]=o(a,r),r++;return{values:n,keys:i}}render(e,t,o){return this.dt(e,t,o).values}update(e,[t,o,s]){const i=e._$AH,{values:n,keys:r}=this.dt(t,o,s);if(!Array.isArray(i))return this.ut=r,n;const a=this.ut??(this.ut=[]),l=[];let c,d,h=0,p=i.length-1,u=0,v=n.length-1;for(;h<=p&&u<=v;)if(null===i[h])h++;else if(null===i[p])p--;else if(a[h]===r[u])l[u]=Rs(i[h],n[u]),h++,u++;else if(a[p]===r[v])l[v]=Rs(i[p],n[v]),p--,v--;else if(a[h]===r[v])l[v]=Rs(i[h],n[v]),Ps(e,l[v+1],i[h]),h++,v--;else if(a[p]===r[u])l[u]=Rs(i[p],n[u]),Ps(e,i[h],i[p]),p--,u++;else if(void 0===c&&(c=Ms(r,u,v),d=Ms(a,h,p)),c.has(a[h]))if(c.has(a[p])){const t=d.get(r[u]),o=void 0!==t?i[t]:null;if(null===o){const t=Ps(e,i[h]);Rs(t,n[u]),l[u]=t}else l[u]=Rs(o,n[u]),Ps(e,i[h],o),i[t]=null;u++}else Ds(i[p]),p--;else Ds(i[h]),h++;for(;u<=v;){const t=Ps(e,l[v+1]);Rs(t,n[u]),l[u++]=t}for(;h<=p;){const e=i[h++];null!==e&&Ds(e)}return this.ut=r,((e,t=Bs)=>{e._$AH=t})(e,l),jt}});var Ns=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Ls=class extends go{constructor(){super(...arguments),this.description="",this.selected=!1,this.disabled=!1,this._initialized=!1,this._handleSlotChange=()=>{this._initialized&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._initialized=!0})}willUpdate(e){this._initialized&&(e.has("description")||e.has("value")||e.has("selected")||e.has("disabled"))&&this.dispatchEvent(new Event("vsc-option-state-change",{bubbles:!0}))}render(){return Nt`<slot @slotchange=${this._handleSlotChange}></slot>`}};Ls.styles=_o,Ns([ao({type:String})],Ls.prototype,"value",void 0),Ns([ao({type:String})],Ls.prototype,"description",void 0),Ns([ao({type:Boolean,reflect:!0})],Ls.prototype,"selected",void 0),Ns([ao({type:Boolean,reflect:!0})],Ls.prototype,"disabled",void 0),Ls=Ns([mo("vscode-option")],Ls);const js=(e,t)=>{const o={match:!1,ranges:[]},s=e.toLowerCase(),i=t.toLowerCase(),n=s.split(" ");let r=0;return n.forEach((t,s)=>{if(s>0&&(r+=n[s-1].length+1),o.match)return;const a=t.indexOf(i),l=i.length;0===a&&(o.match=!0,o.ranges.push([r+a,Math.min(r+a+l,e.length)]))}),o},Vs=(e,t)=>{const o={match:!1,ranges:[]};return 0===e.toLowerCase().indexOf(t.toLowerCase())&&(o.match=!0,o.ranges=[[0,t.length]]),o},zs=(e,t)=>{const o={match:!1,ranges:[]},s=e.toLowerCase().indexOf(t.toLowerCase());return s>-1&&(o.match=!0,o.ranges=[[s,s+t.length]]),o},Fs=(e,t)=>{const o={match:!1,ranges:[]};let s=0,i=0;const n=t.length-1,r=e.toLowerCase(),a=t.toLowerCase();for(let l=0;l<=n;l++){if(i=r.indexOf(a[l],s),-1===i)return{match:!1,ranges:[]};o.match=!0,o.ranges.push([i,i+1]),s=i+1}return o},Hs=e=>{const t=[];return" "===e?(t.push(Nt`&nbsp;`),t):(0===e.indexOf(" ")&&t.push(Nt`&nbsp;`),t.push(Nt`${e.trimStart().trimEnd()}`),e.lastIndexOf(" ")===e.length-1&&t.push(Nt`&nbsp;`),t)};class Us{constructor(e){this._activeIndex=-1,this._options=[],this._filterPattern="",this._filterMethod="fuzzy",this._combobox=!1,this._indexByValue=new Map,this._indexByLabel=new Map,this._selectedIndex=-1,this._selectedIndexes=new Set,this._multiSelect=!1,this._numOfVisibleOptions=0,(this._host=e).addController(this)}hostConnected(){}get activeIndex(){return this._activeIndex}set activeIndex(e){this._activeIndex=e,this._host.requestUpdate()}get relativeActiveIndex(){return this._options[this._activeIndex]?.filteredIndex??-1}set comboboxMode(e){this._combobox=e,this._host.requestUpdate()}get comboboxMode(){return this._combobox}get multiSelect(){return this._multiSelect}set multiSelect(e){this._selectedIndex=-1,this._selectedIndexes.clear(),this._multiSelect=e,this._host.requestUpdate()}get selectedIndex(){return this._selectedIndex}set selectedIndex(e){var t;-1!==this._selectedIndex&&this._options[this._selectedIndex]&&((t=this._options[this._selectedIndex]).selected??(t.selected=!1));const o=this.getOptionByIndex(e);this._selectedIndex=o?e:-1,this._host.requestUpdate()}get selectedIndexes(){return Array.from(this._selectedIndexes)}set selectedIndexes(e){this._selectedIndexes.forEach(e=>{this._options[e].selected=!1}),this._selectedIndexes=new Set(e),e.forEach(e=>{void 0!==this._options[e]&&(this._options[e].selected=!0)}),this._host.requestUpdate()}set value(e){if(this._multiSelect){const t=e.map(e=>this._indexByValue.get(e)).filter(e=>void 0!==e);this._selectedIndexes=new Set(t)}else this._selectedIndex=this._indexByValue.get(e)??-1;this._host.requestUpdate()}get value(){return this._multiSelect?this._selectedIndexes.size>0?Array.from(this._selectedIndexes).filter(e=>e>=0&&e<this._options.length).map(e=>this._options[e].value):[]:this._selectedIndex>-1&&this._selectedIndex<this._options.length?this._options[this._selectedIndex].value:""}set multiSelectValue(e){const t=e.map(e=>this._indexByValue.get(e)).filter(e=>void 0!==e);this._selectedIndexes=new Set(t)}get multiSelectValue(){return this._selectedIndexes.size>0?Array.from(this._selectedIndexes).map(e=>this._options[e].value):[]}get filterPattern(){return this._filterPattern}set filterPattern(e){e!==this._filterPattern&&(this._filterPattern=e,this._updateState())}get filterMethod(){return this._filterMethod}set filterMethod(e){e!==this._filterMethod&&(this._filterMethod=e,this._updateState())}get options(){return this._options}get numOfVisibleOptions(){return this._numOfVisibleOptions}get numOptions(){return this._options.length}populate(e){this._indexByValue.clear(),this._indexByLabel.clear(),this._options=e.map((e,t)=>(this._indexByValue.set(e.value??"",t),this._indexByLabel.set(e.label??"",t),{description:e.description??"",disabled:e.disabled??!1,label:e.label??"",selected:e.selected??!1,value:e.value??"",index:t,filteredIndex:t,ranges:[],visible:!0})),this._numOfVisibleOptions=this._options.length}add(e){const t=this._options.length,{description:o,disabled:s,label:i,selected:n,value:r}=e;let a=!0,l=[];if(this._combobox&&""!==this._filterPattern){const e=this._searchByPattern(i??"");a=e.match,l=e.ranges}this._indexByValue.set(r??"",t),this._indexByLabel.set(i??"",t),n&&(this._selectedIndex=t,this._selectedIndexes.add(t),this._activeIndex=t),this._options.push({index:t,filteredIndex:t,description:o??"",disabled:s??!1,label:i??"",selected:n??!1,value:r??"",visible:a,ranges:l}),a&&(this._numOfVisibleOptions+=1)}clear(){this._options=[],this._indexByValue.clear(),this._indexByLabel.clear(),this._numOfVisibleOptions=0,this._selectedIndex=-1,this._selectedIndexes.clear(),this._activeIndex=-1}getIsIndexSelected(e){return this._multiSelect?this._selectedIndexes.has(e):this._selectedIndex===e}expandMultiSelection(e){e.forEach(e=>{const t=this._indexByValue.get(e)??-1;-1!==t&&this._selectedIndexes.add(t)}),this._host.requestUpdate()}toggleActiveMultiselectOption(){const e=this._options[this._activeIndex]??null;if(!e)return;this._selectedIndexes.has(e.index)?this._selectedIndexes.delete(e.index):this._selectedIndexes.add(e.index),this._host.requestUpdate()}toggleOptionSelected(e){const t=this._selectedIndexes.has(e);this._options[e].selected=!this._options[e].selected,t?this._selectedIndexes.delete(e):this._selectedIndexes.add(e),this._host.requestUpdate()}getActiveOption(){return this._options[this._activeIndex]??null}getSelectedOption(){return this._options[this._selectedIndex]??null}getOptionByIndex(e){return this._options[e]??null}findOptionIndex(e){return this._indexByValue.get(e)??-1}getOptionByValue(e,t=!1){const o=this._indexByValue.get(e)??-1;return-1===o?null:t||this._options[o].visible?this._options[o]:null}getOptionByLabel(e){const t=this._indexByLabel.get(e)??-1;return-1===t?null:this._options[t]}next(e){let t=-1;for(let o=(e??this._activeIndex)+1;o<this._options.length;o++)if(this._options[o]&&!this._options[o].disabled&&this._options[o].visible){t=o;break}return t>-1?this._options[t]:null}prev(e){let t=-1;for(let o=(e??this._activeIndex)-1;o>=0;o--)if(this._options[o]&&!this._options[o].disabled&&this._options[o].visible){t=o;break}return t>-1?this._options[t]:null}activateDefault(){if(this._multiSelect){if(this._selectedIndexes.size>0){const e=this._selectedIndexes.values().next();this._activeIndex=e.value?e.value:0}}else this._selectedIndex>-1?this._activeIndex=this._selectedIndex:this._activeIndex=0;this._host.requestUpdate()}selectAll(){this._multiSelect&&(this._options.forEach((e,t)=>{this._options[t].selected=!0,this._selectedIndexes.add(t)}),this._host.requestUpdate())}selectNone(){this._multiSelect&&(this._options.forEach((e,t)=>{this._options[t].selected=!1}),this._selectedIndexes.clear(),this._host.requestUpdate())}_searchByPattern(e){let t;switch(this._filterMethod){case"startsWithPerTerm":t=js(e,this._filterPattern);break;case"startsWith":t=Vs(e,this._filterPattern);break;case"contains":t=zs(e,this._filterPattern);break;default:t=Fs(e,this._filterPattern)}return t}_updateState(){if(this._combobox&&""!==this._filterPattern){let e=-1;this._numOfVisibleOptions=0,this._options.forEach(({label:t},o)=>{const s=this._searchByPattern(t);this._options[o].visible=s.match,this._options[o].ranges=s.ranges,this._options[o].filteredIndex=s.match?++e:-1,s.match&&(this._numOfVisibleOptions+=1)})}else this._options.forEach((e,t)=>{this._options[t].visible=!0,this._options[t].ranges=[]}),this._numOfVisibleOptions=this._options.length;this._host.requestUpdate()}}const qs=[_o,Qe`
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
  `];var Ws=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Ks=class extends go{set scrollPos(e){this._scrollPos=this._limitScrollPos(e),this._updateScrollbar(),this._updateThumbPosition(),this.requestUpdate()}get scrollPos(){return this._scrollPos}get scrollMax(){return this._scrollableContainer?this._scrollableContainer.scrollHeight-this._scrollableContainer.clientHeight:0}constructor(){super(),this.alwaysVisible=!1,this.fastScrollSensitivity=5,this.minThumbSize=20,this.mouseWheelScrollSensitivity=1,this.shadow=!0,this.scrolled=!1,this._scrollPos=0,this._isDragging=!1,this._thumbHeight=0,this._thumbY=0,this._thumbVisible=!1,this._thumbFade=!1,this._thumbActive=!1,this._componentHeight=0,this._contentHeight=0,this._scrollThumbStartY=0,this._mouseStartY=0,this._scrollbarVisible=!0,this._scrollbarTrackZ=0,this._resizeObserverCallback=()=>{this._componentHeight=this.offsetHeight,this._contentHeight=this._contentElement.offsetHeight,this._updateScrollbar(),this._updateThumbPosition()},this._handleSlotChange=()=>{this._updateScrollbar(),this._updateThumbPosition(),this._zIndexFix()},this._handleScrollThumbMouseMove=e=>{const t=this._scrollThumbStartY+(e.screenY-this._mouseStartY);this._thumbY=this._limitThumbPos(t),this.scrollPos=this._calculateScrollPosFromThumbPos(this._thumbY),this.dispatchEvent(new CustomEvent("vsc-scrollable-scroll",{detail:this.scrollPos}))},this._handleScrollThumbMouseUp=e=>{this._isDragging=!1,this._thumbActive=!1;const t=this.getBoundingClientRect(),{x:o,y:s,width:i,height:n}=t,{pageX:r,pageY:a}=e;(r>o+i||r<o||a>s+n||a<s)&&(this._thumbFade=!0,this._thumbVisible=!1),document.removeEventListener("mousemove",this._handleScrollThumbMouseMove),document.removeEventListener("mouseup",this._handleScrollThumbMouseUp)},this._handleComponentMouseOver=()=>{this._thumbVisible=!0,this._thumbFade=!1},this._handleComponentMouseOut=()=>{this._thumbActive||(this._thumbVisible=!1,this._thumbFade=!0)},this._handleComponentWheel=e=>{if(this._contentHeight<=this._componentHeight)return;e.preventDefault();const t=e.altKey?this.mouseWheelScrollSensitivity*this.fastScrollSensitivity:this.mouseWheelScrollSensitivity;this.scrollPos=this._limitScrollPos(this.scrollPos+e.deltaY*t),this.dispatchEvent(new CustomEvent("vsc-scrollable-scroll",{detail:this.scrollPos}))},this._handleScrollableContainerScroll=e=>{e.currentTarget&&(this.scrollPos=e.currentTarget.scrollTop)},this.addEventListener("mouseover",this._handleComponentMouseOver),this.addEventListener("mouseout",this._handleComponentMouseOut),this.addEventListener("wheel",this._handleComponentWheel)}connectedCallback(){super.connectedCallback(),this._hostResizeObserver=new ResizeObserver(this._resizeObserverCallback),this._contentResizeObserver=new ResizeObserver(this._resizeObserverCallback),this.requestUpdate(),this.updateComplete.then(()=>{this._hostResizeObserver.observe(this),this._contentResizeObserver.observe(this._contentElement),this._updateThumbPosition()})}disconnectedCallback(){super.disconnectedCallback(),this._hostResizeObserver.unobserve(this),this._hostResizeObserver.disconnect(),this._contentResizeObserver.unobserve(this._contentElement),this._contentResizeObserver.disconnect()}firstUpdated(e){this._updateThumbPosition()}_calcThumbHeight(){const e=this.offsetHeight,t=e*(e/(this._contentElement?.offsetHeight??0));return Math.max(this.minThumbSize,t)}_updateScrollbar(){const e=this._contentElement?.offsetHeight??0;this.offsetHeight>=e?this._scrollbarVisible=!1:(this._scrollbarVisible=!0,this._thumbHeight=this._calcThumbHeight()),this.requestUpdate()}_zIndexFix(){let e=0;this._assignedElements.forEach(t=>{if("style"in t){const o=window.getComputedStyle(t).zIndex;/([0-9-])+/g.test(o)&&(e=Number(o)>e?Number(o):e)}}),this._scrollbarTrackZ=e+1,this.requestUpdate()}_updateThumbPosition(){if(!this._scrollableContainer)return;this.scrolled=this.scrollPos>0;const e=this.offsetHeight,t=this._thumbHeight,o=this._contentElement.offsetHeight-e,s=this.scrollPos/o,i=e-t;this._thumbY=Math.min(s*(e-t),i)}_calculateScrollPosFromThumbPos(e){const t=this.getBoundingClientRect().height,o=e/(t-this._scrollThumbElement.getBoundingClientRect().height)*(this._contentElement.getBoundingClientRect().height-t);return this._limitScrollPos(o)}_limitScrollPos(e){return e<0?0:e>this.scrollMax?this.scrollMax:e}_limitThumbPos(e){const t=this.getBoundingClientRect().height,o=this._scrollThumbElement.getBoundingClientRect().height;return e<0?0:e>t-o?t-o:e}_handleScrollThumbMouseDown(e){const t=this.getBoundingClientRect(),o=this._scrollThumbElement.getBoundingClientRect();this._mouseStartY=e.screenY,this._scrollThumbStartY=o.top-t.top,this._isDragging=!0,this._thumbActive=!0,document.addEventListener("mousemove",this._handleScrollThumbMouseMove),document.addEventListener("mouseup",this._handleScrollThumbMouseUp)}_handleScrollbarTrackPress(e){e.target===e.currentTarget&&(this._thumbY=e.offsetY-this._thumbHeight/2,this.scrollPos=this._calculateScrollPosFromThumbPos(this._thumbY))}render(){return Nt`
      <div
        class="scrollable-container"
        .style=${Bo({userSelect:this._isDragging?"none":"auto"})}
        .scrollTop=${this.scrollPos}
        @scroll=${this._handleScrollableContainerScroll}
      >
        <div
          class=${Po({shadow:!0,visible:this.scrolled})}
          .style=${Bo({zIndex:String(this._scrollbarTrackZ)})}
        ></div>
        ${this._isDragging?Nt`<div class="prevent-interaction"></div>`:Vt}
        <div
          class=${Po({"scrollbar-track":!0,hidden:!this._scrollbarVisible})}
          @mousedown=${this._handleScrollbarTrackPress}
        >
          <div
            class=${Po({"scrollbar-thumb":!0,visible:!!this.alwaysVisible||this._thumbVisible,fade:!this.alwaysVisible&&this._thumbFade,active:this._thumbActive})}
            .style=${Bo({height:`${this._thumbHeight}px`,top:`${this._thumbY}px`})}
            @mousedown=${this._handleScrollThumbMouseDown}
          ></div>
        </div>
        <div class="content">
          <slot @slotchange=${this._handleSlotChange}></slot>
        </div>
      </div>
    `}};Ks.styles=qs,Ws([ao({type:Boolean,reflect:!0,attribute:"always-visible"})],Ks.prototype,"alwaysVisible",void 0),Ws([ao({type:Number,attribute:"fast-scroll-sensitivity"})],Ks.prototype,"fastScrollSensitivity",void 0),Ws([ao({type:Number,attribute:"min-thumb-size"})],Ks.prototype,"minThumbSize",void 0),Ws([ao({type:Number,attribute:"mouse-wheel-scroll-sensitivity"})],Ks.prototype,"mouseWheelScrollSensitivity",void 0),Ws([ao({type:Boolean,reflect:!0})],Ks.prototype,"shadow",void 0),Ws([ao({type:Boolean,reflect:!0})],Ks.prototype,"scrolled",void 0),Ws([ao({type:Number,attribute:"scroll-pos"})],Ks.prototype,"scrollPos",null),Ws([lo()],Ks.prototype,"_isDragging",void 0),Ws([lo()],Ks.prototype,"_thumbHeight",void 0),Ws([lo()],Ks.prototype,"_thumbY",void 0),Ws([lo()],Ks.prototype,"_thumbVisible",void 0),Ws([lo()],Ks.prototype,"_thumbFade",void 0),Ws([lo()],Ks.prototype,"_thumbActive",void 0),Ws([ho(".content")],Ks.prototype,"_contentElement",void 0),Ws([ho(".scrollbar-thumb",!0)],Ks.prototype,"_scrollThumbElement",void 0),Ws([ho(".scrollable-container")],Ks.prototype,"_scrollableContainer",void 0),Ws([uo()],Ks.prototype,"_assignedElements",void 0),Ks=Ws([mo("vscode-scrollable")],Ks);var Gs=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const Ys=22;class Xs extends go{set combobox(e){this._opts.comboboxMode=e}get combobox(){return this._opts.comboboxMode}set disabled(e){this._disabled=e,this.ariaDisabled=e?"true":"false",!0===e?(this._originalTabIndex=this.tabIndex,this.tabIndex=-1):(this.tabIndex=this._originalTabIndex??0,this._originalTabIndex=void 0),this.requestUpdate()}get disabled(){return this._disabled}set filter(e){let t;["contains","fuzzy","startsWith","startsWithPerTerm"].includes(e)?t=e:(this.warn(`Invalid filter: "${e}", fallback to default. Valid values are: "contains", "fuzzy", "startsWith", "startsWithPerm".`),t="fuzzy"),this._opts.filterMethod=t}get filter(){return this._opts.filterMethod}set options(e){this._opts.populate(e)}get options(){return this._opts.options.map(({label:e,value:t,description:o,selected:s,disabled:i})=>({label:e,value:t,description:o,selected:s,disabled:i}))}constructor(){super(),this.creatable=!1,this.label="",this.invalid=!1,this.focused=!1,this.open=!1,this.position="below",this._prevXPos=0,this._prevYPos=0,this._opts=new Us(this),this._firstUpdateCompleted=!1,this._currentDescription="",this._filter="fuzzy",this._selectedIndexes=[],this._options=[],this._value="",this._values=[],this._isPlaceholderOptionActive=!1,this._isBeingFiltered=!1,this._optionListScrollPos=0,this._isHoverForbidden=!1,this._disabled=!1,this._originalTabIndex=void 0,this._onMouseMove=()=>{this._isHoverForbidden=!1,window.removeEventListener("mousemove",this._onMouseMove)},this._onOptionListScroll=e=>{this._optionListScrollPos=e.detail},this._onComponentKeyDown=e=>{[" ","ArrowUp","ArrowDown","Escape"].includes(e.key)&&(e.stopPropagation(),e.preventDefault()),"Enter"===e.key&&this._onEnterKeyDown(e)," "===e.key&&this._onSpaceKeyDown(),"Escape"===e.key&&this._onEscapeKeyDown(),"ArrowUp"===e.key&&this._onArrowUpKeyDown(),"ArrowDown"===e.key&&this._onArrowDownKeyDown()},this._onComponentFocus=()=>{this.focused=!0},this._onComponentBlur=()=>{this.focused=!1},this._handleWindowScroll=()=>{const{x:e,y:t}=this.getBoundingClientRect();e===this._prevXPos&&t===this._prevYPos||(this.open=!1)},this.addEventListener("vsc-option-state-change",e=>{e.stopPropagation(),this._setStateFromSlottedElements(),this.requestUpdate()})}connectedCallback(){super.connectedCallback(),this.addEventListener("keydown",this._onComponentKeyDown),this.addEventListener("focus",this._onComponentFocus),this.addEventListener("blur",this._onComponentBlur),this._setAutoFocus()}disconnectedCallback(){super.disconnectedCallback(),this.removeEventListener("keydown",this._onComponentKeyDown),this.removeEventListener("focus",this._onComponentFocus),this.removeEventListener("blur",this._onComponentBlur)}firstUpdated(e){this._firstUpdateCompleted=!0}willUpdate(e){if(e.has("required")&&this._firstUpdateCompleted&&this._manageRequired(),e.has("open")&&this._firstUpdateCompleted)if(this.open){this._dropdownEl.showPopover();const{x:e,y:t}=this.getBoundingClientRect();this._prevXPos=e,this._prevYPos=t,window.addEventListener("scroll",this._handleWindowScroll,{capture:!0}),this._opts.activateDefault(),this._scrollActiveElementToTop()}else this._dropdownEl.hidePopover(),window.removeEventListener("scroll",this._handleWindowScroll)}get _filteredOptions(){return this.combobox&&""!==this._opts.filterPattern?((e,t,o)=>{const s=[];return e.forEach(e=>{let i;switch(o){case"startsWithPerTerm":i=js(e.label,t);break;case"startsWith":i=Vs(e.label,t);break;case"contains":i=zs(e.label,t);break;default:i=Fs(e.label,t)}i.match&&s.push({...e,ranges:i.ranges})}),s})(this._options,this._opts.filterPattern,this._filter):this._options}_setAutoFocus(){this.hasAttribute("autofocus")&&(this.tabIndex<0&&(this.tabIndex=0),this.combobox?this.updateComplete.then(()=>{this.shadowRoot?.querySelector(".combobox-input").focus()}):this.updateComplete.then(()=>{this.shadowRoot?.querySelector(".select-face").focus()}))}get _isSuggestedOptionVisible(){if(!this.combobox||!this.creatable)return!1;const e=null!==this._opts.getOptionByValue(this._opts.filterPattern),t=this._opts.filterPattern.length>0;return!e&&t}_manageRequired(){}_setStateFromSlottedElements(){const e=this._assignedOptions??[];this._opts.clear(),e.forEach(e=>{const{innerText:t,description:o,disabled:s}=e,i="string"==typeof e.value?e.value:t.trim(),n=e.selected??!1,r={label:t.trim(),value:i,description:o,selected:n,disabled:s};this._opts.add(r)})}_createSuggestedOption(){const e=this._opts.numOptions,t=document.createElement("vscode-option");return t.value=this._opts.filterPattern,to(this._opts.filterPattern,t),this.appendChild(t),e}_dispatchChangeEvent(){this.dispatchEvent(new Event("change")),this.dispatchEvent(new Event("input"))}async _createAndSelectSuggestedOption(){}_toggleComboboxDropdown(){this._opts.filterPattern="",this.open=!this.open}_scrollActiveElementToTop(){this._optionListScrollPos=Math.floor(this._opts.relativeActiveIndex*Ys)}async _adjustOptionListScrollPos(e,t){let o=this._opts.numOfVisibleOptions;if(this._isSuggestedOptionVisible&&(o+=1),o<=10)return;this._isHoverForbidden=!0,window.addEventListener("mousemove",this._onMouseMove);const s=this._optionListScrollPos,i=t*Ys,n=i>=s&&i<=s+220-Ys;"down"===e&&(n||(this._optionListScrollPos=t*Ys-198)),"up"===e&&(n||(this._optionListScrollPos=Math.floor(this._opts.relativeActiveIndex*Ys)))}_onFaceClick(){this.open=!this.open}_handleDropdownToggle(e){this.open="open"===e.newState}_onComboboxButtonClick(){this._toggleComboboxDropdown()}_onComboboxButtonKeyDown(e){"Enter"===e.key&&this._toggleComboboxDropdown()}_onOptionMouseOver(e){if(this._isHoverForbidden)return;const t=e.target;t.matches(".option")&&(t.matches(".placeholder")?(this._isPlaceholderOptionActive=!0,this._opts.activeIndex=-1):(this._isPlaceholderOptionActive=!1,this._opts.activeIndex=+t.dataset.index))}_onPlaceholderOptionMouseOut(){this._isPlaceholderOptionActive=!1}_onNoOptionsClick(e){e.stopPropagation()}_onEnterKeyDown(e){this._isBeingFiltered=!1;!!e?.composedPath&&e.composedPath().find(e=>!!e.matches&&e.matches("vscode-button.button-accept"))}_onSpaceKeyDown(){this.open||(this.open=!0)}_onArrowUpKeyDown(){if(this.open){if(this._opts.activeIndex<=0&&(!this.combobox||!this.creatable))return;if(this._isPlaceholderOptionActive){const e=this._opts.numOfVisibleOptions-1;this._opts.activeIndex=e,this._isPlaceholderOptionActive=!1}else{const e=this._opts.prev();if(null!==e){this._opts.activeIndex=e?.index??-1;const t=e?.filteredIndex??-1;t>-1&&this._adjustOptionListScrollPos("up",t)}}}else this.open=!0,this._opts.activateDefault()}_onArrowDownKeyDown(){let e=this._opts.numOfVisibleOptions;const t=this._isSuggestedOptionVisible;if(t&&(e+=1),this.open){if(this._isPlaceholderOptionActive&&-1===this._opts.activeIndex)return;const o=this._opts.next();if(t&&null===o)this._isPlaceholderOptionActive=!0,this._adjustOptionListScrollPos("down",e-1),this._opts.activeIndex=-1;else if(null!==o){const e=o?.filteredIndex??-1;this._opts.activeIndex=o?.index??-1,e>-1&&this._adjustOptionListScrollPos("down",e)}}else this.open=!0,this._opts.activateDefault()}_onEscapeKeyDown(){this.open=!1}_onSlotChange(){this._setStateFromSlottedElements(),this.requestUpdate()}_onComboboxInputFocus(e){e.target.select(),this._isBeingFiltered=!1,this._opts.filterPattern=""}_onComboboxInputBlur(){this._isBeingFiltered=!1}_onComboboxInputInput(e){this._isBeingFiltered=!0,this._opts.filterPattern=e.target.value,this._opts.activeIndex=-1,this.open=!0}_onComboboxInputClick(){this._isBeingFiltered=""!==this._opts.filterPattern,this.open=!0}_onComboboxInputSpaceKeyDown(e){" "===e.key&&e.stopPropagation()}_onOptionClick(e){this._isBeingFiltered=!1}_renderCheckbox(e,t){return Nt`<span class=${Po({"checkbox-icon":!0,checked:e})}>${As}</span
      ><span class="option-label">${t}</span>`}_renderOptions(){const e=this._opts.options;return Nt`
      <ul
        aria-label=${Ro(this.label??void 0)}
        aria-multiselectable=${Ro(this._opts.multiSelect?"true":void 0)}
        class="options"
        id="select-listbox"
        role="listbox"
        tabindex="-1"
        @click=${this._onOptionClick}
        @mouseover=${this._onOptionMouseOver}
      >
        ${Ts(e,e=>e.index,(e,t)=>{if(!e.visible)return Vt;const o=e.index===this._opts.activeIndex&&!e.disabled,s=this._opts.getIsIndexSelected(e.index),i={active:o,disabled:e.disabled,option:!0,"single-select":!this._opts.multiSelect,"multi-select":this._opts.multiSelect,selected:s},n=e.ranges?.length?((e,t)=>{const o=[],s=t.length;return s<1?Nt`${e}`:(t.forEach((i,n)=>{const r=e.substring(i[0],i[1]);0===n&&0!==i[0]&&o.push(...Hs(e.substring(0,t[0][0]))),n>0&&n<s&&i[0]-t[n-1][1]!==0&&o.push(...Hs(e.substring(t[n-1][1],i[0]))),o.push(Nt`<b>${Hs(r)}</b>`),n===s-1&&i[1]<e.length&&o.push(...Hs(e.substring(i[1],e.length)))}),o)})(e.label,e.ranges??[]):e.label;return Nt`
              <li
                aria-selected=${s?"true":"false"}
                class=${Po(i)}
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
    `}_renderPlaceholderOption(e){if(!this.combobox)return Vt;return this._opts.getOptionByLabel(this._opts.filterPattern)?Vt:this.creatable&&this._opts.filterPattern.length>0?Nt`<li
        class=${Po({option:!0,placeholder:!0,active:this._isPlaceholderOptionActive})}
        @mouseout=${this._onPlaceholderOptionMouseOut}
      >
        Add "${this._opts.filterPattern}"
      </li>`:e?Nt`<li class="no-options" @click=${this._onNoOptionsClick}>
            No options
          </li>`:Vt}_renderDescription(){const e=this._opts.getActiveOption();if(!e)return Vt;const{description:t}=e;return t?Nt`<div class="description">${t}</div>`:Vt}_renderSelectFace(){return Nt`${Vt}`}_renderComboboxFace(){return Nt`${Vt}`}_renderDropdownControls(){return Nt`${Vt}`}_renderDropdown(){const e={dropdown:!0,multiple:this._opts.multiSelect,open:this.open},t=this._isSuggestedOptionVisible||0===this._opts.numOfVisibleOptions?this._opts.numOfVisibleOptions+1:this._opts.numOfVisibleOptions,o=Math.min(t*Ys,220),s=this.getBoundingClientRect(),i={width:`${s.width}px`,left:`${s.left}px`,top:"below"===this.position?`${s.top+s.height}px`:"unset",bottom:"below"===this.position?"unset":document.documentElement.clientHeight-s.top+"px"};return Nt`
      <div
        class=${Po(e)}
        popover="auto"
        @toggle=${this._handleDropdownToggle}
        .style=${Bo(i)}
      >
        ${"above"===this.position?this._renderDescription():Vt}
        <vscode-scrollable
          always-visible
          class="scrollable"
          min-thumb-size="40"
          tabindex="-1"
          @vsc-scrollable-scroll=${this._onOptionListScroll}
          .scrollPos=${this._optionListScrollPos}
          .style=${Bo({height:`${o}px`})}
        >
          ${this._renderOptions()} ${this._renderDropdownControls()}
        </vscode-scrollable>
        ${"below"===this.position?this._renderDescription():Vt}
      </div>
    `}}Gs([ao({type:Boolean,reflect:!0})],Xs.prototype,"creatable",void 0),Gs([ao({type:Boolean,reflect:!0})],Xs.prototype,"combobox",null),Gs([ao({reflect:!0})],Xs.prototype,"label",void 0),Gs([ao({type:Boolean,reflect:!0})],Xs.prototype,"disabled",null),Gs([ao({type:Boolean,reflect:!0})],Xs.prototype,"invalid",void 0),Gs([ao()],Xs.prototype,"filter",null),Gs([ao({type:Boolean,reflect:!0})],Xs.prototype,"focused",void 0),Gs([ao({type:Boolean,reflect:!0})],Xs.prototype,"open",void 0),Gs([ao({type:Array})],Xs.prototype,"options",null),Gs([ao({reflect:!0})],Xs.prototype,"position",void 0),Gs([uo({flatten:!0,selector:"vscode-option"})],Xs.prototype,"_assignedOptions",void 0),Gs([ho(".dropdown",!0)],Xs.prototype,"_dropdownEl",void 0),Gs([lo()],Xs.prototype,"_currentDescription",void 0),Gs([lo()],Xs.prototype,"_filter",void 0),Gs([lo()],Xs.prototype,"_filteredOptions",null),Gs([lo()],Xs.prototype,"_selectedIndexes",void 0),Gs([lo()],Xs.prototype,"_options",void 0),Gs([lo()],Xs.prototype,"_value",void 0),Gs([lo()],Xs.prototype,"_values",void 0),Gs([lo()],Xs.prototype,"_isPlaceholderOptionActive",void 0),Gs([lo()],Xs.prototype,"_isBeingFiltered",void 0),Gs([lo()],Xs.prototype,"_optionListScrollPos",void 0);const Zs=[_o,Qe`
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
  `];var Js=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Qs=class extends Xs{set selectedIndexes(e){this._opts.selectedIndexes=e}get selectedIndexes(){return this._opts.selectedIndexes}set value(e){this._opts.multiSelectValue=e,this._opts.selectedIndexes.length>0?this._requestedValueToSetLater=[]:this._requestedValueToSetLater=Array.isArray(e)?e:[e],this._setFormValue(),this._manageRequired()}get value(){return this._opts.multiSelectValue}get form(){return this._internals.form}get type(){return"select-multiple"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}selectAll(){this._opts.selectAll()}selectNone(){this._opts.selectNone()}constructor(){super(),this.defaultValue=[],this.required=!1,this.name=void 0,this._requestedValueToSetLater=[],this._onOptionClick=e=>{const t=e.composedPath().find(e=>"matches"in e&&e.matches("li.option"));if(!t)return;if(t.classList.contains("placeholder"))return void this._createAndSelectSuggestedOption();const o=Number(t.dataset.index);this._opts.toggleOptionSelected(o),this._setFormValue(),this._manageRequired(),this._dispatchChangeEvent()},this._opts.multiSelect=!0,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._setDefaultValue(),this._manageRequired()})}formResetCallback(){this.updateComplete.then(()=>{this.value=this.defaultValue})}formStateRestoreCallback(e,t){const o=Array.from(e.entries()).map(e=>String(e[1]));this.updateComplete.then(()=>{this.value=o})}_setDefaultValue(){if(Array.isArray(this.defaultValue)&&this.defaultValue.length>0){const e=this.defaultValue.map(e=>String(e));this.value=e}}_dispatchChangeEvent(){super._dispatchChangeEvent()}_onFaceClick(){super._onFaceClick(),this._opts.activeIndex=0}_toggleComboboxDropdown(){super._toggleComboboxDropdown(),this._opts.activeIndex=-1}_manageRequired(){const{value:e}=this;0===e.length&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._faceElement):this._internals.setValidity({})}_setFormValue(){const e=new FormData;this._values.forEach(t=>{e.append(this.name??"",t)}),this._internals.setFormValue(e)}async _createAndSelectSuggestedOption(){super._createAndSelectSuggestedOption();const e=this._createSuggestedOption();await this.updateComplete,this.selectedIndexes=[...this.selectedIndexes,e],this._dispatchChangeEvent();const t=new CustomEvent("vsc-multi-select-create-option",{detail:{value:this._opts.getOptionByIndex(e)?.value??""}});this.dispatchEvent(t),this.open=!1,this._isPlaceholderOptionActive=!1}_onSlotChange(){super._onSlotChange(),this._requestedValueToSetLater.length>0&&(this._opts.expandMultiSelection(this._requestedValueToSetLater),this._requestedValueToSetLater=this._requestedValueToSetLater.filter(e=>-1===this._opts.findOptionIndex(e)))}_onEnterKeyDown(e){super._onEnterKeyDown(e),this.open?this._isPlaceholderOptionActive?this._createAndSelectSuggestedOption():(this._opts.toggleActiveMultiselectOption(),this._setFormValue(),this._manageRequired(),this._dispatchChangeEvent()):(this._opts.filterPattern="",this.open=!0)}_onMultiAcceptClick(){this.open=!1}_onMultiDeselectAllClick(){this._opts.selectedIndexes=[],this._values=[],this._options=this._options.map(e=>({...e,selected:!1})),this._manageRequired(),this._dispatchChangeEvent()}_onMultiSelectAllClick(){this._opts.selectedIndexes=[],this._values=[],this._options=this._options.map(e=>({...e,selected:!0})),this._options.forEach((e,t)=>{this._selectedIndexes.push(t),this._values.push(e.value),this._dispatchChangeEvent()}),this._setFormValue(),this._manageRequired()}_onComboboxInputBlur(){super._onComboboxInputBlur(),this._opts.filterPattern=""}_renderLabel(){return 0===this._opts.selectedIndexes.length?Nt`<span class="select-face-badge no-item">0 Selected</span>`:Nt`<span class="select-face-badge"
          >${this._opts.selectedIndexes.length} Selected</span
        >`}_renderComboboxFace(){const e=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",t=this.open?"true":"false";return Nt`
      <div class="combobox-face face">
        ${this._opts.multiSelect?this._renderLabel():Vt}
        <input
          aria-activedescendant=${e}
          aria-autocomplete="list"
          aria-controls="select-listbox"
          aria-expanded=${t}
          aria-haspopup="listbox"
          aria-label=${Ro(this.label)}
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
          ${Es}
        </button>
      </div>
    `}_renderSelectFace(){const e=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",t=this.open?"true":"false";return Nt`
      <div
        aria-activedescendant=${Ro(this._opts.multiSelect?void 0:e)}
        aria-controls="select-listbox"
        aria-expanded=${Ro(this._opts.multiSelect?void 0:t)}
        aria-haspopup="listbox"
        aria-label=${Ro(this.label??void 0)}
        class="select-face face multiselect"
        @click=${this._onFaceClick}
        .tabIndex=${this.disabled?-1:0}
      >
        ${this._renderLabel()} ${Es}
      </div>
    `}_renderDropdownControls(){return this._filteredOptions.length>0?Nt`
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
        `:Nt`${Vt}`}render(){return Nt`
      <div class="multi-select">
        <slot class="main-slot" @slotchange=${this._onSlotChange}></slot>
        ${this.combobox?this._renderComboboxFace():this._renderSelectFace()}
        ${this._renderDropdown()}
      </div>
    `}};Qs.styles=Zs,Qs.shadowRootOptions={...so.shadowRootOptions,delegatesFocus:!0},Qs.formAssociated=!0,Js([ao({type:Array,attribute:"default-value"})],Qs.prototype,"defaultValue",void 0),Js([ao({type:Boolean,reflect:!0})],Qs.prototype,"required",void 0),Js([ao({reflect:!0})],Qs.prototype,"name",void 0),Js([ao({type:Array,attribute:!1})],Qs.prototype,"selectedIndexes",null),Js([ao({type:Array})],Qs.prototype,"value",null),Js([ho(".face")],Qs.prototype,"_faceElement",void 0),Qs=Js([mo("vscode-multi-select")],Qs),We({tagName:"vscode-multi-select",elementClass:Qs,react:E,displayName:"VscodeMultiSelect",events:{onChange:"change",onInvalid:"invalid",onVscMultiSelectCreateOption:"vsc-multi-select-create-option"}}),We({tagName:"vscode-option",elementClass:Ls,react:E,displayName:"VscodeOption"});const ei=[_o,Qe`
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
  `];var ti=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let oi=class extends go{constructor(){super(...arguments),this.ariaLabel="Loading",this.max=100,this.indeterminate=!1,this.longRunningThreshold=15e3,this._longRunning=!1}get _isDeterminate(){return!this.indeterminate&&"number"==typeof this.value&&isFinite(this.value)}connectedCallback(){super.connectedCallback(),this._maybeStartLongRunningTimer()}disconnectedCallback(){super.disconnectedCallback(),this._clearLongRunningTimer()}willUpdate(){this._maybeStartLongRunningTimer()}render(){const e=this.max>0?this.max:100,t=this._isDeterminate?Math.min(Math.max(this.value??0,0),e):0,o=this._isDeterminate?t/e*100:0,s={container:!0,discrete:this._isDeterminate,infinite:!this._isDeterminate,"infinite-long-running":this._longRunning&&!this._isDeterminate};return Nt`
      <div
        class=${Po(s)}
        part="container"
        role="progressbar"
        aria-label=${this.ariaLabel}
        aria-valuemin="0"
        aria-valuemax=${String(e)}
        aria-valuenow=${Ro(this._isDeterminate?String(Math.round(t)):void 0)}
      >
        <div class="track" part="track"></div>
        <div
          class="indicator"
          part="indicator"
          .style=${Bo({width:this._isDeterminate?`${o}%`:void 0})}
        ></div>
      </div>
    `}_maybeStartLongRunningTimer(){if(!(!this._isDeterminate&&this.longRunningThreshold>0&&this.isConnected))return this._clearLongRunningTimer(),void(this._longRunning=!1);this._longRunningHandle||(this._longRunningHandle=setTimeout(()=>{this._longRunning=!0,this._longRunningHandle=void 0,this.requestUpdate()},this.longRunningThreshold))}_clearLongRunningTimer(){this._longRunningHandle&&(clearTimeout(this._longRunningHandle),this._longRunningHandle=void 0)}};oi.styles=ei,ti([ao({reflect:!0,attribute:"aria-label"})],oi.prototype,"ariaLabel",void 0),ti([ao({type:Number,reflect:!0})],oi.prototype,"value",void 0),ti([ao({type:Number,reflect:!0})],oi.prototype,"max",void 0),ti([ao({type:Boolean,reflect:!0})],oi.prototype,"indeterminate",void 0),ti([ao({type:Number,attribute:"long-running-threshold"})],oi.prototype,"longRunningThreshold",void 0),ti([lo()],oi.prototype,"_longRunning",void 0),oi=ti([mo("vscode-progress-bar")],oi),We({tagName:"vscode-progress-bar",elementClass:oi,react:E,displayName:"VscodeProgressBar"});const si=[_o,Qe`
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
  `];var ii=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ni=class extends go{constructor(){super(...arguments),this.ariaLabel="Loading",this.ariaLive="assertive",this.role="alert"}render(){return Nt`<svg class="progress" part="progress" viewBox="0 0 16 16">
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
    </svg>`}};ni.styles=si,ii([ao({reflect:!0,attribute:"aria-label"})],ni.prototype,"ariaLabel",void 0),ii([ao({reflect:!0,attribute:"aria-live"})],ni.prototype,"ariaLive",void 0),ii([ao({reflect:!0})],ni.prototype,"role",void 0),ni=ii([mo("vscode-progress-ring")],ni);const ri=We({tagName:"vscode-progress-ring",elementClass:ni,react:E,displayName:"VscodeProgressRing"}),ai=[_o,qo,Qe`
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
  `];var li=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ci=class extends(Uo(Ho)){get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}constructor(){super(),this.autofocus=!1,this.checked=!1,this.defaultChecked=!1,this.invalid=!1,this.name="",this.type="radio",this.value="",this.disabled=!1,this.required=!1,this.tabIndex=0,this._slottedText="",this._handleClick=()=>{this.disabled||this.checked||(this._checkButton(),this._handleValueChange(),this.dispatchEvent(new Event("change",{bubbles:!0})))},this._handleKeyDown=e=>{this.disabled||"Enter"!==e.key&&" "!==e.key||(e.preventDefault()," "!==e.key||this.checked||(this.checked=!0,this._handleValueChange(),this.dispatchEvent(new Event("change",{bubbles:!0}))),"Enter"===e.key&&this._internals.form?.requestSubmit())},this._internals=this.attachInternals(),this.addEventListener("keydown",this._handleKeyDown),this.addEventListener("click",this._handleClick)}connectedCallback(){super.connectedCallback(),this._handleValueChange()}update(e){super.update(e),e.has("checked")&&this._handleValueChange(),e.has("required")&&this._handleValueChange()}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}formResetCallback(){this._getRadios().forEach(e=>{e.checked=e.defaultChecked}),this.updateComplete.then(()=>{this._handleValueChange()})}formStateRestoreCallback(e,t){this.value===e&&""!==e&&(this.checked=!0)}setComponentValidity(e){e?this._internals.setValidity({}):this._internals.setValidity({valueMissing:!0},"Please select one of these options.",this._inputEl)}_getRadios(){const e=this.getRootNode({composed:!1});if(!e)return[];const t=e.querySelectorAll(`vscode-radio[name="${this.name}"]`);return Array.from(t)}_uncheckOthers(e){e.forEach(e=>{e!==this&&(e.checked=!1)})}_checkButton(){const e=this._getRadios();this.checked=!0,e.forEach(e=>{e!==this&&(e.checked=!1)})}_setGroupValidity(e,t){this.updateComplete.then(()=>{e.forEach(e=>{e.setComponentValidity(t)})})}_setActualFormValue(){let e="";e=this.checked?this.value?this.value:"on":null,this._internals.setFormValue(e)}_handleValueChange(){const e=this._getRadios(),t=e.some(e=>e.required);if(this._setActualFormValue(),this.checked)this._uncheckOthers(e),this._setGroupValidity(e,!0);else{const o=!!e.find(e=>e.checked),s=t&&!o;this._setGroupValidity(e,!s)}}render(){const e=Po({icon:!0,checked:this.checked}),t=Po({"label-inner":!0,"is-slot-empty":""===this._slottedText});return Nt`
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
    `}};ci.styles=ai,ci.formAssociated=!0,ci.shadowRootOptions={...so.shadowRootOptions,delegatesFocus:!0},li([ao({type:Boolean,reflect:!0})],ci.prototype,"autofocus",void 0),li([ao({type:Boolean,reflect:!0})],ci.prototype,"checked",void 0),li([ao({type:Boolean,reflect:!0,attribute:"default-checked"})],ci.prototype,"defaultChecked",void 0),li([ao({type:Boolean,reflect:!0})],ci.prototype,"invalid",void 0),li([ao({reflect:!0})],ci.prototype,"name",void 0),li([ao()],ci.prototype,"type",void 0),li([ao()],ci.prototype,"value",void 0),li([ao({type:Boolean,reflect:!0})],ci.prototype,"disabled",void 0),li([ao({type:Boolean,reflect:!0})],ci.prototype,"required",void 0),li([ao({type:Number,reflect:!0})],ci.prototype,"tabIndex",void 0),li([lo()],ci.prototype,"_slottedText",void 0),li([ho("#input")],ci.prototype,"_inputEl",void 0),ci=li([mo("vscode-radio")],ci),We({tagName:"vscode-radio",elementClass:ci,react:E,displayName:"VscodeRadio",events:{onChange:"change",onInvalid:"invalid"}});const di=[_o,Qe`
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
  `];var hi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let pi=class extends go{constructor(){super(),this.variant="horizontal",this.role="radiogroup",this._focusedRadio=-1,this._checkedRadio=-1,this._firstContentLoaded=!1,this._handleKeyDown=e=>{const{key:t}=e;["ArrowLeft","ArrowUp","ArrowRight","ArrowDown"].includes(t)&&e.preventDefault(),"ArrowRight"!==t&&"ArrowDown"!==t||this._checkNext(),"ArrowLeft"!==t&&"ArrowUp"!==t||this._checkPrev()},this.addEventListener("keydown",this._handleKeyDown)}_uncheckPreviousChecked(e,t){-1!==e&&(this._radios[e].checked=!1),-1!==t&&(this._radios[t].tabIndex=-1)}_afterCheck(){this._focusedRadio=this._checkedRadio,this._radios[this._checkedRadio].checked=!0,this._radios[this._checkedRadio].tabIndex=0,this._radios[this._checkedRadio].focus()}_checkPrev(){const e=this._radios.findIndex(e=>e.checked),t=this._radios.findIndex(e=>e.focused),o=-1!==t?t:e;this._uncheckPreviousChecked(e,t),this._checkedRadio=-1===o?this._radios.length-1:o-1>=0?o-1:this._radios.length-1,this._afterCheck()}_checkNext(){const e=this._radios.findIndex(e=>e.checked),t=this._radios.findIndex(e=>e.focused),o=-1!==t?t:e;this._uncheckPreviousChecked(e,t),-1===o?this._checkedRadio=0:o+1<this._radios.length?this._checkedRadio=o+1:this._checkedRadio=0,this._afterCheck()}_handleChange(e){const t=this._radios.findIndex(t=>t===e.target);-1!==t&&(-1!==this._focusedRadio&&(this._radios[this._focusedRadio].tabIndex=-1),-1!==this._checkedRadio&&this._checkedRadio!==t&&(this._radios[this._checkedRadio].checked=!1),this._focusedRadio=t,this._checkedRadio=t,this._radios[t].tabIndex=0)}_handleSlotChange(){if(!this._firstContentLoaded){const e=this._radios.findIndex(e=>e.autofocus);e>-1&&(this._focusedRadio=e),this._firstContentLoaded=!0}let e=-1;this._radios.forEach((t,o)=>{this._focusedRadio>-1?t.tabIndex=o===this._focusedRadio?0:-1:t.tabIndex=0===o?0:-1,t.defaultChecked&&(e>-1&&(this._radios[e].defaultChecked=!1),e=o)}),e>-1&&(this._radios[e].checked=!0)}render(){return Nt`
      <div class="wrapper">
        <slot
          @slotchange=${this._handleSlotChange}
          @change=${this._handleChange}
        ></slot>
      </div>
    `}};pi.styles=di,hi([ao({reflect:!0})],pi.prototype,"variant",void 0),hi([ao({reflect:!0})],pi.prototype,"role",void 0),hi([uo({selector:"vscode-radio"})],pi.prototype,"_radios",void 0),hi([lo()],pi.prototype,"_focusedRadio",void 0),hi([lo()],pi.prototype,"_checkedRadio",void 0),pi=hi([mo("vscode-radio-group")],pi),We({tagName:"vscode-radio-group",elementClass:pi,react:E,displayName:"VscodeRadioGroup",events:{onChange:"change"}}),We({tagName:"vscode-scrollable",elementClass:Ks,react:E,displayName:"VscodeScrollable"});var ui=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let vi=class extends Xs{set selectedIndex(e){this._opts.selectedIndex=e;const t=this._opts.getOptionByIndex(e);t?(this._opts.activeIndex=e,this._value=t.value,this._internals.setFormValue(this._value),this._manageRequired()):(this._value="",this._internals.setFormValue(""),this._manageRequired())}get selectedIndex(){return this._opts.selectedIndex}set value(e){this._opts.value=e,this._opts.selectedIndex>-1?this._requestedValueToSetLater="":this._requestedValueToSetLater=e,this._internals.setFormValue(this._value),this._manageRequired()}get value(){return this._opts.value}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}updateInputValue(){if(!this.combobox)return;const e=this.renderRoot.querySelector(".combobox-input");if(e){const t=this._opts.getSelectedOption();e.value=t?.label??""}}constructor(){super(),this.defaultValue="",this.name=void 0,this.required=!1,this._requestedValueToSetLater="",this._opts.multiSelect=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._manageRequired()})}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(e,t){this.updateComplete.then(()=>{this.value=e})}get type(){return"select-one"}get form(){return this._internals.form}async _createAndSelectSuggestedOption(){const e=this._createSuggestedOption();await this.updateComplete,this._opts.selectedIndex=e,this._dispatchChangeEvent();const t=new CustomEvent("vsc-single-select-create-option",{detail:{value:this._opts.getOptionByIndex(e)?.value??""}});this.dispatchEvent(t),this.open=!1,this._isPlaceholderOptionActive=!1}_setStateFromSlottedElements(){super._setStateFromSlottedElements(),this.combobox||0!==this._opts.selectedIndexes.length||(this._opts.selectedIndex=this._opts.options.length>0?0:-1)}_onSlotChange(){if(super._onSlotChange(),this._requestedValueToSetLater){const e=this._opts.getOptionByValue(this._requestedValueToSetLater);e&&(this._opts.selectedIndex=e.index,this._requestedValueToSetLater="")}this._opts.selectedIndex>-1&&this._opts.numOptions>0?(this._internals.setFormValue(this._opts.value),this._manageRequired()):(this._internals.setFormValue(null),this._manageRequired())}_onEnterKeyDown(e){super._onEnterKeyDown(e);let t=!1;this.combobox?this.open?this._isPlaceholderOptionActive?this._createAndSelectSuggestedOption():(t=this._opts.activeIndex!==this._opts.selectedIndex,this._opts.selectedIndex=this._opts.activeIndex,this.open=!1):(this.open=!0,this._scrollActiveElementToTop()):this.open?(t=this._opts.activeIndex!==this._opts.selectedIndex,this._opts.selectedIndex=this._opts.activeIndex,this.open=!1):(this.open=!0,this._scrollActiveElementToTop()),t&&(this._dispatchChangeEvent(),this.updateInputValue(),this._internals.setFormValue(this._opts.value),this._manageRequired())}_onOptionClick(e){super._onOptionClick(e);const t=e.composedPath().find(e=>{if("matches"in e)return e.matches("li.option")});if(!t||t.matches(".disabled"))return;t.classList.contains("placeholder")?this.creatable&&this._createAndSelectSuggestedOption():(this._opts.selectedIndex=Number(t.dataset.index),this.open=!1,this._internals.setFormValue(this._opts.value),this._manageRequired(),this._dispatchChangeEvent())}_manageRequired(){const{value:e}=this;""===e&&this.required?this._internals.setValidity({valueMissing:!0},"Please select an item in the list.",this._face):this._internals.setValidity({})}_renderSelectFace(){const e=this._opts.getSelectedOption(),t=e?.label??"",o=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"";return Nt`
      <div
        aria-activedescendant=${o}
        aria-controls="select-listbox"
        aria-expanded=${this.open?"true":"false"}
        aria-haspopup="listbox"
        aria-label=${Ro(this.label)}
        class="select-face face"
        @click=${this._onFaceClick}
        role="combobox"
        tabindex="0"
      >
        <span class="text">${t}</span> ${Es}
      </div>
    `}_renderComboboxFace(){let e="";if(this._isBeingFiltered)e=this._opts.filterPattern;else{const t=this._opts.getSelectedOption();e=t?.label??""}const t=this._opts.activeIndex>-1?`op-${this._opts.activeIndex}`:"",o=this.open?"true":"false";return Nt`
      <div class="combobox-face face">
        <input
          aria-activedescendant=${t}
          aria-autocomplete="list"
          aria-controls="select-listbox"
          aria-expanded=${o}
          aria-haspopup="listbox"
          aria-label=${Ro(this.label)}
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
          ${Es}
        </button>
      </div>
    `}render(){return Nt`
      <div class="single-select">
        <slot class="main-slot" @slotchange=${this._onSlotChange}></slot>
        ${this.combobox?this._renderComboboxFace():this._renderSelectFace()}
        ${this._renderDropdown()}
      </div>
    `}};vi.styles=Zs,vi.shadowRootOptions={...so.shadowRootOptions,delegatesFocus:!0},vi.formAssociated=!0,ui([ao({attribute:"default-value"})],vi.prototype,"defaultValue",void 0),ui([ao({reflect:!0})],vi.prototype,"name",void 0),ui([ao({type:Number,attribute:"selected-index"})],vi.prototype,"selectedIndex",null),ui([ao({type:String})],vi.prototype,"value",null),ui([ao({type:Boolean,reflect:!0})],vi.prototype,"required",void 0),ui([ho(".face")],vi.prototype,"_face",void 0),vi=ui([mo("vscode-single-select")],vi),We({tagName:"vscode-single-select",elementClass:vi,react:E,displayName:"VscodeSingleSelect",events:{onChange:"change",onInvalid:"invalid",onVscSingleSelectCreateOption:"vsc-single-select-create-option"}});const fi=[_o,Qe`
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
  `];var bi,gi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const mi=e=>{if(!e)return{value:0,unit:"pixel"};let t,o;e.endsWith("%")?(t="percent",o=+e.substring(0,e.length-1)):e.endsWith("px")?(t="pixel",o=+e.substring(0,e.length-2)):(t="pixel",o=+e);return{unit:t,value:isNaN(o)?0:o}},_i=(e,t)=>0===t?0:Math.min(100,e/t*100),yi=(e,t)=>t*(e/100);let xi=bi=class extends go{set split(e){this._split!==e&&(this._split=e,this.resetHandlePosition())}get split(){return this._split}set handlePosition(e){this._rawHandlePosition=e,this._handlePositionPropChanged()}get handlePosition(){return this._rawHandlePosition}set fixedPane(e){this._fixedPane=e,this._fixedPanePropChanged()}get fixedPane(){return this._fixedPane}set minStart(e){const t=e??void 0;this._minStart!==t&&(this._minStart=t,this._applyMinSizeConstraints())}get minStart(){return this._minStart}set minEnd(e){const t=e??void 0;this._minEnd!==t&&(this._minEnd=t,this._applyMinSizeConstraints())}get minEnd(){return this._minEnd}constructor(){super(),this._split="vertical",this.resetOnDblClick=!1,this.handleSize=4,this.initialHandlePosition="50%",this._fixedPane="none",this._handlePosition=0,this._isDragActive=!1,this._hover=!1,this._hide=!1,this._boundRect=new DOMRect,this._handleOffset=0,this._wrapperObserved=!1,this._fixedPaneSize=0,this._handleResize=e=>{const t=e[0].contentRect,{width:o,height:s}=t;this._boundRect=t;const i="vertical"===this.split?o:s;"start"===this.fixedPane&&(this._handlePosition=this._fixedPaneSize),"end"===this.fixedPane&&(this._handlePosition=i-this._fixedPaneSize),this._handlePosition=this._clampHandlePosition(this._handlePosition,i),this._updateFixedPaneSize(i)},this._handleMouseUp=e=>{this._isDragActive=!1,e.target!==this&&(this._hover=!1,this._hide=!0),window.removeEventListener("mouseup",this._handleMouseUp),window.removeEventListener("mousemove",this._handleMouseMove);const{width:t,height:o}=this._boundRect,s="vertical"===this.split?t:o,i=_i(this._handlePosition,s);this.dispatchEvent(new CustomEvent("vsc-split-layout-change",{detail:{position:this._handlePosition,positionInPercentage:i},composed:!0}))},this._handleMouseMove=e=>{const{clientX:t,clientY:o}=e,{left:s,top:i,height:n,width:r}=this._boundRect,a="vertical"===this.split,l=a?r:n,c=(a?t-s:o-i)-this._handleOffset+this.handleSize/2;this._handlePosition=this._clampHandlePosition(c,l),this._updateFixedPaneSize(l)},this._resizeObserver=new ResizeObserver(this._handleResize)}resetHandlePosition(){if(!this._wrapperEl)return void(this._handlePosition=0);const{width:e,height:t}=this._wrapperEl.getBoundingClientRect(),o="vertical"===this.split?e:t,{value:s,unit:i}=mi(this.initialHandlePosition??"50%"),n="percent"===i?yi(s,o):s;this._handlePosition=this._clampHandlePosition(n,o),this._updateFixedPaneSize(o)}connectedCallback(){super.connectedCallback()}firstUpdated(e){"none"!==this.fixedPane&&(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0),this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:t,unit:o}=this.handlePosition?mi(this.handlePosition):mi(this.initialHandlePosition);this._setPosition(t,o),this._initFixedPane()}_handlePositionPropChanged(){if(this.handlePosition&&this._wrapperEl){this._boundRect=this._wrapperEl.getBoundingClientRect();const{value:e,unit:t}=mi(this.handlePosition);this._setPosition(e,t)}}_fixedPanePropChanged(){this._wrapperEl&&this._initFixedPane()}_initFixedPane(){if("none"===this.fixedPane)this._wrapperObserved&&(this._resizeObserver.unobserve(this._wrapperEl),this._wrapperObserved=!1);else{const{width:e,height:t}=this._boundRect,o="vertical"===this.split?e:t;this._fixedPaneSize="start"===this.fixedPane?this._handlePosition:o-this._handlePosition,this._wrapperObserved||(this._resizeObserver.observe(this._wrapperEl),this._wrapperObserved=!0)}}_applyMinSizeConstraints(){if(!this._wrapperEl)return;this._boundRect=this._wrapperEl.getBoundingClientRect();const{width:e,height:t}=this._boundRect,o="vertical"===this.split?e:t;this._handlePosition=this._clampHandlePosition(this._handlePosition,o),this._updateFixedPaneSize(o)}_resolveMinSizePx(e,t){if(!e)return 0;const{unit:o,value:s}=mi(e),i="percent"===o?yi(s,t):s;return isFinite(i)?Math.max(0,Math.min(i,t)):0}_clampHandlePosition(e,t){if(!isFinite(t)||t<=0)return 0;const o=this._resolveMinSizePx(this._minStart,t),s=this._resolveMinSizePx(this._minEnd,t),i=Math.min(o,t),n=Math.max(i,t-s),r=Math.max(i,Math.min(e,n));return Math.max(0,Math.min(r,t))}_updateFixedPaneSize(e){"start"===this.fixedPane?this._fixedPaneSize=this._handlePosition:"end"===this.fixedPane&&(this._fixedPaneSize=e-this._handlePosition)}_setPosition(e,t){const{width:o,height:s}=this._boundRect,i="vertical"===this.split?o:s,n="percent"===t?yi(e,i):e;this._handlePosition=this._clampHandlePosition(n,i),this._updateFixedPaneSize(i)}_handleMouseOver(){this._hover=!0,this._hide=!1}_handleMouseOut(e){1!==e.buttons&&(this._hover=!1,this._hide=!0)}_handleMouseDown(e){e.stopPropagation(),e.preventDefault(),this._boundRect=this._wrapperEl.getBoundingClientRect();const{left:t,top:o}=this._boundRect,{left:s,top:i}=this._handleEl.getBoundingClientRect(),n=e.clientX-t,r=e.clientY-o;"vertical"===this.split&&(this._handleOffset=n-(s-t)),"horizontal"===this.split&&(this._handleOffset=r-(i-o)),this._isDragActive=!0,window.addEventListener("mouseup",this._handleMouseUp),window.addEventListener("mousemove",this._handleMouseMove)}_handleDblClick(){this.resetOnDblClick&&this.resetHandlePosition()}_handleSlotChange(){[...this._nestedLayoutsAtStart,...this._nestedLayoutsAtEnd].forEach(e=>{e instanceof bi&&e.resetHandlePosition()})}render(){const{width:e,height:t}=this._boundRect,o="vertical"===this.split?e:t,s="none"!==this.fixedPane?`${this._handlePosition}px`:`${_i(this._handlePosition,o)}%`;let i="";i="start"===this.fixedPane?`0 0 ${this._fixedPaneSize}px`:`1 1 ${_i(this._handlePosition,o)}%`;let n="";n="end"===this.fixedPane?`0 0 ${this._fixedPaneSize}px`:`1 1 ${_i(o-this._handlePosition,o)}%`;const r={left:"vertical"===this.split?s:"0",top:"vertical"===this.split?"0":s},a=this.handleSize??4;"vertical"===this.split&&(r.marginLeft=0-a/2+"px",r.width=`${a}px`),"horizontal"===this.split&&(r.height=`${a}px`,r.marginTop=0-a/2+"px");const l=Po({"handle-overlay":!0,active:this._isDragActive,"split-vertical":"vertical"===this.split,"split-horizontal":"horizontal"===this.split}),c=Po({handle:!0,hover:this._hover,hide:this._hide,"split-vertical":"vertical"===this.split,"split-horizontal":"horizontal"===this.split}),d={wrapper:!0,horizontal:"horizontal"===this.split};return Nt`
      <div class=${Po(d)}>
        <div class="start" .style=${Bo({flex:i})}>
          <slot name="start" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class="end" .style=${Bo({flex:n})}>
          <slot name="end" @slotchange=${this._handleSlotChange}></slot>
        </div>
        <div class=${l}></div>
        <div
          class=${c}
          .style=${Bo(r)}
          @mouseover=${this._handleMouseOver}
          @mouseout=${this._handleMouseOut}
          @mousedown=${this._handleMouseDown}
          @dblclick=${this._handleDblClick}
        ></div>
      </div>
    `}};xi.styles=fi,gi([ao({reflect:!0})],xi.prototype,"split",null),gi([ao({type:Boolean,reflect:!0,attribute:"reset-on-dbl-click"})],xi.prototype,"resetOnDblClick",void 0),gi([ao({type:Number,reflect:!0,attribute:"handle-size"})],xi.prototype,"handleSize",void 0),gi([ao({reflect:!0,attribute:"initial-handle-position"})],xi.prototype,"initialHandlePosition",void 0),gi([ao({attribute:"handle-position"})],xi.prototype,"handlePosition",null),gi([ao({attribute:"fixed-pane"})],xi.prototype,"fixedPane",null),gi([ao({attribute:"min-start"})],xi.prototype,"minStart",null),gi([ao({attribute:"min-end"})],xi.prototype,"minEnd",null),gi([lo()],xi.prototype,"_handlePosition",void 0),gi([lo()],xi.prototype,"_isDragActive",void 0),gi([lo()],xi.prototype,"_hover",void 0),gi([lo()],xi.prototype,"_hide",void 0),gi([ho(".wrapper")],xi.prototype,"_wrapperEl",void 0),gi([ho(".handle")],xi.prototype,"_handleEl",void 0),gi([uo({slot:"start",selector:"vscode-split-layout"})],xi.prototype,"_nestedLayoutsAtStart",void 0),gi([uo({slot:"end",selector:"vscode-split-layout"})],xi.prototype,"_nestedLayoutsAtEnd",void 0),xi=bi=gi([mo("vscode-split-layout")],xi),We({tagName:"vscode-split-layout",elementClass:xi,react:E,displayName:"VscodeSplitLayout",events:{onVscSplitLayoutChange:"vsc-split-layout-change"}});const wi=[_o,Qe`
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
  `];var Ci=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Si=class extends go{constructor(){super(...arguments),this.active=!1,this.ariaControls="",this.panel=!1,this.role="tab",this.tabId=-1}attributeChangedCallback(e,t,o){if(super.attributeChangedCallback(e,t,o),"active"===e){const e=null!==o;this.ariaSelected=e?"true":"false",this.tabIndex=e?0:-1}}render(){return Nt`
      <div
        class=${Po({wrapper:!0,active:this.active,panel:this.panel})}
      >
        <div class="before"><slot name="content-before"></slot></div>
        <div class="main"><slot></slot></div>
        <div class="after"><slot name="content-after"></slot></div>
        <span
          class=${Po({"active-indicator":!0,active:this.active,panel:this.panel})}
        ></span>
      </div>
    `}};Si.styles=wi,Ci([ao({type:Boolean,reflect:!0})],Si.prototype,"active",void 0),Ci([ao({reflect:!0,attribute:"aria-controls"})],Si.prototype,"ariaControls",void 0),Ci([ao({type:Boolean,reflect:!0})],Si.prototype,"panel",void 0),Ci([ao({reflect:!0})],Si.prototype,"role",void 0),Ci([ao({type:Number,reflect:!0,attribute:"tab-id"})],Si.prototype,"tabId",void 0),Si=Ci([mo("vscode-tab-header")],Si),We({tagName:"vscode-tab-header",elementClass:Si,react:E,displayName:"VscTabHeader"});const ki=e=>e,Ei=[{test:e=>/^-?\d+(\.\d+)?%$/.test(e),parse:e=>Number(e.slice(0,-1))},{test:e=>/^-?\d+(\.\d+)?px$/.test(e),parse:(e,t)=>Number(e.slice(0,-2))/t*100},{test:e=>/^-?\d+(\.\d+)?$/.test(e),parse:(e,t)=>Number(e)/t*100}],Ai=(e,t)=>{if(!Number.isFinite(t)||0===t)return null;if("number"==typeof e)return Number.isFinite(e)?e/t*100:null;const o=e.trim(),s=Ei.find(e=>e.test(o));return s?s.parse(o,t):null},Oi=[_o,Qe`
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
  `];class Ii{constructor(e){this._hostWidth=0,this._hostX=0,this._activeSplitter=null,this._columnMinWidths=new Map,this._columnWidths=[],this._dragState=null,this._cachedSplitterPositions=null,(this._host=e).addController(this)}hostConnected(){this.saveHostDimensions()}get isDragging(){return null!==this._dragState}get splitterPositions(){if(this._cachedSplitterPositions)return this._cachedSplitterPositions;const e=[];let t=0;for(let o=0;o<this._columnWidths.length-1;o++)t=ki(t+this._columnWidths[o]),e.push(t);return this._cachedSplitterPositions=e,e}getActiveSplitterCalculatedPosition(){const e=this.splitterPositions;if(!this._dragState)return 0;const t=e[this._dragState.splitterIndex];return this._toPx(t)}get columnWidths(){return this._columnWidths}get columnMinWidths(){return new Map(this._columnMinWidths)}saveHostDimensions(){const e=this._host.getBoundingClientRect(),{width:t,x:o}=e;return this._hostWidth=t,this._hostX=o,this}setActiveSplitter(e){return this._activeSplitter=e,this}getActiveSplitter(){return this._activeSplitter}setColumnMinWidthAt(e,t){return this._columnMinWidths.set(e,t),this._host.requestUpdate(),this}setColumWidths(e){return this._columnWidths=e,this._cachedSplitterPositions=null,this._host.requestUpdate(),this}shouldDrag(e){return+e.currentTarget.dataset.index===this._dragState?.splitterIndex}startDrag(e){if(e.stopPropagation(),this._dragState)return;this._activeSplitter?.setPointerCapture(e.pointerId);const t=e.pageX,o=e.currentTarget,s=t-o.getBoundingClientRect().x;this._dragState={dragOffset:s,pointerId:e.pointerId,splitterIndex:+o.dataset.index,prevX:t-s},this._host.requestUpdate()}drag(e){if(e.stopPropagation(),!e?.currentTarget?.hasPointerCapture?.(e.pointerId))return;if(!this._dragState)return;if(e.pointerId!==this._dragState.pointerId)return;if(!this.shouldDrag(e))return;const t=e.pageX,o=t-this._dragState.dragOffset,s=o-this._dragState.prevX,i=this._toPercent(s);this._dragState.prevX=o;const n=this.getActiveSplitterCalculatedPosition();s<=0&&t>n+this._hostX||s>0&&t<n+this._hostX||(this._columnWidths=function(e,t,o,s){const i=[...e];if(0===o||t<0||t>=e.length-1)return i;const n=Math.abs(o);let r=n;const a=[],l=[];for(let u=t;u>=0;u--)a.push(u);for(let u=t+1;u<e.length;u++)l.push(u);const c=o>0?l:a,d=o>0?a:l;let h=0;for(const u of c){const e=Math.max(0,i[u]-(s.get(u)??0));h=ki(h+e)}if(h<r)return i;for(const u of c){if(0===r)break;const e=Math.max(0,i[u]-(s.get(u)??0)),t=Math.min(e,r);i[u]=ki(i[u]-t),r=ki(r-t)}let p=n;for(const u of d){if(0===p)break;i[u]=ki(i[u]+p),p=ki(0)}return i}(this._columnWidths,this._dragState.splitterIndex,i,this._columnMinWidths),this._cachedSplitterPositions=null,this._host.requestUpdate())}stopDrag(e){if(e.stopPropagation(),!this._dragState)return;const t=e.currentTarget;try{t.releasePointerCapture(this._dragState.pointerId)}catch(o){}this._dragState=null,this._activeSplitter=null,this._host.requestUpdate()}_toPercent(e){return((e,t)=>e/t*100)(e,this._hostWidth)}_toPx(e){return t=e,o=this._hostWidth,t/100*o;var t,o}}var $i=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Pi=class extends go{set columns(e){if(!Array.isArray(e))return this.warn('Invalid value for "columns": expected an array.'),void(this._columns=[]);this._columns=e,this.isConnected&&this._initDefaultColumnSizes()}get columns(){return this._columns}constructor(){super(),this.role="table",this.resizable=!1,this.responsive=!1,this.bordered=!1,this.borderedColumns=!1,this.borderedRows=!1,this.breakpoint=300,this.minColumnWidth="50px",this.delayedResizing=!1,this.compact=!1,this.zebra=!1,this.zebraOdd=!1,this._sashPositions=[],this._isDragging=!1,this._sashHovers=[],this._columns=[],this._activeSashElementIndex=-1,this._componentH=0,this._componentW=0,this._headerCells=[],this._cellsOfFirstRow=[],this._prevHeaderHeight=0,this._prevComponentHeight=0,this._columnResizeController=new Ii(this),this._componentResizeObserverCallback=()=>{this._memoizeComponentDimensions(),this._updateResizeHandlersSize(),this.responsive&&this._toggleCompactView(),this._resizeTableBody()},this._headerResizeObserverCallback=()=>{this._updateResizeHandlersSize()},this._bodyResizeObserverCallback=()=>{this._resizeTableBody()},this._handleSplitterPointerMove=e=>{this._columnResizeController.shouldDrag(e)&&(this._columnResizeController.drag(e),this.delayedResizing?this._resizeColumns(!1):this._resizeColumns(!0))},this._handleSplitterPointerUp=e=>{this._stopDrag(e)},this._handleSplitterPointerCancel=e=>{this._stopDrag(e)},this._handleMinColumnWidthChange=e=>{const{columnIndex:t,propertyValue:o}=e.detail,s=Ai(o,this._componentW);s&&this._columnResizeController.setColumnMinWidthAt(t,s)},this.addEventListener("vsc-table-change-min-column-width",this._handleMinColumnWidthChange)}connectedCallback(){super.connectedCallback(),this._memoizeComponentDimensions(),this._initDefaultColumnSizes()}disconnectedCallback(){super.disconnectedCallback(),this._componentResizeObserver?.unobserve(this),this._componentResizeObserver?.disconnect(),this._bodyResizeObserver?.disconnect()}willUpdate(e){if(e.has("minColumnWidth")){const e=Ai(this.minColumnWidth,this._componentW)??0,t=this._columnResizeController.columnMinWidths,o=this._columnResizeController.columnWidths;for(let s=0;s<o.length;s++)t.has(s)||this._columnResizeController.setColumnMinWidthAt(s,e)}}_memoizeComponentDimensions(){const e=this.getBoundingClientRect();this._componentH=e.height,this._componentW=e.width}_queryHeaderCells(){const e=this._assignedHeaderElements;return e&&e[0]?Array.from(e[0].querySelectorAll("vscode-table-header-cell")):[]}_getHeaderCells(){return this._headerCells.length||(this._headerCells=this._queryHeaderCells()),this._headerCells}_queryCellsOfFirstRow(){const e=this._assignedBodyElements;return e&&e[0]?Array.from(e[0].querySelectorAll("vscode-table-row:first-child vscode-table-cell")):[]}_getCellsOfFirstRow(){return this._cellsOfFirstRow.length||(this._cellsOfFirstRow=this._queryCellsOfFirstRow()),this._cellsOfFirstRow}_resizeTableBody(){let e=0,t=0;const o=this.getBoundingClientRect().height;this._assignedHeaderElements&&this._assignedHeaderElements.length&&(e=this._assignedHeaderElements[0].getBoundingClientRect().height),this._assignedBodyElements&&this._assignedBodyElements.length&&(t=this._assignedBodyElements[0].getBoundingClientRect().height);const s=t-e-o;this._scrollableElement.style.height=s>0?o-e+"px":"auto"}_initResizeObserver(){this._componentResizeObserver=new ResizeObserver(this._componentResizeObserverCallback),this._componentResizeObserver.observe(this),this._headerResizeObserver=new ResizeObserver(this._headerResizeObserverCallback),this._headerResizeObserver.observe(this._headerElement)}_calculateInitialColumnWidths(){const e=this._getHeaderCells().length;let t=this.columns.slice(0,e);const o=t.filter(e=>"auto"===e).length+e-t.length;let s=100;if(t=t.map(e=>{const t=Ai(e,this._componentW);return null===t?"auto":(s-=t,t)}),t.length<e)for(let i=t.length;i<e;i++)t.push("auto");return t=t.map(e=>"auto"===e?s/o:e),t}_initHeaderCellSizes(e){this._getHeaderCells().forEach((t,o)=>{t.style.width=`${e[o]}%`})}_initBodyColumnSizes(e){this._getCellsOfFirstRow().forEach((t,o)=>{t.style.width=`${e[o]}%`})}_initSashes(e){const t=e.length;let o=0;this._sashPositions=[],e.forEach((e,s)=>{if(s<t-1){const t=o+e;this._sashPositions.push(t),o=t}})}_initDefaultColumnSizes(){const e=this._calculateInitialColumnWidths();this._columnResizeController.setColumWidths(e.map(e=>e)),this._initHeaderCellSizes(e),this._initBodyColumnSizes(e),this._initSashes(e)}_updateResizeHandlersSize(){const e=this._headerElement.getBoundingClientRect();if(e.height===this._prevHeaderHeight&&this._componentH===this._prevComponentHeight)return;this._prevHeaderHeight=e.height,this._prevComponentHeight=this._componentH;const t=this._componentH-e.height;this._sashVisibleElements.forEach(o=>{o.style.height=`${t}px`,o.style.top=`${e.height}px`})}_applyCompactViewColumnLabels(){const e=this._getHeaderCells().map(e=>e.innerText);this.querySelectorAll("vscode-table-row").forEach(t=>{t.querySelectorAll("vscode-table-cell").forEach((t,o)=>{t.columnLabel=e[o],t.compact=!0})})}_clearCompactViewColumnLabels(){this.querySelectorAll("vscode-table-cell").forEach(e=>{e.columnLabel="",e.compact=!1})}_toggleCompactView(){const e=this.getBoundingClientRect().width<this.breakpoint;this.compact!==e&&(this.compact=e,e?this._applyCompactViewColumnLabels():this._clearCompactViewColumnLabels())}_stopDrag(e){const t=this._columnResizeController.getActiveSplitter();t&&(t.removeEventListener("pointermove",this._handleSplitterPointerMove),t.removeEventListener("pointerup",this._handleSplitterPointerUp),t.removeEventListener("pointercancel",this._handleSplitterPointerCancel)),this._columnResizeController.stopDrag(e),this._resizeColumns(!0),this._sashHovers[this._activeSashElementIndex]=!1,this._isDragging=!1,this._activeSashElementIndex=-1}_onDefaultSlotChange(){this._assignedElements.forEach(e=>{"vscode-table-header"!==e.tagName.toLowerCase()?"vscode-table-body"!==e.tagName.toLowerCase()||(e.slot="body"):e.slot="header"})}_onHeaderSlotChange(){this._headerCells=this._queryHeaderCells();[].fill(0,0,this._headerCells.length-1),this._headerCells.forEach((e,t)=>{if(e.index=t,e.minWidth){const o=Ai(e.minWidth,this._componentW)??0;this._columnResizeController.setColumnMinWidthAt(t,o)}})}_onBodySlotChange(){if(this._initDefaultColumnSizes(),this._initResizeObserver(),this._updateResizeHandlersSize(),!this._bodyResizeObserver){const e=this._assignedBodyElements[0]??null;e&&(this._bodyResizeObserver=new ResizeObserver(this._bodyResizeObserverCallback),this._bodyResizeObserver.observe(e))}}_onSashMouseOver(e){if(this._isDragging)return;const t=e.currentTarget,o=Number(t.dataset.index);this._sashHovers[o]=!0,this.requestUpdate()}_onSashMouseOut(e){if(e.stopPropagation(),this._isDragging)return;const t=e.currentTarget,o=Number(t.dataset.index);this._sashHovers[o]=!1,this.requestUpdate()}_resizeColumns(e=!0){const t=this._columnResizeController.columnWidths;if(this._getHeaderCells().forEach((e,o)=>e.style.width=`${t[o]}%`),e){this._getCellsOfFirstRow().forEach((e,o)=>e.style.width=`${t[o]}%`)}}_handleSplitterPointerDown(e){e.stopPropagation();const t=e.currentTarget;this._columnResizeController.saveHostDimensions().setActiveSplitter(t).startDrag(e),t.addEventListener("pointermove",this._handleSplitterPointerMove),t.addEventListener("pointerup",this._handleSplitterPointerUp),t.addEventListener("pointercancel",this._handleSplitterPointerCancel)}render(){const e=this._columnResizeController.splitterPositions.map((e,t)=>{const o=Po({sash:!0,hover:this._sashHovers[t],resizable:this.resizable}),s=`${e}%`;return this.resizable?Nt`
            <div
              class=${o}
              data-index=${t}
              .style=${Bo({left:s})}
              @pointerdown=${this._handleSplitterPointerDown}
              @mouseover=${this._onSashMouseOver}
              @mouseout=${this._onSashMouseOut}
            >
              <div class="sash-visible"></div>
              <div class="sash-clickable"></div>
            </div>
          `:Nt`<div
            class=${o}
            data-index=${t}
            .style=${Bo({left:s})}
          >
            <div class="sash-visible"></div>
          </div>`}),t=Po({wrapper:!0,"select-disabled":this._columnResizeController.isDragging,"resize-cursor":this._columnResizeController.isDragging,"compact-view":this.compact});return Nt`
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
    `}};var Ri;Pi.styles=Oi,$i([ao({reflect:!0})],Pi.prototype,"role",void 0),$i([ao({type:Boolean,reflect:!0})],Pi.prototype,"resizable",void 0),$i([ao({type:Boolean,reflect:!0})],Pi.prototype,"responsive",void 0),$i([ao({type:Boolean,reflect:!0})],Pi.prototype,"bordered",void 0),$i([ao({type:Boolean,reflect:!0,attribute:"bordered-columns"})],Pi.prototype,"borderedColumns",void 0),$i([ao({type:Boolean,reflect:!0,attribute:"bordered-rows"})],Pi.prototype,"borderedRows",void 0),$i([ao({type:Number})],Pi.prototype,"breakpoint",void 0),$i([ao({type:Array})],Pi.prototype,"columns",null),$i([ao({attribute:"min-column-width"})],Pi.prototype,"minColumnWidth",void 0),$i([ao({type:Boolean,reflect:!0,attribute:"delayed-resizing"})],Pi.prototype,"delayedResizing",void 0),$i([ao({type:Boolean,reflect:!0})],Pi.prototype,"compact",void 0),$i([ao({type:Boolean,reflect:!0})],Pi.prototype,"zebra",void 0),$i([ao({type:Boolean,reflect:!0,attribute:"zebra-odd"})],Pi.prototype,"zebraOdd",void 0),$i([ho(".header")],Pi.prototype,"_headerElement",void 0),$i([ho(".scrollable")],Pi.prototype,"_scrollableElement",void 0),$i([(Ri=".sash-visible",(e,t)=>co(e,t,{get(){return(this.renderRoot??po??(po=document.createDocumentFragment())).querySelectorAll(Ri)}}))],Pi.prototype,"_sashVisibleElements",void 0),$i([uo({flatten:!0,selector:"vscode-table-header, vscode-table-body"})],Pi.prototype,"_assignedElements",void 0),$i([uo({slot:"header",flatten:!0,selector:"vscode-table-header"})],Pi.prototype,"_assignedHeaderElements",void 0),$i([uo({slot:"body",flatten:!0,selector:"vscode-table-body"})],Pi.prototype,"_assignedBodyElements",void 0),$i([lo()],Pi.prototype,"_sashPositions",void 0),$i([lo()],Pi.prototype,"_isDragging",void 0),Pi=$i([mo("vscode-table")],Pi),We({tagName:"vscode-table",elementClass:Pi,react:E,displayName:"VscodeTable"});const Bi=[_o,Qe`
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
  `];var Di=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Mi=class extends go{constructor(){super(...arguments),this.role="rowgroup"}render(){return Nt` <slot></slot> `}};Mi.styles=Bi,Di([ao({reflect:!0})],Mi.prototype,"role",void 0),Mi=Di([mo("vscode-table-body")],Mi),We({tagName:"vscode-table-body",elementClass:Mi,react:E,displayName:"VscodeTableBody"});const Ti=[_o,Qe`
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
  `];var Ni=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Li=class extends go{constructor(){super(...arguments),this.role="cell",this.columnLabel="",this.compact=!1}render(){const e=this.columnLabel?Nt`<div class="column-label" role="presentation">
          ${this.columnLabel}
        </div>`:Vt;return Nt`
      <div class="wrapper">
        ${e}
        <slot></slot>
      </div>
    `}};Li.styles=Ti,Ni([ao({reflect:!0})],Li.prototype,"role",void 0),Ni([ao({attribute:"column-label"})],Li.prototype,"columnLabel",void 0),Ni([ao({type:Boolean,reflect:!0})],Li.prototype,"compact",void 0),Li=Ni([mo("vscode-table-cell")],Li),We({tagName:"vscode-table-cell",elementClass:Li,react:E,displayName:"VscodeTableCell"});const ji=[_o,Qe`
    :host {
      background-color: var(
        --vscode-keybindingTable-headerBackground,
        rgba(204, 204, 204, 0.04)
      );
      display: table;
      table-layout: fixed;
      width: 100%;
    }
  `];var Vi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let zi=class extends go{constructor(){super(...arguments),this.role="rowgroup"}render(){return Nt` <slot></slot> `}};zi.styles=ji,Vi([ao({reflect:!0})],zi.prototype,"role",void 0),zi=Vi([mo("vscode-table-header")],zi),We({tagName:"vscode-table-header",elementClass:zi,react:E,displayName:"VscodeTableHeader"});const Fi=[_o,Qe`
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
  `];var Hi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Ui=class extends go{constructor(){super(...arguments),this.minWidth="0",this.index=-1,this.role="columnheader"}willUpdate(e){e.has("minWidth")&&this.index>-1&&this.dispatchEvent(new CustomEvent("vsc-table-change-min-column-width",{detail:{columnIndex:this.index,propertyValue:this.minWidth},bubbles:!0}))}render(){return Nt`
      <div class="wrapper">
        <slot></slot>
      </div>
    `}};Ui.styles=Fi,Hi([ao({attribute:"min-width"})],Ui.prototype,"minWidth",void 0),Hi([ao({type:Number})],Ui.prototype,"index",void 0),Hi([ao({reflect:!0})],Ui.prototype,"role",void 0),Ui=Hi([mo("vscode-table-header-cell")],Ui),We({tagName:"vscode-table-header-cell",elementClass:Ui,react:E,displayName:"VscodeTableHeaderCell"});const qi=[_o,Qe`
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
  `];var Wi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Ki=class extends go{constructor(){super(...arguments),this.role="row"}render(){return Nt` <slot></slot> `}};Ki.styles=qi,Wi([ao({reflect:!0})],Ki.prototype,"role",void 0),Ki=Wi([mo("vscode-table-row")],Ki),We({tagName:"vscode-table-row",elementClass:Ki,react:E,displayName:"VscodeTableRow"});const Gi=[_o,Qe`
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
  `];var Yi=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Xi=class extends go{constructor(){super(...arguments),this.hidden=!1,this.ariaLabelledby="",this.panel=!1,this.role="tabpanel",this.tabIndex=0}render(){return Nt` <slot></slot> `}};Xi.styles=Gi,Yi([ao({type:Boolean,reflect:!0})],Xi.prototype,"hidden",void 0),Yi([ao({reflect:!0,attribute:"aria-labelledby"})],Xi.prototype,"ariaLabelledby",void 0),Yi([ao({type:Boolean,reflect:!0})],Xi.prototype,"panel",void 0),Yi([ao({reflect:!0})],Xi.prototype,"role",void 0),Yi([ao({type:Number,reflect:!0})],Xi.prototype,"tabIndex",void 0),Xi=Yi([mo("vscode-tab-panel")],Xi),We({tagName:"vscode-tab-panel",elementClass:Xi,react:E,displayName:"VscodeTabPanel"});const Zi=[_o,Qe`
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
  `];var Ji=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let Qi=class extends go{constructor(){super(),this.panel=!1,this.selectedIndex=0,this._tabHeaders=[],this._tabPanels=[],this._componentId="",this._tabFocus=0,this._componentId=ws()}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o),"selected-index"===e&&this._setActiveTab(),"panel"===e&&(this._tabHeaders.forEach(e=>e.panel=null!==o),this._tabPanels.forEach(e=>e.panel=null!==o))}_dispatchSelectEvent(){this.dispatchEvent(new CustomEvent("vsc-tabs-select",{detail:{selectedIndex:this.selectedIndex},composed:!0}))}_setActiveTab(){this._tabFocus=this.selectedIndex,this._tabPanels.forEach((e,t)=>{e.hidden=t!==this.selectedIndex}),this._tabHeaders.forEach((e,t)=>{e.active=t===this.selectedIndex})}_focusPrevTab(){0===this._tabFocus?this._tabFocus=this._tabHeaders.length-1:this._tabFocus-=1}_focusNextTab(){this._tabFocus===this._tabHeaders.length-1?this._tabFocus=0:this._tabFocus+=1}_onHeaderKeyDown(e){"ArrowLeft"!==e.key&&"ArrowRight"!==e.key||(e.preventDefault(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","-1"),"ArrowLeft"===e.key?this._focusPrevTab():"ArrowRight"===e.key&&this._focusNextTab(),this._tabHeaders[this._tabFocus].setAttribute("tabindex","0"),this._tabHeaders[this._tabFocus].focus()),"Enter"===e.key&&(e.preventDefault(),this.selectedIndex=this._tabFocus,this._dispatchSelectEvent())}_moveHeadersToHeaderSlot(){const e=this._mainSlotElements.filter(e=>e instanceof Si);e.length>0&&e.forEach(e=>e.setAttribute("slot","header"))}_onMainSlotChange(){this._moveHeadersToHeaderSlot(),this._tabPanels=this._mainSlotElements.filter(e=>e instanceof Xi),this._tabPanels.forEach((e,t)=>{e.ariaLabelledby=`t${this._componentId}-h${t}`,e.id=`t${this._componentId}-p${t}`,e.panel=this.panel}),this._setActiveTab()}_onHeaderSlotChange(){this._tabHeaders=this._headerSlotElements.filter(e=>e instanceof Si),this._tabHeaders.forEach((e,t)=>{e.tabId=t,e.id=`t${this._componentId}-h${t}`,e.ariaControls=`t${this._componentId}-p${t}`,e.panel=this.panel,e.active=t===this.selectedIndex})}_onHeaderClick(e){const t=e.composedPath().find(e=>e instanceof Si);t&&(this.selectedIndex=t.tabId,this._setActiveTab(),this._dispatchSelectEvent())}render(){return Nt`
      <div
        class=${Po({header:!0,panel:this.panel})}
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
    `}};Qi.styles=Zi,Ji([ao({type:Boolean,reflect:!0})],Qi.prototype,"panel",void 0),Ji([ao({type:Number,reflect:!0,attribute:"selected-index"})],Qi.prototype,"selectedIndex",void 0),Ji([uo({slot:"header"})],Qi.prototype,"_headerSlotElements",void 0),Ji([uo()],Qi.prototype,"_mainSlotElements",void 0),Qi=Ji([mo("vscode-tabs")],Qi),We({tagName:"vscode-tabs",elementClass:Qi,react:E,events:{onVscTabsSelect:"vsc-tabs-select"},displayName:"VscodeTabs"});const en=[_o,Qe`
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
  `];var tn=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let on=class extends go{set value(e){this._value=e,this._internals.setFormValue(e)}get value(){return this._value}get wrappedElement(){return this._textareaEl}get form(){return this._internals.form}get type(){return"textarea"}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}set minlength(e){this.minLength=e}get minlength(){return this.minLength}set maxlength(e){this.maxLength=e}get maxlength(){return this.maxLength}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.invalid=!1,this.label="",this.maxLength=void 0,this.minLength=void 0,this.rows=void 0,this.cols=void 0,this.name=void 0,this.placeholder=void 0,this.readonly=!1,this.resize="none",this.required=!1,this.spellcheck=!1,this.monospace=!1,this._value="",this._textareaPointerCursor=!1,this._shadow=!1,this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._textareaEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._textareaEl.value)})}updated(e){const t=["maxLength","minLength","required"];for(const o of e.keys())if(t.includes(String(o))){this.updateComplete.then(()=>{this._setValidityFromInput()});break}}formResetCallback(){this.value=this.defaultValue}formStateRestoreCallback(e,t){this.updateComplete.then(()=>{this._value=e})}checkValidity(){return this._internals.checkValidity()}reportValidity(){return this._internals.reportValidity()}_setValidityFromInput(){this._internals.setValidity(this._textareaEl.validity,this._textareaEl.validationMessage,this._textareaEl)}_dataChanged(){this._value=this._textareaEl.value,this._internals.setFormValue(this._textareaEl.value)}_handleChange(){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change"))}_handleInput(){this._dataChanged(),this._setValidityFromInput()}_handleMouseMove(e){if(this._textareaEl.clientHeight>=this._textareaEl.scrollHeight)return void(this._textareaPointerCursor=!1);const t=this._textareaEl.getBoundingClientRect(),o=e.clientX;this._textareaPointerCursor=o>=t.left+t.width-14-2}_handleScroll(){this._shadow=this._textareaEl.scrollTop>0}render(){return Nt`
      <div
        class=${Po({shadow:!0,visible:this._shadow})}
      ></div>
      <textarea
        autocomplete=${Ro(this.autocomplete)}
        ?autofocus=${this.autofocus}
        ?disabled=${this.disabled}
        aria-label=${this.label}
        id="textarea"
        class=${Po({monospace:this.monospace,"cursor-pointer":this._textareaPointerCursor})}
        maxlength=${Ro(this.maxLength)}
        minlength=${Ro(this.minLength)}
        rows=${Ro(this.rows)}
        cols=${Ro(this.cols)}
        name=${Ro(this.name)}
        placeholder=${Ro(this.placeholder)}
        ?readonly=${this.readonly}
        .style=${Bo({resize:this.resize})}
        ?required=${this.required}
        spellcheck=${this.spellcheck}
        @change=${this._handleChange}
        @input=${this._handleInput}
        @mousemove=${this._handleMouseMove}
        @scroll=${this._handleScroll}
        .value=${this._value}
      ></textarea>
    `}};on.styles=en,on.formAssociated=!0,on.shadowRootOptions={...so.shadowRootOptions,delegatesFocus:!0},tn([ao()],on.prototype,"autocomplete",void 0),tn([ao({type:Boolean,reflect:!0})],on.prototype,"autofocus",void 0),tn([ao({attribute:"default-value"})],on.prototype,"defaultValue",void 0),tn([ao({type:Boolean,reflect:!0})],on.prototype,"disabled",void 0),tn([ao({type:Boolean,reflect:!0})],on.prototype,"invalid",void 0),tn([ao({attribute:!1})],on.prototype,"label",void 0),tn([ao({type:Number})],on.prototype,"maxLength",void 0),tn([ao({type:Number})],on.prototype,"minLength",void 0),tn([ao({type:Number})],on.prototype,"rows",void 0),tn([ao({type:Number})],on.prototype,"cols",void 0),tn([ao()],on.prototype,"name",void 0),tn([ao()],on.prototype,"placeholder",void 0),tn([ao({type:Boolean,reflect:!0})],on.prototype,"readonly",void 0),tn([ao()],on.prototype,"resize",void 0),tn([ao({type:Boolean,reflect:!0})],on.prototype,"required",void 0),tn([ao({type:Boolean})],on.prototype,"spellcheck",void 0),tn([ao({type:Boolean,reflect:!0})],on.prototype,"monospace",void 0),tn([ao()],on.prototype,"value",null),tn([ho("#textarea")],on.prototype,"_textareaEl",void 0),tn([lo()],on.prototype,"_value",void 0),tn([lo()],on.prototype,"_textareaPointerCursor",void 0),tn([lo()],on.prototype,"_shadow",void 0),on=tn([mo("vscode-textarea")],on);const sn=We({tagName:"vscode-textarea",elementClass:on,react:E,displayName:"VscodeTextarea",events:{onChange:"change",onInput:"input",onInvalid:"invalid"}}),nn=Je(xo()),rn=[_o,Qe`
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
      font-family: var(--vscode-font-family, ${nn});
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
      font-family: var(--vscode-font-family, ${nn});
      font-size: var(--vscode-font-size, 13px);
      font-weight: var(--vscode-font-weight, 'normal');
      line-height: 20px;
      padding: 0 14px;
    }

    input[type='file']::file-selector-button:hover {
      background-color: var(--vscode-button-hoverBackground, #026ec1);
    }
  `];var an=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let ln=class extends go{set type(e){this._type=["color","date","datetime-local","email","file","month","number","password","search","tel","text","time","url","week"].includes(e)?e:"text"}get type(){return this._type}set value(e){"file"!==this.type&&(this._value=e,this._internals.setFormValue(e)),this.updateComplete.then(()=>{this._setValidityFromInput()})}get value(){return this._value}set minlength(e){this.minLength=e}get minlength(){return this.minLength}set maxlength(e){this.maxLength=e}get maxlength(){return this.maxLength}get form(){return this._internals.form}get validity(){return this._internals.validity}get validationMessage(){return this._internals.validationMessage}get willValidate(){return this._internals.willValidate}checkValidity(){return this._setValidityFromInput(),this._internals.checkValidity()}reportValidity(){return this._setValidityFromInput(),this._internals.reportValidity()}get wrappedElement(){return this._inputEl}constructor(){super(),this.autocomplete=void 0,this.autofocus=!1,this.defaultValue="",this.disabled=!1,this.focused=!1,this.invalid=!1,this.label="",this.max=void 0,this.maxLength=void 0,this.min=void 0,this.minLength=void 0,this.multiple=!1,this.name=void 0,this.pattern=void 0,this.placeholder=void 0,this.readonly=!1,this.required=!1,this.step=void 0,this._value="",this._type="text",this._internals=this.attachInternals()}connectedCallback(){super.connectedCallback(),this.updateComplete.then(()=>{this._inputEl.checkValidity(),this._setValidityFromInput(),this._internals.setFormValue(this._inputEl.value)})}attributeChangedCallback(e,t,o){super.attributeChangedCallback(e,t,o);["max","maxlength","min","minlength","pattern","required","step"].includes(e)&&this.updateComplete.then(()=>{this._setValidityFromInput()})}formResetCallback(){this.value=this.defaultValue,this.requestUpdate()}formStateRestoreCallback(e,t){this.value=e}_dataChanged(){if(this._value=this._inputEl.value,"file"===this.type&&this._inputEl.files)for(const e of this._inputEl.files)this._internals.setFormValue(e);else this._internals.setFormValue(this._inputEl.value)}_setValidityFromInput(){this._inputEl&&this._internals.setValidity(this._inputEl.validity,this._inputEl.validationMessage,this._inputEl)}_onInput(){this._dataChanged(),this._setValidityFromInput()}_onChange(){this._dataChanged(),this._setValidityFromInput(),this.dispatchEvent(new Event("change"))}_onFocus(){this.focused=!0}_onBlur(){this.focused=!1}_onKeyDown(e){"Enter"===e.key&&this._internals.form&&this._internals.form?.requestSubmit()}render(){return Nt`
      <div class="root">
        <slot name="content-before"></slot>
        <input
          id="input"
          type=${this.type}
          ?autofocus=${this.autofocus}
          autocomplete=${Ro(this.autocomplete)}
          aria-label=${this.label}
          ?disabled=${this.disabled}
          max=${Ro(this.max)}
          maxlength=${Ro(this.maxLength)}
          min=${Ro(this.min)}
          minlength=${Ro(this.minLength)}
          ?multiple=${this.multiple}
          name=${Ro(this.name)}
          pattern=${Ro(this.pattern)}
          placeholder=${Ro(this.placeholder)}
          ?readonly=${this.readonly}
          ?required=${this.required}
          step=${Ro(this.step)}
          .value=${this._value}
          @blur=${this._onBlur}
          @change=${this._onChange}
          @focus=${this._onFocus}
          @input=${this._onInput}
          @keydown=${this._onKeyDown}
        />
        <slot name="content-after"></slot>
      </div>
    `}};ln.styles=rn,ln.formAssociated=!0,ln.shadowRootOptions={...so.shadowRootOptions,delegatesFocus:!0},an([ao()],ln.prototype,"autocomplete",void 0),an([ao({type:Boolean,reflect:!0})],ln.prototype,"autofocus",void 0),an([ao({attribute:"default-value"})],ln.prototype,"defaultValue",void 0),an([ao({type:Boolean,reflect:!0})],ln.prototype,"disabled",void 0),an([ao({type:Boolean,reflect:!0})],ln.prototype,"focused",void 0),an([ao({type:Boolean,reflect:!0})],ln.prototype,"invalid",void 0),an([ao({attribute:!1})],ln.prototype,"label",void 0),an([ao({type:Number})],ln.prototype,"max",void 0),an([ao({type:Number})],ln.prototype,"maxLength",void 0),an([ao({type:Number})],ln.prototype,"min",void 0),an([ao({type:Number})],ln.prototype,"minLength",void 0),an([ao({type:Boolean,reflect:!0})],ln.prototype,"multiple",void 0),an([ao({reflect:!0})],ln.prototype,"name",void 0),an([ao()],ln.prototype,"pattern",void 0),an([ao()],ln.prototype,"placeholder",void 0),an([ao({type:Boolean,reflect:!0})],ln.prototype,"readonly",void 0),an([ao({type:Boolean,reflect:!0})],ln.prototype,"required",void 0),an([ao({type:Number})],ln.prototype,"step",void 0),an([ao({reflect:!0})],ln.prototype,"type",null),an([ao()],ln.prototype,"value",null),an([ho("#input")],ln.prototype,"_inputEl",void 0),an([lo()],ln.prototype,"_value",void 0),an([lo()],ln.prototype,"_type",void 0),ln=an([mo("vscode-textfield")],ln);const cn=We({tagName:"vscode-textfield",elementClass:ln,react:E,displayName:"VscodeTextfield",events:{onChange:"change",onInput:"input",onInvalid:"invalid"}}),dn=[_o,Qe`
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
  `];var hn=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};let pn=class extends go{constructor(){super(...arguments),this.icon="",this.label=void 0,this.toggleable=!1,this.checked=!1,this._isSlotEmpty=!0}_handleSlotChange(){this._isSlotEmpty=!((this._assignedNodes?.length??0)>0)}_handleButtonClick(){this.toggleable&&(this.checked=!this.checked,this.dispatchEvent(new Event("change")))}render(){const e=this.checked?"true":"false";return Nt`
      <button
        type="button"
        aria-label=${Ro(this.label)}
        role=${Ro(this.toggleable?"switch":void 0)}
        aria-checked=${Ro(this.toggleable?e:void 0)}
        class=${Po({checked:this.toggleable&&this.checked})}
        @click=${this._handleButtonClick}
      >
        ${this.icon?Nt`<vscode-icon name=${this.icon}></vscode-icon>`:Vt}
        <slot
          @slotchange=${this._handleSlotChange}
          class=${Po({empty:this._isSlotEmpty,textOnly:!this.icon})}
        ></slot>
      </button>
    `}};var un;pn.styles=dn,hn([ao({reflect:!0})],pn.prototype,"icon",void 0),hn([ao()],pn.prototype,"label",void 0),hn([ao({type:Boolean,reflect:!0})],pn.prototype,"toggleable",void 0),hn([ao({type:Boolean,reflect:!0})],pn.prototype,"checked",void 0),hn([lo()],pn.prototype,"_isSlotEmpty",void 0),hn([(e,t)=>{const{slot:o}={},s="slot"+(o?`[name=${o}]`:":not([name])");return co(e,t,{get(){const e=this.renderRoot?.querySelector(s);return e?.assignedNodes(un)??[]}})}],pn.prototype,"_assignedNodes",void 0),pn=hn([mo("vscode-toolbar-button")],pn),We({tagName:"vscode-toolbar-button",elementClass:pn,react:E,displayName:"VscodeToolbarButton",events:{onChange:"change"}});const vn=[_o,Qe`
    :host {
      display: block;
    }

    div {
      gap: 4px;
      display: flex;
      align-items: center;
    }
  `];let fn=class extends go{render(){return Nt`<div><slot></slot></div>`}};fn.styles=vn,fn=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r}([mo("vscode-toolbar-container")],fn),We({tagName:"vscode-toolbar-container",elementClass:fn,react:E,displayName:"VscodeToolbarContainer"});let bn=class extends Event{constructor(e,t,o,s){super("context-request",{bubbles:!0,composed:!0}),this.context=e,this.contextTarget=t,this.callback=o,this.subscribe=s??!1}};let gn=class{constructor(e,t,o,s){if(this.subscribe=!1,this.provided=!1,this.value=void 0,this.t=(e,t)=>{this.unsubscribe&&(this.unsubscribe!==t&&(this.provided=!1,this.unsubscribe()),this.subscribe||this.unsubscribe()),this.value=e,this.host.requestUpdate(),this.provided&&!this.subscribe||(this.provided=!0,this.callback&&this.callback(e,t)),this.unsubscribe=t},this.host=e,void 0!==t.context){const e=t;this.context=e.context,this.callback=e.callback,this.subscribe=e.subscribe??!1}else this.context=t,this.callback=o,this.subscribe=s??!1;this.host.addController(this)}hostConnected(){this.dispatchRequest()}hostDisconnected(){this.unsubscribe&&(this.unsubscribe(),this.unsubscribe=void 0)}dispatchRequest(){this.host.dispatchEvent(new bn(this.context,this.host,this.t,this.subscribe))}};class mn{get value(){return this.o}set value(e){this.setValue(e)}setValue(e,t=!1){const o=t||!Object.is(e,this.o);this.o=e,o&&this.updateObservers()}constructor(e){this.subscriptions=new Map,this.updateObservers=()=>{for(const[e,{disposer:t}]of this.subscriptions)e(this.o,t)},void 0!==e&&(this.value=e)}addCallback(e,t,o){if(!o)return void e(this.value);this.subscriptions.has(e)||this.subscriptions.set(e,{disposer:()=>{this.subscriptions.delete(e)},consumerHost:t});const{disposer:s}=this.subscriptions.get(e);e(this.value,s)}clearCallbacks(){this.subscriptions.clear()}}let _n=class extends Event{constructor(e,t){super("context-provider",{bubbles:!0,composed:!0}),this.context=e,this.contextTarget=t}};class yn extends mn{constructor(e,t,o){super(void 0!==t.context?t.initialValue:o),this.onContextRequest=e=>{if(e.context!==this.context)return;const t=e.contextTarget??e.composedPath()[0];t!==this.host&&(e.stopPropagation(),this.addCallback(e.callback,t,e.subscribe))},this.onProviderRequest=e=>{if(e.context!==this.context)return;if((e.contextTarget??e.composedPath()[0])===this.host)return;const t=new Set;for(const[o,{consumerHost:s}]of this.subscriptions)t.has(o)||(t.add(o),s.dispatchEvent(new bn(this.context,s,o,!0)));e.stopPropagation()},this.host=e,void 0!==t.context?this.context=t.context:this.context=t,this.attachListeners(),this.host.addController?.(this)}attachListeners(){this.host.addEventListener("context-request",this.onContextRequest),this.host.addEventListener("context-provider",this.onProviderRequest)}hostConnected(){this.host.dispatchEvent(new _n(this.context,this.host))}}function xn({context:e}){return(t,o)=>{const s=new WeakMap;if("object"==typeof o)return{get(){return t.get.call(this)},set(e){return s.get(this).setValue(e),t.set.call(this,e)},init(t){return s.set(this,new yn(this,{context:e,initialValue:t})),t}};{t.constructor.addInitializer(t=>{s.set(t,new yn(t,{context:e}))});const i=Object.getOwnPropertyDescriptor(t,o);let n;if(void 0===i){const e=new WeakMap;n={get(){return e.get(this)},set(t){s.get(this).setValue(t),e.set(this,t)},configurable:!0,enumerable:!0}}else{const e=i.set;n={...i,set(t){s.get(this).setValue(t),e?.call(this,t)}}}return void Object.defineProperty(t,o,n)}}}function wn({context:e,subscribe:t}){return(o,s)=>{"object"==typeof s?s.addInitializer(function(){new gn(this,{context:e,callback:e=>{o.set.call(this,e)},subscribe:t})}):o.constructor.addInitializer(o=>{new gn(o,{context:e,callback:e=>{o[s]=e},subscribe:t})})}}const Cn=[_o,Qe`
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
  `],Sn="vscode-list",kn=Symbol("configContext"),En=e=>e instanceof Element&&e.matches("vscode-tree-item"),An=(e,t)=>{const o=t.length,s=(i=e)instanceof Element&&i.matches("vscode-tree")?-1:e.level;var i;"branch"in e&&(e.branch=o>0),t.forEach((t,o)=>{t.path="path"in e?[...e.path,o]:[o],t.level=s+1,t.dataset.path=t.path.join(".")})},On=e=>{const t=e.lastElementChild;return t&&En(t)?t.branch&&t.open?On(t):t:e},In=e=>{if(!e.parentElement)return null;if(!En(e.parentElement))return null;const t=$n(e.parentElement);return t||In(e.parentElement)},$n=e=>{let t=e.nextElementSibling;for(;t&&!En(t);)t=t.nextElementSibling;return t};function Pn(e){return e.parentElement&&En(e.parentElement)?e.parentElement:null}var Rn=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const Bn="singleClick",Dn="doubleClick",Mn="none",Tn=[" ","ArrowDown","ArrowUp","ArrowLeft","ArrowRight","Enter","Escape","Shift"];let Nn=class extends go{constructor(){super(),this.expandMode="singleClick",this.hideArrows=!1,this.indent=8,this.indentGuides="onHover",this.multiSelect=!1,this._treeContextState={isShiftPressed:!1,activeItem:null,selectedItems:new Set,hoveredItem:null,allItems:null,itemListUpToDate:!1,focusedItem:null,prevFocusedItem:null,hasBranchItem:!1,rootElement:this,highlightedItems:new Set,highlightIndentGuides:()=>{this._highlightIndentGuides()},emitSelectEvent:()=>{this._emitSelectEvent()}},this._configContext={hideArrows:this.hideArrows,expandMode:this.expandMode,indent:this.indent,indentGuides:this.indentGuides,multiSelect:this.multiSelect},this._handleComponentKeyDown=e=>{const t=e.key;switch(Tn.includes(t)&&(e.stopPropagation(),e.preventDefault()),t){case" ":case"Enter":this._handleEnterPress();break;case"ArrowDown":this._handleArrowDownPress();break;case"ArrowLeft":this._handleArrowLeftPress(e);break;case"ArrowRight":this._handleArrowRightPress();break;case"ArrowUp":this._handleArrowUpPress();break;case"Shift":this._handleShiftPress()}},this._handleComponentKeyUp=e=>{"Shift"===e.key&&(this._treeContextState.isShiftPressed=!1)},this._handleSlotChange=()=>{this._treeContextState.itemListUpToDate=!1,An(this,this._assignedTreeItems),this.updateComplete.then(()=>{if(null===this._treeContextState.activeItem){const e=this.querySelector(":scope > vscode-tree-item");e&&(e.active=!0)}})},this.addEventListener("keyup",this._handleComponentKeyUp),this.addEventListener("keydown",this._handleComponentKeyDown)}connectedCallback(){super.connectedCallback(),this.role="tree"}willUpdate(e){this._updateConfigContext(e),e.has("multiSelect")&&(this.ariaMultiSelectable=this.multiSelect?"true":"false")}expandAll(){this.querySelectorAll("vscode-tree-item").forEach(e=>{e.branch&&(e.open=!0)})}collapseAll(){this.querySelectorAll("vscode-tree-item").forEach(e=>{e.branch&&(e.open=!1)})}updateHasBranchItemFlag(){const e=this._assignedTreeItems.some(e=>e.branch);this._treeContextState={...this._treeContextState,hasBranchItem:e}}_emitSelectEvent(){const e=new CustomEvent("vsc-tree-select",{detail:Array.from(this._treeContextState.selectedItems)});this.dispatchEvent(e)}_highlightIndentGuideOfItem(e){if(e.branch&&e.open)e.highlightedGuides=!0,this._treeContextState.highlightedItems?.add(e);else{const t=Pn(e);t&&(t.highlightedGuides=!0,this._treeContextState.highlightedItems?.add(t))}}_highlightIndentGuides(){this.indentGuides!==Mn&&(this._treeContextState.highlightedItems?.forEach(e=>e.highlightedGuides=!1),this._treeContextState.highlightedItems?.clear(),this._treeContextState.activeItem&&this._highlightIndentGuideOfItem(this._treeContextState.activeItem),this._treeContextState.selectedItems.forEach(e=>{this._highlightIndentGuideOfItem(e)}))}_updateConfigContext(e){const{hideArrows:t,expandMode:o,indent:s,indentGuides:i,multiSelect:n}=this;e.has("hideArrows")&&(this._configContext={...this._configContext,hideArrows:t}),e.has("expandMode")&&(this._configContext={...this._configContext,expandMode:o}),e.has("indent")&&(this._configContext={...this._configContext,indent:s}),e.has("indentGuides")&&(this._configContext={...this._configContext,indentGuides:i}),e.has("multiSelect")&&(this._configContext={...this._configContext,multiSelect:n})}_focusItem(e){e.active=!0,e.updateComplete.then(()=>{e.focus(),this._highlightIndentGuides()})}_focusPrevItem(){if(this._treeContextState.focusedItem){const e=(e=>{const{parentElement:t}=e;if(!t||!En(e))return null;let o=e.previousElementSibling;for(;o&&!En(o);)o=o.previousElementSibling;if(!o&&En(t))return t;if(o&&o.branch&&o.open)return On(o);return o})(this._treeContextState.focusedItem);e&&(this._focusItem(e),this._treeContextState.isShiftPressed&&this.multiSelect&&(e.selected=!e.selected,this._emitSelectEvent()))}}_focusNextItem(){if(this._treeContextState.focusedItem){const e=(e=>{const{parentElement:t}=e;if(!t||!En(e))return null;let o;if(e.branch&&e.open){const t=e.querySelector("vscode-tree-item");t?o=t:(o=$n(e),o||(o=In(e)))}else o=$n(e),o||(o=In(e));return o||e})(this._treeContextState.focusedItem);e&&(this._focusItem(e),this._treeContextState.isShiftPressed&&this.multiSelect&&(e.selected=!e.selected,this._emitSelectEvent()))}}_handleArrowRightPress(){if(!this._treeContextState.focusedItem)return;const{focusedItem:e}=this._treeContextState;e.branch&&(e.open?this._focusNextItem():e.open=!0)}_handleArrowLeftPress(e){if(e.ctrlKey)return void this.collapseAll();if(!this._treeContextState.focusedItem)return;const{focusedItem:t}=this._treeContextState,o=Pn(t);t.branch&&t.open?t.open=!1:o&&o.branch&&this._focusItem(o)}_handleArrowDownPress(){this._treeContextState.focusedItem?this._focusNextItem():this._focusItem(this._assignedTreeItems[0])}_handleArrowUpPress(){this._treeContextState.focusedItem?this._focusPrevItem():this._focusItem(this._assignedTreeItems[0])}_handleEnterPress(){const{focusedItem:e}=this._treeContextState;e&&(this._treeContextState.selectedItems.forEach(e=>e.selected=!1),this._treeContextState.selectedItems.clear(),this._highlightIndentGuides(),e.selected=!0,this._emitSelectEvent(),e.branch&&(e.open=!e.open))}_handleShiftPress(){this._treeContextState.isShiftPressed=!0}render(){return Nt`<div>
      <slot @slotchange=${this._handleSlotChange}></slot>
    </div>`}};Nn.styles=Cn,Rn([ao({type:String,attribute:"expand-mode"})],Nn.prototype,"expandMode",void 0),Rn([ao({type:Boolean,reflect:!0,attribute:"hide-arrows"})],Nn.prototype,"hideArrows",void 0),Rn([ao({type:Number,reflect:!0})],Nn.prototype,"indent",void 0),Rn([ao({type:String,attribute:"indent-guides",useDefault:!0,reflect:!0})],Nn.prototype,"indentGuides",void 0),Rn([ao({type:Boolean,reflect:!0,attribute:"multi-select"})],Nn.prototype,"multiSelect",void 0),Rn([xn({context:Sn})],Nn.prototype,"_treeContextState",void 0),Rn([xn({context:kn})],Nn.prototype,"_configContext",void 0),Rn([uo({selector:"vscode-tree-item"})],Nn.prototype,"_assignedTreeItems",void 0),Nn=Rn([mo("vscode-tree")],Nn),We({tagName:"vscode-tree",elementClass:Nn,react:E,displayName:"VscodeTree",events:{onVscTreeSelect:"vsc-tree-select"}});const Ln=[_o,Qe`
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
  `];var jn,Vn=function(e,t,o,s){var i,n=arguments.length,r=n<3?t:null===s?s=Object.getOwnPropertyDescriptor(t,o):s;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(e,t,o,s);else for(var a=e.length-1;a>=0;a--)(i=e[a])&&(r=(n<3?i(r):n>3?i(t,o,r):i(t,o))||r);return n>3&&r&&Object.defineProperty(t,o,r),r};const zn=Nt`<svg
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
</svg>`;let Fn=jn=class extends go{set selected(e){this._selected=e,e?this._treeContextState.selectedItems.add(this):this._treeContextState.selectedItems.delete(this),this.ariaSelected=e?"true":"false",this._updateActionsVisibility()}get selected(){return this._selected}set path(e){this._path=e}get path(){return this._path}constructor(){super(),this.active=!1,this.branch=!1,this.hasActiveItem=!1,this.hasSelectedItem=!1,this.highlightedGuides=!1,this.open=!1,this.level=0,this._selected=!1,this._path=[],this._hasBranchIcon=!1,this._hasBranchOpenedIcon=!1,this._hasLeafIcon=!1,this._hasDescriptionSlotContent=!1,this._hasActionsSlotContent=!1,this._hasDecorationSlotContent=!1,this._treeContextState={isShiftPressed:!1,selectedItems:new Set,hoveredItem:null,allItems:null,itemListUpToDate:!1,focusedItem:null,prevFocusedItem:null,hasBranchItem:!1,rootElement:null,activeItem:null},this._isPointerInside=!1,this._hasKeyboardFocus=!1,this._handleMainSlotChange=()=>{this._mainSlotChange(),this._treeContextState.itemListUpToDate=!1},this._handleComponentFocus=()=>{this._treeContextState.focusedItem&&this._treeContextState.focusedItem!==this&&(this._treeContextState.isShiftPressed||(this._treeContextState.prevFocusedItem=this._treeContextState.focusedItem),this._treeContextState.focusedItem=null),this._treeContextState.focusedItem=this},this._handlePointerEnter=()=>{this._isPointerInside=!0,this._claimHover()},this._handlePointerLeave=e=>{this._isPointerInside=!1,this._treeContextState.hoveredItem===this&&(this._treeContextState.hoveredItem=null),this._clearHoverState();const t=e.relatedTarget;if(t instanceof Element){const e=t.closest("vscode-tree-item");e&&e!==this&&e.isConnected&&e._adoptHoverFromSibling()}},this._handleFocusIn=()=>{this._updateFocusState()},this._handleFocusOut=()=>{this._updateFocusState()},this._internals=this.attachInternals(),this.addEventListener("focus",this._handleComponentFocus),this.addEventListener("pointerenter",this._handlePointerEnter),this.addEventListener("pointerleave",this._handlePointerLeave),this.addEventListener("focusin",this._handleFocusIn),this.addEventListener("focusout",this._handleFocusOut)}connectedCallback(){super.connectedCallback(),this._mainSlotChange(),this.role="treeitem",this.ariaDisabled="false"}firstUpdated(e){super.firstUpdated(e),this._refreshDescriptionSlotState(),this._refreshActionsSlotState(),this._refreshDecorationSlotState(),this.matches(":hover")?(this._isPointerInside=!0,this._claimHover()):this._updateActionsVisibility()}willUpdate(e){e.has("active")&&this._toggleActiveState(),(e.has("open")||e.has("branch"))&&this._setAriaExpanded()}_setAriaExpanded(){this.branch?this.ariaExpanded=this.open?"true":"false":this.ariaExpanded=null}_setHasActiveItemFlagOnParent(e,t){const o=function(e){return e.parentElement&&e.parentElement instanceof Fn?e.parentElement:null}(e);o&&(o.hasActiveItem=t)}_refreshDescriptionSlotState(){const e=(this._descriptionSlotElements?.length??0)>0;this._hasDescriptionSlotContent=e,this._setCustomState("has-description",e)}_refreshActionsSlotState(){const e=(this._actionsSlotElements?.length??0)>0;this._hasActionsSlotContent=e,this._setCustomState("has-actions",e),this._updateActionsVisibility()}_refreshDecorationSlotState(){const e=(this._decorationSlotElements?.length??0)>0,t=this._hasDecorationSlotContent;this._hasDecorationSlotContent=e,this._setCustomState("has-decoration",e),t!==e&&this.requestUpdate()}_setCustomState(e,t){if(this._internals?.states)try{t?this._internals.states.add(e):this._internals.states.delete(e)}catch{t?this._internals.states.add(`--${e}`):this._internals.states.delete(`--${e}`)}}_getActiveElement(){const e=this.getRootNode({composed:!0});return e instanceof Document?e.activeElement instanceof Element?e.activeElement:null:e instanceof ShadowRoot&&e.activeElement instanceof Element?e.activeElement:null}_isActiveElementInActions(e){return!!e&&(this._actionsSlotElements??[]).some(t=>t===e||t.contains(e))}_updateActionsVisibility(){if(!this._hasActionsSlotContent)return void this._setCustomState("show-actions",!1);const e=this._getActiveElement(),t=this._isActiveElementInActions(e),o=this.selected||this._isPointerInside||this._hasKeyboardFocus||t;this._setCustomState("show-actions",o)}_updateFocusState(){const e=this.matches(":focus-visible");this._setCustomState("focus-visible",e);const t=this._getActiveElement();let o=null;if(t instanceof Element&&(o=t.closest("vscode-tree-item"),!o)){const e=t.getRootNode();e instanceof ShadowRoot&&e.host instanceof jn&&(o=e.host)}const s=o===this;this._hasKeyboardFocus=s,this._setCustomState("keyboard-focus",s),this._updateActionsVisibility()}_clearHoverState(){this._isPointerInside=!1,this._setCustomState("hover",!1),this._updateActionsVisibility()}_adoptHoverFromSibling(){this._isPointerInside=!0,this._claimHover()}_claimHover(){const e=this._treeContextState;e.hoveredItem&&e.hoveredItem!==this&&e.hoveredItem._clearHoverState(),e.hoveredItem=this,this._setCustomState("hover",!0),this._updateActionsVisibility()}_toggleActiveState(){this.active?(this._treeContextState.activeItem&&(this._treeContextState.activeItem.active=!1,this._setHasActiveItemFlagOnParent(this._treeContextState.activeItem,!1)),this._treeContextState.activeItem=this,this._setHasActiveItemFlagOnParent(this,!0),this.tabIndex=0,this._setCustomState("active",!0)):(this._treeContextState.activeItem===this&&(this._treeContextState.activeItem=null,this._setHasActiveItemFlagOnParent(this,!1)),this.tabIndex=-1,this._setCustomState("active",!1))}_selectItem(e){const{selectedItems:t}=this._treeContextState,{multiSelect:o}=this._configContext,s=new Set(t);o&&e?this.selected=!this.selected:(Array.from(t).forEach(e=>{e!==this&&(e.selected=!1)}),t.clear(),this.selected=!0);const i=new Set([...s,...t]);i.add(this),i.forEach(e=>e._updateActionsVisibility())}_selectRange(){const e=this._treeContextState.prevFocusedItem;if(!e||e===this)return;const t=new Set(this._treeContextState.selectedItems);this._treeContextState.itemListUpToDate||(this._treeContextState.allItems=this._treeContextState.rootElement.querySelectorAll("vscode-tree-item"),this._treeContextState.allItems&&this._treeContextState.allItems.forEach((e,t)=>{e.dataset.score=t.toString()}),this._treeContextState.itemListUpToDate=!0);let o=+(e.dataset.score??-1),s=+(this.dataset.score??-1);o>s&&([o,s]=[s,o]),Array.from(this._treeContextState.selectedItems).forEach(e=>e.selected=!1),this._treeContextState.selectedItems.clear(),this._selectItemsAndAllVisibleDescendants(o,s);const i=new Set([...t,...this._treeContextState.selectedItems]);i.add(this),i.forEach(e=>e._updateActionsVisibility())}_selectItemsAndAllVisibleDescendants(e,t){let o=e;for(;o<=t;)if(this._treeContextState.allItems){const e=this._treeContextState.allItems[o];if(e.branch&&!e.open){e.selected=!0;o+=e.querySelectorAll("vscode-tree-item").length}else e.branch&&e.open?(e.selected=!0,o+=this._selectItemsAndAllVisibleDescendants(o+1,t)):(e.selected=!0,o+=1)}return o}_mainSlotChange(){this._initiallyAssignedTreeItems.forEach(e=>{e.setAttribute("slot","children")})}_handleChildrenSlotChange(){An(this,this._childrenTreeItems),this._treeContextState.rootElement&&this._treeContextState.rootElement.updateHasBranchItemFlag()}_handleDescriptionSlotChange(){this._refreshDescriptionSlotState()}_handleActionsSlotChange(){this._refreshActionsSlotState()}_handleDecorationSlotChange(){this._refreshDecorationSlotState()}_handleContentClick(e){e.stopPropagation();const t=e.ctrlKey||e.metaKey,o=e.shiftKey;o&&this._configContext.multiSelect?(this._selectRange(),this._treeContextState.emitSelectEvent?.(),this.updateComplete.then(()=>{this._treeContextState.highlightIndentGuides?.()})):(this._selectItem(t),this._treeContextState.emitSelectEvent?.(),this.updateComplete.then(()=>{this._treeContextState.highlightIndentGuides?.()}),this._configContext.expandMode===Bn&&(!this.branch||this._configContext.multiSelect&&t||(this.open=!this.open))),this.active=!0,o||(this._treeContextState.prevFocusedItem=this)}_handleDoubleClick(e){this._configContext.expandMode===Dn&&(!this.branch||this._configContext.multiSelect&&(e.ctrlKey||e.metaKey)||(this.open=!this.open))}_handleIconSlotChange(e){const t=e.target,o=t.assignedElements().length>0;switch(t.name){case"icon-branch":this._hasBranchIcon=o;break;case"icon-branch-opened":this._hasBranchOpenedIcon=o;break;case"icon-leaf":this._hasLeafIcon=o}}render(){const{hideArrows:e,indent:t,indentGuides:o}=this._configContext,{hasBranchItem:s}=this._treeContextState;let i=3+this.level*t;const n=e?3:13,r=3+this.level*t+n;this.branch||e||!s||(i+=30);const a=this._hasBranchIcon&&this.branch||this._hasBranchOpenedIcon&&this.branch&&this.open||this._hasLeafIcon&&!this.branch,l={wrapper:!0,active:this.active,"has-description":this._hasDescriptionSlotContent,"has-actions":this._hasActionsSlotContent,"has-decoration":this._hasDecorationSlotContent},c={children:!0,guide:o!==Mn,"default-guide":o!==Mn,"highlighted-guide":this.highlightedGuides},d={"icon-container":!0,"has-icon":a},h={content:!0,"has-description":this._hasDescriptionSlotContent,"has-decoration":this._hasDecorationSlotContent};return Nt` <div class="root">
      <div
        class=${Po(l)}
        part="wrapper"
        @click=${this._handleContentClick}
        @dblclick=${this._handleDoubleClick}
        .style=${Bo({paddingLeft:`${i}px`})}
      >
        ${this.branch&&!e?Nt`<div
              class=${Po({"arrow-container":!0,"icon-rotated":this.open})}
              part="arrow-icon-container"
            >
              ${zn}
            </div>`:Vt}
        <div class=${Po(d)} part="icon-container">
          ${this.branch&&!this.open?Nt`<slot
                name="icon-branch"
                @slotchange=${this._handleIconSlotChange}
              ></slot>`:Vt}
          ${this.branch&&this.open?Nt`<slot
                name="icon-branch-opened"
                @slotchange=${this._handleIconSlotChange}
              ></slot>`:Vt}
          ${this.branch?Vt:Nt`<slot
                name="icon-leaf"
                @slotchange=${this._handleIconSlotChange}
              ></slot>`}
        </div>
        <div class=${Po(h)} part="content">
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
        class=${Po(c)}
        .style=${Bo({"--indentation-guide-left":`${r}px`})}
        role="group"
        part="children"
      >
        <slot
          name="children"
          @slotchange=${this._handleChildrenSlotChange}
        ></slot>
      </div>
    </div>`}};Fn.styles=Ln,Vn([ao({type:Boolean})],Fn.prototype,"active",void 0),Vn([ao({type:Boolean,reflect:!0})],Fn.prototype,"branch",void 0),Vn([ao({type:Boolean})],Fn.prototype,"hasActiveItem",void 0),Vn([ao({type:Boolean})],Fn.prototype,"hasSelectedItem",void 0),Vn([ao({type:Boolean})],Fn.prototype,"highlightedGuides",void 0),Vn([ao({type:Boolean,reflect:!0})],Fn.prototype,"open",void 0),Vn([ao({type:Number,reflect:!0})],Fn.prototype,"level",void 0),Vn([ao({type:Boolean,reflect:!0})],Fn.prototype,"selected",null),Vn([lo()],Fn.prototype,"_hasBranchIcon",void 0),Vn([lo()],Fn.prototype,"_hasBranchOpenedIcon",void 0),Vn([lo()],Fn.prototype,"_hasLeafIcon",void 0),Vn([lo()],Fn.prototype,"_hasDescriptionSlotContent",void 0),Vn([lo()],Fn.prototype,"_hasActionsSlotContent",void 0),Vn([lo()],Fn.prototype,"_hasDecorationSlotContent",void 0),Vn([wn({context:Sn,subscribe:!0})],Fn.prototype,"_treeContextState",void 0),Vn([wn({context:kn,subscribe:!0})],Fn.prototype,"_configContext",void 0),Vn([uo({selector:"vscode-tree-item"})],Fn.prototype,"_initiallyAssignedTreeItems",void 0),Vn([uo({selector:"vscode-tree-item",slot:"children"})],Fn.prototype,"_childrenTreeItems",void 0),Vn([uo({slot:"description",flatten:!0})],Fn.prototype,"_descriptionSlotElements",void 0),Vn([uo({slot:"actions",flatten:!0})],Fn.prototype,"_actionsSlotElements",void 0),Vn([uo({slot:"decoration",flatten:!0})],Fn.prototype,"_decorationSlotElements",void 0),Fn=jn=Vn([mo("vscode-tree-item")],Fn),We({tagName:"vscode-tree-item",elementClass:Fn,react:E,displayName:"VscodeTreeItem"});const Hn={focusable:"false",preserveAspectRatio:"xMidYMid meet"};var Un,qn,Wn,Kn,Gn,Yn={exports:{}};function Xn(){if(qn)return Un;qn=1;return Un="SECRET_DO_NOT_PASS_THIS_OR_YOU_WILL_BE_FIRED"}function Zn(){if(Kn)return Wn;Kn=1;var e=Xn();function t(){}function o(){}return o.resetWarningCache=t,Wn=function(){function s(t,o,s,i,n,r){if(r!==e){var a=new Error("Calling PropTypes validators directly is not supported by the `prop-types` package. Use PropTypes.checkPropTypes() to call them. Read more at http://fb.me/use-check-prop-types");throw a.name="Invariant Violation",a}}function i(){return s}s.isRequired=s;var n={array:s,bigint:s,bool:s,func:s,number:s,object:s,string:s,symbol:s,any:s,arrayOf:i,element:s,elementType:s,instanceOf:i,node:s,objectOf:i,oneOf:i,oneOfType:i,shape:i,exact:i,checkPropTypes:o,resetWarningCache:t};return n.PropTypes=n,n}}function Jn(){return Gn||(Gn=1,Yn.exports=Zn()()),Yn.exports}const Qn=i(Jn()),er=a.forwardRef(function({className:e,children:t,tabIndex:o,xmlns:s="http://www.w3.org/2000/svg",preserveAspectRatio:i="xMidYMid meet",...n},r){const{tabindex:a,...l}=function({width:e,height:t,viewBox:o=`0 0 ${e} ${t}`,...s}={}){const{tabindex:i,...n}=s,r={...Hn,...n,width:e,height:t,viewBox:o};return r["aria-label"]||r["aria-labelledby"]?(r.role="img",null!=i&&(r.focusable="true",r.tabindex=i)):r["aria-hidden"]=!0,r}({...n,tabindex:o}),c=l;return e&&(c.className=e),null!=a&&(c.tabIndex="number"==typeof a?a:Number(o)),r&&(c.ref=r),s&&(c.xmlns=s),i&&(c.preserveAspectRatio=i),E.createElement("svg",c,t)});er.displayName="Icon",er.propTypes={"aria-hidden":Qn.oneOfType([Qn.bool,Qn.oneOf(["true","false"])]),"aria-label":Qn.string,"aria-labelledby":Qn.string,children:Qn.node,className:Qn.string,height:Qn.oneOfType([Qn.number,Qn.string]),preserveAspectRatio:Qn.string,tabIndex:Qn.oneOfType([Qn.number,Qn.string]),viewBox:Qn.string,width:Qn.oneOfType([Qn.number,Qn.string]),xmlns:Qn.string};const tr=E.forwardRef(function({children:e,size:t=16,...o},s){return E.createElement(er,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 32 32",fill:"currentColor",...o},v.jsx("path",{d:"M26,22a3.86,3.86,0,0,0-2,.57l-3.09-3.1a6,6,0,0,0,0-6.94L24,9.43A3.86,3.86,0,0,0,26,10a4,4,0,1,0-4-4,3.86,3.86,0,0,0,.57,2l-3.1,3.09a6,6,0,0,0-6.94,0L9.43,8A3.86,3.86,0,0,0,10,6a4,4,0,1,0-4,4,3.86,3.86,0,0,0,2-.57l3.09,3.1a6,6,0,0,0,0,6.94L8,22.57A3.86,3.86,0,0,0,6,22a4,4,0,1,0,4,4,3.86,3.86,0,0,0-.57-2l3.1-3.09a6,6,0,0,0,6.94,0L22.57,24A3.86,3.86,0,0,0,22,26a4,4,0,1,0,4-4ZM26,4a2,2,0,1,1-2,2A2,2,0,0,1,26,4ZM4,6A2,2,0,1,1,6,8,2,2,0,0,1,4,6ZM6,28a2,2,0,1,1,2-2A2,2,0,0,1,6,28Zm10-8a4,4,0,1,1,4-4A4,4,0,0,1,16,20Zm10,8a2,2,0,1,1,2-2A2,2,0,0,1,26,28Z"}),e)}),or=E.forwardRef(function({children:e,size:t=16,...o},s){return E.createElement(er,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 32 32",fill:"currentColor",...o},v.jsx("path",{d:"M28.07 21 22 15 28.07 9 29.5 10.41 24.86 15 29.5 19.59 28.07 21z"}),v.jsx("path",{d:"M22,30H20V25a5,5,0,0,0-5-5H9a5,5,0,0,0-5,5v5H2V25a7,7,0,0,1,7-7h6a7,7,0,0,1,7,7Z"}),v.jsx("path",{d:"M12,4A5,5,0,1,1,7,9a5,5,0,0,1,5-5m0-2a7,7,0,1,0,7,7A7,7,0,0,0,12,2Z"}),e)}),sr=E.forwardRef(function({children:e,size:t=16,...o},s){return 16===t||"16"===t||"16px"===t?E.createElement(er,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...o},v.jsx("path",{d:"M15.5,7.8C14.3,4.7,11.3,2.6,8,2.5C4.7,2.6,1.7,4.7,0.5,7.8c0,0.1,0,0.2,0,0.3c1.2,3.1,4.1,5.2,7.5,5.3 c3.3-0.1,6.3-2.2,7.5-5.3C15.5,8.1,15.5,7.9,15.5,7.8z M8,12.5c-2.7,0-5.4-2-6.5-4.5c1-2.5,3.8-4.5,6.5-4.5s5.4,2,6.5,4.5 C13.4,10.5,10.6,12.5,8,12.5z"}),v.jsx("path",{d:"M8,5C6.3,5,5,6.3,5,8s1.3,3,3,3s3-1.3,3-3S9.7,5,8,5z M8,10c-1.1,0-2-0.9-2-2s0.9-2,2-2s2,0.9,2,2S9.1,10,8,10z"}),e):E.createElement(er,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 32 32",fill:"currentColor",...o},v.jsx("path",{d:"M30.94,15.66A16.69,16.69,0,0,0,16,5,16.69,16.69,0,0,0,1.06,15.66a1,1,0,0,0,0,.68A16.69,16.69,0,0,0,16,27,16.69,16.69,0,0,0,30.94,16.34,1,1,0,0,0,30.94,15.66ZM16,25c-5.3,0-10.9-3.93-12.93-9C5.1,10.93,10.7,7,16,7s10.9,3.93,12.93,9C26.9,21.07,21.3,25,16,25Z"}),v.jsx("path",{d:"M16,10a6,6,0,1,0,6,6A6,6,0,0,0,16,10Zm0,10a4,4,0,1,1,4-4A4,4,0,0,1,16,20Z"}),e)}),ir=E.forwardRef(function({children:e,size:t=16,...o},s){return 16===t||"16"===t||"16px"===t?E.createElement(er,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 16 16",fill:"currentColor",...o},v.jsx("path",{d:"M14.5,14h-13c-0.2,0-0.3-0.1-0.4-0.2c-0.1-0.2-0.1-0.3,0-0.5l6.5-12C7.7,1,8,0.9,8.2,1.1c0.1,0,0.2,0.1,0.2,0.2l6.5,12 c0.1,0.2,0.1,0.3,0,0.5C14.9,13.9,14.7,14,14.5,14z M2.3,13h11.3L8,2.5L2.3,13z"}),v.jsx("path",{d:"M7.5 6H8.5V9.5H7.5z"}),v.jsx("path",{d:"M8,10.8c-0.4,0-0.8,0.3-0.8,0.8s0.3,0.8,0.8,0.8c0.4,0,0.8-0.3,0.8-0.8S8.4,10.8,8,10.8z"}),e):E.createElement(er,{width:t,height:t,ref:s,xmlns:"http://www.w3.org/2000/svg",viewBox:"0 0 32 32",fill:"currentColor",...o},v.jsx("path",{d:"M16,23a1.5,1.5,0,1,0,1.5,1.5A1.5,1.5,0,0,0,16,23Z"}),v.jsx("path",{d:"M15 12H17V21H15z"}),v.jsx("path",{d:"M29,30H3a1,1,0,0,1-.8872-1.4614l13-25a1,1,0,0,1,1.7744,0l13,25A1,1,0,0,1,29,30ZM4.6507,28H27.3493l.002-.0033L16.002,6.1714h-.004L4.6487,27.9967Z"}),e)});function nr({className:e,defaultValue:t,value:o,min:s=0,max:i=100,...n}){const r=a.useMemo(()=>Array.isArray(o)?o:Array.isArray(t)?t:[s,i],[o,t,s,i]);return v.jsxs(Me,{"data-slot":"slider",defaultValue:t,value:o,min:s,max:i,className:C("relative flex w-full touch-none items-center select-none data-[disabled]:opacity-50 data-[orientation=vertical]:h-full data-[orientation=vertical]:min-h-44 data-[orientation=vertical]:w-auto data-[orientation=vertical]:flex-col",e),...n,children:[v.jsx(Te,{"data-slot":"slider-track",className:C("relative grow overflow-hidden rounded-full bg-muted data-[orientation=horizontal]:h-1.5 data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-1.5"),children:v.jsx(Ne,{"data-slot":"slider-range",className:C("absolute bg-primary data-[orientation=horizontal]:h-full data-[orientation=vertical]:w-full")})}),Array.from({length:r.length},(e,t)=>v.jsx(Le,{"data-slot":"slider-thumb",className:"block size-4 shrink-0 rounded-full border border-primary bg-white shadow-sm ring-ring/50 transition-[color,box-shadow] hover:ring-4 focus-visible:ring-4 focus-visible:outline-hidden disabled:pointer-events-none disabled:opacity-50"},t))]})}function rr({className:e,...t}){return v.jsx("div",{"data-slot":"table-container",className:"relative w-full overflow-x-auto",children:v.jsx("table",{"data-slot":"table",className:C("w-full caption-bottom text-sm",e),...t})})}function ar({className:e,...t}){return v.jsx("thead",{"data-slot":"table-header",className:C("[&_tr]:border-b [&_tr]:border-vscode-editor-background",e),...t})}function lr({className:e,...t}){return v.jsx("tbody",{"data-slot":"table-body",className:C("[&_tr:last-child]:border-0",e),...t})}function cr({className:e,...t}){return v.jsx("tr",{"data-slot":"table-row",className:C("border-b border-vscode-editor-background transition-colors hover:bg-vscode-list-hoverBackground has-aria-expanded:bg-vscode-list-hoverBackground data-[state=selected]:bg-vscode-list-activeSelectionBackground",e),...t})}function dr({className:e,...t}){return v.jsx("th",{"data-slot":"table-head",className:C("h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",e),...t})}function hr({className:e,...t}){return v.jsx("td",{"data-slot":"table-cell",className:C("py-2 px-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",e),...t})}function pr({className:e,...t}){return v.jsx("div",{"data-slot":"skeleton",className:C("animate-pulse rounded-md bg-accent",e),...t})}function ur({...e}){return v.jsx(V,{"data-slot":"dialog",...e})}function vr({...e}){return v.jsx(q,{"data-slot":"dialog-portal",...e})}function fr({className:e,...t}){return v.jsx(W,{"data-slot":"dialog-overlay",className:C("data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",e),...t})}function br({className:e,children:t,showCloseButton:o=!0,...s}){return v.jsxs(vr,{"data-slot":"dialog-portal",children:[v.jsx(fr,{}),v.jsxs(z,{"data-slot":"dialog-content",className:C("bg-background data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 rounded-lg border p-3 shadow-lg duration-200 outline-none sm:max-w-lg",e),...s,children:[t,o&&v.jsxs(F,{"data-slot":"dialog-close",className:"ring-offset-background focus:ring-ring data-[state=open]:bg-accent data-[state=open]:text-muted-foreground absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",children:[v.jsx(N,{}),v.jsx("span",{className:"sr-only",children:"Close"})]})]})]})}function gr({className:e,...t}){return v.jsx("div",{"data-slot":"dialog-header",className:C("flex flex-col gap-2 text-center sm:text-left",e),...t})}function mr({className:e,showCloseButton:t=!1,children:o,...s}){return v.jsxs("div",{"data-slot":"dialog-footer",className:C("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",e),...s,children:[o,t&&v.jsx(F,{asChild:!0,children:v.jsx(w,{variant:"outline",children:"Close"})})]})}function _r({className:e,...t}){return v.jsx(H,{"data-slot":"dialog-title",className:C("text-lg leading-none font-semibold",e),...t})}function yr({className:e,...t}){return v.jsx(U,{"data-slot":"dialog-description",className:C("text-muted-foreground text-sm",e),...t})}const xr=({checked:e,onChange:t,disabled:o=!1,noContainer:s,icon:i,size:n="default"})=>{const r="compact"===n,a=r?"w-8":"w-10",l=r?"h-4":"h-5",c=r?"h-3 w-3":"h-4 w-4",d=r?"translate-x-4":"translate-x-5",h=r?"[&>svg]:h-3 [&>svg]:w-3":"[&>svg]:h-4 [&>svg]:w-4",p=r?"[&>svg]:left-0.5 [&>svg]:bottom-0.5":"[&>svg]:left-1 [&>svg]:bottom-0.5",u=v.jsxs("label",{className:`flex items-center relative ${o?"cursor-not-allowed":"cursor-pointer"} ${s?`${a} ${l}`:"pl-12.5 h-6"}`,children:[v.jsx("input",{type:"checkbox",className:"opacity-0 w-0 h-0",checked:e,onChange:e=>t(e.target.checked),disabled:o}),v.jsx("span",{className:`absolute top-0 left-0 right-0 bottom-0 ${a} ${l} rounded-[20px] transition-all duration-[400ms] ${o?"cursor-not-allowed":"cursor-pointer"} ${o?"bg-vscode-disabledForeground":e?"bg-vscode-button-background":"bg-vscode-disabledForeground"}`,children:v.jsx("span",{className:`absolute ${c} left-0.5 bottom-0.5 rounded-full bg-vscode-button-foreground transition-transform duration-[400ms] ${e?d:""}`})}),e&&i?v.jsx("span",{className:`[&>svg]:absolute ${h} ${p}`,children:i}):null]});return s?u:v.jsx("div",{className:"my-2.5",children:u})},wr=new Set(["id","title","description","message","showExpandable"]);function Cr(e,t){if("object"==typeof e.data&&null!==e.data&&t in e.data)return e.data[t]}function Sr(e){if(!1===e.showExpandable)return!1;if(e.cause)return!0;if(e.stack)return!0;if(!e.data||"object"!=typeof e.data)return!1;return Object.keys(e.data).some(e=>!wr.has(e))}function kr(e,t){if(e.mustRestart)return{primary:{label:t("chat:error.reloadWindow"),handler:$r}};switch(e.category){case"budget":return function(e,t){const o=e?.data,s=o?.showFeedbackButton,i={primary:{label:t("chat:error.viewPlan"),handler:Pr}};s&&(i.primary={label:t("chat:apiRequest.budgetExceededInternal.button"),handler:Rr});return i}(e,t);case"auth":return{primary:{label:t("chat:error.signIn"),handler:Er}};case"network":return function(e,t){if("PayloadTooLargeError"===e.name){const e=1===A.getState().messages.filter(e=>"user"===e.role).length;return{primary:e?{label:t("chat:error.startNewTask"),handler:Dr}:{label:t("chat:error.rollbackLastMessage"),handler:Br},secondary:e?void 0:{label:t("chat:error.startNewTask"),handler:Dr}}}return{primary:{label:t("chat:error.retry"),handler:Ar}}}(e,t);case"marketplace":return function(e,t){const o=e?.data;if(o?.retryHandler)return{primary:{label:t("settings:marketplace.retry_connection"),handler:o.retryHandler}};return{}}(e,t);case"config":return{primary:{label:t("chat:error.openSettings"),handler:Or}};case"task":return function(e,t){if("MaxTurnsReachedError"===e.name)return{primary:{label:t("chat:error.continueTask"),tooltip:t("chat:error.continueTaskTurnsTooltip"),handler:Mr},secondary:{label:t("chat:error.openSettings"),handler:Ir}};if("MaxCostReachedError"===e.name)return{primary:{label:t("chat:error.continueTask"),tooltip:t("chat:error.continueTaskCostTooltip"),handler:Tr},secondary:{label:t("chat:error.openSettings"),handler:Ir}};return{}}(e,t);default:return{}}}function Er(){k.postMessage({type:"signIn"})}function Ar(){k.postMessage({type:"retry"})}function Or(){k.postMessage({type:"executeCommand",commands:["bob-code.openSettings"]})}function Ir(){k.postMessage({type:"openSettings",tab:"chat"})}function $r(){k.postMessage({type:"executeCommand",commands:["workbench.action.reloadWindow"]})}function Pr(){k.postMessage({type:"executeCommand",commands:["bob-code.openSettings"]})}function Rr(){k.postMessage({type:"executeCommand",commands:["bob-code.sendFeedback"]})}function Br(){k.postMessage({type:"chatRollback"})}function Dr(){k.postMessage({type:"changeTask",new:!0})}function Mr(){k.postMessage({type:"continueTask",reason:"maxTurns"})}function Tr(){k.postMessage({type:"continueTask",reason:"maxCost"})}function Nr({error:e}){const{t:t}=S(),[o,s]=a.useState(!1),{primary:i,secondary:n}=kr(e,t),r=function(e){const t=Cr(e,"title");return"string"==typeof t?t:e.name.replace(/Error$/,"").replace(/([A-Z])/g," $1").trim()+" Error"}(e),l=function(e){const t=Cr(e,"description");if("string"==typeof t)return t;const o=Cr(e,"message");return"string"==typeof o?o:e.message||void 0}(e),c=function(e){if(!Sr(e))return;const t={};if(e.cause&&(t.cause=e.cause),e.stack&&(t.stack=e.stack),e.data&&"object"==typeof e.data){const o=e.data;for(const[e,s]of Object.entries(o))wr.has(e)||(t[e]=s)}return Object.keys(t).length>0?t:void 0}(e),d=Sr(e),h=i,p=n;return v.jsx("div",{className:"mx-4 my-2",role:"alert","aria-live":"polite",children:v.jsxs("div",{className:"border border-vscode-panel-border bg-vscode-sidebar-background rounded-[6px] overflow-hidden",children:[v.jsxs("div",{className:"flex items-center gap-2 p-2",children:[v.jsx(L,{className:"size-4 shrink-0 text-vscode-errorForeground","aria-hidden":"true"}),v.jsx("span",{className:"min-w-0 flex-1 font-medium",children:r}),d&&v.jsx(O,{content:t(o?"common:actions.collapse":"common:actions.expand"),children:v.jsx(w,{variant:"ghost",size:"icon-sm",onClick:()=>s(!o),"aria-expanded":o,"aria-label":t(o?"common:actions.collapse":"common:actions.expand"),children:o?v.jsx(T,{className:"text-vscode-foreground","aria-hidden":"true"}):v.jsx(I,{className:"text-vscode-foreground","aria-hidden":"true"})})})]}),(l||h||p)&&v.jsxs("div",{className:"flex flex-col gap-2 px-2 pb-2",children:[l&&v.jsx("div",{className:"text-[12px] font-medium leading-normal text-vscode-descriptionForeground",children:l}),(h||p)&&v.jsxs("div",{className:"flex gap-2 items-start",children:[h&&v.jsx(O,{content:i.tooltip??i.label,children:v.jsx(w,{onClick:i.handler,className:"shrink-0 rounded-[6px]",children:i.label})}),p&&v.jsx(O,{content:n.tooltip??n.label,children:v.jsx(w,{variant:"secondary",onClick:n.handler,className:"shrink-0 rounded-[6px]",children:n.label})})]})]}),o&&d&&c&&v.jsx("div",{className:"border-t border-vscode-input-border px-2 pb-2 pt-2",children:c.stack&&"string"==typeof c.stack?v.jsxs(v.Fragment,{children:[v.jsx("div",{className:"text-xs font-medium mb-1 text-vscode-descriptionForeground",children:"Stack Trace:"}),v.jsx(j,{source:c.stack,language:"text"}),Object.keys(c).length>1&&v.jsxs(v.Fragment,{children:[v.jsx("div",{className:"text-xs font-medium mt-2 mb-1 text-vscode-descriptionForeground",children:"Additional Details:"}),v.jsx(j,{source:JSON.stringify(Object.fromEntries(Object.entries(c).filter(([e])=>"stack"!==e)),null,2),language:"json"})]})]}):v.jsx(j,{source:JSON.stringify(c,null,2),language:"json"})})]})})}const Lr=()=>{const{t:e}=S("chat"),t=$(e=>e.activeProfile),[o,s]=a.useState(!1),i=e("budget.unlimited"),n=a.useMemo(()=>((e,t)=>{if(!e)return null;const{usage:o,budget_limit:s,user_id:i}=e;return null==o?null:{percentage:s?Math.floor(100-o/s*100):100,spend:o.toFixed(2),limit:s?s.toFixed(2):t,email:i||""}})(t,i),[t,i]),r=async()=>{s(!0);try{await P("all"),await R(!1)}finally{s(!1)}};return a.useEffect(()=>{r()},[]),{budget:n,isLoading:o,fetchBudget:r}};var jr,Vr={},zr={};var Fr,Hr={};function Ur(){if(Fr)return Hr;Fr=1,Object.defineProperty(Hr,"__esModule",{value:!0}),Hr.parseMentions=function(t){const n=[];for(const r of function(t){const o=t.matchAll(e),n=new Set,r=[];for(const e of o){const t=i(s(e[1]));n.has(t)||(n.add(t),r.push(t))}return r}(t))if("problems"===r||"terminal"===r)n.push({type:r,path:""});else if(r.startsWith("git:")){const e=o(r.slice(4));e&&n.push(e)}else n.push({type:r.endsWith("/")?"folder":"file",path:r});return n},Hr.escapeSpaces=function(e){return e.replace(/ /g,"\\ ")},Hr.unescapeSpaces=i;const e=/(?:^|(?<=\s))@((?:[^\s\\]|\\ )+)/g;const t=/^[a-f0-9]{7,40}$/;function o(e){if(!e)return null;if("changes"===e)return{type:"git-changes",path:""};if(e.startsWith("changes:")){const t=e.slice(8);return t?{type:"git-changes",path:"",ref:t}:{type:"git-changes",path:""}}let o=e;return(o.startsWith("branch:")||o.startsWith("commit:"))&&(o=o.slice(7)),t.test(o)?{type:"git-commit",path:"",ref:o}:{type:"git-branch",path:"",ref:o}}function s(e){return e.replace(/[.,;!?)]+$/,"")}function i(e){return e.replace(/\\ /g," ")}return Hr}var qr,Wr={};var Kr,Gr={};function Yr(){return Kr||(Kr=1,Object.defineProperty(Gr,"__esModule",{value:!0}),Gr.TelemetryEventName=void 0,(t=e||(Gr.TelemetryEventName=e={})).TURN_COMPLETED="Turn Completed",t.TOOL_USED="Tool Used",t.TASK_CREATED="Task Created",t.CUSTOM_MODE_CREATED="Custom Mode Created",t.CUSTOM_MODE_UPDATED="Custom Mode Updated",t.CUSTOM_MODE_DELETED="Custom Mode Deleted",t.MCP_TOOL_EXECUTED="MCP Tool Executed",t.MCP_SERVER_CREATED="MCP Server Created",t.MCP_SERVER_DISABLED="MCP Server Disabled",t.MCP_SERVER_ENABLED="MCP Server Enabled",t.MCP_SERVER_DELETED="MCP Server Deleted",t.MCP_TOOL_DISABLED="MCP Tool Disabled",t.MCP_TOOL_ENABLED="MCP Tool Enabled",t.MCP_TOOL_ALWAYS_ALLOW_ENABLED="MCP Tool Always Allow Enabled",t.MCP_TOOL_ALWAYS_ALLOW_DISABLED="MCP Tool Always Allow Disabled",t.SKILL_ADDED="Skill Added",t.SKILL_ENABLED="Skill Enabled",t.SKILL_DISABLED="Skill Disabled",t.SKILL_DELETED="Skill Deleted",t.SKILL_INVOKED="Skill Invoked",t.MARKETPLACE_TAB_VIEWED="Marketplace Tab Viewed",t.MARKETPLACE_INSTALL_BUTTON_CLICKED="Marketplace Install Button Clicked",t.GIT_COMMIT_EVENT="Git Commit Event",t.CHAT_ACCEPTED="Chat Accepted",t.PROMPT_ENHANCED="Prompt Enhanced",t.WORKFLOW_STARTED="Workflow Started",t.WORKFLOW_FINISHED="Workflow Finished",t.WORKFLOW_STEP="Workflow Step",t.WORKFLOW_STEP_ERROR="Workflow Step Error",t.WORKFLOW_STEP_RETRY="Workflow Step Retry",t.SETTING_CHANGED="Setting Changed"),Gr;var e,t}var Xr,Zr={};var Jr,Qr,ea={},ta={};function oa(){if(Qr)return ea;Qr=1,Object.defineProperty(ea,"__esModule",{value:!0}),ea.BobUserConfig=void 0;const e=function(){if(Jr)return ta;Jr=1,Object.defineProperty(ta,"__esModule",{value:!0}),ta.trackObjectChanges=function i(n,r,a,l=""){for(const c of Object.keys(a)){const d=l?`${l}.${c}`:c,h=r[c],p=a[c];if(null===p||"object"!=typeof p||Array.isArray(p)||null===h||"object"!=typeof h||Array.isArray(h))if(o(p)&&o(h))for(const e of p){const t=s(e);if(!t)continue;i(n,h.find(e=>s(e)===t)??{},e,`${d}[${t}]`)}else{const o=JSON.stringify(h),s=JSON.stringify(p);if(o!==s){const i={eventType:e.TelemetryEventName.SETTING_CHANGED,properties:{name:d,prevData:o,data:s}};d===t&&!1===p?n.trackEventUnconditional(i):n.trackEvent(i)}}else i(n,h,p,d)}};const e=Yr(),t="telemetry.enabled";function o(e){return Array.isArray(e)&&e.length>0&&e.every(e=>"object"==typeof e&&null!==e)}function s(e){return"string"==typeof e.toolId?e.toolId:"string"==typeof e.groupId?e.groupId:void 0}return ta}();class t{constructor(o,i){s(this,"defaultValues"),s(this,"storage"),s(this,"_onChangedEvents",[]),s(this,"_sectionChangedEvent",{}),s(this,"_telemetry"),s(this,"_valuesCache"),s(this,"_oldValuesBeforeUpdate"),this.defaultValues=o,this.storage=i,this.storage.onDidChangeConfiguration(()=>{const o=this._oldValuesBeforeUpdate||this._valuesCache;this._oldValuesBeforeUpdate=void 0,this._valuesCache=void 0;const s=this.values;this._onChangedEvents.forEach(e=>e(s)),this._telemetry&&o&&(0,e.trackObjectChanges)(this._telemetry,o,s);for(const e in this._sectionChangedEvent){const i=t.getNestedValue(o,e),n=t.getNestedValue(s,e);JSON.stringify(i)!==JSON.stringify(n)&&this._sectionChangedEvent[e].forEach(e=>e(s))}})}async initialize(){await(this.storage.initialize?.())}setTelemetry(e){this._telemetry=e}onChange(e){this._onChangedEvents.push(e)}onChangeProperty(e,t){this._sectionChangedEvent[e]||(this._sectionChangedEvent[e]=[]),this._sectionChangedEvent[e].push(t)}static getNestedValue(e,t){if(t&&""!==t.trim())return t.split(".").reduce((e,t)=>{if(t&&e&&"object"==typeof e)return e[t]},e)}static getNestedValueWithTemplate(e,o){if(!o||""===o.trim())return;const s=o.match(/^(.+?)\[(.+?)=(.+?)\]\.(.+)$/);if(!s)return t.getNestedValue(e,o);const[,i,n,r,a]=s,l=t.getNestedValue(e,i);if(!Array.isArray(l))return;const c=l.find(e=>"object"==typeof e&&null!==e&&e[n]===r);return c&&"object"==typeof c?c[a]:void 0}static getChanges(e,t){for(const o in t)["string","number","boolean"].includes(typeof t[o])?t[o]===e[o]&&delete t[o]:Array.isArray(t[o])?JSON.stringify(t[o])===JSON.stringify(e[o])&&delete t[o]:"object"==typeof t[o]&&("object"==typeof e[o]?JSON.stringify(t[o])===JSON.stringify(e[o])?delete t[o]:this.getChanges(e[o],t[o]):delete t[o])}static deepMerge(e,t){return function e(t,o){const s={};for(const i in t)void 0!==o[i]?Array.isArray(t[i])!==Array.isArray(o[i])||typeof t[i]!=typeof o[i]?s[i]=t[i]:Array.isArray(t[i])&&Array.isArray(o[i])?s[i]=o[i]:"object"==typeof t[i]&&"object"==typeof o[i]?s[i]=e(t[i],o[i]):s[i]=o[i]:s[i]=t[i];return structuredClone(s)}(e,t)}get values(){if(this._valuesCache)return structuredClone(this._valuesCache);const e=this.storage.get()||{},o=t.deepMerge(this.defaultValues,e);return this._valuesCache=o,o}resolveTemplateSyntax(e,o){const s=e.match(/^(.+?)\[(.+?)=(.+?)\]\.(.+)$/);if(!s)return null;const[,i,n,r,a]=s,l=this.values,c=t.getNestedValue(l,i),d=Array.isArray(c)?[...c]:[],h=d.findIndex(e=>"object"==typeof e&&null!==e&&e[n]===r);if(h>=0){const e=d[h];d[h]={..."object"==typeof e&&null!==e?e:{},[a]:o}}else d.push({[n]:r,[a]:o});return{path:i,value:d}}updateAt(e,t){const o=this.resolveTemplateSyntax(e,t);if(o)return this.updateAt(o.path,o.value);let s={},i=s;const n=e.split("."),r=n.pop();if(r){for(let e=0;e<n.length;e++){const t=n[e];i[t]={},i=i[t]}return i[r]=t,this.update(s)}}async update(e){const o=this.values,s=t.deepMerge(o,e);t.getChanges(this.defaultValues,s),this._oldValuesBeforeUpdate=o,this._valuesCache=void 0,await this.storage.update(s)}}return ea.BobUserConfig=t,ea}var sa,ia={};var na,ra,aa={};function la(){return na||(na=1,function(e){function t(e){return"object"==typeof e&&null!==e&&!Array.isArray(e)}function o(e,s){const i=structuredClone(e);if(!t(s))return i;for(const[n,r]of Object.entries(s)){if(void 0===r)continue;const e=i[n];t(e)&&t(r)?i[n]=o(e,r):i[n]=structuredClone(r)}return i}Object.defineProperty(e,"__esModule",{value:!0}),e.DEFAULT_BOB_CONFIG=e.DEFAULT_APPROVED_COMMANDS=e.logLevelOrder=void 0,e.createBobConfig=function(t){const s=o(e.DEFAULT_BOB_CONFIG,t),i=t?.approval?.allowed_permissions;if(i){const t=e.DEFAULT_BOB_CONFIG.approval.allowed_permissions;s.approval.allowed_permissions=[...t,...i.filter(e=>!t.includes(e))]}return s},e.logLevelOrder={debug:10,info:20,warn:30,error:40,silent:50},e.DEFAULT_APPROVED_COMMANDS=["cat","git diff","git log","git rev-parse","git show","git status","grep","head","tail","ls","sort","wc","which","du","df"],e.DEFAULT_BOB_CONFIG={session:{defaultMode:"agent",model:"",maxTurns:100,maxCost:0,limitWarnings:!1,autoCondense:!0,compactionThresholdPercent:90,mcp:!0,subagents:!0,maxReadFile:500,respectGitIgnore:!1,profileId:""},approval:{autoApprovalEnabled:!0,outsideWorkspaceAllowed:!1,allowed_permissions:["read"],permissionOptions:[],allowedExecutors:[{toolId:"execute_command",approvedCommands:e.DEFAULT_APPROVED_COMMANDS,deniedCommands:[]}]},logging:{logLevel:"info",enableFileLogging:!1,logDir:""},sources:[],review:{commitPrompt:{enabled:!0},exclusions:[".vscode/**"]},migrations:{commands:!1,legacyBobCodeTaskMigrationDone:!1},tasks:{retentionDays:14},addons:{suppressInstallPopup:[]},isCommandSecurityEnabled:!0,findings:{bobTips:{enabled:!0},vulnerabilityScan:{enabled:!0},secretsScan:{enabled:!0}},chat:{maxFileSymbols:100,maxImageFileSize:10,maxTotalImageSize:100,pastedTextLineThreshold:10,toolRequestTimeout:0,groupTools:!0,diagnostics:{includeMessages:!0,maxMessages:50,diagnosticWaitMs:1e3},promptEnhancement:{enabled:!1,includeHistory:!0}},telemetry:{enabled:!0,excludePayload:!1},experiments:{},playgroundPath:"",llmAttributionEnabled:!0,commitCoAuthor:!1}}(aa)),aa}var ca=(ra||(ra=1,function(e){Object.defineProperty(e,"__esModule",{value:!0}),e.logLevelOrder=e.createBobConfig=e.DEFAULT_BOB_CONFIG=e.DEFAULT_APPROVED_COMMANDS=e.substituteTemplateValues=e.getNestedValueWithTemplate=e.getNestedValue=e.MCP_LEGACY_GLOBAL_FILENAME=e.MCP_WORKSPACE_FILENAME=e.MCP_GLOBAL_FILENAME=e.TelemetryEventName=e.mentionRegex=e.unescapeSpaces=e.parseMentions=e.escapeSpaces=e.shouldShowTeamInfo=e.getPlanDisplayName=e.isRefreshDateInPast=e.formatRefreshDate=e.getTrialStatus=e.isEnterprise=e.isTrial=e.DAYS_WARNING_THRESHOLD=void 0;var t=(jr||(jr=1,function(e){function t(e){return e?.plan?.includes("ibm_bob_trial")??!1}Object.defineProperty(e,"__esModule",{value:!0}),e.DAYS_WARNING_THRESHOLD=void 0,e.isTrial=t,e.isEnterprise=function(e){return e?.plan?.includes("ibm_bob_enterprise")??!1},e.getTrialStatus=function(o){const s=t(o);if(!s||!o?.refresh_at)return{isTrial:s,daysRemaining:null,isExpired:!1,isExpiringSoon:!1};const i=1e3*o.refresh_at-Date.now(),n=Math.ceil(i/864e5);return{isTrial:!0,daysRemaining:n,isExpired:n<=0,isExpiringSoon:n>0&&n<e.DAYS_WARNING_THRESHOLD}},e.formatRefreshDate=function(e,t="en"){return new Date(1e3*e).toLocaleDateString(t,{month:"short",day:"numeric"})},e.isRefreshDateInPast=function(e){return new Date(1e3*e)<new Date},e.getPlanDisplayName=function(e){return e?.plan_name?e.plan_name:e?.plan?e.plan.replace(/^ibm_bob_/,""):void 0},e.shouldShowTeamInfo=function(e){if(!e||e.length<2)return!1;const t=new Map;for(const o of e){const e=o.instance_id||"default";t.set(e,(t.get(e)||0)+1)}return!(Array.from(t.values()).every(e=>1===e)&&t.size>1)},e.DAYS_WARNING_THRESHOLD=5}(zr)),zr);Object.defineProperty(e,"DAYS_WARNING_THRESHOLD",{enumerable:!0,get:function(){return t.DAYS_WARNING_THRESHOLD}}),Object.defineProperty(e,"isTrial",{enumerable:!0,get:function(){return t.isTrial}}),Object.defineProperty(e,"isEnterprise",{enumerable:!0,get:function(){return t.isEnterprise}}),Object.defineProperty(e,"getTrialStatus",{enumerable:!0,get:function(){return t.getTrialStatus}}),Object.defineProperty(e,"formatRefreshDate",{enumerable:!0,get:function(){return t.formatRefreshDate}}),Object.defineProperty(e,"isRefreshDateInPast",{enumerable:!0,get:function(){return t.isRefreshDateInPast}}),Object.defineProperty(e,"getPlanDisplayName",{enumerable:!0,get:function(){return t.getPlanDisplayName}}),Object.defineProperty(e,"shouldShowTeamInfo",{enumerable:!0,get:function(){return t.shouldShowTeamInfo}});var o=Ur();Object.defineProperty(e,"escapeSpaces",{enumerable:!0,get:function(){return o.escapeSpaces}}),Object.defineProperty(e,"parseMentions",{enumerable:!0,get:function(){return o.parseMentions}}),Object.defineProperty(e,"unescapeSpaces",{enumerable:!0,get:function(){return o.unescapeSpaces}});var s=(qr||(qr=1,Object.defineProperty(Wr,"__esModule",{value:!0}),Wr.mentionRegex=void 0,Wr.mentionRegex=/(?:^|(?<=\s))@((?:[^\s\\]|\\ )+)/),Wr);Object.defineProperty(e,"mentionRegex",{enumerable:!0,get:function(){return s.mentionRegex}});var i=Yr();Object.defineProperty(e,"TelemetryEventName",{enumerable:!0,get:function(){return i.TelemetryEventName}});var n=(Xr||(Xr=1,Object.defineProperty(Zr,"__esModule",{value:!0}),Zr.MCP_LEGACY_GLOBAL_FILENAME=Zr.MCP_GLOBAL_FILENAME=Zr.MCP_WORKSPACE_FILENAME=void 0,Zr.getServerKey=function(e,t){return`${t||"source"}::${e}`},Zr.parseServerKey=function(e){const t=e.lastIndexOf("::");if(-1===t)throw new Error(`Invalid ServerKey format: ${e}`);return{configPath:e.substring(0,t),serverName:e.substring(t+2)}},Zr.MCP_WORKSPACE_FILENAME="mcp.json",Zr.MCP_GLOBAL_FILENAME="mcp.json",Zr.MCP_LEGACY_GLOBAL_FILENAME="mcp_settings.json"),Zr);Object.defineProperty(e,"MCP_GLOBAL_FILENAME",{enumerable:!0,get:function(){return n.MCP_GLOBAL_FILENAME}}),Object.defineProperty(e,"MCP_WORKSPACE_FILENAME",{enumerable:!0,get:function(){return n.MCP_WORKSPACE_FILENAME}}),Object.defineProperty(e,"MCP_LEGACY_GLOBAL_FILENAME",{enumerable:!0,get:function(){return n.MCP_LEGACY_GLOBAL_FILENAME}});const r=oa();e.getNestedValue=r.BobUserConfig.getNestedValue.bind(r.BobUserConfig),e.getNestedValueWithTemplate=r.BobUserConfig.getNestedValueWithTemplate.bind(r.BobUserConfig);var a=function(){if(sa)return ia;function e(e,t){const o=t.split(".");let s=e;for(const i of o){if(null==s)return;if("object"!=typeof s||null===s)return;s=s[i]}return s}function t(e){return null==e?"":"string"==typeof e?e:"number"==typeof e||"boolean"==typeof e?String(e):Array.isArray(e)?e.join(", "):"object"==typeof e?JSON.stringify(e):String(e)}sa=1,Object.defineProperty(ia,"__esModule",{value:!0}),ia.substituteTemplateValues=function(s,i={}){let n=s,r=0;const a=Array.from(s.matchAll(o));for(const o of a){const s=o[0],a=o[1].trim(),l=o.index??0;let c=e(i,a);if(void 0===c&&(c=i[a]),null==c){const e=n.slice(0,l+r),t=n.slice(l+r+s.length);n=e+t,r-=s.length;continue}const d=t(c),h=n.slice(0,l+r),p=n.slice(l+r+s.length);n=h+d+p,r+=d.length-s.length}return n};const o=/\{([^}{"':,\n]+)\}/g;return ia}();Object.defineProperty(e,"substituteTemplateValues",{enumerable:!0,get:function(){return a.substituteTemplateValues}});var l=la();Object.defineProperty(e,"DEFAULT_APPROVED_COMMANDS",{enumerable:!0,get:function(){return l.DEFAULT_APPROVED_COMMANDS}}),Object.defineProperty(e,"DEFAULT_BOB_CONFIG",{enumerable:!0,get:function(){return l.DEFAULT_BOB_CONFIG}}),Object.defineProperty(e,"createBobConfig",{enumerable:!0,get:function(){return l.createBobConfig}}),Object.defineProperty(e,"logLevelOrder",{enumerable:!0,get:function(){return l.logLevelOrder}})}(Vr)),Vr);function da(e){return e?.plan?.includes("ibm_bob_enterprise")??!1}const ha=({isOpen:e,title:t,message:o,confirmText:s,cancelText:i,isLoading:n=!1,error:r,onConfirm:a,onCancel:l,isDestructive:c=!1})=>v.jsx(ur,{open:e,onOpenChange:e=>!e&&l(),children:v.jsxs(br,{showCloseButton:!1,children:[v.jsxs(gr,{children:[v.jsx(_r,{children:t}),v.jsx(yr,{children:o})]}),v.jsxs(mr,{children:[r&&v.jsx("p",{className:"text-xs text-vscode-errorForeground mr-auto",children:r}),v.jsx(w,{onClick:l,disabled:n,children:i}),v.jsx(w,{variant:c?"destructive":"primary",onClick:a,disabled:n,children:s})]})]})});export{tr as A,Ve as B,ha as C,ur as D,Nr as E,er as I,ze as L,pr as S,rr as T,or as U,sn as V,ir as W,ar as a,cr as b,dr as c,lr as d,hr as e,cn as f,br as g,gr as h,_r as i,yr as j,mr as k,xr as l,da as m,Fe as n,je as o,ko as p,le as q,nr as r,ca as s,ri as t,Lr as u,sr as v};
