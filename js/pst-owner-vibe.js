/* Pep Shop Texas · owner app v5.2: a little personality for Jimmie. Owner app only.
   Rotating lines (never the same one twice in a row; recent ones are skipped), greetings by time of day,
   props when nothing is waiting, a cheer when new orders land, and the occasional pat on the back after he gets one out the door. */
(function () {
  "use strict";
  const P = window.PST;
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || "null"); localStorage.setItem(k, JSON.stringify(v)); } catch { return null; } };
  function nameOf(me) {
    const md = me?.user_metadata || {}, em = String(me?.email || "").toLowerCase();
    if (em === "wacoweaver@gmail.com") return "Jimmie";
    const f = String(md.first_name || md.given_name || String(md.full_name || md.name || "").split(/\s+/)[0] || "").trim();
    return f ? f[0].toUpperCase() + f.slice(1) : "";
  }
  // pick a line from a set, skipping the last few used from that set
  function pick(set, list, vars = {}) {
    const key = "pst-vibe-" + set, recent = store(key) || [], keep = Math.min(5, Math.max(1, list.length - 2));
    const pool = list.map((t, i) => i).filter(i => !recent.includes(i)), i = pool[Math.floor(Math.random() * pool.length)] ?? 0;
    store(key, [i, ...recent].slice(0, keep));
    return list[i].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
  }
  const tidy = s => s.replace(/,\s*([.!?])/g, "$1").replace(/\s+([.!?,])/g, "$1").replace(/\s{2,}/g, " ").replace(/^,\s*/, "").trim();
  const N = n => (n ? `, ${n}` : "");

  const GREET = {
    early: ["Up early{n}. Coffee first, then orders.", "Early bird gets the orders{n}.", "Sun's barely up and you're already on it{n}.", "Morning{n}. Quiet hours are the best hours to get ahead.", "Early start{n}. The shop thanks you.", "Before the rush{n}. Smart move."],
    morning: ["Morning{n}! Let's have a good one.", "Good morning{n}. Here's where things stand.", "Morning{n}. Shop's open and ready.", "Rise and grind{n}.", "Morning{n}. Let's make it a big day."],
    afternoon: ["Afternoon{n}. Here's the rundown.", "Hey{n}, good to see you.", "Afternoon check-in{n}. You've got this.", "Halfway through the day{n}. Here's what's moving.", "Howdy{n}. Let's see what came in."],
    evening: ["Evening{n}. Here's the wrap-up.", "Hey{n}, winding down? Here's where things landed.", "Evening{n}. Good day's work.", "Evening{n}. Let's tie up loose ends.", "Evening{n}. Almost time to put your feet up.", "Hey{n}. One last look before you call it?"],
    late: ["Burning the midnight oil{n}?", "Late one{n}. Don't stay up too long.", "Night owl mode{n}.", "Still at it{n}. Respect.", "Late shift{n}. The shop never sleeps, but you should.", "After hours{n}. Quick look and then rest up.", "Midnight check-in{n}. Here's the scoop."]
  };
  function greeting(me) {
    const h = new Date().getHours(), n = N(nameOf(me)), slot = h < 6 ? "late" : h < 9 ? "early" : h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "late";
    return tidy(pick("g-" + slot, GREET[slot], { n }));
  }
  const CLEAR = ["Nothing waiting on you{n}. Every order is handled. Nice work.", "All caught up{n}. That's how it's done.", "Clean slate{n}. Every customer's taken care of.",
    "Zero to pack, zero to chase. Look at you{n}.", "Inbox zero, Pep Shop style{n}. Go enjoy a minute.", "Everything's out the door{n}. Your customers are lucky.",
    "Not a thing waiting{n}. Tight ship.", "All clear{n}. Good time to check what's running low or text a regular.", "Nothing to fulfill{n}. You're ahead of the game.",
    "Caught up{n}. That's a Texas-sized job well done."];
  const allClear = me => tidy(pick("clear", CLEAR, { n: N(nameOf(me)) }));

  // new orders since he last looked
  const NEW = ["New order from {who}! {money}. Let's go{n}!", "Cha-ching{n}! {who} just ordered ({money}).", "{who} is back for more: {money}. They trust you{n}.",
    "Order in from {who}: {money}. Keep 'em coming{n}.", "Here we go{n}! {who} just placed {money}.", "Another one{n}! {who}, {money}.", "{who} picked Pep Shop Texas today: {money}. Nice{n}."];
  const FIRST_TODAY = ["First order of the day{n}! {who}, {money}. Here we go.", "And we're on the board{n}: {who}, {money}.", "Day's first sale{n}! {who} kicks it off with {money}."];
  const NEWCUST = ["Brand-new customer{n}! Welcome {who} ({money}). First impressions count.", "New face{n}! {who} just placed their first order: {money}.", "Fresh customer{n}: {who}, {money}. Make it a great first one."];
  const BIG = ["Big one{n}! {who}, {money}. 🔥", "Now that's an order{n}: {money} from {who}.", "{money} from {who}. Somebody's stocking up{n}!"];
  const MANY = ["That's {k} orders since you last looked{n}. Business is good.", "{k} new orders{n}! People love the shop.", "{k} orders came in{n}. Let's get to work."];
  const STREAK = ["{k} orders today{n}. You're on a roll.", "Order #{k} today{n}. Keep it rolling.", "{k} today and counting{n}."];
  function newOrders(me, list, ctx) {
    const live = list.filter(o => !ctx.dead(o)), newest = live.reduce((m, o) => o.created_at > m ? o.created_at : m, ""), seenKey = "pst-vibe-lastorder", seen = store(seenKey);
    if (!newest) return null;
    if (!seen) { store(seenKey, newest); return null; } // first run on this device: nothing to cheer yet
    const fresh = live.filter(o => o.created_at > seen).sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (!fresh.length) return null; store(seenKey, newest);
    const n = N(nameOf(me)), o = fresh[0], who = ctx.name(o).split(/\s+/)[0] || "A customer", money = P.money(o.total);
    const today = new Date().toDateString(), todayCount = live.filter(x => new Date(x.created_at).toDateString() === today).length;
    const prior = live.filter(x => x.id !== o.id && String(x.customer_email || x.shipping_email || "").toLowerCase() === String(o.customer_email || o.shipping_email || "").toLowerCase() && x.created_at < o.created_at).length;
    let msg;
    if (fresh.length >= 3) msg = pick("many", MANY, { k: fresh.length, n });
    else if (Number(o.total) >= 300) msg = pick("big", BIG, { who, money, n });
    else if (todayCount === 1) msg = pick("first", FIRST_TODAY, { who, money, n });
    else if (!prior) msg = pick("newcust", NEWCUST, { who, money, n });
    else if ([3, 5, 7, 10, 15, 20].includes(todayCount)) msg = pick("streak", STREAK, { k: todayCount, n });
    else msg = pick("new", NEW, { who, money, n });
    return { text: tidy(msg), count: fresh.length };
  }

  // after he moves an order along (not every time, so it stays special)
  const DONE = { paid: ["Money in the bank{n}.", "Paid and moving{n}.", "Love to see it{n}."], packed: ["Packed with care{n}.", "Boxed up and ready{n}.", "Another one ready to roll{n}."],
    shipped: ["Out the door{n}! 📦", "On its way{n}. Happy customer incoming.", "Shipped. That's how it's done{n}.", "Off it goes{n}!"],
    delivered: ["Delivered. Another happy customer{n}.", "Done and done{n}.", "That's a wrap on that one{n}."] };
  function afterAction(me, kind) {
    if (!DONE[kind] || Math.random() > 0.45) return "";
    return tidy(pick("done-" + kind, DONE[kind], { n: N(nameOf(me)) }));
  }
  window.PSTVibe = { nameOf, greeting, allClear, newOrders, afterAction };
})();
