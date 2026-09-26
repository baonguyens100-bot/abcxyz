// ============================================================
// cards.js — DỮ LIỆU thẻ Cơ Hội (Chance) và Khí Vận (Community Chest)
// Mỗi bộ 16 thẻ, lấy theo thẻ thật (số trong ngoặc là mã in trên thẻ).
// File này chỉ mô tả thẻ "làm gì"; phần thực hiện nằm ở engine/rules.js.
//
// Các loại hành động (action.type):
//   money            : nhận (+) hoặc trả (-) tiền với ngân hàng
//   moveTo           : đi tới ô `position`; đi qua GO thì nhận 2M
//   moveBack         : lùi `steps` ô (không nhận tiền GO)
//   nearest          : đi tới ga / công ty gần nhất phía trước
//                        - chưa ai mua: được quyền mua
//                        - đã có chủ: trả theo `rentMultiplier` hoặc `diceMultiplier`
//   goToJail         : vào tù ngay, không đi qua GO, không nhận 2M
//   jailFree         : thẻ Ra tù miễn phí — giữ lại tới khi dùng hoặc bán
//   repairs          : trả `perHouse` cho mỗi nhà, `perHotel` cho mỗi khách sạn
//   collectFromEach  : mỗi người chơi khác đưa cho bạn `amount`
//   payChosenPlayer  : bạn chọn 1 người chơi và trả cho họ `amount`
// ============================================================

// Vị trí vài ô hay được nhắc tới (khớp với BOARD trong board.js)
const POS = {
    GO: 0,
    RAIL: 5,        // Ga Đường sắt
    ISTANBUL: 11,
    LONDON: 24,
    MONTREAL: 39,
};

const CHANCE_CARDS = [
    {
        id: "C1", text: "Đi tàu hạng nhất tới Ga Đường sắt. Qua GO nhận ₩2M.",
        action: { type: "moveTo", position: POS.RAIL }
    },                               // 16-1
    {
        id: "C2", text: "Tới ga gần nhất. Chưa ai mua thì bạn được mua. Đã có chủ thì trả gấp đôi tiền thuê. Qua GO nhận ₩2M.",
        action: { type: "nearest", kind: "station", rentMultiplier: 2 }
    },              // 16-2
    {
        id: "C3", text: "Tới ga gần nhất. Chưa ai mua thì bạn được mua. Đã có chủ thì trả gấp đôi tiền thuê. Qua GO nhận ₩2M.",
        action: { type: "nearest", kind: "station", rentMultiplier: 2 }
    },              // 16-3
    {
        id: "C4", text: "Được giảm thuế vì lái xe hybrid. Nhận ₩500K.",
        action: { type: "money", amount: 500_000 }
    },                                   // 16-4
    {
        id: "C5", text: "Đi du lịch Istanbul. Qua GO nhận ₩2M.",
        action: { type: "moveTo", position: POS.ISTANBUL }
    },                           // 16-5
    {
        id: "C6", text: "Bị triệu tập làm bồi thẩm. Lùi lại 3 ô.",
        action: { type: "moveBack", steps: 3 }
    },                                       // 16-6
    {
        id: "C7", text: "Quyên góp cứu trợ thiên tai. Trả ₩150K.",
        action: { type: "money", amount: -150_000 }
    },                                  // 16-7
    {
        id: "C8", text: "Một người chơi kiện bạn. Chọn 1 người chơi và trả họ ₩500K.",
        action: { type: "payChosenPlayer", amount: 500_000 }
    },                         // 16-8
    {
        id: "C9", text: "Bị kết tội đánh cắp danh tính. Vào tù, không đi qua GO, không nhận ₩2M.",
        action: { type: "goToJail" }
    },                                                 // 16-9
    {
        id: "C10", text: "Thành phố định giá lại thuế. Trả ₩250K mỗi nhà và ₩1M mỗi khách sạn.",
        action: { type: "repairs", perHouse: 250_000, perHotel: 1_000_000 }
    },          // 16-10
    {
        id: "C11", text: "Bay tới London. Qua GO nhận ₩2M.",
        action: { type: "moveTo", position: POS.LONDON }
    },                             // 16-11
    // Thẻ in "10,000 times amount thrown" — thực ra là 10 lần × 10.000 = 100K mỗi điểm,
    // đúng bằng mức thuê khi có cả 2 công ty.
    {
        id: "C12", text: "Tới công ty gần nhất. Chưa ai mua thì bạn được mua. Đã có chủ thì tung xúc xắc và trả chủ 10 lần số điểm (×10.000). Qua GO nhận ₩2M.",
        action: { type: "nearest", kind: "utility", diceMultiplier: 100_000 }
    },        // 16-12
    {
        id: "C13", text: "Bạn được tha bổng. RA TÙ MIỄN PHÍ. Giữ thẻ này tới khi cần dùng hoặc bán.",
        action: { type: "jailFree" }
    },                                                 // 16-13
    {
        id: "C14", text: "Đi trực thăng tới Montreal. Qua GO nhận ₩2M.",
        action: { type: "moveTo", position: POS.MONTREAL }
    },                           // 16-14
    {
        id: "C15", text: "Nhận chức CEO ngân hàng đầu tư. Thưởng ký hợp đồng ₩1.5M.",
        action: { type: "money", amount: 1_500_000 }
    },                                 // 16-15
    {
        id: "C16", text: "Tiến tới ô Xuất phát. Nhận ₩2M.",
        action: { type: "moveTo", position: POS.GO }
    },                                 // 16-16
];

const CHEST_CARDS = [
    {
        id: "K1", text: "Học nhảy với huấn luyện viên nổi tiếng. Trả ₩500K.",
        action: { type: "money", amount: -500_000 }
    },                                  // 16-1
    {
        id: "K2", text: "Nợ thuế cũ. Trả ₩500K.",
        action: { type: "money", amount: -500_000 }
    },                                  // 16-2
    {
        id: "K3", text: "Bán vé xem cả mùa giải. Nhận ₩200K.",
        action: { type: "money", amount: 200_000 }
    },                                   // 16-3
    {
        id: "K4", text: "Quỹ tín thác của bạn đến hạn. Nhận ₩500K.",
        action: { type: "money", amount: 500_000 }
    },                                   // 16-4
    {
        id: "K5", text: "Thắng lớn ở sòng bài. Nhận ₩1M.",
        action: { type: "money", amount: 1_000_000 }
    },                                 // 16-5
    {
        id: "K6", text: "Quảng bá sách mới trên bản tin sáng. Nhận ₩100K tiền bán thêm.",
        action: { type: "money", amount: 100_000 }
    },                                   // 16-6
    {
        id: "K7", text: "Tranh cử thị trưởng. Mỗi người chơi góp cho bạn ₩100K.",
        action: { type: "collectFromEach", amount: 100_000 }
    },                         // 16-7
    {
        id: "K8", text: "Tiến tới ô Xuất phát. Nhận ₩2M.",
        action: { type: "moveTo", position: POS.GO }
    },                                 // 16-8
    {
        id: "K9", text: "Nổi tiếng ở Hollywood. Nhận ₩2M hợp đồng phim.",
        action: { type: "money", amount: 2_000_000 }
    },                                 // 16-9
    {
        id: "K10", text: "Làm lại sân vườn toàn bộ đất. Trả ₩400K mỗi nhà và ₩1.15M mỗi khách sạn.",
        action: { type: "repairs", perHouse: 400_000, perHotel: 1_150_000 }
    },          // 16-10
    {
        id: "K11", text: "Bị bắt vì giao dịch nội gián. Vào tù, không đi qua GO, không nhận ₩2M.",
        action: { type: "goToJail" }
    },                                                 // 16-11
    {
        id: "K12", text: "Về nhì trong một chương trình truyền hình thực tế. Nhận ₩100K.",
        action: { type: "money", amount: 100_000 }
    },                                   // 16-12
    {
        id: "K13", text: "Trúng xổ số. Nhận ₩1M.",
        action: { type: "money", amount: 1_000_000 }
    },                                 // 16-13
    {
        id: "K14", text: "Được chọn làm linh vật cho trận đấu lớn. Nhận ₩250K.",
        action: { type: "money", amount: 250_000 }
    },                                   // 16-14
    {
        id: "K15", text: "Mạng máy tính bị nhiễm virus. Trả ₩1M.",
        action: { type: "money", amount: -1_000_000 }
    },                                // 16-15
    {
        id: "K16", text: "Được ân xá. RA TÙ MIỄN PHÍ. Giữ thẻ này tới khi cần dùng hoặc bán.",
        action: { type: "jailFree" }
    },                                                 // 16-16
];