const defaultData = {
  botName: "Zirve Ticket",
  panelTitle: "Zirve Group Support Center",
  panelSubtitle: "Advanced Ticket Administration",
  panelDescription: "Taleplerin hızlı, düzenli ve profesyonel değerlendirilmesi için uygun departmanı seçin.",
  logChannelId: "1395722793915519026",
  transcriptChannelId: "1395722793915519026",
  defaultSupportRoleId: "",
  archiveCategoryId: "",
  blacklistRoleId: "",
  maxTicketsPerUser: 2,
  transcriptEnabled: true,
  claimEnabled: true,
  blacklistEnabled: true,
  renameEnabled: true,
  addRemoveEnabled: true,
  satisfactionEnabled: true,
  multiLanguage: true,
  closeReasonEnabled: true,
  autoCloseInactive: true,
  dmNotifications: true,
  requireCategoryChoice: true,
  showTicketNumber: true,
  autoTagSupport: true,
  antiSpamEnabled: true,
  backupEnabled: true,
  categories: [
    {
      key: "hr",
      name: "İnsan Kaynakları",
      english: "Human Resources",
      emoji: "👥",
      categoryId: "1395796764493090846",
      supportRole: "",
      logChannel: "1395722793915519026",
      priority: "Normal",
      enabled: true,
      requireReason: true,
      autoTranscript: true
    },
    {
      key: "slot",
      name: "Slot Seçimi",
      english: "Slot Selection",
      emoji: "🎟️",
      categoryId: "1395722328607952999",
      supportRole: "",
      logChannel: "1395722793915519026",
      priority: "Normal",
      enabled: true,
      requireReason: true,
      autoTranscript: true
    },
    {
      key: "convoy",
      name: "Konvoy Daveti",
      english: "Convoy Invitation",
      emoji: "🚛",
      categoryId: "1395722333104115815",
      supportRole: "",
      logChannel: "1395722793915519026",
      priority: "Yüksek",
      enabled: true,
      requireReason: true,
      autoTranscript: true
    },
    {
      key: "partner",
      name: "Partner",
      english: "Partnership",
      emoji: "🤝",
      categoryId: "1395722293841498234",
      supportRole: "",
      logChannel: "1395722793915519026",
      priority: "Yüksek",
      enabled: true,
      requireReason: true,
      autoTranscript: true
    }
  ]
};

let state = structuredClone(defaultData);

const ids = [
  "botName","panelTitle","panelSubtitle","panelDescription","logChannelId","transcriptChannelId",
  "defaultSupportRoleId","maxTicketsPerUser","transcriptEnabled","claimEnabled","blacklistEnabled",
  "renameEnabled","addRemoveEnabled","satisfactionEnabled","multiLanguage","closeReasonEnabled",
  "autoCloseInactive","dmNotifications","requireCategoryChoice","showTicketNumber","autoTagSupport",
  "antiSpamEnabled","backupEnabled"
];

function byId(id){ return document.getElementById(id); }

function fillForm(data){
  ids.forEach(id => {
    const el = byId(id);
    if(!el) return;
    if(el.type === "checkbox") el.checked = !!data[id];
    else el.value = data[id] ?? "";
  });

  byId("previewTitle").textContent = data.panelTitle || "";
  byId("previewSubtitle").textContent = data.panelSubtitle || "";
  byId("previewDesc").textContent = data.panelDescription || "";
  renderCategories();
}

function collectForm(){
  const out = { ...state };
  ids.forEach(id => {
    const el = byId(id);
    if(!el) return;
    out[id] = el.type === "checkbox" ? el.checked : el.value;
  });
  out.maxTicketsPerUser = Number(out.maxTicketsPerUser || 1);
  out.categories = state.categories;
  return out;
}

function renderCategories(){
  const wrap = byId("categoriesWrap");
  wrap.innerHTML = "";

  state.categories.forEach((cat, idx) => {
    const row = document.createElement("div");
    row.className = "category-card";
    row.innerHTML = `
      <div>
        <label>Kategori</label>
        <input value="${cat.name}" data-k="${idx}" data-f="name">
      </div>
      <div>
        <label>English</label>
        <input value="${cat.english}" data-k="${idx}" data-f="english">
      </div>
      <div>
        <label>Emoji</label>
        <input value="${cat.emoji}" data-k="${idx}" data-f="emoji">
      </div>
      <div>
        <label>Kategori ID</label>
        <input value="${cat.categoryId}" data-k="${idx}" data-f="categoryId">
      </div>
      <div class="toggle-wrap">
        <label><input type="checkbox" ${cat.enabled ? "checked" : ""} data-k="${idx}" data-f="enabled"> Aktif</label>
        <button class="small-btn" data-del="${idx}">Sil</button>
      </div>
    `;
    wrap.appendChild(row);
  });

  wrap.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.k);
      const field = e.target.dataset.f;
      state.categories[idx][field] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    });
    input.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.k);
      const field = e.target.dataset.f;
      state.categories[idx][field] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    });
  });

  wrap.querySelectorAll("[data-del]").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.dataset.del);
      state.categories.splice(idx, 1);
      renderCategories();
    });
  });
}

async function loadFromApi(){
  const apiBase = byId("apiBase").value.trim();
  if(!apiBase){
    fillForm(state);
    return;
  }
  try {
    const res = await fetch(apiBase.replace(/\/$/,"") + "/api/settings");
    const data = await res.json();
    state = data;
    fillForm(state);
    byId("statusBox").textContent = "Ayarlar API'den yüklendi.";
  } catch (e) {
    byId("statusBox").textContent = "API yükleme hatası. Yerel önizleme gösteriliyor.";
    fillForm(state);
  }
}

async function saveToApi(){
  const apiBase = byId("apiBase").value.trim();
  const apiKey = byId("apiKey").value.trim();
  if(!apiBase || !apiKey){
    byId("statusBox").textContent = "API adresi ve PANEL_API_KEY girmen lazım.";
    return;
  }

  state = collectForm();

  try {
    const res = await fetch(apiBase.replace(/\/$/,"") + "/api/settings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify(state)
    });

    const data = await res.json();
    if(res.ok){
      byId("statusBox").textContent = "Ayarlar başarıyla kaydedildi.";
    } else {
      byId("statusBox").textContent = data.error || "Kayıt başarısız.";
    }
  } catch (e) {
    byId("statusBox").textContent = "API kayıt hatası.";
  }
}

byId("saveTopBtn").addEventListener("click", saveToApi);
byId("saveBottomBtn").addEventListener("click", saveToApi);
byId("addCategoryBtn").addEventListener("click", () => {
  state.categories.push({
    key: "new_" + Date.now(),
    name: "Yeni Kategori",
    english: "New Category",
    emoji: "🎫",
    categoryId: "",
    supportRole: "",
    logChannel: "",
    priority: "Normal",
    enabled: true,
    requireReason: true,
    autoTranscript: true
  });
  renderCategories();
});

["panelTitle","panelSubtitle","panelDescription"].forEach(id => {
  byId(id).addEventListener("input", () => {
    byId("previewTitle").textContent = byId("panelTitle").value;
    byId("previewSubtitle").textContent = byId("panelSubtitle").value;
    byId("previewDesc").textContent = byId("panelDescription").value;
  });
});

fillForm(state);
