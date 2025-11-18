(function () {
  function whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }

  // Shorthand for querySelector / querySelectorAll.
  function $(sel, scope) {
    return (scope || document).querySelector(sel);
  }

  function $all(sel, scope) {
    return Array.from((scope || document).querySelectorAll(sel));
  }

  // Clamp a number between min and max (used by the carousel index).
  function clamp(num, min, max) {
    return Math.max(min, Math.min(num, max));
  }

  // Safely read a string field from a record.
  function field(r, k) {
    return r && r[k] ? String(r[k]) : "";
  }

  // Full-text blob for simple keyword checks (lowercased inside).
  function haystack(r) {
    return (
      field(r, "title") +
      " " +
      field(r, "topic") +
      " " +
      field(r, "indexed_topics") +
      " " +
      field(r, "indexed_names") +
      " " +
      field(r, "indexed_object_types") +
      " " +
      field(r, "physicalDescription") +
      " " +
      field(r, "objectType")
    ).toLowerCase();
  }

  // ----------------------------
  // constants
  // ----------------------------
  const DATA_URL = "data/dataset.json";

  // Basic keyword list
  const POLITICS_WORDS = [
    "president",
    "presidents",
    "politics",
    "political",
    "congressman",
    "governor",
    "first\\s+lady",
    "government",
    "legislator",
  ];
  const RX_POLITICS = new RegExp(
    "\\b(" + POLITICS_WORDS.join("|") + ")\\b",
    "i"
  );

  // Gender-ish regexes
  const RX_MEN = /\b(men|man|male|gentleman|gentlemen)\b/i;
  const RX_WOMEN = /\b(women|woman|female|lady|ladies)\b/i;
  const RX_CHILDREN = /\b(child|children|boy|girl|youth)\b/i;

  // ----------------------------
  // Filtering
  // ----------------------------

  function isUnidentified(rec) {
    const t = field(rec, "title").trim().toLowerCase();
    return t.startsWith("unidentified");
  }

  function isNamed(rec) {
    return !isUnidentified(rec);
  }

  function matchesPolitics(rec) {
    const txt =
      field(rec, "title") +
      " " +
      field(rec, "topic") +
      " " +
      field(rec, "indexed_topics");
    return RX_POLITICS.test(txt);
  }

  function matchesGender(rec, which) {
    const txt = haystack(rec); // already lowercased inside haystack()
    if (which === "men") return RX_MEN.test(txt);
    if (which === "women") return RX_WOMEN.test(txt);
    if (which === "children") return RX_CHILDREN.test(txt);
    return true; // no gender filter selected
  }

  // ----------------------------
  // Shared state (simple variables)
  // ----------------------------
  let records = []; // all dataset records (loaded from JSON)
  let silhouettes = [];
  let activeGender = null;
  let currentFilter = "all";

  // Cache DOM references
  const grid = $("#gallery");
  const dropdown = $("#filter");
  const lightbox = $("#large-gallery");
  const viewBtn = $("#view-btn");
  const morphBtn = $("#morph-btn");

  // ----------------------------
  // Setup
  // ----------------------------

  // Main entry: receive data, compute silhouettes, then wire up UI.
  function setupGallery(data) {
    records = data;

    silhouettes = records.filter((r) => haystack(r).includes("silhouette"));

    // Wire filters and default render.
    setupFilters();
    renderGrid(silhouettes);

    // Enable selection, view, and morph actions.
    enableSelection();
    enableViewCollection();
    enableMorph();
  }

  // Prepare the UI filter controls (legend buttons + dropdown).
  function setupFilters() {
    // Legend buttons: men / women / children (toggle behavior).
    ["men", "women", "children"].forEach((id) => {
      const btn = $("#" + id);
      if (!btn) return;

      btn.setAttribute("aria-pressed", "false");

      btn.addEventListener("click", () => {
        // Toggle currently active gender (clicking again clears it).
        activeGender = activeGender === id ? null : id;

        // Update button visual states.
        ["men", "women", "children"].forEach((gid) => {
          const gbtn = $("#" + gid);
          if (gbtn) gbtn.classList.toggle("active", activeGender === gid);
        });

        // Apply combined filters.
        applyFilters();
      });
    });

    // Dropdown: supports "named" == "identified".
    if (dropdown) {
      dropdown.value = "all";
      dropdown.addEventListener("change", (e) => {
        let v = (e.target.value || "").trim().toLowerCase();
        if (v === "identified") v = "named"; // treat as same bucket
        if (!["all", "unidentified", "named", "politics"].includes(v))
          v = "all";
        currentFilter = v;
        applyFilters();
      });
    }
  }

  // ----------------------------
  // Filtering + rendering
  // ----------------------------

  // Combine the gender legend + dropdown filter and render.
  function applyFilters() {
    const filtered = silhouettes.filter((r) => {
      // 1) Gender filter first (if any)
      if (activeGender && !matchesGender(r, activeGender)) return false;

      // 2) Dropdown filter
      if (currentFilter === "unidentified") return isUnidentified(r);
      if (currentFilter === "named") return isNamed(r);
      if (currentFilter === "politics") return matchesPolitics(r);

      // "all"
      return true;
    });

    renderGrid(filtered);
  }

  // Render the grid as a set of <div class="gallery-item"> cards.
  function renderGrid(items) {
    if (!grid) return;

    // No results message.
    if (!items || items.length === 0) {
      grid.innerHTML =
        '<div class="text-white text-center col-span-full py-8 opacity-70">No results found</div>';
      return;
    }

    const html = items
      .map((r) => {
        const alt = field(r, "title") || field(r, "name") || "silhouette";
        const fn = field(r, "filename");
        return `
          <div class="gallery-item">
            <img class="gallery-img"
                 src="${r.thumbnail}"
                 alt="${alt.replace(/"/g, "")}"
                 data-filename="${fn}"
                 loading="lazy">
          </div>
        `;
      })
      .join("");

    grid.innerHTML = html;
  }

  // ----------------------------
  // Selection handling
  // ----------------------------

  // Clicking a grid item toggles its "selected" state.
  function enableSelection() {
    if (!grid) return;
    grid.addEventListener("click", (e) => {
      const item = e.target.closest(".gallery-item");
      if (item) item.classList.toggle("selected");
    });
  }

  // ----------------------------
  // Morph (trace)
  // ----------------------------

  // Button gathers selected filenames and opens sketch overlay.
  function enableMorph() {
    if (!morphBtn) return;
    morphBtn.addEventListener("click", () => {
      const selectedImgs = $all(".gallery-item.selected img");
      if (selectedImgs.length === 0) return; // nothing chosen

      const filenames = selectedImgs.map(
        (img) => img.dataset.filename || img.src
      );

      // Persist selection so sketch page can read it.
      localStorage.setItem("morphSelection", JSON.stringify(filenames));

      // Open drawing/trace UI in an overlay.
      openSketchOverlay("sketch.html");
    });
  }

  // Creates an overlay with an <iframe> to the sketch tool.
  function openSketchOverlay(url) {
    if (!lightbox) return;

    lightbox.innerHTML = `
      <button class="close-btn" aria-label="Close overlay">Close</button>
      <div class="carousel-outer" role="dialog" aria-modal="true">
        <iframe src="${url}" title="Sketch" style="width:100%;height:80vh;border:0;" loading="lazy"></iframe>
      </div>
    `;
    lightbox.classList.remove("hidden");

    // Close and clean up overlay.
    $(".close-btn", lightbox)?.addEventListener("click", () => {
      lightbox.classList.add("hidden");
      lightbox.innerHTML = "";
    });
  }

  // ----------------------------
  // View Collection (3-up carousel)
  // ----------------------------

  // Button builds slide data from selected items and opens a lightbox carousel.
  function enableViewCollection() {
    if (!viewBtn) return;

    viewBtn.addEventListener("click", () => {
      const selected = $all(".gallery-item.selected img");
      if (selected.length === 0) return;

      // Build slide objects with optional record metadata + silhouette overlay.
      const slides = selected.map((img) => {
        const filename = img.dataset.filename || "";
        const record = records.find((r) => r.filename === filename);
        const outline = filename ? "outlines/" + filename + ".png" : null;
        return {
          src: img.src,
          alt: img.alt || "",
          record,
          silhouetteUrl: outline,
        };
      });

      openCarousel(slides);
    });
  }

  // Lightbox carousel showing up to 3 images at a time (with captions/overlay).
  function openCarousel(slides) {
    if (!lightbox || !slides || slides.length === 0) return;

    lightbox.innerHTML = `
      <button class="close-btn" aria-label="Close carousel">Close</button>
      <div class="carousel-outer" role="dialog" aria-modal="true">
        <button class="carousel-prev" aria-label="Previous">&#8592;</button>
        <div class="carousel-image-area"></div>
        <button class="carousel-next" aria-label="Next">&#8594;</button>
      </div>
    `;
    lightbox.classList.remove("hidden");

    const area = $(".carousel-image-area", lightbox);
    let index = 0; // left-most visible slide index

    // Renders the current 1–3 visible slides.
    function show() {
      const visibleCount = Math.min(3, slides.length);
      const start = clamp(index, 0, Math.max(0, slides.length - visibleCount));
      const end = start + visibleCount;

      let html = "";
      for (let i = start; i < end; i++) {
        const s = slides[i];
        html += `<figure class="carousel-image-container">
          <img src="${s.src}" alt="${s.alt || ""}" class="carousel-img">`;

        // Optional silhouette overlay image (if available).
        if (s.silhouetteUrl) {
          html += `<img src="${s.silhouetteUrl}" class="silo-img" alt="">`;
        }

        // Optional metadata caption (title/date/place).
        if (s.record) {
          html += `<figcaption class="carousel-caption">
            ${s.record.title || s.record.name || ""}<br>
            ${s.record.date || s.record.indexed_dates || ""}<br>
            ${s.record.places || s.record.indexed_places || ""}
          </figcaption>`;
        }
        html += "</figure>";
      }
      area.innerHTML = html;
    }

    // Initial render
    show();

    // Navigation controls
    $(".carousel-prev", lightbox).addEventListener("click", () => {
      index = Math.max(0, index - 1);
      show();
    });

    $(".carousel-next", lightbox).addEventListener("click", () => {
      index = Math.min(Math.max(0, slides.length - 3), index + 1);
      show();
    });

    // Close the lightbox
    $(".close-btn", lightbox).addEventListener("click", () => {
      lightbox.classList.add("hidden");
      lightbox.innerHTML = "";
    });
  }

  // ----------------------------
  // Boot (load data + start app)
  // ----------------------------
  whenReady(() => {
    fetch(DATA_URL)
      .then((res) => res.json())
      .then((data) => setupGallery(data))
      .catch((err) => console.error("Error loading data:", err));
  });
})();
