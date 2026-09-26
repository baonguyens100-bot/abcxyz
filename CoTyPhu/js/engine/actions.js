// ============================================================
// actions.js — CỬA VÀO DUY NHẤT ĐỂ THAY ĐỔI VÁN CHƠI
//
//   const newState = applyAction(state, { type: "ROLL", playerId: 0 });
//
// - Không sửa state cũ: luôn làm trên bản sao rồi trả về bản mới.
// - Hành động không hợp lệ (chưa tới lượt, sai bước, thiếu tiền...)
//   sẽ ném lỗi (throw Error) với câu báo tiếng Việt để giao diện hiện lên.
// - Sau này chơi online: máy nào làm hành động thì gọi applyAction
//   rồi gửi newState lên Firebase cho các máy khác.
// ============================================================

// Hành động THEO LƯỢT (chỉ người đang tới lượt được làm):
//   ROLL            tung xúc xắc                       { dice?: [a, b] } (dice chỉ dùng khi test)
//   PAY_JAIL        nộp 500K để ra tù
//   USE_JAIL_CARD   dùng thẻ Ra tù miễn phí
//   BUY             mua ô đang đứng
//   DECLINE         không mua (bản đầu chưa có đấu giá)
//   CHOOSE_PLAYER   chọn người để trả tiền theo thẻ    { targetId }
//   END_TURN        kết thúc lượt
//
// Hành động QUẢN LÝ TÀI SẢN (chủ đất làm lúc nào cũng được — theo sách trang 10):
//   BUILD           xây 1 nhà (đủ 4 nhà thì lên khách sạn)   { tileId }
//   SELL_HOUSE      bán 1 nhà cho ngân hàng, nhận nửa giá      { tileId }
//   MORTGAGE        thế chấp đất                               { tileId }
//   UNMORTGAGE      chuộc đất                                  { tileId }
//
// Khi đang nợ (phase "debt"):
//   DECLARE_BANKRUPT  tuyên bố phá sản

const PROPERTY_ACTIONS = ["BUILD", "SELL_HOUSE", "MORTGAGE", "UNMORTGAGE"];

function applyAction(oldState, action) {
    // Bản sao sâu. Dùng JSON vì state chỉ chứa dữ liệu thường (giống thứ Firebase lưu)
    const state = JSON.parse(JSON.stringify(oldState));
    const p = currentPlayer(state);
    const actor = state.players[action.playerId];

    if (state.phase === "gameOver") throw new Error("Ván đã kết thúc");
    if (!actor || actor.bankrupt) throw new Error("Người chơi không hợp lệ");

    // ---- Kiểm tra ai được làm gì ----
    if (state.phase === "debt") {
        const debtor = state.players[state.pending.debtorId];
        const allowed = PROPERTY_ACTIONS.concat("DECLARE_BANKRUPT");
        if (actor.id !== debtor.id) throw new Error(`Đang chờ ${debtor.name} trả nợ`);
        if (!allowed.includes(action.type)) throw new Error("Bạn đang nợ: hãy bán nhà, thế chấp hoặc phá sản");
    } else if (!PROPERTY_ACTIONS.includes(action.type) && actor.id !== p.id) {
        throw new Error("Chưa tới lượt bạn");
    }

    const requirePhase = (...phases) => {
        if (!phases.includes(state.phase)) throw new Error("Không thể làm việc này lúc này");
    };
    const check = (errorMessage) => {
        if (errorMessage) throw new Error(errorMessage);
    };

    switch (action.type) {
        // ============================================================
        // THEO LƯỢT
        // ============================================================
        case "ROLL": {
            requirePhase("roll");
            const dice = action.dice || rollDice();
            const total = dice[0] + dice[1];
            const isDouble = dice[0] === dice[1];
            state.dice = dice;
            state.lastCard = null;
            addLog(state, `${p.name} tung được ${dice[0]} + ${dice[1]} = ${total}${isDouble ? " (đôi!)" : ""}.`);

            if (p.inJail) {
                p.jailTurns++;
                if (isDouble) {
                    releaseFromJail(state, p.id);
                    addLog(state, `${p.name} đổ đôi, được ra tù!`);
                } else if (p.jailTurns >= GAME_CONFIG.maxJailTurns) {
                    changeMoney(state, p.id, -GAME_CONFIG.jailFine);
                    releaseFromJail(state, p.id);
                    addLog(state, `${p.name} hết 3 lượt, nộp ${formatMoney(GAME_CONFIG.jailFine)} để ra tù.`);
                } else {
                    addLog(state, `${p.name} vẫn ở tù (lượt ${p.jailTurns}/${GAME_CONFIG.maxJailTurns}).`);
                    state.phase = "endTurn";
                    break;
                }
                state.rolledDouble = false; // ra tù bằng đôi thì không được tung thêm
            } else {
                state.rolledDouble = isDouble;
                if (isDouble) {
                    state.doublesCount++;
                    if (state.doublesCount === 3) {
                        addLog(state, `${p.name} đổ đôi 3 lần liên tiếp!`);
                        sendToJail(state, p.id);
                        state.phase = "endTurn";
                        break;
                    }
                }
            }

            state.phase = "moving";
            moveBy(state, p.id, total);
            resolveLanding(state);
            if (state.phase === "moving") finishStep(state);
            break;
        }

        case "PAY_JAIL":
            requirePhase("roll");
            if (!p.inJail) throw new Error("Bạn không ở trong tù");
            if (p.money < GAME_CONFIG.jailFine) throw new Error("Không đủ tiền nộp phạt");
            changeMoney(state, p.id, -GAME_CONFIG.jailFine);
            releaseFromJail(state, p.id);
            addLog(state, `${p.name} nộp ${formatMoney(GAME_CONFIG.jailFine)} và ra tù.`);
            break; // vẫn ở phase "roll": giờ tung xúc xắc đi như bình thường

        case "USE_JAIL_CARD": {
            requirePhase("roll");
            if (!p.inJail) throw new Error("Bạn không ở trong tù");
            const cardId = p.jailFreeCards.pop();
            if (!cardId) throw new Error("Bạn không có thẻ Ra tù miễn phí");
            returnJailCard(state, cardId);
            releaseFromJail(state, p.id);
            addLog(state, `${p.name} dùng thẻ Ra tù miễn phí.`);
            break;
        }

        case "BUY": {
            requirePhase("buy");
            const tile = BOARD[p.position];
            if (p.money < tile.price) throw new Error("Không đủ tiền để mua");
            changeMoney(state, p.id, -tile.price);
            state.tiles[tile.id].owner = p.id;
            addLog(state, `${p.name} mua ${tile.name} với giá ${formatMoney(tile.price)}.`);
            finishStep(state);
            break;
        }

        case "DECLINE":
            requirePhase("buy");
            addLog(state, `${p.name} không mua ${BOARD[p.position].name}.`);
            finishStep(state);
            break;

        case "CHOOSE_PLAYER": {
            requirePhase("choosePlayer");
            const target = state.players[action.targetId];
            if (!target || target.id === p.id || target.bankrupt) throw new Error("Chọn người chơi không hợp lệ");
            transfer(state, p.id, target.id, state.pending.amount);
            addLog(state, `${p.name} trả ${formatMoney(state.pending.amount)} cho ${target.name}.`);
            state.pending = null;
            finishStep(state);
            break;
        }

        case "END_TURN":
            requirePhase("endTurn");
            nextTurn(state);
            break;

        // ============================================================
        // QUẢN LÝ TÀI SẢN
        // ============================================================
        case "BUILD": {
            check(buildError(state, actor.id, action.tileId));
            const tile = BOARD[action.tileId];
            const info = state.tiles[action.tileId];
            const cost = COLOR_GROUPS[tile.group].houseCost;
            changeMoney(state, actor.id, -cost);
            info.houses++;
            addLog(state, `${actor.name} xây ${info.houses === 5 ? "khách sạn" : "nhà thứ " + info.houses} ở ${tile.name} (${formatMoney(cost)}).`);
            break;
        }

        case "SELL_HOUSE": {
            check(sellError(state, actor.id, action.tileId));
            const tile = BOARD[action.tileId];
            const info = state.tiles[action.tileId];
            const refund = COLOR_GROUPS[tile.group].houseCost / 2;
            const wasHotel = info.houses === 5;
            info.houses--;              // khách sạn (5) -> đổi lại thành 4 nhà
            changeMoney(state, actor.id, refund);
            addLog(state, `${actor.name} bán ${wasHotel ? "khách sạn" : "1 nhà"} ở ${tile.name}, nhận ${formatMoney(refund)}.`);
            break;
        }

        case "MORTGAGE": {
            check(mortgageError(state, actor.id, action.tileId));
            const tile = BOARD[action.tileId];
            state.tiles[action.tileId].mortgaged = true;
            changeMoney(state, actor.id, tile.mortgage);
            addLog(state, `${actor.name} thế chấp ${tile.name}, nhận ${formatMoney(tile.mortgage)}.`);
            break;
        }

        case "UNMORTGAGE": {
            check(unmortgageError(state, actor.id, action.tileId));
            const tile = BOARD[action.tileId];
            state.tiles[action.tileId].mortgaged = false;
            changeMoney(state, actor.id, -tile.unmortgage);
            addLog(state, `${actor.name} chuộc ${tile.name}, trả ${formatMoney(tile.unmortgage)}.`);
            break;
        }

        // ============================================================
        // PHÁ SẢN
        // ============================================================
        case "DECLARE_BANKRUPT": {
            requirePhase("debt");
            if (actor.money + liquidationValue(state, actor.id) >= 0) {
                throw new Error("Bạn vẫn trả được nợ nếu bán nhà / thế chấp đất, chưa thể phá sản");
            }
            const { returnPhase, savedPending } = state.pending;
            const wasCurrent = actor.id === state.current;
            declareBankrupt(state, actor.id);
            if (state.phase !== "gameOver") {
                if (wasCurrent) {
                    nextTurn(state);
                } else {
                    state.phase = returnPhase;
                    state.pending = savedPending ?? null;
                }
            }
            break;
        }

        default:
            throw new Error("Hành động không tồn tại: " + action.type);
    }

    // Sau mọi hành động: kiểm tra xem có ai bị âm tiền không
    checkDebts(state);
    return state;
}