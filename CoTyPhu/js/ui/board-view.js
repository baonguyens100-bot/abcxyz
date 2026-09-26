// ============================================================
// board-view.js — VẼ BÀN CỜ
// Chỉ đọc state rồi tạo HTML, không thay đổi state.
// ============================================================

// Biểu tượng cho các ô không phải đất
const TILE_ICONS = {
    go: "🏁", chance: "❓", chest: "🎁", tax: "💰",
    jail: "🔒", free: "🅿️", goToJail: "👮",
    5: "🚆", 15: "✈️", 25: "🚢", 35: "🚀",   // các ga (theo vị trí)
    12: "☀️", 28: "🌬️",                       // các công ty
};

// Tên ngắn hiện trên ô (ô nhỏ nên không ghi tên dài được)
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

// Ô số i nằm ở hàng/cột nào trong lưới 11x11 (tính từ 1)
// Xuất phát ở góc dưới phải, đi ngược chiều kim đồng hồ.
function tileGridPos(i) {
    if (i <= 10) return { row: 11, col: 11 - i };        // cạnh dưới: phải -> trái
    if (i < 20) return { row: 11 - (i - 10), col: 1 };   // cạnh trái: dưới -> trên
    if (i <= 30) return { row: 1, col: i - 19 };         // cạnh trên: trái -> phải
    return { row: i - 29, col: 11 };                     // cạnh phải: trên -> dưới
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

function tileHtml(state, tile, positions) {
    const { row, col } = tileGridPos(tile.id);
    const info = state.tiles[tile.id];
    const classes = ["tile"];
    let style = `grid-area:${row}/${col}`;

    if (tile.id % 10 === 0) classes.push("corner");
    if (info && info.owner !== null) {
        classes.push("owned");
        style += `;--owner:${state.players[info.owner].color}`;
    }
    if (info && info.mortgaged) classes.push("mortgaged");

    let inner = "";
    if (tile.type === "street") {
        let buildings = "";
        if (info.houses === 5) buildings = '<span class="hotel"></span>';
        else for (let h = 0; h < info.houses; h++) buildings += '<span class="house"></span>';
        inner += `<div class="band" style="background:${COLOR_GROUPS[tile.group].color}">${buildings}</div>`;
        inner += `<div class="name ${tile.name.length > 7 ? "long" : ""}">${shortName(tile)}</div>`;
    } else {
        inner += `<div class="icon">${TILE_ICONS[tile.id] || TILE_ICONS[tile.type] || ""}</div>`;
        inner += `<div class="name">${shortName(tile)}</div>`;
    }
    if (tile.price) inner += `<div class="price">${formatMoney(tile.price)}</div>`;
    else if (tile.amount) inner += `<div class="price">${formatMoney(tile.amount)}</div>`;

    // Quân cờ đang đứng ở ô này
    const here = state.players.filter(p => !p.bankrupt && positions[p.id] === tile.id);
    if (here.length) {
        inner += '<div class="tokens">' + here.map(p =>
            `<span class="token ${p.id === state.current ? "current" : ""}" style="background:${p.color}"></span>`
        ).join("") + "</div>";
    }

    return `<div class="${classes.join(" ")}" style="${style}" onclick="onTileClick(${tile.id})">${inner}</div>`;
}

// Câu hiện giữa bàn cờ cho biết đang chờ gì
function turnMessage(state) {
    const p = currentPlayer(state);
    const name = `<b style="color:${p.color}">${p.name}</b>`;
    switch (state.phase) {
        case "roll": return p.inJail ? `${name} đang ở tù` : `Tới lượt ${name}`;
        case "buy": return `${name} có mua <b>${BOARD[p.position].name}</b>?`;
        case "choosePlayer": return `${name} chọn người để trả tiền`;
        case "endTurn": return `${name} kết thúc lượt`;
        case "debt": return `<b style="color:${state.players[state.pending.debtorId].color}">${state.players[state.pending.debtorId].name}</b> đang nợ!`;
        case "gameOver": return `🏆 <b style="color:${state.players[state.winner].color}">${state.players[state.winner].name}</b> thắng!`;
        default: return "";
    }
}

// positionOverride: { playerId: viTri } — dùng khi đang diễn hoạt cảnh quân cờ nhảy
function renderBoard(state, container, positionOverride = {}) {
    const positions = {};
    for (const p of state.players) positions[p.id] = positionOverride[p.id] ?? p.position;

    let html = '<div class="board">';
    for (const tile of BOARD) html += tileHtml(state, tile, positions);

    html += `<div class="center">
    <div class="logo">CỜ TỶ PHÚ</div>
    <div class="dice" id="dice">${dieHtml(state.dice[0] || 1)}${dieHtml(state.dice[1] || 1)}</div>
    <div class="turn-msg">${turnMessage(state)}</div>
    ${state.lastCard ? `<div class="mini-card">${state.lastCard.startsWith("C") ? "❓" : "🎁"} ${findCard(state.lastCard).text}</div>` : ""}
  </div>`;

    html += "</div>";
    container.innerHTML = html;
}