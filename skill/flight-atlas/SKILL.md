---
name: flight-atlas
description: Builds a personal 3D "Atlas of the Sky" from the user's flight history in their email — finds every booking, boarding pass and e-ticket, extracts flight numbers, routes and durations, and renders an interactive globe with replay, records and a flight log. Use when the user asks to find their flights, map their travel, count hours or kilometres flown, or "make an atlas / globe / map of my flights".
---

# Flight Atlas

Turn a person's inbox into an interactive 3D atlas of every flight they have taken: a glowing globe with routes (thicker = flown more often), visited countries highlighted, a "fly the journey" replay, a time scrubber, a month-by-month calendar, records, country silhouettes and a departure-board log.

The work has three stages. Do them in order; do not open the template before you have the data.

1. **Harvest** flights from the user's email (and calendar, if available).
2. **Confirm** gaps and ambiguities with the user, briefly.
3. **Build** the page with `scripts/build.mjs` and publish it.

---

## 1. Harvest

You need a mail connector (Gmail, Outlook…). If none is connected, ask the user to connect one, or to forward/attach their booking PDFs. Never ask for a password.

Search in several passes. One query never finds everything: airlines use different domains over time, receipts land in Promotions, and tour operators hide flights inside vouchers. See `references/search-playbook.md` for the full list of queries and sender domains. The short version:

- **Pass A, keywords** (no date limit): boarding pass, e-ticket, itinerary, booking confirmation, маршрутная квитанция, посадочный талон, номер бронирования, PNR, онлайн-регистрация, check-in.
- **Pass B, senders**: airlines, OTAs (Aviasales, Trip.com, Kiwi, Booking, Expedia, OneTwoTrip, Tutu, Kupibilet), fiscal-receipt services (taxcom, 1-ofd, ofd.ru) — Russian airlines always send a cash receipt that names the ticket number even when the itinerary is only a PDF.
- **Pass C, old domains**: airlines rename domains (pobeda.aero → flypobeda.ru, etc.). Search by brand name, not only by the current domain.
- **Pass D, include Promotions, Spam and Trash** for older years.
- **Pass E, gap hunt**: for every month where the person was clearly somewhere else (hotel, barber, taxi, aeroexpress, event tickets in another city), search that window without filters and read message by message.

For each candidate message, read the body. Extract per **flight segment** (not per booking):

| field | where it usually is |
|---|---|
| date (local departure date) | itinerary table, check-in reminder, boarding pass subject |
| flight number | "Рейс/Flight", "DP 6521", "SU 1762" — remove spaces |
| from / to IATA | itinerary; map city names to IATA if only cities are given |
| airline | sender or itinerary |
| minutes in the air | arrival − departure, converted to the same time zone; if only a duration is printed, use it |
| status | flown / upcoming / refunded (refund emails, "места аннулированы", "возврат") |

Rules:
- A round trip is two segments; a connection is two segments.
- Deduplicate: the same flight often appears in a booking email, a 48-hour reminder, a check-in email and a boarding pass. Key = date + flight number.
- When the body has no route (only a PDF attachment), try reading the attachment. If the connector cannot open attachments, list those bookings and ask the user to open the PDF and tell you the flight, or to attach it.
- Tour packages (Anex, Coral, Pegas, TUI…) put flights in a voucher PDF; ask the user for it when you see a tour booking without flights.
- If minutes are unknown, leave them out and set `"estimated": true` — the builder estimates from distance. Mark durations you inferred as estimated.
- Do not invent flights. If you only see signs of a trip (price alerts, a haircut in another city), tell the user and ask, never add it silently.

## 2. Confirm

Show the user a compact table of what you found (date, flight, route, status), then ask in one message:
- which city is **home** (used for "farthest from home" and the default view);
- anything missing they remember (give the date windows you suspect);
- whether to include **upcoming** flights. If they plan to publish the page, recommend leaving upcoming trips out: a public page with future travel dates tells strangers when they are away.

## 3. Build

Write `flights.json` (schema below), then run:

```bash
# If this skill folder has no scripts/ (e.g. installed as a single SKILL.md), fetch them:
#   git clone --depth 1 https://github.com/vladpomogaev/flight-atlas /tmp/flight-atlas && SK=/tmp/flight-atlas/skill/flight-atlas
SK=${SK:-<this skill folder>}
cd "$SK/scripts" && npm install --silent   # first time only
node build.mjs /path/to/flights.json /path/to/flight-atlas.html
```

The builder resolves airports (5,300+ IATA codes bundled), groups airports of the same city (SVO/VKO/DME → Moscow), fetches nothing at runtime, embeds country shapes and labels in the chosen language, and prints a one-line summary. If it reports an unknown airport, fix the code and rerun.

```jsonc
{
  "owner": "Jane Doe",
  "lang": "en",                 // "en" or "ru"; picks UI language and country names
  "home": "AMS",                // any IATA code from the flights
  "homeGenitive": "",           // ru only, e.g. "Омска" for "по прямой от Омска"
  "title": "",                  // optional, defaults to "Atlas of the Sky" / "Атлас неба"
  "cityNames": {"SVO": "Москва"}, // optional, translate city names (key = any airport of that city)
  "countryNames": {"AE": "ОАЭ"},  // optional overrides
  "merge": {"SHJ": "Dubai|AE"},   // optional, force airports into one city
  "flights": [
    {"date":"2024-07-14","flight":"DP6522","airline":"Победа","from":"OMS","to":"SVO","minutes":215},
    {"date":"2026-03-04","flight":"UT715","airline":"Utair","from":"VKO","to":"DWC","minutes":320,"status":"refunded"},
    {"date":"2026-11-17","flight":"C6464","airline":"Centrum Air","from":"OMS","to":"TAS","status":"upcoming"}
  ]
}
```

`status` defaults to `flown`. `lang` is the language the page opens in; the page also has an EN/RU switch. For a Russian-speaking user set `"lang":"ru"`. Names can be flat (they apply to `lang`) or per language, for the switch: `"cityNames": {"ru": {...}, "en": {...}}`, and the same for `countryNames`, `airlineNames` (e.g. `{"en": {"Победа": "Pobeda"}}`) and `owner` (`{"ru": "Иван Петров", "en": "Ivan Petrov"}`). Russian names for ~100 common cities are built in; give Russian `cityNames` for any other city.

### Publish

- In claude.ai: publish the HTML with the Artifact tool (it is fully self-contained; three.js loads from cdnjs). Tell the user they can share it from the page's Share menu.
- Elsewhere: it is a static file. GitHub Pages, Netlify Drop or any static host works.

Then tell the user in a few lines: totals (flights, km, hours, countries), anything you estimated, and what is still missing.

## Privacy

The page contains the user's travel history. Before publishing anything public, remind them once that it shows where they have been and when, and that upcoming trips reveal when they will be away. Never include passport numbers, dates of birth, booking codes or ticket numbers in `flights.json`; the template does not need them.

## Files

- `scripts/build.mjs` — the builder (Node 18+).
- `assets/template.html` — the page (three.js r128, no other runtime deps).
- `assets/airports.json` — IATA → name, city, country, lat, lon (OurAirports, public domain).
- `references/search-playbook.md` — queries and sender domains by region.
- `examples/` — a real Russian example and an English sample.
