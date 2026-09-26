// ============================================================
// main.js — KHỞI ĐỘNG GAME, NỐI engine <-> giao diện <-> mạng
// Hai chế độ:
//   "local"  : chơi chung 1 điện thoại (chuyền tay)
//   "online" : mỗi người 1 điện thoại, đồng bộ qua Firebase
// ============================================================

const SAVE_KEY = "cotyphu-save";          // ván chơi 1 máy
const NAMES_KEY = "cotyphu-names";        // tên đã nhập khi chơi 1 máy
const MY_NAME_KEY = "cotyphu-myname";     // tên của bạn khi chơi online
const ROOM_KEY = "cotyphu-room";          // phòng online gần nhất

let mode = null;           // "local" | "online"
let state = null;          // ván đang chơi
let room = null;           // dữ liệu phòng online mới nhất
let myId = null;           // null = chơi 1 máy (ai cũng bấm được); số = ghế của máy này
let busy = false;          // đang diễn hoạt cảnh -> tạm khóa nút
let sending = false;       // đang gửi hành động lên Firebase
let showAllLog = false;
let lastAnimatedMove = 0;  // id nước đi đã diễn hoạt cảnh
let stateQueue = Promise.resolve();

function canManage(playerId) { return myId === null || myId === playerId; }

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const cleanName = (s) => s.replace(/[<>&"'`]/g, "").trim().slice(0, 12);

// ---------- Lưu / tải (bọc try vì trình duyệt có thể chặn bộ nhớ) ----------
function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* bỏ qua */ }
}
function loadJSON(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
}
function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* bỏ qua */ }
}

// ============================================================
// VẼ MÀN HÌNH CHƠI
// ============================================================
function renderGame() {
    const app = document.getElementById("app");
    if (!document.getElementById("board-wrap")) {
        const right = mode === "online"
            ? `<span style="color:var(--muted);font-size:13px">Phòng <b style="color:var(--gold)">${Net.code}</b></span>
         <button class="link-btn" onclick="leaveRoom()">Rời phòng</button>`
            : `<button class="link-btn" onclick="newGame()">Ván mới</button>`;
        app.innerHTML = `
      <div class="topbar">
        <span class="title">CỜ TỶ PHÚ</span>
        <span style="display:flex;gap:8px;align-items:center">${right}</span>
      </div>
      <div id="board-wrap"></div>
      <div id="panel"></div>`;
    }
    renderBoard(state, document.getElementById("board-wrap"));
    const canAct = !busy && (myId === null || myId === state.current);
    renderPanel(state, document.getElementById("panel"), { canAct, showAllLog });
    Dialog.refresh();
}

function toggleLog() {
    showAllLog = !showAllLog;
    renderGame();
}

// ============================================================
// THAY ĐỔI STATE
// ============================================================

// Người chơi bấm nút -> gửi hành động
function act(type, extra = {}, playerId = state.current) {
    if (busy || sending) return;
    const action = { type, playerId, ...extra };

    if (mode === "online") {
        // Online: máy này CHỈ được hành động với tư cách của chính mình
        if (myId < 0) return toast("Bạn đang xem, không có ghế trong ván này");
        action.playerId = myId;
        // Gửi lên Firebase, state mới sẽ quay về qua onRoomUpdate
        sending = true;
        Net.sendAction(action).then(error => {
            sending = false;
            if (error) toast(error);
        });
        return;
    }

    // Chơi 1 máy: chạy engine ngay trên máy
    let newState;
    try {
        newState = applyAction(state, action);
    } catch (err) {
        toast(err.message);
        return;
    }
    setState(newState);
}

// Nhận state mới. Xếp hàng để hoạt cảnh không chồng lên nhau.
function setState(newState) {
    // .catch: nếu 1 lần vẽ bị lỗi thì các lần sau vẫn chạy tiếp (không bị "kẹt hàng")
    stateQueue = stateQueue.then(() => applyState(newState)).catch(err => console.error(err));
    return stateQueue;
}

async function applyState(newState) {
    const prev = state;
    state = newState;
    if (mode === "local") saveJSON(SAVE_KEY, state);

    const move = state.lastMove;
    if (!prev) lastAnimatedMove = move ? move.id : 0;   // mới vào: không diễn lại nước cũ

    // Quân cờ nhảy từng ô
    if (move && move.id !== lastAnimatedMove && document.getElementById("board-wrap")) {
        lastAnimatedMove = move.id;
        busy = true;
        const boardEl = document.getElementById("board-wrap");
        for (let k = 1; k <= move.steps; k++) {
            renderBoard(state, boardEl, { [move.playerId]: (move.from + k) % BOARD.length });
            await sleep(110);
        }
        busy = false;
    }

    renderGame();
    if (!prev) return;

    // Hộp thoại tự bật
    if (state.lastCard && state.lastCard !== prev.lastCard) {
        const card = findCard(state.lastCard);   // giữ lại thẻ, vì state.lastCard sẽ đổi ở lượt sau
        Dialog.open(() => cardDialogHtml(card));
    } else if (state.phase === "debt" && prev.phase !== "debt" && canManage(state.pending.debtorId)) {
        openProperties(state.pending.debtorId);
    } else if (state.phase === "gameOver" && prev.phase !== "gameOver") {
        Dialog.close();
    }
}

// Tung xúc xắc có hoạt cảnh lắc
async function doRoll() {
    if (busy || sending) return;
    busy = true;
    renderPanel(state, document.getElementById("panel"), { canAct: false, showAllLog });

    const diceEl = document.getElementById("dice");
    diceEl.classList.add("rolling");
    for (let k = 0; k < 6; k++) {
        diceEl.innerHTML = dieHtml(1 + Math.floor(Math.random() * 6)) + dieHtml(1 + Math.floor(Math.random() * 6));
        await sleep(80);
    }
    const dice = rollDice();
    diceEl.classList.remove("rolling");
    diceEl.innerHTML = dieHtml(dice[0]) + dieHtml(dice[1]);
    await sleep(250);

    busy = false;
    act("ROLL", { dice });
}

// ============================================================
// HỘP THOẠI
// ============================================================
function onTileClick(tileId) {
    if (!state || busy) return;
    Dialog.open(() => tileDialogHtml(state, tileId));
}

function openProperties(playerId) {
    Dialog.open(() => propertiesDialogHtml(state, playerId));
}

function confirmBankrupt(playerId) {
    if (confirm(`${state.players[playerId].name} chắc chắn tuyên bố phá sản?`)) {
        Dialog.close();
        act("DECLARE_BANKRUPT", {}, playerId);
    }
}

// ============================================================
// MÀN HÌNH CHÍNH
// ============================================================
function roomFromUrl() {
    const code = new URLSearchParams(location.search).get("room");
    return code ? code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4) : null;
}

function showHome() {
    Dialog.close();
    mode = null;
    state = null;
    myId = null;
    document.getElementById("app").innerHTML = homeScreenHtml({
        online: Net.init(),
        myName: loadJSON(MY_NAME_KEY) || "",
        roomFromUrl: roomFromUrl(),
        savedRoom: loadJSON(ROOM_KEY),
    });
}

// ============================================================
// CHƠI CHUNG 1 MÁY
// ============================================================
function showLocalSetup() {
    const saved = loadJSON(SAVE_KEY);
    const hasSaved = !!(saved && saved.phase && saved.phase !== "gameOver");
    document.getElementById("app").innerHTML = localSetupHtml(loadJSON(NAMES_KEY) || [], hasSaved);
}

function startLocalGame() {
    const names = [];
    for (let i = 0; i < 6; i++) {
        const v = cleanName(document.getElementById("name-" + i).value);
        if (v) names.push(v);
    }
    if (names.length < 2) return toast("Cần ít nhất 2 người chơi");
    saveJSON(NAMES_KEY, names);
    enterGame("local", createGame(names));
}

function continueLocalGame() {
    enterGame("local", loadJSON(SAVE_KEY));
}

function enterGame(newMode, firstState) {
    mode = newMode;
    myId = null;
    state = null;
    document.getElementById("app").innerHTML = "";
    setState(firstState);
}

function newGame() {
    if (mode === "online") {
        if (room && room.host === Net.clientId) {
            if (confirm("Bắt đầu ván mới với cùng những người trong phòng?")) {
                Net.startGame(room).catch(err => toast(err.message));
            }
        } else {
            leaveRoom();
        }
        return;
    }
    if (state && state.phase !== "gameOver" && !confirm("Bỏ ván đang chơi và bắt đầu ván mới?")) return;
    removeKey(SAVE_KEY);
    showLocalSetup();
}

// ============================================================
// CHƠI ONLINE
// ============================================================
function readMyName() {
    const name = cleanName(document.getElementById("my-name").value);
    if (!name) {
        toast("Nhập tên của bạn trước đã");
        return null;
    }
    saveJSON(MY_NAME_KEY, name);
    return name;
}

async function createRoomClick() {
    const name = readMyName();
    if (!name || sending) return;
    sending = true;
    try {
        await Net.createRoom(name);
        openRoom();
    } catch (err) {
        toast("Không tạo được phòng: " + err.message);
    }
    sending = false;
}

async function joinRoomClick(code) {
    const name = readMyName();
    if (!name || sending) return;
    code = code || document.getElementById("room-code").value;
    if (!code || code.trim().length < 4) return toast("Nhập mã phòng 4 ký tự");
    sending = true;
    try {
        await Net.joinRoom(code, name);
        openRoom();
    } catch (err) {
        toast(err.message);
    }
    sending = false;
}

function openRoom() {
    mode = "online";
    state = null;
    room = null;
    saveJSON(ROOM_KEY, Net.code);
    try { history.replaceState(null, "", location.pathname + "?room=" + Net.code); } catch (e) { /* mở bằng file:// thì bỏ qua */ }
    Net.listen(onRoomUpdate);
}

// Mỗi khi dữ liệu phòng trên Firebase thay đổi
function onRoomUpdate(newRoom) {
    if (mode !== "online") return;
    if (!newRoom) {
        toast("Phòng không còn tồn tại");
        leaveRoom();
        return;
    }
    room = newRoom;

    if (room.status !== "playing" || !room.state) {
        state = null;
        document.getElementById("app").innerHTML = lobbyScreenHtml(room, Net.code, Net.clientId);
        return;
    }

    const seats = Object.values(room.seats || {});
    myId = seats.indexOf(Net.clientId);        // -1 = chỉ xem (không có ghế)
    const newState = normalizeState(room.state);

    // Ván mới trong cùng phòng (turn quay về 1): vẽ lại từ đầu
    if (state && newState.turn < state.turn) state = null;
    if (!document.getElementById("board-wrap")) {
        document.getElementById("app").innerHTML = "";
        state = null;
    }
    setState(newState);
}

function shareRoom() {
    const url = location.href.split("?")[0] + "?room=" + Net.code;
    const text = `Vào chơi Cờ Tỷ Phú với mình! Mã phòng: ${Net.code}`;
    if (navigator.share) {
        navigator.share({ title: "Cờ Tỷ Phú", text, url }).catch(() => { });
    } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text + "\n" + url).then(() => toast("Đã copy link, dán vào Zalo/Messenger nhé"));
    } else {
        prompt("Copy link này gửi bạn bè:", url);
    }
}

async function startOnlineGame() {
    try {
        await Net.startGame(room);
    } catch (err) {
        toast(err.message);
    }
}

function leaveRoom() {
    Net.leave();
    removeKey(ROOM_KEY);
    room = null;
    try { history.replaceState(null, "", location.pathname); } catch (e) { /* bỏ qua */ }
    showHome();
}

showHome();