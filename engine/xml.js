/*
 * PodGrip — tiny XML reader (elements, attributes, text; no DTD, namespaces or CDATA beyond the basics).
 * Enough for FCP7 XML (xmeml) and Sony sidecars. parse(text) -> { name, attrs, children, text }.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.PodXml = api;
  else if (root) root.PodXml = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'" };
  function unescape(s) {
    return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, function (m, e) {
      if (e[0] === "#") return String.fromCharCode(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
      return ENT[e] !== undefined ? ENT[e] : m;
    });
  }
  function escape(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function parse(text) {
    var top = { name: "#document", attrs: {}, children: [], text: "" }, stack = [top];
    var re = /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<[?!][^>]*>|<\/([^\s>]+)\s*>|<([^\s/>]+)((?:\s+[^\s=]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
    var m;
    while ((m = re.exec(text))) {
      var cur = stack[stack.length - 1];
      if (m[1] !== undefined) cur.text += m[1];
      else if (m[2]) { if (stack.length > 1) stack.pop(); }
      else if (m[3]) {
        var el = { name: m[3], attrs: {}, children: [], text: "", parent: cur }, am, are = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
        while ((am = are.exec(m[4]))) el.attrs[am[1]] = unescape(am[3] !== undefined ? am[3] : am[4]);
        cur.children.push(el);
        if (!m[5]) stack.push(el);
      } else if (m[6] !== undefined) cur.text += unescape(m[6]);
    }
    return top;
  }

  /** Direct children named name. */
  function kids(el, name) { return el ? el.children.filter(function (c) { return c.name === name; }) : []; }
  /** First element along a path of child names ("media/video/track"). */
  function child(el, path) {
    var parts = path.split("/");
    for (var i = 0; el && i < parts.length; i++) el = kids(el, parts[i])[0];
    return el || null;
  }
  /** Trimmed text of the element at path, or def. */
  function textOf(el, path, def) { var c = path ? child(el, path) : el; return c ? c.text.trim() : def; }
  /** All descendants named name (depth first). */
  function all(el, name, out) {
    out = out || [];
    (el ? el.children : []).forEach(function (c) { if (c.name === name) out.push(c); all(c, name, out); });
    return out;
  }

  return { parse: parse, kids: kids, child: child, textOf: textOf, all: all, escape: escape };
});
