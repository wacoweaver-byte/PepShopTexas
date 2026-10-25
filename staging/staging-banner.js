/* STAGING ONLY: test copy of Pep Shop Texas. Separate database; emails and texts are switched off. */
(function () { function add() { var b = document.createElement("div"); b.textContent = "TEST SITE · separate test database · orders here are not real";
  b.setAttribute("style", "position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#b91c1c;color:#fff;font:600 11px/1.2 system-ui,sans-serif;letter-spacing:.06em;text-align:center;padding:5px 8px;pointer-events:none");
  document.body.appendChild(b); } if (document.body) add(); else document.addEventListener("DOMContentLoaded", add); })();
