/* =========================================================
   ShopSphere QA Sandbox — app.js
   Vanilla JS SPA logic + Mock API + intentional QA bugs.
   See README.md "Known Issues (QA Reference)" for bug map.
   ========================================================= */

(function () {
  "use strict";

  /* ----------------------------------------------------
     MOCK API — simulated REST endpoints for QA practice
     ---------------------------------------------------- */
  const MockAPI = {
    // GET /api/products -> 200
    async getProducts() {
      try {
        const res = await fetch("products.json", { method: "GET" });
        if (!res.ok) {
          return { status: res.status, ok: false, data: null, error: "Failed to load products" };
        }
        const data = await res.json();
        return { status: 200, ok: true, data };
      } catch (err) {
        return { status: 500, ok: false, data: null, error: String(err) };
      }
    },

    // POST /api/login -> 200 | 400
    async login(username, password) {
      await delay(450);
      const users = MOCK_USERS;
      const found = users.find((u) => u.username === username);
      if (!found || found.password !== password) {
        return { status: 400, ok: false, data: null, error: "Invalid username or password" };
      }
      return { status: 200, ok: true, data: { username: found.username, role: found.role, token: "mock-jwt-" + btoa(username) } };
    },

    // POST /api/register -> 200 | 400
    async register(username, password) {
      await delay(450);
      if (!username || !password || password.length < 6) {
        return { status: 400, ok: false, data: null, error: "Username required and password must be 6+ characters" };
      }
      return { status: 200, ok: true, data: { username, role: "standard_user", token: "mock-jwt-" + btoa(username) } };
    },

    // GET /api/orders/:id -> 200 | 404
    async getOrder(orderId) {
      await delay(300);
      if (ORDER_HISTORY[orderId]) {
        return { status: 200, ok: true, data: ORDER_HISTORY[orderId] };
      }
      return { status: 404, ok: false, data: null, error: `Order ${orderId} not found` };
    },

    // POST /api/orders -> 200 | 400
    async submitOrder(payload) {
      await delay(600);
      if (!payload || !payload.items || payload.items.length === 0) {
        return { status: 400, ok: false, data: null, error: "Cart is empty" };
      }
      const orderId = "SS-" + Math.floor(100000 + Math.random() * 899999);
      ORDER_HISTORY[orderId] = { orderId, ...payload, createdAt: new Date().toISOString() };
      return { status: 200, ok: true, data: { orderId } };
    },
  };

  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  const MOCK_USERS = [
    { username: "standard_user", password: "password123", role: "standard" },
    { username: "problem_user", password: "password123", role: "problem" },
  ];

  const ORDER_HISTORY = {};

  /* ----------------------------------------------------
     STATE
     ---------------------------------------------------- */
  let products = [];
  let cart = loadJSON("ss_cart", []);
  let currentUser = loadJSON("ss_user", null);
  let activeCategory = "All";
  let searchTerm = "";
  let sortOrder = "featured";
  let currentProductId = null;
  let galleryIndex = 0;
  let appliedPromo = loadJSON("ss_promo", null); // { code, label }
  let checkoutStep = 1;
  let shippingData = loadJSON("ss_shipping", {});
  let lastOrder = null;

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  /* ----------------------------------------------------
     ANALYTICS SIMULATION (GA4-style)
     ---------------------------------------------------- */
  function trackEvent(eventName, params = {}) {
    const payload = { event: eventName, timestamp: Date.now(), ...params };
    console.log("%c[GA4 Event]", "color:#c08a4e;font-weight:bold;", eventName, payload);
    window.dispatchEvent(new CustomEvent("analytics", { detail: payload }));
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }

  /* ----------------------------------------------------
     UTILITIES
     ---------------------------------------------------- */
  function $(sel, ctx = document) { return ctx.querySelector(sel); }
  function $all(sel, ctx = document) { return Array.from(ctx.querySelectorAll(sel)); }
  function formatPrice(n) { return "$" + Number(n).toFixed(2); }
  function byId(id) { return products.find((p) => p.id === id); }

  function renderStars(rating) {
    const full = Math.floor(rating);
    const half = rating - full >= 0.5;
    let html = "";
    for (let i = 0; i < full; i++) html += '<i class="fa-solid fa-star star"></i>';
    if (half) html += '<i class="fa-solid fa-star-half-stroke star"></i>';
    for (let i = full + (half ? 1 : 0); i < 5; i++) html += '<i class="fa-regular fa-star star-empty"></i>';
    return html;
  }

  function showToast(message, type = "default") {
    const stack = $("#toast-stack");
    if (!stack) return;
    const colors = {
      default: "bg-ink text-white",
      success: "bg-emerald-600 text-white",
      error: "bg-red-600 text-white",
    };
    const el = document.createElement("div");
    el.className = `toast ${colors[type] || colors.default} px-4 py-3 rounded-lg shadow-lg text-sm font-medium max-w-xs`;
    el.setAttribute("data-testid", "toast-message");
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = "opacity .3s ease";
      el.style.opacity = "0";
      setTimeout(() => el.remove(), 300);
    }, 2600);
  }

  /* ----------------------------------------------------
     CART LOGIC
     ---------------------------------------------------- */
  function saveCart() {
    saveJSON("ss_cart", cart);
    updateCartCount();
  }

  function updateCartCount() {
    const count = cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = $("#cart-count");
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("hidden", count === 0);
      badge.classList.add("pulse-badge");
      setTimeout(() => badge.classList.remove("pulse-badge"), 400);
    }
  }

  function addToCart(productId, qty = 1) {
    const product = byId(productId);
    if (!product) return;
    const existing = cart.find((i) => i.id === productId);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({ id: productId, qty });
    }
    saveCart();
    trackEvent("add_to_cart", {
      currency: "USD",
      value: product.price * qty,
      items: [{ item_id: product.id, item_name: product.name, price: product.price, quantity: qty }],
    });
    showToast(`${product.name} added to cart`, "success");
    renderCartDrawer();
  }

  function removeFromCart(productId) {
    const item = cart.find((i) => i.id === productId);
    cart = cart.filter((i) => i.id !== productId);
    saveCart();
    renderCartDrawer();
    if (item) {
      const product = byId(productId);
      trackEvent("remove_from_cart", { item_id: productId, item_name: product ? product.name : productId });
    }
  }

  function changeCartQty(productId, delta) {
    const item = cart.find((i) => i.id === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      removeFromCart(productId);
      return;
    }
    saveCart();
    renderCartDrawer();
  }

  function calcSubtotal() {
    return cart.reduce((sum, item) => {
      const p = byId(item.id);
      return sum + (p ? p.price * item.qty : 0);
    }, 0);
  }

  /* =========================================================
     BUG #1 (Intentional — Promo Code Logic)
     "SAVE20" should always apply a flat 20% discount. However,
     for subtotals over $100 this tiered "bulk discount" branch
     mistakenly applies only 2% instead of 20%. Great candidate
     for a boundary-value-analysis bug report (test $99.99 vs
     $100.01 subtotals).
     ========================================================= */
  function calculateDiscount(code, subtotal) {
    const normalized = (code || "").trim().toUpperCase();
    if (normalized === "SAVE20") {
      if (subtotal > 100) {
        // Bulk-order discount tier
        return +(subtotal * 0.02).toFixed(2);
      }
      return +(subtotal * 0.2).toFixed(2);
    }
    if (normalized === "FREESHIP") {
      return 0;
    }
    return 0;
  }

  function getPromoLabel(code) {
    const normalized = (code || "").trim().toUpperCase();
    if (normalized === "SAVE20") return "SAVE20 — 20% off your order";
    if (normalized === "FREESHIP") return "FREESHIP — free standard shipping";
    return null;
  }

  function calculateTotals() {
    const subtotal = calcSubtotal();
    let discount = 0;
    let freeShipping = false;
    if (appliedPromo) {
      const normalized = appliedPromo.code.toUpperCase();
      if (normalized === "FREESHIP") freeShipping = true;
      discount = calculateDiscount(appliedPromo.code, subtotal);
    }
    const shipping = subtotal === 0 ? 0 : freeShipping ? 0 : 6.99;
    const taxable = Math.max(subtotal - discount, 0);
    const tax = +(taxable * 0.0825).toFixed(2);
    const total = +(taxable + shipping + tax).toFixed(2);
    return { subtotal, discount, shipping, tax, total };
  }

  function applyPromoCode() {
    const input = $("#input-promo-code");
    const msgEl = $("#promo-message");
    const code = input.value.trim();
    if (!code) {
      msgEl.textContent = "Please enter a promo code.";
      msgEl.className = "text-xs mt-2 field-error-msg";
      return;
    }
    const label = getPromoLabel(code);
    if (!label) {
      appliedPromo = null;
      saveJSON("ss_promo", null);
      msgEl.textContent = "Invalid or expired promo code.";
      msgEl.className = "text-xs mt-2 field-error-msg";
      trackEvent("select_promotion", { promotion_id: code, success: false });
      renderCartDrawer();
      return;
    }
    appliedPromo = { code: code.toUpperCase() };
    saveJSON("ss_promo", appliedPromo);
    msgEl.textContent = `Applied: ${label}`;
    msgEl.className = "text-xs mt-2 text-emerald-700 font-medium";
    trackEvent("select_promotion", { promotion_id: code.toUpperCase(), success: true });
    showToast("Promo code applied!", "success");
    renderCartDrawer();
  }

  function renderCartDrawer() {
    const itemsEl = $("#cart-items");
    const emptyEl = $("#cart-empty-state");
    if (!itemsEl) return;

    if (cart.length === 0) {
      itemsEl.innerHTML = "";
      emptyEl.classList.remove("hidden");
    } else {
      emptyEl.classList.add("hidden");
      itemsEl.innerHTML = cart
        .map((item) => {
          const p = byId(item.id);
          if (!p) return "";
          return `
          <div class="flex gap-3 py-4 border-b border-black/5" data-testid="cart-item-${p.id}">
            <img src="${p.images[0]}" alt="${p.name}" class="w-20 h-20 object-cover rounded-lg flex-shrink-0" />
            <div class="flex-1 min-w-0">
              <div class="flex justify-between gap-2">
                <h4 class="text-sm font-semibold truncate">${p.name}</h4>
                <button class="text-gray-400 hover:text-red-500 transition" data-action="remove-item" data-id="${p.id}" data-testid="btn-remove-item-${p.id}" aria-label="Remove item">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>
              <p class="text-xs text-gray-500 mt-0.5">${p.category}</p>
              <div class="flex items-center justify-between mt-2">
                <div class="flex items-center border border-gray-300 rounded-full">
                  <button class="w-7 h-7 text-sm" data-action="qty-decrease" data-id="${p.id}" data-testid="btn-cart-decrease-${p.id}">−</button>
                  <span class="w-6 text-center text-sm" data-testid="cart-qty-${p.id}">${item.qty}</span>
                  <button class="w-7 h-7 text-sm" data-action="qty-increase" data-id="${p.id}" data-testid="btn-cart-increase-${p.id}">+</button>
                </div>
                <span class="font-semibold text-sm" data-testid="cart-item-price-${p.id}">${formatPrice(p.price * item.qty)}</span>
              </div>
            </div>
          </div>`;
        })
        .join("");
    }

    const totals = calculateTotals();
    $("#cart-subtotal").textContent = formatPrice(totals.subtotal);
    $("#cart-discount").textContent = totals.discount > 0 ? "-" + formatPrice(totals.discount) : formatPrice(0);
    $("#cart-shipping").textContent = totals.subtotal === 0 ? "$0.00" : formatPrice(totals.shipping);
    $("#cart-tax").textContent = formatPrice(totals.tax);
    $("#cart-total").textContent = formatPrice(totals.total);

    const checkoutBtn = $("#cart-checkout-btn");
    checkoutBtn.disabled = cart.length === 0;
    checkoutBtn.classList.toggle("opacity-50", cart.length === 0);
    checkoutBtn.classList.toggle("cursor-not-allowed", cart.length === 0);

    if (appliedPromo) {
      const label = getPromoLabel(appliedPromo.code);
      $("#promo-message").textContent = label ? `Applied: ${label}` : "";
      $("#promo-message").className = "text-xs mt-2 text-emerald-700 font-medium";
      $("#input-promo-code").value = appliedPromo.code;
    }

    updateCartCount();
  }

  function openCart() {
    renderCartDrawer();
    $("#cart-overlay").classList.remove("hidden");
    $("#cart-drawer").classList.remove("hidden");
    $("#cart-drawer").classList.remove("cart-drawer-exit");
    $("#cart-drawer").classList.add("cart-drawer-enter");
    document.body.classList.add("overflow-hidden");
  }

  function closeCart() {
    const drawer = $("#cart-drawer");
    drawer.classList.remove("cart-drawer-enter");
    drawer.classList.add("cart-drawer-exit");
    setTimeout(() => {
      $("#cart-overlay").classList.add("hidden");
      drawer.classList.add("hidden");
      document.body.classList.remove("overflow-hidden");
    }, 280);
  }

  /* ----------------------------------------------------
     PRODUCT CATALOG / GRID
     ---------------------------------------------------- */
  function getCategories() {
    return ["All", ...Array.from(new Set(products.map((p) => p.category)))];
  }

  function renderCategoryPills() {
    const container = $("#category-pills");
    if (!container) return;
    container.innerHTML = getCategories()
      .map(
        (cat) => `
      <button class="category-pill ${cat === activeCategory ? "active" : ""} px-4 py-1.5 rounded-full border border-gray-300 text-sm font-medium transition whitespace-nowrap"
        data-category="${cat}" data-testid="filter-category-${cat.toLowerCase()}">${cat}</button>`
      )
      .join("");
  }

  function filterAndSortProducts() {
    let list = products.slice();
    if (activeCategory !== "All") {
      list = list.filter((p) => p.category === activeCategory);
    }
    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    }
    switch (sortOrder) {
      case "price-asc":
        list.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        list.sort((a, b) => b.price - a.price);
        break;
      case "rating":
        list.sort((a, b) => b.rating - a.rating);
        break;
      case "name":
        list.sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        break;
    }
    return list;
  }

  function renderProductGrid() {
    const grid = $("#product-grid");
    if (!grid) return;
    const list = filterAndSortProducts();
    $("#results-count").textContent = `${list.length} product${list.length !== 1 ? "s" : ""}`;

    if (list.length === 0) {
      grid.innerHTML = `<div class="col-span-full text-center py-16 text-gray-500" data-testid="empty-results">
        <i class="fa-solid fa-magnifying-glass text-3xl mb-3"></i>
        <p>No products match your search or filters.</p>
      </div>`;
      return;
    }

    grid.innerHTML = list
      .map(
        (p) => `
      <div class="product-card bg-white rounded-2xl overflow-hidden shadow-sm border border-black/5 animate-fade-in" data-testid="card-product-${p.id}">
        <div class="relative overflow-hidden aspect-square cursor-pointer" data-action="view-product" data-id="${p.id}">
          <img src="${p.images[0]}" alt="${p.name}" class="w-full h-full object-cover" loading="lazy" />
          ${p.badge ? `<span class="absolute top-3 left-3 bg-ink text-white text-[11px] uppercase tracking-wide px-2.5 py-1 rounded-full">${p.badge}</span>` : ""}
        </div>
        <div class="p-4">
          <p class="text-[11px] uppercase tracking-wide text-gray-400 mb-1">${p.category}</p>
          <h3 class="font-semibold text-sm leading-snug mb-1 cursor-pointer hover:underline" data-action="view-product" data-id="${p.id}">${p.name}</h3>
          <div class="flex items-center gap-1 text-xs mb-2">${renderStars(p.rating)}<span class="text-gray-400 ml-1">(${p.rating})</span></div>
          <div class="flex items-center justify-between mt-3">
            <span class="font-bold text-base" data-testid="price-${p.id}">${formatPrice(p.price)}</span>
            <button class="btn-accent text-xs font-semibold px-3 py-2 rounded-full" data-action="add-to-cart" data-id="${p.id}" data-testid="btn-add-to-cart-${p.id}">
              <i class="fa-solid fa-plus mr-1"></i>Add
            </button>
          </div>
        </div>
      </div>`
      )
      .join("");
  }

  function renderFeaturedCollections() {
    const container = $("#featured-collections");
    if (!container) return;
    const featured = products.slice(0, 4);
    container.innerHTML = featured
      .map(
        (p) => `
      <div class="group cursor-pointer" data-action="view-product" data-id="${p.id}" data-testid="featured-${p.id}">
        <div class="overflow-hidden rounded-2xl aspect-[4/5] mb-3">
          <img src="${p.images[0]}" alt="${p.name}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" />
        </div>
        <h3 class="font-semibold text-sm">${p.name}</h3>
        <p class="text-gray-500 text-sm">${formatPrice(p.price)}</p>
      </div>`
      )
      .join("");
  }

  /* ----------------------------------------------------
     PRODUCT DETAIL MODAL
     ---------------------------------------------------- */
  function openProductModal(productId) {
    const p = byId(productId);
    if (!p) return;
    currentProductId = productId;
    galleryIndex = 0;

    $("#modal-product-title").textContent = p.name;
    $("#modal-product-category").textContent = p.category;
    $("#modal-product-price").textContent = formatPrice(p.price);
    $("#modal-product-desc").textContent = p.description;
    $("#modal-product-rating").innerHTML = renderStars(p.rating) + `<span class="text-gray-400 text-xs ml-1">(${p.reviews.length} reviews)</span>`;
    $("#modal-product-stock").textContent = p.stock > 0 ? `${p.stock} in stock` : "Out of stock";
    $("#input-quantity").value = 1;

    renderGallery(p);

    $("#modal-reviews").innerHTML = p.reviews
      .map(
        (r) => `
      <div class="border-b border-black/5 py-3" data-testid="review-item">
        <div class="flex items-center justify-between">
          <span class="font-semibold text-sm">${r.author}</span>
          <span class="text-xs">${renderStars(r.rating)}</span>
        </div>
        <p class="text-sm font-medium mt-1">${r.title}</p>
        <p class="text-sm text-gray-500 mt-1">${r.body}</p>
      </div>`
      )
      .join("");

    $("#modal-add-to-cart").setAttribute("data-id", p.id);
    $("#modal-product").classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    trackEvent("view_item", { item_id: p.id, item_name: p.name, price: p.price });
  }

  function renderGallery(p) {
    $("#modal-gallery-main").src = p.images[galleryIndex];
    $("#modal-gallery-thumbs").innerHTML = p.images
      .map(
        (img, i) => `<img src="${img}" class="thumb-img w-16 h-16 object-cover rounded-lg ${i === galleryIndex ? "active" : ""}" data-index="${i}" data-testid="thumb-${i}" />`
      )
      .join("");
  }

  function closeProductModal() {
    $("#modal-product").classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
    currentProductId = null;
  }

  /* ----------------------------------------------------
     AUTH
     ---------------------------------------------------- */
  function openAuthModal(tab = "login") {
    $("#modal-auth").classList.remove("hidden");
    document.body.classList.add("overflow-hidden");
    switchAuthTab(tab);
    $("#alert-login-error").classList.add("hidden");
    $("#alert-register-error").classList.add("hidden");
  }
  function closeAuthModal() {
    $("#modal-auth").classList.add("hidden");
    document.body.classList.remove("overflow-hidden");
  }
  function switchAuthTab(tab) {
    const isLogin = tab === "login";
    $("#tab-login").classList.toggle("border-ink", isLogin);
    $("#tab-login").classList.toggle("text-ink", isLogin);
    $("#tab-login").classList.toggle("border-transparent", !isLogin);
    $("#tab-login").classList.toggle("text-gray-400", !isLogin);
    $("#tab-register").classList.toggle("border-ink", !isLogin);
    $("#tab-register").classList.toggle("text-ink", !isLogin);
    $("#tab-register").classList.toggle("border-transparent", isLogin);
    $("#tab-register").classList.toggle("text-gray-400", isLogin);
    $("#form-login").classList.toggle("hidden", !isLogin);
    $("#form-register").classList.toggle("hidden", isLogin);
  }

  async function handleLogin(e) {
    e.preventDefault();
    const username = $("#input-username").value.trim();
    const password = $("#input-password").value;
    const errorEl = $("#alert-login-error");
    const btn = $("#btn-login-submit");
    btn.disabled = true;
    btn.textContent = "Signing in...";
    const result = await MockAPI.login(username, password);
    btn.disabled = false;
    btn.textContent = "Sign In";

    if (!result.ok) {
      errorEl.textContent = result.error + ` (HTTP ${result.status})`;
      errorEl.classList.remove("hidden");
      trackEvent("login_failed", { status: result.status });
      return;
    }
    currentUser = result.data;
    saveJSON("ss_user", currentUser);
    updateAccountUI();
    closeAuthModal();
    showToast(`Welcome back, ${currentUser.username}!`, "success");
    trackEvent("login", { method: "mock", username: currentUser.username });
  }

  async function handleRegister(e) {
    e.preventDefault();
    const username = $("#input-register-username").value.trim();
    const password = $("#input-register-password").value;
    const errorEl = $("#alert-register-error");
    const result = await MockAPI.register(username, password);
    if (!result.ok) {
      errorEl.textContent = result.error + ` (HTTP ${result.status})`;
      errorEl.classList.remove("hidden");
      return;
    }
    currentUser = result.data;
    saveJSON("ss_user", currentUser);
    updateAccountUI();
    closeAuthModal();
    showToast(`Account created. Welcome, ${currentUser.username}!`, "success");
    trackEvent("sign_up", { method: "mock", username: currentUser.username });
  }

  function logout() {
    currentUser = null;
    localStorage.removeItem("ss_user");
    updateAccountUI();
    showToast("You have been signed out.");
    trackEvent("logout");
  }

  function updateAccountUI() {
    const label = $("#account-label");
    if (currentUser) {
      label.textContent = currentUser.username;
      $("#btn-logout").classList.remove("hidden");
    } else {
      label.textContent = "Account";
      $("#btn-logout").classList.add("hidden");
    }
  }

  /* ----------------------------------------------------
     VIEW NAVIGATION
     ---------------------------------------------------- */
  function showView(viewName) {
    $all(".app-view").forEach((v) => v.classList.add("hidden"));
    $(`#view-${viewName}`).classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    $all("[data-nav]").forEach((n) => n.classList.remove("text-ink", "font-semibold"));
    const navBtn = $(`[data-nav="${viewName}"]`);
    if (navBtn) navBtn.classList.add("text-ink", "font-semibold");
  }

  /* ----------------------------------------------------
     CHECKOUT FLOW
     ---------------------------------------------------- */
  function startCheckout() {
    if (cart.length === 0) {
      showToast("Your cart is empty.", "error");
      return;
    }
    closeCart();
    checkoutStep = 1;
    showView("checkout");
    renderCheckoutStep();
    renderOrderSummary();
  }

  function renderOrderSummary() {
    const totals = calculateTotals();
    const el = $("#checkout-summary-items");
    el.innerHTML = cart
      .map((item) => {
        const p = byId(item.id);
        return `<div class="flex justify-between text-sm py-1.5">
          <span class="text-gray-600">${p.name} × ${item.qty}</span>
          <span class="font-medium">${formatPrice(p.price * item.qty)}</span>
        </div>`;
      })
      .join("");
    $("#checkout-summary-subtotal").textContent = formatPrice(totals.subtotal);
    $("#checkout-summary-discount").textContent = totals.discount > 0 ? "-" + formatPrice(totals.discount) : formatPrice(0);
    $("#checkout-summary-shipping").textContent = formatPrice(totals.shipping);
    $("#checkout-summary-tax").textContent = formatPrice(totals.tax);
    $("#checkout-summary-total").textContent = formatPrice(totals.total);
  }

  function renderCheckoutStep() {
    [1, 2, 3].forEach((n) => {
      const circle = $(`#step-circle-${n}`);
      circle.classList.remove("active", "done");
      if (n < checkoutStep) circle.classList.add("done");
      if (n === checkoutStep) circle.classList.add("active");
    });
    $("#checkout-step-1").classList.toggle("hidden", checkoutStep !== 1);
    $("#checkout-step-2").classList.toggle("hidden", checkoutStep !== 2);
    $("#checkout-step-3").classList.toggle("hidden", checkoutStep !== 3);
  }

  /* =========================================================
     BUG #3 (Intentional — ZIP Validation)
     isValidZip only checks string length (5-10 chars) and never
     verifies the characters are numeric/alphanumeric, so values
     like "@#$%^" or "!!!!!" pass validation silently.
     ========================================================= */
  function isValidZip(value) {
    const trimmed = (value || "").trim();
    return trimmed.length >= 5 && trimmed.length <= 10; // BUG: no character/format check
  }

  function validateShippingForm() {
    let valid = true;
    const fields = [
      { id: "input-fullname", msg: "Full name is required.", test: (v) => v.trim().length >= 2 },
      { id: "input-address", msg: "Street address is required.", test: (v) => v.trim().length >= 4 },
      { id: "input-city", msg: "City is required.", test: (v) => v.trim().length >= 2 },
      { id: "input-state", msg: "State / Province is required.", test: (v) => v.trim().length >= 2 },
      { id: "input-zip", msg: "Enter a valid ZIP / postal code.", test: isValidZip },
      { id: "input-country", msg: "Please select a country.", test: (v) => v.trim().length > 0 },
      { id: "input-phone", msg: "Enter a valid phone number.", test: (v) => /^[0-9+()\-\s]{7,}$/.test(v.trim()) },
    ];

    fields.forEach((f) => {
      const input = document.getElementById(f.id);
      const errorEl = document.getElementById(f.id + "-error");
      const ok = f.test(input.value);
      input.classList.toggle("field-error", !ok);
      if (errorEl) errorEl.classList.toggle("hidden", ok);
      if (!ok) valid = false;
    });
    return valid;
  }

  function handleShippingSubmit(e) {
    e.preventDefault();
    if (!validateShippingForm()) {
      showToast("Please fix the highlighted fields.", "error");
      return;
    }
    shippingData = {
      fullName: $("#input-fullname").value.trim(),
      address: $("#input-address").value.trim(),
      city: $("#input-city").value.trim(),
      state: $("#input-state").value.trim(),
      zip: $("#input-zip").value.trim(),
      country: $("#input-country").value,
      phone: $("#input-phone").value.trim(),
    };
    saveJSON("ss_shipping", shippingData);
    checkoutStep = 2;
    renderCheckoutStep();
    trackEvent("add_shipping_info", { shipping_tier: "standard" });
  }

  function validatePaymentForm() {
    let valid = true;
    const fields = [
      { id: "input-card-name", test: (v) => v.trim().length >= 2 },
      { id: "input-card-number", test: (v) => /^[0-9\s]{13,19}$/.test(v.trim()) },
      { id: "input-card-expiry", test: (v) => /^(0[1-9]|1[0-2])\/\d{2}$/.test(v.trim()) },
      { id: "input-card-cvv", test: (v) => /^[0-9]{3,4}$/.test(v.trim()) },
    ];
    fields.forEach((f) => {
      const input = document.getElementById(f.id);
      const errorEl = document.getElementById(f.id + "-error");
      const ok = f.test(input.value);
      input.classList.toggle("field-error", !ok);
      if (errorEl) errorEl.classList.toggle("hidden", ok);
      if (!ok) valid = false;
    });
    return valid;
  }

  async function handlePaymentSubmit(e) {
    e.preventDefault();
    if (!validatePaymentForm()) {
      showToast("Please correct the payment details.", "error");
      return;
    }
    const btn = $("#btn-place-order");
    btn.disabled = true;
    btn.textContent = "Processing...";

    const totals = calculateTotals();
    const payload = {
      items: cart.map((i) => ({ id: i.id, qty: i.qty })),
      shipping: shippingData,
      totals,
      user: currentUser ? currentUser.username : "guest",
    };
    const result = await MockAPI.submitOrder(payload);
    btn.disabled = false;
    btn.textContent = "Place Order";

    if (!result.ok) {
      showToast(result.error || "Payment failed. Please try again.", "error");
      return;
    }

    lastOrder = { ...payload, orderId: result.data.orderId };
    trackEvent("purchase", {
      transaction_id: lastOrder.orderId,
      currency: "USD",
      value: totals.total,
      items: cart.map((i) => {
        const p = byId(i.id);
        return { item_id: p.id, item_name: p.name, price: p.price, quantity: i.qty };
      }),
    });

    $("#confirmation-order-id").textContent = lastOrder.orderId;
    $("#confirmation-total").textContent = formatPrice(totals.total);
    $("#confirmation-email").textContent = shippingData.fullName || "guest";
    checkoutStep = 3;
    renderCheckoutStep();

    // Clear cart after successful order
    cart = [];
    appliedPromo = null;
    saveCart();
    saveJSON("ss_promo", null);
  }

  /* =========================================================
     BUG #4 (Intentional — problem_user checkout crash)
     When the logged-in user is "problem_user", the Finish button
     fetches a non-existent static page (/checkout-complete.html)
     without a .catch() handler, producing an unhandled promise
     rejection / 404 visible in DevTools console & Network tab —
     a great scenario for console-error assertions in Cypress/
     Playwright E2E suites.
     ========================================================= */
  function handleFinishOrder() {
    if (currentUser && currentUser.username === "problem_user") {
      fetch("/checkout-complete.html").then((res) => {
        if (!res.ok) {
          throw new Error(`Unhandled error: GET /checkout-complete.html responded ${res.status}`);
        }
        return res.text();
      });
      // Intentionally no .catch() — rejection surfaces as unhandled in console.
      return;
    }
    resetAfterOrder();
  }

  function resetAfterOrder() {
    checkoutStep = 1;
    shippingData = {};
    showView("home");
    showToast("Thank you for shopping with ShopSphere!", "success");
  }

  /* ----------------------------------------------------
     EVENT WIRING
     ---------------------------------------------------- */
  function wireEvents() {
    // Nav
    $all("[data-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const view = btn.getAttribute("data-nav");
        showView(view);
        if (view === "shop") renderProductGrid();
      });
    });

    $("#btn-shop-now").addEventListener("click", () => {
      showView("shop");
      renderProductGrid();
    });

    // Cart drawer open/close
    $("#btn-cart-toggle").addEventListener("click", openCart);
    $("#btn-close-cart").addEventListener("click", closeCart);
    $("#cart-overlay").addEventListener("click", closeCart);

    // Cart item actions (delegated)
    $("#cart-items").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (btn.dataset.action === "remove-item") removeFromCart(id);
      if (btn.dataset.action === "qty-increase") changeCartQty(id, 1);
      if (btn.dataset.action === "qty-decrease") changeCartQty(id, -1);
    });

    // Promo
    $("#btn-apply-promo").addEventListener("click", applyPromoCode);

    // Checkout button in drawer
    $("#cart-checkout-btn").addEventListener("click", startCheckout);

    // Product grid delegated actions
    $("#product-grid").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-action]");
      if (!btn) return;
      const id = btn.getAttribute("data-id");
      if (btn.dataset.action === "add-to-cart") addToCart(id, 1);
      if (btn.dataset.action === "view-product") openProductModal(id);
    });
    $("#featured-collections").addEventListener("click", (e) => {
      const el = e.target.closest("[data-action='view-product']");
      if (el) openProductModal(el.getAttribute("data-id"));
    });

    // Filters
    $("#category-pills").addEventListener("click", (e) => {
      const btn = e.target.closest("[data-category]");
      if (!btn) return;
      activeCategory = btn.getAttribute("data-category");
      renderCategoryPills();
      renderProductGrid();
    });
    $("#input-search").addEventListener("input", (e) => {
      searchTerm = e.target.value;
      renderProductGrid();
    });
    const mobileSearch = $("#input-search-mobile");
    if (mobileSearch) {
      mobileSearch.addEventListener("input", (e) => {
        searchTerm = e.target.value;
        $("#input-search").value = e.target.value;
        showView("shop");
        renderProductGrid();
      });
    }
    $("#select-sort").addEventListener("change", (e) => {
      sortOrder = e.target.value;
      renderProductGrid();
    });

    // Product modal
    $("#btn-close-modal").addEventListener("click", closeProductModal);
    $("#modal-product").addEventListener("click", (e) => {
      if (e.target.id === "modal-product") closeProductModal();
    });
    $("#modal-gallery-thumbs").addEventListener("click", (e) => {
      const thumb = e.target.closest("[data-index]");
      if (!thumb) return;
      galleryIndex = Number(thumb.getAttribute("data-index"));
      renderGallery(byId(currentProductId));
    });
    $("#btn-qty-increase").addEventListener("click", () => {
      const input = $("#input-quantity");
      input.value = Math.min(99, Number(input.value) + 1);
    });
    $("#btn-qty-decrease").addEventListener("click", () => {
      const input = $("#input-quantity");
      input.value = Math.max(1, Number(input.value) - 1);
    });
    $("#modal-add-to-cart").addEventListener("click", () => {
      const qty = Math.max(1, Number($("#input-quantity").value) || 1);
      addToCart(currentProductId, qty);
      closeProductModal();
    });

    // Auth modal
    $("#btn-account").addEventListener("click", () => {
      if (currentUser) {
        showToast(`Signed in as ${currentUser.username}. Use "Sign out" to switch accounts.`);
      } else {
        openAuthModal("login");
      }
    });
    $("#btn-close-auth").addEventListener("click", closeAuthModal);
    $("#modal-auth").addEventListener("click", (e) => {
      if (e.target.id === "modal-auth") closeAuthModal();
    });
    $("#tab-login").addEventListener("click", () => switchAuthTab("login"));
    $("#tab-register").addEventListener("click", () => switchAuthTab("register"));
    $("#form-login").addEventListener("submit", handleLogin);
    $("#form-register").addEventListener("submit", handleRegister);
    $("#btn-logout").addEventListener("click", logout);

    // Checkout steps
    $("#form-shipping").addEventListener("submit", handleShippingSubmit);
    $("#btn-back-to-shipping").addEventListener("click", () => {
      checkoutStep = 1;
      renderCheckoutStep();
    });
    $("#form-payment").addEventListener("submit", handlePaymentSubmit);
    $("#btn-finish").addEventListener("click", handleFinishOrder);
    $("#btn-continue-shopping").addEventListener("click", () => {
      showView("shop");
      renderProductGrid();
    });

    // Mobile bottom nav
    $all("[data-mobile-nav]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-mobile-nav");
        if (action === "cart") openCart();
        else {
          showView(action);
          if (action === "shop") renderProductGrid();
        }
      });
    });
    const mobileAccountBtn = $("#btn-mobile-account");
    if (mobileAccountBtn) {
      mobileAccountBtn.addEventListener("click", () => openAuthModal("login"));
    }

    // Autofill demo credentials quick-fill buttons
    $all("[data-fill-user]").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("#input-username").value = btn.getAttribute("data-fill-user");
        $("#input-password").value = "password123";
      });
    });

    window.addEventListener("analytics", (e) => {
      // Hook point for QA to assert on window 'analytics' CustomEvent in Playwright/Cypress
    });
  }

  /* ----------------------------------------------------
     INIT
     ---------------------------------------------------- */
  async function init() {
    wireEvents();
    updateAccountUI();
    updateCartCount();

    const result = await MockAPI.getProducts();
    if (result.ok) {
      products = result.data;
    } else {
      showToast("Could not load products (mock API error).", "error");
      products = [];
    }
    renderFeaturedCollections();
    renderCategoryPills();
    renderProductGrid();
    renderCartDrawer();
    showView("home");

    // expose for console / E2E debugging
    window.ShopSphere = { MockAPI, getState: () => ({ cart, currentUser, appliedPromo, products }) };
  }

  document.addEventListener("DOMContentLoaded", init);
})();
