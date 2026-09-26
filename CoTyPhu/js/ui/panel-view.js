// ============================================================
// panel-view.js — KHUNG DƯỚI BÀN CỜ
// Người chơi + tiền, các nút hành động theo từng bước, nhật ký.
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
        hint = `🏆 ${state.players[state.winner].name} chiến thắng!`;
        buttons = btn("🔄 Chơi ván mới", "newGame()");
    } else if (state.phase === "debt") {
        const d = state.players[state.pending.debtorId];
        const canPay = d.money + liquidationValue(state, d.id) >= 0;
        hint = `<span class="danger">⚠ ${d.name} thiếu ${formatMoney(-d.money)}. Bán nhà hoặc thế chấp đất để trả nợ.</span>`;
        if (canManage(d.id)) {
            buttons = btn("🏠 Bán / Thế chấp", `openProperties(${d.id})`)
                + btn("💀 Phá sản", `confirmBankrupt(${d.id})`, {
                    cls: "danger",
                    error: canPay ? "Bạn vẫn trả được nợ nếu bán nhà / thế chấp đất" : null,
                });
        } else {
            hint += `<br>Đang chờ ${d.name} xử lý...`;
        }
    } else if (!canAct) {
        hint = `Đang chờ ${p.name}...`;
    } else if (state.phase === "roll") {
        if (p.inJail) {
            hint = `🔒 ${p.name} đang ở tù (lượt ${p.jailTurns + 1}/3). Đổ đôi để ra tù, hoặc:`;
            buttons = btn("🎲 Tung xúc xắc", "doRoll()")
                + btn(`Nộp ${formatMoney(GAME_CONFIG.jailFine)}`, "act('PAY_JAIL')", { cls: "secondary" });
            if (p.jailFreeCards.length) buttons += btn("🎫 Dùng thẻ ra tù", "act('USE_JAIL_CARD')", { cls: "secondary" });
        } else {
            hint = state.rolledDouble ? "Đổ đôi! Bạn được tung tiếp." : `${p.name}, tới lượt bạn.`;
            buttons = btn("🎲 Tung xúc xắc", "doRoll()");
        }
    } else if (state.phase === "buy") {
        hint = `${tile.name} chưa có chủ. <a href="#" onclick="onTileClick(${tile.id});return false" style="color:var(--gold)">Xem thẻ</a>`;
        buttons = btn(`Mua ${formatMoney(tile.price)}`, "act('BUY')", {
            error: p.money < tile.price ? "Không đủ tiền để mua" : null,
        }) + btn("Bỏ qua", "act('DECLINE')", { cls: "secondary" });
    } else if (state.phase === "choosePlayer") {
        hint = `Chọn người nhận ${formatMoney(state.pending.amount)}:`;
        for (const o of state.players) {
            if (o.id !== p.id && !o.bankrupt) {
                buttons += btn(o.name, `act('CHOOSE_PLAYER', {targetId: ${o.id}})`, { cls: "secondary" });
            }
        }
    } else if (state.phase === "endTurn") {
        hint = "Xây nhà hoặc thế chấp trước khi kết thúc nếu cần.";
        buttons = btn("Kết thúc lượt ➜", "act('END_TURN')");
    }

    // Nút xem tài sản luôn có
    if (state.phase !== "gameOver" && state.phase !== "debt") {
        buttons += btn("🏠 Tài sản", `openProperties(${state.current})`, { cls: "secondary" });
    }

    return `<div class="action-box">
    ${hint ? `<div class="hint">${hint}</div>` : ""}
    <div class="actions">${buttons}</div>
  </div>`;
}

function logHtml(state, showAll) {
    const lines = state.log.slice().reverse();
    const shown = showAll ? lines : lines.slice(0, 4);
    return `<div class="log">
    ${shown.map(l => `<div>${l}</div>`).join("")}
    <a href="#" onclick="toggleLog();return false" style="color:var(--muted)">${showAll ? "Thu gọn" : "Xem thêm nhật ký"}</a>
  </div>`;
}

// canAct: máy này có được bấm nút theo lượt không (chơi chung 1 máy thì luôn true)
function renderPanel(state, container, { canAct = true, showAllLog = false } = {}) {
    container.innerHTML = playersHtml(state) + actionsHtml(state, canAct) + logHtml(state, showAllLog);
}