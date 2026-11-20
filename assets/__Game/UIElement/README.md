# UIElement: Hướng dẫn làm UI bằng HTML + CSS trong Cocos

UIElement cho phép bạn viết UI game bằng **HTML và CSS** thay vì dựng node Cocos. Cách làm giống **UI Toolkit** của Unity (UIDocument + UXML + USS). UI hiển thị thành một lớp đặt đè lên game, nên bạn dùng được mọi thứ của CSS: flexbox, animation, gradient, shadow, `<input>`...

**3 điều cần nhớ trước khi bắt đầu**

1. **Chỉ chạy trên web** (Browser preview, build Web, playable qua `super-html`). Simulator và build native không hiển thị UI.
2. **Container phủ kín màn hình phải có `picking-mode="ignore"`**, nếu không game sẽ không nhận được chạm.
3. **Ảnh phải khai báo qua `asset(key)`**, không trỏ đường dẫn file được.

---

## Mục lục

- [Phần 1: Làm UI đầu tiên từng bước](#phần-1-làm-ui-đầu-tiên-từng-bước)
- [Phần 2: Các việc hay làm](#phần-2-các-việc-hay-làm)
- [Phần 3: Xử lý lỗi thường gặp](#phần-3-xử-lý-lỗi-thường-gặp)
- [Tra cứu nhanh](#tra-cứu-nhanh)

> **App nhiều màn** (stack, tabs, modal, chuyển màn có hiệu ứng): xem [NAVIGATION.md](NAVIGATION.md).

---

## Phần 1: Làm UI đầu tiên từng bước

Mục tiêu: làm UI cho một playable gồm **bộ đếm xu**, dòng **"Chạm để chơi"** và **end card** có nút **TẢI NGAY**.

```
┌──────────────────────┐        ┌──────────────────────┐
│ ● 12                 │        │                      │
│                      │        │     Tuyệt vời!       │
│       (game)         │  ───►  │ Bạn nhặt được 12 xu  │
│                      │        │                      │
│    Chạm để chơi      │        │  [   TẢI NGAY   ]    │
└──────────────────────┘        └──────────────────────┘
      Đang chơi                       Kết thúc
```

### Bước 1: Tạo file HTML

Tạo thư mục `assets/UI/` rồi tạo file `GameUI.html`. Cocos tự nhận file `.html` là TextAsset.

```html
<!-- Lớp phủ toàn màn hình: chỉ để dàn layout, nên cho chạm xuyên qua -->
<div class="screen" picking-mode="ignore">

    <!-- Bộ đếm xu: data-bind hiển thị giá trị state.coins -->
    <div class="coins">
        <span class="coin-icon"></span>
        <span data-bind="coins"></span>
    </div>

    <!-- Chỉ hiện khi CHƯA kết thúc; không chặn chạm -->
    <div class="hint" picking-mode="ignore" data-show="!finished">Chạm để chơi</div>

    <!-- Chỉ hiện khi đã kết thúc -->
    <div class="end-card" data-show="finished">
        <h1>Tuyệt vời!</h1>
        <p>Bạn nhặt được <b data-bind="coins"></b> xu</p>
        <button class="btn-install" data-action="install">TẢI NGAY</button>
    </div>
</div>
```

Chỉ cần viết phần nội dung, **không cần** `<html>`, `<head>`, `<body>`.

### Bước 2: Tạo file CSS

Tạo `assets/UI/GameUI.css`:

```css
.screen {
    flex: 1;                 /* lấp đầy màn hình */
    position: relative;
}

.coins {
    position: absolute;
    top: 24px;
    left: 24px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 20px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.5);
    font-size: 32px;
    font-weight: bold;
}

.coin-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #f5b400;
}

.hint {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 160px;
    text-align: center;
    font-size: 40px;
    font-weight: bold;
    text-shadow: 0 3px 0 #000;
    animation: pulse 0.8s ease-in-out infinite alternate;
}

.end-card {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 24px;
    background: rgba(0, 0, 0, 0.7);
    animation: fade-in 0.3s;
}

.end-card h1 { margin: 0; font-size: 72px; }
.end-card p  { margin: 0; font-size: 32px; }

.btn-install {
    padding: 24px 64px;
    border: none;
    border-radius: 20px;
    color: #fff;
    font-size: 44px;
    font-weight: bold;
    background: linear-gradient(#5fe07a, #25a846);
    box-shadow: 0 8px 0 #17712d;
    animation: pulse 0.8s ease-in-out infinite alternate;
}

.btn-install:active {
    filter: brightness(0.85);
}

@keyframes pulse {
    from { transform: scale(1); }
    to   { transform: scale(1.08); }
}

@keyframes fade-in {
    from { opacity: 0; }
}
```

Viết CSS với đơn vị `px` **theo Design Resolution của project** (ví dụ 720×1280). Framework tự scale cho vừa mọi màn hình.

### Bước 3: Viết script điều khiển

Tạo `assets/UI/GameUI.ts`:

```ts
import { _decorator, Component } from 'cc';
import { UIDocument } from '../UIElement/Scripts/UIDocument';
import super_html_playable from '../Scripts/super_html_playable';
const { ccclass, requireComponent } = _decorator;

@ccclass('GameUI')
@requireComponent(UIDocument)
export class GameUI extends Component {
    private state = { coins: 0, finished: false };

    start() {
        const doc = this.getComponent(UIDocument)!;

        // bind() trả về bản "reactive" của state: gán giá trị mới thì UI tự cập nhật
        this.state = doc.bind(this.state);

        // Nút có data-action="install"
        doc.onAction('install', () => super_html_playable.download());
    }

    // Các hàm để code game gọi vào
    addCoins(amount: number) {
        this.state.coins += amount;
    }

    finish() {
        this.state.finished = true;
    }
}
```

Ý tưởng chính: **HTML chỉ khai báo chỗ hiển thị** (`data-bind`, `data-show`). **Script chỉ đổi dữ liệu**, không cần tự tìm phần tử để sửa text hay ẩn/hiện.

### Bước 4: Gắn vào scene

1. Trong **Hierarchy**, tạo một node trống tên `GameUI` (**Create → Empty Node**). Node đặt ở đâu cũng được, không cần nằm dưới `Canvas`.
2. Chọn node đó, **Add Component**, tìm và thêm **UIDocument**.
3. Kéo `GameUI.html` vào ô **Html Asset**.
4. Ở **Style Sheets**, tăng số phần tử lên 1 rồi kéo `GameUI.css` vào.
5. **Add Component** tiếp và thêm **GameUI** (script vừa viết).

### Bước 5: Gọi UI từ code game

Trong script game, kéo node `GameUI` vào property rồi gọi hàm:

```ts
import { GameUI } from '../UI/GameUI';

@ccclass('Player')
export class Player extends Component {
    @property(GameUI)
    gameUI: GameUI | null = null;

    onPickCoin() {
        this.gameUI!.addCoins(1);
    }

    onLevelComplete() {
        this.gameUI!.finish();      // end card hiện ra, kèm animation fade-in
    }
}
```

### Bước 6: Chạy thử

Trên thanh công cụ của editor, chọn chế độ preview **Browser** (Trình duyệt) rồi bấm **▶**.

- UI **không hiện trong Scene view**. Đó là bình thường, chỉ xem được khi preview.
- Mở DevTools (F12) → **Elements**. UI nằm trong thẻ `<div class="cc-ui-document">` → `#shadow-root`. Ở đó bạn có thể sửa CSS trực tiếp để thử, rồi chép lại vào file `.css`.

Nếu không thấy UI hoặc bấm không ăn, xem [Phần 3](#phần-3-xử-lý-lỗi-thường-gặp).

> Sample đầy đủ hơn (nhập tên, checkbox, danh sách shop) nằm trong [Samples/](Samples/). Mở `MainMenu.html`, `MainMenu.css` và `MainMenuController.ts` để tham khảo.

---

## Phần 2: Các việc hay làm

### Cho chạm xuyên qua UI xuống game

Mọi phần tử **mặc định chặn chạm**. Thêm `picking-mode="ignore"` cho những phần tử chỉ dùng để dàn layout hoặc chỉ để trang trí:

```html
<div class="screen" picking-mode="ignore">          <!-- ignore: game vẫn nhận chạm -->
    <div class="top-bar" picking-mode="ignore">     <!-- ignore -->
        <button data-action="pause">II</button>     <!-- nút vẫn bấm được -->
    </div>
    <img class="arrow-tutorial" picking-mode="ignore" src="asset(arrow)">
</div>
```

`picking-mode` **không truyền xuống con**: con của phần tử ignore vẫn chặn chạm, trừ khi cũng được đánh dấu ignore.

### Ẩn / hiện một phần tử

Nên dùng binding:

```html
<div class="popup" data-show="showPopup">...</div>
<div class="hud" data-show="!showPopup">...</div>
```

```ts
this.state.showPopup = true;
```

Mỗi lần phần tử hiện lại, animation CSS của nó **chạy lại từ đầu**. Nhờ vậy popup có sẵn hiệu ứng mở chỉ cần `animation: ...` trong CSS.

Nếu muốn ẩn/hiện **cả một màn hình UI**, tắt component: `doc.enabled = false`.

### Đổi text, class, style từ code

Cách nhanh nhất là dùng binding:

```html
<span data-bind="player.name"></span>
<div class="hp-bar" data-class="danger: lowHp; full: isFull"></div>
```

Khi cần điều khiển trực tiếp, lấy phần tử ra và dùng DOM API bình thường:

```ts
const bar = doc.q<HTMLElement>('.hp-fill')!;
bar.style.width = `${hp}%`;
bar.classList.add('flash');
```

### Bắt sự kiện bấm nút

Có 2 cách:

```html
<button data-action="retry">Chơi lại</button>
<button class="btn-skin" data-skin="red">Red</button>
<button class="btn-skin" data-skin="blue">Blue</button>
```

```ts
// Cách 1: theo tên action, dùng cho nút đơn lẻ
doc.onAction('retry', () => this.restart());

// Cách 2: theo CSS selector, dùng cho nhiều nút cùng loại
doc.onClick('.btn-skin', (ev, button) => {
    this.selectSkin(button.dataset.skin!);
});
```

Cả hai cách đều **tự hoạt động với phần tử thêm vào sau** (ví dụ item clone từ template). Dùng `doc.on(selector, 'pointerdown', ...)` cho các event khác.

### Tạo danh sách động (shop, bảng xếp hạng...)

1. Khai báo mẫu trong HTML bằng `<template>`:

```html
<ul class="shop" id="shop-list"></ul>

<template id="shop-item">
    <li class="shop-item">
        <span class="name"></span>
        <button class="btn-buy">Mua</button>
    </li>
</template>
```

2. Clone và thêm vào danh sách trong code:

```ts
const list = doc.q('#shop-list')!;
for (const item of items) {
    const el = doc.instantiate('shop-item')!;
    el.dataset.id = item.id;
    el.querySelector('.name')!.textContent = item.name;
    list.appendChild(el);
}

doc.onClick('.btn-buy', (_ev, btn) => {
    const id = btn.closest<HTMLElement>('.shop-item')!.dataset.id;
    this.buy(id);
});
```

### Dùng ảnh (SpriteFrame)

1. Chọn node có `UIDocument`, ở list **Assets** thêm một phần tử: điền **Key** (ví dụ `logo`) và kéo **SpriteFrame** vào.
2. Dùng trong HTML hoặc CSS bằng `asset(key)`:

```html
<img class="logo" src="asset(logo)">
```

```css
.panel {
    background-image: asset(panel_bg);
    background-size: 100% 100%;
}
```

3. Đổi ảnh lúc chạy:

```ts
doc.q<HTMLImageElement>('.logo')!.src = doc.assetUrl('logo_gold');
```

Ảnh trong atlas hay bị xoay khi pack đều được xử lý đúng. Ảnh UI nên để định dạng PNG/JPG, không dùng texture nén.

### Nhận chữ người chơi nhập

```html
<input class="name-input" data-bind="playerName" placeholder="Tên của bạn" maxlength="16">
<label><input type="checkbox" data-bind="sound"> Âm thanh</label>
```

```css
.name-input {
    user-select: text;              /* bắt buộc: framework tắt chọn chữ mặc định */
    -webkit-user-select: text;
}
```

Binding hai chiều: người chơi gõ thì `state.playerName` đổi theo, và gán `state.playerName` thì ô input cũng đổi.

### Ẩn nút tải khi ad network tự chèn nút

Một số network (ví dụ Google) tự thêm nút tải riêng:

```html
<button class="btn-install" data-action="install" data-show="showInstall">TẢI NGAY</button>
```

```ts
this.state = doc.bind({ showInstall: !super_html_playable.is_hide_download(), /* ... */ });
```

### Hỗ trợ cả màn hình dọc và ngang

- Mặc định UI scale theo Design Resolution với **Match = 0.5**. Chỉnh **Match** về `0` để luôn khớp chiều rộng, hoặc `1` để luôn khớp chiều cao.
- Dùng flexbox và `%` thay vì cố định `width`/`left` lớn.
- Viết riêng CSS cho màn ngang bằng media query:

```css
.end-card { flex-direction: column; }

@media (orientation: landscape) {
    .end-card { flex-direction: row; }
    .hint     { bottom: 60px; }
}
```

### Nhiều màn hình UI chồng nhau

Tạo mỗi màn hình trên một node riêng, mỗi node có một `UIDocument` (ví dụ HUD, Popup, Tutorial). Đặt **Sorting Order** cao hơn cho lớp muốn nằm trên. CSS của mỗi document **tách biệt nhau**, nên class trùng tên (như `.btn` ở cả hai file) không ảnh hưởng nhau.

Nếu cần chuyển qua lại giữa các màn (menu → shop → popup xác nhận...) trong **cùng một** document, dùng [UINavigation](NAVIGATION.md).

### Chia sẻ dữ liệu giữa nhiều binding

Tạo store bằng `reactive()` rồi `bind` nó ở nhiều nơi. Sửa ở đâu thì mọi nơi đang hiển thị dữ liệu đó đều tự cập nhật:

```ts
import { reactive } from '../UIElement/Scripts/UIBinding';

export const store = reactive({ coins: 0 });
doc.bind(store);
store.coins += 10;       // mọi binding dùng store đều cập nhật
```

### Tách HTML ra nhiều file

Kéo thêm các file `.html` vào danh sách **Templates** của `UIDocument`. Nội dung của chúng được nối sau **Html Asset**, rất tiện để mỗi `<template>` (mỗi màn) nằm trong một file riêng.

### Dùng font riêng

Playable thường không được tải file ngoài, nên hãy nhúng font dạng base64 ngay trong CSS:

```css
@font-face {
    font-family: 'GameFont';
    src: url(data:font/woff2;base64,d09GMgABAAAAA...) format('woff2');
}
.ui-root { font-family: 'GameFont', Arial, sans-serif; }
```

### Tự làm component UI dùng lại (như custom control của Unity)

Dùng Web Components chuẩn, định nghĩa một lần rồi dùng như thẻ HTML:

```ts
class HealthBar extends HTMLElement {
    static observedAttributes = ['value'];
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `
            <style>
                :host { display: block; height: 16px; background: #333; border-radius: 8px; overflow: hidden; }
                .fill { height: 100%; background: #e53935; transition: width .2s; }
            </style>
            <div class="fill"></div>`;
    }
    attributeChangedCallback() {
        (this.shadowRoot!.querySelector('.fill') as HTMLElement).style.width = `${this.getAttribute('value') ?? 0}%`;
    }
}
if (!customElements.get('health-bar')) customElements.define('health-bar', HealthBar);
```

```html
<health-bar value="75"></health-bar>
```

### Viết JS ngay trong file HTML (particle, hiệu ứng nhỏ)

Thẻ `<script>` viết thẳng trong file `.html` sẽ được chạy. Cách này hợp với các hiệu ứng nhỏ tự chạy độc lập như particle, pháo giấy, tuyết rơi. Logic game và xử lý dữ liệu vẫn nên để trong file `.ts`.

Ví dụ: pháo giấy bắn ra khi thắng.

```html
<canvas class="confetti" picking-mode="ignore"></canvas>
<script>
    const canvas = root.querySelector('.confetti');
    const ctx = canvas.getContext('2d');
    const parts = [];

    // TS gọi được: doc.exports.confetti(150)
    exports.confetti = (count = 100) => {
        for (let i = 0; i < count; i++) {
            parts.push({
                x: canvas.clientWidth / 2, y: canvas.clientHeight / 3,
                vx: (Math.random() - 0.5) * 800, vy: -Math.random() * 900,
                size: 8 + Math.random() * 8, rot: Math.random() * 6, life: 2 + Math.random(),
                color: `hsl(${Math.random() * 360}, 90%, 60%)`,
            });
        }
    };

    // Cho canvas nét theo đúng số pixel trên màn hình, nhưng vẫn vẽ theo px của CSS
    function fit() {
        const rect = canvas.getBoundingClientRect();
        const w = Math.round(rect.width * devicePixelRatio);
        const h = Math.round(rect.height * devicePixelRatio);
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        ctx.setTransform(w / canvas.clientWidth, 0, 0, h / canvas.clientHeight, 0, 0);
    }

    // Chạy mỗi frame, dt tính bằng giây
    loop(dt => {
        if (!parts.length) return;
        fit();
        ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            p.life -= dt;
            if (p.life <= 0) { parts.splice(i, 1); continue; }
            p.vy += 1500 * dt;          // trọng lực
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rot += 6 * dt;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rot);
            ctx.globalAlpha = Math.min(p.life, 1);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
            ctx.restore();
        }
    });
</script>
```

```css
.confetti { position: absolute; inset: 0; width: 100%; height: 100%; }
```

```ts
finish() {
    this.state.finished = true;
    this.getComponent(UIDocument)!.exports.confetti(150);
}
```

Trong `<script>` có sẵn các biến sau:

| Biến | Ý nghĩa |
|---|---|
| `root` | Phần tử gốc của UI. Nếu script nằm trong template của một màn [UINavigation](NAVIGATION.md) thì là phần tử gốc của màn đó |
| `el` | Phần tử cha trực tiếp của thẻ `<script>` |
| `doc` | Component `UIDocument` |
| `screen` | Màn (`UIScreen`) chứa script; `null` nếu script không nằm trong màn nào |
| `exports` | Gán hàm hoặc giá trị vào đây để code TS gọi qua `doc.exports` (hoặc `screen.exports`) |
| `loop(fn)` | Gọi `fn(dt)` mỗi frame. Tự dừng khi UI bị dọn, tạm dừng khi `UIDocument` bị tắt. Trả về hàm `stop()` |
| `onDispose(fn)` | Gọi `fn` khi UI bị dọn (`reload()`, node bị hủy, màn bị đóng). Dùng để gỡ listener của `window`, `clearInterval`... |

Cần biết:

- Script chạy **một lần**, khi UI vừa dựng xong và đã dàn layout (nên đo được kích thước phần tử). Sau mỗi lần `doc.reload()` / `doc.setSource()`, script chạy lại.
- Mỗi thẻ `<script>` có phạm vi riêng: `const`, `let`, `function` khai báo trong thẻ này thì thẻ khác không thấy. Muốn dùng chung thì gán vào `exports`.
- Dùng `loop` thay cho `requestAnimationFrame`, và `onDispose` cho `setInterval` / `window.addEventListener`, để hiệu ứng không chạy tiếp sau khi UI bị dọn.
- Script lỗi sẽ in lỗi ra console kèm tên dạng `ui/<tên node>/script-0.js`, phần còn lại của UI vẫn chạy bình thường. Mở DevTools → **Sources** và tìm theo tên đó để đặt breakpoint.
- Chạy xong, thẻ `<script>` được gỡ khỏi DOM nên không làm sai các selector kiểu `:last-child`.
- Lấy URL ảnh trong script bằng `doc.assetUrl('coin')`. Đừng đặt tên hàm của bạn là `asset(...)`: mọi chỗ `asset(...)` trong file HTML, kể cả trong script, đều bị thay bằng URL ảnh.
- **Không** hỗ trợ `<script src="...">` và `<script type="module">`. Thẻ `<script type="application/json">` không chạy và được giữ nguyên trong DOM, dùng để chứa dữ liệu.
- Script nằm trong `<template>` chỉ chạy khi template đó được mở làm màn của UINavigation (xem [NAVIGATION.md](NAVIGATION.md#hiệu-ứng-viết-bằng-script-trong-màn)). Clone bằng `doc.instantiate()` thì script **không** chạy.

---

## Phần 3: Xử lý lỗi thường gặp

| Triệu chứng | Nguyên nhân thường gặp | Cách sửa |
|---|---|---|
| Không thấy UI | Đang xem Scene view hoặc chạy Simulator | Preview bằng **Browser** |
| Không thấy UI | Chưa gán **Html Asset**, hoặc component/node đang tắt | Kiểm tra Inspector |
| Không thấy UI | Phần tử bị co về 0 do layout | Thêm `flex: 1` cho container ngoài cùng, rồi kiểm tra bằng DevTools |
| **Game không nhận chạm** | Container phủ màn hình đang chặn | Thêm `picking-mode="ignore"` cho container đó (và các container lồng bên trong) |
| Nút không bấm được | Nút nằm dưới một lớp trong suốt phủ lên trên | Thêm `picking-mode="ignore"` cho lớp phủ, hoặc chỉnh `z-index` |
| Nút không bấm được | Nút nằm trong phần tử đang bị `data-show` ẩn | Kiểm tra giá trị state |
| `onAction` không chạy | Tên trong `data-action` không khớp với tên trong code | So lại chính tả |
| Ảnh không hiện, console báo `asset("x") is not registered` | Chưa thêm key vào list **Assets** | Thêm key và SpriteFrame |
| Ảnh không hiện, không có warning | SpriteFrame dùng texture nén | Đổi sang PNG/JPG |
| UI quá to hoặc quá nhỏ | Viết CSS theo kích thước khác với Design Resolution | Dùng số đo theo Design Resolution, hoặc tắt **Use Design Resolution** rồi đặt **Reference Resolution** |
| Text không cập nhật khi đổi state | Đổi trên object gốc, không phải object `bind()` trả về | Luôn dùng giá trị trả về: `this.state = doc.bind(this.state)` |
| Text không cập nhật khi đổi state | Dữ liệu là `Map`, `Set` hay instance của class | Binding chỉ theo dõi object thường và mảng |
| Không gõ được vào `<input>` | `user-select` bị tắt mặc định | Thêm `user-select: text` cho input |
| `doc.on('.x', 'focus', ...)` không chạy | `focus`, `mouseenter` không nổi bọt | Dùng `focusin`, `pointerover` |
| `<script>` trong HTML không chạy | Dùng `src="..."` hoặc `type="module"` (không hỗ trợ) | Viết code thẳng trong thẻ `<script>` |
| `<script>` trong HTML không chạy | Script nằm trong template clone bằng `doc.instantiate()` | Xử lý phần tử clone trong file `.ts` |
| `doc.exports.x` là `undefined` | Script bị lỗi (xem console), hoặc gọi khi UI chưa dựng | Sửa lỗi script; gọi từ `start()` trở đi |
| Hiệu ứng vẫn chạy sau khi đóng màn hoặc `reload()` | Dùng `requestAnimationFrame` / `setInterval` trực tiếp | Dùng `loop(fn)` và `onDispose(fn)` |
| Style của trang ngoài không áp vào UI | UI nằm trong Shadow DOM riêng | Viết style trong file CSS của UIDocument |

---

## Tra cứu nhanh

### Thuộc tính HTML

| Thuộc tính | Ví dụ | Tác dụng |
|---|---|---|
| `picking-mode="ignore"` | `<div picking-mode="ignore">` | Cho chạm xuyên xuống game |
| `data-action` | `<button data-action="play">` | Gọi `doc.onAction('play', ...)` khi click |
| `data-bind` | `<span data-bind="player.name">` | Hiển thị giá trị; với input thì binding hai chiều |
| `data-show` | `<div data-show="!paused">` | Ẩn/hiện theo giá trị (`!` là phủ định) |
| `data-class` | `data-class="active: selected; locked: !open"` | Bật/tắt class |
| `asset(key)` | `src="asset(logo)"`, `background-image: asset(bg)` | URL ảnh trong list Assets |
| `<script>` | `<script>loop(dt => ...)</script>` | JS chạy khi UI dựng xong (biến có sẵn: `root`, `el`, `doc`, `screen`, `exports`, `loop`, `onDispose`) |

### Inspector của UIDocument

| Property | Dùng để |
|---|---|
| Html Asset | File `.html` |
| Templates | Các file `.html` phụ, nối sau Html Asset (thường chứa `<template>`) |
| Style Sheets | Các file `.css` (áp dụng theo thứ tự) |
| Assets | Danh sách `key` → `SpriteFrame` |
| Sorting Order | Lớp nào nằm trên |
| Scale Mode | `ScaleWithScreenSize` (mặc định) hoặc `ConstantPixelSize` |
| Use Design Resolution / Reference Resolution | Kích thước bạn dùng khi viết CSS |
| Match | `0` = khớp chiều rộng, `1` = khớp chiều cao |

### API trong code

```ts
const doc = this.getComponent(UIDocument)!;

// Tìm phần tử
doc.rootVisualElement;               // phần tử gốc
doc.q('.btn');                       // phần tử đầu tiên khớp selector
doc.qAll('.item');                   // mảng các phần tử khớp
doc.Q('play', 'btn-primary');        // kiểu Unity: id/name + class

// Sự kiện (đều trả về hàm để gỡ listener)
doc.onAction('play', (el, ev) => {});
doc.onClick('.btn', (ev, el) => {});
doc.on('.slot', 'pointerdown', (ev, el) => {});

// Dữ liệu
const state = doc.bind({ coins: 0 }); // gán state.coins = ... thì UI tự cập nhật
const store = reactive({ coins: 0 }); // store dùng chung cho nhiều binding / nhiều màn
doc.refreshBindings();               // áp dụng binding ngay (sau khi tự thêm phần tử)
doc.addStyle(css, 'my-lib');         // thêm CSS nền (CSS của document vẫn ghi đè được)

// Template, ảnh, nội dung
doc.instantiate('item-template');    // clone phần tử trong <template id="...">
doc.assetUrl('logo');                // URL ảnh theo key
doc.reload();                        // dựng lại UI từ file
doc.setSource(html, [css]);          // dùng chuỗi HTML/CSS thay cho file
doc.exports.confetti(100);           // gọi hàm mà <script> trong HTML gán vào exports

// Bật / tắt cả màn hình
doc.enabled = false;
```

### Tương đương với Unity UI Toolkit

| Unity | UIElement |
|---|---|
| UXML / USS | `.html` / `.css` |
| `rootVisualElement.Q<Button>("play")` | `doc.Q('play')` hoặc `doc.q('#play')` |
| `button.clicked += ...` | `doc.onAction('play', ...)` / `doc.onClick('#play', ...)` |
| `RegisterCallback<PointerDownEvent>` | `doc.on(selector, 'pointerdown', ...)` |
| `pickingMode = PickingMode.Ignore` | `picking-mode="ignore"` |
| `style.display = DisplayStyle.None` | `data-show` hoặc `el.classList.add('ui-hidden')` |
| `dataSource` + binding | `doc.bind(data)` + `data-bind` |
| `VisualTreeAsset.Instantiate()` | `<template>` + `doc.instantiate(id)` |
| `PanelSettings` | Property Scale Mode, Match, Sorting Order trên UIDocument |
