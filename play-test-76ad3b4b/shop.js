// The play page's shop (see Common/WebShop.cs in the game, and offthecouch-server next to this project): unlocking
// every game in the browser, in the website's own look. Its windows ask how to sign in on other computers (Google, or
// a phone number), open the payment company's window, and (by phone) take the texted code. A signed-in buyer's
// computer gets the full download, and one computer plays at a time. The online program decides who bought; this page
// only shows what it says. On this Mac (localhost) it talks to the online program in pretend mode (local.mjs).
var OTCShop = (function () {
  "use strict";
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  // Where the online program is (on Cloudflare; see offthecouch-server). Until every service is set up there, buying
  // says it opens soon.
  var API = LOCAL ? "http://localhost:8821" : "https://api.cuzgames.com";
  var PRICE = "$7.99", CONTACT = "yonatan@yo-software.com";

  var answer = 0;          // for the game: 0 while a window is open, then 1 bought, 2 closed, 3 something went wrong
  var settings = null;     // the online program's /api/config: whether buying is open, and the services' public parts
  var me = null;           // the signed-in account, once known
  var play = null;         // starts the game: play(null) the free download, play(files) the full one
  var robotToken = "", googleNext = null, paddleNext = null;
  var whenClosed = null;   // once a window is closed without buying or signing in: start the game (after the website's "Sign in")
  var veil = null;

  // The game listens for keys on the whole page and swallows them. While a window is open, keys typed in it go to the
  // window only: this listener runs before the game's (it is added first, and catches keys on their way down).
  ["keydown", "keyup", "keypress"].forEach(function (type) {
    addEventListener(type, function (e) {
      if (veil && !veil.hidden && veil.contains(e.target)) e.stopImmediatePropagation();
    }, true);
  });

  // ---- Kept on this computer: its own random name, and its sign-in key

  function kept(name, value) {
    try {
      if (value === undefined) return localStorage.getItem("otc." + name);
      if (value === null) localStorage.removeItem("otc." + name);
      else localStorage.setItem("otc." + name, value);
    } catch (e) {
      return null;
    }
  }

  function device() {
    var id = kept("device");
    if (!/^[0-9a-f]{32}$/.test(id || "")) {
      id = Array.prototype.map.call(crypto.getRandomValues(new Uint8Array(16)), function (b) { return (b + 256).toString(16).slice(1); }).join("");
      kept("device", id);
    }
    return id;
  }

  // ---- Talking to the online program

  function call(route, body) {
    var headers = {}, token = kept("token");
    if (token) headers.Authorization = "Bearer " + token;
    if (body) headers["Content-Type"] = "application/json";
    return fetch(API + route, { method: body ? "POST" : "GET", headers: headers, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (json) {
          if (!r.ok) {
            json.status = r.status;
            throw json;
          }
          return json;
        });
      });
  }

  function signedIn(r) {
    kept("token", r.token);
    me = r.account;
    return me;
  }

  // What went wrong, in words for the player.
  function problem(e) {
    var error = e && e.error;
    if (!error) return "We couldn't reach our server. Check the internet and try again.";
    if (error === "phone") return "Check the number: it looks too short or too long.";
    if (error === "code") return "That code isn't right. Check it and try again.";
    if (error === "expired") return "That code has run out. Send a new one.";
    if (error === "limit") return "Too many tries for now. Try again tomorrow.";
    if (error === "robot") return "The check that you're a person didn't work. Try again.";
    return "Something went wrong. Try again, or write to " + CONTACT + ".";
  }

  // The settings, and in real use the services' own scripts: Google's button, the payment window, the robot check.
  var readying = null;
  function ready() {
    if (readying) return readying;
    readying = call("/api/config").then(function (r) {
      settings = r;
      if (r.pretend || !r.open) return;
      return Promise.all([
        load("https://accounts.google.com/gsi/client").then(function () {
          google.accounts.id.initialize({ client_id: r.google, callback: function (answer) { if (googleNext) googleNext(answer.credential); },
            ux_mode: "popup", auto_select: false, itp_support: true, use_fedcm_for_button: true });
        }),
        load("https://cdn.paddle.com/paddle/v2/paddle.js").then(function () {
          if (r.paddle.env === "sandbox") Paddle.Environment.set("sandbox");
          Paddle.Initialize({ token: r.paddle.token, eventCallback: function (event) { if (paddleNext) paddleNext(event); } });
        }),
        load("https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"),
      ]);
    });
    readying.catch(function () { readying = null; });
    return readying;
  }

  function load(src) {
    return new Promise(function (done, failed) {
      var script = document.createElement("script");
      script.src = src;
      script.async = true;
      script.onload = done;
      script.onerror = failed;
      document.head.appendChild(script);
    });
  }

  // ---- Starting the page: the full download for a signed-in buyer whose computer gets the turn, else the free one

  function start(go) {
    play = go;
    var asked = /[?&](stopped|playhere)\b/.exec(location.search);
    if (asked) history.replaceState(null, "", location.pathname);
    var waiting = null;
    try { waiting = JSON.parse(kept("pending") || "null"); } catch (e) {}
    if (API && !kept("token") && waiting) { // a phone purchase left before its code was typed
      play(null);
      return ready().then(function () { show(codeWindow({ pending: waiting.pending, typed: waiting.typed })); });
    }
    if (API && !kept("token") && /[?&]signin\b/.test(location.search)) { // "Sign in" on the website
      // Only the sign-in window, on the bare page: the game starts once it is closed (signing in reloads the page).
      history.replaceState(null, "", location.pathname);
      var loading = document.getElementById("loading");
      if (loading) loading.style.display = "none";
      whenClosed = function () {
        if (loading) loading.style.display = "";
        play(null);
      };
      return account();
    }
    if (!API || !kept("token")) return play(null);
    call("/api/me").then(function (r) {
      me = r.account;
      if (!me.bought) return play(null);
      if (asked && asked[1] === "stopped") show(stoppedWindow());
      else takeTurn(!!asked);
    }, function (e) {
      if (e.status === 401) kept("token", null);
      play(null);
    });
  }

  // take: "Play here instead" (the other computer stops); otherwise ask when another computer is playing.
  function takeTurn(take) {
    call("/api/seat", { take: take }).then(function (r) {
      if (!r.ok) return show(elsewhereWindow());
      close();
      keepTurn();
      play(r.files);
    }, function () {
      close();
      play(null);
    });
  }

  // While the full game is open: a word about once a minute keeps this computer's turn. Once another computer has
  // taken over, this one stops (reloading, so the camera goes off too) and says so.
  function keepTurn() {
    var beat = function () {
      call("/api/beat", {}).then(function (r) {
        if (!r.ok) location.replace(location.pathname + "?stopped");
      }, function () {});
    };
    setInterval(beat, 60000);
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") beat();
    });
    addEventListener("pagehide", function () {
      var token = kept("token");
      if (token && navigator.sendBeacon) navigator.sendBeacon(API + "/api/leave", new Blob([token], { type: "text/plain" }));
    });
  }

  // ---- What the game asks for

  function buy() {
    answer = 0;
    if (!API) return show(soonWindow());
    show(waitWindow("One moment…"));
    ready().then(function () {
      if (!settings.open) return show(soonWindow());
      if (me && me.bought) return show(elsewhereWindow(true)); // a buyer who chose "Not now" earlier
      show(me && kept("token") ? unboughtWindow() : unlockWindow());
    }, function (e) {
      show(problemWindow(problem(e)));
    });
  }

  function account() {
    answer = 0;
    if (!API) return show(soonWindow());
    show(waitWindow("One moment…"));
    ready().then(function () {
      if (!kept("token")) return show(welcomeWindow());
      return call("/api/me").then(function (r) {
        me = r.account;
        show(accountWindow());
      });
    }).catch(function (e) {
      if (e && e.status === 401) {
        kept("token", null);
        me = null;
        return show(welcomeWindow());
      }
      show(problemWindow(problem(e)));
    });
  }

  function takeAnswer() {
    var given = answer;
    answer = 0;
    return given;
  }

  // ---- Windows

  function show(window) {
    if (!veil) {
      veil = h("div", { class: "otc-veil" });
      // Typing in a window stays in it (the game behind gets none of it); Escape closes it.
      veil.addEventListener("keydown", function (e) {
        e.stopPropagation();
        var x = veil.querySelector(".otc-x");
        if (e.key === "Escape" && x) x.click();
      });
      ["keyup", "keypress"].forEach(function (type) { veil.addEventListener(type, function (e) { e.stopPropagation(); }); });
      document.body.appendChild(veil);
    }
    veil.textContent = "";
    veil.appendChild(window);
    veil.hidden = false;
    var first = window.querySelector("input, .otc-btn, .otc-acct");
    if (first) first.focus();
  }

  function close() {
    if (!veil) return;
    veil.hidden = true;
    veil.textContent = "";
  }

  function closed() {
    close();
    answer = 2;
    if (whenClosed) {
      var then = whenClosed;
      whenClosed = null;
      then();
    }
  }

  // closable: shows the ✕ (Escape too), which closes without buying; wide: for two buttons side by side.
  function win(parts, options) {
    options = options || {};
    var box = h("div", { class: "otc-win" + (options.center ? " otc-center" : "") + (options.wide ? " otc-wide" : ""), role: "dialog", "aria-modal": "true" });
    if (options.closable !== false) box.appendChild(h("button", { class: "otc-x", type: "button", "aria-label": "Close", onclick: options.onclose || closed }, [icon(X)]));
    parts.forEach(function (part) { if (part) box.appendChild(part); });
    return box;
  }

  function h(tag, props, kids) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (key) {
      var value = props[key];
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key.slice(0, 2) === "on") el.addEventListener(key.slice(2), value);
      else el.setAttribute(key, value);
    });
    (kids || []).forEach(function (kid) { if (kid) el.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid); });
    return el;
  }

  function icon(svg) {
    var span = h("span", { "aria-hidden": "true", style: "display: flex" });
    span.innerHTML = svg; // only this file's own drawings
    return span;
  }

  var X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var PHONE = '<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>';
  var PERSON = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>';
  var CHECK = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
  var G = '<svg width="22" height="22" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

  var kicker = function (text) { return h("p", { class: "otc-kicker", text: text }); };
  var para = function (text, kind) { return h("p", { class: kind || "", text: text }); };
  var fine = function (text) { return h("p", { class: "otc-fine", text: text }); };
  var link = function (text, onclick) { return h("button", { class: "otc-link", type: "button", onclick: onclick, text: text }); };
  function title(text, highlight) {
    return h("h2", {}, [text, highlight ? h("span", { text: highlight }) : null]);
  }
  function button(text, kind, onclick, svg) {
    return h("button", { class: "otc-btn otc-" + kind, type: "button", onclick: onclick }, [svg ? icon(svg) : null, text]);
  }

  // A window waiting for an answer: its buttons rest; error: says what went wrong, and they work again.
  function busy(box, on, error, text) {
    Array.prototype.forEach.call(box.querySelectorAll("button, input, select"), function (el) {
      if (!el.classList.contains("otc-x")) el.disabled = on;
    });
    if (error) error.textContent = text || "";
  }

  // The Google button: Google's own, or on this Mac a pretend one with a pretend account chooser.
  function googleButton(next) {
    if (settings.pretend) return button("Continue with Google", "google", function () { show(pretendGoogleWindow(next)); }, G);
    var place = h("div", { class: "otc-gsi" });
    googleNext = function (credential) {
      show(waitWindow("Signing in…"));
      call("/api/google", { credential: credential, device: device() }).then(function (r) { next(signedIn(r)); }, function (e) { show(problemWindow(problem(e))); });
    };
    google.accounts.id.renderButton(place, { theme: "filled_black", size: "large", shape: "pill", text: "continue_with", width: 400, logo_alignment: "center" });
    return place;
  }

  // 1 · Unlock: pick how you'll sign in.
  function unlockWindow() {
    return win([
      kicker("Unlock all games"),
      title("All games ", PRICE),
      para("Paid once, with every new game we add."),
      h("hr"),
      para("How will you sign in on your other computers?", "otc-ask"),
      googleButton(function (account) {
        if (account.bought) return show(doneWindow(false));
        pay(account.ref, account.label);
      }),
      button("Use my phone number", "glass", function () { show(phoneWindow("buy")); }, PHONE),
      fine("Next, you pay in the payment company's window."),
      link("Already bought? Sign in", function () { show(welcomeWindow()); }),
    ]);
  }

  // Another computer: sign in once, then it stays signed in.
  function welcomeWindow() {
    return win([
      kicker("Already bought"),
      title("Welcome ", "back!"),
      para("Sign in to open the games you bought."),
      googleButton(function (account) { show(account.bought ? doneWindow(false) : unboughtWindow()); }),
      button("Use my phone number", "glass", function () { show(phoneWindow("signin")); }, PHONE),
      fine("This computer stays signed in after this."),
      link("Haven't bought yet? Unlock all games · " + PRICE, function () { show(unlockWindow()); }),
    ]);
  }

  function unboughtWindow() {
    return win([
      kicker("Signed in"),
      title("No games here yet"),
      para(me.label + " hasn't bought the games yet."),
      button("Unlock all games · " + PRICE, "main", function () { pay(me.ref, me.how === "google" ? me.label : null); }),
      link("Sign in another way", function () { forget(); show(welcomeWindow()); }),
    ]);
  }

  // The phone number: for buying (the code comes after paying) or for signing in on another computer.
  function phoneWindow(purpose) {
    var buying = purpose === "buy";
    var country = countryPicker(), number = h("input", { type: "tel", inputmode: "tel", autocomplete: "tel-national", placeholder: "Phone number", "aria-label": "Phone number" });
    var error = h("p", { class: "otc-error", role: "alert" });
    var robot = !buying && !settings.pretend ? h("div", { class: "otc-robot" }) : null;
    var box = win([
      kicker(buying ? "Unlock all games · " + PRICE : "Already bought"),
      title("Your phone number"),
      para(buying ? "You'll use it to sign in on your other computers." : "The number you used when you bought the games."),
      h("div", { class: "otc-field" }, [country, number]),
      error,
      robot,
      fine(buying ? "After you pay, we text you a code to type in. We only use your number to sign you in." : "We'll text you a code to type in."),
      button(buying ? "Continue to payment · " + PRICE : "Text me a code", "main", go),
      link("Back", function () { show(buying ? unlockWindow() : welcomeWindow()); }),
    ]);
    number.addEventListener("keydown", function (e) { if (e.key === "Enter") go(); });
    if (robot) {
      robotToken = "";
      turnstile.render(robot, { sitekey: settings.robot, theme: "dark", size: "flexible",
        callback: function (token) { robotToken = token; }, "expired-callback": function () { robotToken = ""; } });
    }

    function go() {
      var phone = fullNumber(country.value, number.value);
      if (!phone) return busy(box, false, error, problem({ error: "phone" }));
      if (robot && !robotToken) return busy(box, false, error, "Wait a moment for the check that you're a person.");
      var typed = "+" + country.value + " " + number.value.trim();
      busy(box, true, error);
      call("/api/phone/start", { phone: phone, purpose: purpose, robot: robotToken }).then(function (r) {
        if (buying) {
          kept("pending", JSON.stringify({ pending: r.pending, typed: typed }));
          return pay("p:" + r.pending, null, { pending: r.pending, typed: typed });
        }
        if (!r.found) return busy(box, false, error, "We couldn't find a purchase for this number. Check it, or sign in with Google if you used that.");
        show(codeWindow({ phone: phone, typed: typed, pretendCode: r.pretendCode }));
      }, function (e) {
        busy(box, false, error, problem(e));
      });
    }
    return box;
  }

  // The payment company's window. ref: names the account (a:...) or the phone purchase (p:...) in its message to us.
  function pay(ref, email, phone) {
    var after = function () {
      if (phone) waitForCode(phone);
      else waitForPurchase();
    };
    if (settings.pretend) return show(pretendPayWindow(ref, email, after));
    close();
    var paid = false;
    paddleNext = function (event) {
      if (event.name === "checkout.completed") {
        paid = true;
        setTimeout(function () {
          Paddle.Checkout.close();
          after();
        }, 1200);
      } else if (event.name === "checkout.closed" && !paid) closed();
    };
    Paddle.Checkout.open({
      items: [{ priceId: settings.paddle.price, quantity: 1 }],
      customData: { ref: ref },
      customer: email ? { email: email } : undefined,
      settings: { displayMode: "overlay", theme: "dark", locale: "en", allowLogout: false },
    });
  }

  // After paying with Google: the online program says "bought" once the payment company's message has come.
  function waitForPurchase() {
    show(waitWindow("Confirming your payment…"));
    var tries = 0;
    (function look() {
      call("/api/me").then(function (r) {
        me = r.account;
        if (me.bought) return show(doneWindow(true));
        if (++tries < 45) return setTimeout(look, 2000);
        show(slowWindow(waitForPurchase));
      }, function (e) { show(problemWindow(problem(e))); });
    })();
  }

  // After paying by phone: the code is texted once the payment is confirmed.
  function waitForCode(phone, corrected) {
    show(waitWindow(corrected ? "Texting the new number…" : "Confirming your payment…"));
    var tries = 0;
    (function look() {
      call("/api/phone/send", { pending: phone.pending, phone: corrected }).then(function (r) {
        corrected = undefined;
        if (r.paid) return show(codeWindow({ pending: phone.pending, typed: phone.typed, pretendCode: r.pretendCode }));
        if (++tries < 45) return setTimeout(look, 2000);
        show(slowWindow(function () { waitForCode(phone); }));
      }, function (e) {
        if (e && e.error === "text") return show(textFailedWindow(phone));
        show(problemWindow(problem(e)));
      });
    })();
  }

  // 4 · Type the code we text you. code.pending: after buying; code.phone: signing in on another computer.
  function codeWindow(code) {
    var error = h("p", { class: "otc-error", role: "alert" });
    var boxes = [0, 1, 2, 3, 4, 5].map(function (i) {
      return h("input", { inputmode: "numeric", autocomplete: i === 0 ? "one-time-code" : "off", maxlength: "6", "aria-label": "Digit " + (i + 1) });
    });
    var again = link("", resend);
    var box = win([
      kicker(code.pending ? "Almost done" : "Already bought"),
      title("Check your phone"),
      h("p", {}, ["We texted a code to ", h("b", { text: code.typed })]),
      h("div", { class: "otc-digits" }, boxes),
      error,
      code.pretendCode ? h("p", { class: "otc-pretend", text: "Pretend text message (on this Mac only): your code is " + code.pretendCode }) : null,
      again,
      link("Wrong number? Change it", function () { show(code.pending ? changeWindow(code) : phoneWindow("signin")); }),
      fine(code.pending ? "You've paid. This code just ties the games to your phone number." : "This computer stays signed in after this."),
    ]);
    boxes.forEach(function (input, i) {
      input.addEventListener("input", function () {
        var digits = input.value.replace(/\D/g, "");
        if (digits.length > 1) { // pasted, or filled in from the text message
          digits.split("").slice(0, 6 - i).forEach(function (d, k) { boxes[i + k].value = d; });
          boxes[Math.min(5, i + digits.length - 1)].focus();
        } else {
          input.value = digits;
          if (digits && i < 5) boxes[i + 1].focus();
        }
        var typed = boxes.map(function (b) { return b.value; }).join("");
        if (typed.length === 6) check(typed);
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Backspace" && !input.value && i > 0) boxes[i - 1].focus();
      });
    });
    var wait = 25;
    (function count() {
      again.disabled = wait > 0;
      again.textContent = wait > 0 ? "Didn't get it? You can send it again in 0:" + (wait < 10 ? "0" : "") + wait + "." : "Didn't get it? Send it again";
      if (wait-- > 0 && box.isConnected !== false) setTimeout(count, 1000);
    })();

    function check(typed) {
      busy(box, true, error);
      var ask = { code: typed, device: device() };
      if (code.pending) ask.pending = code.pending;
      else ask.phone = code.phone;
      call("/api/phone/check", ask).then(function (r) {
        if (code.pending) kept("pending", null);
        signedIn(r);
        show(me.bought ? doneWindow(!!code.pending) : unboughtWindow());
      }, function (e) {
        busy(box, false, error, problem(e));
        boxes.forEach(function (b) { b.value = ""; });
        boxes[0].focus();
      });
    }

    function resend() {
      if (code.pending) return waitForCode({ pending: code.pending, typed: code.typed });
      show(phoneWindow("signin")); // a new code needs the person check again
    }
    return box;
  }

  // "Wrong number? Change it", after paying.
  function changeWindow(code) {
    var country = countryPicker(), number = h("input", { type: "tel", inputmode: "tel", placeholder: "Phone number", "aria-label": "Phone number" });
    var error = h("p", { class: "otc-error", role: "alert" });
    var box = win([
      kicker("Almost done"),
      title("Your phone number"),
      para("We'll text the code to this number instead."),
      h("div", { class: "otc-field" }, [country, number]),
      error,
      button("Text me the code", "main", function () {
        var phone = fullNumber(country.value, number.value);
        if (!phone) return busy(box, false, error, problem({ error: "phone" }));
        waitForCode({ pending: code.pending, typed: "+" + country.value + " " + number.value.trim() }, phone);
      }),
      link("Back", function () { show(codeWindow(code)); }),
    ]);
    return box;
  }

  // 5 · All yours (bought: just paid; otherwise signed in on another computer). "Let's play" loads every game.
  function doneWindow(bought) {
    var bits = h("div", { class: "otc-bits", "aria-hidden": "true" }, [
      [-18, 30, "#FF8C42", -24], [104, 22, "#22B8AB", 18], [-26, 62, "#FFC94D", 36], [108, 70, "#FF8C42", -40], [-12, 92, "#22B8AB", 52],
      [102, 96, "#FFC94D", -16], [46, -6, "#FFFFFF", 64], [60, 104, "#FF8C42", 28], [-30, 8, "#22B8AB", -60], [112, 46, "#FFFFFF", 12],
    ].map(function (b) {
      return h("i", { style: "left: " + b[0] + "%; top: " + b[1] + "%; width: 12px; height: 24px; background: " + b[2] + "; transform: rotate(" + b[3] + "deg)" });
    }));
    return win([
      bits,
      h("span", { class: "otc-check" }, [icon(CHECK.replace(/26/g, "40").replace('stroke-width="2.6"', 'stroke-width="3"'))]),
      bought ? title("All games are ", "yours!") : title("Welcome ", "back!"),
      para(bought ? "Every game is open now. This computer stays signed in, so next time you just play." : "Your games are here. This computer stays signed in, so next time you just play."),
      bought ? fine("On another computer, sign in with the same Google account or phone number.") : null,
      button("Let's play", "main", function () { location.replace(location.pathname); }), // asks first if another computer is playing
    ], { center: true, closable: false });
  }

  // 7a · Another computer is playing. fromGame: asked from the free game's unlock (a buyer who chose "Not now").
  function elsewhereWindow(fromGame) {
    return win([
      kicker("One at a time"),
      title("Playing on another computer"),
      para("Your games are open on another computer right now. Only one computer can play at a time."),
      h("div", { class: "otc-two" }, [
        button("Play here instead", "main", function () {
          if (fromGame) return location.replace(location.pathname + "?playhere");
          show(waitWindow("One moment…"));
          takeTurn(true);
        }),
        button("Not now", "glass", function () {
          if (fromGame) return closed();
          close();
          play(null);
        }),
      ]),
    ], { closable: false });
  }

  // 7b · This computer stopped: another one took over.
  function stoppedWindow() {
    return win([
      kicker("Paused"),
      title("Now playing on another computer"),
      para("The game stopped here. Press below to bring it back."),
      button("Play here instead", "main", function () {
        show(waitWindow("One moment…"));
        takeTurn(true);
      }),
      link("Play the free game", function () {
        close();
        play(null);
      }),
    ], { closable: false });
  }

  // 8 · Settings: your account, sign out, delete my account.
  function accountWindow() {
    var date = me.boughtAt ? new Date(me.boughtAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
    return win([
      kicker("Settings"),
      title("Your account"),
      h("div", { class: "otc-row" }, [h("span", { class: "otc-dot otc-teal" }, [icon(PERSON)]),
        h("div", {}, [h("b", { text: me.how === "google" ? "Signed in with Google" : "Signed in with a phone number" }), h("span", { text: me.label })])]),
      h("div", { class: "otc-row" }, [h("span", { class: "otc-dot " + (me.bought ? "otc-tan" : "otc-grey") }, [icon(CHECK)]),
        h("div", {}, me.bought ? [h("b", { text: "All games · bought " + date }), h("span", { text: "Your receipt is in your email." })]
          : [h("b", { text: "Not bought yet" }), h("span", { text: "Fruit Slicer is free to play." })])]),
      me.bought ? null : button("Unlock all games · " + PRICE, "main", function () { pay(me.ref, me.how === "google" ? me.label : null); }),
      h("div", { class: "otc-two" }, [
        button("Sign out of this computer", "glass", function () {
          call("/api/signout", {}).catch(function () {});
          forget();
          location.replace(location.pathname); // back to the free game
        }),
        button("Delete my account", "redline", function () { show(deleteWindow()); }),
      ]),
    ], { wide: true });
  }

  function deleteWindow() {
    var error = h("p", { class: "otc-error", role: "alert" });
    var box = win([
      title("Delete your account?"),
      para("This removes your sign-in and your purchase record, and the games lock on every computer."),
      fine("Changed your mind about buying? Within 14 days you can ask for a refund instead."),
      error,
      h("div", { class: "otc-two" }, [
        button("Keep my account", "main", function () { show(accountWindow()); }),
        button("Delete", "red", function () {
          busy(box, true, error);
          call("/api/delete", {}).then(function () {
            forget();
            location.replace(location.pathname);
          }, function (e) { busy(box, false, error, problem(e)); });
        }),
      ]),
    ], { onclose: function () { show(accountWindow()); } });
    return box;
  }

  function forget() {
    kept("token", null);
    me = null;
  }

  function waitWindow(text) {
    return win([h("div", { class: "otc-spin", "aria-hidden": "true" }), para(text)], { center: true, closable: false });
  }

  function slowWindow(again) {
    return win([
      title("Still confirming"),
      para("The payment company hasn't told us yet. It can take a minute. If it takes longer, write to " + CONTACT + " and we'll sort it out."),
      button("Look again", "main", again),
    ]);
  }

  // Paid, but the text with the code couldn't be sent just now.
  function textFailedWindow(phone) {
    return win([
      kicker("Almost done"),
      title("We couldn't text your code"),
      para("Your payment went through. Our text to " + phone.typed + " didn't go out. Try again in a moment."),
      button("Try again", "main", function () { waitForCode(phone); }),
      fine("Still nothing? Write to " + CONTACT + ". Your purchase is safe."),
    ], { closable: false });
  }

  function soonWindow() {
    return win([
      kicker("Coming soon"),
      title("Unlocking here opens soon"),
      para("Fruit Slicer is free to play now. The other games open in the browser soon."),
      button("OK", "main", closed),
    ]);
  }

  function problemWindow(text) {
    var done = function () { closed(); answer = 3; }; // closed() also starts the game when it is waiting
    return win([title("Something went wrong"), para(text), button("Close", "glass", done)], { onclose: done });
  }

  // ---- Pretend windows, on this Mac only: stand-ins for Google's and the payment company's own windows

  function pretendGoogleWindow(next) {
    var choose = function (email) {
      return h("button", { class: "otc-acct", type: "button", onclick: function () {
        show(waitWindow("Signing in…"));
        call("/api/google", { credential: "pretend:" + email, device: device() }).then(function (r) { next(signedIn(r)); }, function (e) { show(problemWindow(problem(e))); });
      } }, [h("span", { text: email[0].toUpperCase() }), h("div", {}, [h("b", { text: email.split("@")[0] }), h("small", { text: email })])]);
    };
    return h("div", { class: "otc-theirs", role: "dialog", "aria-modal": "true" }, [
      h("div", { class: "otc-bar" }, [h("i"), h("i"), h("i"), h("span", { text: "Pretend Google window (on this Mac only)" })]),
      h("div", { class: "otc-in" }, [
        h("h3", { text: "Choose an account" }), h("p", { text: "to continue to Off the Couch" }),
        choose("you@gmail.com"), choose("friend@gmail.com"),
        h("p", { text: "Google shares your name and email address with Off the Couch." }),
        h("button", { class: "otc-cancel", type: "button", onclick: closed, text: "Cancel" }),
      ]),
    ]);
  }

  function pretendPayWindow(ref, email, after) {
    var pay = h("button", { class: "otc-pay", type: "button", text: "Pay " + PRICE, onclick: function () {
      pay.disabled = true;
      call("/api/pretend/pay", { ref: ref }).then(after, function (e) { show(problemWindow(problem(e))); });
    } });
    var field = function (label, value) { return h("label", {}, [label, h("input", { value: value || "", placeholder: value ? "" : "pretend" })]); };
    return h("div", { class: "otc-theirs", role: "dialog", "aria-modal": "true" }, [
      h("div", { class: "otc-bar" }, [h("i"), h("i"), h("i"), h("span", { text: "Pretend payment window (on this Mac only)" })]),
      h("div", { class: "otc-in" }, [
        h("h3", { text: "Unlock all games · " + PRICE }),
        field("Email", email || "you@example.com"), field("Card number", "4242 4242 4242 4242"),
        pay,
        h("p", { text: "Sold by the payment company, which adds any local tax and emails your receipt." }),
        h("button", { class: "otc-cancel", type: "button", onclick: closed, text: "Cancel" }),
      ]),
    ]);
  }

  // ---- Phone numbers: the country's calling code, picked from the list (guessed from the browser's language)

  var COUNTRIES = "IL 972,US 1,CA 1,GB 44,IE 353,AU 61,NZ 64,ZA 27,IN 91,FR 33,DE 49,ES 34,IT 39,PT 351,NL 31,BE 32,LU 352,CH 41,AT 43," +
    "DK 45,SE 46,NO 47,FI 358,IS 354,PL 48,CZ 420,SK 421,HU 36,RO 40,BG 359,GR 30,CY 357,MT 356,HR 385,SI 386,RS 381,EE 372,LV 371," +
    "LT 370,UA 380,TR 90,AE 971,SA 966,QA 974,KW 965,BH 973,JO 962,EG 20,MA 212,NG 234,KE 254,JP 81,KR 82,CN 86,HK 852,TW 886,SG 65," +
    "MY 60,TH 66,PH 63,ID 62,VN 84,BR 55,MX 52,AR 54,CL 56,CO 57,PE 51,UY 598";

  function countryPicker() {
    var guess = ((navigator.language || "").split("-")[1] || "").toUpperCase();
    try {
      if (/Jerusalem|Tel_Aviv/.test(Intl.DateTimeFormat().resolvedOptions().timeZone) || /^he\b/.test(navigator.language || "")) guess = "IL";
    } catch (e) {}
    var picker = h("select", { "aria-label": "Country" });
    COUNTRIES.split(",").forEach(function (pair) {
      var parts = pair.split(" ");
      var option = h("option", { value: parts[1], text: parts[0] + " +" + parts[1] });
      if (parts[0] === (guess || "US") && !picker.querySelector("[selected]")) option.setAttribute("selected", "");
      picker.appendChild(option);
    });
    return picker;
  }

  // The number in full (+ country code + number), or null when it can't be a phone number. A leading 0 (dialled at
  // home before the area) is left out, and a number typed with its own + is taken as it is.
  function fullNumber(code, typed) {
    typed = String(typed || "").trim();
    var digits = typed.replace(/\D/g, "");
    var number = typed.charAt(0) === "+" ? digits : code + digits.replace(/^0/, "");
    return /^[1-9]\d{7,14}$/.test(number) ? "+" + number : null;
  }

  return { start: start, buy: buy, account: account, takeAnswer: takeAnswer };
})();
