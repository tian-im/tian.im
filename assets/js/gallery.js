/* tian.im — photo grid lightbox
   - List pages: containers [data-gallery] hold <a class="img-grid__cell" data-full="URL">
   - Post pages: <article data-gallery="auto">; all <img> inside become a swipeable gallery
   Progressive enhancement: without JS the thumbnail links still open the full image. */
(function () {
  "use strict";

  var lb = null;      // lightbox DOM node (created lazily)
  var items = [];     // current image URLs
  var current = 0;    // current index

  function build() {
    lb = document.createElement("div");
    lb.className = "lb";
    lb.setAttribute("role", "dialog");
    lb.setAttribute("aria-modal", "true");
    lb.setAttribute("aria-label", "图片预览");

    var stage = document.createElement("div");
    stage.className = "lb__stage";
    lb.appendChild(stage);

    var img = document.createElement("img");
    img.className = "lb__img";
    img.alt = "";
    stage.appendChild(img);

    var prev = document.createElement("button");
    prev.className = "lb__btn lb__btn--prev";
    prev.type = "button";
    prev.setAttribute("aria-label", "上一张");
    prev.innerHTML = "&#10094;";
    stage.appendChild(prev);

    var next = document.createElement("button");
    next.className = "lb__btn lb__btn--next";
    next.type = "button";
    next.setAttribute("aria-label", "下一张");
    next.innerHTML = "&#10095;";
    stage.appendChild(next);

    var closeBtn = document.createElement("button");
    closeBtn.className = "lb__close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "关闭");
    closeBtn.innerHTML = "&#10005;";
    lb.appendChild(closeBtn);

    var counter = document.createElement("div");
    counter.className = "lb__counter";
    lb.appendChild(counter);

    document.body.appendChild(lb);

    // click on empty backdrop or on the image closes
    stage.addEventListener("click", function (e) {
      if (e.target === stage || e.target === img) close();
    });
    prev.addEventListener("click", function (e) { e.stopPropagation(); step(-1); });
    next.addEventListener("click", function (e) { e.stopPropagation(); step(1); });
    closeBtn.addEventListener("click", close);

    // keyboard: Esc closes, arrows navigate
    document.addEventListener("keydown", function (e) {
      if (!lb.classList.contains("is-open")) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
    });

    // touch swipe
    var sx = 0, sy = 0;
    stage.addEventListener("touchstart", function (e) {
      sx = e.changedTouches[0].clientX;
      sy = e.changedTouches[0].clientY;
    }, { passive: true });
    stage.addEventListener("touchend", function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      var dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        step(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  }

  function open(list, index) {
    if (!list.length) return;
    if (!lb) build();
    items = list;
    current = index;
    show();
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  function close() {
    if (!lb) return;
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
  }

  function step(dir) {
    if (items.length < 2) return;
    current = (current + dir + items.length) % items.length;
    show();
  }

  function show() {
    var img = lb.querySelector(".lb__img");
    if (img.getAttribute("src") !== items[current]) {
      img.classList.remove("is-switching");
      void img.offsetWidth; // restart the fade animation
      img.classList.add("is-switching");
      img.src = items[current];
    }
    // preload neighbours
    if (items.length > 1) {
      [(current - 1 + items.length) % items.length, (current + 1) % items.length].forEach(function (i) {
        var p = new Image();
        p.src = items[i];
      });
    }
    lb.querySelector(".lb__counter").textContent = (current + 1) + " / " + items.length;
    var single = items.length < 2;
    lb.querySelector(".lb__btn--prev").style.visibility = single ? "hidden" : "visible";
    lb.querySelector(".lb__btn--next").style.visibility = single ? "hidden" : "visible";
  }

  function wire(gallery) {
    var auto = gallery.getAttribute("data-gallery") === "auto";
    gallery.addEventListener("click", function (e) {
      var target = e.target;
      if (auto) {
        var img = target.closest ? target.closest("img") : null;
        if (!img) return;
        var imgs = Array.prototype.slice.call(gallery.querySelectorAll("img"));
        var idx = imgs.indexOf(img);
        if (idx === -1) return;
        e.preventDefault();
        open(imgs.map(function (i) { return i.getAttribute("src") || i.currentSrc; }), idx);
      } else {
        var a = target.closest ? target.closest("a[data-full]") : null;
        if (!a) return;
        var links = Array.prototype.slice.call(gallery.querySelectorAll("a[data-full]"));
        var idx = links.indexOf(a);
        if (idx === -1) return;
        e.preventDefault();
        open(links.map(function (l) { return l.getAttribute("href"); }), idx);
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("[data-gallery]"), wire);
  });
})();