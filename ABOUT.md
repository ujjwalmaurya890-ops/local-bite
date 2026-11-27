# About LocalBite

> **Discover. Order. Enjoy Local Food.**
> A location-first platform for the neighbourhood food businesses that big delivery apps ignore — starting in Jagatpura, Jaipur.

---

## 1. The problem

India's food delivery market is concentrated: platforms compete for the same few hundred chain outlets and high-volume kitchens in dense commercial zones. Meanwhile, the food people actually eat every day — the poha counter outside the campus gate, the aunty's tiffin service, the 40-year-old sweet shop, the kulhad chai stall — has:

- no digital menu, so you can't know the price or what's fresh today;
- no reliable discovery, so you find it by word of mouth or not at all;
- no way to take a pre-order, so there's always a queue at 9 a.m.;
- no way to sell a **subscription** (a weekly tiffin plan) even though that's exactly what students want to buy.

For the customer — a student, a hostel resident, a working professional new to the city — the result is that finding good, cheap, local food is a search problem with no map.

## 2. What LocalBite does

LocalBite is a two-sided, location-first web app.

**For the customer**

1. Allow location (or search a locality).
2. See what's genuinely nearby: verified LocalBite partners plus real food businesses from the OpenStreetMap directory, each clearly labelled with how much it's been verified.
3. Search by dish or shop name; filter by open-now, price, rating, or "has an orderable menu".
4. For verified partners: read the menu, add to cart, apply a vendor promo, choose pickup or delivery, place the order, follow its status.
5. Buy a **meal plan** — a 7-day morning poha-and-chai pass, a weekly two-meal tiffin — instead of ordering one meal at a time.
6. Leave a review, but only for an order you actually placed, and only once.

**For the vendor**

1. Register the shop (or claim an existing OSM listing).
2. Get reviewed by a LocalBite verifier.
3. Once verified: publish the menu, mark items sold out, set today's special, create offers and meal plans, and manage incoming orders through the preparation lifecycle.
4. Control what's public: owner name and phone number are opt-in.

**For the verifier (admin)**

1. Claim the admin passcode on first run (or supply it via environment).
2. Review pending applications and mark them verified or rejected with a reason.

**For anyone evaluating the product**

A **Demo Sandbox** with two clearly labelled `[DEMO RECORD]` vendors so the full menu → cart → checkout → tracking journey can be tested without a real partner nearby. Demo orders are simulated in the browser; they never enter the database and never appear as real businesses.

## 3. Design principles

| Principle | How it shows up in the product |
| --- | --- |
| **Never fabricate a real business** | Directory entries are labelled `unclaimed_directory`; demo data is prefixed `[DEMO RECORD]`, grey on the map, and excluded from verified lists. |
| **Verification is earned, never assumed** | Every new vendor is created `pending_verification`; only an admin can promote it, and only verified shops accept orders (enforced server-side). |
| **Distances and totals are computed, not trusted** | Distance is recalculated from coordinates; order prices and promo discounts are recomputed on the server from the database. |
| **Say "unknown" instead of guessing** | Opening status comes from structured hours only. Without them the badge reads *unknown* rather than inventing "Open". |
| **Discovery must work with zero partners** | OpenStreetMap supplies a real baseline directory on day one, de-duplicated against verified listings. |
| **Privacy by default for shop owners** | Owner name and phone are hidden unless the owner opts in. The customer's map pin is an approximate-area circle, not an exact home marker. |
| **Local-first, low ceremony** | One Express process, one JSON file, no external services required to clone and run. Friction-free to demo, easy to replace layer by layer. |

## 4. How it works

```
Location  →  Discovery  →  Trust level  →  Ordering  →  Fulfilment  →  Feedback
   GPS        OSM + DB      unclaimed/       cart +        pickup /      one review
   or search   merged        pending/        checkout      delivery      per order
                            verified
```

- **Discovery** merges verified database vendors with live OpenStreetMap records (Overpass primary, Nominatim fallback), de-duplicating within ~80 m and a similar name, and always prefers the verified record. Results are cached for two minutes per rounded coordinate bucket.
- **Trust** is a first-class field on every vendor, surfaced in the UI (badge, marker colour, copy) and enforced on the API (`POST /api/orders` rejects non-verified vendors).
- **Ordering** is server-authoritative: item existence, availability, quantity bounds, unit price, subtotal, discount and total are all recalculated server-side.
- **Fulfilment** is a seven-state lifecycle managed by the vendor: `placed → accepted → preparing → ready → out_for_delivery → completed`, with `cancelled` as the exit hatch.
- **Feedback** is gated on order ownership and a one-review-per-order rule, and public vendor ratings are derived from those reviews rather than stored aggregates.

## 5. Who it's for

- **Students and hostel residents** near campuses (the initial Jagatpura / VGU context) who eat out daily on a budget and want tiffin subscriptions.
- **Local food businesses** with no digital presence that want orders without signing up to a platform that takes a large commission.
- **Residents and newcomers** who want to know what's genuinely within walking distance, not what's sponsored.
- **Anyone building on open civic data** — the OSM-first discovery model is reusable for other categories beyond food.

## 6. What's real vs. what's a demo

| Area | Status |
| --- | --- |
| Location, discovery, maps, search & filters | Working, using live OpenStreetMap data (requires internet). |
| Accounts, vendor registration, admin verification | Working, stored in the local JSON database. |
| Menus, offers, meal plans, cart, checkout, order lifecycle | Working for verified vendors, end-to-end. |
| Demo Sandbox vendors and their orders | Clearly labelled fixtures; orders simulated client-side only. |
| Online payments | **Not implemented** — payment method is recorded as text (e.g. "UPI / Pay at Counter"). |
| Delivery logistics, rider assignment, live ETA | **Not implemented.** |
| Notifications (SMS/email/push) | **Not implemented.** |
| Production database, multi-instance scaling | **Not implemented** — single process, single JSON file. |

## 7. Data, licensing and attribution

- Business and place data comes from **OpenStreetMap** (Overpass API + Nominatim) under the **ODbL** licence, with visible map attribution. Any public deployment must respect the [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/) and keep caching in place.
- Photography in `src/assets/images` is illustrative product imagery, not photos of specific listed shops.
- No personal data is sent to third parties by the app itself; location queries are proxied through the server to OSM for geocoding.

## 8. Where it's going

Near-term priorities, in order:

1. **A real database** (SQLite locally, Postgres in production) behind a repository interface — the current JSON file is a demo-grade store.
2. **Account durability** — persistent sessions, password reset, verification, rate limiting.
3. **Linkable screens** — URL routing so a vendor menu or an order can be shared.
4. **Payments and order operations** — UPI collection, cancellation, refunds, receipts, delivery fees.
5. **A trustworthy verification flow** — evidence upload, OSM-ID validation, and a re-review cycle.

The full technical gap list lives in the [README's Known limitations](./README.md#known-limitations) section.

## 9. Naming and identity

- **LocalBite** — "local" is the entire thesis; "bite" keeps it about food, not logistics.
- Tagline: *Discover. Order. Enjoy Local Food.*
- The palette (warm cream `#FFF8EF`, forest green `#245C46`, marigold `#F28C38`) is drawn from Jaipur's street food and architecture rather than the generic red/black of delivery apps.
- Everything is designed mobile-first, because the user is standing on a street looking for lunch.

---

*LocalBite is an independent project. It is not affiliated with OpenStreetMap, Nominatim, Overpass or any delivery platform.*
