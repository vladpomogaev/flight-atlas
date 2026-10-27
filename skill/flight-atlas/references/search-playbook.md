# Search playbook

Mail search is the slow part. These queries are written for Gmail syntax; translate them for other providers.

## Pass A — keywords, all time

```
(boarding pass OR "e-ticket" OR itinerary OR "booking confirmation" OR "flight confirmation" OR "your trip" OR PNR OR "booking reference")
(посадочный OR "маршрутная квитанция" OR "маршрут-квитанция" OR "электронный билет" OR авиабилет OR "номер бронирования" OR "код бронирования" OR "онлайн-регистрация" OR рейс)
subject:(flight OR рейс OR "check-in" OR регистрация OR билет OR booking OR бронирование)
```

Exclude obvious noise after the first look: `-subject:(price OR цена OR скидк OR распродаж OR sale)`.

## Pass B — senders

Airlines (current and legacy domains):

| Region | Domains / brand words |
|---|---|
| Russia | aeroflot, flypobeda, pobeda.aero, s7.ru, utair, uralairlines, azimuth, nordwindairlines, flyredwings, rossiya-airlines, smartavia, yakutia, nordstar, alrosa, iflyaero |
| CIS / Caucasus | azal.az, airastana, flyarystan, scat, uzairways, centrum-air, flyone, georgian-airways, belavia, fly.am |
| Middle East | emirates, flydubai, qatarairways, etihad, airarabia, saudia, elal, israir, arkia, oneclick / avtra (OneClick Airways) |
| Turkey / Europe | turkishairlines, thy, pegasus, ajet, sunexpress, wizzair, ryanair, easyjet, lufthansa, klm, airfrance, ba.com, iberia, vueling, tap, sas, finnair, lot, aegean |
| Americas | delta, united, aa.com, alaskaair, jetblue, southwest, aircanada, westjet, latam, avianca, copa |
| Asia / Pacific | singaporeair, cathaypacific, ana.co.jp, jal, koreanair, airasia, thaiairways, vietnamairlines, vietjet, qantas, airnewzealand, indigo, airindia |

Agencies and aggregators: aviasales, trip.com, ctrip, kiwi, booking.com, expedia, kayak, skyscanner, onetwotrip, tutu, kupibilet, ozon.travel, travel.yandex, biletix, superkassa, svyaznoy.travel, tinkoff/tbank travel.

Receipts that name ticket numbers (Russia): taxcom.ru, 1-ofd.ru, ofd.ru, platformaofd, kontur-ofd. Query: `from:(taxcom OR 1-ofd OR ofd) (авиа OR "авиакомпания" OR авиабилет)`.

Tour operators (flights live in vouchers): anextour, coral, pegast, tui, fstravel, biblio-globus, sunmar, "азбука туров".

## Pass C — brand names

Domains change. Search `Победа`, `Аэрофлот`, `Aeroflot`, `flydubai` as plain words too.

## Pass D — hidden folders

Add `in:anywhere` (or `includeTrash` in API connectors) and check `category:promotions` for check-in reminders, which airlines often send as marketing mail.

## Pass E — gap hunt

Signals that the user travelled even without a ticket email:
- Aeroexpress / airport train tickets (the flight is usually the same day)
- hotels, Airbnb, local barbers, gyms, event tickets, taxis in another city
- price-watch alerts for a route a few weeks before
- calendar events "Flight", "Перелёт", or events in another time zone

For each window, list every message in it (`after:YYYY/MM/DD before:YYYY/MM/DD`) and read the transactional ones.

## Extraction tips

- Itinerary tables often read `10СЕН26 2200` (Russian GDS format): day, Cyrillic month (ЯНВ ФЕВ МАР АПР МАЙ ИЮН ИЮЛ АВГ СЕН ОКТ НОЯ ДЕК), two-digit year, time.
- Check-in reminders ("открыта онлайн-регистрация", "check-in is open") arrive 24–48 h before departure and usually contain the full segment.
- AZAL, Centrum Air and similar IBE systems put each segment in its own table with "Номер рейса".
- Aeroflot codeshares print the marketing number (SU 6472) and "operated by" (FV 6472); keep the marketing number.
- Duration: compute arrival − departure in local times, then add the time-zone difference (destination UTC offset − origin UTC offset). Omsk is UTC+6, Moscow UTC+3, Dubai UTC+4, Tbilisi UTC+4, Baku UTC+4, Astana UTC+5, Tashkent UTC+5, Tel Aviv UTC+2/+3.
