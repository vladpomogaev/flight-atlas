#!/usr/bin/env node
// Flight Atlas builder: flights.json -> self-contained interactive 3D atlas (one HTML file).
// Usage: node build.mjs <flights.json> [out.html]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { feature, mesh } from "topojson-client";
import * as d3 from "d3-geo";
import countries from "i18n-iso-countries";

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.join(HERE, "..", "assets");

const [, , inFile, outArg] = process.argv;
if (!inFile) { console.error("Usage: node build.mjs <flights.json> [out.html]"); process.exit(1); }
const cfg = JSON.parse(fs.readFileSync(inFile, "utf8"));
const lang = cfg.lang === "ru" ? "ru" : "en";
countries.registerLocale(require(`i18n-iso-countries/langs/${lang}.json`));
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

const AIR = JSON.parse(fs.readFileSync(path.join(ASSETS, "airports.json"), "utf8"));
const t110 = require("world-atlas/countries-110m.json");
const t50 = require("world-atlas/countries-50m.json");

/* ---------- flights ---------- */
const STATUS = { flown: "flown", done: "flown", upcoming: "up", up: "up", future: "up", refunded: "rf", cancelled: "rf", canceled: "rf", rf: "rf" };
const bad = [];
const flights = (cfg.flights || []).map((f, i) => {
  const from = String(f.from || "").toUpperCase().trim(), to = String(f.to || "").toUpperCase().trim();
  if (!AIR[from]) bad.push(`#${i + 1} unknown airport "${from}"`);
  if (!AIR[to]) bad.push(`#${i + 1} unknown airport "${to}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || "")) bad.push(`#${i + 1} date must be YYYY-MM-DD`);
  const st = STATUS[String(f.status || "flown").toLowerCase()];
  if (!st) bad.push(`#${i + 1} unknown status "${f.status}"`);
  return { date: f.date, fn: (f.flight || "").replace(/\s+/g, ""), al: f.airline || "", from, to, st, min: f.minutes ? Math.round(f.minutes) : 0, est: !!f.estimated || !f.minutes };
});
if (bad.length) { console.error("Fix these entries:\n  " + bad.join("\n  ")); process.exit(2); }
if (!flights.length) { console.error("No flights."); process.exit(2); }
flights.sort((a, b) => a.date.localeCompare(b.date));

/* ---------- airports -> cities (metro grouping by municipality) ---------- */
const norm = m => String(m || "").replace(/\(.*?\)/g, "").split(/[\/,]/)[0].trim();
const used = [...new Set(flights.flatMap(f => [f.from, f.to]))];
const cityKeyOf = {}, groups = {};
for (const code of used) {
  const [, muni, cc] = AIR[code];
  const gk = (cfg.merge && cfg.merge[code]) || `${norm(muni) || code}|${cc}`;
  (groups[gk] = groups[gk] || []).push(code);
}
const CITIES = {};
for (const [gk, codes] of Object.entries(groups)) {
  codes.sort();
  const key = codes[0];
  const lat = codes.reduce((s, c) => s + AIR[c][3], 0) / codes.length;
  const lon = codes.reduce((s, c) => s + AIR[c][4], 0) / codes.length;
  const cc = AIR[codes[0]][2];
  const names = cfg.cityNames || {};
  const n = codes.map(c => names[c]).find(Boolean) || names[gk.split("|")[0]] || gk.split("|")[0];
  CITIES[key] = { n, cc, lat: +lat.toFixed(3), lon: +lon.toFixed(3) };
  codes.forEach(c => (cityKeyOf[c] = key));
}
const homeCode = String(cfg.home || flights[0].from).toUpperCase();
if (!cityKeyOf[homeCode]) { console.error(`home "${homeCode}" must be one of the airports in your flights`); process.exit(2); }

/* ---------- countries ---------- */
const ccSet = new Set(Object.values(CITIES).map(c => c.cc));
const ccName = {};
for (const cc of ccSet) ccName[cc] = (cfg.countryNames && cfg.countryNames[cc]) || countries.getName(cc, lang, { select: "alias" }) || countries.getName(cc, "en") || cc;
const a2ofNum = id => countries.numericToAlpha2(String(id).padStart(3, "0"));

const q = v => Math.round(v * 100);
function rings(geom, minPts = 0) {
  const out = []; const polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
  for (const p of polys) for (const r of p) { if (r.length < minPts) continue; out.push(r.flatMap(([x, y]) => [q(x), q(y)])); }
  return out;
}
function mainPart(f) {
  const g = f.geometry; if (g.type === "Polygon") return { type: "Feature", geometry: g };
  let best = null, a = -1;
  for (const p of g.coordinates) { const ar = d3.geoArea({ type: "Polygon", coordinates: p }); if (ar > a) { a = ar; best = p; } }
  return { type: "Feature", geometry: { type: "Polygon", coordinates: best } };
}
const c110 = feature(t110, t110.objects.countries).features;
const c50 = feature(t50, t50.objects.countries).features;

const V = {};
for (const f of c50) {
  const cc = a2ofNum(f.id); if (!cc || !ccSet.has(cc)) continue;
  const main = mainPart(f); const cen = d3.geoCentroid(main);
  const area = d3.geoArea(f);
  const big = area > 0.12;
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const near = polys.filter(p => d3.geoDistance(d3.geoCentroid({ type: "Polygon", coordinates: p }), cen) < 0.75 && (p[0].length > 4));
  const sil = { type: "Feature", geometry: { type: "MultiPolygon", coordinates: near.length ? near : [main.geometry.coordinates] } };
  const proj = d3.geoAzimuthalEqualArea().rotate([-cen[0], -cen[1]]).fitExtent([[4, 4], [156, 96]], sil);
  const svg = d3.geoPath(proj)(sil).replace(/(\d+\.\d)\d+/g, "$1");
  let rmax = 0; for (const p of near.length ? near : [main.geometry.coordinates]) for (const pt of p[0]) rmax = Math.max(rmax, d3.geoDistance(pt, cen));
  V[cc] = { rings: rings(f.geometry, big ? 12 : 0), svg, cen: [+cen[1].toFixed(2), +cen[0].toFixed(2)], z: +Math.min(4.2, Math.max(1.55, 1.35 + rmax * 2.4)).toFixed(2), big };
}

const LANDP = c110.map(f => rings(f.geometry));
const m = mesh(t110, t110.objects.countries);
const BORD = m.coordinates.map(l => l.flatMap(([x, y]) => [q(x), q(y)]));

const LBL_FIX = { RU: [61, 95], US: [39, -98], CA: [58, -100], FR: [46.5, 2.5], NO: [62, 9], CL: [-30, -71], NZ: [-42, 172] };
const labels = [];
for (const f of c110) {
  const cc = a2ofNum(f.id); if (!cc) continue;
  const name = (ccName[cc]) || countries.getName(cc, lang, { select: "alias" }); if (!name) continue;
  const main = mainPart(f); let [lon, lat] = d3.geoCentroid(main);
  if (LBL_FIX[cc]) [lat, lon] = LBL_FIX[cc];
  const area = Math.round(d3.geoArea(main) * 1000);
  if (area < 2 && !ccSet.has(cc)) continue;
  labels.push([name, +lat.toFixed(1), +lon.toFixed(1), ccSet.has(cc) ? cc : "", area]);
}

/* ---------- reference world cities ---------- */
const REF = [["London","Лондон",51.5,-.13],["Paris","Париж",48.86,2.35],["Berlin","Берлин",52.52,13.4],["Rome","Рим",41.9,12.5],["Madrid","Мадрид",40.4,-3.7],["Cairo","Каир",30.04,31.24],["Riyadh","Эр-Рияд",24.7,46.7],["Tehran","Тегеран",35.7,51.4],["Delhi","Дели",28.6,77.2],["Mumbai","Мумбаи",19.07,72.88],["Beijing","Пекин",39.9,116.4],["Shanghai","Шанхай",31.23,121.47],["Tokyo","Токио",35.68,139.69],["Seoul","Сеул",37.57,126.98],["Bangkok","Бангкок",13.75,100.5],["Singapore","Сингапур",1.35,103.82],["Hong Kong","Гонконг",22.32,114.17],["Jakarta","Джакарта",-6.2,106.85],["Istanbul","Стамбул",41.01,28.98],["Moscow","Москва",55.75,37.62],["Novosibirsk","Новосибирск",55.03,82.92],["Almaty","Алматы",43.24,76.95],["Dubai","Дубай",25.2,55.27],["New York","Нью-Йорк",40.71,-74],["Los Angeles","Лос-Анджелес",34.05,-118.24],["Chicago","Чикаго",41.88,-87.63],["Toronto","Торонто",43.65,-79.38],["Mexico City","Мехико",19.43,-99.13],["São Paulo","Сан-Паулу",-23.55,-46.63],["Buenos Aires","Буэнос-Айрес",-34.6,-58.38],["Lima","Лима",-12.05,-77.04],["Bogotá","Богота",4.71,-74.07],["Lagos","Лагос",6.52,3.38],["Nairobi","Найроби",-1.29,36.82],["Johannesburg","Йоханнесбург",-26.2,28.05],["Sydney","Сидней",-33.87,151.2],["Melbourne","Мельбурн",-37.81,144.96],["Auckland","Окленд",-36.85,174.76],["Helsinki","Хельсинки",60.17,24.94],["Warsaw","Варшава",52.23,21.01],["Athens","Афины",37.98,23.73],["Lisbon","Лиссабон",38.72,-9.14],["Kyiv","Киев",50.45,30.52],["Tashkent","Ташкент",41.3,69.24],["Ulaanbaatar","Улан-Батор",47.89,106.9],["Vladivostok","Владивосток",43.12,131.89],["Honolulu","Гонолулу",21.31,-157.86],["Reykjavik","Рейкьявик",64.15,-21.94]];
const gcKm = (a, b) => d3.geoDistance([a[1], a[0]], [b[1], b[0]]) * 6371;
const ref = REF.filter(r => !Object.values(CITIES).some(c => gcKm([r[2], r[3]], [c.lat, c.lon]) < 120)).map(r => [lang === "ru" ? r[1] : r[0], r[2], r[3]]);

/* ---------- assemble ---------- */
const airport = {}, apc = {};
for (const code of used) { airport[code] = cityKeyOf[code]; apc[code] = [AIR[code][3], AIR[code][4]]; }
const DATA = {
  lang, owner: cfg.owner || "", title: cfg.title || "", t1: cfg.t1 || "", t2: cfg.t2 || "",
  updated: cfg.updated || new Date().toISOString().slice(0, 10), home: cityKeyOf[homeCode], homeGen: cfg.homeGenitive || "",
  cities: CITIES, ccName, airport, apc,
  flights: flights.map(f => [f.date, f.fn, f.al, f.from, f.to, f.st, f.min, f.est ? 1 : 0]),
  geo: { LANDP, BORD, V }, labels, ref
};
const tpl = fs.readFileSync(path.join(ASSETS, "template.html"), "utf8");
const title = (cfg.title || (lang === "ru" ? "Атлас неба" : "Atlas of the Sky")).replace(/[<>&]/g, "");
const html = tpl.replace("__TITLE__", title).replace("__DATA__", () => JSON.stringify(DATA).replace(/<\//g, "<\\/"));
const out = outArg || path.join(path.dirname(inFile), "flight-atlas.html");
fs.writeFileSync(out, html);
const flown = flights.filter(f => f.st === "flown");
console.log(`OK ${out} (${(html.length / 1024).toFixed(0)} KB) · ${flown.length} flown, ${flights.length - flown.length} other · ${Object.keys(CITIES).length} cities · ${ccSet.size} countries`);
