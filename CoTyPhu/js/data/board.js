// ============================================================
// board.js — DỮ LIỆU bàn cờ (40 ô) và các con số của luật chơi
// File này chỉ chứa dữ liệu, không chứa logic chơi.
// Tiền lưu bằng số nguyên: 600_000 = 600K, 2_000_000 = 2M
// (dấu _ chỉ để dễ đọc, JavaScript tự bỏ qua nó)
// ============================================================

const CURRENCY = "₩";

// ---------- Các con số của luật (lấy theo sách hướng dẫn) ----------
const GAME_CONFIG = {
    startMoney: 15_000_000,   // mỗi người bắt đầu với 15M
    goSalary: 2_000_000,      // đi qua GO nhận 2M
    jailFine: 500_000,        // nộp 500K để ra tù
    jailPosition: 10,         // vị trí ô Tù trên bàn
    maxJailTurns: 3,          // tối đa 3 lượt thử đổ đôi trong tù
    auctionStart: 100_000,    // đấu giá bắt đầu từ 100K
    auctionStep: 10_000,      // mỗi lần trả giá tăng ít nhất 10K
    maxHouses: 4,             // đủ 4 nhà mới được lên khách sạn
    maxBuildsPerTurn: 2,      // mỗi lượt chỉ được xây tối đa 2 lần (nhà hoặc khách sạn)
    colourSetMultiplier: 2,   // có đủ bộ màu (chưa xây nhà) -> thuê gấp đôi
};

// ---------- Nhóm màu: màu hiển thị + giá xây 1 nhà ----------
// Khách sạn cùng giá với 1 nhà (cộng thêm việc trả lại 4 nhà) — theo thẻ Title Deed
const COLOR_GROUPS = {
    brown: { color: "#8B4513", houseCost: 500_000 },
    lightBlue: { color: "#87CEEB", houseCost: 500_000 },
    pink: { color: "#9B3FA0", houseCost: 1_000_000 },
    orange: { color: "#F7941D", houseCost: 1_000_000 },
    red: { color: "#ED1B24", houseCost: 1_500_000 },
    yellow: { color: "#FEF200", houseCost: 1_500_000 },
    green: { color: "#1FB25A", houseCost: 2_000_000 },
    darkBlue: { color: "#0072BB", houseCost: 2_000_000 },
};

// Tiền thuê ga theo số ga mà chủ sở hữu có: 1, 2, 3, 4 ga (theo sách trang 8)
const STATION_RENT = [250_000, 500_000, 1_000_000, 2_000_000];

// Tiền thuê công ty = tổng xúc xắc × hệ số
// [có 1 công ty, có cả 2 công ty]  (sách: 4 lần và 10 lần, nhân 10.000)
const UTILITY_MULTIPLIER = [40_000, 100_000];

// ---------- Hàm tạo ô cho gọn ----------
// rent = [đất trống, 1 nhà, 2 nhà, 3 nhà, 4 nhà, khách sạn]  (lấy từ thẻ Title Deed)
// "Thuê khi đủ bộ màu" không cần ghi riêng: luôn = đất trống × 2
function street(name, group, price, rent) {
    return { type: "street", name, group, price, rent };
}
function station(name) {
    return { type: "station", name, price: 2_000_000 };
}
function utility(name) {
    return { type: "utility", name, price: 1_500_000 };
}

// ---------- 40 ô, đi theo chiều từ ô Xuất phát ----------
// Các loại ô: go, street, station, utility, tax, chance, chest, jail, free, goToJail
const BOARD = [
  // ===== Cạnh 1 =====
  /* 0 */ { type: "go", name: "Xuất phát" },
  /* 1 */ street("Gdynia", "brown", 600_000, [20_000, 100_000, 300_000, 900_000, 1_600_000, 2_500_000]),
  /* 2 */ { type: "chest", name: "Khí Vận" },
  /* 3 */ street("Taipei", "brown", 600_000, [40_000, 200_000, 600_000, 1_800_000, 3_200_000, 4_500_000]),
  /* 4 */ { type: "tax", name: "Thuế thu nhập", amount: 2_000_000 },
  /* 5 */ station("Ga Đường sắt"),
  /* 6 */ street("Tokyo", "lightBlue", 1_000_000, [60_000, 300_000, 900_000, 2_700_000, 4_000_000, 5_500_000]),
  /* 7 */ { type: "chance", name: "Cơ Hội" },
  /* 8 */ street("Barcelona", "lightBlue", 1_000_000, [60_000, 300_000, 900_000, 2_700_000, 4_000_000, 5_500_000]),
  /* 9 */ street("Athens", "lightBlue", 1_200_000, [80_000, 400_000, 1_000_000, 3_000_000, 4_500_000, 6_000_000]),

  // ===== Cạnh 2 =====
  /* 10 */ { type: "jail", name: "Nhà tù / Thăm tù" },
  /* 11 */ street("Istanbul", "pink", 1_400_000, [100_000, 500_000, 1_500_000, 4_500_000, 6_250_000, 7_500_000]),
  /* 12 */ utility("Điện Mặt Trời"),
  /* 13 */ street("Kyiv", "pink", 1_400_000, [100_000, 500_000, 1_500_000, 4_500_000, 6_250_000, 7_500_000]),
  /* 14 */ street("Toronto", "pink", 1_600_000, [120_000, 600_000, 1_800_000, 5_000_000, 7_000_000, 9_000_000]),
  /* 15 */ station("Ga Hàng không"),
  /* 16 */ street("Rome", "orange", 1_800_000, [140_000, 700_000, 2_000_000, 5_500_000, 7_500_000, 9_500_000]),
  /* 17 */ { type: "chest", name: "Khí Vận" },
  /* 18 */ street("Shanghai", "orange", 1_800_000, [140_000, 700_000, 2_000_000, 5_500_000, 7_500_000, 9_500_000]),
  /* 19 */ street("Vancouver", "orange", 2_000_000, [160_000, 800_000, 2_200_000, 6_000_000, 8_000_000, 10_000_000]),

  // ===== Cạnh 3 =====
  /* 20 */ { type: "free", name: "Bãi đỗ xe miễn phí" },
  /* 21 */ street("Sydney", "red", 2_200_000, [180_000, 900_000, 2_500_000, 7_000_000, 8_750_000, 10_500_000]),
  /* 22 */ { type: "chance", name: "Cơ Hội" },
  /* 23 */ street("New York", "red", 2_200_000, [180_000, 900_000, 2_500_000, 7_000_000, 8_750_000, 10_500_000]),
  /* 24 */ street("London", "red", 2_400_000, [200_000, 1_000_000, 3_000_000, 7_500_000, 9_250_000, 11_000_000]),
  /* 25 */ station("Ga Du thuyền"),
  /* 26 */ street("Beijing", "yellow", 2_600_000, [220_000, 1_100_000, 3_300_000, 8_000_000, 9_750_000, 11_500_000]),
  /* 27 */ street("Hong Kong", "yellow", 2_600_000, [220_000, 1_100_000, 3_300_000, 8_000_000, 9_750_000, 11_500_000]),
  /* 28 */ utility("Điện Gió"),
  /* 29 */ street("Jerusalem", "yellow", 2_800_000, [240_000, 1_200_000, 3_600_000, 8_500_000, 10_250_000, 12_000_000]),

  // ===== Cạnh 4 =====
  /* 30 */ { type: "goToJail", name: "Vào tù" },
  /* 31 */ street("Paris", "green", 3_000_000, [260_000, 1_300_000, 3_900_000, 9_000_000, 11_000_000, 12_750_000]),
  /* 32 */ street("Belgrade", "green", 3_000_000, [260_000, 1_300_000, 3_900_000, 9_000_000, 11_000_000, 12_750_000]),
  /* 33 */ { type: "chest", name: "Khí Vận" },
  /* 34 */ street("Cape Town", "green", 3_200_000, [280_000, 1_500_000, 4_500_000, 10_000_000, 12_000_000, 14_000_000]),
  /* 35 */ station("Ga Vũ trụ"),
  /* 36 */ { type: "chance", name: "Cơ Hội" },
  /* 37 */ street("Riga", "darkBlue", 3_500_000, [350_000, 1_750_000, 5_000_000, 11_000_000, 13_000_000, 15_000_000]),
  /* 38 */ { type: "tax", name: "Thuế đặc biệt", amount: 1_000_000 },
  /* 39 */ street("Montreal", "darkBlue", 4_000_000, [500_000, 2_000_000, 6_000_000, 14_000_000, 17_000_000, 20_000_000]),
];

// Gắn số thứ tự (id) và giá thế chấp cho từng ô
//   mortgage   = 1/2 giá đất                        (Gdynia 600K -> 300K)
//   unmortgage = mortgage + 10%, làm tròn LÊN 10K   (Điện Gió 750K -> 830K, giống thẻ thật)
BOARD.forEach((tile, index) => {
    tile.id = index;
    if (tile.price) {
        tile.mortgage = tile.price / 2;
        tile.unmortgage = Math.ceil((tile.mortgage * 11) / 10 / 10_000) * 10_000;
    }
});

// ---------- Định dạng tiền: 600000 -> "₩600K", 1500000 -> "₩1.5M" ----------
function formatMoney(amount) {
    const sign = amount < 0 ? "-" : "";
    const n = Math.abs(amount);
    let text;
    if (n >= 1_000_000) text = +(n / 1_000_000).toFixed(2) + "M";
    else if (n >= 1_000) text = +(n / 1_000).toFixed(1) + "K";
    else text = String(n);
    return sign + CURRENCY + text;
}