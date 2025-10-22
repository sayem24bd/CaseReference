// app.js — FULL UPGRADED VERSION (বাংলা মন্তব্যসহ)
// লক্ষ্য: security-hardening, pagination bug-fix, Fuse lazy-load, accessibility,
// offline fallback for data.json, voice play/pause toggle, better toasts + UX tweaks.

document.addEventListener("DOMContentLoaded", () => {
  // ----------------------------
  // Configuration & Constants
  // ----------------------------
  const DEFAULT_PAGE_SIZE = 20; // চাইলে UI থেকে পরিবর্তন যোগ করতে পারো
  let PAGE_SIZE = DEFAULT_PAGE_SIZE;
  let currentPage = 1;

  const MAX_KEYWORD_LENGTH = 200;
  const FUSE_CDN = "https://cdn.jsdelivr.net/npm/fuse.js@6.6.2/dist/fuse.esm.min.js";
  const VISITOR_PROXY = "https://script.googleusercontent.com/macros/echo?user_content_key=AehSKLhf5uzrQwiFb7dOrnfS5ZWJ3eTByLQLDvMfQyxZ9gPYjYqmcc-is4JfXIdR89S4zcsMqUkEUAR6EsFqnXD9_W0SpG0GPTNiipGQt16iJh5iFyC9nN1GqVLrBwK5WyJHfIONr-XaqSWtL5bPt3ybIrPJ0_GluU5BTB3bxhSju4SWahHNTa9YemmC81rPi32vIaatSIpkT1OI4FXL405wGXex9TCE9mX68VfiUFq0cnPesWVMCifE489aJq0Mw1aUBMAd06gCQf3_XK3Qe54UOj1pZU1-65YoBTSVPiQr&lib=M6LBWHZv7lINz1DhtQi1gX9IQFzBK3SFY"; // **প্রতিক্রিয়া:** server-side proxy route রাখতে হবে যদি possible হয়
  // Optional fallback (if you intentionally want to keep the direct URL, uncomment and set)
  // const FALLBACK_VISITOR_URL = "https://script.googleusercontent.com/..."; // (অপশনাল)

  // ----------------------------
  // State
  // ----------------------------
  let DATA = [];
  let FUSE = null;
  let bookmarks = (() => {
    try {
      const raw = localStorage.getItem("bookmarks");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter(n => Number.isInteger(n)) : [];
    } catch {
      return [];
    }
  })();
  let theme = localStorage.getItem("theme") || (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  let debounceTimer = null;
 
  // ----------------------------
  // DOM shortcuts
  // ----------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const elements = {
    themeToggle: $("#themeToggle"),
    installBtn: $("#installBtn"),
    searchBox: $("#searchBox"),
    sortSelect: $("#sort"),
    clearFiltersBtn: $("#clearFilters"),
    controlsContainer: $("#controlsContainer"),
    mobileControlsContainer: $("#mobileControlsContainer"),
    searchWrap: $("#searchWrap"),
    sortWrap: $("#sortWrap"),
    filterToggleBtn: $("#filterToggleBtn"),
    sidebar: $(".sidebar"),
    sectionSelect: $("#section"),
    yearSelect: $("#year"),
    tagsWrap: $("#tagsWrap"),
    showBookmarksOnlyCheck: $("#showBookmarksOnly"),
    countDisplay: $("#count"),
    resultsWrap: $("#results"),
    bookmarksWrap: $("#bookmarks"),
    visitorCount: $("#visitor-count")
  };

  // ----------------------------
  // Accessibility-friendly toast
  // ----------------------------
  const showToast = (message, opts = {}) => {
    try {
      const toast = document.createElement('div');
      toast.className = 'toast show';
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'polite');
      toast.textContent = String(message);
      if (opts.extraClass) toast.classList.add(opts.extraClass);
      document.body.appendChild(toast);
      // animation/visual feedback class for copy
      if (opts.animate) {
        toast.classList.add('toast-animate');
      }
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, opts.duration || 2500);
    } catch (e) {
      console.log("Toast:", message);
    }
  };

  // ----------------------------
  // Safe HTML render (DOMPurify optional, fallback allowlist)
  // ----------------------------
  const renderWithHTML = (htmlText = "") => {
    const div = document.createElement("div");
    const s = String(htmlText || "");
    if (typeof DOMPurify !== 'undefined') {
      div.innerHTML = DOMPurify.sanitize(s);
      return div;
    }
    // নিরাপদ ফলব্যাক: কোনো HTML ট্যাগকেই রেন্ডার না করে টেক্সট হিসেবে দেখাবে
  console.warn("DOMPurify not loaded. Rendering content as plain text for security.");
  div.textContent = s; // innerHTML এর পরিবর্তে textContent ব্যবহার করুন
  return div;
};

  // ----------------------------
  // Helper: highlight matches safely
  // ----------------------------
  const buildHighlightedFragment = (text = "", keyword = "") => {
    const frag = document.createDocumentFragment();
    const safeText = String(text || "");
    if (!keyword) {
      frag.appendChild(document.createTextNode(safeText));
      return frag;
    }
    try {
      let k = String(keyword).trim();
      if (!k) {
        frag.appendChild(document.createTextNode(safeText));
        return frag;
      }
      if (k.length > MAX_KEYWORD_LENGTH) k = k.slice(0, MAX_KEYWORD_LENGTH);
      const safeK = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safeK, "ig");
      let lastIndex = 0;
      let match;
      while ((match = rx.exec(safeText)) !== null) {
        if (match.index > lastIndex) {
          frag.appendChild(document.createTextNode(safeText.slice(lastIndex, match.index)));
        }
        const span = document.createElement("span");
        span.className = "highlight";
        span.textContent = match[0];
        frag.appendChild(span);
        lastIndex = rx.lastIndex;
        if (rx.lastIndex === match.index) rx.lastIndex++;
      }
      if (lastIndex < safeText.length) frag.appendChild(document.createTextNode(safeText.slice(lastIndex)));
      if (!frag.childNodes.length) frag.appendChild(document.createTextNode(safeText));
      return frag;
    } catch {
      frag.appendChild(document.createTextNode(safeText));
      return frag;
    }
  };

  // ----------------------------
  // Safe href checker
  // ----------------------------
  const isSafeHref = (href) => {
    if (!href) return false;
    const trimmed = String(href).trim();
    const low = trimmed.toLowerCase();
    if (low.startsWith("http://") || low.startsWith("https://")) return true;
    if (low.startsWith("/") || low.startsWith("./") || low.startsWith("../")) return true;
    return false;
  };

  // ----------------------------
  // Validate & normalize incoming data
  // ----------------------------
  const validateDataArray = (arr) => {
    if (!Array.isArray(arr)) return [];
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const id = Number(item.id);
      if (!Number.isInteger(id)) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      const normalized = {
        id,
        serial_no: String(item.serial_no || "").trim(),
        question: String(item.question || "").trim(),
        answer: String(item.answer || "").trim(),
        details: String(item.details || "").trim(),
        key_point: String(item.key_point || "").trim(),
        law_section: String(item.law_section || "").trim(),
        case_reference: String(item.case_reference || "").trim(),
        tags: Array.isArray(item.tags) ? item.tags.map(t => String(t).trim()).filter(Boolean) : [],
        keywords: Array.isArray(item.keywords) ? item.keywords.map(t => String(t).trim()).filter(Boolean) : [],
        year: Number.isFinite(Number(item.year)) ? Number(item.year) : null,
        last_updated: String(item.last_updated || "").trim(),
        source: String(item.source || "").trim(),
        law_reference_link: String(item.law_reference_link || "").trim(),
        related_ids: Array.isArray(item.related_ids) ? item.related_ids.filter(n => Number.isInteger(n)) : []
      };
      if (!normalized.question || !normalized.answer) continue;
      out.push(normalized);
    }
    return out;
  };

  // ----------------------------
  // Simple search fallback (case-insensitive substring)
  // ----------------------------
  const simpleSearchFallback = (list, keyword) => {
    const k = String(keyword).toLowerCase().slice(0, MAX_KEYWORD_LENGTH);
    return list.filter(item => {
      return (
        (item.question && item.question.toLowerCase().includes(k)) ||
        (item.answer && item.answer.toLowerCase().includes(k)) ||
        (item.details && item.details.toLowerCase().includes(k)) ||
        (item.key_point && item.key_point.toLowerCase().includes(k)) ||
        (item.law_section && item.law_section.toLowerCase().includes(k)) ||
        (item.case_reference && item.case_reference.toLowerCase().includes(k)) ||
        (item.tags && item.tags.join(" ").toLowerCase().includes(k)) ||
        (item.keywords && item.keywords.join(" ").toLowerCase().includes(k))
      );
    });
  };

  // ----------------------------
  // Pagination helpers (BUG-FIXED)
  // ----------------------------
  const getPagedData = (list) => {
    const start = Math.max(0, (currentPage - 1) * PAGE_SIZE);
    const end = currentPage * PAGE_SIZE;
    return list.slice(start, end);
  };

  // ----------------------------
  // Render cards (safe)
  // ----------------------------
  const renderCards = (list, containerEl, keyword = "") => {
    if (!containerEl) return;
    containerEl.innerHTML = "";
    const fragment = document.createDocumentFragment();
    for (const item of list) {
      const article = document.createElement("article");
      article.className = "card";
      article.dataset.id = String(item.id);
      article.setAttribute("aria-expanded", "false");

      // Header (question)
      const header = document.createElement("div");
      header.className = "card-header";
      header.dataset.action = "toggle";
      header.setAttribute("role", "button");
      header.setAttribute("tabindex", "0");
      header.setAttribute("aria-controls", `card-${item.id}-details`);

      const serialNoSpan = document.createElement("span");
      serialNoSpan.className = "serial-no";
      serialNoSpan.textContent = ` ${item.serial_no || item.id}।`;
      header.appendChild(serialNoSpan);

      const headerLabel = document.createElement("span");
      headerLabel.className = "label label-question";
      headerLabel.textContent = "প্রশ্ন: ";
      header.appendChild(headerLabel);
      header.appendChild(buildHighlightedFragment(item.question, keyword));
      article.appendChild(header);

      // Details
      const details = document.createElement("div");
      details.className = "card-details";
      details.id = `card-${item.id}-details`;
      details.setAttribute("aria-hidden", "true");
      details.hidden = true; // accessibility

      const answerDiv = document.createElement("div");
      const answerLabel = document.createElement("span");
      answerLabel.className = "label label-answer";
      answerLabel.textContent = "উত্তর: ";
      answerDiv.appendChild(answerLabel);
      const answerContent = renderWithHTML(item.answer);
      while (answerContent.firstChild) answerDiv.appendChild(answerContent.firstChild);
      details.appendChild(answerDiv);

      if (item.details) {
        const detailsDiv = document.createElement("div");
        const detailsLabel = document.createElement("span");
        detailsLabel.className = "label label-details";
        detailsLabel.textContent = "বিস্তারিত: ";
        detailsDiv.appendChild(detailsLabel);
        const detailsContent = renderWithHTML(item.details);
        while (detailsContent.firstChild) detailsDiv.appendChild(detailsContent.firstChild);
        details.appendChild(detailsDiv);
      }

      // key_point, section, case_reference
      const keyDiv = document.createElement("div");
      const keyLabel = document.createElement("span");
      keyLabel.className = "label label-keywords";
      keyLabel.textContent = "শিক্ষা: ";
      keyDiv.appendChild(keyLabel);
      const keyContent = renderWithHTML(item.key_point || "-");
      while (keyContent.firstChild) keyDiv.appendChild(keyContent.firstChild);
      details.appendChild(keyDiv);

      const sectionDiv = document.createElement("div");
      const sectionLabel = document.createElement("span");
      sectionLabel.className = "label label-section";
      sectionLabel.textContent = "ধারা: ";
      sectionDiv.appendChild(sectionLabel);
      const sectionContent = renderWithHTML(item.law_section || "-");
      while (sectionContent.firstChild) sectionDiv.appendChild(sectionContent.firstChild);
      details.appendChild(sectionDiv);

      const caseDiv = document.createElement("div");
      const caseLabel = document.createElement("span");
      caseLabel.className = "label label-case";
      caseLabel.textContent = "মামলা: ";
      caseDiv.appendChild(caseLabel);
      const caseContent = renderWithHTML(item.case_reference || "কোনো মামলা রেফারেন্স নেই");
      while (caseContent.firstChild) caseDiv.appendChild(caseContent.firstChild);
      details.appendChild(caseDiv);

      // Meta
      const meta = document.createElement("div");
      meta.className = "meta";
      const tagsSpan = document.createElement("span");
      tagsSpan.textContent = "ট্যাগ: ";
      meta.appendChild(tagsSpan);
      const tagsList = document.createElement("span");
      tagsList.textContent = item.tags.map(t => `#${t}`).join(" · ") || "N/A";
      meta.appendChild(tagsList);

      if (item.keywords && item.keywords.length) {
        const kw = document.createElement("div");
        kw.textContent = `শিরোনাম: ${item.keywords.map(k => `#${k}`).join(" · ")}`;
        meta.appendChild(kw);
      }

      const info = document.createElement("div");
      info.textContent = `সাল: ${item.year || "N/A"}`;
      if (item.source) info.textContent += ` | উৎস: ${item.source}`;
      if (item.last_updated) info.textContent += ` | শেষ আপডেট: ${item.last_updated}`;
      meta.appendChild(info);

      details.appendChild(meta);

      // law link (safe)
      if (isSafeHref(item.law_reference_link)) {
        const linkDiv = document.createElement("div");
        const linkBold = document.createElement("b");
        linkBold.textContent = "আরো জানতে: ";
        linkDiv.appendChild(linkBold);
        const lawLink = document.createElement("a");
        lawLink.href = item.law_reference_link;
        lawLink.textContent = "ক্লিক";
        lawLink.target = "_blank";
        lawLink.rel = "noopener noreferrer";
        linkDiv.appendChild(lawLink);
        details.appendChild(linkDiv);
      }

      // related ids
      if (item.related_ids && item.related_ids.length) {
        const relatedDiv = document.createElement("div");
        const relatedBold = document.createElement("b");
        relatedBold.textContent = "Relevant: ";
        relatedDiv.appendChild(relatedBold);
        item.related_ids.forEach((relId, index) => {
          const relatedLink = document.createElement("a");
          relatedLink.href = `?id=${encodeURIComponent(String(relId))}`;
          relatedLink.textContent = `ID ${relId}`;
          relatedLink.addEventListener('click', (e) => {
            e.preventDefault();
            const targetCard = document.querySelector(`.card[data-id="${relId}"]`);
            if (targetCard) {
              targetCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
              openCardElement(targetCard);
              setTimeout(() => targetCard.classList.remove('card-highlighted'), 2500);
            } else {
              // safe fallback navigation
              window.location.href = `?id=${encodeURIComponent(String(relId))}`;
            }
          });
          relatedDiv.appendChild(relatedLink);
          if (index < item.related_ids.length - 1) relatedDiv.appendChild(document.createTextNode(", "));
        });
        details.appendChild(relatedDiv);
      }

      // actions: bookmark, share, speak
      const actions = document.createElement("div");
      actions.className = "actions";

      const isBookmarked = bookmarks.includes(item.id);
      const bookmarkBtn = createButton(isBookmarked ? "🔖 বুকমার্ক সরান" : "🔖 বুকমার্ক করুন", [isBookmarked ? "danger" : "primary"]);
      bookmarkBtn.dataset.action = "bookmark";
      bookmarkBtn.dataset.id = String(item.id);
      bookmarkBtn.setAttribute("aria-pressed", isBookmarked ? "true" : "false");
      bookmarkBtn.setAttribute("title", isBookmarked ? "বুকমার্ক সরান" : "বুকমার্ক করুন");
      actions.appendChild(bookmarkBtn);

      details.appendChild(actions);
      article.appendChild(details);
      fragment.appendChild(article);
    }
    containerEl.appendChild(fragment);
  };

  // ----------------------------
  // Create simple button helper
  // ----------------------------
  const createButton = (text, classes = [], attrs = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = classes.join(" ");
    btn.textContent = text;
    Object.entries(attrs).forEach(([k, v]) => btn.setAttribute(k, v));
    return btn;
  };

  // ----------------------------
  // Render with pagination
  // ----------------------------
  function renderWithPagination(list, containerEl, keyword = "") {
    if (!containerEl) return;
    containerEl.innerHTML = "";

    // current slice
    const pagedList = getPagedData(list);
    renderCards(pagedList, containerEl, keyword);

    // "Load More" button
    if ((currentPage * PAGE_SIZE) < list.length) {
      const loadMoreBtn = document.createElement("button");
      loadMoreBtn.textContent = "⬇️ আরো দেখুন";
      loadMoreBtn.className = "btn-loadmore";
      loadMoreBtn.setAttribute("aria-label", "আরো দেখুন");
      loadMoreBtn.onclick = () => {
  const pos = loadMoreBtn.offsetButtom;
  currentPage++;
  renderWithPagination(list, containerEl, keyword);
  window.scrollTo({ top: pos, behavior: 'smooth' });
};
      containerEl.appendChild(loadMoreBtn);
    }
  }

  // ----------------------------
  // Bookmarks panel
  // ----------------------------
  const renderBookmarks = () => {
    if (!elements.bookmarksWrap) return;
    const bookmarkedItems = DATA.filter(d => bookmarks.includes(d.id));
    if (bookmarkedItems.length === 0) {
      elements.bookmarksWrap.innerHTML = "";
      const empty = document.createElement("div");
      empty.className = "meta";
      empty.textContent = "কোনো বুকমার্ক নেই";
      elements.bookmarksWrap.appendChild(empty);
      return;
    }
    renderCards(bookmarkedItems, elements.bookmarksWrap, elements.searchBox ? elements.searchBox.value.trim() : "");
  };

  // ----------------------------
  // Toggle card open/close (centralized)
  // ----------------------------
  const openCardElement = (cardEl) => {
    if (!cardEl) return;
    // close others
    $$(".card").forEach(c => {
      if (c !== cardEl) {
        c.classList.remove("expanded");
        c.setAttribute("aria-expanded", "false");
        const d = c.querySelector(".card-details");
        if (d) {
          d.setAttribute("aria-hidden", "true");
          d.hidden = true;
        }
      }
    });
    // open target
    cardEl.classList.add("expanded");
    cardEl.classList.add('card-highlighted');
    cardEl.setAttribute("aria-expanded", "true");
    const det = cardEl.querySelector(".card-details");
    if (det) {
      det.setAttribute("aria-hidden", "false");
      det.hidden = false;
    }
    setTimeout(() => cardEl.classList.remove('card-highlighted'), 2500);
  };

  // ----------------------------
  // Click handler for cards
  // ----------------------------
  const handleCardClick = (event, containerEl) => {
    const actionTarget = event.target.closest("[data-action]");
    const headerTarget = event.target.closest(".card-header");
    const target = actionTarget || headerTarget;
    if (!target) return;

    const card = target.closest(".card");
    if (!card) return;
    const action = target.dataset.action || (headerTarget ? "toggle" : null);
    const id = Number(card.dataset.id);
    if (!Number.isInteger(id)) return;

    if (action === "toggle") {
      const isExpanded = card.classList.contains("expanded");
      if (isExpanded) {
        // collapse
        card.classList.remove("expanded");
        card.setAttribute("aria-expanded", "false");
        const det = card.querySelector(".card-details");
        if (det) {
          det.setAttribute("aria-hidden", "true");
          det.hidden = true;
        }
      } else {
        openCardElement(card);
      }
      return;
    }

    const item = DATA.find(d => d.id === id);
    if (action === "bookmark") toggleBookmark(id);
  
  };

  // ----------------------------
  // Toggle bookmark
  // ----------------------------
  const toggleBookmark = (id) => {
    if (!Number.isInteger(id)) return;
    const idx = bookmarks.indexOf(id);
    if (idx >= 0) {
      bookmarks.splice(idx, 1);
      showToast("বুকমার্ক সরানো হয়েছে");
    } else {
      if (!DATA.some(d => d.id === id)) {
        showToast("বৈধ আইটেম নয়");
        return;
      }
      bookmarks.push(id);
      showToast("বুকমার্ক করা হয়েছে");
    }
    try {
      localStorage.setItem("bookmarks", JSON.stringify(bookmarks));
    } catch (e) {
      console.warn("Could not persist bookmarks:", e);
    }
    applyFilters(false); // don't reset pagination when toggling bookmark
    renderBookmarks();
    // update buttons
    $$('button[data-action="bookmark"]').forEach(btn => {
      const bid = Number(btn.dataset.id);
      const pressed = bookmarks.includes(bid);
      btn.setAttribute("aria-pressed", pressed ? "true" : "false");
      btn.textContent = pressed ? "🔖 বুকমার্ক সরান" : "🔖 বুকমার্ক করুন";
      btn.className = pressed ? "danger" : "primary";
      btn.setAttribute("title", pressed ? "বুকমার্ক সরান" : "বুকমার্ক করুন");
    });
  };

  // ----------------------------
  // Move controls for mobile/desktop
  // ----------------------------
  const manageControlPlacement = () => {
    const isMobile = window.innerWidth < 960;
    try {
      if (isMobile && elements.mobileControlsContainer && elements.searchWrap && elements.sortWrap) {
        elements.mobileControlsContainer.appendChild(elements.searchWrap);
        elements.mobileControlsContainer.appendChild(elements.sortWrap);
      } else if (elements.controlsContainer && elements.searchWrap && elements.sortWrap) {
        elements.controlsContainer.prepend(elements.sortWrap);
        elements.controlsContainer.prepend(elements.searchWrap);
      }
    } catch (e) {
      console.warn("manageControlPlacement err:", e);
    }
  };

  // ----------------------------
  // Query param helpers
  // ----------------------------
  const setQueryParams = (params) => {
    try {
      const url = new URL(location.href);
      Object.entries(params).forEach(([k, v]) => {
        if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) url.searchParams.delete(k);
        else if (Array.isArray(v)) url.searchParams.set(k, v.join(","));
        else url.searchParams.set(k, v);
      });
      history.replaceState(null, "", url.toString());
    } catch (err) {
      console.warn("Could not set query params:", err);
    }
  };

  const getQueryParam = (key) => {
    try {
      return new URL(location.href).searchParams.get(key);
    } catch {
      return null;
    }
  };

  // ----------------------------
  // Apply filters + search + sort + pagination control
  // - If resetPagination true → currentPage = 1
  // ----------------------------
  const applyFilters = (resetPagination = true) => {
    const keywordRaw = elements.searchBox ? elements.searchBox.value.trim() : "";
    const keyword = String(keywordRaw).slice(0, MAX_KEYWORD_LENGTH);
    const section = elements.sectionSelect ? elements.sectionSelect.value : "";
    const year = elements.yearSelect && elements.yearSelect.value ? Number(elements.yearSelect.value) : "";
    const sort = elements.sortSelect ? elements.sortSelect.value : "relevance";
    const tags = elements.tagsWrap ? Array.from(elements.tagsWrap.querySelectorAll('input:checked')).map(c => c.value) : [];
    const showBookmarksOnly = elements.showBookmarksOnlyCheck && elements.showBookmarksOnlyCheck.checked;

    setQueryParams({ q: keyword, section, year, tags, sort, bookmarks: showBookmarksOnly ? 'true' : '' });

    if (resetPagination) currentPage = 1;

    let list = DATA.slice();

    if (keyword) {
      if (FUSE) {
        try {
          const results = FUSE.search(keyword);
          list = results.map(r => r.item);
        } catch (e) {
          console.warn("Fuse search failed:", e);
          list = simpleSearchFallback(list, keyword);
        }
      } else {
        list = simpleSearchFallback(list, keyword);
      }
    }

    list = list.filter(d => {
      const okSection = !section || d.law_section === section;
      const okYear = !year || Number(d.year) === Number(year);
      const okTags = tags.length === 0 || tags.every(t => d.tags.includes(t));
      const okBookmark = !showBookmarksOnly || bookmarks.includes(d.id);
      return okSection && okYear && okTags && okBookmark;
    });

    if (sort === "newest") list = [...list].sort((a, b) => (b.year || 0) - (a.year || 0));
    else if (sort === "az") list = [...list].sort((a, b) => a.question.localeCompare(b.question, "bn") || a.id - b.id);
    else if (sort === "section") list = [...list].sort((a, b) => a.law_section.localeCompare(b.law_section || "", "bn") || a.id - b.id);

    if (elements.countDisplay) elements.countDisplay.innerText = list.length ? `${list.length} ফলাফল পাওয়া গেছে` : "কোনো ফলাফল পাওয়া যায়নি";

    renderWithPagination(list, elements.resultsWrap, keyword);
  };

  // Debounced apply (300ms)
  const debouncedApply = () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => applyFilters(true), 300);
  };

  // ----------------------------
  // Card event wiring + keyboard accessibility
  // ----------------------------
  const setupEventListeners = () => {
    if (elements.themeToggle) {
      elements.themeToggle.addEventListener("click", () => {
        theme = (theme === "dark") ? "light" : "dark";
        document.body.classList.toggle("dark", theme === "dark");
        localStorage.setItem("theme", theme);
        elements.themeToggle.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";
      });
    }

    let deferredPrompt;
    window.addEventListener("beforeinstallprompt", (e) => {
      try {
        e.preventDefault();
        deferredPrompt = e;
        if (elements.installBtn) elements.installBtn.hidden = false;
      } catch { /* ignore */ }
    });

    if (elements.installBtn) {
      elements.installBtn.addEventListener("click", async () => {
        try {
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          await deferredPrompt.userChoice;
          elements.installBtn.hidden = true;
          deferredPrompt = null;
        } catch (e) { console.warn("Install prompt failed:", e); }
      });
    }

    if (elements.filterToggleBtn) {
      elements.filterToggleBtn.addEventListener("click", () => {
        document.body.classList.toggle("filter-open");
      });
    }

    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(manageControlPlacement, 150);
    });

    document.addEventListener("click", (e) => {
      if (!document.body.classList.contains("filter-open")) return;
      const clickedInsideSidebar = elements.sidebar && elements.sidebar.contains(e.target);
      const clickedOnToggleButton = elements.filterToggleBtn && elements.filterToggleBtn.contains(e.target);
      if (clickedInsideSidebar || clickedOnToggleButton) return;
      document.body.classList.remove("filter-open");
    });

    if (elements.searchBox) {
      // limit input length for ReDoS protection
      elements.searchBox.setAttribute('maxlength', String(MAX_KEYWORD_LENGTH));
      elements.searchBox.addEventListener("input", debouncedApply);
    }

    ['change', 'click'].forEach(evt => {
      if (elements.sectionSelect) elements.sectionSelect.addEventListener(evt, () => applyFilters(true));
      if (elements.yearSelect) elements.yearSelect.addEventListener(evt, () => applyFilters(true));
      if (elements.sortSelect) elements.sortSelect.addEventListener(evt, () => applyFilters(true));
      if (elements.showBookmarksOnlyCheck) elements.showBookmarksOnlyCheck.addEventListener(evt, () => applyFilters(true));
    });

    if (elements.tagsWrap) elements.tagsWrap.addEventListener("change", (e) => { if (e.target && e.target.name === "tags") applyFilters(true); });

    if (elements.clearFiltersBtn) {
      elements.clearFiltersBtn.addEventListener("click", () => {
        if (elements.searchBox) elements.searchBox.value = "";
        if (elements.sectionSelect) elements.sectionSelect.value = "";
        if (elements.yearSelect) elements.yearSelect.value = "";
        if (elements.sortSelect) elements.sortSelect.value = "relevance";
        if (elements.showBookmarksOnlyCheck) elements.showBookmarksOnlyCheck.checked = false;
        $$('input[name="tags"]').forEach(cb => cb.checked = false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        applyFilters(true);
      });
    }

    if (elements.resultsWrap) {
      elements.resultsWrap.addEventListener("click", (e) => handleCardClick(e, elements.resultsWrap));
      elements.resultsWrap.addEventListener("keydown", (e) => {
        const hdr = e.target.closest(".card-header");
        if (!hdr) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          hdr.click();
        }
      });
    }
    if (elements.bookmarksWrap) elements.bookmarksWrap.addEventListener("click", (e) => handleCardClick(e, elements.bookmarksWrap));
  };

  // ----------------------------
  // Highlight card from URL (safe integer parsing)
  // ----------------------------
  const highlightCardFromURL = () => {
    try {
      const rawId = getQueryParam('id');
      if (!rawId) return;
      const id = parseInt(rawId, 20);
      if (!Number.isInteger(id)) return;
      const cards = document.querySelectorAll('.card');
      for (const cardEl of cards) {
        if (String(cardEl.dataset.id) === String(id)) {
          cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          openCardElement(cardEl);
          break;
        }
      }
    } catch (e) { console.warn(e); }
  };

  // ----------------------------
  // Lazy-load Fuse.js (try global -> dynamic import CDN -> fallback)
  // ----------------------------
  const initFuseIfAvailable = async () => {
    try {
      if (typeof Fuse !== 'undefined') {
        // global already present (e.g., included in HTML)
        FUSE = new Fuse(DATA, {
          keys: [
            { name: 'question', weight: 0.5 },
            { name: 'answer', weight: 0.3 },
            { name: 'tags', weight: 0.1 },
            { name: 'keywords', weight: 0.1 }
          ],
          includeScore: false,
          threshold: 0.3,
          minMatchCharLength: 2,
          ignoreLocation: true,
          useExtendedSearch: false
        });
        return;
      }
      // dynamic import (ESM) from CDN
      const mod = await import(/* webpackIgnore: true */ FUSE_CDN);
      const FuseModule = mod && (mod.default || mod.Fuse || mod);
      if (FuseModule) {
        FUSE = new FuseModule(DATA, {
          keys: [
            { name: 'question', weight: 0.5 },
            { name: 'answer', weight: 0.3 },
            { name: 'tags', weight: 0.1 },
            { name: 'keywords', weight: 0.1 }
          ],
          includeScore: false,
          threshold: 0.3,
          minMatchCharLength: 2,
          ignoreLocation: true,
          useExtendedSearch: false
        });
      } else {
        FUSE = null;
      }
    } catch (e) {
      console.warn("Could not initialize Fuse (dynamic):", e);
      FUSE = null;
    }
  };

  // ----------------------------
  // Fetch data.json with offline fallback (Cache API)
  // ----------------------------
  const fetchDataJson = async () => {
    try {
      // prefer network but fallback to cache if available
      const res = await fetch('./data.json', { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const raw = await res.json();
      return raw;
    } catch (err) {
      console.warn("Network fetch failed, trying Cache API...", err);
      // try cache
      try {
        const cache = await caches.open('app-cache');
        const cached = await cache.match('./data.json');
        if (cached) {
          const cachedJson = await cached.json();
          return cachedJson;
        }
      } catch (cacheErr) {
        console.warn("Cache fallback failed:", cacheErr);
      }
      throw err;
    }
  };

  // ----------------------------
  // Visitor counter (proxy-first, fallback optional)
  // ----------------------------
  (function visitorCounter() {
    const counterEl = elements.visitorCount;
    if (!counterEl) return;
    counterEl.textContent = "⏳ লোড হচ্ছে...";
    counterEl.title = "ভিজিটর সংখ্যা লোড হচ্ছে...";

    const attempt = async () => {
      try {
        // prefer proxy endpoint
        const res = await fetch(VISITOR_PROXY, { cache: "no-cache" });
        if (!res.ok) throw new Error("Network response was not ok");
        const data = await res.json();
        counterEl.textContent = ` ${data.value}`;
      } catch (err) {
        console.error("Visitor counter failed (proxy):", err);
        // fallback attempt: uncomment if you have a public script url
        // try { const fb = await fetch(FALLBACK_VISITOR_URL); const d = await fb.json(); counterEl.textContent = ` ${d.value}`; return; } catch(e){}
        counterEl.textContent = "👥 ভিজিটর সংখ্যা: লোড ব্যর্থ ❌";
      }
    };

    attempt();
  })();

  // ----------------------------
  // Initialization
  // ----------------------------
  async function init() {
    // theme
    document.body.classList.toggle("dark", theme === "dark");
    if (elements.themeToggle) elements.themeToggle.textContent = theme === "dark" ? "☀️ Light" : "🌙 Dark";

    // load data.json (with offline fallback)
    try {
      const raw = await fetchDataJson();
      const validated = validateDataArray(raw);
      DATA = validated.length ? validated : [];
      if (!DATA.length && elements.countDisplay) elements.countDisplay.innerText = "ডেটা খালি বা অকার্যকর।";
    } catch (err) {
      console.error("Could not load data:", err);
      if (elements.countDisplay) elements.countDisplay.innerText = "ডেটা লোড করতে ব্যর্থ। (data.json ফাইল আছে কি দেখুন)";
      DATA = [];
    }

    // init Fuse (lazy)
    if (Array.isArray(DATA) && DATA.length > 0) {
      await initFuseIfAvailable();
    }

    // populate filters safely
    try {
      const uniqueSections = Array.from(new Set(DATA.map(d => d.law_section))).filter(s => s).sort();
      const uniqueYears = Array.from(new Set(DATA.map(d => d.year).filter(Boolean))).sort((a, b) => b - a);
      const uniqueTags = Array.from(new Set(DATA.flatMap(d => d.tags))).filter(t => t).sort();

      if (elements.sectionSelect) {
        elements.sectionSelect.innerHTML = "";
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "সব ধারা";
        elements.sectionSelect.appendChild(defaultOpt);
        for (const s of uniqueSections) {
          const opt = document.createElement("option");
          opt.value = s;
          opt.textContent = s;
          elements.sectionSelect.appendChild(opt);
        }
      }

      if (elements.yearSelect) {
        elements.yearSelect.innerHTML = "";
        const defaultOpt = document.createElement("option");
        defaultOpt.value = "";
        defaultOpt.textContent = "সব সাল";
        elements.yearSelect.appendChild(defaultOpt);
        for (const y of uniqueYears) {
          const opt = document.createElement("option");
          opt.value = y;
          opt.textContent = y;
          elements.yearSelect.appendChild(opt);
        }
      }

      if (elements.tagsWrap) {
        elements.tagsWrap.innerHTML = "";
        for (const tag of uniqueTags) {
          const label = document.createElement("label");
          label.className = "tag";
          const cb = document.createElement("input");
          cb.type = "checkbox";
          cb.name = "tags";
          cb.value = tag;
          // single-select behavior
          cb.addEventListener('change', (e) => {
            try {
              e.stopPropagation();
              if (cb.checked) {
                const others = Array.from(elements.tagsWrap.querySelectorAll('input[name="tags"]'));
                others.forEach(other => {
                  if (other !== cb) other.checked = false;
                });
              }
            } catch (err) {
              console.warn("Tag single-select handler error:", err);
            } finally {
              applyFilters(true);
            }
          });
          const span = document.createElement("span");
          span.textContent = tag;
          label.appendChild(cb);
          label.appendChild(document.createTextNode(" "));
          label.appendChild(span);
          elements.tagsWrap.appendChild(label);
        }
      }
    } catch (e) {
      console.warn("Could not render filter panel:", e);
    }

    setupEventListeners();
    manageControlPlacement();
    applyFilters(true);
    renderBookmarks();
    setTimeout(highlightCardFromURL, 200);

    // register service worker if present (enhancement: SW should cache data.json)
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register('./sw.js')
        .then(registration => console.log('Service Worker registered with scope:', registration.scope))
        .catch(error => console.error('Service Worker registration failed:', error));
    }
  }

  init();
});

