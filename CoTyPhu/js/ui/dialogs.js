// ============================================================
// dialogs.js — CÁC HỘP THOẠI (trượt lên từ dưới màn hình)
//   Dialog.open(hamVe)  : mở hộp thoại, hamVe() trả về HTML bên trong
//   Dialog.refresh()    : vẽ lại (gọi sau mỗi lần state thay đổi)
//   Dialog.close()      : đóng
// ============================================================

const Dialog = {
    render: null,

    open(renderFn) {
        this.render = renderFn;
        this.refresh();
    },

    refresh() {
        const root = document.getElementById("dialog-root");
        if (!root) return;
        const html = this.render ? this.render() : null;
        if (html === null) {
            this.render = null;
            root.innerHTML = "";
            return;
        }
        root.innerHTML = `<div class="backdrop" onclick="if (event.target === this) Dialog.close()">
      <div class="sheet"><button class="close" onclick="Dialog.close()">✕</button>${html}</div>
    </div>`;
    },

    close() {
        this.render = null;
        this.refresh();
    },
};

// ---------- Thẻ đất (bấm vào một ô trên bàn cờ) ----------
function tileDialogHtml(state, tileId) {
    const tile = BOARD[tileId];
    const info = state.tiles[tileId];

    // Ô không mua được: chỉ hiện mô tả
    if (!info) {
        const desc = {
            go: `Đi qua hoặc dừng ở đây nhận ${formatMoney(GAME_CONFIG.goSalary)}.`,
            chance: "Rút 1 thẻ Cơ Hội và làm theo.",
            chest: "Rút 1 thẻ Khí Vận và làm theo.",
            tax: `Nộp ${formatMoney(tile.amount || 0)} cho ngân hàng.`,
            jail: `Chỉ thăm tù thì không sao. Người ở tù: đổ đôi, nộp ${formatMoney(GAME_CONFIG.jailFine)} hoặc dùng thẻ để ra.`,
            free: "Nghỉ ngơi, không có gì xảy ra.",
            goToJail: "Vào tù ngay, không đi qua Xuất phát, không nhận tiền.",
        }[tile.type];
        return `<h3>${TILE_ICONS[tile.type] || ""} ${tile.name}</h3><p>${desc}</p>`;
    }

    const color = tile.group ? COLOR_GROUPS[tile.group].color : "#e9edf3";
    const lightText = ["darkBlue", "green", "red", "brown", "pink"].includes(tile.group);
    let html = `<div class="deed-head" style="background:${color};color:${lightText ? "#fff" : "#111"}">
    ${TILE_ICONS[tile.id] || ""} ${tile.name}</div>`;

    // Bảng tiền thuê
    html += '<table class="deed-table">';
    const row = (label, value, now) => `<tr class="${now ? "now" : ""}"><td>${label}</td><td>${value}</td></tr>`;
    if (tile.type === "street") {
        const set = info.owner !== null && hasColourSet(state, info.owner, tile.group);
        html += row("Tiền thuê", formatMoney(tile.rent[0]), info.houses === 0 && !set && info.owner !== null);
        html += row("Đủ bộ màu", formatMoney(tile.rent[0] * GAME_CONFIG.colourSetMultiplier), info.houses === 0 && set);
        for (let h = 1; h <= 4; h++) html += row(`${"🏠".repeat(h)} ${h} nhà`, formatMoney(tile.rent[h]), info.houses === h);
        html += row("🏨 Khách sạn", formatMoney(tile.rent[5]), info.houses === 5);
        html += row("Giá xây 1 nhà / khách sạn", formatMoney(COLOR_GROUPS[tile.group].houseCost));
    } else if (tile.type === "station") {
        const n = info.owner !== null ? countOwnedOfType(state, info.owner, "station") : 0;
        STATION_RENT.forEach((r, i) => { html += row(`Có ${i + 1} ga`, formatMoney(r), n === i + 1); });
    } else if (tile.type === "utility") {
        const n = info.owner !== null ? countOwnedOfType(state, info.owner, "utility") : 0;
        html += row("Có 1 công ty", "4 × xúc xắc × 10.000", n === 1);
        html += row("Có 2 công ty", "10 × xúc xắc × 10.000", n === 2);
    }
    html += row("Thế chấp được", formatMoney(tile.mortgage));
    html += row("Chuộc lại", formatMoney(tile.unmortgage));
    html += "</table>";

    // Chủ sở hữu
    if (info.owner === null) {
        html += `<div class="owner-line">Chưa có chủ · Giá <b>${formatMoney(tile.price)}</b></div>`;
    } else {
        const owner = state.players[info.owner];
        html += `<div class="owner-line">Chủ: <b style="color:${owner.color}">● ${owner.name}</b>
      ${info.mortgaged ? " · <b>đang thế chấp</b>" : ""}</div>`;
        if (canManage(owner.id)) html += `<div class="actions">${manageButtons(state, owner.id, tileId)}</div>`;
    }
    return html;
}

// Các nút xây / bán / thế chấp / chuộc cho 1 ô
function manageButtons(state, ownerId, tileId) {
    const tile = BOARD[tileId];
    const info = state.tiles[tileId];
    const run = (type) => `act('${type}', {tileId: ${tileId}}, ${ownerId})`;
    let html = "";
    if (tile.type === "street") {
        const cost = formatMoney(COLOR_GROUPS[tile.group].houseCost);
        html += btn(info.houses === 4 ? `+ Khách sạn ${cost}` : `+ Nhà ${cost}`, run("BUILD"),
            { cls: "small", error: buildError(state, ownerId, tileId) });
        html += btn("− Bán nhà", run("SELL_HOUSE"), { cls: "small secondary", error: sellError(state, ownerId, tileId) });
    }
    if (info.mortgaged) {
        html += btn(`Chuộc ${formatMoney(tile.unmortgage)}`, run("UNMORTGAGE"),
            { cls: "small secondary", error: unmortgageError(state, ownerId, tileId) });
    } else {
        html += btn(`Thế chấp +${formatMoney(tile.mortgage)}`, run("MORTGAGE"),
            { cls: "small secondary", error: mortgageError(state, ownerId, tileId) });
    }
    return html;
}

// ---------- Danh sách tài sản của 1 người ----------
function propertiesDialogHtml(state, playerId) {
    const p = state.players[playerId];
    let html = `<h3>Tài sản</h3><div class="tabs">`;
    for (const pl of state.players) {
        html += `<button class="tab ${pl.id === playerId ? "active" : ""}" onclick="openProperties(${pl.id})"
      style="${pl.bankrupt ? "opacity:.4" : ""}"><span style="color:${pl.color}">●</span> ${pl.name}</button>`;
    }
    html += "</div>";
    html += `<p style="margin-bottom:10px">Tiền mặt: <b>${formatMoney(p.money)}</b>
    ${p.jailFreeCards.length ? ` · 🎫 ${p.jailFreeCards.length} thẻ ra tù` : ""}</p>`;

    const owned = ownedTileIds(state, playerId);
    if (owned.length === 0) return html + "<p>Chưa có tài sản nào.</p>";

    for (const id of owned) {
        const t = BOARD[id];
        const info = state.tiles[id];
        const color = t.group ? COLOR_GROUPS[t.group].color : "#999";
        let label = t.name;
        if (info.houses === 5) label += " 🏨";
        else if (info.houses > 0) label += " " + "🏠".repeat(info.houses);
        if (info.mortgaged) label += " · thế chấp";
        html += `<div class="prop-row" style="border-color:${color}">
      <div class="pname" onclick="onTileClick(${id})">${label}</div>
      ${canManage(playerId) ? `<div class="actions">${manageButtons(state, playerId, id)}</div>` : ""}
    </div>`;
    }
    return html;
}

// ---------- Thẻ Cơ Hội / Khí Vận vừa rút ----------
function cardDialogHtml(card) {
    const isChance = card.id.startsWith("C");
    return `<div class="card-big ${isChance ? "chance" : "chest"}">
      <div class="kind">${isChance ? "❓ CƠ HỘI" : "🎁 KHÍ VẬN"}</div>${card.text}
    </div>
    <div class="actions">${btn("OK", "Dialog.close()")}</div>`;
}

// Bỏ ký tự đặc biệt khi đưa chữ người dùng nhập vào HTML
function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

// ---------- Màn hình chính: chọn chơi online hay chung 1 máy ----------
function homeScreenHtml({ online, myName, roomFromUrl, savedRoom }) {
    let html = `<div class="setup">
    <div class="logo">CỜ TỶ PHÚ</div>
    <p>Chơi cùng bạn bè ngay trên trình duyệt</p>
    <div class="box">
      <h3>🌐 Chơi online</h3>`;

    if (!online) {
        html += `<p class="note">Chưa cài đặt Firebase (file js/net/firebase-config.js), nên chưa chơi online được.</p>`;
    } else {
        html += `<input id="my-name" maxlength="12" placeholder="Tên của bạn" value="${escapeHtml(myName)}">`;
        if (roomFromUrl) {
            html += btn(`Vào phòng ${escapeHtml(roomFromUrl)}`, `joinRoomClick('${escapeHtml(roomFromUrl)}')`);
        } else {
            if (savedRoom) html += btn(`↩ Vào lại phòng ${escapeHtml(savedRoom)}`, `joinRoomClick('${escapeHtml(savedRoom)}')`);
            html += btn("➕ Tạo phòng mới", "createRoomClick()", { cls: savedRoom ? "secondary" : "" });
            html += `<div class="join-row">
        <input id="room-code" maxlength="4" placeholder="Mã phòng" autocapitalize="characters">
        ${btn("Vào phòng", "joinRoomClick()", { cls: "secondary" })}
      </div>`;
        }
    }

    html += `</div>
    <div class="box">
      <h3>📱 Chơi chung 1 máy</h3>
      ${btn("Chơi chuyền tay", "showLocalSetup()", { cls: "secondary" })}
    </div>
  </div>`;
    return html;
}

// ---------- Nhập tên khi chơi chung 1 máy ----------
function localSetupHtml(savedNames, hasSavedGame) {
    let html = `<div class="setup">
    <div class="logo">CỜ TỶ PHÚ</div>
    <p>Nhập tên từ 2 đến 6 người chơi</p>`;
    for (let i = 0; i < 6; i++) {
        html += `<input id="name-${i}" maxlength="12" placeholder="Người chơi ${i + 1}${i < 2 ? "" : " (không bắt buộc)"}"
      value="${escapeHtml(savedNames[i] || "")}">`;
    }
    html += btn("Bắt đầu ván mới", "startLocalGame()");
    if (hasSavedGame) html += btn("▶ Chơi tiếp ván trước", "continueLocalGame()", { cls: "secondary" });
    html += btn("← Quay lại", "showHome()", { cls: "secondary" });
    return html + "</div>";
}

// ---------- Phòng chờ (online) ----------
function lobbyScreenHtml(room, code, clientId) {
    const list = Net.lobbyList(room);
    const isHost = room.host === clientId;
    let html = `<div class="setup">
    <p>Mã phòng</p>
    <div class="room-code">${code}</div>
    ${btn("📤 Mời bạn bè", "shareRoom()")}
    <div class="box" style="text-align:left">
      <h3>Người chơi (${list.length}/${MAX_PLAYERS})</h3>`;
    list.forEach((p, i) => {
        html += `<div class="lobby-player">
      <span class="dot" style="background:${PLAYER_COLORS[i]}"></span>
      ${escapeHtml(p.name)}
      ${p.clientId === room.host ? " 👑" : ""}
      ${p.clientId === clientId ? " <small>(bạn)</small>" : ""}
    </div>`;
    });
    html += "</div>";
    if (isHost) {
        html += btn("▶ Bắt đầu chơi", "startOnlineGame()", { error: list.length < 2 ? "Cần ít nhất 2 người" : null });
    } else {
        html += `<p>Đang chờ chủ phòng bắt đầu...</p>`;
    }
    html += btn("Rời phòng", "leaveRoom()", { cls: "secondary" });
    return html + "</div>";
}

// Thông báo nhỏ tự tắt
function toast(message) {
    const old = document.querySelector(".toast");
    if (old) old.remove();
    const el = document.createElement("div");
    el.className = "toast";
    el.textContent = message;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}