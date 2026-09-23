/* @zudojs browser build for the Learn terminal. MIT licensed. */
if (typeof globalThis.setImmediate !== 'function') { globalThis.setImmediate = (fn, ...args) => setTimeout(fn, 0, ...args); globalThis.clearImmediate = (id) => clearTimeout(id); }
var d=Object.defineProperty;var e=(b,a)=>d(b,"name",{value:a,configurable:!0});var f=(b,a)=>{for(var c in a)d(b,c,{get:a[c],enumerable:!0})};export{e as a,f as b};
