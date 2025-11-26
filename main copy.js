(function () {
  function whenReady(fn) {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", fn);
    } else {
      fn();
    }
  }
  window.whenReady = whenReady;
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

  const MILITARY_WORDS = [
    "military",
    "soldier",
    "army",
    "officer",
    "general",
    "captain",
    "colonel",
    "lieutenant",
  ];
  const RX_MILITARY = new RegExp(
    "\\b(" + MILITARY_WORDS.join("|") + ")\\b",
    "i"
  );

  const FIRSTLADIES_WORDS = [
    "first lady",
    "first ladies",
    "Presidents' spouses",
  ];
  // // const RX_FIRSTLADIES = new RegExp(
  // //   "\\b(" + FIRSTLADIES_WORDS.join("|") + ")\\b",
  // //   "i"
  // // );

  // // const FIRSTLADIES_WORDS = ["first\\s+lady", "first\\s+ladies"];

  const RX_FIRSTLADIES = new RegExp(
    "\\b(" + FIRSTLADIES_WORDS.join("|") + ")\\b",
    "i"
  );

  // const RX_FIRSTLADIES = /first\s+lad(?:y|ies)|presidents'\s+spouses/i;

  // Gender-ish regexes
  const RX_MEN = /\b(men|man|male|gentleman|gentlemen)\b/i;
  const RX_WOMEN = /\b(women|woman|female|lady|ladies)\b/i;
  const RX_CHILDREN = /\b(child|children|boy|girl|youth)\b/i;

  // Assign a single, exclusive gender-ish category to a record.
  // Check CHILDREN first to avoid "girl"/"boy" matching adult buckets.
  function assignGenderCategory(rec) {
    const txt = haystack(rec);
    if (RX_CHILDREN.test(txt)) return "children";
    if (RX_WOMEN.test(txt)) return "women";
    if (RX_MEN.test(txt)) return "men";
    return null;
  }

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

  function matchesMilitary(rec) {
    const txt =
      field(rec, "title") +
      " " +
      field(rec, "name") +
      " " +
      field(rec, "topic") +
      " " +
      field(rec, "indexed_topics");
    return RX_MILITARY.test(txt);
  }

  function matchesFirstLadies(rec) {
    const txt = (
      field(rec, "title") +
      " " +
      field(rec, "name") +
      " " +
      field(rec, "topic") +
      " " +
      field(rec, "indexed_topics")
    )
      .trim()
      .toLowerCase();

    console.log(RX_FIRSTLADIES.test(txt));

    return RX_FIRSTLADIES.test(txt);
  }

  function matchesGender(rec, which) {
    if (!which) return true;
    if (!rec) return false;
    if (rec._gender) return rec._gender === which;
    // fallback to regex if _gender missing
    const txt = haystack(rec);
    if (which === "men") return RX_MEN.test(txt);
    if (which === "women") return RX_WOMEN.test(txt);
    if (which === "children") return RX_CHILDREN.test(txt);
    return true;
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

  const legendSelect = $(".legend-select-mobile");

  // ----------------------------
  // Setup
  // ----------------------------

  // Main entry: receive data, compute silhouettes, then wire up UI.
  function setupGallery(data) {
    records = data;

    silhouettes = records.filter((r) => haystack(r).includes("silhouette"));

    // assign stable, exclusive gender category so counts don't overlap
    silhouettes.forEach((r) => {
      r._gender = assignGenderCategory(r); // "children" | "women" | "men" | null
    });

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

        // Keep the "All people" dropdown in sync.
        if (legendSelect) {
          legendSelect.value = activeGender || "all";
        }

        // Apply combined filters.
        applyFilters();
      });
    });

    // Main dropdown: supports "named" == "identified".
    if (dropdown) {
      dropdown.value = "all";
      dropdown.addEventListener("change", (e) => {
        let v = (e.target.value || "").trim().toLowerCase();
        if (v === "identified") v = "named"; // treat as same bucket
        if (
          ![
            "all",
            "unidentified",
            "named",
            "politics",
            "military",
            "firstladies",
          ].includes(v)
        ) {
          v = "all";
        }
        currentFilter = v;

        // When the main dropdown changes, we don't force gender,
        // just re-apply filters with current activeGender.
        applyFilters();
      });
    }

    // "All people" dropdown (mobile): mirror the gender icon logic.
    if (legendSelect) {
      legendSelect.value = "all";
      legendSelect.addEventListener("change", (e) => {
        const v = (e.target.value || "").toLowerCase();

        // v is "all" | "men" | "women" | "children"
        activeGender = v === "all" ? null : v;

        // Update icon button states so they match the dropdown.
        ["men", "women", "children"].forEach((gid) => {
          const gbtn = $("#" + gid);
          if (gbtn) gbtn.classList.toggle("active", activeGender === gid);
        });

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
      if (currentFilter === "military") return matchesMilitary(r);
      if (currentFilter === "firstladies") return matchesFirstLadies(r);

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
      // update scroll card count when no results
      const cardElEmpty = document.getElementById("scroll-card");
      if (cardElEmpty) {
        const total =
          silhouettes && silhouettes.length
            ? silhouettes.length
            : records.length;
        const textDiv = cardElEmpty.querySelector(".scroll-card-text");
        if (textDiv)
          textDiv.textContent = `0 of ${total.toLocaleString()} silhouettes`;
      }

      return;
    }

    // Update the floating scroll card with the number of visible thumbnails vs total silhouettes
    const cardEl = document.getElementById("scroll-card");
    if (cardEl) {
      const total =
        silhouettes && silhouettes.length ? silhouettes.length : records.length;
      const visible = items.length || 0;
      const textDiv = cardEl.querySelector(".scroll-card-text");
      const text = `${visible.toLocaleString()} of ${total.toLocaleString()} silhouettes`;
      if (textDiv) {
        textDiv.textContent = text;
      } else {
        cardEl.textContent = text;
      }
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

    //////////////////LOAD IMAGES FROM LOCAL THUMBNAILS FOLDER INSTEAD////////////////////
    // const html = items
    //   .map((r) => {
    //     const alt = field(r, "title") || field(r, "name") || "silhouette";
    //     const fn = field(r, "filename");
    //     return `
    //       <div class="gallery-item">
    //         <img class="gallery-img"
    //              src="./thumbnails/${r.filename}.jpg"
    //              alt="${alt.replace(/"/g, "")}"
    //              data-filename="${fn}"
    //              loading="lazy">
    //       </div>
    //     `;
    //   })
    //   .join("");

    grid.innerHTML = html;
  }

  (function initScrollCard() {
    // Only enable on gallery page (do not add to index.html)
    if (
      !document.getElementById("gallery") &&
      !/gallery\.html$/i.test(location.pathname)
    )
      return;

    // Ensure a scroll card exists (create if missing)
    let card = document.getElementById("scroll-card");
    if (!card) {
      card = document.createElement("div");
      card.id = "scroll-card";
      card.className = "scroll-card";
      card.innerHTML = '<div class="scroll-card-text">0 of 0 silhouettes</div>';
      document.body.appendChild(card);
    }

    // Show it by default
    card.classList.add("visible");
    card.setAttribute("aria-hidden", "false");

    // Hide when the user scrolls (keeps listening so filter clicks can show it again)
    // const threshold = 20;
    // let hiddenByScroll = false;
    // function onScrollHide() {
    //   const y = window.scrollY || 0;
    //   if (y > threshold && !hiddenByScroll) {
    //     card.classList.remove("visible");
    //     card.setAttribute("aria-hidden", "true");
    //     hiddenByScroll = true;
    //   }
    // }
    // window.addEventListener("scroll", onScrollHide, { passive: true });

    // Hide on scroll down, show on scroll up. Small threshold to avoid jitter.
    const threshold = 20;
    let lastY = window.scrollY || 0;
    function onScroll() {
      const y = window.scrollY || 0;
      const delta = y - lastY;
      if (y < threshold) {
        // near top: always show
        card.classList.add("visible");
        card.setAttribute("aria-hidden", "false");
      } else if (delta > 2) {
        // scrolling down -> hide
        card.classList.remove("visible");
        card.setAttribute("aria-hidden", "true");
      } else if (delta < -2) {
        // scrolling up -> show
        card.classList.add("visible");
        card.setAttribute("aria-hidden", "false");
      }

      lastY = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });

    // When user toggles legend icons, show the card again (unless they scroll afterward)
    const legendBtns = Array.from(
      document.querySelectorAll(".legend-btn, #men, #women, #children")
    );
    legendBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        card.classList.add("visible");
        card.setAttribute("aria-hidden", "false");
        // reset lastY so the next small scroll won't immediately hide it
        lastY = window.scrollY || 0;
      });
    });
  })();
  // ----------------------------
  // Selection handling
  // ----------------------------

  const viewCollection = $("#view-btn");
  const morphCollection = $("#morph-btn");

  // Clicking a grid item toggles its "selected" state.
  function enableSelection() {
    if (!grid) return;
    grid.addEventListener("click", (e) => {
      const item = e.target.closest(".gallery-item");
      if (item) item.classList.toggle("selected");
      const selectedImgs = $all(".gallery-item.selected img");
      if (selectedImgs.length === 0) {
        if (viewCollection) viewCollection.setAttribute("disabled", "true");
        if (morphCollection) morphCollection.setAttribute("disabled", "true");
      } else {
        if (viewCollection) viewCollection.removeAttribute("disabled");
        if (morphCollection) morphCollection.removeAttribute("disabled");
      }
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
      if (selectedImgs.length === 0) return;

      const filenames = selectedImgs.map(
        (img) => img.dataset.filename || img.src
      );
      // persist (fallback)
      localStorage.setItem("morphSelection", JSON.stringify(filenames));

      // open sketch overlay (iframe) and send data after it loads
      openSketchOverlay("sketch.html");
    });
  }

  function openSketchOverlay(url) {
    if (!lightbox) return;

    lightbox.innerHTML = `
    <button class="close-btn" aria-label="Close overlay">Close</button>
    <div class="carousel-outer" role="dialog" aria-modal="true">
      <iframe id="sketch-iframe" src="${url}" title="Sketch" style="width:100%;height:80vh;border:0;" loading="lazy"></iframe>
    </div>
  `;
    lightbox.classList.remove("hidden");

    const iframe = document.getElementById("sketch-iframe");
    if (iframe) {
      // send current selection after iframe finishes loading
      iframe.addEventListener(
        "load",
        () => {
          try {
            const payload = JSON.parse(
              localStorage.getItem("morphSelection") || "[]"
            );
            iframe.contentWindow.postMessage(
              { type: "morphSelection", payload },
              "*"
            );
          } catch (e) {
            // ignore
          }
        },
        { once: true }
      );
    }

    // Close handler
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
        
                <div class="scroll-container"><div class="item-container"><div class="carousel-image-area"></div></div></div>

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
      index = Math.max(0, index - 3);
      show();
    });

    $(".carousel-next", lightbox).addEventListener("click", () => {
      index = Math.min(Math.max(0, slides.length - 3), index + 3);
      console.log("slides.length:", slides.length, "index:", index);

      show();
    });

    // Close the lightbox
    $(".close-btn", lightbox).addEventListener("click", () => {
      lightbox.classList.add("hidden");
      lightbox.innerHTML = "";
    });
  }

  //Psuedo code/////////////////////////////////////////
  // number of thumbnails selected to be captured as a length
  //display thumbnails from 0(i)-3(i)
  // on next button click, increment i by 3
  // on prev button click, decrement i by 3

  // numberThumbnails = slides.length;
  // let i = 0;

  // if (numberThumbnails <= 3) {

  // const prevBtn = $(".carousel-prev", lightbox);

  ////////////////////////////////////////////////////////

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

whenReady(() => {
  const toggle = document.getElementById("controls-toggle");
  const menu = document.getElementById("controls-menu");

  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    const isOpen = document.body.classList.toggle("filters-open");
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });
});
