#!/usr/bin/env node
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// ../node_modules/.pnpm/sisteransi@1.0.5/node_modules/sisteransi/src/index.js
var require_src = __commonJS({
  "../node_modules/.pnpm/sisteransi@1.0.5/node_modules/sisteransi/src/index.js"(exports, module) {
    "use strict";
    var ESC = "\x1B";
    var CSI = `${ESC}[`;
    var beep = "\x07";
    var cursor = {
      to(x3, y3) {
        if (!y3) return `${CSI}${x3 + 1}G`;
        return `${CSI}${y3 + 1};${x3 + 1}H`;
      },
      move(x3, y3) {
        let ret = "";
        if (x3 < 0) ret += `${CSI}${-x3}D`;
        else if (x3 > 0) ret += `${CSI}${x3}C`;
        if (y3 < 0) ret += `${CSI}${-y3}A`;
        else if (y3 > 0) ret += `${CSI}${y3}B`;
        return ret;
      },
      up: (count = 1) => `${CSI}${count}A`,
      down: (count = 1) => `${CSI}${count}B`,
      forward: (count = 1) => `${CSI}${count}C`,
      backward: (count = 1) => `${CSI}${count}D`,
      nextLine: (count = 1) => `${CSI}E`.repeat(count),
      prevLine: (count = 1) => `${CSI}F`.repeat(count),
      left: `${CSI}G`,
      hide: `${CSI}?25l`,
      show: `${CSI}?25h`,
      save: `${ESC}7`,
      restore: `${ESC}8`
    };
    var scroll = {
      up: (count = 1) => `${CSI}S`.repeat(count),
      down: (count = 1) => `${CSI}T`.repeat(count)
    };
    var erase = {
      screen: `${CSI}2J`,
      up: (count = 1) => `${CSI}1J`.repeat(count),
      down: (count = 1) => `${CSI}J`.repeat(count),
      line: `${CSI}2K`,
      lineEnd: `${CSI}K`,
      lineStart: `${CSI}1K`,
      lines(count) {
        let clear = "";
        for (let i = 0; i < count; i++)
          clear += this.line + (i < count - 1 ? cursor.up() : "");
        if (count)
          clear += cursor.left;
        return clear;
      }
    };
    module.exports = { cursor, scroll, erase, beep };
  }
});

// ../node_modules/.pnpm/picocolors@1.1.1/node_modules/picocolors/picocolors.js
var require_picocolors = __commonJS({
  "../node_modules/.pnpm/picocolors@1.1.1/node_modules/picocolors/picocolors.js"(exports, module) {
    var p = process || {};
    var argv = p.argv || [];
    var env = p.env || {};
    var isColorSupported = !(!!env.NO_COLOR || argv.includes("--no-color")) && (!!env.FORCE_COLOR || argv.includes("--color") || p.platform === "win32" || (p.stdout || {}).isTTY && env.TERM !== "dumb" || !!env.CI);
    var formatter = (open, close, replace = open) => (input) => {
      let string = "" + input, index = string.indexOf(close, open.length);
      return ~index ? open + replaceClose(string, close, replace, index) + close : open + string + close;
    };
    var replaceClose = (string, close, replace, index) => {
      let result = "", cursor = 0;
      do {
        result += string.substring(cursor, index) + replace;
        cursor = index + close.length;
        index = string.indexOf(close, cursor);
      } while (~index);
      return result + string.substring(cursor);
    };
    var createColors = (enabled = isColorSupported) => {
      let f2 = enabled ? formatter : () => String;
      return {
        isColorSupported: enabled,
        reset: f2("\x1B[0m", "\x1B[0m"),
        bold: f2("\x1B[1m", "\x1B[22m", "\x1B[22m\x1B[1m"),
        dim: f2("\x1B[2m", "\x1B[22m", "\x1B[22m\x1B[2m"),
        italic: f2("\x1B[3m", "\x1B[23m"),
        underline: f2("\x1B[4m", "\x1B[24m"),
        inverse: f2("\x1B[7m", "\x1B[27m"),
        hidden: f2("\x1B[8m", "\x1B[28m"),
        strikethrough: f2("\x1B[9m", "\x1B[29m"),
        black: f2("\x1B[30m", "\x1B[39m"),
        red: f2("\x1B[31m", "\x1B[39m"),
        green: f2("\x1B[32m", "\x1B[39m"),
        yellow: f2("\x1B[33m", "\x1B[39m"),
        blue: f2("\x1B[34m", "\x1B[39m"),
        magenta: f2("\x1B[35m", "\x1B[39m"),
        cyan: f2("\x1B[36m", "\x1B[39m"),
        white: f2("\x1B[37m", "\x1B[39m"),
        gray: f2("\x1B[90m", "\x1B[39m"),
        bgBlack: f2("\x1B[40m", "\x1B[49m"),
        bgRed: f2("\x1B[41m", "\x1B[49m"),
        bgGreen: f2("\x1B[42m", "\x1B[49m"),
        bgYellow: f2("\x1B[43m", "\x1B[49m"),
        bgBlue: f2("\x1B[44m", "\x1B[49m"),
        bgMagenta: f2("\x1B[45m", "\x1B[49m"),
        bgCyan: f2("\x1B[46m", "\x1B[49m"),
        bgWhite: f2("\x1B[47m", "\x1B[49m"),
        blackBright: f2("\x1B[90m", "\x1B[39m"),
        redBright: f2("\x1B[91m", "\x1B[39m"),
        greenBright: f2("\x1B[92m", "\x1B[39m"),
        yellowBright: f2("\x1B[93m", "\x1B[39m"),
        blueBright: f2("\x1B[94m", "\x1B[39m"),
        magentaBright: f2("\x1B[95m", "\x1B[39m"),
        cyanBright: f2("\x1B[96m", "\x1B[39m"),
        whiteBright: f2("\x1B[97m", "\x1B[39m"),
        bgBlackBright: f2("\x1B[100m", "\x1B[49m"),
        bgRedBright: f2("\x1B[101m", "\x1B[49m"),
        bgGreenBright: f2("\x1B[102m", "\x1B[49m"),
        bgYellowBright: f2("\x1B[103m", "\x1B[49m"),
        bgBlueBright: f2("\x1B[104m", "\x1B[49m"),
        bgMagentaBright: f2("\x1B[105m", "\x1B[49m"),
        bgCyanBright: f2("\x1B[106m", "\x1B[49m"),
        bgWhiteBright: f2("\x1B[107m", "\x1B[49m")
      };
    };
    module.exports = createColors();
    module.exports.createColors = createColors;
  }
});

// ../node_modules/.pnpm/@clack+core@0.3.5/node_modules/@clack/core/dist/index.mjs
import { stdin as $, stdout as k } from "node:process";
import * as f from "node:readline";
import _ from "node:readline";
import { WriteStream as U } from "node:tty";
function q({ onlyFirst: e2 = false } = {}) {
  const F = ["[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?(?:\\u0007|\\u001B\\u005C|\\u009C))", "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))"].join("|");
  return new RegExp(F, e2 ? void 0 : "g");
}
function S(e2) {
  if (typeof e2 != "string") throw new TypeError(`Expected a \`string\`, got \`${typeof e2}\``);
  return e2.replace(J, "");
}
function T(e2) {
  return e2 && e2.__esModule && Object.prototype.hasOwnProperty.call(e2, "default") ? e2.default : e2;
}
function A(e2, u = {}) {
  if (typeof e2 != "string" || e2.length === 0 || (u = { ambiguousIsNarrow: true, ...u }, e2 = S(e2), e2.length === 0)) return 0;
  e2 = e2.replace(uD(), "  ");
  const F = u.ambiguousIsNarrow ? 1 : 2;
  let t = 0;
  for (const s of e2) {
    const C2 = s.codePointAt(0);
    if (C2 <= 31 || C2 >= 127 && C2 <= 159 || C2 >= 768 && C2 <= 879) continue;
    switch (X.eastAsianWidth(s)) {
      case "F":
      case "W":
        t += 2;
        break;
      case "A":
        t += F;
        break;
      default:
        t += 1;
    }
  }
  return t;
}
function tD() {
  const e2 = /* @__PURE__ */ new Map();
  for (const [u, F] of Object.entries(r)) {
    for (const [t, s] of Object.entries(F)) r[t] = { open: `\x1B[${s[0]}m`, close: `\x1B[${s[1]}m` }, F[t] = r[t], e2.set(s[0], s[1]);
    Object.defineProperty(r, u, { value: F, enumerable: false });
  }
  return Object.defineProperty(r, "codes", { value: e2, enumerable: false }), r.color.close = "\x1B[39m", r.bgColor.close = "\x1B[49m", r.color.ansi = M(), r.color.ansi256 = P(), r.color.ansi16m = W(), r.bgColor.ansi = M(d), r.bgColor.ansi256 = P(d), r.bgColor.ansi16m = W(d), Object.defineProperties(r, { rgbToAnsi256: { value: (u, F, t) => u === F && F === t ? u < 8 ? 16 : u > 248 ? 231 : Math.round((u - 8) / 247 * 24) + 232 : 16 + 36 * Math.round(u / 255 * 5) + 6 * Math.round(F / 255 * 5) + Math.round(t / 255 * 5), enumerable: false }, hexToRgb: { value: (u) => {
    const F = /[a-f\d]{6}|[a-f\d]{3}/i.exec(u.toString(16));
    if (!F) return [0, 0, 0];
    let [t] = F;
    t.length === 3 && (t = [...t].map((C2) => C2 + C2).join(""));
    const s = Number.parseInt(t, 16);
    return [s >> 16 & 255, s >> 8 & 255, s & 255];
  }, enumerable: false }, hexToAnsi256: { value: (u) => r.rgbToAnsi256(...r.hexToRgb(u)), enumerable: false }, ansi256ToAnsi: { value: (u) => {
    if (u < 8) return 30 + u;
    if (u < 16) return 90 + (u - 8);
    let F, t, s;
    if (u >= 232) F = ((u - 232) * 10 + 8) / 255, t = F, s = F;
    else {
      u -= 16;
      const i = u % 36;
      F = Math.floor(u / 36) / 5, t = Math.floor(i / 6) / 5, s = i % 6 / 5;
    }
    const C2 = Math.max(F, t, s) * 2;
    if (C2 === 0) return 30;
    let D = 30 + (Math.round(s) << 2 | Math.round(t) << 1 | Math.round(F));
    return C2 === 2 && (D += 60), D;
  }, enumerable: false }, rgbToAnsi: { value: (u, F, t) => r.ansi256ToAnsi(r.rgbToAnsi256(u, F, t)), enumerable: false }, hexToAnsi: { value: (u) => r.ansi256ToAnsi(r.hexToAnsi256(u)), enumerable: false } }), r;
}
function R(e2, u, F) {
  return String(e2).normalize().replace(/\r\n/g, `
`).split(`
`).map((t) => oD(t, u, F)).join(`
`);
}
function hD(e2, u) {
  if (e2 === u) return;
  const F = e2.split(`
`), t = u.split(`
`), s = [];
  for (let C2 = 0; C2 < Math.max(F.length, t.length); C2++) F[C2] !== t[C2] && s.push(C2);
  return s;
}
function lD(e2) {
  return e2 === V;
}
function v(e2, u) {
  e2.isTTY && e2.setRawMode(u);
}
function OD({ input: e2 = $, output: u = k, overwrite: F = true, hideCursor: t = true } = {}) {
  const s = f.createInterface({ input: e2, output: u, prompt: "", tabSize: 1 });
  f.emitKeypressEvents(e2, s), e2.isTTY && e2.setRawMode(true);
  const C2 = (D, { name: i }) => {
    if (String(D) === "") {
      t && u.write(import_sisteransi.cursor.show), process.exit(0);
      return;
    }
    if (!F) return;
    let n = i === "return" ? 0 : -1, E2 = i === "return" ? -1 : 0;
    f.moveCursor(u, n, E2, () => {
      f.clearLine(u, 1, () => {
        e2.once("keypress", C2);
      });
    });
  };
  return t && u.write(import_sisteransi.cursor.hide), e2.once("keypress", C2), () => {
    e2.off("keypress", C2), t && u.write(import_sisteransi.cursor.show), e2.isTTY && !WD && e2.setRawMode(false), s.terminal = false, s.close();
  };
}
var import_sisteransi, import_picocolors, J, j, Q, X, DD, uD, d, M, P, W, r, FD, eD, sD, g, CD, b, O, iD, I, w, N, L, rD, y, ED, oD, nD, aD, a, V, z, xD, x, BD, fD, gD, K, vD, mD, dD, Y, bD, wD, yD, Z, $D, TD, jD, MD, PD, WD;
var init_dist = __esm({
  "../node_modules/.pnpm/@clack+core@0.3.5/node_modules/@clack/core/dist/index.mjs"() {
    import_sisteransi = __toESM(require_src(), 1);
    import_picocolors = __toESM(require_picocolors(), 1);
    J = q();
    j = { exports: {} };
    (function(e2) {
      var u = {};
      e2.exports = u, u.eastAsianWidth = function(t) {
        var s = t.charCodeAt(0), C2 = t.length == 2 ? t.charCodeAt(1) : 0, D = s;
        return 55296 <= s && s <= 56319 && 56320 <= C2 && C2 <= 57343 && (s &= 1023, C2 &= 1023, D = s << 10 | C2, D += 65536), D == 12288 || 65281 <= D && D <= 65376 || 65504 <= D && D <= 65510 ? "F" : D == 8361 || 65377 <= D && D <= 65470 || 65474 <= D && D <= 65479 || 65482 <= D && D <= 65487 || 65490 <= D && D <= 65495 || 65498 <= D && D <= 65500 || 65512 <= D && D <= 65518 ? "H" : 4352 <= D && D <= 4447 || 4515 <= D && D <= 4519 || 4602 <= D && D <= 4607 || 9001 <= D && D <= 9002 || 11904 <= D && D <= 11929 || 11931 <= D && D <= 12019 || 12032 <= D && D <= 12245 || 12272 <= D && D <= 12283 || 12289 <= D && D <= 12350 || 12353 <= D && D <= 12438 || 12441 <= D && D <= 12543 || 12549 <= D && D <= 12589 || 12593 <= D && D <= 12686 || 12688 <= D && D <= 12730 || 12736 <= D && D <= 12771 || 12784 <= D && D <= 12830 || 12832 <= D && D <= 12871 || 12880 <= D && D <= 13054 || 13056 <= D && D <= 19903 || 19968 <= D && D <= 42124 || 42128 <= D && D <= 42182 || 43360 <= D && D <= 43388 || 44032 <= D && D <= 55203 || 55216 <= D && D <= 55238 || 55243 <= D && D <= 55291 || 63744 <= D && D <= 64255 || 65040 <= D && D <= 65049 || 65072 <= D && D <= 65106 || 65108 <= D && D <= 65126 || 65128 <= D && D <= 65131 || 110592 <= D && D <= 110593 || 127488 <= D && D <= 127490 || 127504 <= D && D <= 127546 || 127552 <= D && D <= 127560 || 127568 <= D && D <= 127569 || 131072 <= D && D <= 194367 || 177984 <= D && D <= 196605 || 196608 <= D && D <= 262141 ? "W" : 32 <= D && D <= 126 || 162 <= D && D <= 163 || 165 <= D && D <= 166 || D == 172 || D == 175 || 10214 <= D && D <= 10221 || 10629 <= D && D <= 10630 ? "Na" : D == 161 || D == 164 || 167 <= D && D <= 168 || D == 170 || 173 <= D && D <= 174 || 176 <= D && D <= 180 || 182 <= D && D <= 186 || 188 <= D && D <= 191 || D == 198 || D == 208 || 215 <= D && D <= 216 || 222 <= D && D <= 225 || D == 230 || 232 <= D && D <= 234 || 236 <= D && D <= 237 || D == 240 || 242 <= D && D <= 243 || 247 <= D && D <= 250 || D == 252 || D == 254 || D == 257 || D == 273 || D == 275 || D == 283 || 294 <= D && D <= 295 || D == 299 || 305 <= D && D <= 307 || D == 312 || 319 <= D && D <= 322 || D == 324 || 328 <= D && D <= 331 || D == 333 || 338 <= D && D <= 339 || 358 <= D && D <= 359 || D == 363 || D == 462 || D == 464 || D == 466 || D == 468 || D == 470 || D == 472 || D == 474 || D == 476 || D == 593 || D == 609 || D == 708 || D == 711 || 713 <= D && D <= 715 || D == 717 || D == 720 || 728 <= D && D <= 731 || D == 733 || D == 735 || 768 <= D && D <= 879 || 913 <= D && D <= 929 || 931 <= D && D <= 937 || 945 <= D && D <= 961 || 963 <= D && D <= 969 || D == 1025 || 1040 <= D && D <= 1103 || D == 1105 || D == 8208 || 8211 <= D && D <= 8214 || 8216 <= D && D <= 8217 || 8220 <= D && D <= 8221 || 8224 <= D && D <= 8226 || 8228 <= D && D <= 8231 || D == 8240 || 8242 <= D && D <= 8243 || D == 8245 || D == 8251 || D == 8254 || D == 8308 || D == 8319 || 8321 <= D && D <= 8324 || D == 8364 || D == 8451 || D == 8453 || D == 8457 || D == 8467 || D == 8470 || 8481 <= D && D <= 8482 || D == 8486 || D == 8491 || 8531 <= D && D <= 8532 || 8539 <= D && D <= 8542 || 8544 <= D && D <= 8555 || 8560 <= D && D <= 8569 || D == 8585 || 8592 <= D && D <= 8601 || 8632 <= D && D <= 8633 || D == 8658 || D == 8660 || D == 8679 || D == 8704 || 8706 <= D && D <= 8707 || 8711 <= D && D <= 8712 || D == 8715 || D == 8719 || D == 8721 || D == 8725 || D == 8730 || 8733 <= D && D <= 8736 || D == 8739 || D == 8741 || 8743 <= D && D <= 8748 || D == 8750 || 8756 <= D && D <= 8759 || 8764 <= D && D <= 8765 || D == 8776 || D == 8780 || D == 8786 || 8800 <= D && D <= 8801 || 8804 <= D && D <= 8807 || 8810 <= D && D <= 8811 || 8814 <= D && D <= 8815 || 8834 <= D && D <= 8835 || 8838 <= D && D <= 8839 || D == 8853 || D == 8857 || D == 8869 || D == 8895 || D == 8978 || 9312 <= D && D <= 9449 || 9451 <= D && D <= 9547 || 9552 <= D && D <= 9587 || 9600 <= D && D <= 9615 || 9618 <= D && D <= 9621 || 9632 <= D && D <= 9633 || 9635 <= D && D <= 9641 || 9650 <= D && D <= 9651 || 9654 <= D && D <= 9655 || 9660 <= D && D <= 9661 || 9664 <= D && D <= 9665 || 9670 <= D && D <= 9672 || D == 9675 || 9678 <= D && D <= 9681 || 9698 <= D && D <= 9701 || D == 9711 || 9733 <= D && D <= 9734 || D == 9737 || 9742 <= D && D <= 9743 || 9748 <= D && D <= 9749 || D == 9756 || D == 9758 || D == 9792 || D == 9794 || 9824 <= D && D <= 9825 || 9827 <= D && D <= 9829 || 9831 <= D && D <= 9834 || 9836 <= D && D <= 9837 || D == 9839 || 9886 <= D && D <= 9887 || 9918 <= D && D <= 9919 || 9924 <= D && D <= 9933 || 9935 <= D && D <= 9953 || D == 9955 || 9960 <= D && D <= 9983 || D == 10045 || D == 10071 || 10102 <= D && D <= 10111 || 11093 <= D && D <= 11097 || 12872 <= D && D <= 12879 || 57344 <= D && D <= 63743 || 65024 <= D && D <= 65039 || D == 65533 || 127232 <= D && D <= 127242 || 127248 <= D && D <= 127277 || 127280 <= D && D <= 127337 || 127344 <= D && D <= 127386 || 917760 <= D && D <= 917999 || 983040 <= D && D <= 1048573 || 1048576 <= D && D <= 1114109 ? "A" : "N";
      }, u.characterLength = function(t) {
        var s = this.eastAsianWidth(t);
        return s == "F" || s == "W" || s == "A" ? 2 : 1;
      };
      function F(t) {
        return t.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[^\uD800-\uDFFF]/g) || [];
      }
      u.length = function(t) {
        for (var s = F(t), C2 = 0, D = 0; D < s.length; D++) C2 = C2 + this.characterLength(s[D]);
        return C2;
      }, u.slice = function(t, s, C2) {
        textLen = u.length(t), s = s || 0, C2 = C2 || 1, s < 0 && (s = textLen + s), C2 < 0 && (C2 = textLen + C2);
        for (var D = "", i = 0, n = F(t), E2 = 0; E2 < n.length; E2++) {
          var h2 = n[E2], o2 = u.length(h2);
          if (i >= s - (o2 == 2 ? 1 : 0)) if (i + o2 <= C2) D += h2;
          else break;
          i += o2;
        }
        return D;
      };
    })(j);
    Q = j.exports;
    X = T(Q);
    DD = function() {
      return /\uD83C\uDFF4\uDB40\uDC67\uDB40\uDC62(?:\uDB40\uDC77\uDB40\uDC6C\uDB40\uDC73|\uDB40\uDC73\uDB40\uDC63\uDB40\uDC74|\uDB40\uDC65\uDB40\uDC6E\uDB40\uDC67)\uDB40\uDC7F|(?:\uD83E\uDDD1\uD83C\uDFFF\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFF\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFB-\uDFFE])|(?:\uD83E\uDDD1\uD83C\uDFFE\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFE\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFB-\uDFFD\uDFFF])|(?:\uD83E\uDDD1\uD83C\uDFFD\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFD\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|(?:\uD83E\uDDD1\uD83C\uDFFC\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFC\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFB\uDFFD-\uDFFF])|(?:\uD83E\uDDD1\uD83C\uDFFB\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83E\uDDD1|\uD83D\uDC69\uD83C\uDFFB\u200D\uD83E\uDD1D\u200D(?:\uD83D[\uDC68\uDC69]))(?:\uD83C[\uDFFC-\uDFFF])|\uD83D\uDC68(?:\uD83C\uDFFB(?:\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFF])|\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFF]))|\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFC-\uDFFF])|[\u2695\u2696\u2708]\uFE0F|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD]))?|(?:\uD83C[\uDFFC-\uDFFF])\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFF])|\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFF]))|\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D)?\uD83D\uDC68|(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFE])|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFE\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB-\uDFFD\uDFFF])|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFC\uDFFE\uDFFF])|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFC\u200D(?:\uD83E\uDD1D\u200D\uD83D\uDC68(?:\uD83C[\uDFFB\uDFFD-\uDFFF])|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|(?:\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708]|\u200D[\u2695\u2696\u2708])\uFE0F|\u200D(?:(?:\uD83D[\uDC68\uDC69])\u200D(?:\uD83D[\uDC66\uDC67])|\uD83D[\uDC66\uDC67])|\uD83C\uDFFF|\uD83C\uDFFE|\uD83C\uDFFD|\uD83C\uDFFC)?|(?:\uD83D\uDC69(?:\uD83C\uDFFB\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D(?:\uD83D[\uDC68\uDC69])|\uD83D[\uDC68\uDC69])|(?:\uD83C[\uDFFC-\uDFFF])\u200D\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D(?:\uD83D[\uDC68\uDC69])|\uD83D[\uDC68\uDC69]))|\uD83E\uDDD1(?:\uD83C[\uDFFB-\uDFFF])\u200D\uD83E\uDD1D\u200D\uD83E\uDDD1)(?:\uD83C[\uDFFB-\uDFFF])|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67]))|\uD83D\uDC69(?:\u200D(?:\u2764\uFE0F\u200D(?:\uD83D\uDC8B\u200D(?:\uD83D[\uDC68\uDC69])|\uD83D[\uDC68\uDC69])|\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFE\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFC\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFB\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD]))|\uD83E\uDDD1(?:\u200D(?:\uD83E\uDD1D\u200D\uD83E\uDDD1|\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFF\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFE\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFD\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFC\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD])|\uD83C\uDFFB\u200D(?:\uD83C[\uDF3E\uDF73\uDF7C\uDF84\uDF93\uDFA4\uDFA8\uDFEB\uDFED]|\uD83D[\uDCBB\uDCBC\uDD27\uDD2C\uDE80\uDE92]|\uD83E[\uDDAF-\uDDB3\uDDBC\uDDBD]))|\uD83D\uDC69\u200D\uD83D\uDC66\u200D\uD83D\uDC66|\uD83D\uDC69\u200D\uD83D\uDC69\u200D(?:\uD83D[\uDC66\uDC67])|\uD83D\uDC69\u200D\uD83D\uDC67\u200D(?:\uD83D[\uDC66\uDC67])|(?:\uD83D\uDC41\uFE0F\u200D\uD83D\uDDE8|\uD83E\uDDD1(?:\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708]|\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\u200D[\u2695\u2696\u2708])|\uD83D\uDC69(?:\uD83C\uDFFF\u200D[\u2695\u2696\u2708]|\uD83C\uDFFE\u200D[\u2695\u2696\u2708]|\uD83C\uDFFD\u200D[\u2695\u2696\u2708]|\uD83C\uDFFC\u200D[\u2695\u2696\u2708]|\uD83C\uDFFB\u200D[\u2695\u2696\u2708]|\u200D[\u2695\u2696\u2708])|\uD83D\uDE36\u200D\uD83C\uDF2B|\uD83C\uDFF3\uFE0F\u200D\u26A7|\uD83D\uDC3B\u200D\u2744|(?:(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC70\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD35\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD4\uDDD6-\uDDDD])(?:\uD83C[\uDFFB-\uDFFF])|\uD83D\uDC6F|\uD83E[\uDD3C\uDDDE\uDDDF])\u200D[\u2640\u2642]|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uFE0F|\uD83C[\uDFFB-\uDFFF])\u200D[\u2640\u2642]|\uD83C\uDFF4\u200D\u2620|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC70\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD35\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD4\uDDD6-\uDDDD])\u200D[\u2640\u2642]|[\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u2328\u23CF\u23ED-\u23EF\u23F1\u23F2\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB\u25FC\u2600-\u2604\u260E\u2611\u2618\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u2692\u2694-\u2697\u2699\u269B\u269C\u26A0\u26A7\u26B0\u26B1\u26C8\u26CF\u26D1\u26D3\u26E9\u26F0\u26F1\u26F4\u26F7\u26F8\u2702\u2708\u2709\u270F\u2712\u2714\u2716\u271D\u2721\u2733\u2734\u2744\u2747\u2763\u27A1\u2934\u2935\u2B05-\u2B07\u3030\u303D\u3297\u3299]|\uD83C[\uDD70\uDD71\uDD7E\uDD7F\uDE02\uDE37\uDF21\uDF24-\uDF2C\uDF36\uDF7D\uDF96\uDF97\uDF99-\uDF9B\uDF9E\uDF9F\uDFCD\uDFCE\uDFD4-\uDFDF\uDFF5\uDFF7]|\uD83D[\uDC3F\uDCFD\uDD49\uDD4A\uDD6F\uDD70\uDD73\uDD76-\uDD79\uDD87\uDD8A-\uDD8D\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA\uDECB\uDECD-\uDECF\uDEE0-\uDEE5\uDEE9\uDEF0\uDEF3])\uFE0F|\uD83C\uDFF3\uFE0F\u200D\uD83C\uDF08|\uD83D\uDC69\u200D\uD83D\uDC67|\uD83D\uDC69\u200D\uD83D\uDC66|\uD83D\uDE35\u200D\uD83D\uDCAB|\uD83D\uDE2E\u200D\uD83D\uDCA8|\uD83D\uDC15\u200D\uD83E\uDDBA|\uD83E\uDDD1(?:\uD83C\uDFFF|\uD83C\uDFFE|\uD83C\uDFFD|\uD83C\uDFFC|\uD83C\uDFFB)?|\uD83D\uDC69(?:\uD83C\uDFFF|\uD83C\uDFFE|\uD83C\uDFFD|\uD83C\uDFFC|\uD83C\uDFFB)?|\uD83C\uDDFD\uD83C\uDDF0|\uD83C\uDDF6\uD83C\uDDE6|\uD83C\uDDF4\uD83C\uDDF2|\uD83D\uDC08\u200D\u2B1B|\u2764\uFE0F\u200D(?:\uD83D\uDD25|\uD83E\uDE79)|\uD83D\uDC41\uFE0F|\uD83C\uDFF3\uFE0F|\uD83C\uDDFF(?:\uD83C[\uDDE6\uDDF2\uDDFC])|\uD83C\uDDFE(?:\uD83C[\uDDEA\uDDF9])|\uD83C\uDDFC(?:\uD83C[\uDDEB\uDDF8])|\uD83C\uDDFB(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDEE\uDDF3\uDDFA])|\uD83C\uDDFA(?:\uD83C[\uDDE6\uDDEC\uDDF2\uDDF3\uDDF8\uDDFE\uDDFF])|\uD83C\uDDF9(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDED\uDDEF-\uDDF4\uDDF7\uDDF9\uDDFB\uDDFC\uDDFF])|\uD83C\uDDF8(?:\uD83C[\uDDE6-\uDDEA\uDDEC-\uDDF4\uDDF7-\uDDF9\uDDFB\uDDFD-\uDDFF])|\uD83C\uDDF7(?:\uD83C[\uDDEA\uDDF4\uDDF8\uDDFA\uDDFC])|\uD83C\uDDF5(?:\uD83C[\uDDE6\uDDEA-\uDDED\uDDF0-\uDDF3\uDDF7-\uDDF9\uDDFC\uDDFE])|\uD83C\uDDF3(?:\uD83C[\uDDE6\uDDE8\uDDEA-\uDDEC\uDDEE\uDDF1\uDDF4\uDDF5\uDDF7\uDDFA\uDDFF])|\uD83C\uDDF2(?:\uD83C[\uDDE6\uDDE8-\uDDED\uDDF0-\uDDFF])|\uD83C\uDDF1(?:\uD83C[\uDDE6-\uDDE8\uDDEE\uDDF0\uDDF7-\uDDFB\uDDFE])|\uD83C\uDDF0(?:\uD83C[\uDDEA\uDDEC-\uDDEE\uDDF2\uDDF3\uDDF5\uDDF7\uDDFC\uDDFE\uDDFF])|\uD83C\uDDEF(?:\uD83C[\uDDEA\uDDF2\uDDF4\uDDF5])|\uD83C\uDDEE(?:\uD83C[\uDDE8-\uDDEA\uDDF1-\uDDF4\uDDF6-\uDDF9])|\uD83C\uDDED(?:\uD83C[\uDDF0\uDDF2\uDDF3\uDDF7\uDDF9\uDDFA])|\uD83C\uDDEC(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEE\uDDF1-\uDDF3\uDDF5-\uDDFA\uDDFC\uDDFE])|\uD83C\uDDEB(?:\uD83C[\uDDEE-\uDDF0\uDDF2\uDDF4\uDDF7])|\uD83C\uDDEA(?:\uD83C[\uDDE6\uDDE8\uDDEA\uDDEC\uDDED\uDDF7-\uDDFA])|\uD83C\uDDE9(?:\uD83C[\uDDEA\uDDEC\uDDEF\uDDF0\uDDF2\uDDF4\uDDFF])|\uD83C\uDDE8(?:\uD83C[\uDDE6\uDDE8\uDDE9\uDDEB-\uDDEE\uDDF0-\uDDF5\uDDF7\uDDFA-\uDDFF])|\uD83C\uDDE7(?:\uD83C[\uDDE6\uDDE7\uDDE9-\uDDEF\uDDF1-\uDDF4\uDDF6-\uDDF9\uDDFB\uDDFC\uDDFE\uDDFF])|\uD83C\uDDE6(?:\uD83C[\uDDE8-\uDDEC\uDDEE\uDDF1\uDDF2\uDDF4\uDDF6-\uDDFA\uDDFC\uDDFD\uDDFF])|[#\*0-9]\uFE0F\u20E3|\u2764\uFE0F|(?:\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC70\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD35\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD4\uDDD6-\uDDDD])(?:\uD83C[\uDFFB-\uDFFF])|(?:\u26F9|\uD83C[\uDFCB\uDFCC]|\uD83D\uDD75)(?:\uFE0F|\uD83C[\uDFFB-\uDFFF])|\uD83C\uDFF4|(?:[\u270A\u270B]|\uD83C[\uDF85\uDFC2\uDFC7]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDC8F\uDC91\uDCAA\uDD7A\uDD95\uDD96\uDE4C\uDE4F\uDEC0\uDECC]|\uD83E[\uDD0C\uDD0F\uDD18-\uDD1C\uDD1E\uDD1F\uDD30-\uDD34\uDD36\uDD77\uDDB5\uDDB6\uDDBB\uDDD2\uDDD3\uDDD5])(?:\uD83C[\uDFFB-\uDFFF])|(?:[\u261D\u270C\u270D]|\uD83D[\uDD74\uDD90])(?:\uFE0F|\uD83C[\uDFFB-\uDFFF])|[\u270A\u270B]|\uD83C[\uDF85\uDFC2\uDFC7]|\uD83D[\uDC08\uDC15\uDC3B\uDC42\uDC43\uDC46-\uDC50\uDC66\uDC67\uDC6B-\uDC6D\uDC72\uDC74-\uDC76\uDC78\uDC7C\uDC83\uDC85\uDC8F\uDC91\uDCAA\uDD7A\uDD95\uDD96\uDE2E\uDE35\uDE36\uDE4C\uDE4F\uDEC0\uDECC]|\uD83E[\uDD0C\uDD0F\uDD18-\uDD1C\uDD1E\uDD1F\uDD30-\uDD34\uDD36\uDD77\uDDB5\uDDB6\uDDBB\uDDD2\uDDD3\uDDD5]|\uD83C[\uDFC3\uDFC4\uDFCA]|\uD83D[\uDC6E\uDC70\uDC71\uDC73\uDC77\uDC81\uDC82\uDC86\uDC87\uDE45-\uDE47\uDE4B\uDE4D\uDE4E\uDEA3\uDEB4-\uDEB6]|\uD83E[\uDD26\uDD35\uDD37-\uDD39\uDD3D\uDD3E\uDDB8\uDDB9\uDDCD-\uDDCF\uDDD4\uDDD6-\uDDDD]|\uD83D\uDC6F|\uD83E[\uDD3C\uDDDE\uDDDF]|[\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]|\uD83C[\uDC04\uDCCF\uDD8E\uDD91-\uDD9A\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF84\uDF86-\uDF93\uDFA0-\uDFC1\uDFC5\uDFC6\uDFC8\uDFC9\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF8-\uDFFF]|\uD83D[\uDC00-\uDC07\uDC09-\uDC14\uDC16-\uDC3A\uDC3C-\uDC3E\uDC40\uDC44\uDC45\uDC51-\uDC65\uDC6A\uDC79-\uDC7B\uDC7D-\uDC80\uDC84\uDC88-\uDC8E\uDC90\uDC92-\uDCA9\uDCAB-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDDA4\uDDFB-\uDE2D\uDE2F-\uDE34\uDE37-\uDE44\uDE48-\uDE4A\uDE80-\uDEA2\uDEA4-\uDEB3\uDEB7-\uDEBF\uDEC1-\uDEC5\uDED0-\uDED2\uDED5-\uDED7\uDEEB\uDEEC\uDEF4-\uDEFC\uDFE0-\uDFEB]|\uD83E[\uDD0D\uDD0E\uDD10-\uDD17\uDD1D\uDD20-\uDD25\uDD27-\uDD2F\uDD3A\uDD3F-\uDD45\uDD47-\uDD76\uDD78\uDD7A-\uDDB4\uDDB7\uDDBA\uDDBC-\uDDCB\uDDD0\uDDE0-\uDDFF\uDE70-\uDE74\uDE78-\uDE7A\uDE80-\uDE86\uDE90-\uDEA8\uDEB0-\uDEB6\uDEC0-\uDEC2\uDED0-\uDED6]|(?:[\u231A\u231B\u23E9-\u23EC\u23F0\u23F3\u25FD\u25FE\u2614\u2615\u2648-\u2653\u267F\u2693\u26A1\u26AA\u26AB\u26BD\u26BE\u26C4\u26C5\u26CE\u26D4\u26EA\u26F2\u26F3\u26F5\u26FA\u26FD\u2705\u270A\u270B\u2728\u274C\u274E\u2753-\u2755\u2757\u2795-\u2797\u27B0\u27BF\u2B1B\u2B1C\u2B50\u2B55]|\uD83C[\uDC04\uDCCF\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE1A\uDE2F\uDE32-\uDE36\uDE38-\uDE3A\uDE50\uDE51\uDF00-\uDF20\uDF2D-\uDF35\uDF37-\uDF7C\uDF7E-\uDF93\uDFA0-\uDFCA\uDFCF-\uDFD3\uDFE0-\uDFF0\uDFF4\uDFF8-\uDFFF]|\uD83D[\uDC00-\uDC3E\uDC40\uDC42-\uDCFC\uDCFF-\uDD3D\uDD4B-\uDD4E\uDD50-\uDD67\uDD7A\uDD95\uDD96\uDDA4\uDDFB-\uDE4F\uDE80-\uDEC5\uDECC\uDED0-\uDED2\uDED5-\uDED7\uDEEB\uDEEC\uDEF4-\uDEFC\uDFE0-\uDFEB]|\uD83E[\uDD0C-\uDD3A\uDD3C-\uDD45\uDD47-\uDD78\uDD7A-\uDDCB\uDDCD-\uDDFF\uDE70-\uDE74\uDE78-\uDE7A\uDE80-\uDE86\uDE90-\uDEA8\uDEB0-\uDEB6\uDEC0-\uDEC2\uDED0-\uDED6])|(?:[#\*0-9\xA9\xAE\u203C\u2049\u2122\u2139\u2194-\u2199\u21A9\u21AA\u231A\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2\u25AA\u25AB\u25B6\u25C0\u25FB-\u25FE\u2600-\u2604\u260E\u2611\u2614\u2615\u2618\u261D\u2620\u2622\u2623\u2626\u262A\u262E\u262F\u2638-\u263A\u2640\u2642\u2648-\u2653\u265F\u2660\u2663\u2665\u2666\u2668\u267B\u267E\u267F\u2692-\u2697\u2699\u269B\u269C\u26A0\u26A1\u26A7\u26AA\u26AB\u26B0\u26B1\u26BD\u26BE\u26C4\u26C5\u26C8\u26CE\u26CF\u26D1\u26D3\u26D4\u26E9\u26EA\u26F0-\u26F5\u26F7-\u26FA\u26FD\u2702\u2705\u2708-\u270D\u270F\u2712\u2714\u2716\u271D\u2721\u2728\u2733\u2734\u2744\u2747\u274C\u274E\u2753-\u2755\u2757\u2763\u2764\u2795-\u2797\u27A1\u27B0\u27BF\u2934\u2935\u2B05-\u2B07\u2B1B\u2B1C\u2B50\u2B55\u3030\u303D\u3297\u3299]|\uD83C[\uDC04\uDCCF\uDD70\uDD71\uDD7E\uDD7F\uDD8E\uDD91-\uDD9A\uDDE6-\uDDFF\uDE01\uDE02\uDE1A\uDE2F\uDE32-\uDE3A\uDE50\uDE51\uDF00-\uDF21\uDF24-\uDF93\uDF96\uDF97\uDF99-\uDF9B\uDF9E-\uDFF0\uDFF3-\uDFF5\uDFF7-\uDFFF]|\uD83D[\uDC00-\uDCFD\uDCFF-\uDD3D\uDD49-\uDD4E\uDD50-\uDD67\uDD6F\uDD70\uDD73-\uDD7A\uDD87\uDD8A-\uDD8D\uDD90\uDD95\uDD96\uDDA4\uDDA5\uDDA8\uDDB1\uDDB2\uDDBC\uDDC2-\uDDC4\uDDD1-\uDDD3\uDDDC-\uDDDE\uDDE1\uDDE3\uDDE8\uDDEF\uDDF3\uDDFA-\uDE4F\uDE80-\uDEC5\uDECB-\uDED2\uDED5-\uDED7\uDEE0-\uDEE5\uDEE9\uDEEB\uDEEC\uDEF0\uDEF3-\uDEFC\uDFE0-\uDFEB]|\uD83E[\uDD0C-\uDD3A\uDD3C-\uDD45\uDD47-\uDD78\uDD7A-\uDDCB\uDDCD-\uDDFF\uDE70-\uDE74\uDE78-\uDE7A\uDE80-\uDE86\uDE90-\uDEA8\uDEB0-\uDEB6\uDEC0-\uDEC2\uDED0-\uDED6])\uFE0F|(?:[\u261D\u26F9\u270A-\u270D]|\uD83C[\uDF85\uDFC2-\uDFC4\uDFC7\uDFCA-\uDFCC]|\uD83D[\uDC42\uDC43\uDC46-\uDC50\uDC66-\uDC78\uDC7C\uDC81-\uDC83\uDC85-\uDC87\uDC8F\uDC91\uDCAA\uDD74\uDD75\uDD7A\uDD90\uDD95\uDD96\uDE45-\uDE47\uDE4B-\uDE4F\uDEA3\uDEB4-\uDEB6\uDEC0\uDECC]|\uD83E[\uDD0C\uDD0F\uDD18-\uDD1F\uDD26\uDD30-\uDD39\uDD3C-\uDD3E\uDD77\uDDB5\uDDB6\uDDB8\uDDB9\uDDBB\uDDCD-\uDDCF\uDDD1-\uDDDD])/g;
    };
    uD = T(DD);
    d = 10;
    M = (e2 = 0) => (u) => `\x1B[${u + e2}m`;
    P = (e2 = 0) => (u) => `\x1B[${38 + e2};5;${u}m`;
    W = (e2 = 0) => (u, F, t) => `\x1B[${38 + e2};2;${u};${F};${t}m`;
    r = { modifier: { reset: [0, 0], bold: [1, 22], dim: [2, 22], italic: [3, 23], underline: [4, 24], overline: [53, 55], inverse: [7, 27], hidden: [8, 28], strikethrough: [9, 29] }, color: { black: [30, 39], red: [31, 39], green: [32, 39], yellow: [33, 39], blue: [34, 39], magenta: [35, 39], cyan: [36, 39], white: [37, 39], blackBright: [90, 39], gray: [90, 39], grey: [90, 39], redBright: [91, 39], greenBright: [92, 39], yellowBright: [93, 39], blueBright: [94, 39], magentaBright: [95, 39], cyanBright: [96, 39], whiteBright: [97, 39] }, bgColor: { bgBlack: [40, 49], bgRed: [41, 49], bgGreen: [42, 49], bgYellow: [43, 49], bgBlue: [44, 49], bgMagenta: [45, 49], bgCyan: [46, 49], bgWhite: [47, 49], bgBlackBright: [100, 49], bgGray: [100, 49], bgGrey: [100, 49], bgRedBright: [101, 49], bgGreenBright: [102, 49], bgYellowBright: [103, 49], bgBlueBright: [104, 49], bgMagentaBright: [105, 49], bgCyanBright: [106, 49], bgWhiteBright: [107, 49] } };
    Object.keys(r.modifier);
    FD = Object.keys(r.color);
    eD = Object.keys(r.bgColor);
    [...FD, ...eD];
    sD = tD();
    g = /* @__PURE__ */ new Set(["\x1B", "\x9B"]);
    CD = 39;
    b = "\x07";
    O = "[";
    iD = "]";
    I = "m";
    w = `${iD}8;;`;
    N = (e2) => `${g.values().next().value}${O}${e2}${I}`;
    L = (e2) => `${g.values().next().value}${w}${e2}${b}`;
    rD = (e2) => e2.split(" ").map((u) => A(u));
    y = (e2, u, F) => {
      const t = [...u];
      let s = false, C2 = false, D = A(S(e2[e2.length - 1]));
      for (const [i, n] of t.entries()) {
        const E2 = A(n);
        if (D + E2 <= F ? e2[e2.length - 1] += n : (e2.push(n), D = 0), g.has(n) && (s = true, C2 = t.slice(i + 1).join("").startsWith(w)), s) {
          C2 ? n === b && (s = false, C2 = false) : n === I && (s = false);
          continue;
        }
        D += E2, D === F && i < t.length - 1 && (e2.push(""), D = 0);
      }
      !D && e2[e2.length - 1].length > 0 && e2.length > 1 && (e2[e2.length - 2] += e2.pop());
    };
    ED = (e2) => {
      const u = e2.split(" ");
      let F = u.length;
      for (; F > 0 && !(A(u[F - 1]) > 0); ) F--;
      return F === u.length ? e2 : u.slice(0, F).join(" ") + u.slice(F).join("");
    };
    oD = (e2, u, F = {}) => {
      if (F.trim !== false && e2.trim() === "") return "";
      let t = "", s, C2;
      const D = rD(e2);
      let i = [""];
      for (const [E2, h2] of e2.split(" ").entries()) {
        F.trim !== false && (i[i.length - 1] = i[i.length - 1].trimStart());
        let o2 = A(i[i.length - 1]);
        if (E2 !== 0 && (o2 >= u && (F.wordWrap === false || F.trim === false) && (i.push(""), o2 = 0), (o2 > 0 || F.trim === false) && (i[i.length - 1] += " ", o2++)), F.hard && D[E2] > u) {
          const B2 = u - o2, p = 1 + Math.floor((D[E2] - B2 - 1) / u);
          Math.floor((D[E2] - 1) / u) < p && i.push(""), y(i, h2, u);
          continue;
        }
        if (o2 + D[E2] > u && o2 > 0 && D[E2] > 0) {
          if (F.wordWrap === false && o2 < u) {
            y(i, h2, u);
            continue;
          }
          i.push("");
        }
        if (o2 + D[E2] > u && F.wordWrap === false) {
          y(i, h2, u);
          continue;
        }
        i[i.length - 1] += h2;
      }
      F.trim !== false && (i = i.map((E2) => ED(E2)));
      const n = [...i.join(`
`)];
      for (const [E2, h2] of n.entries()) {
        if (t += h2, g.has(h2)) {
          const { groups: B2 } = new RegExp(`(?:\\${O}(?<code>\\d+)m|\\${w}(?<uri>.*)${b})`).exec(n.slice(E2).join("")) || { groups: {} };
          if (B2.code !== void 0) {
            const p = Number.parseFloat(B2.code);
            s = p === CD ? void 0 : p;
          } else B2.uri !== void 0 && (C2 = B2.uri.length === 0 ? void 0 : B2.uri);
        }
        const o2 = sD.codes.get(Number(s));
        n[E2 + 1] === `
` ? (C2 && (t += L("")), s && o2 && (t += N(o2))) : h2 === `
` && (s && o2 && (t += N(s)), C2 && (t += L(C2)));
      }
      return t;
    };
    nD = Object.defineProperty;
    aD = (e2, u, F) => u in e2 ? nD(e2, u, { enumerable: true, configurable: true, writable: true, value: F }) : e2[u] = F;
    a = (e2, u, F) => (aD(e2, typeof u != "symbol" ? u + "" : u, F), F);
    V = Symbol("clack:cancel");
    z = /* @__PURE__ */ new Map([["k", "up"], ["j", "down"], ["h", "left"], ["l", "right"]]);
    xD = /* @__PURE__ */ new Set(["up", "down", "left", "right", "space", "enter"]);
    x = class {
      constructor({ render: u, input: F = $, output: t = k, ...s }, C2 = true) {
        a(this, "input"), a(this, "output"), a(this, "rl"), a(this, "opts"), a(this, "_track", false), a(this, "_render"), a(this, "_cursor", 0), a(this, "state", "initial"), a(this, "value"), a(this, "error", ""), a(this, "subscribers", /* @__PURE__ */ new Map()), a(this, "_prevFrame", ""), this.opts = s, this.onKeypress = this.onKeypress.bind(this), this.close = this.close.bind(this), this.render = this.render.bind(this), this._render = u.bind(this), this._track = C2, this.input = F, this.output = t;
      }
      prompt() {
        const u = new U(0);
        return u._write = (F, t, s) => {
          this._track && (this.value = this.rl.line.replace(/\t/g, ""), this._cursor = this.rl.cursor, this.emit("value", this.value)), s();
        }, this.input.pipe(u), this.rl = _.createInterface({ input: this.input, output: u, tabSize: 2, prompt: "", escapeCodeTimeout: 50 }), _.emitKeypressEvents(this.input, this.rl), this.rl.prompt(), this.opts.initialValue !== void 0 && this._track && this.rl.write(this.opts.initialValue), this.input.on("keypress", this.onKeypress), v(this.input, true), this.output.on("resize", this.render), this.render(), new Promise((F, t) => {
          this.once("submit", () => {
            this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), v(this.input, false), F(this.value);
          }), this.once("cancel", () => {
            this.output.write(import_sisteransi.cursor.show), this.output.off("resize", this.render), v(this.input, false), F(V);
          });
        });
      }
      on(u, F) {
        const t = this.subscribers.get(u) ?? [];
        t.push({ cb: F }), this.subscribers.set(u, t);
      }
      once(u, F) {
        const t = this.subscribers.get(u) ?? [];
        t.push({ cb: F, once: true }), this.subscribers.set(u, t);
      }
      emit(u, ...F) {
        const t = this.subscribers.get(u) ?? [], s = [];
        for (const C2 of t) C2.cb(...F), C2.once && s.push(() => t.splice(t.indexOf(C2), 1));
        for (const C2 of s) C2();
      }
      unsubscribe() {
        this.subscribers.clear();
      }
      onKeypress(u, F) {
        if (this.state === "error" && (this.state = "active"), F?.name && !this._track && z.has(F.name) && this.emit("cursor", z.get(F.name)), F?.name && xD.has(F.name) && this.emit("cursor", F.name), u && (u.toLowerCase() === "y" || u.toLowerCase() === "n") && this.emit("confirm", u.toLowerCase() === "y"), u === "	" && this.opts.placeholder && (this.value || (this.rl.write(this.opts.placeholder), this.emit("value", this.opts.placeholder))), u && this.emit("key", u.toLowerCase()), F?.name === "return") {
          if (this.opts.validate) {
            const t = this.opts.validate(this.value);
            t && (this.error = t, this.state = "error", this.rl.write(this.value));
          }
          this.state !== "error" && (this.state = "submit");
        }
        u === "" && (this.state = "cancel"), (this.state === "submit" || this.state === "cancel") && this.emit("finalize"), this.render(), (this.state === "submit" || this.state === "cancel") && this.close();
      }
      close() {
        this.input.unpipe(), this.input.removeListener("keypress", this.onKeypress), this.output.write(`
`), v(this.input, false), this.rl.close(), this.emit(`${this.state}`, this.value), this.unsubscribe();
      }
      restoreCursor() {
        const u = R(this._prevFrame, process.stdout.columns, { hard: true }).split(`
`).length - 1;
        this.output.write(import_sisteransi.cursor.move(-999, u * -1));
      }
      render() {
        const u = R(this._render(this) ?? "", process.stdout.columns, { hard: true });
        if (u !== this._prevFrame) {
          if (this.state === "initial") this.output.write(import_sisteransi.cursor.hide);
          else {
            const F = hD(this._prevFrame, u);
            if (this.restoreCursor(), F && F?.length === 1) {
              const t = F[0];
              this.output.write(import_sisteransi.cursor.move(0, t)), this.output.write(import_sisteransi.erase.lines(1));
              const s = u.split(`
`);
              this.output.write(s[t]), this._prevFrame = u, this.output.write(import_sisteransi.cursor.move(0, s.length - t - 1));
              return;
            } else if (F && F?.length > 1) {
              const t = F[0];
              this.output.write(import_sisteransi.cursor.move(0, t)), this.output.write(import_sisteransi.erase.down());
              const s = u.split(`
`).slice(t);
              this.output.write(s.join(`
`)), this._prevFrame = u;
              return;
            }
            this.output.write(import_sisteransi.erase.down());
          }
          this.output.write(u), this.state === "initial" && (this.state = "active"), this._prevFrame = u;
        }
      }
    };
    BD = class extends x {
      get cursor() {
        return this.value ? 0 : 1;
      }
      get _value() {
        return this.cursor === 0;
      }
      constructor(u) {
        super(u, false), this.value = !!u.initialValue, this.on("value", () => {
          this.value = this._value;
        }), this.on("confirm", (F) => {
          this.output.write(import_sisteransi.cursor.move(0, -1)), this.value = F, this.state = "submit", this.close();
        }), this.on("cursor", () => {
          this.value = !this.value;
        });
      }
    };
    fD = Object.defineProperty;
    gD = (e2, u, F) => u in e2 ? fD(e2, u, { enumerable: true, configurable: true, writable: true, value: F }) : e2[u] = F;
    K = (e2, u, F) => (gD(e2, typeof u != "symbol" ? u + "" : u, F), F);
    vD = class extends x {
      constructor(u) {
        super(u, false), K(this, "options"), K(this, "cursor", 0), this.options = u.options, this.value = [...u.initialValues ?? []], this.cursor = Math.max(this.options.findIndex(({ value: F }) => F === u.cursorAt), 0), this.on("key", (F) => {
          F === "a" && this.toggleAll();
        }), this.on("cursor", (F) => {
          switch (F) {
            case "left":
            case "up":
              this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
              break;
            case "down":
            case "right":
              this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
              break;
            case "space":
              this.toggleValue();
              break;
          }
        });
      }
      get _value() {
        return this.options[this.cursor].value;
      }
      toggleAll() {
        const u = this.value.length === this.options.length;
        this.value = u ? [] : this.options.map((F) => F.value);
      }
      toggleValue() {
        const u = this.value.includes(this._value);
        this.value = u ? this.value.filter((F) => F !== this._value) : [...this.value, this._value];
      }
    };
    mD = Object.defineProperty;
    dD = (e2, u, F) => u in e2 ? mD(e2, u, { enumerable: true, configurable: true, writable: true, value: F }) : e2[u] = F;
    Y = (e2, u, F) => (dD(e2, typeof u != "symbol" ? u + "" : u, F), F);
    bD = class extends x {
      constructor({ mask: u, ...F }) {
        super(F), Y(this, "valueWithCursor", ""), Y(this, "_mask", "\u2022"), this._mask = u ?? "\u2022", this.on("finalize", () => {
          this.valueWithCursor = this.masked;
        }), this.on("value", () => {
          if (this.cursor >= this.value.length) this.valueWithCursor = `${this.masked}${import_picocolors.default.inverse(import_picocolors.default.hidden("_"))}`;
          else {
            const t = this.masked.slice(0, this.cursor), s = this.masked.slice(this.cursor);
            this.valueWithCursor = `${t}${import_picocolors.default.inverse(s[0])}${s.slice(1)}`;
          }
        });
      }
      get cursor() {
        return this._cursor;
      }
      get masked() {
        return this.value.replaceAll(/./g, this._mask);
      }
    };
    wD = Object.defineProperty;
    yD = (e2, u, F) => u in e2 ? wD(e2, u, { enumerable: true, configurable: true, writable: true, value: F }) : e2[u] = F;
    Z = (e2, u, F) => (yD(e2, typeof u != "symbol" ? u + "" : u, F), F);
    $D = class extends x {
      constructor(u) {
        super(u, false), Z(this, "options"), Z(this, "cursor", 0), this.options = u.options, this.cursor = this.options.findIndex(({ value: F }) => F === u.initialValue), this.cursor === -1 && (this.cursor = 0), this.changeValue(), this.on("cursor", (F) => {
          switch (F) {
            case "left":
            case "up":
              this.cursor = this.cursor === 0 ? this.options.length - 1 : this.cursor - 1;
              break;
            case "down":
            case "right":
              this.cursor = this.cursor === this.options.length - 1 ? 0 : this.cursor + 1;
              break;
          }
          this.changeValue();
        });
      }
      get _value() {
        return this.options[this.cursor];
      }
      changeValue() {
        this.value = this._value.value;
      }
    };
    TD = Object.defineProperty;
    jD = (e2, u, F) => u in e2 ? TD(e2, u, { enumerable: true, configurable: true, writable: true, value: F }) : e2[u] = F;
    MD = (e2, u, F) => (jD(e2, typeof u != "symbol" ? u + "" : u, F), F);
    PD = class extends x {
      constructor(u) {
        super(u), MD(this, "valueWithCursor", ""), this.on("finalize", () => {
          this.value || (this.value = u.defaultValue), this.valueWithCursor = this.value;
        }), this.on("value", () => {
          if (this.cursor >= this.value.length) this.valueWithCursor = `${this.value}${import_picocolors.default.inverse(import_picocolors.default.hidden("_"))}`;
          else {
            const F = this.value.slice(0, this.cursor), t = this.value.slice(this.cursor);
            this.valueWithCursor = `${F}${import_picocolors.default.inverse(t[0])}${t.slice(1)}`;
          }
        });
      }
      get cursor() {
        return this._cursor;
      }
    };
    WD = globalThis.process.platform.startsWith("win");
  }
});

// ../node_modules/.pnpm/@clack+prompts@0.7.0/node_modules/@clack/prompts/dist/index.mjs
import h from "node:process";
function q2() {
  return h.platform !== "win32" ? h.env.TERM !== "linux" : Boolean(h.env.CI) || Boolean(h.env.WT_SESSION) || Boolean(h.env.TERMINUS_SUBLIME) || h.env.ConEmuTask === "{cmd::Cmder}" || h.env.TERM_PROGRAM === "Terminus-Sublime" || h.env.TERM_PROGRAM === "vscode" || h.env.TERM === "xterm-256color" || h.env.TERM === "alacritty" || h.env.TERMINAL_EMULATOR === "JetBrains-JediTerm";
}
function me() {
  const r2 = ["[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)", "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TZcf-nq-uy=><~]))"].join("|");
  return new RegExp(r2, "g");
}
var import_picocolors2, import_sisteransi2, _2, o, H, I2, x2, S2, K2, a2, d2, b2, E, C, w2, M2, U2, B, Z2, z2, X2, J2, Y2, Q2, ee, y2, te, re, se, ie, ae, R2, le, ue, oe, $e, de;
var init_dist2 = __esm({
  "../node_modules/.pnpm/@clack+prompts@0.7.0/node_modules/@clack/prompts/dist/index.mjs"() {
    init_dist();
    init_dist();
    import_picocolors2 = __toESM(require_picocolors(), 1);
    import_sisteransi2 = __toESM(require_src(), 1);
    _2 = q2();
    o = (r2, n) => _2 ? r2 : n;
    H = o("\u25C6", "*");
    I2 = o("\u25A0", "x");
    x2 = o("\u25B2", "x");
    S2 = o("\u25C7", "o");
    K2 = o("\u250C", "T");
    a2 = o("\u2502", "|");
    d2 = o("\u2514", "\u2014");
    b2 = o("\u25CF", ">");
    E = o("\u25CB", " ");
    C = o("\u25FB", "[\u2022]");
    w2 = o("\u25FC", "[+]");
    M2 = o("\u25FB", "[ ]");
    U2 = o("\u25AA", "\u2022");
    B = o("\u2500", "-");
    Z2 = o("\u256E", "+");
    z2 = o("\u251C", "+");
    X2 = o("\u256F", "+");
    J2 = o("\u25CF", "\u2022");
    Y2 = o("\u25C6", "*");
    Q2 = o("\u25B2", "!");
    ee = o("\u25A0", "x");
    y2 = (r2) => {
      switch (r2) {
        case "initial":
        case "active":
          return import_picocolors2.default.cyan(H);
        case "cancel":
          return import_picocolors2.default.red(I2);
        case "error":
          return import_picocolors2.default.yellow(x2);
        case "submit":
          return import_picocolors2.default.green(S2);
      }
    };
    te = (r2) => new PD({ validate: r2.validate, placeholder: r2.placeholder, defaultValue: r2.defaultValue, initialValue: r2.initialValue, render() {
      const n = `${import_picocolors2.default.gray(a2)}
${y2(this.state)}  ${r2.message}
`, i = r2.placeholder ? import_picocolors2.default.inverse(r2.placeholder[0]) + import_picocolors2.default.dim(r2.placeholder.slice(1)) : import_picocolors2.default.inverse(import_picocolors2.default.hidden("_")), t = this.value ? this.valueWithCursor : i;
      switch (this.state) {
        case "error":
          return `${n.trim()}
${import_picocolors2.default.yellow(a2)}  ${t}
${import_picocolors2.default.yellow(d2)}  ${import_picocolors2.default.yellow(this.error)}
`;
        case "submit":
          return `${n}${import_picocolors2.default.gray(a2)}  ${import_picocolors2.default.dim(this.value || r2.placeholder)}`;
        case "cancel":
          return `${n}${import_picocolors2.default.gray(a2)}  ${import_picocolors2.default.strikethrough(import_picocolors2.default.dim(this.value ?? ""))}${this.value?.trim() ? `
` + import_picocolors2.default.gray(a2) : ""}`;
        default:
          return `${n}${import_picocolors2.default.cyan(a2)}  ${t}
${import_picocolors2.default.cyan(d2)}
`;
      }
    } }).prompt();
    re = (r2) => new bD({ validate: r2.validate, mask: r2.mask ?? U2, render() {
      const n = `${import_picocolors2.default.gray(a2)}
${y2(this.state)}  ${r2.message}
`, i = this.valueWithCursor, t = this.masked;
      switch (this.state) {
        case "error":
          return `${n.trim()}
${import_picocolors2.default.yellow(a2)}  ${t}
${import_picocolors2.default.yellow(d2)}  ${import_picocolors2.default.yellow(this.error)}
`;
        case "submit":
          return `${n}${import_picocolors2.default.gray(a2)}  ${import_picocolors2.default.dim(t)}`;
        case "cancel":
          return `${n}${import_picocolors2.default.gray(a2)}  ${import_picocolors2.default.strikethrough(import_picocolors2.default.dim(t ?? ""))}${t ? `
` + import_picocolors2.default.gray(a2) : ""}`;
        default:
          return `${n}${import_picocolors2.default.cyan(a2)}  ${i}
${import_picocolors2.default.cyan(d2)}
`;
      }
    } }).prompt();
    se = (r2) => {
      const n = r2.active ?? "Yes", i = r2.inactive ?? "No";
      return new BD({ active: n, inactive: i, initialValue: r2.initialValue ?? true, render() {
        const t = `${import_picocolors2.default.gray(a2)}
${y2(this.state)}  ${r2.message}
`, s = this.value ? n : i;
        switch (this.state) {
          case "submit":
            return `${t}${import_picocolors2.default.gray(a2)}  ${import_picocolors2.default.dim(s)}`;
          case "cancel":
            return `${t}${import_picocolors2.default.gray(a2)}  ${import_picocolors2.default.strikethrough(import_picocolors2.default.dim(s))}
${import_picocolors2.default.gray(a2)}`;
          default:
            return `${t}${import_picocolors2.default.cyan(a2)}  ${this.value ? `${import_picocolors2.default.green(b2)} ${n}` : `${import_picocolors2.default.dim(E)} ${import_picocolors2.default.dim(n)}`} ${import_picocolors2.default.dim("/")} ${this.value ? `${import_picocolors2.default.dim(E)} ${import_picocolors2.default.dim(i)}` : `${import_picocolors2.default.green(b2)} ${i}`}
${import_picocolors2.default.cyan(d2)}
`;
        }
      } }).prompt();
    };
    ie = (r2) => {
      const n = (t, s) => {
        const c2 = t.label ?? String(t.value);
        return s === "active" ? `${import_picocolors2.default.green(b2)} ${c2} ${t.hint ? import_picocolors2.default.dim(`(${t.hint})`) : ""}` : s === "selected" ? `${import_picocolors2.default.dim(c2)}` : s === "cancelled" ? `${import_picocolors2.default.strikethrough(import_picocolors2.default.dim(c2))}` : `${import_picocolors2.default.dim(E)} ${import_picocolors2.default.dim(c2)}`;
      };
      let i = 0;
      return new $D({ options: r2.options, initialValue: r2.initialValue, render() {
        const t = `${import_picocolors2.default.gray(a2)}
${y2(this.state)}  ${r2.message}
`;
        switch (this.state) {
          case "submit":
            return `${t}${import_picocolors2.default.gray(a2)}  ${n(this.options[this.cursor], "selected")}`;
          case "cancel":
            return `${t}${import_picocolors2.default.gray(a2)}  ${n(this.options[this.cursor], "cancelled")}
${import_picocolors2.default.gray(a2)}`;
          default: {
            const s = r2.maxItems === void 0 ? 1 / 0 : Math.max(r2.maxItems, 5);
            this.cursor >= i + s - 3 ? i = Math.max(Math.min(this.cursor - s + 3, this.options.length - s), 0) : this.cursor < i + 2 && (i = Math.max(this.cursor - 2, 0));
            const c2 = s < this.options.length && i > 0, l2 = s < this.options.length && i + s < this.options.length;
            return `${t}${import_picocolors2.default.cyan(a2)}  ${this.options.slice(i, i + s).map((u, m2, $2) => m2 === 0 && c2 ? import_picocolors2.default.dim("...") : m2 === $2.length - 1 && l2 ? import_picocolors2.default.dim("...") : n(u, m2 + i === this.cursor ? "active" : "inactive")).join(`
${import_picocolors2.default.cyan(a2)}  `)}
${import_picocolors2.default.cyan(d2)}
`;
          }
        }
      } }).prompt();
    };
    ae = (r2) => {
      const n = (i, t) => {
        const s = i.label ?? String(i.value);
        return t === "active" ? `${import_picocolors2.default.cyan(C)} ${s} ${i.hint ? import_picocolors2.default.dim(`(${i.hint})`) : ""}` : t === "selected" ? `${import_picocolors2.default.green(w2)} ${import_picocolors2.default.dim(s)}` : t === "cancelled" ? `${import_picocolors2.default.strikethrough(import_picocolors2.default.dim(s))}` : t === "active-selected" ? `${import_picocolors2.default.green(w2)} ${s} ${i.hint ? import_picocolors2.default.dim(`(${i.hint})`) : ""}` : t === "submitted" ? `${import_picocolors2.default.dim(s)}` : `${import_picocolors2.default.dim(M2)} ${import_picocolors2.default.dim(s)}`;
      };
      return new vD({ options: r2.options, initialValues: r2.initialValues, required: r2.required ?? true, cursorAt: r2.cursorAt, validate(i) {
        if (this.required && i.length === 0) return `Please select at least one option.
${import_picocolors2.default.reset(import_picocolors2.default.dim(`Press ${import_picocolors2.default.gray(import_picocolors2.default.bgWhite(import_picocolors2.default.inverse(" space ")))} to select, ${import_picocolors2.default.gray(import_picocolors2.default.bgWhite(import_picocolors2.default.inverse(" enter ")))} to submit`))}`;
      }, render() {
        let i = `${import_picocolors2.default.gray(a2)}
${y2(this.state)}  ${r2.message}
`;
        switch (this.state) {
          case "submit":
            return `${i}${import_picocolors2.default.gray(a2)}  ${this.options.filter(({ value: t }) => this.value.includes(t)).map((t) => n(t, "submitted")).join(import_picocolors2.default.dim(", ")) || import_picocolors2.default.dim("none")}`;
          case "cancel": {
            const t = this.options.filter(({ value: s }) => this.value.includes(s)).map((s) => n(s, "cancelled")).join(import_picocolors2.default.dim(", "));
            return `${i}${import_picocolors2.default.gray(a2)}  ${t.trim() ? `${t}
${import_picocolors2.default.gray(a2)}` : ""}`;
          }
          case "error": {
            const t = this.error.split(`
`).map((s, c2) => c2 === 0 ? `${import_picocolors2.default.yellow(d2)}  ${import_picocolors2.default.yellow(s)}` : `   ${s}`).join(`
`);
            return i + import_picocolors2.default.yellow(a2) + "  " + this.options.map((s, c2) => {
              const l2 = this.value.includes(s.value), u = c2 === this.cursor;
              return u && l2 ? n(s, "active-selected") : l2 ? n(s, "selected") : n(s, u ? "active" : "inactive");
            }).join(`
${import_picocolors2.default.yellow(a2)}  `) + `
` + t + `
`;
          }
          default:
            return `${i}${import_picocolors2.default.cyan(a2)}  ${this.options.map((t, s) => {
              const c2 = this.value.includes(t.value), l2 = s === this.cursor;
              return l2 && c2 ? n(t, "active-selected") : c2 ? n(t, "selected") : n(t, l2 ? "active" : "inactive");
            }).join(`
${import_picocolors2.default.cyan(a2)}  `)}
${import_picocolors2.default.cyan(d2)}
`;
        }
      } }).prompt();
    };
    R2 = (r2) => r2.replace(me(), "");
    le = (r2 = "", n = "") => {
      const i = `
${r2}
`.split(`
`), t = R2(n).length, s = Math.max(i.reduce((l2, u) => (u = R2(u), u.length > l2 ? u.length : l2), 0), t) + 2, c2 = i.map((l2) => `${import_picocolors2.default.gray(a2)}  ${import_picocolors2.default.dim(l2)}${" ".repeat(s - R2(l2).length)}${import_picocolors2.default.gray(a2)}`).join(`
`);
      process.stdout.write(`${import_picocolors2.default.gray(a2)}
${import_picocolors2.default.green(S2)}  ${import_picocolors2.default.reset(n)} ${import_picocolors2.default.gray(B.repeat(Math.max(s - t - 1, 1)) + Z2)}
${c2}
${import_picocolors2.default.gray(z2 + B.repeat(s + 2) + X2)}
`);
    };
    ue = (r2 = "") => {
      process.stdout.write(`${import_picocolors2.default.gray(d2)}  ${import_picocolors2.default.red(r2)}

`);
    };
    oe = (r2 = "") => {
      process.stdout.write(`${import_picocolors2.default.gray(K2)}  ${r2}
`);
    };
    $e = (r2 = "") => {
      process.stdout.write(`${import_picocolors2.default.gray(a2)}
${import_picocolors2.default.gray(d2)}  ${r2}

`);
    };
    de = () => {
      const r2 = _2 ? ["\u25D2", "\u25D0", "\u25D3", "\u25D1"] : ["\u2022", "o", "O", "0"], n = _2 ? 80 : 120;
      let i, t, s = false, c2 = "";
      const l2 = (v2 = "") => {
        s = true, i = OD(), c2 = v2.replace(/\.+$/, ""), process.stdout.write(`${import_picocolors2.default.gray(a2)}
`);
        let g2 = 0, p = 0;
        t = setInterval(() => {
          const O2 = import_picocolors2.default.magenta(r2[g2]), P2 = ".".repeat(Math.floor(p)).slice(0, 3);
          process.stdout.write(import_sisteransi2.cursor.move(-999, 0)), process.stdout.write(import_sisteransi2.erase.down(1)), process.stdout.write(`${O2}  ${c2}${P2}`), g2 = g2 + 1 < r2.length ? g2 + 1 : 0, p = p < r2.length ? p + 0.125 : 0;
        }, n);
      }, u = (v2 = "", g2 = 0) => {
        c2 = v2 ?? c2, s = false, clearInterval(t);
        const p = g2 === 0 ? import_picocolors2.default.green(S2) : g2 === 1 ? import_picocolors2.default.red(I2) : import_picocolors2.default.red(x2);
        process.stdout.write(import_sisteransi2.cursor.move(-999, 0)), process.stdout.write(import_sisteransi2.erase.down(1)), process.stdout.write(`${p}  ${c2}
`), i();
      }, m2 = (v2 = "") => {
        c2 = v2 ?? c2;
      }, $2 = (v2) => {
        const g2 = v2 > 1 ? "Something went wrong" : "Canceled";
        s && u(g2, v2);
      };
      return process.on("uncaughtExceptionMonitor", () => $2(2)), process.on("unhandledRejection", () => $2(2)), process.on("SIGINT", () => $2(1)), process.on("SIGTERM", () => $2(1)), process.on("exit", $2), { start: l2, stop: u, message: m2 };
    };
  }
});

// src/config.ts
import { readFile, writeFile, access } from "node:fs/promises";
import { homedir } from "node:os";
import { join, dirname, resolve, sep } from "node:path";
async function loadConfig() {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.name) return null;
    return {
      name: parsed.name,
      server: parsed.server ?? DEFAULTS.server,
      token: parsed.token ?? DEFAULTS.token,
      optOutProjects: parsed.optOutProjects ?? [],
      optOutSessions: parsed.optOutSessions ?? [],
      redact: parsed.redact ?? DEFAULTS.redact
    };
  } catch {
    return null;
  }
}
async function saveConfig(cfg) {
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
}
function newConfig(name, overrides = {}) {
  return {
    name,
    ...DEFAULTS,
    ...overrides
  };
}
async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}
function isUnderAny(dir, roots) {
  const d3 = resolve(dir);
  return roots.some((p) => {
    const root = resolve(p);
    return d3 === root || d3.startsWith(root + sep);
  });
}
async function hasIgnoreMarker(dir) {
  let cur = resolve(dir);
  while (true) {
    if (await exists(join(cur, IGNORE_MARKER))) return true;
    const parent = dirname(cur);
    if (parent === cur) return false;
    cur = parent;
  }
}
async function shouldTrack(cwd, sessionId, cfg) {
  if (sessionId && cfg.optOutSessions.includes(sessionId)) return false;
  if (isUnderAny(cwd, cfg.optOutProjects)) return false;
  if (await hasIgnoreMarker(cwd)) return false;
  return true;
}
var CONFIG_PATH, IGNORE_MARKER, DEFAULTS;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    CONFIG_PATH = join(homedir(), ".claude", "claudelens.json");
    IGNORE_MARKER = ".claudelens-ignore";
    DEFAULTS = {
      server: process.env.CLAUDELENS_SERVER ?? "http://localhost:4000",
      token: process.env.CLAUDELENS_TOKEN || void 0,
      optOutProjects: [],
      optOutSessions: [],
      redact: false
    };
  }
});

// src/setup.ts
var setup_exports = {};
__export(setup_exports, {
  runSetup: () => runSetup
});
import { userInfo } from "node:os";
async function runSetup() {
  oe(import_picocolors3.default.bgCyan(import_picocolors3.default.black(" ClaudeLens setup ")));
  const existing = await loadConfig();
  const name = await te({
    message: "Your name (shown as the author on the dashboard)",
    initialValue: existing?.name ?? userInfo().username,
    validate: (v2) => v2.trim() ? void 0 : "required"
  });
  if (lD(name)) return ue("Cancelled.");
  const server = await te({
    message: "ClaudeLens server URL",
    initialValue: existing?.server ?? "http://localhost:4000",
    validate: (v2) => v2.trim() ? void 0 : "required"
  });
  if (lD(server)) return ue("Cancelled.");
  const token = await re({
    message: "Ingest token (blank = keep current / open server)"
  });
  if (lD(token)) return ue("Cancelled.");
  const tokenValue = token.trim() || existing?.token || void 0;
  const cfg = existing ? { ...existing, name: name.trim(), server: server.trim(), token: tokenValue } : newConfig(name.trim(), { server: server.trim(), token: tokenValue });
  await saveConfig(cfg);
  le(
    [
      `${import_picocolors3.default.bold("Name")}     ${cfg.name}`,
      `${import_picocolors3.default.bold("Server")}   ${cfg.server}`,
      `${import_picocolors3.default.bold("Token")}    ${cfg.token ? import_picocolors3.default.green("set") : import_picocolors3.default.dim("(none)")}`,
      `${import_picocolors3.default.bold("Tracking")} ${import_picocolors3.default.green("ON")} for all projects`,
      cfg.optOutProjects.length ? `${import_picocolors3.default.bold("Excluded")} ${cfg.optOutProjects.length} project(s)` : "",
      `${import_picocolors3.default.bold("Config")}   ${CONFIG_PATH}`
    ].filter(Boolean).join("\n"),
    "Saved"
  );
  $e(
    import_picocolors3.default.green("Setup complete \u2014 your sessions sync automatically.") + "\n" + import_picocolors3.default.dim("Choose which projects to track/exclude:  ") + import_picocolors3.default.cyan("claudelens projects")
  );
}
var import_picocolors3;
var init_setup = __esm({
  "src/setup.ts"() {
    "use strict";
    init_dist2();
    import_picocolors3 = __toESM(require_picocolors(), 1);
    init_config();
  }
});

// src/projects.ts
var projects_exports = {};
__export(projects_exports, {
  discover: () => discover,
  isExcluded: () => isExcluded,
  runProjects: () => runProjects
});
import { readdir, readFile as readFile2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join2, sep as sep2, resolve as resolve2 } from "node:path";
async function cwdOf(dir, files) {
  for (const f2 of files) {
    try {
      const raw = await readFile2(join2(dir, f2), "utf8");
      let scanned = 0;
      for (const line of raw.split("\n")) {
        if (!line.trim()) continue;
        if (++scanned > 80) break;
        try {
          const e2 = JSON.parse(line);
          if (e2.cwd) return e2.cwd;
        } catch {
        }
      }
    } catch {
    }
  }
  return void 0;
}
async function discover() {
  let dirs;
  try {
    dirs = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const byCwd = /* @__PURE__ */ new Map();
  for (const d3 of dirs) {
    const full = join2(PROJECTS_DIR, d3);
    let files;
    try {
      files = (await readdir(full)).filter((f2) => f2.endsWith(".jsonl"));
    } catch {
      continue;
    }
    if (!files.length) continue;
    const cwd = await cwdOf(full, files);
    if (!cwd) continue;
    const existing = byCwd.get(cwd);
    if (existing) existing.sessions += files.length;
    else byCwd.set(cwd, { cwd, label: cwd.replace(homedir2(), "~"), sessions: files.length });
  }
  return [...byCwd.values()].sort((a3, b3) => b3.sessions - a3.sessions);
}
function isExcluded(cwd, optOut) {
  const d3 = resolve2(cwd);
  return optOut.some((root) => {
    const r2 = resolve2(root);
    return d3 === r2 || d3.startsWith(r2 + sep2);
  });
}
async function runProjects() {
  oe(import_picocolors4.default.bgCyan(import_picocolors4.default.black(" ClaudeLens \xB7 projects ")));
  const cfg = await loadConfig();
  if (!cfg) {
    ue("Not set up yet \u2014 run /claudelens:setup first.");
    return;
  }
  const projects = await discover();
  if (!projects.length) {
    ue(`No Claude Code projects found in ${PROJECTS_DIR}.`);
    return;
  }
  const tracked = await ae({
    message: "Which projects should ClaudeLens track?",
    options: projects.map((pr) => ({
      value: pr.cwd,
      label: pr.label,
      hint: `${pr.sessions} session${pr.sessions === 1 ? "" : "s"}`
    })),
    initialValues: projects.filter((pr) => !isExcluded(pr.cwd, cfg.optOutProjects)).map((pr) => pr.cwd),
    required: false
  });
  if (lD(tracked)) return ue("Cancelled \u2014 nothing changed.");
  const keep = new Set(tracked);
  cfg.optOutProjects = projects.filter((pr) => !keep.has(pr.cwd)).map((pr) => pr.cwd);
  await saveConfig(cfg);
  const excluded = projects.length - keep.size;
  le(
    [
      `${import_picocolors4.default.green("Tracking")}  ${keep.size} project(s)`,
      `${import_picocolors4.default.yellow("Excluded")}  ${excluded} project(s)`
    ].join("\n"),
    "Saved"
  );
  $e(import_picocolors4.default.dim("Excluded projects stop syncing immediately; tracked ones resume on the next turn."));
}
var import_picocolors4, PROJECTS_DIR;
var init_projects = __esm({
  "src/projects.ts"() {
    "use strict";
    init_dist2();
    import_picocolors4 = __toESM(require_picocolors(), 1);
    init_config();
    PROJECTS_DIR = join2(homedir2(), ".claude", "projects");
  }
});

// src/status.ts
var status_exports = {};
__export(status_exports, {
  runStatus: () => runStatus
});
async function runStatus() {
  const cfg = await loadConfig();
  if (!cfg) {
    console.log(import_picocolors5.default.yellow("ClaudeLens is not set up on this machine."));
    console.log(`Run ${import_picocolors5.default.cyan("claudelens setup")} to configure it.`);
    return;
  }
  console.log(import_picocolors5.default.bold("\n  ClaudeLens status\n"));
  console.log(`  ${import_picocolors5.default.dim("Name")}     ${cfg.name}`);
  console.log(`  ${import_picocolors5.default.dim("Server")}   ${cfg.server}`);
  console.log(`  ${import_picocolors5.default.dim("Token")}    ${cfg.token ? import_picocolors5.default.green("set") : import_picocolors5.default.dim("(none)")}`);
  console.log(`  ${import_picocolors5.default.dim("Redact")}   ${cfg.redact ? "on" : "off"}`);
  console.log(`  ${import_picocolors5.default.dim("Config")}   ${CONFIG_PATH}`);
  try {
    const r2 = await fetch(`${cfg.server}/api/health`, { signal: AbortSignal.timeout(3e3) });
    console.log(`  ${import_picocolors5.default.dim("Health")}   ${r2.ok ? import_picocolors5.default.green("reachable") : import_picocolors5.default.red(`HTTP ${r2.status}`)}`);
  } catch {
    console.log(`  ${import_picocolors5.default.dim("Health")}   ${import_picocolors5.default.red("unreachable")}`);
  }
  const projects = await discover();
  const tracked = projects.filter((p) => !isExcluded(p.cwd, cfg.optOutProjects));
  const excluded = projects.filter((p) => isExcluded(p.cwd, cfg.optOutProjects));
  console.log(import_picocolors5.default.bold(`
  Projects  ${import_picocolors5.default.green(`${tracked.length} tracked`)} \xB7 ${import_picocolors5.default.yellow(`${excluded.length} excluded`)}
`));
  for (const p of projects) {
    const off = isExcluded(p.cwd, cfg.optOutProjects);
    const mark = off ? import_picocolors5.default.yellow("\u2717") : import_picocolors5.default.green("\u2713");
    const label = off ? import_picocolors5.default.dim(p.label) : p.label;
    console.log(`  ${mark} ${label} ${import_picocolors5.default.dim(`(${p.sessions})`)}`);
  }
  console.log(`
  Change with ${import_picocolors5.default.cyan("claudelens projects")}
`);
}
var import_picocolors5;
var init_status = __esm({
  "src/status.ts"() {
    "use strict";
    import_picocolors5 = __toESM(require_picocolors(), 1);
    init_config();
    init_projects();
  }
});

// src/update.ts
var update_exports = {};
__export(update_exports, {
  runUpdate: () => runUpdate
});
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname as dirname2, resolve as resolve3, join as join3 } from "node:path";
import { fileURLToPath } from "node:url";
function run(cmd2, args, cwd) {
  const r2 = spawnSync(cmd2, args, { cwd, stdio: "inherit" });
  return r2.status === 0;
}
async function runUpdate() {
  const bundle = fileURLToPath(import.meta.url);
  const repo = resolve3(dirname2(bundle), "..", "..");
  if (!existsSync(join3(repo, ".git"))) {
    console.error(import_picocolors6.default.red(`Can't find the ClaudeLens git clone at ${repo}.`));
    console.error(
      "Update from your clone (where you ran `claudelens install`), or reinstall the plugin in Claude Code."
    );
    process.exit(1);
  }
  console.log(import_picocolors6.default.dim(`Updating ClaudeLens in ${repo}
`));
  if (!run("git", ["-C", repo, "pull", "--ff-only"], repo)) {
    console.error(import_picocolors6.default.red("\ngit pull failed \u2014 resolve it in the repo, then retry."));
    process.exit(1);
  }
  console.log(import_picocolors6.default.dim("\nRebuilding bundle\u2026"));
  const built = run("pnpm", ["--filter", "@claudelens/cli", "build:plugin"], repo);
  if (!built) {
    console.log(import_picocolors6.default.yellow("(skipped rebuild \u2014 using the committed bundle from the pull)"));
  }
  console.log(import_picocolors6.default.green("\n\u2714 Updated."));
  console.log(import_picocolors6.default.dim("Takes effect on the next turn / command \u2014 no plugin reinstall needed."));
}
var import_picocolors6;
var init_update = __esm({
  "src/update.ts"() {
    "use strict";
    import_picocolors6 = __toESM(require_picocolors(), 1);
  }
});

// src/install.ts
var install_exports = {};
__export(install_exports, {
  runInstall: () => runInstall
});
import { chmod, mkdir, writeFile as writeFile2 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { join as join4 } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";
async function runInstall() {
  const bundle = fileURLToPath2(import.meta.url);
  const binDir = join4(homedir3(), ".local", "bin");
  const wrapper = join4(binDir, "claudelens");
  await mkdir(binDir, { recursive: true });
  await writeFile2(wrapper, `#!/bin/sh
exec node "${bundle}" "$@"
`, "utf8");
  await chmod(wrapper, 493);
  console.log(import_picocolors7.default.green(`
  Installed  ${wrapper}`));
  console.log(import_picocolors7.default.dim(`  runs       node ${bundle}
`));
  const onPath = (process.env.PATH ?? "").split(":").includes(binDir);
  if (onPath) {
    console.log(`  Try it:  ${import_picocolors7.default.cyan("claudelens setup")}
`);
  } else {
    console.log(import_picocolors7.default.yellow(`  \u26A0  ${binDir} is not on your PATH. Add it:`));
    console.log(`     ${import_picocolors7.default.cyan(`echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`)}
`);
  }
  console.log(import_picocolors7.default.dim(`  To update later: 'git pull' in the ClaudeLens repo \u2014 the command tracks this bundle.
`));
}
var import_picocolors7;
var init_install = __esm({
  "src/install.ts"() {
    "use strict";
    import_picocolors7 = __toESM(require_picocolors(), 1);
  }
});

// ../shared/src/types.ts
var init_types = __esm({
  "../shared/src/types.ts"() {
    "use strict";
  }
});

// ../shared/src/pricing.ts
function priceFor(model) {
  if (!model) return DEFAULT;
  const m2 = model.toLowerCase();
  for (const [key, price] of TABLE) if (m2.includes(key)) return price;
  return DEFAULT;
}
function costForUsage(model, usage) {
  const p = priceFor(model);
  const inTok = usage.input_tokens ?? 0;
  const outTok = usage.output_tokens ?? 0;
  const cWrite = usage.cache_creation_input_tokens ?? 0;
  const cRead = usage.cache_read_input_tokens ?? 0;
  return (inTok * p.input + outTok * p.output + cWrite * p.cacheWrite + cRead * p.cacheRead) / 1e6;
}
var TABLE, DEFAULT;
var init_pricing = __esm({
  "../shared/src/pricing.ts"() {
    "use strict";
    TABLE = [
      ["opus", { input: 15, output: 75, cacheWrite: 18.75, cacheRead: 1.5 }],
      ["sonnet", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }],
      ["haiku", { input: 0.8, output: 4, cacheWrite: 1, cacheRead: 0.08 }],
      ["fable", { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 }]
    ];
    DEFAULT = { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 };
  }
});

// ../shared/src/redact.ts
function redactText(input) {
  let text = input;
  const hits = {};
  for (const rule of RULES) {
    text = text.replace(rule.re, (...args) => {
      hits[rule.name] = (hits[rule.name] ?? 0) + 1;
      if (rule.name === "assignment") {
        const [, key, sep3] = args;
        return `${key}${sep3}\xABREDACTED\xBB`;
      }
      if (rule.name === "conn-uri") {
        const [, scheme, user] = args;
        return `${scheme}${user}:\xABREDACTED\xBB@`;
      }
      return "\xABREDACTED\xBB";
    });
  }
  return { text, hits };
}
function mergeHits(into, from) {
  for (const [k2, v2] of Object.entries(from)) into[k2] = (into[k2] ?? 0) + v2;
}
function redactDeep(value) {
  const hits = {};
  const walk = (v2) => {
    if (typeof v2 === "string") {
      const r2 = redactText(v2);
      mergeHits(hits, r2.hits);
      return r2.text;
    }
    if (Array.isArray(v2)) return v2.map(walk);
    if (v2 && typeof v2 === "object") {
      const out = {};
      for (const [k2, val] of Object.entries(v2)) out[k2] = walk(val);
      return out;
    }
    return v2;
  };
  return { value: walk(value), hits };
}
var RULES;
var init_redact = __esm({
  "../shared/src/redact.ts"() {
    "use strict";
    RULES = [
      { name: "anthropic-key", re: /sk-ant-[a-zA-Z0-9_-]{20,}/g },
      { name: "openai-key", re: /sk-(?:proj-)?[a-zA-Z0-9]{20,}/g },
      { name: "aws-access-key", re: /AKIA[0-9A-Z]{16}/g },
      { name: "github-token", re: /gh[pousr]_[a-zA-Z0-9]{20,}/g },
      { name: "slack-token", re: /xox[baprs]-[a-zA-Z0-9-]{10,}/g },
      { name: "google-key", re: /AIza[0-9A-Za-z_-]{35}/g },
      { name: "private-key", re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g },
      { name: "jwt", re: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g },
      { name: "bearer", re: /[Bb]earer\s+[a-zA-Z0-9._-]{20,}/g },
      // key=value / key: value style assignments to sensitive names
      { name: "assignment", re: /\b([A-Z0-9_]*(?:SECRET|PASSWORD|PASSWD|TOKEN|API_?KEY|PRIVATE_?KEY|ACCESS_?KEY)[A-Z0-9_]*)\b(\s*[:=]\s*)(["']?)([^\s"']{6,})\3/gi },
      // connection strings with inline credentials
      { name: "conn-uri", re: /\b([a-z][a-z0-9+.-]*:\/\/)([^:@\s/]+):([^@\s/]+)@/gi }
    ];
  }
});

// ../shared/src/parser.ts
function asBlocks(content) {
  if (!content) return [];
  if (typeof content === "string") return [{ type: "text", text: content }];
  return content;
}
function toolDetail(name, input) {
  if (!input) return void 0;
  if (name === "Skill") return input.skill ?? input.command;
  if (name === "Task" || name === "Agent")
    return input.subagent_type ?? input.description;
  return void 0;
}
function cleanUserText(text) {
  return text.replace(INJECTED_BLOCK, "").replace(CAVEAT, "").replace(INJECTED_TAG, "").trim();
}
function basename(p) {
  if (!p) return void 0;
  const parts = p.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || void 0;
}
function parseTranscript(jsonl) {
  const entries = [];
  for (const line of jsonl.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      entries.push(JSON.parse(t));
    } catch {
    }
  }
  const turns = [];
  const toolUsage = {};
  const skills = /* @__PURE__ */ new Set();
  const subagents = /* @__PURE__ */ new Set();
  const models = /* @__PURE__ */ new Set();
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  let estimatedCostUsd = 0;
  let sessionId = "";
  let cwd;
  let gitBranch;
  let version;
  let title = "";
  let firstUserPrompt;
  const timestamps = [];
  for (const e2 of entries) {
    if (e2.sessionId && !sessionId) sessionId = e2.sessionId;
    if (e2.cwd && !cwd) cwd = e2.cwd;
    if (e2.gitBranch && !gitBranch) gitBranch = e2.gitBranch;
    if (e2.version && !version) version = e2.version;
    if (e2.type === "ai-title" && e2.aiTitle) title = e2.aiTitle;
    if (e2.type !== "user" && e2.type !== "assistant") continue;
    const msg = e2.message;
    if (!msg) continue;
    const blocks = asBlocks(msg.content);
    const model = msg.model ?? e2.model;
    if (model) models.add(model);
    if (e2.timestamp) timestamps.push(e2.timestamp);
    if (e2.type === "assistant" && msg.usage) {
      const u = msg.usage;
      inputTokens += u.input_tokens ?? 0;
      outputTokens += u.output_tokens ?? 0;
      cacheReadTokens += u.cache_read_input_tokens ?? 0;
      cacheCreationTokens += u.cache_creation_input_tokens ?? 0;
      estimatedCostUsd += costForUsage(model, u);
    }
    const textParts = [];
    const thinkingParts = [];
    const toolCalls = [];
    for (const b3 of blocks) {
      if (b3.type === "text" && b3.text) textParts.push(b3.text);
      else if (b3.type === "thinking" && b3.thinking) thinkingParts.push(b3.thinking);
      else if (b3.type === "tool_use" && b3.name) {
        toolUsage[b3.name] = (toolUsage[b3.name] ?? 0) + 1;
        const detail = toolDetail(b3.name, b3.input);
        if (b3.name === "Skill" && detail) skills.add(detail);
        if ((b3.name === "Task" || b3.name === "Agent") && detail) subagents.add(detail);
        toolCalls.push({ name: b3.name, detail });
      }
    }
    const rawText = textParts.join("\n\n").trim();
    const text = e2.type === "user" ? cleanUserText(rawText) : rawText;
    if (e2.type === "user" && !firstUserPrompt && text) firstUserPrompt = text;
    if (!text && !thinkingParts.length && !toolCalls.length) continue;
    turns.push({
      role: e2.type,
      timestamp: e2.timestamp,
      model,
      text,
      thinking: thinkingParts.length ? thinkingParts.join("\n\n") : void 0,
      toolCalls,
      isSidechain: e2.isSidechain
    });
  }
  timestamps.sort();
  const startedAt = timestamps[0];
  const endedAt = timestamps[timestamps.length - 1];
  const durationMs = startedAt && endedAt ? new Date(endedAt).getTime() - new Date(startedAt).getTime() : void 0;
  const userTurns = turns.filter((t) => t.role === "user").length;
  const assistantTurns = turns.filter((t) => t.role === "assistant").length;
  const stats = {
    turns: turns.length,
    userTurns,
    assistantTurns,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheCreationTokens,
    estimatedCostUsd: Math.round(estimatedCostUsd * 1e4) / 1e4,
    models: [...models],
    toolUsage,
    skills: [...skills],
    subagents: [...subagents],
    durationMs,
    firstUserPrompt: firstUserPrompt?.slice(0, 500)
  };
  if (!title) title = firstUserPrompt?.slice(0, 80) || `Session ${sessionId.slice(0, 8)}`;
  return {
    sessionId: sessionId || "unknown",
    title,
    cwd,
    project: basename(cwd),
    gitBranch,
    version,
    startedAt,
    endedAt,
    stats,
    turns
  };
}
var INJECTED_TAG_NAME, INJECTED_BLOCK, INJECTED_TAG, CAVEAT;
var init_parser = __esm({
  "../shared/src/parser.ts"() {
    "use strict";
    init_pricing();
    INJECTED_TAG_NAME = "(?:system-reminder|user-prompt-submit-hook|(?:local-)?command-[a-z-]+|bash-[a-z-]+)";
    INJECTED_BLOCK = new RegExp(`<(${INJECTED_TAG_NAME})\\b[^>]*>[\\s\\S]*?</\\1>`, "g");
    INJECTED_TAG = new RegExp(`</?${INJECTED_TAG_NAME}\\b[^>]*>`, "g");
    CAVEAT = /Caveat:\s*The messages below were generated by the user while running local commands\.[\s\S]*?(?:\n\n|$)/g;
  }
});

// ../shared/src/index.ts
var init_src = __esm({
  "../shared/src/index.ts"() {
    "use strict";
    init_types();
    init_pricing();
    init_redact();
    init_parser();
  }
});

// src/index.ts
var index_exports = {};
__export(index_exports, {
  runPublish: () => runPublish
});
import { readdir as readdir2, readFile as readFile3, stat } from "node:fs/promises";
import { homedir as homedir4, userInfo as userInfo2 } from "node:os";
import { join as join5 } from "node:path";
async function collectSessions() {
  let projectDirs;
  try {
    projectDirs = await readdir2(PROJECTS_DIR2);
  } catch {
    return [];
  }
  const out = [];
  for (const dir of projectDirs) {
    const full = join5(PROJECTS_DIR2, dir);
    let files;
    try {
      files = await readdir2(full);
    } catch {
      continue;
    }
    for (const f2 of files) {
      if (!f2.endsWith(".jsonl")) continue;
      const path = join5(full, f2);
      try {
        const st = await stat(path);
        const raw = await readFile3(path, "utf8");
        const session = parseTranscript(raw);
        if (session.stats.turns < 2) continue;
        out.push({ file: path, mtime: st.mtimeMs, session });
      } catch {
      }
    }
  }
  return out.sort((a3, b3) => b3.mtime - a3.mtime);
}
function fmtCost(n) {
  return n >= 0.01 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;
}
async function runPublish() {
  console.clear();
  oe(import_picocolors8.default.bgCyan(import_picocolors8.default.black(" ClaudeLens ")) + import_picocolors8.default.dim(" share a session so your team can learn"));
  const candidates = await collectSessions();
  if (!candidates.length) {
    ue(`No Claude Code sessions found in ${PROJECTS_DIR2}`);
    process.exit(1);
  }
  const picked = await ie({
    message: `Pick a session to share  ${import_picocolors8.default.dim("(server: " + SERVER + ")")}`,
    options: candidates.slice(0, 40).map((c2, i) => {
      const s2 = c2.session;
      const when = new Date(c2.mtime).toLocaleString();
      return {
        value: i,
        label: `${s2.title}`,
        hint: `${s2.project ?? "\u2014"} \xB7 ${s2.stats.turns} turns \xB7 ${fmtCost(
          s2.stats.estimatedCostUsd
        )} \xB7 ${when}`
      };
    })
  });
  if (lD(picked)) return ue("Cancelled.");
  const chosen = candidates[picked];
  const s = chosen.session;
  const { value: redactedTurns, hits } = redactDeep(s.turns);
  s.turns = redactedTurns;
  const redactedFirst = redactDeep(s.stats.firstUserPrompt ?? "");
  s.stats.firstUserPrompt = redactedFirst.value;
  for (const [k2, v2] of Object.entries(redactedFirst.hits)) hits[k2] = (hits[k2] ?? 0) + v2;
  const hitEntries = Object.entries(hits);
  le(
    [
      `${import_picocolors8.default.bold("Title")}    ${s.title}`,
      `${import_picocolors8.default.bold("Project")}  ${s.project ?? "\u2014"}  (branch: ${s.gitBranch ?? "\u2014"})`,
      `${import_picocolors8.default.bold("Turns")}    ${s.stats.turns}  \xB7  models: ${s.stats.models.join(", ") || "\u2014"}`,
      `${import_picocolors8.default.bold("Tokens")}   ${s.stats.totalTokens.toLocaleString()}  (~${fmtCost(
        s.stats.estimatedCostUsd
      )})`,
      `${import_picocolors8.default.bold("Skills")}   ${s.stats.skills.join(", ") || "\u2014"}`,
      `${import_picocolors8.default.bold("Agents")}   ${s.stats.subagents.join(", ") || "\u2014"}`,
      hitEntries.length ? import_picocolors8.default.yellow(
        `Redacted secrets: ${hitEntries.map(([k2, v2]) => `${k2}\xD7${v2}`).join(", ")}`
      ) : import_picocolors8.default.green("No secrets detected by the redactor.")
    ].join("\n"),
    "Preview"
  );
  const cfg = await loadConfig();
  const author = await te({
    message: "Your name (shown as the author)",
    initialValue: cfg?.name ?? userInfo2().username,
    validate: (v2) => v2.trim() ? void 0 : "required"
  });
  if (lD(author)) return ue("Cancelled.");
  const note = await te({
    message: "Why is this worth sharing? (one line \u2014 helps others learn)",
    placeholder: "e.g. clean use of the Explore agent to map an unfamiliar codebase"
  });
  if (lD(note)) return ue("Cancelled.");
  const tagsRaw = await te({
    message: "Tags (comma-separated, optional)",
    placeholder: "refactor, debugging, rag"
  });
  if (lD(tagsRaw)) return ue("Cancelled.");
  const confirm = await se({
    message: `Upload this session to ${SERVER}?`
  });
  if (lD(confirm) || !confirm) return ue("Not uploaded.");
  const payload = {
    session: s,
    author: author.trim(),
    note: note?.trim() || void 0,
    tags: tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : []
  };
  const spin = de();
  spin.start("Uploading\u2026");
  try {
    const resp = await fetch(`${SERVER}/api/sessions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}
      },
      body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error(`server responded ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    spin.stop("Uploaded.");
    $e(import_picocolors8.default.green(`\u2714 Shared! ${SERVER.replace(/:\d+$/, ":5173")}/session/${data.id}`));
  } catch (err) {
    spin.stop("Upload failed.");
    ue(String(err));
    process.exit(1);
  }
}
var import_picocolors8, PROJECTS_DIR2, SERVER, TOKEN;
var init_index = __esm({
  "src/index.ts"() {
    "use strict";
    init_dist2();
    import_picocolors8 = __toESM(require_picocolors(), 1);
    init_src();
    init_config();
    PROJECTS_DIR2 = join5(homedir4(), ".claude", "projects");
    SERVER = process.env.CLAUDELENS_SERVER ?? "http://localhost:4000";
    TOKEN = process.env.CLAUDELENS_TOKEN ?? "";
  }
});

// src/sync.ts
var sync_exports = {};
__export(sync_exports, {
  runSync: () => runSync
});
import { readFile as readFile4 } from "node:fs/promises";
async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}
async function readSettledSession(path) {
  let session = parseTranscript(await readFile4(path, "utf8"));
  for (let i = 0; i < 10; i++) {
    const last = session.turns[session.turns.length - 1];
    if (last && last.role === "assistant") break;
    await sleep(250);
    session = parseTranscript(await readFile4(path, "utf8"));
  }
  return session;
}
async function runSync() {
  const cfg = await loadConfig();
  if (!cfg) return;
  const raw = await readStdin();
  let hook = {};
  try {
    hook = JSON.parse(raw);
  } catch {
    return;
  }
  const { transcript_path, cwd, session_id } = hook;
  if (!transcript_path || !cwd) return;
  if (!await shouldTrack(cwd, session_id ?? "", cfg)) return;
  const session = await readSettledSession(transcript_path);
  if (!session.sessionId || session.stats.turns < 1) return;
  if (cfg.redact) {
    session.turns = redactDeep(session.turns).value;
    if (session.stats.firstUserPrompt) {
      session.stats.firstUserPrompt = redactDeep(session.stats.firstUserPrompt).value;
    }
  }
  const payload = { session, author: cfg.name };
  await fetch(`${cfg.server}/api/sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}
    },
    body: JSON.stringify(payload)
  });
}
var sleep;
var init_sync = __esm({
  "src/sync.ts"() {
    "use strict";
    init_src();
    init_config();
    sleep = (ms) => new Promise((r2) => setTimeout(r2, ms));
  }
});

// src/cli.ts
var cmd = process.argv[2];
function printHelp() {
  console.log(`ClaudeLens \u2014 a lens into how your team works with Claude Code

Usage: claudelens <command>

  setup       Configure your name, server URL and token
  projects    Choose which projects are tracked (interactive checklist)
  status      Show current config and tracked projects
  update      Pull the latest code + rebuild \u2014 no plugin reinstall
  install     Add the 'claudelens' command to your PATH (~/.local/bin)
  publish     Manually pick and publish one past session
  sync        (internal) invoked by the Stop hook; reads a hook payload on stdin

Run these in your own terminal \u2014 interactive prompts don't work inside Claude Code.`);
}
async function main() {
  switch (cmd) {
    case "setup":
      return (await Promise.resolve().then(() => (init_setup(), setup_exports))).runSetup();
    case "projects":
      return (await Promise.resolve().then(() => (init_projects(), projects_exports))).runProjects();
    case "status":
      return (await Promise.resolve().then(() => (init_status(), status_exports))).runStatus();
    case "update":
      return (await Promise.resolve().then(() => (init_update(), update_exports))).runUpdate();
    case "install":
      return (await Promise.resolve().then(() => (init_install(), install_exports))).runInstall();
    case "publish":
      return (await Promise.resolve().then(() => (init_index(), index_exports))).runPublish();
    case "sync":
      return (await Promise.resolve().then(() => (init_sync(), sync_exports))).runSync();
    case "-h":
    case "--help":
    case "help":
    case void 0:
      return printHelp();
    default:
      console.error(`Unknown command: ${cmd}
`);
      printHelp();
      process.exit(1);
  }
}
main().catch((err) => {
  if (cmd === "sync") {
    if (process.env.CLAUDELENS_DEBUG) console.error("[claudelens sync]", err);
    return;
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
