// ============================================================
// panel-view.js — KHUNG DƯỚI BÀN CỜ
// Người chơi + tiền, nút hành động, mua lại đất thế chấp,
// thông tin ô, và nút nhật ký nổi ở góc phải.
// ============================================================

// Nút bấm. error != null -> nút mờ, bấm vào sẽ hiện lý do (điện thoại không có "rê chuột")
function btn(label, onclick, { cls = "", error = null } = {}) {
    if (error) return `<button class="btn ${cls} dim" onclick="toast('${error.replace(/'/g, "\\'")}')">${label}</button>`;
    return `<button class="btn ${cls}" onclick="${onclick}">${label}</button>`;
}

function playersHtml(state) {
    let html = '<div class="players">';
    for (const p of state.players) {
        const tags = (p.inJail ? " 🔒" : "") + (p.jailFreeCards.length ? " 🎫" : "") + (p.bankrupt ? " 💀" : "");
        const cls = ["pchip"];
        if (p.id === state.current && state.phase !== "gameOver") cls.push("active");
        if (p.bankrupt) cls.push("bankrupt");
        html += `<button class="${cls.join(" ")}" onclick="openProperties(${p.id})">
      <span class="dot" style="background:${p.color}"></span>
      <span style="min-width:0">
        <div class="pname">${escapeHtml(p.name)}${tags}${p.id === myId ? " <small>(bạn)</small>" : ""}</div>
        <div class="money ${p.money < 0 ? "neg" : ""}">${formatMoney(p.money)}</div>
      </span>
    </button>`;
    }
    return html + "</div>";
}

function actionsHtml(state, canAct) {
    const p = currentPlayer(state);
    const tile = BOARD[p.position];
    let hint = "";
    let buttons = "";

    if (state.phase === "gameOver") {
        hint = `🏆 ${escapeHtml(state.players[state.winner].name)} chiến thắng!`;
        buttons = btn("🔄 Chơi ván mới", "newGame()");
    } else if (state.phase === "debt") {
        const d = state.players[state.pending.debtorId];
        const canPay = d.money + liquidationValue(state, d.id) >= 0;
        hint = `<span class="danger">⚠ ${escapeHtml(d.name)} thiếu ${formatMoney(-d.money)}. Bán nhà hoặc thế chấp đất để trả nợ.</span>`;
        if (canManage(d.id)) {
            buttons = btn("🏠 Bán / Thế chấp", `openProperties(${d.id})`)
                + btn("💀 Phá sản", `confirmBankrupt(${d.id})`, {
                    cls: "danger",
                    error: canPay ? "Bạn vẫn trả được nợ nếu bán nhà / thế chấp đất" : null,
                });
        } else {
            hint += `<br>Đang chờ ${escapeHtml(d.name)} xử lý...`;
        }
    } else if (!canAct) {
        hint = `Đang chờ ${escapeHtml(p.name)}...`;
    } else if (state.phase === "roll") {
        if (p.inJail) {
            hint = `🔒 Bạn đang ở tù (lượt ${p.jailTurns + 1}/3). Đổ đôi để ra tù, hoặc:`;
            buttons = btn("🎲 Tung xúc xắc", "doRoll()")
                + btn(`Nộp ${formatMoney(GAME_CONFIG.jailFine)}`, "act('PAY_JAIL')", { cls: "secondary" });
            if (p.jailFreeCards.length) buttons += btn("🎫 Dùng thẻ ra tù", "act('USE_JAIL_CARD')", { cls: "secondary" });
        } else {
            hint = state.rolledDouble ? "Đổ đôi! Bạn được tung tiếp." : `${escapeHtml(p.name)}, tới lượt bạn.`;
            buttons = btn("🎲 Tung xúc xắc", "doRoll()");
        }
    } else if (state.phase === "buy") {
        const seize = state.pending && state.pending.seize;
        const noMoney = p.money < tile.price ? "Không đủ tiền để mua" : null;
        if (seize) {
            const owner = state.players[state.tiles[tile.id].owner];
            hint = `${tile.name} của ${escapeHtml(owner.name)} đã thế chấp quá ${SEIZE_AFTER_ROUNDS} vòng. Bạn có thể mua lại!`;
            buttons = btn(`Mua lại ${formatMoney(tile.price)}`, "act('BUY')", { error: noMoney });
        } else {
            hint = `${tile.name} chưa có chủ. Xem thông tin ô ở bên dưới.`;
            buttons = btn(`Mua ${formatMoney(tile.price)}`, "act('BUY')", { error: noMoney });
        }
        buttons += btn("Bỏ qua", "act('DECLINE')", { cls: "secondary" });
    } else if (state.phase === "choosePlayer") {
        hint = `Chọn người nhận ${formatMoney(state.pending.amount)}:`;
        for (const o of state.players) {
            if (o.id !== p.id && !o.bankrupt) {
                buttons += btn(escapeHtml(o.name), `act('CHOOSE_PLAYER', {targetId: ${o.id}})`, { cls: "secondary" });
            }
        }
    } else if (state.phase === "endTurn") {
        hint = "Xây nhà hoặc thế chấp trước khi kết thúc nếu cần.";
        buttons = btn("Kết thúc lượt ➜", "act('END_TURN')");
    }

    // Nút xem tài sản luôn có
    if (state.phase !== "gameOver" && state.phase !== "debt") {
        buttons += btn("🏠 Tài sản", `openProperties(${myId !== null && myId >= 0 ? myId : state.current})`, { cls: "secondary" });
    }

    return `<div class="action-box">
    ${hint ? `<div class="hint">${hint}</div>` : ""}
    <div class="actions">${buttons}</div>
    ${redeemHtml(state)}
  </div>`;
}

// Hàng nút "Mua lại đất thế chấp" — hiện ở mọi lượt cho người chơi có đất đang thế chấp
function redeemHtml(state) {
    if (["gameOver", "debt"].includes(state.phase)) return "";
    const who = myId === null ? state.current : myId;   // chơi 1 máy: người đang tới lượt; online: chính mình
    if (who < 0 || state.players[who].bankrupt) return "";
    const mortgaged = ownedTileIds(state, who).filter(id => state.tiles[id].mortgaged);
    if (!mortgaged.length) return "";

    let html = `<div class="redeem"><div class="redeem-title">🏚 Mua lại đất thế chấp:</div><div class="redeem-list">`;
    for (const id of mortgaged) {
        const t = BOARD[id];
        const color = t.group ? COLOR_GROUPS[t.group].color : "#999";
        html += btn(`<span class="chip-dot" style="background:${color}"></span>${t.name} · ${formatMoney(t.unmortgage)}`,
            `act('UNMORTGAGE', {tileId: ${id}}, ${who})`,
            { cls: "small secondary", error: unmortgageError(state, who, id) });
    }
    return html + "</div></div>";
}

// Khung thông tin ô (thay cho nút "Xem thẻ"): mặc định là ô người đang tới lượt đứng
function infoHtml(state, tileId) {
    return `<div class="info-box" id="info-box">
    <div class="info-title">📋 Thông tin ô <small>(chạm vào ô bất kỳ trên bàn cờ để xem)</small></div>
    <div class="info-card">${tileDialogHtml(state, tileId)}</div>
  </div>`;
}

// Nút nhật ký nổi ở góc dưới phải + hộp 8 dòng gần nhất
function logFabHtml(state, open) {
    const lines = state.log.slice(-8).reverse();
    return `
    ${open ? `<div class="log-pop">
      <div class="log-title">📜 Nhật ký <small>(8 bước gần nhất)</small></div>
      ${lines.map(l => `<div class="log-line">${l}</div>`).join("")}
    </div>` : ""}
    <button class="log-fab ${open ? "open" : ""}" onclick="toggleLog()" aria-label="Nhật ký">${open ? "✕" : "📜"}</button>`;
}

// canAct: máy này có được bấm nút theo lượt không (chơi chung 1 máy thì luôn true)
function renderPanel(state, container, { canAct = true, infoTile = null } = {}) {
    const tileId = infoTile ?? currentPlayer(state).position;
    container.innerHTML = playersHtml(state) + actionsHtml(state, canAct) + infoHtml(state, tileId);
}