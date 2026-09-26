// ============================================================
// room.js — CHƠI ONLINE QUA FIREBASE REALTIME DATABASE
//
// Mỗi phòng nằm ở: rooms/<MÃ PHÒNG> = {
//   status: "lobby" | "playing",
//   host:   clientId của người tạo phòng,
//   lobby:  { clientId: { name, joinedAt } },   // ai đã vào phòng
//   seats:  [clientId, clientId, ...],           // ghế số 0,1,2... là máy nào
//   state:  <state của ván chơi>                 // giống hệt state khi chơi 1 máy
// }
//
// Cách đồng bộ: mọi máy cùng "nghe" phòng. Khi ai bấm nút, máy đó chạy
// applyAction trên bản state MỚI NHẤT của server (transaction) rồi ghi lại.
// Hai người bấm cùng lúc cũng không ghi đè nhau.
// ============================================================

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // bỏ I, O, 0, 1 cho khỏi nhầm
const MAX_PLAYERS = 6;

function isFirebaseConfigured() {
    return typeof FIREBASE_CONFIG !== "undefined"
        && typeof firebase !== "undefined"
        && !FIREBASE_CONFIG.apiKey.startsWith("DAN_");
}

// Mỗi trình duyệt có 1 mã riêng, lưu lại để tải lại trang vẫn nhận ra mình
function getClientId() {
    let id = null;
    try { id = localStorage.getItem("cotyphu-client"); } catch (e) { /* bỏ qua */ }
    if (!id) {
        id = "c" + Math.random().toString(36).slice(2, 10);
        try { localStorage.setItem("cotyphu-client", id); } catch (e) { /* bỏ qua */ }
    }
    return id;
}

// ------------------------------------------------------------
// Firebase KHÔNG lưu giá trị null, mảng rỗng [] và object rỗng {},
// và có thể biến object có khóa là số (như tiles) thành mảng.
// Hàm này "sửa" state đọc từ Firebase về đúng hình dạng engine cần.
// ------------------------------------------------------------
function normalizeState(raw) {
    if (!raw) return null;
    const s = raw;

    s.players = Object.values(s.players || {}).map(p => ({
        ...p,
        jailFreeCards: p.jailFreeCards ? Object.values(p.jailFreeCards) : [],
        owedTo: p.owedTo ?? null,
        inJail: !!p.inJail,
        bankrupt: !!p.bankrupt,
        jailTurns: p.jailTurns || 0,
        position: p.position || 0,
        money: p.money || 0,
    }));

    const tiles = {};
    for (const tile of BOARD) {
        if (!tile.price) continue;
        const t = (s.tiles && s.tiles[tile.id]) || {};
        tiles[tile.id] = { owner: t.owner ?? null, houses: t.houses || 0, mortgaged: !!t.mortgaged };
    }
    s.tiles = tiles;

    s.decks = {
        chance: s.decks && s.decks.chance ? Object.values(s.decks.chance) : [],
        chest: s.decks && s.decks.chest ? Object.values(s.decks.chest) : [],
    };
    s.dice = s.dice ? Object.values(s.dice) : [0, 0];
    s.log = s.log ? Object.values(s.log) : [];
    s.current = s.current || 0;
    s.doublesCount = s.doublesCount || 0;
    s.rolledDouble = !!s.rolledDouble;
    s.lastCard = s.lastCard ?? null;
    s.lastMove = s.lastMove ?? null;
    s.winner = s.winner ?? null;
    s.pending = s.pending ?? null;
    if (s.pending && s.phase === "debt") s.pending.savedPending = s.pending.savedPending ?? null;
    return s;
}

// ============================================================
const Net = {
    db: null,
    code: null,
    clientId: getClientId(),
    roomRef: null,

    init() {
        if (this.db) return true;
        if (!isFirebaseConfigured()) return false;
        firebase.initializeApp(FIREBASE_CONFIG);
        this.db = firebase.database();
        return true;
    },

    // ---------- Tạo phòng mới ----------
    async createRoom(name) {
        let code = "";
        for (let attempt = 0; attempt < 10; attempt++) {
            code = "";
            for (let i = 0; i < 4; i++) code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
            const snap = await this.db.ref("rooms/" + code).get();
            if (!snap.exists()) break;   // mã chưa ai dùng
        }
        await this.db.ref("rooms/" + code).set({
            status: "lobby",
            host: this.clientId,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lobby: { [this.clientId]: { name, joinedAt: firebase.database.ServerValue.TIMESTAMP } },
        });
        this.code = code;
        return code;
    },

    // ---------- Vào phòng có sẵn ----------
    async joinRoom(code, name) {
        code = code.trim().toUpperCase();
        const snap = await this.db.ref("rooms/" + code).get();
        if (!snap.exists()) throw new Error("Không tìm thấy phòng " + code);
        const room = snap.val();

        if (room.status === "playing") {
            const seats = Object.values(room.seats || {});
            if (!seats.includes(this.clientId)) throw new Error("Phòng này đã bắt đầu chơi");
        } else {
            const lobby = room.lobby || {};
            if (!lobby[this.clientId] && Object.keys(lobby).length >= MAX_PLAYERS) {
                throw new Error("Phòng đã đủ " + MAX_PLAYERS + " người");
            }
            await this.db.ref(`rooms/${code}/lobby/${this.clientId}`).update({
                name,
                joinedAt: (lobby[this.clientId] && lobby[this.clientId].joinedAt) || firebase.database.ServerValue.TIMESTAMP,
            });
        }
        this.code = code;
        return code;
    },

    // ---------- Nghe mọi thay đổi của phòng ----------
    listen(onRoom) {
        this.stopListening();
        this.roomRef = this.db.ref("rooms/" + this.code);
        this.roomRef.on("value", snap => onRoom(snap.val()));
    },

    stopListening() {
        if (this.roomRef) this.roomRef.off();
        this.roomRef = null;
    },

    // Danh sách người trong phòng chờ, theo thứ tự vào phòng
    lobbyList(room) {
        return Object.entries(room.lobby || {})
            .map(([clientId, info]) => ({ clientId, name: info.name, joinedAt: info.joinedAt || 0 }))
            .sort((a, b) => a.joinedAt - b.joinedAt);
    },

    // ---------- Chủ phòng bấm Bắt đầu ----------
    async startGame(room) {
        const list = this.lobbyList(room);
        if (list.length < 2) throw new Error("Cần ít nhất 2 người");
        const names = list.map(p => String(p.name).replace(/[<>&"'`]/g, "").slice(0, 12) || "?");
        const state = createGame(names);
        await this.roomRef.update({
            status: "playing",
            seats: list.map(p => p.clientId),
            state: JSON.parse(JSON.stringify(state)),
        });
    },

    // ---------- Gửi 1 hành động ----------
    // Chạy applyAction trên state mới nhất của server. Sai luật -> trả về câu báo lỗi.
    async sendAction(action) {
        let error = null;
        const result = await this.roomRef.child("state").transaction(current => {
            if (current === null) return current;          // chưa có dữ liệu: Firebase sẽ tự thử lại
            try {
                error = null;
                const next = applyAction(normalizeState(current), action);
                return JSON.parse(JSON.stringify(next));     // bỏ các giá trị undefined
            } catch (err) {
                error = err.message;
                return;                                      // trả về undefined = hủy, không ghi
            }
        }, undefined, false);
        if (!result.committed) return error || "Không gửi được, thử lại nhé";
        return null;
    },

    leave() {
        this.stopListening();
        this.code = null;
    },
};