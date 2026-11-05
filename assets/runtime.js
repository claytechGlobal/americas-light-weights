/* Tiny template runtime for the Americas Lite Weights static site.
   Supports {{holes}}, <sc-for>, <sc-if>, on* event bindings and setState re-rendering. */
(function () {
  'use strict';

  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) {
      const p = typeof patch === 'function' ? patch(this.state, this.props) : patch;
      this.state = Object.assign({}, this.state, p);
      schedule();
    }
    forceUpdate() { schedule(); }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const WHOLE = /^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/;
  let inst = null, tpl = null, root = null, pending = false;

  function lookup(expr, scope) {
    if (expr === 'true') return true;
    if (expr === 'false') return false;
    if (expr === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr);
    if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1);
    const parts = expr.split('.');
    let v = scope;
    for (const k of parts) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, (_, e) => { const v = lookup(e, scope); return v == null ? '' : String(v); });
  }
  function eventName(attr) {
    const n = attr.slice(2).toLowerCase();
    return n === 'doubleclick' ? 'dblclick' : n;
  }

  function build(node, scope, out) {
    if (node.nodeType === 3) {
      const t = node.data;
      out.push(document.createTextNode(t.indexOf('{{') >= 0 ? interp(t, scope) : t));
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'sc-for') {
      const m = WHOLE.exec(node.getAttribute('list') || '');
      const list = m ? lookup(m[1], scope) : null;
      const as = node.getAttribute('as') || 'item';
      (Array.isArray(list) ? list : []).forEach((item, i) => {
        const s = Object.create(scope); s[as] = item; s.$index = i;
        node.childNodes.forEach((c) => build(c, s, out));
      });
      return;
    }
    if (tag === 'sc-if') {
      const m = WHOLE.exec(node.getAttribute('value') || '');
      if (m && lookup(m[1], scope)) node.childNodes.forEach((c) => build(c, scope, out));
      return;
    }
    const el = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(node.namespaceURI, node.localName)
      : document.createElement(tag);
    el.__h = {};
    let valueProp;
    for (const a of Array.from(node.attributes)) {
      const name = a.name, val = a.value;
      if (name.startsWith('hint-')) continue;
      const whole = WHOLE.exec(val);
      if (/^on[a-z]/.test(name)) {
        const fn = whole ? lookup(whole[1], scope) : null;
        if (typeof fn === 'function') {
          let type = eventName(name);
          if (type === 'change' && (tag === 'input' || tag === 'textarea')) type = 'input';
          el.__h[type] = fn;
        }
        continue;
      }
      let out1;
      if (whole) {
        const v = lookup(whole[1], scope);
        if (v === false || v == null) continue;
        out1 = v === true ? '' : String(v);
      } else out1 = val.indexOf('{{') >= 0 ? interp(val, scope) : val;
      if (name === 'value' && (tag === 'input' || tag === 'textarea' || tag === 'select')) { valueProp = out1; continue; }
      el.setAttribute(name, out1);
    }
    const kids = [];
    const src = tag === 'template' ? node.content : node;
    src.childNodes.forEach((c) => build(c, scope, kids));
    kids.forEach((k) => el.appendChild(k));
    if (valueProp !== undefined) { el.__v = valueProp; el.value = valueProp; }
    if (tag === 'video' && el.hasAttribute('muted')) { el.muted = true; el.defaultMuted = true; }
    bindAll(el);
    out.push(el);
  }

  function bindAll(el) {
    el.__bound = el.__bound || {};
    for (const type in el.__h) {
      if (el.__bound[type]) continue;
      el.__bound[type] = true;
      el.addEventListener(type, (e) => { const f = el.__h && el.__h[type]; if (f) f(e); });
    }
  }

  function morph(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return; }
    if (a.nodeType === 3) { if (a.data !== b.data) a.data = b.data; return; }
    if (a.nodeType !== 1) return;
    for (const at of Array.from(a.attributes)) if (!b.hasAttribute(at.name)) a.removeAttribute(at.name);
    for (const at of Array.from(b.attributes)) if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    a.__h = b.__h; bindAll(a);
    morphChildren(a, b);
    if (b.__v !== undefined && a.value !== b.__v) a.value = b.__v;
  }
  function morphChildren(a, b) {
    const ak = Array.from(a.childNodes), bk = Array.from(b.childNodes);
    const n = Math.min(ak.length, bk.length);
    for (let i = 0; i < n; i++) morph(ak[i], bk[i]);
    for (let i = n; i < bk.length; i++) a.appendChild(bk[i]);
    for (let i = n; i < ak.length; i++) ak[i].remove();
  }

  function render() {
    pending = false;
    const vals = inst.renderVals() || {};
    const out = [];
    tpl.content.childNodes.forEach((c) => build(c, vals, out));
    const holder = document.createElement('div');
    out.forEach((n) => holder.appendChild(n));
    if (!root.__mounted) {
      out.forEach((n) => root.appendChild(n));
      root.__mounted = true;
    } else morphChildren(root, holder);
  }
  function schedule() { if (!pending) { pending = true; Promise.resolve().then(render); } }

  window.DC = {
    mount(Component, props) {
      tpl = document.getElementById('dc-template');
      root = document.getElementById('dc-root');
      inst = new Component(props || {});
      render();
      if (typeof inst.componentDidMount === 'function') inst.componentDidMount();
      root.querySelectorAll('video[autoplay]').forEach((v) => {
        v.muted = true;
        const go = () => { const p = v.play(); if (p && p.catch) p.catch(() => {}); };
        if (v.readyState >= 2) go(); else v.addEventListener('canplay', go, { once: true });
        v.load();
      });
      if (location.hash) { const t = document.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
    }
  };
})();
