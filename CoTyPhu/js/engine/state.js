// ============================================================
// state.js — TẠO TRẠNG THÁI VÁN MỚI
//
// Toàn bộ ván chơi nằm trong MỘT object "state". Object này chỉ chứa
// số, chữ, mảng, object thường (không có hàm) để sau này gửi thẳng
// lên Firebase được. Mọi màn hình chỉ việc đọc state rồi vẽ ra.
// ============================================================

const PLAYER_COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f", "#9b59b6", "#e67e22"];

// Xáo trộn mảng (thuật toán Fisher–Yates), trả về mảng MỚI
function shuffle(array) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Tạo ván mới từ danh sách tên, ví dụ createGame(["An", "Bình", "Chi"])
function createGame(playerNames) {
    if (playerNames.length < 2 || playerNames.length > 6) {
        throw new Error("Cần từ 2 đến 6 người chơi");
    }

    // ---- Người chơi ----
    const players = playerNames.map((name, i) => ({
        id: i,
        name: name,
        color: PLAYER_COLORS[i],
        money: GAME_CONFIG.startMoney,
        position: 0,            // đang đứng ở ô số mấy (0 = Xuất phát)
        inJail: false,
        jailTurns: 0,           // đã ở tù bao nhiêu lượt
        jailFreeCards: [],      // mã thẻ Ra tù miễn phí đang giữ, ví dụ ["C13"]
        owedTo: null,           // lần trả tiền gần nhất là trả cho ai (id người chơi, null = ngân hàng)
        bankrupt: false,
    }));

    // ---- Tình trạng từng ô mua được (đất, ga, công ty) ----
    // houses: 0–4 là số nhà, 5 = khách sạn
    // mortgagedRound: thế chấp từ vòng thứ mấy (để tính luật "sau 6 vòng người khác được mua lại")
    const tiles = {};
    for (const tile of BOARD) {
        if (tile.price) {
            tiles[tile.id] = { owner: null, houses: 0, mortgaged: false, mortgagedRound: null };
        }
    }

    return {
        players: players,
        current: 0,              // tới lượt người chơi số mấy
        turn: 1,                 // lượt thứ mấy của cả ván
        round: 1,                // vòng thứ mấy (mỗi khi tất cả đã đi 1 lượt thì +1)
        phase: "roll",           // đang chờ làm gì (xem danh sách ở dưới)
        dice: [0, 0],            // kết quả xúc xắc lần gần nhất
        doublesCount: 0,         // đã đổ đôi mấy lần liên tiếp trong lượt này
        rolledDouble: false,     // lần tung vừa rồi có phải đôi không
        tiles: tiles,
        decks: {
            chance: shuffle(CHANCE_CARDS.map(c => c.id)),
            chest: shuffle(CHEST_CARDS.map(c => c.id)),
        },
        lastCard: null,          // thẻ vừa rút (để giao diện hiện lên)
        lastMove: null,          // nước đi gần nhất { id, playerId, from, steps } (để vẽ quân cờ nhảy)
        pending: null,           // dữ liệu tạm cho bước đang chờ (vd: số tiền phải trả)
        log: ["Ván mới bắt đầu! " + players[0].name + " đi trước."],
        winner: null,
    };
}

// Các giá trị của state.phase:
//   "roll"          : người chơi hiện tại cần tung xúc xắc (nếu ở tù: có thể nộp phạt / dùng thẻ)
//   "buy"           : vừa dừng ở ô chưa có chủ -> Mua hoặc Bỏ qua
//                     (state.pending = { seize: true } nếu là mua lại đất thế chấp quá 6 vòng của người khác)
//   "choosePlayer"  : thẻ bắt chọn 1 người để trả tiền
//   "endTurn"       : đã xong, chờ bấm Kết thúc lượt
//   "debt"          : có người bị âm tiền -> người đó phải bán nhà / thế chấp / tuyên bố phá sản
//                     (state.pending = { debtorId, returnPhase, savedPending })
//   "gameOver"      : đã có người thắng (state.winner = id người thắng)