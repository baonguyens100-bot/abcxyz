// ============================================================
// rules.js — CÁC LUẬT NHỎ (hàm trợ giúp)
// Các hàm ở đây SỬA TRỰC TIẾP object state được truyền vào.
// Chỉ actions.js gọi các hàm này (trên một bản sao của state).
// ============================================================

const BOARD_SIZE = BOARD.length; // 40
const SEIZE_AFTER_ROUNDS = 6;     // đất thế chấp quá 6 vòng: người khác dừng vào được mua lại

function currentPlayer(state) {
    return state.players[state.current];
}

function addLog(state, message) {
    state.log.push(message);
    if (state.log.length > 50) state.log.shift(); // chỉ giữ 50 dòng gần nhất
}

function rollDice() {
    return [1 + Math.floor(Math.random() * 6), 1 + Math.floor(Math.random() * 6)];
}

// ---------- Tiền ----------
// amount dương = nhận từ ngân hàng, âm = trả cho ngân hàng
function changeMoney(state, playerId, amount) {
    state.players[playerId].money += amount;
    if (amount < 0) state.players[playerId].owedTo = null; // vừa trả tiền cho ngân hàng
}

function transfer(state, fromId, toId, amount) {
    state.players[fromId].money -= amount;
    state.players[toId].money += amount;
    state.players[fromId].owedTo = toId;                    // vừa trả tiền cho người chơi toId
}

// ---------- Sở hữu ----------
function ownedTileIds(state, playerId) {
    return Object.keys(state.tiles)
        .map(Number)
        .filter(id => state.tiles[id].owner === playerId);
}

// Người chơi có bao nhiêu ô thuộc loại này (station / utility)
function countOwnedOfType(state, playerId, type) {
    return ownedTileIds(state, playerId).filter(id => BOARD[id].type === type).length;
}

// Người chơi có đủ cả bộ màu không
function hasColourSet(state, playerId, group) {
    return BOARD
        .filter(t => t.group === group)
        .every(t => state.tiles[t.id].owner === playerId);
}

// ---------- Tính tiền thuê ----------
// options.rentMultiplier : nhân tiền thuê (thẻ "trả gấp đôi")
// options.diceMultiplier : công ty tính theo hệ số riêng của thẻ
function calcRent(state, tileId, diceTotal, options = {}) {
    const tile = BOARD[tileId];
    const info = state.tiles[tileId];
    if (info.owner === null || info.mortgaged) return 0; // đất thế chấp: không thu thuê

    let rent = 0;
    if (tile.type === "street") {
        if (info.houses > 0) {
            rent = tile.rent[info.houses];
        } else {
            rent = tile.rent[0];
            if (hasColourSet(state, info.owner, tile.group)) rent *= GAME_CONFIG.colourSetMultiplier;
        }
    } else if (tile.type === "station") {
        const count = countOwnedOfType(state, info.owner, "station");
        rent = STATION_RENT[count - 1];
    } else if (tile.type === "utility") {
        if (options.diceMultiplier) {
            rent = diceTotal * options.diceMultiplier;
        } else {
            const count = countOwnedOfType(state, info.owner, "utility");
            rent = diceTotal * UTILITY_MULTIPLIER[count - 1];
        }
    }

    if (options.rentMultiplier) rent *= options.rentMultiplier;
    return rent;
}

// ---------- Di chuyển ----------
// Đi TIẾN tới ô `position`. Nếu vòng qua (hoặc dừng ở) ô Xuất phát thì nhận 2M.
function moveForwardTo(state, playerId, position) {
    const p = state.players[playerId];
    if (position <= p.position) {
        changeMoney(state, playerId, GAME_CONFIG.goSalary);
        addLog(state, `${p.name} đi qua Xuất phát, nhận ${formatMoney(GAME_CONFIG.goSalary)}.`);
    }
    p.position = position;
}

function moveBy(state, playerId, steps) {
    const p = state.players[playerId];
    // Ghi lại nước đi để giao diện vẽ quân cờ nhảy từng ô (id tăng dần để biết là nước mới)
    const lastId = state.lastMove ? state.lastMove.id : 0;
    state.lastMove = { id: lastId + 1, playerId: playerId, from: p.position, steps: steps };
    moveForwardTo(state, playerId, (p.position + steps) % BOARD_SIZE);
}

function sendToJail(state, playerId) {
    const p = state.players[playerId];
    p.position = GAME_CONFIG.jailPosition;
    p.inJail = true;
    p.jailTurns = 0;
    state.rolledDouble = false;   // vào tù thì không được tung tiếp
    state.doublesCount = 0;
    addLog(state, `${p.name} bị vào tù!`);
}

function releaseFromJail(state, playerId) {
    const p = state.players[playerId];
    p.inJail = false;
    p.jailTurns = 0;
}

// Tìm ô loại `type` gần nhất phía trước vị trí `from`
function findNearest(from, type) {
    for (let step = 1; step <= BOARD_SIZE; step++) {
        const pos = (from + step) % BOARD_SIZE;
        if (BOARD[pos].type === type) return pos;
    }
    return from;
}

// ---------- Thẻ ----------
function findCard(cardId) {
    return CHANCE_CARDS.concat(CHEST_CARDS).find(c => c.id === cardId);
}

// Rút thẻ trên cùng. Thẻ thường thì đặt lại xuống dưới cùng;
// thẻ Ra tù miễn phí thì người chơi giữ, nên không trả lại vào bộ.
function drawCard(state, deckName) {
    const cardId = state.decks[deckName].shift();
    const card = findCard(cardId);
    if (card.action.type !== "jailFree") state.decks[deckName].push(cardId);
    return card;
}

// Trả thẻ Ra tù về đúng bộ (C.. = Cơ Hội, K.. = Khí Vận)
function returnJailCard(state, cardId) {
    const deck = cardId.startsWith("C") ? "chance" : "chest";
    state.decks[deck].push(cardId);
}

// Đếm số nhà và khách sạn của người chơi
function countBuildings(state, playerId) {
    let houses = 0, hotels = 0;
    for (const id of ownedTileIds(state, playerId)) {
        const h = state.tiles[id].houses;
        if (h === 5) hotels++;
        else houses += h;
    }
    return { houses, hotels };
}

function applyCard(state, card) {
    const p = currentPlayer(state);
    const a = card.action;
    state.lastCard = card.id;
    addLog(state, `${p.name} rút thẻ: "${card.text}"`);

    switch (a.type) {
        case "money":
            changeMoney(state, p.id, a.amount);
            break;

        case "moveTo":
            moveForwardTo(state, p.id, a.position);
            resolveLanding(state);
            break;

        case "moveBack":
            p.position = (p.position - a.steps + BOARD_SIZE) % BOARD_SIZE; // lùi thì không nhận tiền GO
            resolveLanding(state);
            break;

        case "nearest": {
            moveForwardTo(state, p.id, findNearest(p.position, a.kind));
            // thẻ công ty: tung xúc xắc lại để tính tiền
            let diceTotal = state.dice[0] + state.dice[1];
            if (a.kind === "utility") {
                const d = rollDice();
                diceTotal = d[0] + d[1];
                addLog(state, `Tung lại xúc xắc: ${d[0]} + ${d[1]} = ${diceTotal}.`);
            }
            resolveLanding(state, {
                rentMultiplier: a.rentMultiplier,
                diceMultiplier: a.diceMultiplier,
                diceTotal: diceTotal,
            });
            break;
        }

        case "goToJail":
            sendToJail(state, p.id);
            break;

        case "jailFree":
            p.jailFreeCards.push(card.id);
            break;

        case "repairs": {
            const b = countBuildings(state, p.id);
            const cost = b.houses * a.perHouse + b.hotels * a.perHotel;
            changeMoney(state, p.id, -cost);
            addLog(state, `${p.name} trả ${formatMoney(cost)} (${b.houses} nhà, ${b.hotels} khách sạn).`);
            break;
        }

        case "collectFromEach":
            for (const other of state.players) {
                if (other.id !== p.id && !other.bankrupt) transfer(state, other.id, p.id, a.amount);
            }
            break;

        case "payChosenPlayer": {
            const others = state.players.filter(o => o.id !== p.id && !o.bankrupt);
            if (others.length === 1) {
                // chỉ còn 1 người thì khỏi chọn: trả luôn cho người đó
                transfer(state, p.id, others[0].id, a.amount);
                addLog(state, `${p.name} trả ${formatMoney(a.amount)} cho ${others[0].name} (chỉ có 1 người để chọn).`);
            } else {
                state.phase = "choosePlayer";
                state.pending = { amount: a.amount };
            }
            break;
        }
    }
}

// ---------- Xử lý khi dừng ở một ô ----------
// Có thể đổi state.phase sang "buy" hoặc "choosePlayer".
// options: xem calcRent, thêm options.diceTotal để dùng tổng xúc xắc khác
function resolveLanding(state, options = {}) {
    const p = currentPlayer(state);
    const tile = BOARD[p.position];
    addLog(state, `${p.name} dừng ở ${tile.name}.`);

    switch (tile.type) {
        case "goToJail":
            sendToJail(state, p.id);
            return;

        case "tax":
            changeMoney(state, p.id, -tile.amount);
            addLog(state, `${p.name} nộp ${formatMoney(tile.amount)} tiền thuế.`);
            return;

        case "chance":
            applyCard(state, drawCard(state, "chance"));
            return;

        case "chest":
            applyCard(state, drawCard(state, "chest"));
            return;

        case "street":
        case "station":
        case "utility": {
            const info = state.tiles[tile.id];
            if (info.owner === null) {
                state.phase = "buy";                  // chờ người chơi quyết định mua hay không
            } else if (info.owner !== p.id) {
                const diceTotal = options.diceTotal ?? state.dice[0] + state.dice[1];
                const rent = calcRent(state, tile.id, diceTotal, options);
                const owner = state.players[info.owner];
                if (info.mortgaged) {
                    if (canSeize(state, tile.id, p.id)) {
                        state.phase = "buy";                // được quyền mua lại đất thế chấp quá hạn
                        state.pending = { seize: true };
                        addLog(state, `${tile.name} của ${owner.name} thế chấp quá ${SEIZE_AFTER_ROUNDS} vòng: ${p.name} có thể mua lại!`);
                    } else {
                        addLog(state, `${tile.name} đang thế chấp, không phải trả thuê.`);
                    }
                } else {
                    transfer(state, p.id, owner.id, rent);
                    addLog(state, `${p.name} trả ${formatMoney(rent)} tiền thuê cho ${owner.name}.`);
                }
            }
            return;
        }

        // go, jail (thăm tù), free: không có gì xảy ra
    }
}

// Sau khi xong một bước: đổ đôi thì được tung tiếp, không thì chờ kết thúc lượt
function finishStep(state) {
    const p = currentPlayer(state);
    state.phase = state.rolledDouble && !p.inJail ? "roll" : "endTurn";
}

// Chuyển sang người chơi tiếp theo chưa phá sản
function nextTurn(state) {
    let next = state.current;
    do {
        next = (next + 1) % state.players.length;
    } while (state.players[next].bankrupt);

    if (next <= state.current) state.round++;   // quay lại đầu bàn = sang vòng mới
    state.current = next;
    state.turn++;
    state.phase = "roll";
    state.pending = null;       // lượt mới: không còn việc gì đang chờ
    state.doublesCount = 0;
    state.rolledDouble = false;
    state.hasRolled = false;
    state.buildsThisTurn = 0;
    state.lastCard = null;
    addLog(state, `— Tới lượt ${state.players[next].name} —`);
}

// ============================================================
// NHÀ, KHÁCH SẠN, THẾ CHẤP
// Mỗi hàm ...Error trả về câu lý do nếu KHÔNG được làm, hoặc null nếu được.
// Giao diện cũng dùng các hàm này để làm mờ nút.
// ============================================================

function groupTileIds(group) {
    return BOARD.filter(t => t.group === group).map(t => t.id);
}

function buildError(state, playerId, tileId) {
    const tile = BOARD[tileId];
    const info = state.tiles[tileId];
    if (!info || tile.type !== "street") return "Chỉ xây được trên đất có màu";
    if (info.owner !== playerId) return "Đây không phải đất của bạn";
    if (!hasColourSet(state, playerId, tile.group)) return "Cần có đủ bộ màu mới được xây";
    // Luật xây theo lượt (chống người giàu xây dồn dập)
    if (state.current !== playerId) return "Chỉ được xây trong lượt của mình";
    if (!state.hasRolled) return "Tung xúc xắc trước rồi mới được xây";
    if (state.phase !== "roll" && state.phase !== "endTurn") return "Xong bước hiện tại rồi mới xây được";
    if ((state.buildsThisTurn || 0) >= GAME_CONFIG.maxBuildsPerTurn) {
        return `Mỗi lượt chỉ được xây tối đa ${GAME_CONFIG.maxBuildsPerTurn} lần`;
    }
    const group = groupTileIds(tile.group);
    if (group.some(id => state.tiles[id].mortgaged)) return "Có đất trong bộ màu đang thế chấp";
    if (info.houses >= 5) return "Đã có khách sạn";
    const minHouses = Math.min(...group.map(id => state.tiles[id].houses));
    if (info.houses > minHouses) return "Phải xây đều: xây lên các đất khác trong bộ trước";
    const cost = COLOR_GROUPS[tile.group].houseCost;
    if (state.players[playerId].money < cost) return "Không đủ tiền (" + formatMoney(cost) + ")";
    return null;
}

function sellError(state, playerId, tileId) {
    const tile = BOARD[tileId];
    const info = state.tiles[tileId];
    if (!info || info.owner !== playerId) return "Đây không phải đất của bạn";
    if (info.houses === 0) return "Không có nhà để bán";
    const group = groupTileIds(tile.group);
    const maxHouses = Math.max(...group.map(id => state.tiles[id].houses));
    if (info.houses < maxHouses) return "Phải bán đều: bán ở đất nhiều nhà hơn trước";
    return null;
}

function mortgageError(state, playerId, tileId) {
    const tile = BOARD[tileId];
    const info = state.tiles[tileId];
    if (!info || info.owner !== playerId) return "Đây không phải đất của bạn";
    if (info.mortgaged) return "Đất này đã thế chấp rồi";
    if (tile.group && groupTileIds(tile.group).some(id => state.tiles[id].houses > 0)) {
        return "Phải bán hết nhà trong bộ màu trước";
    }
    return null;
}

function unmortgageError(state, playerId, tileId) {
    const tile = BOARD[tileId];
    const info = state.tiles[tileId];
    if (!info || info.owner !== playerId) return "Đây không phải đất của bạn";
    if (!info.mortgaged) return "Đất này không bị thế chấp";
    if (state.players[playerId].money < tile.unmortgage) return "Không đủ tiền (" + formatMoney(tile.unmortgage) + ")";
    return null;
}

// Đất thế chấp của người khác đã quá SEIZE_AFTER_ROUNDS (6) vòng chưa chuộc -> người đang đứng đó được mua lại
function canSeize(state, tileId, playerId) {
    const info = state.tiles[tileId];
    return !!info && info.mortgaged && info.owner !== null && info.owner !== playerId
        && state.round - (info.mortgagedRound ?? state.round) >= SEIZE_AFTER_ROUNDS;
}

// Vòng mà từ đó người khác được mua lại đất thế chấp này
function seizableFromRound(state, tileId) {
    const info = state.tiles[tileId];
    return (info.mortgagedRound ?? state.round) + SEIZE_AFTER_ROUNDS;
}

// Số tiền tối đa người chơi gom được nếu bán hết nhà và thế chấp hết đất
function liquidationValue(state, playerId) {
    let value = 0;
    for (const id of ownedTileIds(state, playerId)) {
        const tile = BOARD[id];
        const info = state.tiles[id];
        if (info.houses > 0) value += (info.houses * COLOR_GROUPS[tile.group].houseCost) / 2;
        if (!info.mortgaged) value += tile.mortgage;
    }
    return value;
}

// ============================================================
// NỢ VÀ PHÁ SẢN
// ============================================================

// Gọi sau MỌI hành động: ai đang âm tiền thì bắt vào bước "debt"
function checkDebts(state) {
    if (state.phase === "gameOver") return;

    if (state.phase === "debt") {
        const debtor = state.players[state.pending.debtorId];
        if (debtor.money < 0 && !debtor.bankrupt) return;      // vẫn còn nợ
        addLog(state, `${debtor.name} đã trả xong nợ.`);
        state.phase = state.pending.returnPhase;                // quay lại bước đang dở
        state.pending = state.pending.savedPending ?? null;
    }

    const debtor = state.players.find(pl => !pl.bankrupt && pl.money < 0);
    if (debtor) {
        state.pending = { debtorId: debtor.id, returnPhase: state.phase, savedPending: state.pending };
        state.phase = "debt";
        addLog(state, `⚠ ${debtor.name} thiếu ${formatMoney(-debtor.money)}! Hãy bán nhà, thế chấp đất hoặc tuyên bố phá sản.`);
    }
}

function declareBankrupt(state, playerId) {
    const p = state.players[playerId];
    const creditor = p.owedTo === null || p.owedTo === undefined ? null : state.players[p.owedTo];

    // 1) Bán hết nhà / khách sạn cho ngân hàng (nửa giá) để gom tiền
    for (const id of ownedTileIds(state, playerId)) {
        const info = state.tiles[id];
        if (info.houses > 0) {
            p.money += (info.houses * COLOR_GROUPS[BOARD[id].group].houseCost) / 2;
            info.houses = 0;
        }
    }

    // 2) Phần tiền còn thiếu thì chủ nợ không nhận được (người phá sản chỉ trả được chừng đó)
    if (creditor && p.money < 0) creditor.money += p.money;

    // 3) Đất:
    //    - Đất đang THẾ CHẤP: luôn thuộc về ngân hàng (xóa thế chấp, thành đất trống)
    //    - Đất không thế chấp: về chủ nợ nếu nợ người chơi, về ngân hàng nếu nợ ngân hàng
    const toCreditor = [];
    for (const id of ownedTileIds(state, playerId)) {
        const info = state.tiles[id];
        if (creditor && !info.mortgaged) {
            info.owner = creditor.id;
            toCreditor.push(BOARD[id].name);
        } else {
            info.owner = null;
            info.mortgaged = false;
            info.mortgagedRound = null;
        }
    }
    for (const cardId of p.jailFreeCards) {
        if (creditor) creditor.jailFreeCards.push(cardId);
        else returnJailCard(state, cardId);
    }

    p.jailFreeCards = [];
    p.money = 0;
    p.inJail = false;
    p.bankrupt = true;
    addLog(state, `💀 ${p.name} phá sản.`);
    if (toCreditor.length) addLog(state, `${creditor.name} nhận: ${toCreditor.join(", ")}.`);
    addLog(state, "Đất đang thế chấp (nếu có) thuộc về ngân hàng.");

    // 4) Còn 1 người thì người đó thắng
    const alive = state.players.filter(pl => !pl.bankrupt);
    if (alive.length === 1) {
        state.winner = alive[0].id;
        state.phase = "gameOver";
        state.pending = null;
        addLog(state, `🏆 ${alive[0].name} CHIẾN THẮNG!`);
    }
}