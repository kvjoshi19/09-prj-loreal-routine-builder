let allProducts = [];
const productsContainer = document.getElementById("productsContainer");
const categoryFilter = document.getElementById("categoryFilter");
const chatForm = document.getElementById("chatForm");
const chatWindow = document.getElementById("chatWindow");
const userInput = document.getElementById("userInput");

// Add at the top — config and state
const WORKER_URL = "https://loreal-routine.kvjoshi.workers.dev";
let selectedIds = new Set();
let conversationHistory = [];

// Replace loadProducts to also restore localStorage after products load
async function loadProducts() {
  const response = await fetch("products.json");
  const data = await response.json();
  return data.products;
}

// Replace displayProducts to support selection state and info button
function displayProducts(products) {
  productsContainer.innerHTML = products
    .map((p, i) => {
      const isSelected = selectedIds.has(p.id);
      return `
        <div class="product-card${isSelected ? " selected" : ""}" data-id="${p.id}">
          <div class="card-select-icon"><i class="fa-solid fa-check"></i></div>
          <img src="${p.image}" alt="${p.name}">
          <div class="product-info">
            <h3>${p.brand}</h3>
            <p>${p.name}</p>
            <button class="card-info-btn" data-id="${p.id}"><i class="fa-solid fa-circle-info"></i></button>
          </div>
        </div>`;
    })
    .join("");

  productsContainer.querySelectorAll(".product-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".card-info-btn")) return;
      toggleProduct(parseInt(card.dataset.id));
    });
  });

  productsContainer.querySelectorAll(".card-info-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openModal(parseInt(btn.dataset.id));
    });
  });
}

// Add — toggle selection
function toggleProduct(id) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  saveSelectionToStorage();
  refreshCardState(id);
  renderSelectedPanel();
}

function refreshCardState(id) {
  const card = productsContainer.querySelector(`.product-card[data-id="${id}"]`);
  if (!card) return;
  card.classList.toggle("selected", selectedIds.has(id));
}

// Add — selected panel
function renderSelectedPanel() {
  const count = selectedIds.size;
  document.getElementById("selectedCount").textContent = count;
  document.getElementById("generateRoutine").disabled = count === 0;

  if (count === 0) {
    document.getElementById("selectedProductsList").innerHTML =
      `<p class="empty-hint">Click products above to add them to your routine</p>`;
    return;
  }

  const chips = [...selectedIds].map((id) => {
    const p = allProducts.find((x) => x.id === id);
    if (!p) return "";
    return `
      <div class="selected-chip">
        <img src="${p.image}" alt="${p.name}" />
        <span>${p.name}</span>
        <button class="chip-remove" data-id="${p.id}"><i class="fa-solid fa-xmark"></i></button>
      </div>`;
  }).join("");

  document.getElementById("selectedProductsList").innerHTML = chips;

  document.querySelectorAll(".chip-remove").forEach((btn) => {
    btn.addEventListener("click", () => toggleProduct(parseInt(btn.dataset.id)));
  });
}

// Add — localStorage
function saveSelectionToStorage() {
  localStorage.setItem("loreal_selected", JSON.stringify([...selectedIds]));
}

function loadSelectionFromStorage() {
  try {
    const saved = localStorage.getItem("loreal_selected");
    if (saved) {
      const ids = JSON.parse(saved);
      const validIds = new Set(allProducts.map((p) => p.id));
      ids.forEach((id) => { if (validIds.has(id)) selectedIds.add(id); });
    }
  } catch (e) {}
}

// Add — modal
const descModal = document.getElementById("descModal");
const modalContent = document.getElementById("modalContent");
document.getElementById("modalClose").addEventListener("click", closeModal);
descModal.addEventListener("click", (e) => { if (e.target === descModal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

function openModal(id) {
  const p = allProducts.find((x) => x.id === id);
  if (!p) return;
  const isSelected = selectedIds.has(id);
  modalContent.innerHTML = `
    <div class="modal-brand">${p.brand}</div>
    <div class="modal-name">${p.name}</div>
    <div class="modal-cat">${p.category}</div>
    <div class="modal-img"><img src="${p.image}" alt="${p.name}" /></div>
    <p class="modal-desc">${p.description}</p>
    <div class="modal-actions">
      <button class="modal-select-btn${isSelected ? " deselect" : ""}" id="modalSelectBtn">
        ${isSelected ? "Remove from Routine" : "Add to Routine"}
      </button>
    </div>`;
  document.getElementById("modalSelectBtn").addEventListener("click", () => {
    toggleProduct(id);
    closeModal();
  });
  descModal.classList.add("open");
}

function closeModal() {
  descModal.classList.remove("open");
}

// Add — clear all
document.getElementById("clearAllBtn").addEventListener("click", () => {
  selectedIds.clear();
  saveSelectionToStorage();
  renderSelectedPanel();
  productsContainer.querySelectorAll(".product-card.selected").forEach((c) => c.classList.remove("selected"));
});

// Replace the category change listener to also restore selection on init
categoryFilter.addEventListener("change", async (e) => {
  const products = await loadProducts();
  const filtered = products.filter((p) => p.category === e.target.value);
  displayProducts(filtered);
});

// Replace the chat form submit
chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = "";
  appendMessage("user", text);
  showTyping();
  conversationHistory.push({ role: "user", content: text });
  const reply = await callAI(conversationHistory);
  conversationHistory.push({ role: "assistant", content: reply });
  hideTyping();
  appendMessage("assistant", reply);
});

// Replace generate button
document.getElementById("generateRoutine").addEventListener("click", async () => {
  const selected = [...selectedIds].map((id) => allProducts.find((p) => p.id === id)).filter(Boolean);
  const productData = selected.map((p) => ({ brand: p.brand, name: p.name, category: p.category, description: p.description }));

  conversationHistory = [];
  appendMessage("user", `Generate a routine for my ${selected.length} selected product(s).`);
  showTyping();

  const userMsg = `Create a personalized beauty routine using: ${JSON.stringify(productData, null, 2)}`;
  conversationHistory.push({ role: "user", content: userMsg });
  const reply = await callAI(conversationHistory);
  conversationHistory.push({ role: "assistant", content: reply });
  hideTyping();
  appendMessage("assistant", reply);
});

// Add — API call, chat helpers
async function callAI(messages) {
  const system = `You are an expert L'Oréal beauty advisor. Only answer questions about skincare, haircare, makeup, fragrance, and beauty routines.`;
  const res = await fetch(WORKER_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini", messages: [{ role: "system", content: system }, ...messages] }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "Sorry, I couldn't get a response.";
}

function appendMessage(role, text) {
  chatWindow.querySelector(".placeholder-message")?.remove();
  const div = document.createElement("div");
  div.className = `chat-msg ${role}`;
  div.innerHTML = `<div class="chat-label">${role === "user" ? "You" : "Advisor"}</div><div class="chat-bubble">${text}</div>`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function showTyping() {
  const div = document.createElement("div");
  div.className = "chat-msg assistant";
  div.id = "typingWrap";
  div.innerHTML = `<div class="chat-label">Advisor</div><div class="typing-indicator"><span></span><span></span><span></span></div>`;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function hideTyping() {
  document.getElementById("typingWrap")?.remove();
}

// Update init to restore localStorage after products load
async function init() {
  allProducts = await loadProducts();
  loadSelectionFromStorage();
  renderSelectedPanel();
}

init();
