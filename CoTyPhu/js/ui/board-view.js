// ============================================================
// board-view.js — VẼ BÀN CỜ
// Chỉ đọc state rồi tạo HTML, không thay đổi state.
//
// Lưới 13 x 13:
//   hàng/cột 1 và 13  : ĐƯỜNG ĐI của quân cờ (viền ngoài cùng)
//   hàng/cột 2 và 12  : các ô bàn cờ (góc to hơn)
//   giữa (3..11)      : logo, xúc xắc, thông báo
// ============================================================

// Biểu tượng cho các ô không phải đất
const TILE_ICONS = {
    go: "🏁", chance: "❓", chest: "🎁", tax: "💰",
    jail: "🔒", free: "🅿️", goToJail: "👮",
    5: "🚆", 15: "✈️", 25: "🚢", 35: "🚀",   // các ga (theo vị trí)
    12: "☀️", 28: "🌬️",                       // các công ty
};

// Tên ngắn hiện trên ô
function shortName(tile) {
    switch (tile.type) {
        case "go": return "XUẤT PHÁT";
        case "jail": return "THĂM TÙ";
        case "free": return "ĐỖ XE";
        case "goToJail": return "VÀO TÙ";
        case "chance": return "Cơ hội";
        case "chest": return "Khí vận";
        case "tax": return tile.id === 4 ? "Thuế" : "Thuế ĐB";
        case "station": return tile.name.replace("Ga ", "");
        case "utility": return tile.name.replace("Điện ", "");
        default: return tile.name;
    }
}

// Ô số i thuộc cạnh nào của bàn cờ
function tileSide(i) {
    if (i % 10 === 0) return "corner";
    if (i < 10) return "bottom";
    if (i < 20) return "left";
    if (i < 30) return "top";
    return "right";
}

// Ô số i nằm ở hàng/cột nào trong lưới 13x13 (tính từ 1).
// Xuất phát ở góc dưới phải, đi ngược chiều kim đồng hồ.
function tileGridPos(i) {
    if (i <= 10) return { row: 12, col: 12 - i };        // cạnh dưới: phải -> trái
    if (i < 20) return { row: 12 - (i - 10), col: 2 };   // cạnh trái: dưới -> trên
    if (i <= 30) return { row: 2, col: i - 18 };         // cạnh trên: trái -> phải
    return { row: i - 28, col: 12 };                     // cạnh phải: trên -> dưới
}

// Ô đường đi (viền ngoài) nằm cạnh ô số i
function laneGridPos(i) {
    if (i === 0) return { row: 13, col: 13 };
    if (i === 10) return { row: 13, col: 1 };
    if (i === 20) return { row: 1, col: 1 };
    if (i === 30) return { row: 1, col: 13 };
    const { row, col } = tileGridPos(i);
    if (i < 10) return { row: 13, col };
    if (i < 20) return { row, col: 1 };
    if (i < 30) return { row: 1, col };
    return { row, col: 13 };
}

// Hình ngôi nhà (SVG) tô màu người sở hữu
function houseIcon(color) {
    return `<svg class="owner-house" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2.5 1.5 11.5h3V21h5.5v-6h4v6H19.5v-9.5h3z" fill="${color}" stroke="#1b1b1b" stroke-width="1.4" stroke-linejoin="round"/>
  </svg>`;
}

// Vẽ các chấm của 1 mặt xúc xắc (lưới 3x3, ô số 0..8)
const DIE_PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function dieHtml(value) {
    let cells = "";
    for (let k = 0; k < 9; k++) {
        cells += (DIE_PIPS[value] || []).includes(k) ? '<div class="pip"></div>' : "<div></div>";
    }
    return `<div class="die">${cells}</div>`;
}

function tileHtml(state, tile, highlight) {
    const { row, col } = tileGridPos(tile.id);
    const info = state.tiles[tile.id];
    const side = tileSide(tile.id);
    const classes = ["tile", "side-" + side];
    if (info && info.mortgaged) classes.push("mortgaged");
    if (highlight) classes.push("here");

    // Dải màu (đất) + nhà/khách sạn đã xây
    let band = "";
    if (tile.type === "street") {
        let buildings = "";
        if (info.houses === 5) buildings = '<span class="hotel"></span>';
        else for (let h = 0; h < info.houses; h++) buildings += '<span class="house"></span>';
        band = `<div class="band" style="background:${COLOR_GROUPS[tile.group].color}">${buildings}</div>`;
    }

    // Phần chữ
    let body = "";
    if (tile.type !== "street") body += `<div class="icon">${TILE_ICONS[tile.id] || TILE_ICONS[tile.type] || ""}</div>`;
    const nm = shortName(tile);
    const longest = Math.max(...nm.split(" ").map(w => w.length));   // từ dài nhất trong tên
    body += `<div class="name ${longest >= 8 ? "len-l" : longest >= 6 ? "len-m" : ""}">${nm}</div>`;
    if (info && info.owner !== null) {
        body += `<div class="owner">${houseIcon(state.players[info.owner].color)}</div>`;
    } else if (tile.price) {
        body += `<div class="price">${formatMoney(tile.price)}</div>`;
    } else if (tile.amount) {
        body += `<div class="price">${formatMoney(tile.amount)}</div>`;
    }

    const stamp = info && info.mortgaged ? '<div class="stamp">THẾ CHẤP</div>' : "";

    return `<div class="${classes.join(" ")}" style="grid-area:${row}/${col}" onclick="onTileClick(${tile.id})">
    ${band}<div class="body">${body}</div>${stamp}
  </div>`;
}

// Câu hiện giữa bàn cờ cho biết đang chờ gì
function turnMessage(state) {
    const p = currentPlayer(state);
    const nameOf = (pl) => `<b style="color:${pl.color}">${escapeHtml(pl.name)}</b>`;
    switch (state.phase) {
        case "roll": return p.inJail ? `${nameOf(p)} đang ở tù` : `Tới lượt ${nameOf(p)}`;
        case "buy": return `${nameOf(p)} có mua <b>${BOARD[p.position].name}</b>?`;
        case "choosePlayer": return `${nameOf(p)} chọn người để trả tiền`;
        case "endTurn": return `${nameOf(p)} kết thúc lượt`;
        case "debt": return `${nameOf(state.players[state.pending.debtorId])} đang nợ!`;
        case "gameOver": return `🏆 ${nameOf(state.players[state.winner])} thắng!`;
        default: return "";
    }
}

// positionOverride: { playerId: viTri } — dùng khi đang diễn hoạt cảnh quân cờ nhảy
function renderBoard(state, container, positionOverride = {}) {
    const positions = {};
    for (const p of state.players) {
        if (!p.bankrupt) positions[p.id] = positionOverride[p.id] ?? p.position;
    }
    const currentPos = positions[state.current];

    let html = '<div class="board">';

    // Các ô
    for (const tile of BOARD) html += tileHtml(state, tile, tile.id === currentPos);

    // Quân cờ trên đường đi viền ngoài
    const byTile = {};
    for (const p of state.players) {
        if (p.bankrupt) continue;
        (byTile[positions[p.id]] = byTile[positions[p.id]] || []).push(p);
    }
    for (const [tileId, list] of Object.entries(byTile)) {
        const { row, col } = laneGridPos(Number(tileId));
        const vertical = tileSide(Number(tileId)) === "left" || tileSide(Number(tileId)) === "right";
        html += `<div class="lane ${vertical ? "vertical" : ""}" style="grid-area:${row}/${col}">` +
            list.map(p => `<span class="token ${p.id === state.current ? "current" : ""}" style="background:${p.color}"></span>`).join("") +
            "</div>";
    }

    // Giữa bàn cờ
    html += `<div class="center">
    <div class="logo">CỜ TỶ PHÚ</div>
    <div class="round">Vòng ${state.round || 1}</div>
    <div class="dice" id="dice">${dieHtml(state.dice[0] || 1)}${dieHtml(state.dice[1] || 1)}</div>
    <div class="turn-msg">${turnMessage(state)}</div>
    ${state.lastCard ? `<div class="mini-card">${state.lastCard.startsWith("C") ? "❓" : "🎁"} ${findCard(state.lastCard).text}</div>` : ""}
  </div>`;

    html += "</div>";
    container.innerHTML = html;
}