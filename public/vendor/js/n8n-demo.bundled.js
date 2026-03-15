/**
 * @license
 * Copyright 2019 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const t=window.ShadowRoot&&(void 0===window.ShadyCSS||window.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,i=Symbol(),s=new Map;class e{constructor(t,s){if(this._$cssResult$=!0,s!==i)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t}get styleSheet(){let i=s.get(this.cssText);return t&&void 0===i&&(s.set(this.cssText,i=new CSSStyleSheet),i.replaceSync(this.cssText)),i}toString(){return this.cssText}}const o=t?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let s="";for(const i of t.cssRules)s+=i.cssText;return(t=>new e("string"==typeof t?t:t+"",i))(s)})(t):t
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */;var n;const r=window.trustedTypes,h=r?r.emptyScript:"",l=window.reactiveElementPolyfillSupport,d={toAttribute(t,i){switch(i){case Boolean:t=t?h:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t)}return t},fromAttribute(t,i){let s=t;switch(i){case Boolean:s=null!==t;break;case Number:s=null===t?null:Number(t);break;case Object:case Array:try{s=JSON.parse(t)}catch(t){s=null}}return s}},a=(t,i)=>i!==t&&(i==i||t==t),c={attribute:!0,type:String,converter:d,reflect:!1,hasChanged:a};class u extends HTMLElement{constructor(){super(),this._$Et=new Map,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Ei=null,this.o()}static addInitializer(t){var i;null!==(i=this.l)&&void 0!==i||(this.l=[]),this.l.push(t)}static get observedAttributes(){this.finalize();const t=[];return this.elementProperties.forEach(((i,s)=>{const e=this._$Eh(s,i);void 0!==e&&(this._$Eu.set(e,s),t.push(e))})),t}static createProperty(t,i=c){if(i.state&&(i.attribute=!1),this.finalize(),this.elementProperties.set(t,i),!i.noAccessor&&!this.prototype.hasOwnProperty(t)){const s="symbol"==typeof t?Symbol():"__"+t,e=this.getPropertyDescriptor(t,s,i);void 0!==e&&Object.defineProperty(this.prototype,t,e)}}static getPropertyDescriptor(t,i,s){return{get(){return this[i]},set(e){const o=this[t];this[i]=e,this.requestUpdate(t,o,s)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)||c}static finalize(){if(this.hasOwnProperty("finalized"))return!1;this.finalized=!0;const t=Object.getPrototypeOf(this);if(t.finalize(),this.elementProperties=new Map(t.elementProperties),this._$Eu=new Map,this.hasOwnProperty("properties")){const t=this.properties,i=[...Object.getOwnPropertyNames(t),...Object.getOwnPropertySymbols(t)];for(const s of i)this.createProperty(s,t[s])}return this.elementStyles=this.finalizeStyles(this.styles),!0}static finalizeStyles(t){const i=[];if(Array.isArray(t)){const s=new Set(t.flat(1/0).reverse());for(const t of s)i.unshift(o(t))}else void 0!==t&&i.push(o(t));return i}static _$Eh(t,i){const s=i.attribute;return!1===s?void 0:"string"==typeof s?s:"string"==typeof t?t.toLowerCase():void 0}o(){var t;this._$Ep=new Promise((t=>this.enableUpdating=t)),this._$AL=new Map,this._$Em(),this.requestUpdate(),null===(t=this.constructor.l)||void 0===t||t.forEach((t=>t(this)))}addController(t){var i,s;(null!==(i=this._$Eg)&&void 0!==i?i:this._$Eg=[]).push(t),void 0!==this.renderRoot&&this.isConnected&&(null===(s=t.hostConnected)||void 0===s||s.call(t))}removeController(t){var i;null===(i=this._$Eg)||void 0===i||i.splice(this._$Eg.indexOf(t)>>>0,1)}_$Em(){this.constructor.elementProperties.forEach(((t,i)=>{this.hasOwnProperty(i)&&(this._$Et.set(i,this[i]),delete this[i])}))}createRenderRoot(){var i;const s=null!==(i=this.shadowRoot)&&void 0!==i?i:this.attachShadow(this.constructor.shadowRootOptions);return((i,s)=>{t?i.adoptedStyleSheets=s.map((t=>t instanceof CSSStyleSheet?t:t.styleSheet)):s.forEach((t=>{const s=document.createElement("style"),e=window.litNonce;void 0!==e&&s.setAttribute("nonce",e),s.textContent=t.cssText,i.appendChild(s)}))})(s,this.constructor.elementStyles),s}connectedCallback(){var t;void 0===this.renderRoot&&(this.renderRoot=this.createRenderRoot()),this.enableUpdating(!0),null===(t=this._$Eg)||void 0===t||t.forEach((t=>{var i;return null===(i=t.hostConnected)||void 0===i?void 0:i.call(t)}))}enableUpdating(t){}disconnectedCallback(){var t;null===(t=this._$Eg)||void 0===t||t.forEach((t=>{var i;return null===(i=t.hostDisconnected)||void 0===i?void 0:i.call(t)}))}attributeChangedCallback(t,i,s){this._$AK(t,s)}_$ES(t,i,s=c){var e,o;const n=this.constructor._$Eh(t,s);if(void 0!==n&&!0===s.reflect){const r=(null!==(o=null===(e=s.converter)||void 0===e?void 0:e.toAttribute)&&void 0!==o?o:d.toAttribute)(i,s.type);this._$Ei=t,null==r?this.removeAttribute(n):this.setAttribute(n,r),this._$Ei=null}}_$AK(t,i){var s,e,o;const n=this.constructor,r=n._$Eu.get(t);if(void 0!==r&&this._$Ei!==r){const t=n.getPropertyOptions(r),h=t.converter,l=null!==(o=null!==(e=null===(s=h)||void 0===s?void 0:s.fromAttribute)&&void 0!==e?e:"function"==typeof h?h:null)&&void 0!==o?o:d.fromAttribute;this._$Ei=r,this[r]=l(i,t.type),this._$Ei=null}}requestUpdate(t,i,s){let e=!0;void 0!==t&&(((s=s||this.constructor.getPropertyOptions(t)).hasChanged||a)(this[t],i)?(this._$AL.has(t)||this._$AL.set(t,i),!0===s.reflect&&this._$Ei!==t&&(void 0===this._$E_&&(this._$E_=new Map),this._$E_.set(t,s))):e=!1),!this.isUpdatePending&&e&&(this._$Ep=this._$EC())}async _$EC(){this.isUpdatePending=!0;try{await this._$Ep}catch(t){Promise.reject(t)}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){var t;if(!this.isUpdatePending)return;this.hasUpdated,this._$Et&&(this._$Et.forEach(((t,i)=>this[i]=t)),this._$Et=void 0);let i=!1;const s=this._$AL;try{i=this.shouldUpdate(s),i?(this.willUpdate(s),null===(t=this._$Eg)||void 0===t||t.forEach((t=>{var i;return null===(i=t.hostUpdate)||void 0===i?void 0:i.call(t)})),this.update(s)):this._$EU()}catch(t){throw i=!1,this._$EU(),t}i&&this._$AE(s)}willUpdate(t){}_$AE(t){var i;null===(i=this._$Eg)||void 0===i||i.forEach((t=>{var i;return null===(i=t.hostUpdated)||void 0===i?void 0:i.call(t)})),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EU(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$Ep}shouldUpdate(t){return!0}update(t){void 0!==this._$E_&&(this._$E_.forEach(((t,i)=>this._$ES(i,this[i],t))),this._$E_=void 0),this._$EU()}updated(t){}firstUpdated(t){}}
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var v;u.finalized=!0,u.elementProperties=new Map,u.elementStyles=[],u.shadowRootOptions={mode:"open"},null==l||l({ReactiveElement:u}),(null!==(n=globalThis.reactiveElementVersions)&&void 0!==n?n:globalThis.reactiveElementVersions=[]).push("1.2.1");const p=globalThis.trustedTypes,f=p?p.createPolicy("lit-html",{createHTML:t=>t}):void 0,w=`lit$${(Math.random()+"").slice(9)}$`,b="?"+w,m=`<${b}>`,g=document,y=(t="")=>g.createComment(t),_=t=>null===t||"object"!=typeof t&&"function"!=typeof t,$=Array.isArray,k=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,S=/-->/g,x=/>/g,C=/>|[ 	\n\r](?:([^\s"'>=/]+)([ 	\n\r]*=[ 	\n\r]*(?:[^ 	\n\r"'`<>=]|("|')|))|$)/g,A=/'/g,M=/"/g,O=/^(?:script|style|textarea)$/i,E=(t=>(i,...s)=>({_$litType$:t,strings:i,values:s}))(1),N=Symbol.for("lit-noChange"),T=Symbol.for("lit-nothing"),j=new WeakMap,U=g.createTreeWalker(g,129,null,!1),z=(t,i)=>{const s=t.length-1,e=[];let o,n=2===i?"<svg>":"",r=k;for(let i=0;i<s;i++){const s=t[i];let h,l,d=-1,a=0;for(;a<s.length&&(r.lastIndex=a,l=r.exec(s),null!==l);)a=r.lastIndex,r===k?"!--"===l[1]?r=S:void 0!==l[1]?r=x:void 0!==l[2]?(O.test(l[2])&&(o=RegExp("</"+l[2],"g")),r=C):void 0!==l[3]&&(r=C):r===C?">"===l[0]?(r=null!=o?o:k,d=-1):void 0===l[1]?d=-2:(d=r.lastIndex-l[2].length,h=l[1],r=void 0===l[3]?C:'"'===l[3]?M:A):r===M||r===A?r=C:r===S||r===x?r=k:(r=C,o=void 0);const c=r===C&&t[i+1].startsWith("/>")?" ":"";n+=r===k?s+m:d>=0?(e.push(h),s.slice(0,d)+"$lit$"+s.slice(d)+w+c):s+w+(-2===d?(e.push(void 0),i):c)}const h=n+(t[s]||"<?>")+(2===i?"</svg>":"");if(!Array.isArray(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return[void 0!==f?f.createHTML(h):h,e]};class I{constructor({strings:t,_$litType$:i},s){let e;this.parts=[];let o=0,n=0;const r=t.length-1,h=this.parts,[l,d]=z(t,i);if(this.el=I.createElement(l,s),U.currentNode=this.el.content,2===i){const t=this.el.content,i=t.firstChild;i.remove(),t.append(...i.childNodes)}for(;null!==(e=U.nextNode())&&h.length<r;){if(1===e.nodeType){if(e.hasAttributes()){const t=[];for(const i of e.getAttributeNames())if(i.endsWith("$lit$")||i.startsWith(w)){const s=d[n++];if(t.push(i),void 0!==s){const t=e.getAttribute(s.toLowerCase()+"$lit$").split(w),i=/([.?@])?(.*)/.exec(s);h.push({type:1,index:o,name:i[2],strings:t,ctor:"."===i[1]?V:"?"===i[1]?B:"@"===i[1]?H:L})}else h.push({type:6,index:o})}for(const i of t)e.removeAttribute(i)}if(O.test(e.tagName)){const t=e.textContent.split(w),i=t.length-1;if(i>0){e.textContent=p?p.emptyScript:"";for(let s=0;s<i;s++)e.append(t[s],y()),U.nextNode(),h.push({type:2,index:++o});e.append(t[i],y())}}}else if(8===e.nodeType)if(e.data===b)h.push({type:2,index:o});else{let t=-1;for(;-1!==(t=e.data.indexOf(w,t+1));)h.push({type:7,index:o}),t+=w.length-1}o++}}static createElement(t,i){const s=g.createElement("template");return s.innerHTML=t,s}}function R(t,i,s=t,e){var o,n,r,h;if(i===N)return i;let l=void 0!==e?null===(o=s._$Cl)||void 0===o?void 0:o[e]:s._$Cu;const d=_(i)?void 0:i._$litDirective$;return(null==l?void 0:l.constructor)!==d&&(null===(n=null==l?void 0:l._$AO)||void 0===n||n.call(l,!1),void 0===d?l=void 0:(l=new d(t),l._$AT(t,s,e)),void 0!==e?(null!==(r=(h=s)._$Cl)&&void 0!==r?r:h._$Cl=[])[e]=l:s._$Cu=l),void 0!==l&&(i=R(t,l._$AS(t,i.values),l,e)),i}class J{constructor(t,i){this.v=[],this._$AN=void 0,this._$AD=t,this._$AM=i}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}p(t){var i;const{el:{content:s},parts:e}=this._$AD,o=(null!==(i=null==t?void 0:t.creationScope)&&void 0!==i?i:g).importNode(s,!0);U.currentNode=o;let n=U.nextNode(),r=0,h=0,l=e[0];for(;void 0!==l;){if(r===l.index){let i;2===l.type?i=new D(n,n.nextSibling,this,t):1===l.type?i=new l.ctor(n,l.name,l.strings,this,t):6===l.type&&(i=new W(n,this,t)),this.v.push(i),l=e[++h]}r!==(null==l?void 0:l.index)&&(n=U.nextNode(),r++)}return o}m(t){let i=0;for(const s of this.v)void 0!==s&&(void 0!==s.strings?(s._$AI(t,s,i),i+=s.strings.length-2):s._$AI(t[i])),i++}}class D{constructor(t,i,s,e){var o;this.type=2,this._$AH=T,this._$AN=void 0,this._$AA=t,this._$AB=i,this._$AM=s,this.options=e,this._$Cg=null===(o=null==e?void 0:e.isConnected)||void 0===o||o}get _$AU(){var t,i;return null!==(i=null===(t=this._$AM)||void 0===t?void 0:t._$AU)&&void 0!==i?i:this._$Cg}get parentNode(){let t=this._$AA.parentNode;const i=this._$AM;return void 0!==i&&11===t.nodeType&&(t=i.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,i=this){t=R(this,t,i),_(t)?t===T||null==t||""===t?(this._$AH!==T&&this._$AR(),this._$AH=T):t!==this._$AH&&t!==N&&this.$(t):void 0!==t._$litType$?this.T(t):void 0!==t.nodeType?this.S(t):(t=>{var i;return $(t)||"function"==typeof(null===(i=t)||void 0===i?void 0:i[Symbol.iterator])})(t)?this.A(t):this.$(t)}M(t,i=this._$AB){return this._$AA.parentNode.insertBefore(t,i)}S(t){this._$AH!==t&&(this._$AR(),this._$AH=this.M(t))}$(t){this._$AH!==T&&_(this._$AH)?this._$AA.nextSibling.data=t:this.S(g.createTextNode(t)),this._$AH=t}T(t){var i;const{values:s,_$litType$:e}=t,o="number"==typeof e?this._$AC(t):(void 0===e.el&&(e.el=I.createElement(e.h,this.options)),e);if((null===(i=this._$AH)||void 0===i?void 0:i._$AD)===o)this._$AH.m(s);else{const t=new J(o,this),i=t.p(this.options);t.m(s),this.S(i),this._$AH=t}}_$AC(t){let i=j.get(t.strings);return void 0===i&&j.set(t.strings,i=new I(t)),i}A(t){$(this._$AH)||(this._$AH=[],this._$AR());const i=this._$AH;let s,e=0;for(const o of t)e===i.length?i.push(s=new D(this.M(y()),this.M(y()),this,this.options)):s=i[e],s._$AI(o),e++;e<i.length&&(this._$AR(s&&s._$AB.nextSibling,e),i.length=e)}_$AR(t=this._$AA.nextSibling,i){var s;for(null===(s=this._$AP)||void 0===s||s.call(this,!1,!0,i);t&&t!==this._$AB;){const i=t.nextSibling;t.remove(),t=i}}setConnected(t){var i;void 0===this._$AM&&(this._$Cg=t,null===(i=this._$AP)||void 0===i||i.call(this,t))}}class L{constructor(t,i,s,e,o){this.type=1,this._$AH=T,this._$AN=void 0,this.element=t,this.name=i,this._$AM=e,this.options=o,s.length>2||""!==s[0]||""!==s[1]?(this._$AH=Array(s.length-1).fill(new String),this.strings=s):this._$AH=T}get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}_$AI(t,i=this,s,e){const o=this.strings;let n=!1;if(void 0===o)t=R(this,t,i,0),n=!_(t)||t!==this._$AH&&t!==N,n&&(this._$AH=t);else{const e=t;let r,h;for(t=o[0],r=0;r<o.length-1;r++)h=R(this,e[s+r],i,r),h===N&&(h=this._$AH[r]),n||(n=!_(h)||h!==this._$AH[r]),h===T?t=T:t!==T&&(t+=(null!=h?h:"")+o[r+1]),this._$AH[r]=h}n&&!e&&this.k(t)}k(t){t===T?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,null!=t?t:"")}}class V extends L{constructor(){super(...arguments),this.type=3}k(t){this.element[this.name]=t===T?void 0:t}}const P=p?p.emptyScript:"";class B extends L{constructor(){super(...arguments),this.type=4}k(t){t&&t!==T?this.element.setAttribute(this.name,P):this.element.removeAttribute(this.name)}}class H extends L{constructor(t,i,s,e,o){super(t,i,s,e,o),this.type=5}_$AI(t,i=this){var s;if((t=null!==(s=R(this,t,i,0))&&void 0!==s?s:T)===N)return;const e=this._$AH,o=t===T&&e!==T||t.capture!==e.capture||t.once!==e.once||t.passive!==e.passive,n=t!==T&&(e===T||o);o&&this.element.removeEventListener(this.name,this,e),n&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){var i,s;"function"==typeof this._$AH?this._$AH.call(null!==(s=null===(i=this.options)||void 0===i?void 0:i.host)&&void 0!==s?s:this.element,t):this._$AH.handleEvent(t)}}class W{constructor(t,i,s){this.element=t,this.type=6,this._$AN=void 0,this._$AM=i,this.options=s}get _$AU(){return this._$AM._$AU}_$AI(t){R(this,t)}}const K=window.litHtmlPolyfillSupport;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
var Z,q;null==K||K(I,D),(null!==(v=globalThis.litHtmlVersions)&&void 0!==v?v:globalThis.litHtmlVersions=[]).push("2.1.2");class Y extends u{constructor(){super(...arguments),this.renderOptions={host:this},this._$Dt=void 0}createRenderRoot(){var t,i;const s=super.createRenderRoot();return null!==(t=(i=this.renderOptions).renderBefore)&&void 0!==t||(i.renderBefore=s.firstChild),s}update(t){const i=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Dt=((t,i,s)=>{var e,o;const n=null!==(e=null==s?void 0:s.renderBefore)&&void 0!==e?e:i;let r=n._$litPart$;if(void 0===r){const t=null!==(o=null==s?void 0:s.renderBefore)&&void 0!==o?o:null;n._$litPart$=r=new D(i.insertBefore(y(),t),t,void 0,null!=s?s:{})}return r._$AI(t),r})(i,this.renderRoot,this.renderOptions)}connectedCallback(){var t;super.connectedCallback(),null===(t=this._$Dt)||void 0===t||t.setConnected(!0)}disconnectedCallback(){var t;super.disconnectedCallback(),null===(t=this._$Dt)||void 0===t||t.setConnected(!1)}render(){return N}}Y.finalized=!0,Y._$litElement$=!0,null===(Z=globalThis.litElementHydrateSupport)||void 0===Z||Z.call(globalThis,{LitElement:Y});const F=globalThis.litElementPolyfillSupport;null==F||F({LitElement:Y}),(null!==(q=globalThis.litElementVersions)&&void 0!==q?q:globalThis.litElementVersions=[]).push("3.1.2");
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const G=(t,i)=>"method"===i.kind&&i.descriptor&&!("value"in i.descriptor)?{...i,finisher(s){s.createProperty(i.key,t)}}:{kind:"field",key:Symbol(),placement:"own",descriptor:{},originalKey:i.key,initializer(){"function"==typeof i.initializer&&(this[i.key]=i.initializer.call(this))},finisher(s){s.createProperty(i.key,t)}};
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */function Q(t){return(i,s)=>void 0!==s?((t,i,s)=>{i.constructor.createProperty(s,t)})(t,i,s):G(t,i)
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */}function X(t){return Q({...t,state:!0})}
/**
 * @license
 * Copyright 2021 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */var tt;null===(tt=window.HTMLSlotElement)||void 0===tt||tt.prototype.assignedElements;
/**
 * @license
 * Copyright 2017 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const it=1;
/**
 * @license
 * Copyright 2018 Google LLC
 * SPDX-License-Identifier: BSD-3-Clause
 */
const st=(t=>(...i)=>({_$litDirective$:t,values:i}))(class extends class{constructor(t){}get _$AU(){return this._$AM._$AU}_$AT(t,i,s){this._$Ct=t,this._$AM=i,this._$Ci=s}_$AS(t,i){return this.update(t,i)}update(t,i){return this.render(...i)}}{constructor(t){var i;if(super(t),t.type!==it||"class"!==t.name||(null===(i=t.strings)||void 0===i?void 0:i.length)>2)throw Error("`classMap()` can only be used in the `class` attribute and must be the only part in the attribute.")}render(t){return" "+Object.keys(t).filter((i=>t[i])).join(" ")+" "}update(t,[i]){var s,e;if(void 0===this.st){this.st=new Set,void 0!==t.strings&&(this.et=new Set(t.strings.join(" ").split(/\s/).filter((t=>""!==t))));for(const t in i)i[t]&&!(null===(s=this.et)||void 0===s?void 0:s.has(t))&&this.st.add(t);return this.render(i)}const o=t.element.classList;this.st.forEach((t=>{t in i||(o.remove(t),this.st.delete(t))}));for(const t in i){const s=!!i[t];s===this.st.has(t)||(null===(e=this.et)||void 0===e?void 0:e.has(t))||(s?(o.add(t),this.st.add(t)):(o.remove(t),this.st.delete(t)))}return N}});var et=function(t,i,s,e){for(var o,n=arguments.length,r=n<3?i:null===e?e=Object.getOwnPropertyDescriptor(i,s):e,h=t.length-1;h>=0;h--)(o=t[h])&&(r=(n<3?o(r):n>3?o(i,s,r):o(i,s))||r);return n>3&&r&&Object.defineProperty(i,s,r),r};function ot(t){try{JSON.parse(t)}catch(t){return!1}return!0}let nt=class extends Y{constructor(){super(...arguments),this.workflow="{}",this.frame="false",this.src="https://n8n-preview-service.internal.n8n.cloud/workflows/demo",this.collapseformobile="true",this.clicktointeract="false",this.hidecanvaserrors="false",this.disableinteractivity="false",this.showCode=!1,this.showPreview=!0,this.fullscreen=!1,this.insideIframe=!1,this.copyText="Copy",this.isMobileView=!1,this.error=!1,this.interactive=!0,this.scrollX=0,this.scrollY=0,this.n8nReady=!1,this.iframeVisible=!1,this.observer=new IntersectionObserver((t=>{t.forEach((t=>{if(t.isIntersecting){const t=this.shadowRoot.getElementById("int_iframe");this.observer.unobserve(t),this.iframeVisible=!0,this.n8nReady&&this.loadWorkflow()}}))})),this.receiveMessage=({data:t,source:i})=>{const s=this.shadowRoot.getElementById("int_iframe");if(s&&ot(t)&&s.contentWindow===i){const i=JSON.parse(t);"n8nReady"===i.command?(this.n8nReady=!0,this.iframeVisible&&this.loadWorkflow()):"openNDV"===i.command?this.fullscreen=!0:"closeNDV"===i.command?this.fullscreen=!1:"error"===i.command&&(this.error=!0,this.showPreview=!1)}},this.onDocumentScroll=()=>{this.interactive&&this.insideIframe&&!("ontouchstart"in window)&&!navigator.maxTouchPoints&&window.scrollTo(this.scrollX,this.scrollY)}}firstUpdated(){const t=this.shadowRoot.getElementById("int_iframe");t&&this.observer.observe(t)}connectedCallback(){super.connectedCallback();try{"string"==typeof this.workflow&&this.workflow.startsWith("%7B%")&&(this.workflow=decodeURIComponent(this.workflow))}catch(t){}"true"!==this.clicktointeract&&"true"!==this.disableinteractivity||(this.interactive=!1),window.matchMedia("only screen and (max-width: 760px)").matches&&(this.isMobileView=!0),"true"===this.collapseformobile&&this.isMobileView&&(this.showPreview=!1),window.addEventListener("message",this.receiveMessage),document.addEventListener("scroll",this.onDocumentScroll)}disconnectedCallback(){window.removeEventListener("message",this.receiveMessage),document.removeEventListener("scroll",this.onDocumentScroll),super.disconnectedCallback()}loadWorkflow(){try{const t=JSON.parse(this.workflow);if(!t)throw new Error("Missing workflow");if(!t.nodes||!Array.isArray(t.nodes))throw new Error("Must have an array of nodes");const i=this.shadowRoot.getElementById("int_iframe");i.contentWindow&&i.contentWindow.postMessage(JSON.stringify({command:"openWorkflow",workflow:t,hideNodeIssues:"true"===this.hidecanvaserrors}),"*")}catch{this.error=!0}}toggleCode(){this.showCode=!this.showCode}onMouseEnter(){this.insideIframe=!0,this.scrollX=window.scrollX,this.scrollY=window.scrollY}onMouseLeave(){this.insideIframe=!1}onOverlayClick(){"true"!==this.disableinteractivity&&(this.interactive=!0)}copyClipboard(){navigator.clipboard.writeText(this.workflow),this.copyText="Copied",setTimeout((()=>{this.copyText="Copy"}),1500)}toggleView(){this.showPreview=!0}renderIframe(){if(!this.showPreview||this.error)return E``;const t=this.theme?`?theme=${this.theme}`:"",i=`${this.src}${t}`,s="true"===this.disableinteractivity,e=E`<iframe
      class=${st({embedded_workflow_iframe_node_view:this.fullscreen,embedded_workflow_iframe:!this.fullscreen,non_interactive:!this.interactive})}
      allow="${s?T:"clipboard-write"}"
      src=${i}
      id="int_iframe"
    ></iframe>`;let o="";return s?o=E`<div
        class="overlay"
        ?hidden="${!(this.insideIframe||this.isMobileView)}"
      ></div>`:this.interactive||(o=E`<div
        class="overlay"
        @click="${this.onOverlayClick}"
        ?hidden="${!(this.insideIframe||this.isMobileView)}"
      >
        <button>Click to explore</button>
      </div>`),E`<div class="canvas-container">${o}${e}</div>`}render(){const t="true"===this.frame&&this.showPreview&&!this.error;return E`
      <div
        class="${st({embedded_workflow:!0,frame:t})}"
        @mouseenter=${this.onMouseEnter}
        @mouseleave=${this.onMouseLeave}
      >
        ${this.showPreview||this.error?"":E`<div
              class=${st({embedded_tip_error:!0})}
              ?hidden=${this.showPreview||this.error}
            >
              <button class="code_toggle" @click=${this.toggleView}>
                Show workflow
              </button>
            </div>`}
        ${this.renderIframe()}
        ${this.error?E`<div
              class=${st({embedded_tip_error:!0,embedded_tip_error_with_code:this.showCode})}
            >
              Could not load workflow preview. You can still
              <button class="code_toggle" @click=${this.toggleCode}>
                view the code
              </button>
              and paste it into n8n
            </div>`:""}
        ${t?E`<div
              class=${st({embedded_tip:!0,embedded_tip_with_code:this.showCode})}
            >
              💡 Double-click a node to see its settings, or paste
              <button class="code_toggle" @click=${this.toggleCode}>
                this workflow's code
              </button>
              into n8n to import it
            </div>`:""}
        ${this.showCode?E`<div class="workflow_json">
              <div class="copy_button" @click=${this.copyClipboard}>
                ${this.copyText}
              </div>
              <pre class="json_renderer" id="json">
${ot(this.workflow)?JSON.stringify(JSON.parse(this.workflow),void 0,2):"Invalid JSON"}
          </pre
              >
            </div>`:""}
      </div>
    `}};nt.styles=((t,...s)=>{const o=1===t.length?t[0]:s.reduce(((i,s,e)=>i+(t=>{if(!0===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(s)+t[e+1]),t[0]);return new e(o,i)})`
    :host {
      --n8n-color-primary-h: 6.9;
      --n8n-color-primary-s: 100%;
      --n8n-color-primary-l: 67.6%;
      --n8n-color-primary: hsl(
        var(--n8n-color-primary-h),
        var(--n8n-color-primary-s),
        var(--n8n-color-primary-l)
      );
    }

    *,
    *::before,
    *::after {
      box-sizing: border-box;
    }

    button {
      outline: none;
      text-decoration: none;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
      -webkit-appearance: none;
    }

    .workflow_json {
      height: 300px;
      padding-left: 10px;
      overflow: auto;
      background-color: var(--n8n-json-background-color, hsl(260deg 100% 99%));
      word-wrap: normal;
      font-family: 'Lucida Console', 'Liberation Mono', 'DejaVu Sans Mono',
        'Bitstream Vera Sans Mono', 'Courier New', monospace;
      font-size: 1.2em;
      color: hsl(0, 0%, 20%);
    }

    .overlay {
      height: 100%;
      width: 100%;
      position: absolute;
      top: 0;
      left: 0;
      background: var(--n8n-overlay-background, hsla(232, 48%, 12%, 0.1));
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
    }

    .overlay:hover {
      opacity: 1;
      transition: 250ms opacity;
    }

    .overlay > button {
      padding: 20px 40px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 18px;
      line-height: 24px;
      border: var(--n8n-overlay-border, none);
      background-color: var(
        --n8n-overlay-background-color,
        var(--n8n-color-primary)
      );
      color: var(--n8n-interact-button-color, white);
    }

    .overlay > button:hover {
      filter: brightness(85%);
      cursor: pointer;
    }

    .canvas-container {
      height: var(--n8n-workflow-min-height, 300px);
      position: relative;
    }

    .embedded_workflow.frame {
      padding: 10px;
      background-color: var(--n8n-frame-background-color, hsl(260, 11%, 95%));
    }

    .embedded_workflow .embedded_tip_error {
      color: hsl(0, 0%, 40%);
      text-align: center;
      font-size: 0.9em;
    }

    .embedded_workflow .embedded_tip_error_with_code {
      margin-bottom: 10px;
    }

    .embedded_workflow .embedded_tip {
      margin-top: 7px;
      color: hsl(0, 0%, 40%);
      text-align: center;
      font-size: 0.9em;
    }

    .embedded_workflow .embedded_tip_with_code {
      margin-top: 7px;
      margin-bottom: 10px;
    }

    .embedded_workflow_iframe {
      width: 100%;
      min-height: var(--n8n-workflow-min-height, 300px);
      border: 0;
      border-radius: var(--n8n-iframe-border-radius, 0px);
    }

    .embedded_workflow_iframe_node_view {
      position: fixed;
      top: 0;
      left: 0;
      height: 100%;
      width: 100%;
      z-index: 9999999;
    }

    .code_toggle {
      background: none;
      border: none;
      padding: 0px;
      margin: -1px;
      cursor: pointer;
      color: var(--n8n-color-primary);
      font-size: 1em;
    }

    .copy_button {
      display: none; /* Hide button */
    }

    .workflow_json:hover .copy_button {
      display: block;
      float: right;
      right: 0px;
      margin-top: 10px;
      margin-right: 10px;
      padding: 5px;
      font-family: 'Arial', 'sans-serif';
      font-size: 0.8em;
      color: #646464;
      background: var(--n8n-copy-button-background-color, rgb(239, 239, 239));
      cursor: pointer;
    }

    .non_interactive {
      pointer-events: none;
    }
  `,et([Q({type:String})],nt.prototype,"workflow",void 0),et([Q({type:String})],nt.prototype,"frame",void 0),et([Q({type:String})],nt.prototype,"src",void 0),et([Q({type:String})],nt.prototype,"collapseformobile",void 0),et([Q({type:String})],nt.prototype,"clicktointeract",void 0),et([Q({type:String})],nt.prototype,"hidecanvaserrors",void 0),et([Q({type:String})],nt.prototype,"disableinteractivity",void 0),et([Q({type:String})],nt.prototype,"theme",void 0),et([X()],nt.prototype,"showCode",void 0),et([X()],nt.prototype,"showPreview",void 0),et([X()],nt.prototype,"fullscreen",void 0),et([X()],nt.prototype,"insideIframe",void 0),et([X()],nt.prototype,"copyText",void 0),et([X()],nt.prototype,"isMobileView",void 0),et([X()],nt.prototype,"error",void 0),et([X()],nt.prototype,"interactive",void 0),nt=et([(t=>i=>"function"==typeof i?((t,i)=>(window.customElements.define(t,i),i))(t,i):((t,i)=>{const{kind:s,elements:e}=i;return{kind:s,elements:e,finisher(i){window.customElements.define(t,i)}}})(t,i))("n8n-demo")],nt);export{nt as N8NDemo};
